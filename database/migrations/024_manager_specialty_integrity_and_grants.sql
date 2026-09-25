-- 024_manager_specialty_integrity_and_grants.sql
-- Owner: Dev2  |  Issue: CATMS-024  |  Depends on: 003_migration_metadata.sql, 023_staff_procedures.sql
--
-- Implements:
--   - Base financial & clinical tables: catms.invoice, catms.payment, catms.consultation_note_revision
--   - Branch manager integrity rules: catms.assign_branch_manager procedure & defence-in-depth trigger
--   - Doctor specialty integrity rules: deferred constraint trigger requiring active doctors to have a specialty
--   - Database security roles: catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa
--   - Initial GRANT/REVOKE matrix enforcing strict separation of financial base tables
--   - Migration tracking

BEGIN;

-- =============================================================================
-- Base Financial & Clinical Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.invoice (
    invoice_id        BIGINT GENERATED ALWAYS AS IDENTITY,
    branch_id         BIGINT                   NOT NULL,
    invoice_number    CITEXT,
    subtotal          NUMERIC(12,2)            NOT NULL DEFAULT 0.00,
    patient_payable   NUMERIC(12,2)            NOT NULL DEFAULT 0.00,
    insurance_covered NUMERIC(12,2)            NOT NULL DEFAULT 0.00,
    status            VARCHAR(30)              NOT NULL DEFAULT 'Draft',
    created_at        TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_invoice PRIMARY KEY (invoice_id),
    CONSTRAINT fk_invoice_branch FOREIGN KEY (branch_id)
        REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,
    CONSTRAINT chk_invoice_status CHECK (status IN ('Draft', 'Issued', 'PartiallyPaid', 'Paid', 'Cancelled', 'Refunded'))
);

CREATE TABLE IF NOT EXISTS catms.payment (
    payment_id        BIGINT GENERATED ALWAYS AS IDENTITY,
    invoice_id        BIGINT                   NOT NULL,
    amount            NUMERIC(12,2)            NOT NULL,
    payment_method    VARCHAR(30)              NOT NULL DEFAULT 'Cash',
    payer_type        VARCHAR(30)              NOT NULL DEFAULT 'Patient',
    payment_date      TIMESTAMPTZ              NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_payment PRIMARY KEY (payment_id),
    CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id)
        REFERENCES catms.invoice(invoice_id) ON DELETE RESTRICT,
    CONSTRAINT chk_payment_amount CHECK (amount > 0),
    CONSTRAINT chk_payment_method CHECK (payment_method IN ('Cash', 'Card', 'BankTransfer', 'Online', 'Insurance')),
    CONSTRAINT chk_payment_payer CHECK (payer_type IN ('Patient', 'Insurer'))
);

CREATE TABLE IF NOT EXISTS catms.consultation_note_revision (
    note_revision_id  BIGINT GENERATED ALWAYS AS IDENTITY,
    doctor_id         BIGINT                   NOT NULL,
    clinical_notes    TEXT                     NOT NULL,
    revision_number   INTEGER                  NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_consultation_note_revision PRIMARY KEY (note_revision_id),
    CONSTRAINT fk_consultation_note_doctor FOREIGN KEY (doctor_id)
        REFERENCES catms.doctor_profile(doctor_id) ON DELETE RESTRICT,
    CONSTRAINT chk_consultation_notes_nonempty CHECK (length(trim(clinical_notes)) > 0)
);

