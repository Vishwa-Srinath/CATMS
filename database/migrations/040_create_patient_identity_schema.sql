-- 040_create_patient_identity_schema.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity & Insurance)
-- Issue: CATMS-018 (GitHub #28)
-- Dependencies: 001_extensions.sql, 002_schemas_and_base_roles.sql, 003_migration_metadata.sql, 020_branch_and_employee.sql

BEGIN;

-- ============================================================================
-- 1. PATIENT MASTER TABLE
-- Master patient entity with clinic-wide visibility across all branches.
-- ============================================================================

CREATE TABLE IF NOT EXISTS catms.patient (
    patient_id              BIGINT GENERATED ALWAYS AS IDENTITY,
    patient_number          VARCHAR(32) NOT NULL,
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    date_of_birth           DATE NOT NULL,
    gender                  VARCHAR(20) NOT NULL,
    blood_group             VARCHAR(10),
    contact_number          VARCHAR(30) NOT NULL,
    email                   citext,
    address                 TEXT,
    registered_branch_id    BIGINT,
    registered_by           BIGINT,
    registered_at           TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_patient PRIMARY KEY (patient_id),
    CONSTRAINT uq_patient_patient_number UNIQUE (patient_number),
    CONSTRAINT chk_patient_gender CHECK (gender IN ('Male', 'Female', 'Other')),
    CONSTRAINT chk_patient_blood_group CHECK (blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    CONSTRAINT chk_patient_dob CHECK (date_of_birth <= CURRENT_DATE),
    CONSTRAINT fk_patient_registered_branch FOREIGN KEY (registered_branch_id)
        REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,
    CONSTRAINT fk_patient_registered_by FOREIGN KEY (registered_by)
        REFERENCES catms.employee(employee_id) ON DELETE RESTRICT
);

COMMENT ON TABLE  catms.patient                      IS 'Master patient record accessible clinic-wide across all branches.';
COMMENT ON COLUMN catms.patient.patient_id           IS 'Surrogate primary key for patient.';
COMMENT ON COLUMN catms.patient.patient_number       IS 'Human-readable unique identifier (e.g. PAT-00421).';
COMMENT ON COLUMN catms.patient.first_name           IS 'Patient legal first name.';
COMMENT ON COLUMN catms.patient.last_name            IS 'Patient legal last / family name.';
COMMENT ON COLUMN catms.patient.date_of_birth        IS 'Patient date of birth.';
COMMENT ON COLUMN catms.patient.gender               IS 'Patient gender (Male, Female, Other).';
COMMENT ON COLUMN catms.patient.blood_group          IS 'Patient blood group (e.g. O+, A-).';
COMMENT ON COLUMN catms.patient.contact_number       IS 'Primary phone number for notifications and contact.';
COMMENT ON COLUMN catms.patient.email                IS 'Case-insensitive email address.';
COMMENT ON COLUMN catms.patient.address              IS 'Physical residential address.';
COMMENT ON COLUMN catms.patient.registered_branch_id IS 'Branch where the patient first registered.';
COMMENT ON COLUMN catms.patient.registered_by        IS 'Employee staff account that performed initial registration.';
COMMENT ON COLUMN catms.patient.registered_at        IS 'Audit timestamp when the patient was registered.';
COMMENT ON COLUMN catms.patient.is_active            IS 'Soft-deletion status flag (TRUE = active, FALSE = archived/inactive).';
COMMENT ON COLUMN catms.patient.created_at           IS 'System creation timestamp in UTC.';
COMMENT ON COLUMN catms.patient.updated_at           IS 'System last update timestamp in UTC.';

-- ============================================================================
-- 2. PATIENT IDENTITY TABLE
-- National identity cards (NIC) and passports. Enforces clinic-wide uniqueness.
-- ============================================================================

CREATE TABLE IF NOT EXISTS catms.patient_identity (
    identity_id             BIGINT GENERATED ALWAYS AS IDENTITY,
    patient_id              BIGINT NOT NULL,
    identity_type           VARCHAR(20) NOT NULL,
    identity_number         citext NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_patient_identity PRIMARY KEY (identity_id),
    CONSTRAINT fk_patient_identity_patient FOREIGN KEY (patient_id) 
        REFERENCES catms.patient(patient_id) ON DELETE CASCADE,
    CONSTRAINT chk_patient_identity_type CHECK (identity_type IN ('NIC', 'Passport')),
    CONSTRAINT uq_patient_identity_clinic_wide UNIQUE (identity_type, identity_number)
);

-- Partial unique index ensuring each patient has at most one primary identity
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_primary_identity 
    ON catms.patient_identity (patient_id) 
    WHERE is_primary = TRUE;

COMMENT ON TABLE  catms.patient_identity                 IS 'Patient official identification documents with clinic-wide uniqueness.';
COMMENT ON COLUMN catms.patient_identity.identity_id     IS 'Surrogate primary key for identification record.';
COMMENT ON COLUMN catms.patient_identity.patient_id      IS 'Foreign key referencing patient master.';
COMMENT ON COLUMN catms.patient_identity.identity_type   IS 'Identification document type: NIC or Passport.';
COMMENT ON COLUMN catms.patient_identity.identity_number IS 'Normalized case-insensitive identity document number.';
COMMENT ON COLUMN catms.patient_identity.is_primary      IS 'Indicates whether this is the primary identity on file for the patient.';
COMMENT ON COLUMN catms.patient_identity.created_at      IS 'Record creation timestamp in UTC.';

-- ============================================================================
-- 3. EMERGENCY CONTACT TABLE
-- Emergency contact information for patients.
-- ============================================================================

CREATE TABLE IF NOT EXISTS catms.emergency_contact (
    contact_id              BIGINT GENERATED ALWAYS AS IDENTITY,
    patient_id              BIGINT NOT NULL,
    contact_name            VARCHAR(150) NOT NULL,
    relationship            VARCHAR(50) NOT NULL,
    phone_number            VARCHAR(30) NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_emergency_contact PRIMARY KEY (contact_id),
    CONSTRAINT fk_emergency_contact_patient FOREIGN KEY (patient_id) 
        REFERENCES catms.patient(patient_id) ON DELETE CASCADE,
    CONSTRAINT chk_emergency_contact_name_nonempty CHECK (length(trim(contact_name)) > 0),
    CONSTRAINT chk_emergency_contact_phone_nonempty CHECK (length(trim(phone_number)) > 0)
);

-- Partial unique index ensuring at most one primary emergency contact per patient
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_primary_contact 
    ON catms.emergency_contact (patient_id) 
    WHERE is_primary = TRUE;

COMMENT ON TABLE  catms.emergency_contact                 IS 'Emergency contact details associated with a patient.';
COMMENT ON COLUMN catms.emergency_contact.contact_id      IS 'Surrogate primary key for emergency contact.';
COMMENT ON COLUMN catms.emergency_contact.patient_id      IS 'Foreign key referencing patient master.';
COMMENT ON COLUMN catms.emergency_contact.contact_name    IS 'Full name of the emergency contact person.';
COMMENT ON COLUMN catms.emergency_contact.relationship    IS 'Relationship to patient (e.g. Spouse, Parent, Sibling).';
COMMENT ON COLUMN catms.emergency_contact.phone_number    IS 'Contact telephone / mobile number.';
COMMENT ON COLUMN catms.emergency_contact.is_primary      IS 'Indicates whether this is the primary emergency contact.';
COMMENT ON COLUMN catms.emergency_contact.created_at      IS 'Record creation timestamp in UTC.';

-- ============================================================================
-- 4. DEFERRED INTEGRITY TRIGGERS
-- Enforce "Exactly one primary identity" and "At least one emergency contact"
-- at the transaction level (DEFERRABLE INITIALLY DEFERRED).
-- ============================================================================

-- Function: Ensure patient has exactly one primary identity upon commit
CREATE OR REPLACE FUNCTION catms.trg_check_patient_has_primary_identity()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM catms.patient_identity
        WHERE patient_id = NEW.patient_id AND is_primary = TRUE
    ) THEN
        RAISE EXCEPTION 'Patient % must have a primary identity (NIC or Passport) registered.', NEW.patient_id
            USING ERRCODE = 'check_violation',
                  HINT = 'Insert a patient_identity record with is_primary = TRUE in the same transaction.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patient_primary_identity_mandatory ON catms.patient;
CREATE CONSTRAINT TRIGGER trg_patient_primary_identity_mandatory
AFTER INSERT OR UPDATE ON catms.patient
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION catms.trg_check_patient_has_primary_identity();

-- Function: Ensure patient has at least one emergency contact upon commit
CREATE OR REPLACE FUNCTION catms.trg_check_patient_has_emergency_contact()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM catms.emergency_contact
        WHERE patient_id = NEW.patient_id
    ) THEN
        RAISE EXCEPTION 'Patient % must have at least one emergency contact registered.', NEW.patient_id
            USING ERRCODE = 'check_violation',
                  HINT = 'Insert an emergency_contact record in the same transaction.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patient_emergency_contact_mandatory ON catms.patient;
