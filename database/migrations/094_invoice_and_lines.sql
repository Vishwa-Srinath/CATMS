-- Dev4 / CATMS-034: invoice issuance and immutable invoice lines.
-- Requires migrations through 093. Run through the migration runner.
-- Existing populated scaffold invoices/payments require a separate data plan.
BEGIN;

LOCK TABLE catms.invoice, catms.payment IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM catms.invoice)
       OR EXISTS (SELECT 1 FROM catms.payment) THEN
        RAISE EXCEPTION 'INVOICE_MIGRATION_DATA_PRESENT: Preserve and map existing invoices/payments before applying this migration.';
    END IF;
END;
$$;

-- Preserve the invoice table and its primary key: payment already references it.
ALTER TABLE catms.invoice RENAME COLUMN subtotal TO subtotal_amount;
ALTER TABLE catms.invoice RENAME COLUMN insurance_covered TO approved_insurance_amount;
ALTER TABLE catms.invoice RENAME COLUMN patient_payable TO patient_liability_amount;
ALTER TABLE catms.invoice RENAME COLUMN status TO invoice_state;
ALTER TABLE catms.invoice RENAME COLUMN created_at TO issued_at;

CREATE SEQUENCE catms.invoice_number_seq AS BIGINT;

ALTER TABLE catms.invoice
    DROP CONSTRAINT fk_invoice_branch,
    DROP CONSTRAINT chk_invoice_status,
    DROP COLUMN branch_id,
    ALTER COLUMN invoice_number TYPE VARCHAR(32) USING invoice_number::text,
    ALTER COLUMN invoice_number SET NOT NULL,
    ALTER COLUMN invoice_number SET DEFAULT
        ('INV-' || nextval('catms.invoice_number_seq'::regclass)::text),
    ALTER COLUMN invoice_state SET DEFAULT 'Issued',
    ADD COLUMN appointment_id BIGINT NOT NULL,
    ADD COLUMN currency_code CHAR(3) NOT NULL DEFAULT 'LKR',
    ADD COLUMN patient_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN insurer_paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN patient_payment_status VARCHAR(20) NOT NULL DEFAULT 'Unpaid',
    ADD COLUMN finalized_at TIMESTAMPTZ,
    ADD COLUMN version_no INTEGER NOT NULL DEFAULT 1,
    ADD CONSTRAINT fk_invoice_appointment FOREIGN KEY (appointment_id)
        REFERENCES catms.appointment(appointment_id) ON DELETE RESTRICT,
    ADD CONSTRAINT uq_invoice_appointment UNIQUE (appointment_id),
    ADD CONSTRAINT uq_invoice_number UNIQUE (invoice_number),
    ADD CONSTRAINT chk_invoice_number_nonempty CHECK (length(trim(invoice_number)) > 0),
    ADD CONSTRAINT chk_invoice_currency CHECK (currency_code = 'LKR'),
    ADD CONSTRAINT chk_invoice_state CHECK (invoice_state IN ('Draft', 'Issued', 'Voided')),
    ADD CONSTRAINT chk_invoice_patient_payment_status
        CHECK (patient_payment_status IN ('Unpaid', 'PartiallyPaid', 'Paid')),
    ADD CONSTRAINT chk_invoice_version CHECK (version_no > 0),
    ADD CONSTRAINT chk_invoice_amounts CHECK (
        subtotal_amount >= 0 AND subtotal_amount <> 'NaN'::NUMERIC
        AND approved_insurance_amount >= 0 AND approved_insurance_amount <> 'NaN'::NUMERIC
        AND patient_liability_amount >= 0 AND patient_liability_amount <> 'NaN'::NUMERIC
        AND patient_paid_amount >= 0 AND patient_paid_amount <> 'NaN'::NUMERIC
        AND insurer_paid_amount >= 0 AND insurer_paid_amount <> 'NaN'::NUMERIC
        AND approved_insurance_amount <= subtotal_amount
        AND patient_liability_amount = subtotal_amount - approved_insurance_amount
    );

ALTER SEQUENCE catms.invoice_number_seq OWNED BY catms.invoice.invoice_number;