-- =============================================================================
-- Branch Manager Integrity: Procedure catms.assign_branch_manager
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.assign_branch_manager(
    p_branch_id           BIGINT,
    p_employee_id         BIGINT,
    p_reason              VARCHAR(200) DEFAULT 'Branch manager appointment',
    p_effective_date      DATE DEFAULT CURRENT_DATE,
    p_assigned_by_user_id BIGINT DEFAULT NULL,
    INOUT p_assignment_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_branch_active BOOLEAN;
    v_branch_name VARCHAR(120);
    v_emp_active BOOLEAN;
    v_emp_pos VARCHAR(30);
    v_emp_name VARCHAR(150);
    v_is_assigned_to_branch BOOLEAN;
    v_current_mgr_emp_id BIGINT;
    v_effective_date DATE;
    v_user_acct_id BIGINT;
    v_mgr_role_id SMALLINT;
BEGIN
    v_effective_date := coalesce(p_effective_date, CURRENT_DATE);

    -- 1. Validate branch exists and is active
    SELECT is_active, name INTO v_branch_active, v_branch_name
    FROM catms.branch
    WHERE branch_id = p_branch_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch with ID % does not exist', p_branch_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_branch_active = FALSE THEN
        RAISE EXCEPTION 'Cannot assign manager to inactive branch % (%)', p_branch_id, v_branch_name
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Validate employee exists and is active
    SELECT is_active, position_code, full_name
    INTO v_emp_active, v_emp_pos, v_emp_name
    FROM catms.employee
    WHERE employee_id = p_employee_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Employee with ID % does not exist', p_employee_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_emp_active = FALSE THEN
        RAISE EXCEPTION 'Cannot assign inactive employee % (%) as branch manager', p_employee_id, v_emp_name
            USING ERRCODE = 'check_violation';
    END IF;

    -- 3. WRONG-POSITION: Validate employee position is Manager
    IF upper(trim(v_emp_pos)) <> 'MANAGER' THEN
        RAISE EXCEPTION 'Employee % (%) has position ''%''; branch manager assignment requires position ''Manager''',
            p_employee_id, v_emp_name, v_emp_pos
            USING ERRCODE = 'check_violation';
    END IF;

    -- 4. WRONG-BRANCH: Validate employee is actively assigned to this branch
    SELECT EXISTS (
        SELECT 1 FROM catms.employee_branch_assignment
        WHERE employee_id = p_employee_id
          AND branch_id = p_branch_id
          AND is_active = TRUE
          AND (valid_to IS NULL OR valid_to >= v_effective_date)
    ) INTO v_is_assigned_to_branch;

    IF NOT v_is_assigned_to_branch THEN
        RAISE EXCEPTION 'Employee % (%) is not actively assigned to branch % (%). Managers must belong to the branch.',
            p_employee_id, v_emp_name, p_branch_id, v_branch_name
            USING ERRCODE = 'check_violation';
    END IF;

    -- 5. Close existing active manager for this branch (if different employee)
    SELECT employee_id INTO v_current_mgr_emp_id
    FROM catms.branch_manager_assignment
    WHERE branch_id = p_branch_id
      AND is_active = TRUE;

    IF FOUND THEN
        IF v_current_mgr_emp_id = p_employee_id THEN
            RAISE EXCEPTION 'Employee % is already active manager for branch %', p_employee_id, p_branch_id
                USING ERRCODE = 'check_violation';
        END IF;

        UPDATE catms.branch_manager_assignment
        SET valid_to = v_effective_date,
            is_active = FALSE,
            reason = coalesce(reason || '; ', '') || 'Replaced by employee ' || p_employee_id,
            updated_at = now()
        WHERE branch_id = p_branch_id
          AND is_active = TRUE;
    END IF;

    -- 6. Insert new branch manager assignment
    INSERT INTO catms.branch_manager_assignment (
        branch_id,
        employee_id,
        valid_from,
        valid_to,
        is_active,
        reason,
        assigned_by_user_id
    ) VALUES (
        p_branch_id,
        p_employee_id,
        v_effective_date,
        NULL,
        TRUE,
        p_reason,
        p_assigned_by_user_id
    ) RETURNING branch_manager_assignment_id INTO p_assignment_id;

    -- 7. Sync user account role for Manager
    SELECT user_account_id INTO v_user_acct_id
    FROM catms.user_account
    WHERE employee_id = p_employee_id;

    IF FOUND THEN
        SELECT app_role_id INTO v_mgr_role_id
        FROM catms.app_role
        WHERE upper(role_code) = 'MANAGER';

        IF FOUND THEN
            INSERT INTO catms.user_account_role (
                user_account_id,
                app_role_id,
                branch_scope_id,
                valid_from,
                assigned_by_user_id
            ) VALUES (
                v_user_acct_id,
                v_mgr_role_id,
                p_branch_id,
                now(),
                p_assigned_by_user_id
            )
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    -- 8. Record audit event
    INSERT INTO catms.audit_event (
        actor_user_id,
        entity_type,
        entity_id,
        action_code,
        payload
    ) VALUES (
        p_assigned_by_user_id,
        'BRANCH_MANAGER_ASSIGNMENT',
        p_branch_id::text,
        'BRANCH_MANAGER_ASSIGNED',
        jsonb_build_object(
            'branch_id', p_branch_id,
            'employee_id', p_employee_id,
            'assignment_id', p_assignment_id,
            'reason', p_reason
        )
    );
END;
$$;

-- Defence-in-depth trigger for direct branch_manager_assignment inserts
CREATE OR REPLACE FUNCTION catms.validate_branch_manager_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_branch_active BOOLEAN;
    v_emp_active BOOLEAN;
    v_emp_pos VARCHAR(30);
    v_is_assigned BOOLEAN;
BEGIN
    IF NEW.is_active = TRUE THEN
        -- Check branch is active
        SELECT is_active INTO v_branch_active
        FROM catms.branch
        WHERE branch_id = NEW.branch_id;

        IF NOT FOUND OR v_branch_active = FALSE THEN
            RAISE EXCEPTION 'Cannot assign manager to non-existent or inactive branch %', NEW.branch_id
                USING ERRCODE = 'check_violation';
        END IF;

        -- Check employee is active and position is Manager
        SELECT is_active, position_code
        INTO v_emp_active, v_emp_pos
        FROM catms.employee
        WHERE employee_id = NEW.employee_id;

        IF NOT FOUND OR v_emp_active = FALSE THEN
            RAISE EXCEPTION 'Cannot assign inactive or non-existent employee % as branch manager', NEW.employee_id
                USING ERRCODE = 'check_violation';
        END IF;

        IF upper(trim(v_emp_pos)) <> 'MANAGER' THEN
            RAISE EXCEPTION 'Employee % has position ''%''; branch manager requires position Manager',
                NEW.employee_id, v_emp_pos
                USING ERRCODE = 'check_violation';
        END IF;

        -- Check employee is actively assigned to this branch
        SELECT EXISTS (
            SELECT 1 FROM catms.employee_branch_assignment
            WHERE employee_id = NEW.employee_id
              AND branch_id = NEW.branch_id
              AND is_active = TRUE
        ) INTO v_is_assigned;

        IF NOT v_is_assigned THEN
            RAISE EXCEPTION 'Employee % is not actively assigned to branch %. Manager must belong to branch.',
                NEW.employee_id, NEW.branch_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_branch_manager_integrity ON catms.branch_manager_assignment;
CREATE TRIGGER trg_validate_branch_manager_integrity
    BEFORE INSERT OR UPDATE ON catms.branch_manager_assignment
    FOR EACH ROW
    EXECUTE FUNCTION catms.validate_branch_manager_integrity();

-- =============================================================================
-- Doctor Specialty Integrity: Active Doctor Must Have at least one Specialty
-- =============================================================================

CREATE OR REPLACE FUNCTION catms.check_active_doctor_has_specialty()
RETURNS TRIGGER AS $$
DECLARE
    v_doc_id BIGINT;
    v_is_accepting BOOLEAN;
    v_is_emp_active BOOLEAN;
    v_specialty_count INTEGER;
BEGIN
    v_doc_id := coalesce(NEW.doctor_id, OLD.doctor_id);

    SELECT dp.is_accepting_appointments, e.is_active
    INTO v_is_accepting, v_is_emp_active
    FROM catms.doctor_profile dp
    JOIN catms.employee e ON e.employee_id = dp.doctor_id
    WHERE dp.doctor_id = v_doc_id;

    IF FOUND AND v_is_accepting = TRUE AND v_is_emp_active = TRUE THEN
        SELECT count(*) INTO v_specialty_count
        FROM catms.doctor_specialty
        WHERE doctor_id = v_doc_id
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE);

        IF v_specialty_count = 0 THEN
            RAISE EXCEPTION 'Active doctor % must have at least one active specialty', v_doc_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_active_doctor_specialty ON catms.doctor_profile;