CREATE CONSTRAINT TRIGGER trg_patient_emergency_contact_mandatory
AFTER INSERT OR UPDATE ON catms.patient
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION catms.trg_check_patient_has_emergency_contact();

-- Function: Prevent deleting all emergency contacts for an existing patient
CREATE OR REPLACE FUNCTION catms.trg_check_emergency_contact_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM catms.patient WHERE patient_id = OLD.patient_id) THEN
        IF NOT EXISTS (
            SELECT 1 FROM catms.emergency_contact
            WHERE patient_id = OLD.patient_id AND contact_id <> OLD.contact_id
        ) THEN
            RAISE EXCEPTION 'Cannot remove all emergency contacts for patient %. At least one contact must remain.', OLD.patient_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emergency_contact_delete_guard ON catms.emergency_contact;
CREATE CONSTRAINT TRIGGER trg_emergency_contact_delete_guard
AFTER DELETE ON catms.emergency_contact
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION catms.trg_check_emergency_contact_delete();

-- ============================================================================
-- 5. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patient_name 
    ON catms.patient (last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_patient_phone 
    ON catms.patient (contact_number);

CREATE INDEX IF NOT EXISTS idx_patient_identity_number 
    ON catms.patient_identity (identity_number);

CREATE INDEX IF NOT EXISTS idx_emergency_contact_patient 
    ON catms.emergency_contact (patient_id);

-- ============================================================================
-- 6. PERMISSIONS & ROLE GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON catms.patient TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.patient_identity TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.emergency_contact TO catms_app;

GRANT SELECT ON catms.patient TO catms_readonly;
GRANT SELECT ON catms.patient_identity TO catms_readonly;
GRANT SELECT ON catms.emergency_contact TO catms_readonly;

-- ============================================================================
-- 7. RECORD MIGRATION ENTRY
-- ============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (40, 'implement patient, identity and emergency-contact schema', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
