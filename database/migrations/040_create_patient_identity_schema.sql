-- 040_create_patient_identity_schema.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity & Insurance)
-- Issue: CATMS-018 (GitHub #28)
-- Dependencies: CATMS-012 (extensions/citext), CATMS-015 (branch/employee schema)

BEGIN;

-- Ensure case-insensitive text extension is available
CREATE EXTENSION IF NOT EXISTS citext;

-- Ensure schema_migrations exists for version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ============================================================================
-- 1. PATIENT MASTER TABLE
-- Master patient entity with clinic-wide visibility across all branches.
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient (
    patient_id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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

    CONSTRAINT uq_patient_patient_number UNIQUE (patient_number),
    CONSTRAINT chk_patient_gender CHECK (gender IN ('Male', 'Female', 'Other')),
    CONSTRAINT chk_patient_blood_group CHECK (blood_group IS NULL OR blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
    CONSTRAINT chk_patient_dob CHECK (date_of_birth <= CURRENT_DATE)
);

-- Foreign key constraints added conditionally if referenced tables exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'branch') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_patient_registered_branch' AND table_name = 'patient'
        ) THEN
            ALTER TABLE patient ADD CONSTRAINT fk_patient_registered_branch 
                FOREIGN KEY (registered_branch_id) REFERENCES branch(branch_id) ON DELETE RESTRICT;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_patient_registered_by' AND table_name = 'patient'
        ) THEN
            ALTER TABLE patient ADD CONSTRAINT fk_patient_registered_by 
                FOREIGN KEY (registered_by) REFERENCES employee(employee_id) ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

COMMENT ON TABLE  patient                      IS 'Master patient record accessible clinic-wide across all branches.';
COMMENT ON COLUMN patient.patient_id           IS 'Surrogate primary key for patient.';
COMMENT ON COLUMN patient.patient_number       IS 'Human-readable unique identifier (e.g. PAT-00421).';
COMMENT ON COLUMN patient.first_name           IS 'Patient legal first name.';
COMMENT ON COLUMN patient.last_name            IS 'Patient legal last / family name.';
COMMENT ON COLUMN patient.date_of_birth        IS 'Patient date of birth.';
COMMENT ON COLUMN patient.gender               IS 'Patient gender (Male, Female, Other).';
COMMENT ON COLUMN patient.blood_group          IS 'Patient blood group (e.g. O+, A-).';
COMMENT ON COLUMN patient.contact_number       IS 'Primary phone number for notifications and contact.';
COMMENT ON COLUMN patient.email                IS 'Case-insensitive email address.';
COMMENT ON COLUMN patient.address              IS 'Physical residential address.';
COMMENT ON COLUMN patient.registered_branch_id IS 'Branch where the patient first registered.';
COMMENT ON COLUMN patient.registered_by        IS 'Employee staff account that performed initial registration.';
COMMENT ON COLUMN patient.registered_at        IS 'Audit timestamp when the patient was registered.';
COMMENT ON COLUMN patient.is_active            IS 'Soft-deletion status flag (TRUE = active, FALSE = archived/inactive).';
COMMENT ON COLUMN patient.created_at           IS 'System creation timestamp in UTC.';
COMMENT ON COLUMN patient.updated_at           IS 'System last update timestamp in UTC.';

-- ============================================================================
-- 2. PATIENT IDENTITY TABLE
-- National identity cards (NIC) and passports. Enforces clinic-wide uniqueness.
-- ============================================================================

CREATE TABLE IF NOT EXISTS patient_identity (
    identity_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id              BIGINT NOT NULL,
    identity_type           VARCHAR(20) NOT NULL,
    identity_number         citext NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT fk_patient_identity_patient FOREIGN KEY (patient_id) 
        REFERENCES patient(patient_id) ON DELETE CASCADE,
    CONSTRAINT chk_patient_identity_type CHECK (identity_type IN ('NIC', 'Passport')),
    CONSTRAINT uq_patient_identity_clinic_wide UNIQUE (identity_type, identity_number)
);

-- Partial unique index ensuring each patient has at most one primary identity
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_primary_identity 
    ON patient_identity (patient_id) 
    WHERE is_primary = TRUE;

COMMENT ON TABLE  patient_identity                 IS 'Patient official identification documents with clinic-wide uniqueness.';
COMMENT ON COLUMN patient_identity.identity_id     IS 'Surrogate primary key for identification record.';
COMMENT ON COLUMN patient_identity.patient_id      IS 'Foreign key referencing patient master.';
COMMENT ON COLUMN patient_identity.identity_type   IS 'Identification document type: NIC or Passport.';
COMMENT ON COLUMN patient_identity.identity_number IS 'Normalized case-insensitive identity document number.';
COMMENT ON COLUMN patient_identity.is_primary      IS 'Indicates whether this is the primary identity on file for the patient.';
COMMENT ON COLUMN patient_identity.created_at     IS 'Record creation timestamp in UTC.';