CREATE TABLE catms.invoice_line (
    invoice_line_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    appointment_treatment_id BIGINT NOT NULL,
    line_number SMALLINT NOT NULL,
    service_code_snapshot VARCHAR(30) NOT NULL,
    description_snapshot VARCHAR(160) NOT NULL,
    quantity NUMERIC(8,2) NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL,
    line_total NUMERIC(12,2)
        GENERATED ALWAYS AS (round(quantity * unit_price, 2)) STORED,
    CONSTRAINT fk_invoice_line_invoice FOREIGN KEY (invoice_id)
        REFERENCES catms.invoice(invoice_id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoice_line_treatment FOREIGN KEY (appointment_treatment_id)
        REFERENCES catms.appointment_treatment(appointment_treatment_id) ON DELETE RESTRICT,
    CONSTRAINT uq_invoice_line_treatment UNIQUE (appointment_treatment_id),
    CONSTRAINT uq_invoice_line_number UNIQUE (invoice_id, line_number),
    CONSTRAINT chk_invoice_line_number CHECK (line_number > 0),
    CONSTRAINT chk_invoice_line_service CHECK (length(trim(service_code_snapshot)) > 0),
    CONSTRAINT chk_invoice_line_description CHECK (length(trim(description_snapshot)) > 0),
    CONSTRAINT chk_invoice_line_quantity CHECK (quantity > 0 AND quantity <> 'NaN'::NUMERIC),
    CONSTRAINT chk_invoice_line_price CHECK (unit_price >= 0 AND unit_price <> 'NaN'::NUMERIC)
);

-- Inserts derive maintained fields in the database.
-- Updates preserve issued identity/subtotal while reserving settlement fields
-- for later controlled claim/payment routines.
CREATE FUNCTION catms.guard_invoice_header()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_status catms.appointment_status;
    v_subtotal NUMERIC;
    v_count BIGINT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT status INTO v_status
        FROM catms.appointment
        WHERE appointment_id = NEW.appointment_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND: The appointment does not exist.';
        END IF;
        IF v_status <> 'Completed' THEN
            RAISE EXCEPTION 'INVOICE_REQUIRES_COMPLETED: Appointment must be Completed.';
        END IF;
        IF NEW.invoice_state <> 'Issued' THEN
            RAISE EXCEPTION 'INVOICE_STATE_UNSUPPORTED: Only immediate issuance is implemented.';
        END IF;

        SELECT count(*), sum(round(quantity * unit_price_at_time, 2))
        INTO v_count, v_subtotal
        FROM catms.appointment_treatment
        WHERE appointment_id = NEW.appointment_id;
        IF v_count = 0 THEN
            RAISE EXCEPTION 'INVOICE_REQUIRES_TREATMENT: Record at least one treatment first.';
        END IF;

        NEW.subtotal_amount := v_subtotal;
        NEW.approved_insurance_amount := 0;
        NEW.patient_liability_amount := v_subtotal;
        NEW.patient_paid_amount := 0;
        NEW.insurer_paid_amount := 0;
        NEW.patient_payment_status :=
            CASE WHEN v_subtotal = 0 THEN 'Paid' ELSE 'Unpaid' END;
        NEW.issued_at := now();
        NEW.finalized_at := NULL;
        NEW.version_no := 1;
    ELSE
        IF ROW(NEW.invoice_id, NEW.invoice_number, NEW.appointment_id,
               NEW.currency_code, NEW.subtotal_amount, NEW.issued_at, NEW.invoice_state)
           IS DISTINCT FROM
           ROW(OLD.invoice_id, OLD.invoice_number, OLD.appointment_id,
               OLD.currency_code, OLD.subtotal_amount, OLD.issued_at, OLD.invoice_state) THEN
            RAISE EXCEPTION 'INVOICE_IMMUTABLE: Issued identity, state and subtotal cannot be edited.';
        END IF;
        NEW.version_no := OLD.version_no + 1;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_invoice_header
BEFORE INSERT OR UPDATE ON catms.invoice
FOR EACH ROW EXECUTE FUNCTION catms.guard_invoice_header();

CREATE FUNCTION catms.reject_invoice_history_changes()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'INVOICE_HISTORY_IMMUTABLE: Issued invoice history cannot be removed or rewritten.';
END;
$$;

CREATE TRIGGER trg_invoice_no_delete
BEFORE DELETE ON catms.invoice
FOR EACH ROW EXECUTE FUNCTION catms.reject_invoice_history_changes();
CREATE TRIGGER trg_invoice_no_truncate
BEFORE TRUNCATE ON catms.invoice
FOR EACH STATEMENT EXECUTE FUNCTION catms.reject_invoice_history_changes();
CREATE TRIGGER trg_invoice_line_immutable
BEFORE UPDATE OR DELETE ON catms.invoice_line
FOR EACH ROW EXECUTE FUNCTION catms.reject_invoice_history_changes();
CREATE TRIGGER trg_invoice_line_no_truncate
BEFORE TRUNCATE ON catms.invoice_line
FOR EACH STATEMENT EXECUTE FUNCTION catms.reject_invoice_history_changes();

-- Fill every invoice line from the delivered-treatment row, never a new price.
CREATE FUNCTION catms.snapshot_invoice_line()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_invoice_appointment BIGINT;
    v_treatment_appointment BIGINT;
    v_service_code TEXT;
    v_description TEXT;
BEGIN
    SELECT appointment_id INTO v_invoice_appointment
    FROM catms.invoice WHERE invoice_id = NEW.invoice_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVOICE_NOT_FOUND: The invoice does not exist.';
    END IF;

    SELECT t.appointment_id, t.line_number, t.quantity, t.unit_price_at_time,
           c.service_code::text, c.name
    INTO v_treatment_appointment, NEW.line_number, NEW.quantity, NEW.unit_price,
         v_service_code, v_description
    FROM catms.appointment_treatment t
    JOIN catms.treatment_catalogue c ON c.treatment_id = t.treatment_id
    WHERE t.appointment_treatment_id = NEW.appointment_treatment_id
    FOR SHARE OF t, c;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DELIVERED_TREATMENT_NOT_FOUND: The treatment line does not exist.';
    END IF;
    IF v_treatment_appointment <> v_invoice_appointment THEN
        RAISE EXCEPTION 'INVOICE_TREATMENT_MISMATCH: Treatment belongs to a different appointment.';
    END IF;
    IF length(v_service_code) > 30 OR length(v_description) > 160 THEN
        RAISE EXCEPTION 'INVOICE_SNAPSHOT_TOO_LONG: Correct the catalogue label length before issuance; snapshots are not truncated.';
    END IF;
    NEW.service_code_snapshot := v_service_code;
    NEW.description_snapshot := v_description;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_invoice_line
BEFORE INSERT ON catms.invoice_line
FOR EACH ROW EXECUTE FUNCTION catms.snapshot_invoice_line();

-- Freeze the source treatment set after issuance, including new lines.
-- All normal writers acquire the appointment lock before other billing locks.
CREATE FUNCTION catms.guard_billed_treatment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_appointment BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
           OR NEW.appointment_treatment_id IS DISTINCT FROM OLD.appointment_treatment_id THEN
            RAISE EXCEPTION 'TREATMENT_IDENTITY_IMMUTABLE: A treatment cannot be moved or renumbered by identity.';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_appointment := NEW.appointment_id;
    ELSE
        v_appointment := OLD.appointment_id;
    END IF;

    PERFORM 1 FROM catms.appointment
    WHERE appointment_id = v_appointment FOR UPDATE;
    IF EXISTS (SELECT 1 FROM catms.invoice WHERE appointment_id = v_appointment) THEN
        RAISE EXCEPTION 'TREATMENT_ALREADY_INVOICED: Delivered treatments are frozen after invoicing.';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_billed_treatment
BEFORE INSERT OR UPDATE OR DELETE ON catms.appointment_treatment
FOR EACH ROW EXECUTE FUNCTION catms.guard_billed_treatment();

-- Deferred checks allow header-then-lines construction, but no incomplete commit.
CREATE FUNCTION catms.check_invoice_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_invoice_id BIGINT := NEW.invoice_id;
    v_appointment BIGINT;
    v_subtotal NUMERIC;
    v_line_total NUMERIC;
    v_line_count BIGINT;
    v_treatment_count BIGINT;
BEGIN
    SELECT appointment_id, subtotal_amount INTO v_appointment, v_subtotal
    FROM catms.invoice WHERE invoice_id = v_invoice_id;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT count(*), coalesce(sum(line_total), 0)
    INTO v_line_count, v_line_total
    FROM catms.invoice_line WHERE invoice_id = v_invoice_id;
    SELECT count(*) INTO v_treatment_count
    FROM catms.appointment_treatment WHERE appointment_id = v_appointment;

    IF v_line_count = 0 OR v_line_count <> v_treatment_count
       OR v_subtotal IS DISTINCT FROM v_line_total THEN
        RAISE EXCEPTION 'INVOICE_INCONSISTENT: Every treatment needs one invoice line and totals must match.';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_invoice_consistency
AFTER INSERT OR UPDATE ON catms.invoice
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION catms.check_invoice_consistency();
CREATE CONSTRAINT TRIGGER trg_invoice_line_consistency
AFTER INSERT ON catms.invoice_line
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION catms.check_invoice_consistency();

-- Entry point: inputs are identifiers, not financial totals.
CREATE FUNCTION catms.issue_invoice(
    p_appointment_id BIGINT,
    p_recorded_by_user_id BIGINT
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_status catms.appointment_status;
    v_invoice_id BIGINT;
BEGIN
    SELECT status INTO v_status FROM catms.appointment
    WHERE appointment_id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'APPOINTMENT_NOT_FOUND: The appointment does not exist.';
    END IF;
    IF v_status <> 'Completed' THEN
        RAISE EXCEPTION 'INVOICE_REQUIRES_COMPLETED: Appointment must be Completed.';
    END IF;
    IF EXISTS (SELECT 1 FROM catms.invoice WHERE appointment_id = p_appointment_id) THEN
        RAISE EXCEPTION 'INVOICE_ALREADY_EXISTS: This appointment has already been invoiced.';
    END IF;
    IF p_recorded_by_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM catms.user_account WHERE user_account_id = p_recorded_by_user_id
    ) THEN
        RAISE EXCEPTION 'INVOICE_ACTOR_REQUIRED: A valid recording user is required.';
    END IF;

    -- Protect all treatment rows and catalogue labels during snapshot capture.
    PERFORM t.appointment_treatment_id
    FROM catms.appointment_treatment t
    JOIN catms.treatment_catalogue c ON c.treatment_id = t.treatment_id
    WHERE t.appointment_id = p_appointment_id
    ORDER BY t.line_number FOR SHARE OF t, c;

    INSERT INTO catms.invoice (appointment_id)
    VALUES (p_appointment_id)
    RETURNING invoice_id INTO v_invoice_id;

    INSERT INTO catms.invoice_line (invoice_id, appointment_treatment_id)
    SELECT v_invoice_id, appointment_treatment_id
    FROM catms.appointment_treatment
    WHERE appointment_id = p_appointment_id
    ORDER BY line_number;

    INSERT INTO catms.audit_event (actor_user_id, entity_type, entity_id, action_code)
    VALUES (p_recorded_by_user_id, 'invoice', v_invoice_id::text, 'INVOICE_ISSUED');

    RETURN v_invoice_id;
END;
$$;

COMMENT ON TABLE catms.invoice IS
    'One issued invoice per Completed appointment; issued identity and subtotal are immutable. Settlement fields are reserved for controlled claim/payment routines.';
COMMENT ON TABLE catms.invoice_line IS
    'Immutable invoice snapshots of delivered treatments; catalogue service code and display name are captured at issuance.';
COMMENT ON COLUMN catms.invoice_line.description_snapshot IS
    'Catalogue display name at invoice issuance, not the nullable long catalogue description.';
COMMENT ON COLUMN catms.invoice_line.line_total IS
    'Database-generated round(quantity * unit_price, 2); invoice subtotal sums these rounded line totals.';
COMMENT ON FUNCTION catms.issue_invoice(BIGINT, BIGINT) IS
    'Issues header, line snapshots and audit entry atomically. Does not commit the caller transaction or accept client totals.';
COMMENT ON COLUMN catms.invoice.patient_payment_status IS
    'Unpaid, PartiallyPaid or Paid; distinct from document state. Zero-liability invoices start Paid.';
COMMENT ON COLUMN catms.invoice.finalized_at IS
    'Reserved for later settlement/finalization workflow; null at issuance.';

REVOKE ALL ON TABLE catms.invoice, catms.invoice_line
FROM PUBLIC, catms_app, catms_clinician, catms_admin,
     catms_reception, catms_manager, catms_qa, catms_readonly;
GRANT SELECT ON TABLE catms.invoice, catms.invoice_line
TO catms_app, catms_admin, catms_qa, catms_readonly;

REVOKE ALL ON FUNCTION catms.issue_invoice(BIGINT, BIGINT)
FROM PUBLIC, catms_reception, catms_manager, catms_qa, catms_readonly;
GRANT EXECUTE ON FUNCTION catms.issue_invoice(BIGINT, BIGINT)
TO catms_app, catms_clinician, catms_admin;
REVOKE ALL ON FUNCTION catms.guard_billed_treatment() FROM PUBLIC;
REVOKE ALL ON FUNCTION catms.check_invoice_consistency() FROM PUBLIC;

COMMIT;