CREATE CONSTRAINT TRIGGER trg_enforce_active_doctor_specialty
    AFTER INSERT OR UPDATE ON catms.doctor_profile
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION catms.check_active_doctor_has_specialty();

DROP TRIGGER IF EXISTS trg_enforce_doctor_specialty_count ON catms.doctor_specialty;
CREATE CONSTRAINT TRIGGER trg_enforce_doctor_specialty_count
    AFTER UPDATE OR DELETE ON catms.doctor_specialty
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION catms.check_active_doctor_has_specialty();

-- =============================================================================
-- Database Roles Creation & Membership
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catms_reception') THEN
        CREATE ROLE catms_reception NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catms_clinician') THEN
        CREATE ROLE catms_clinician NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catms_manager') THEN
        CREATE ROLE catms_manager NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catms_admin') THEN
        CREATE ROLE catms_admin NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catms_qa') THEN
        CREATE ROLE catms_qa NOINHERIT;
    END IF;
END;
$$;

-- Allow catms_app and current session to SET LOCAL ROLE to any of the 5 roles
GRANT catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa TO catms_app;
DO $$
BEGIN
    EXECUTE format('GRANT catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa TO %I', current_user);
EXCEPTION
    WHEN OTHERS THEN NULL;
END;
$$;

