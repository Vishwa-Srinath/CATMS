-- 041_patient_registration_procedure.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity & Insurance)
-- Issue: CATMS-025 (GitHub #39)
-- Dependencies: 040_create_patient_identity_schema.sql, 020_branch_and_employee.sql

BEGIN;

-- =============================================================================
-- Procedure: catms.register_patient
--
-- Atomically creates:
--   1. Master patient record (catms.patient)
--   2. Primary identity record (catms.patient_identity, is_primary = TRUE)
--   3. Primary emergency contact (catms.emergency_contact, is_primary = TRUE)
--   4. Audit trail entry (catms.audit_event)
--
-- All operations execute in a single database transaction. If any constraint
-- (duplicate NIC/passport clinic-wide, invalid branch, missing contact) fails,
-- the entire transaction is rolled back leaving zero orphaned records.
--
-- Timestamps (registered_at, created_at) are database-controlled.
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.register_patient(
    p_first_name           VARCHAR(100),
    p_last_name            VARCHAR(100),
    p_date_of_birth        DATE,
    p_gender               VARCHAR(20),
    p_contact_number       VARCHAR(30),
    -- Primary Identity
    p_identity_type        VARCHAR(20),
    p_identity_number      CITEXT,
    -- Primary Emergency Contact
    p_contact_name         VARCHAR(150),
    p_relationship         VARCHAR(50),
    p_emergency_phone      VARCHAR(30),
    -- Optional fields
    p_patient_number       VARCHAR(32) DEFAULT NULL,
    p_blood_group          VARCHAR(10) DEFAULT NULL,
    p_email                CITEXT DEFAULT NULL,
    p_address              TEXT DEFAULT NULL,
    p_registered_branch_id BIGINT DEFAULT NULL,
    p_registered_by        BIGINT DEFAULT NULL,
    -- INOUT return
    INOUT p_patient_id     BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_patient_number VARCHAR(32);
    v_branch_active  BOOLEAN;
    v_emp_active     BOOLEAN;
    v_actor_user_id  BIGINT;
BEGIN
    -- 1. Validate mandatory patient attributes
    IF p_first_name IS NULL OR length(trim(p_first_name)) = 0 THEN
        RAISE EXCEPTION 'First name cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_last_name IS NULL OR length(trim(p_last_name)) = 0 THEN
        RAISE EXCEPTION 'Last name cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_date_of_birth IS NULL THEN
        RAISE EXCEPTION 'Date of birth is required' USING ERRCODE = 'check_violation';
    END IF;

    IF p_date_of_birth > CURRENT_DATE THEN
        RAISE EXCEPTION 'Date of birth % cannot be in the future', p_date_of_birth
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_gender IS NULL OR p_gender NOT IN ('Male', 'Female', 'Other') THEN
        RAISE EXCEPTION 'Invalid gender %: must be Male, Female, or Other', p_gender
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_blood_group IS NOT NULL AND p_blood_group NOT IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') THEN
        RAISE EXCEPTION 'Invalid blood group %', p_blood_group
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_contact_number IS NULL OR length(trim(p_contact_number)) = 0 THEN
        RAISE EXCEPTION 'Contact number cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Validate primary identity attributes
    IF p_identity_type IS NULL OR p_identity_type NOT IN ('NIC', 'Passport') THEN
        RAISE EXCEPTION 'Identity type must be NIC or Passport, got %', p_identity_type
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_identity_number IS NULL OR length(trim(p_identity_number)) = 0 THEN
        RAISE EXCEPTION 'Identity number cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    -- Pre-check clinic-wide identity uniqueness
    IF EXISTS (
        SELECT 1 FROM catms.patient_identity
        WHERE identity_type = p_identity_type
          AND identity_number = trim(p_identity_number)
    ) THEN
        RAISE EXCEPTION 'Identity % with number % is already registered clinic-wide',
            p_identity_type, trim(p_identity_number)
            USING ERRCODE = 'unique_violation';
    END IF;

    -- 3. Validate primary emergency contact attributes
    IF p_contact_name IS NULL OR length(trim(p_contact_name)) = 0 THEN
        RAISE EXCEPTION 'Emergency contact name cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_relationship IS NULL OR length(trim(p_relationship)) = 0 THEN
        RAISE EXCEPTION 'Emergency contact relationship cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_emergency_phone IS NULL OR length(trim(p_emergency_phone)) = 0 THEN
        RAISE EXCEPTION 'Emergency contact phone cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Validate foreign references (Branch and Employee)
    IF p_registered_branch_id IS NOT NULL THEN
        SELECT is_active INTO v_branch_active
        FROM catms.branch
        WHERE branch_id = p_registered_branch_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Branch with ID % does not exist', p_registered_branch_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_branch_active = FALSE THEN
            RAISE EXCEPTION 'Cannot register patient at inactive branch %', p_registered_branch_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF p_registered_by IS NOT NULL THEN
        SELECT is_active INTO v_emp_active
        FROM catms.employee
        WHERE employee_id = p_registered_by;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Registering employee with ID % does not exist', p_registered_by
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_emp_active = FALSE THEN
            RAISE EXCEPTION 'Cannot register patient with inactive staff account %', p_registered_by
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    -- 5. Resolve patient number (auto-generate if omitted)
    IF p_patient_number IS NULL OR length(trim(p_patient_number)) = 0 THEN
        v_patient_number := 'PAT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(floor(random() * 90000 + 10000)::text, 5, '0');
    ELSE
        v_patient_number := trim(p_patient_number);
    END IF;

    -- 6. Insert master patient record
    INSERT INTO catms.patient (
        patient_number,
        first_name,
        last_name,
        date_of_birth,
        gender,
        blood_group,
        contact_number,
        email,
        address,
        registered_branch_id,
        registered_by,
        registered_at,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_patient_number,
        trim(p_first_name),
        trim(p_last_name),
        p_date_of_birth,
        p_gender,
        p_blood_group,
        trim(p_contact_number),
        trim(p_email),
        trim(p_address),
        p_registered_branch_id,
        p_registered_by,
        clock_timestamp(),
        TRUE,
        clock_timestamp(),
        clock_timestamp()
    ) RETURNING patient_id INTO p_patient_id;

    -- 7. Insert primary identity record
    INSERT INTO catms.patient_identity (
        patient_id,
        identity_type,
        identity_number,
        is_primary,
        created_at
    ) VALUES (
        p_patient_id,
        p_identity_type,
        trim(p_identity_number),
        TRUE,
        clock_timestamp()
    );

    -- 8. Insert primary emergency contact
    INSERT INTO catms.emergency_contact (
        patient_id,
        contact_name,
        relationship,
        phone_number,
        is_primary,
        created_at
    ) VALUES (
        p_patient_id,
        trim(p_contact_name),
        trim(p_relationship),
        trim(p_emergency_phone),
        TRUE,
        clock_timestamp()
    );

    -- 9. Record audit event (if audit_event table exists)
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'catms' AND table_name = 'audit_event'
    ) THEN
        IF p_registered_by IS NOT NULL THEN
            SELECT user_account_id INTO v_actor_user_id
            FROM catms.user_account
            WHERE employee_id = p_registered_by
            LIMIT 1;
        END IF;

        INSERT INTO catms.audit_event (
            actor_user_id,
            entity_type,
            entity_id,
            action_code,
            payload
        ) VALUES (
            v_actor_user_id,
            'PATIENT',
            p_patient_id::text,
            'PATIENT_REGISTERED',
            jsonb_build_object(
                'patient_number', v_patient_number,
                'first_name', trim(p_first_name),
                'last_name', trim(p_last_name),
                'identity_type', p_identity_type,
                'identity_number', trim(p_identity_number)::text,
                'registered_branch_id', p_registered_branch_id,
                'registered_by', p_registered_by
            )
        );
    END IF;
END;
$$;

-- =============================================================================
-- COMMENT ON Statements
-- =============================================================================

COMMENT ON PROCEDURE catms.register_patient IS
  'Atomically registers a patient, their primary identity, and their primary emergency contact in one transaction with full rollback on failure.';

-- =============================================================================
-- Permissions & Grants
-- =============================================================================

GRANT EXECUTE ON PROCEDURE catms.register_patient TO catms_app;

-- =============================================================================
-- Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (41, 'implement atomic patient registration procedure', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
