-- dev4
-- catms-032
-- consultation header ; revision logic

begin;

create table catms.consultation_note (
    consultation_note_id bigint generated always as identity,
    appointment_id bigint not null,
    current_revision_no integer not null default 1,
    recorded_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint pk_consultation_note 
        primary key (consultation_note_id),

    constraint fk_consultation_note_appointment
        foreign key (appointment_id)
        references catms.appointment (appointment_id)
        on delete restrict,
    
    constraint uq_consultation_note_appointment_id
        unique (appointment_id),
    
    constraint chk_consultation_note_current_revision_positive
        check (current_revision_no > 0)

);

comment on table catms.consultation_note is 
    'one consultation header per appointment; clinical content is stored in revisions.';

comment on column catms.consultation_note.consultation_note_id is
    'automatic generated consultation identifier.';

comment on column catms.consultation_note.appointment_id is
    'appointment associated with the consultation';

comment on column catms.consultation_note.current_revision_no is
    'number of the current clinical-note revision.';

comment on column catms.consultation_note.recorded_at is
    'time the consultation note was created.';

comment on column catms.consultation_note.updated_at is
    'time the consultation note was last updated.';

-- prevent another connection from assing records during this change.
lock table catms.consultation_note_revision
    in access exclusive mode;

DO $$
begin
    if exists(
        select 1 from catms.consultation_note_revision
    ) then 
        RAISE EXCEPTION 
            'existing consultation note revision require a data migration plan.';
    end if;
end;
$$;


ALTER TABLE catms.consultation_note_revision
    RENAME COLUMN note_revision_id TO consultation_note_revision_id;

ALTER TABLE catms.consultation_note_revision
    RENAME COLUMN clinical_notes TO notes;

ALTER TABLE catms.consultation_note_revision
    RENAME COLUMN revision_number TO revision_no;

ALTER TABLE catms.consultation_note_revision
    RENAME COLUMN created_at TO recorded_at;


alter table catms.consultation_note_revision
    drop constraint fk_consultation_note_doctor,
    drop column doctor_id,

    add column consultation_note_id bigint not null,
    add column diagnosis_summary varchar(300),
    add column vitals jsonb,
    add column amendment_reason varchar(250),
    add column recorded_by_user_id bigint not null;

alter table catms.consultation_note_revision
    add constraint fk_consultation_note_revision_consultation_note
        foreign key (consultation_note_id)
        references catms.consultation_note (consultation_note_id)
        on delete restrict,
    
    add constraint fk_consultation_note_revision_user_account
        foreign key (recorded_by_user_id)
        references catms.user_account (user_account_id)
        on delete restrict,
    
    add constraint uq_consultation_note_revision_number
        unique (consultation_note_id, revision_no),
    
    add constraint chk_consultation_note_revision_positive
        check (revision_no > 0);

-- imutable existing revisions to prevent changes to them. New revisions should be created instead.
CREATE FUNCTION catms.reject_consultation_revision_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'CLINICAL_REVISION_IMMUTABLE: Existing revisions cannot be changed. Record a new revision instead.';
END;
$$;

-- triggers to immutably existing revisions to prevent changes to them. New revisions should be created instead.
CREATE TRIGGER trg_consultation_revision_immutable
BEFORE UPDATE OR DELETE
ON catms.consultation_note_revision
FOR EACH ROW
EXECUTE FUNCTION catms.reject_consultation_revision_changes();

-- trigger to avoid truncating the table to prevent loss of existing revisions. New revisions should be created instead.
CREATE TRIGGER trg_consultation_revision_no_truncate
BEFORE TRUNCATE
ON catms.consultation_note_revision
FOR EACH STATEMENT
EXECUTE FUNCTION catms.reject_consultation_revision_changes();

