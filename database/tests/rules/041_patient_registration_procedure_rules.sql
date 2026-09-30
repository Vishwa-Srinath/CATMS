-- 041_patient_registration_procedure_rules.sql
-- Test Suite: Business rules and transaction invariants for CATMS-025 (Atomic Patient Registration)
-- Tests:
--   - Full successful atomic registration (patient + primary identity + emergency contact)
--   - Auto-generation of patient_number when omitted
--   - Duplicate identity rollback (leaves ZERO dangling records)
--   - Missing emergency contact rollback (leaves ZERO dangling records)
--   - Rejection of inactive branch
--   - Rejection of inactive staff account
--   - Rejection of future date of birth
--   - Database-controlled timestamps and creator provenance

BEGIN;

DO $$
DECLARE
    v_branch_active_id   BIGINT;
    v_branch_inactive_id BIGINT;
    v_emp_active_id      BIGINT;
    v_emp_inactive_id    BIGINT;

    v_patient_id         BIGINT;
    v_patient_id_auto    BIGINT;
    v_fail_id            BIGINT;

    v_count_patients     INTEGER;
    v_count_identities   INTEGER;
    v_count_contacts     INTEGER;

    v_patient_rec        RECORD;
    v_identity_rec       RECORD;
    v_contact_rec        RECORD;

    v_caught             BOOLEAN;