-- Grant schema usage to all 5 roles
GRANT USAGE ON SCHEMA catms TO catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa;

-- =============================================================================
-- Initial GRANT/REVOKE Matrix (CATMS-003 Section 7)
-- =============================================================================

-- 1. catms_reception
GRANT SELECT ON catms.branch TO catms_reception;
GRANT SELECT ON catms.employee TO catms_reception;
GRANT SELECT ON catms.employee_branch_assignment TO catms_reception;
GRANT SELECT ON catms.doctor_profile TO catms_reception;
GRANT SELECT ON catms.specialty TO catms_reception;
GRANT SELECT ON catms.doctor_specialty TO catms_reception;
GRANT SELECT ON catms.user_account_role TO catms_reception;

REVOKE ALL ON catms.invoice FROM catms_reception;
REVOKE ALL ON catms.payment FROM catms_reception;
REVOKE ALL ON catms.consultation_note_revision FROM catms_reception;
REVOKE ALL ON catms.user_account FROM catms_reception;
REVOKE ALL ON catms.audit_event FROM catms_reception;
REVOKE ALL ON catms.branch_manager_assignment FROM catms_reception;

-- 2. catms_clinician
GRANT SELECT ON catms.branch TO catms_clinician;
GRANT SELECT ON catms.employee TO catms_clinician;
GRANT SELECT ON catms.doctor_profile TO catms_clinician;
GRANT SELECT ON catms.specialty TO catms_clinician;
GRANT SELECT ON catms.doctor_specialty TO catms_clinician;
GRANT SELECT, INSERT ON catms.consultation_note_revision TO catms_clinician;

REVOKE ALL ON catms.invoice FROM catms_clinician;
REVOKE ALL ON catms.payment FROM catms_clinician;
REVOKE ALL ON catms.user_account FROM catms_clinician;
REVOKE ALL ON catms.audit_event FROM catms_clinician;
REVOKE ALL ON catms.branch_manager_assignment FROM catms_clinician;