CREATE FUNCTION catms.guard_consultation_note()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status catms.appointment_status;
BEGIN
    -- An existing consultation cannot be moved to another appointment.
    IF TG_OP = 'UPDATE' THEN
        IF NEW.appointment_id IS DISTINCT FROM OLD.appointment_id THEN
            RAISE EXCEPTION
                'CONSULTATION_APPOINTMENT_IMMUTABLE: Cannot change the appointment.';
        END IF;
    END IF;

    -- Read and lock the associated appointment.
    SELECT status
    INTO v_status
    FROM catms.appointment
    WHERE appointment_id = NEW.appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'APPOINTMENT_NOT_FOUND: The appointment does not exist.';
    END IF;

    IF v_status <> 'Completed' THEN
        RAISE EXCEPTION
            'CONSULTATION_REQUIRES_COMPLETED: Appointment must be Completed.';
    END IF;

    NEW.updated_at := now();

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_consultation_note
BEFORE INSERT OR UPDATE
ON catms.consultation_note
FOR EACH ROW
EXECUTE FUNCTION catms.guard_consultation_note();


-- Create a consultation header and its first revision together.
CREATE FUNCTION catms.record_consultation_note(
    p_appointment_id BIGINT,
    p_recorded_by_user_id BIGINT,
    p_notes TEXT,
    p_diagnosis_summary VARCHAR(300) DEFAULT NULL,
    p_vitals JSONB DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_consultation_note_id BIGINT;
BEGIN
    -- Create the header.
    -- Its trigger checks that the appointment is Completed.
    INSERT INTO catms.consultation_note (
        appointment_id,
        current_revision_no
    )
    VALUES (
        p_appointment_id,
        1
    )
    RETURNING consultation_note_id
    INTO v_consultation_note_id;

    -- Store the initial clinical content as revision 1.
    INSERT INTO catms.consultation_note_revision (
        consultation_note_id,
        revision_no,
        diagnosis_summary,
        notes,
        vitals,
        amendment_reason,
        recorded_by_user_id
    )
    VALUES (
        v_consultation_note_id,
        1,
        p_diagnosis_summary,
        p_notes,
        p_vitals,
        NULL,
        p_recorded_by_user_id
    );

    RETURN v_consultation_note_id;
END;
$$;

COMMENT ON FUNCTION catms.record_consultation_note(
    BIGINT, BIGINT, TEXT, VARCHAR, JSONB
) IS
    'Creates a consultation header and initial revision for a Completed appointment.';

-- Access will be granted explicitly when we finish the permissions.
REVOKE ALL ON FUNCTION catms.record_consultation_note(
    BIGINT, BIGINT, TEXT, VARCHAR, JSONB
) FROM PUBLIC;


-- Append a new revision without changing previous clinical content.
CREATE FUNCTION catms.amend_consultation_note(
    p_appointment_id BIGINT,
    p_recorded_by_user_id BIGINT,
    p_notes TEXT,
    p_amendment_reason TEXT,
    p_diagnosis_summary VARCHAR(300) DEFAULT NULL,
    p_vitals JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status catms.appointment_status;
    v_consultation_note_id BIGINT;
    v_current_revision_no INTEGER;
    v_next_revision_no INTEGER;
BEGIN
    -- Every amendment needs an explanation.
    IF p_amendment_reason IS NULL
       OR length(trim(p_amendment_reason)) = 0 THEN
        RAISE EXCEPTION
            'AMENDMENT_REASON_REQUIRED: Explain why the note is being amended.';
    END IF;

    IF length(p_amendment_reason) > 250 THEN
        RAISE EXCEPTION
            'AMENDMENT_REASON_TOO_LONG: Maximum length is 250 characters.';
    END IF;

    -- Lock the appointment first, before locking the note header.
    SELECT status
    INTO v_status
    FROM catms.appointment
    WHERE appointment_id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'APPOINTMENT_NOT_FOUND: The appointment does not exist.';
    END IF;

    IF v_status <> 'Completed' THEN
        RAISE EXCEPTION
            'CONSULTATION_REQUIRES_COMPLETED: Appointment must be Completed.';
    END IF;

    -- Lock the header before choosing the next revision number.
    SELECT consultation_note_id, current_revision_no
    INTO v_consultation_note_id, v_current_revision_no
    FROM catms.consultation_note
    WHERE appointment_id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'CONSULTATION_NOT_FOUND: Record the initial note first.';
    END IF;

    v_next_revision_no := v_current_revision_no + 1;

    INSERT INTO catms.consultation_note_revision (
        consultation_note_id,
        revision_no,
        diagnosis_summary,
        notes,
        vitals,
        amendment_reason,
        recorded_by_user_id
    )
    VALUES (
        v_consultation_note_id,
        v_next_revision_no,
        p_diagnosis_summary,
        p_notes,
        p_vitals,
        p_amendment_reason,
        p_recorded_by_user_id
    );

    -- Point the header to the new revision.
    UPDATE catms.consultation_note
    SET current_revision_no = v_next_revision_no
    WHERE consultation_note_id = v_consultation_note_id;

    RETURN v_next_revision_no;
END;
$$;

COMMENT ON FUNCTION catms.amend_consultation_note(
    BIGINT, BIGINT, TEXT, TEXT, VARCHAR, JSONB
) IS
    'Appends a clinical-note revision with an actor and reason, preserving earlier revisions.';

REVOKE ALL ON FUNCTION catms.amend_consultation_note(
    BIGINT, BIGINT, TEXT, TEXT, VARCHAR, JSONB
) FROM PUBLIC;


-- Every revision after the first must explain the amendment.
ALTER TABLE catms.consultation_note_revision
ADD CONSTRAINT chk_consultation_revision_amendment_reason
CHECK (
    revision_no = 1
    OR (
        amendment_reason IS NOT NULL
        AND length(trim(amendment_reason)) > 0
    )
);

COMMENT ON CONSTRAINT chk_consultation_revision_amendment_reason
ON catms.consultation_note_revision IS
    'Revisions after the initial entry require a nonempty amendment reason.';

CREATE FUNCTION catms.guard_consultation_revision_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status catms.appointment_status;
    v_expected_revision_no INTEGER;
BEGIN
    -- Find the appointment through the consultation header.
    -- Lock the appointment first, matching our amendment function.
    SELECT a.status
    INTO v_status
    FROM catms.appointment AS a
    JOIN catms.consultation_note AS n
        ON n.appointment_id = a.appointment_id
    WHERE n.consultation_note_id = NEW.consultation_note_id
    FOR UPDATE OF a;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'CONSULTATION_NOT_FOUND: A consultation header is required.';
    END IF;

    IF v_status <> 'Completed' THEN
        RAISE EXCEPTION
            'CONSULTATION_REQUIRES_COMPLETED: Appointment must be Completed.';
    END IF;

    -- Lock the header before checking existing revision numbers.
    PERFORM 1
    FROM catms.consultation_note
    WHERE consultation_note_id = NEW.consultation_note_id
    FOR UPDATE;

    -- No revisions yet: expected number is 1.
    -- Otherwise: expected number is the highest existing number + 1.
    SELECT COALESCE(MAX(revision_no), 0) + 1
    INTO v_expected_revision_no
    FROM catms.consultation_note_revision
    WHERE consultation_note_id = NEW.consultation_note_id;

    IF NEW.revision_no IS DISTINCT FROM v_expected_revision_no THEN
        RAISE EXCEPTION
            'INVALID_REVISION_NUMBER: Expected %, received %.',
            v_expected_revision_no,
            NEW.revision_no;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_consultation_revision_insert
BEFORE INSERT
ON catms.consultation_note_revision
FOR EACH ROW
EXECUTE FUNCTION catms.guard_consultation_revision_insert();

COMMENT ON FUNCTION catms.guard_consultation_revision_insert() IS
    'Checks Completed appointment status and sequential numbering before inserting a clinical revision.';


-- Check the final relationship between the header and its revisions.
CREATE FUNCTION catms.check_consultation_revision_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_revision_no INTEGER;
    v_latest_revision_no INTEGER;
BEGIN
    -- Read the current stored header, not its earlier event-time value.
    SELECT current_revision_no
    INTO v_current_revision_no
    FROM catms.consultation_note
    WHERE consultation_note_id = NEW.consultation_note_id;

    -- A header created and then removed in this transaction
    -- does not need a revision.
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT MAX(revision_no)
    INTO v_latest_revision_no
    FROM catms.consultation_note_revision
    WHERE consultation_note_id = NEW.consultation_note_id;

    IF v_latest_revision_no IS NULL THEN
        RAISE EXCEPTION
            'CONSULTATION_REVISION_REQUIRED: The header needs a revision.';
    END IF;

    IF v_current_revision_no IS DISTINCT FROM v_latest_revision_no THEN
        RAISE EXCEPTION
            'CONSULTATION_REVISION_MISMATCH: Header points to %, latest revision is %.',
            v_current_revision_no,
            v_latest_revision_no;
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_consultation_header_consistency
AFTER INSERT OR UPDATE
ON catms.consultation_note
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION catms.check_consultation_revision_consistency();

CREATE CONSTRAINT TRIGGER trg_consultation_revision_consistency
AFTER INSERT
ON catms.consultation_note_revision
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION catms.check_consultation_revision_consistency();

COMMENT ON FUNCTION catms.check_consultation_revision_consistency() IS
    'Requires each saved consultation header to point to its latest revision.';


-- Remove existing table permissions, including the old scaffold grants.
REVOKE ALL ON TABLE
    catms.consultation_note,
    catms.consultation_note_revision
FROM PUBLIC,
    catms_app,
    catms_clinician,
    catms_admin,
    catms_reception,
    catms_manager,
    catms_qa,
    catms_readonly;

-- Allow the appropriate roles to read clinical notes.
GRANT SELECT ON TABLE
    catms.consultation_note,
    catms.consultation_note_revision
TO catms_app,
   catms_clinician,
   catms_admin,
   catms_qa,
   catms_readonly;

-- Let these two controlled functions use their owner's permissions.
ALTER FUNCTION catms.record_consultation_note(
    BIGINT, BIGINT, TEXT, VARCHAR, JSONB
)
SECURITY DEFINER;

ALTER FUNCTION catms.amend_consultation_note(
    BIGINT, BIGINT, TEXT, TEXT, VARCHAR, JSONB
)
SECURITY DEFINER;

-- Fix name resolution inside the functions.
-- Our application tables already use explicit catms.table names.
ALTER FUNCTION catms.record_consultation_note(
    BIGINT, BIGINT, TEXT, VARCHAR, JSONB
)
SET search_path = pg_catalog, pg_temp;

ALTER FUNCTION catms.amend_consultation_note(
    BIGINT, BIGINT, TEXT, TEXT, VARCHAR, JSONB
)
SET search_path = pg_catalog, pg_temp;

-- Remove general access to the recording functions.
REVOKE ALL ON FUNCTION catms.record_consultation_note(
    BIGINT, BIGINT, TEXT, VARCHAR, JSONB
)
FROM PUBLIC, catms_reception, catms_manager,
     catms_qa, catms_readonly;

REVOKE ALL ON FUNCTION catms.amend_consultation_note(
    BIGINT, BIGINT, TEXT, TEXT, VARCHAR, JSONB
)
FROM PUBLIC, catms_reception, catms_manager,
     catms_qa, catms_readonly;

-- Allow clinical writes through the controlled functions.
GRANT EXECUTE ON FUNCTION catms.record_consultation_note(
    BIGINT, BIGINT, TEXT, VARCHAR, JSONB
)
TO catms_app, catms_clinician, catms_admin;

GRANT EXECUTE ON FUNCTION catms.amend_consultation_note(
    BIGINT, BIGINT, TEXT, TEXT, VARCHAR, JSONB
)
TO catms_app, catms_clinician, catms_admin;


commit;