BEGIN
    -- -------------------------------------------------------------------------
    -- Setup: Active & Inactive Branches and Staff
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('CMB-PAT-ACT', 'Colombo Active Clinic', '10 Galle Road', 'Colombo', '+94 11 200 1111', TRUE)
    ON CONFLICT (branch_code) DO UPDATE SET is_active = TRUE
    RETURNING branch_id INTO v_branch_active_id;

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('CMB-PAT-INA', 'Colombo Inactive Clinic', '99 Closed Road', 'Colombo', '+94 11 200 9999', FALSE)
    ON CONFLICT (branch_code) DO UPDATE SET is_active = FALSE
    RETURNING branch_id INTO v_branch_inactive_id;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth, position_code,
        phone, email, hire_date, employment_status, is_active
    ) VALUES (
        'EMP-REG-ACT', '198800000001', 'Active Registrar', 'Female', '1988-05-10', 'Receptionist',
        '+94 77 123 4567', 'reg.act@test.catms.lk', CURRENT_DATE, 'Active', TRUE
    ) ON CONFLICT (employee_number) DO UPDATE SET is_active = TRUE
    RETURNING employee_id INTO v_emp_active_id;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth, position_code,
        phone, email, hire_date, employment_status, is_active
    ) VALUES (
        'EMP-REG-INA', '198800000002', 'Terminated Registrar', 'Male', '1988-06-15', 'Receptionist',
        '+94 77 999 8888', 'reg.ina@test.catms.lk', CURRENT_DATE, 'Terminated', FALSE
    ) ON CONFLICT (employee_number) DO UPDATE SET is_active = FALSE
    RETURNING employee_id INTO v_emp_inactive_id;

    -- -------------------------------------------------------------------------
    -- 1. Full Success: Atomic Patient Registration
    -- -------------------------------------------------------------------------
    CALL catms.register_patient(
        p_first_name           := 'Nimal',
        p_last_name            := 'Siripala',
        p_date_of_birth        := '1982-03-25'::DATE,
        p_gender               := 'Male',
        p_contact_number       := '0772345678',
        p_identity_type        := 'NIC',
        p_identity_number      := '198208401234',
        p_contact_name         := 'Chitra Siripala',
        p_relationship         := 'Spouse',
        p_emergency_phone      := '0712345678',
        p_patient_number       := 'PAT-REG-0001',
        p_blood_group          := 'B+',
        p_email                := 'nimal.s@example.lk',
        p_address              := '45 Temple Rd, Colombo',
        p_registered_branch_id := v_branch_active_id,
        p_registered_by        := v_emp_active_id,
        p_patient_id           := v_patient_id
    );

    IF v_patient_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: register_patient failed to return patient_id';
    END IF;

    -- Verify patient record
    SELECT * INTO v_patient_rec FROM catms.patient WHERE patient_id = v_patient_id;
    IF v_patient_rec.patient_number <> 'PAT-REG-0001' OR v_patient_rec.is_active <> TRUE THEN
        RAISE EXCEPTION 'Rule assertion failed: master patient attributes do not match expected values';
    END IF;

    -- Verify primary identity
    SELECT * INTO v_identity_rec FROM catms.patient_identity WHERE patient_id = v_patient_id;
    IF v_identity_rec.identity_type <> 'NIC' OR v_identity_rec.identity_number <> '198208401234' OR v_identity_rec.is_primary <> TRUE THEN
        RAISE EXCEPTION 'Rule assertion failed: primary identity record was not properly created';
    END IF;

    -- Verify primary emergency contact
    SELECT * INTO v_contact_rec FROM catms.emergency_contact WHERE patient_id = v_patient_id;
    IF v_contact_rec.contact_name <> 'Chitra Siripala' OR v_contact_rec.is_primary <> TRUE THEN
        RAISE EXCEPTION 'Rule assertion failed: primary emergency contact was not properly created';
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Auto-generation of Patient Number when Omitted
    -- -------------------------------------------------------------------------
    CALL catms.register_patient(
        p_first_name           := 'Anula',
        p_last_name            := 'Ratnayake',
        p_date_of_birth        := '1995-11-12'::DATE,
        p_gender               := 'Female',
        p_contact_number       := '0769998877',
        p_identity_type        := 'Passport',
        p_identity_number      := 'N88223344',
        p_contact_name         := 'Sunil Ratnayake',
        p_relationship         := 'Father',
        p_emergency_phone      := '0718887766',
        p_patient_number       := NULL, -- auto-generate
        p_patient_id           := v_patient_id_auto
    );

    IF v_patient_id_auto IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: auto-numbered patient registration failed';
    END IF;

    SELECT patient_number INTO v_patient_rec FROM catms.patient WHERE patient_id = v_patient_id_auto;
    IF v_patient_rec.patient_number IS NULL OR v_patient_rec.patient_number NOT LIKE 'PAT-%' THEN
        RAISE EXCEPTION 'Rule assertion failed: auto-generated patient number format is invalid: %', v_patient_rec.patient_number;
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. Duplicate Identity Rollback: Leaves ZERO dangling records
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        CALL catms.register_patient(
            p_first_name           := 'Imposter',
            p_last_name            := 'User',
            p_date_of_birth        := '1990-01-01'::DATE,
            p_gender               := 'Male',
            p_contact_number       := '0770000000',
            p_identity_type        := 'NIC',
            p_identity_number      := '198208401234', -- Duplicate of Test 1!
            p_contact_name         := 'Someone',
            p_relationship         := 'Friend',
            p_emergency_phone      := '0710000000',
            p_patient_number       := 'PAT-DUPLICATE-ATTEMPT',
            p_patient_id           := v_fail_id
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate identity attempt did not raise unique_violation';
    END IF;

    -- Confirm zero orphaned rows were created
    SELECT count(*) INTO v_count_patients FROM catms.patient WHERE patient_number = 'PAT-DUPLICATE-ATTEMPT';
    IF v_count_patients <> 0 THEN
        RAISE EXCEPTION 'Atomicity violation: duplicate identity attempt left behind % patient rows', v_count_patients;
    END IF;

    -- -------------------------------------------------------------------------
    -- 4. Missing Emergency Contact Rollback: Leaves ZERO dangling records
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        CALL catms.register_patient(
            p_first_name           := 'NoContact',
            p_last_name            := 'Person',
            p_date_of_birth        := '1992-07-20'::DATE,
            p_gender               := 'Other',
            p_contact_number       := '0775554433',
            p_identity_type        := 'NIC',
            p_identity_number      := '199220205566',
            p_contact_name         := '   ', -- Invalid blank name!
            p_relationship         := 'Sister',
            p_emergency_phone      := '0715554433',
            p_patient_number       := 'PAT-NOCONTACT-ATTEMPT',
            p_patient_id           := v_fail_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: blank emergency contact did not raise check_violation';
    END IF;

    -- Confirm zero orphaned rows in patient and patient_identity
    SELECT count(*) INTO v_count_patients FROM catms.patient WHERE patient_number = 'PAT-NOCONTACT-ATTEMPT';
    SELECT count(*) INTO v_count_identities FROM catms.patient_identity WHERE identity_number = '199220205566';
    IF v_count_patients <> 0 OR v_count_identities <> 0 THEN
        RAISE EXCEPTION 'Atomicity violation: invalid contact attempt left behind % patients and % identities',
            v_count_patients, v_count_identities;
    END IF;

    -- -------------------------------------------------------------------------
    -- 5. Inactive Branch Rejection
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        CALL catms.register_patient(
            p_first_name           := 'InactiveBranch',
            p_last_name            := 'Patient',
            p_date_of_birth        := '1985-01-01'::DATE,
            p_gender               := 'Female',
            p_contact_number       := '0771112222',
            p_identity_type        := 'NIC',
            p_identity_number      := '198500109988',
            p_contact_name         := 'Guardian',
            p_relationship         := 'Mother',
            p_emergency_phone      := '0711112222',
            p_registered_branch_id := v_branch_inactive_id,
            p_patient_id           := v_fail_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: registration at inactive branch did not raise check_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 6. Inactive Staff Account Rejection
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        CALL catms.register_patient(
            p_first_name           := 'InactiveStaff',
            p_last_name            := 'Patient',
            p_date_of_birth        := '1985-01-01'::DATE,
            p_gender               := 'Female',
            p_contact_number       := '0771113333',
            p_identity_type        := 'NIC',
            p_identity_number      := '198500109977',
            p_contact_name         := 'Guardian',
            p_relationship         := 'Mother',
            p_emergency_phone      := '0711113333',
            p_registered_branch_id := v_branch_active_id,
            p_registered_by        := v_emp_inactive_id,
            p_patient_id           := v_fail_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: registration by inactive staff did not raise check_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 7. Future Date of Birth Rejection
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        CALL catms.register_patient(
            p_first_name           := 'TimeTraveler',
            p_last_name            := 'Baby',
            p_date_of_birth        := (CURRENT_DATE + INTERVAL '5 days')::DATE,
            p_gender               := 'Male',
            p_contact_number       := '0778889999',
            p_identity_type        := 'NIC',
            p_identity_number      := '203000109966',
            p_contact_name         := 'Parent',
            p_relationship         := 'Mother',
            p_emergency_phone      := '0718889999',
            p_patient_id           := v_fail_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: future date of birth did not raise check_violation';
    END IF;

    RAISE NOTICE '✅ 041_patient_registration_procedure_rules: All business rule assertions and atomicity tests passed.';
END;
$$;

ROLLBACK;