-- 3. catms_manager
GRANT SELECT ON catms.branch TO catms_manager;
GRANT SELECT ON catms.employee TO catms_manager;
GRANT SELECT ON catms.employee_branch_assignment TO catms_manager;
GRANT SELECT ON catms.branch_manager_assignment TO catms_manager;
GRANT SELECT ON catms.doctor_profile TO catms_manager;
GRANT SELECT ON catms.specialty TO catms_manager;
GRANT SELECT ON catms.doctor_specialty TO catms_manager;

REVOKE ALL ON catms.invoice FROM catms_manager;
REVOKE ALL ON catms.payment FROM catms_manager;
REVOKE ALL ON catms.consultation_note_revision FROM catms_manager;
REVOKE ALL ON catms.user_account FROM catms_manager;
REVOKE ALL ON catms.audit_event FROM catms_manager;

-- 4. catms_admin (Full rights)
GRANT SELECT, INSERT, UPDATE ON catms.branch TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.employee TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.employee_branch_assignment TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.branch_manager_assignment TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.doctor_profile TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.specialty TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.doctor_specialty TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.user_account TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.app_role TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.user_account_role TO catms_admin;
GRANT SELECT, INSERT ON catms.audit_event TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.invoice TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.payment TO catms_admin;
GRANT SELECT, INSERT, UPDATE ON catms.consultation_note_revision TO catms_admin;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA catms TO catms_admin;

-- 5. catms_qa (Read-only)
GRANT SELECT ON catms.branch TO catms_qa;
GRANT SELECT ON catms.employee TO catms_qa;
GRANT SELECT ON catms.employee_branch_assignment TO catms_qa;
GRANT SELECT ON catms.branch_manager_assignment TO catms_qa;
GRANT SELECT ON catms.doctor_profile TO catms_qa;
GRANT SELECT ON catms.specialty TO catms_qa;
GRANT SELECT ON catms.doctor_specialty TO catms_qa;
GRANT SELECT ON catms.user_account TO catms_qa;
GRANT SELECT ON catms.app_role TO catms_qa;
GRANT SELECT ON catms.user_account_role TO catms_qa;
GRANT SELECT ON catms.audit_event TO catms_qa;
GRANT SELECT ON catms.invoice TO catms_qa;
GRANT SELECT ON catms.payment TO catms_qa;
GRANT SELECT ON catms.consultation_note_revision TO catms_qa;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catms FROM catms_qa;

-- Application roles grants on base tables
GRANT SELECT, INSERT, UPDATE ON catms.invoice TO catms_app;
GRANT SELECT, INSERT, UPDATE ON catms.payment TO catms_app;
GRANT SELECT, INSERT, UPDATE ON catms.consultation_note_revision TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.assign_branch_manager TO catms_app;

GRANT SELECT ON catms.invoice TO catms_readonly;
GRANT SELECT ON catms.payment TO catms_readonly;
GRANT SELECT ON catms.consultation_note_revision TO catms_readonly;

-- =============================================================================
-- COMMENT ON Statements
-- =============================================================================

COMMENT ON TABLE catms.invoice IS
  'Base billing invoice ledger. Protected by role grants: strictly inaccessible to Reception, Clinician and Manager.';

COMMENT ON TABLE catms.payment IS
  'Base payment ledger recording settlements and reversals. Inaccessible to Reception, Clinician and Manager.';

COMMENT ON TABLE catms.consultation_note_revision IS
  'Clinical consultation notes. Restricted to Clinician, Admin and QA.';

COMMENT ON PROCEDURE catms.assign_branch_manager IS
  'Assigns a branch manager with validation that employee has position Manager and is active at that branch.';

-- =============================================================================
-- Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (24, 'implement manager and specialty integrity rules and database roles', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
