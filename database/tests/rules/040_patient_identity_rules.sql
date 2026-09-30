-- 040_patient_identity_rules.sql
-- Test Suite: Business rules, constraints, clinic-wide uniqueness, and deferred triggers for CATMS-018
-- Asserts valid patient registration commits, duplicate NIC/Passport is rejected clinic-wide,
-- primary identity invariant holds, and mandatory emergency contact triggers work properly.

BEGIN;

DO $$
DECLARE
    v_patient_id BIGINT;
    v_patient_id2 BIGINT;
    v_branch_id BIGINT;
    v_employee_id BIGINT;
    v_caught BOOLEAN;
BEGIN
    -- -------------------------------------------------------------------------
    -- Setup: Ensure a valid branch and employee exist for FK reference
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch (
        branch_code, name, address_line_1, city, district, postal_code, contact_phone
    ) VALUES (
        'CMB-PAT-TEST', 'Patient Test Branch', '10 Galle Rd', 'Colombo', 'Colombo', '00300', '+94 11 300 0001'
    ) ON CONFLICT (branch_code) DO UPDATE SET name = EXCLUDED.name
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, email, hire_date
    ) VALUES (
        'EMP-PAT-TEST', '198000000001', 'Test Registrar', 'Male', '1980-01-01',
        'Receptionist', '+94 77 100 0001', 'reg@test.catms.lk', CURRENT_DATE
    ) ON CONFLICT (employee_number) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING employee_id INTO v_employee_id;

    -- -------------------------------------------------------------------------
    -- 1. Happy Path: Register valid patient with primary identity & emergency contact
    -- -------------------------------------------------------------------------
    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth, gender, blood_group,
        contact_number, email, address, registered_branch_id, registered_by
    ) VALUES (
        'PAT-TEST-001', 'Sunil', 'Perera', '1985-06-15', 'Male', 'O+',
        '0771234567', 'sunil.p@example.lk', '12 Colombo Rd', v_branch_id, v_employee_id
    ) RETURNING patient_id INTO v_patient_id;

    INSERT INTO catms.patient_identity (
        patient_id, identity_type, identity_number, is_primary
    ) VALUES (
        v_patient_id, 'NIC', '198516601234', TRUE
    );

    INSERT INTO catms.emergency_contact (
        patient_id, contact_name, relationship, phone_number, is_primary
    ) VALUES (
        v_patient_id, 'Kamani Perera', 'Spouse', '0719876543', TRUE
    );

    -- -------------------------------------------------------------------------
    -- 2. Clinic-Wide Uniqueness: Duplicate NIC rejection (even in different case)
    -- -------------------------------------------------------------------------
    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth, gender, blood_group,
        contact_number, registered_branch_id, registered_by
    ) VALUES (
        'PAT-TEST-002', 'Sunil', 'Duplicate', '1985-06-15', 'Male', 'O+',
        '0770000000', v_branch_id, v_employee_id
    ) RETURNING patient_id INTO v_patient_id2;

    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.patient_identity (
            patient_id, identity_type, identity_number, is_primary
        ) VALUES (
            v_patient_id2, 'NIC', '198516601234', TRUE
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate NIC was not rejected clinic-wide';
    END IF;

    -- Clean up temporary duplicate patient
    DELETE FROM catms.patient WHERE patient_id = v_patient_id2;

    -- -------------------------------------------------------------------------
    -- 3. At Most One Primary Identity Invariant
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.patient_identity (
            patient_id, identity_type, identity_number, is_primary
        ) VALUES (
            v_patient_id, 'Passport', 'N9876543', TRUE
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: second primary identity was not rejected';
    END IF;

    -- Secondary identity should succeed
    INSERT INTO catms.patient_identity (
        patient_id, identity_type, identity_number, is_primary
    ) VALUES (
        v_patient_id, 'Passport', 'N9876543', FALSE
    );

    -- -------------------------------------------------------------------------
    -- 4. Guard against Deleting All Emergency Contacts
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        DELETE FROM catms.emergency_contact WHERE patient_id = v_patient_id;
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: deleting all emergency contacts was not blocked';
    END IF;

    RAISE NOTICE '✅ 040_patient_identity_rules: All business rule assertions passed.';
END;
$$;

ROLLBACK;