-- ============================================================================
-- 3. EMERGENCY CONTACT TABLE
-- Emergency contact information for patients.
-- ============================================================================

CREATE TABLE IF NOT EXISTS emergency_contact (
    contact_id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_id              BIGINT NOT NULL,
    contact_name            VARCHAR(150) NOT NULL,
    relationship            VARCHAR(50) NOT NULL,
    phone_number            VARCHAR(30) NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT fk_emergency_contact_patient FOREIGN KEY (patient_id) 
        REFERENCES patient(patient_id) ON DELETE CASCADE
);

-- Partial unique index ensuring at most one primary emergency contact per patient
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_primary_contact 
    ON emergency_contact (patient_id) 
    WHERE is_primary = TRUE;

COMMENT ON TABLE  emergency_contact                 IS 'Emergency contact details associated with a patient.';
COMMENT ON COLUMN emergency_contact.contact_id      IS 'Surrogate primary key for emergency contact.';
COMMENT ON COLUMN emergency_contact.patient_id      IS 'Foreign key referencing patient master.';
COMMENT ON COLUMN emergency_contact.contact_name    IS 'Full name of the emergency contact person.';
COMMENT ON COLUMN emergency_contact.relationship    IS 'Relationship to patient (e.g. Spouse, Parent, Sibling).';
COMMENT ON COLUMN emergency_contact.phone_number    IS 'Contact telephone / mobile number.';
COMMENT ON COLUMN emergency_contact.is_primary      IS 'Indicates whether this is the primary emergency contact.';
COMMENT ON COLUMN emergency_contact.created_at      IS 'Record creation timestamp in UTC.';

-- ============================================================================
-- 4. DEFERRED INTEGRITY TRIGGERS
-- Enforce "Exactly one primary identity" and "At least one emergency contact"
-- at the transaction level (DEFERRABLE INITIALLY DEFERRED).
-- ============================================================================

-- Function: Ensure patient has exactly one primary identity upon commit
CREATE OR REPLACE FUNCTION trg_check_patient_has_primary_identity()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM patient_identity
        WHERE patient_id = NEW.patient_id AND is_primary = TRUE
    ) THEN
        RAISE EXCEPTION 'Patient % must have a primary identity (NIC or Passport) registered.', NEW.patient_id
            USING ERRCODE = 'check_violation',
                  HINT = 'Insert a patient_identity record with is_primary = TRUE in the same transaction.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patient_primary_identity_mandatory ON patient;
CREATE CONSTRAINT TRIGGER trg_patient_primary_identity_mandatory
AFTER INSERT OR UPDATE ON patient
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_check_patient_has_primary_identity();

-- Function: Ensure patient has at least one emergency contact upon commit
CREATE OR REPLACE FUNCTION trg_check_patient_has_emergency_contact()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM emergency_contact
        WHERE patient_id = NEW.patient_id
    ) THEN
        RAISE EXCEPTION 'Patient % must have at least one emergency contact registered.', NEW.patient_id
            USING ERRCODE = 'check_violation',
                  HINT = 'Insert an emergency_contact record in the same transaction.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patient_emergency_contact_mandatory ON patient;
CREATE CONSTRAINT TRIGGER trg_patient_emergency_contact_mandatory
AFTER INSERT OR UPDATE ON patient
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_check_patient_has_emergency_contact();

-- Function: Prevent deleting all emergency contacts for an existing patient
CREATE OR REPLACE FUNCTION trg_check_emergency_contact_delete()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM patient WHERE patient_id = OLD.patient_id) THEN
        IF NOT EXISTS (
            SELECT 1 FROM emergency_contact
            WHERE patient_id = OLD.patient_id AND contact_id <> OLD.contact_id
        ) THEN
            RAISE EXCEPTION 'Cannot remove all emergency contacts for patient %. At least one contact must remain.', OLD.patient_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_emergency_contact_delete_guard ON emergency_contact;
CREATE CONSTRAINT TRIGGER trg_emergency_contact_delete_guard
AFTER DELETE ON emergency_contact
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION trg_check_emergency_contact_delete();

-- ============================================================================
-- 5. PERFORMANCE INDEXES
-- Index frequently queried columns (name search, phone search).
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_patient_name 
    ON patient (last_name, first_name);

CREATE INDEX IF NOT EXISTS idx_patient_phone 
    ON patient (contact_number);

CREATE INDEX IF NOT EXISTS idx_patient_identity_number 
    ON patient_identity (identity_number);

CREATE INDEX IF NOT EXISTS idx_emergency_contact_patient 
    ON emergency_contact (patient_id);

-- ============================================================================
-- 6. RECORD MIGRATION ENTRY
-- ============================================================================

INSERT INTO schema_migrations (version, description)
VALUES (40, 'create patient, patient_identity, and emergency_contact schema')
ON CONFLICT (version) DO NOTHING;

COMMIT;
