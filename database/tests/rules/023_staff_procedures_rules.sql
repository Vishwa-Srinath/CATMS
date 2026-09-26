-- 023_staff_procedures_rules.sql
-- Test Suite: Business rules and transaction invariants for CATMS-023
-- Tests:
--   - register_employee atomicity & partial-rollback on failure
--   - register_employee full success (employee, assignment, user_account, role, audit)
--   - register_doctor_profile position validation (Doctor required; non-doctor rejected)
--   - register_doctor_profile full success with specialties and clinician role
--   - transfer_employee_branch atomicity (closes previous, opens new, updates role scope)
--   - transfer_employee_branch rejection of inactive/duplicate transfers
--   - deactivate_employee soft deactivation (closes assignments, disables user, retains full history)

BEGIN;

DO $$
DECLARE
    v_branch_id_1 BIGINT;
    v_branch_id_2 BIGINT;
    v_inactive_branch_id BIGINT;
    v_spec_id_1 BIGINT;
    v_spec_id_2 BIGINT;

    v_doc_emp_id BIGINT;
    v_doc_user_id BIGINT;
    v_doc_assign_id BIGINT;
    v_doc_id BIGINT;

    v_rec_emp_id BIGINT;
    v_rec_user_id BIGINT;
    v_rec_assign_id BIGINT;

    v_new_assign_id BIGINT;
    v_caught BOOLEAN;
    v_count INTEGER;
BEGIN
    -- -------------------------------------------------------------------------
    -- Fixtures: Branches & Specialties
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('CMB-PROC1', 'Colombo Central Clinic', '10 Galle Road', 'Colombo', '+94 11 200 0001', TRUE)
    RETURNING branch_id INTO v_branch_id_1;

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('KND-PROC2', 'Kandy Hill Clinic', '25 Peradeniya Road', 'Kandy', '+94 81 200 0002', TRUE)
    RETURNING branch_id INTO v_branch_id_2;

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('GAL-INACT', 'Galle Old Clinic', '50 Fort Road', 'Galle', '+94 91 200 0003', FALSE)
    RETURNING branch_id INTO v_inactive_branch_id;

    INSERT INTO catms.specialty (specialty_code, name, description)
    VALUES ('CARD-PROC', 'Cardiology Procedure Spec', 'Heart care')
    RETURNING specialty_id INTO v_spec_id_1;

    INSERT INTO catms.specialty (specialty_code, name, description)
    VALUES ('PEDI-PROC', 'Paediatrics Procedure Spec', 'Child health')
    RETURNING specialty_id INTO v_spec_id_2;

    -- -------------------------------------------------------------------------
    -- 1. Atomicity & Partial-Rollback: register_employee with invalid branch
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        CALL catms.register_employee(
            p_employee_number     => 'EMP-FAIL-01',
            p_nic                 => '991112223V',
            p_full_name           => 'Should Rollback Staff',
            p_gender_code         => 'Male',
            p_date_of_birth       => '1995-01-01'::date,
            p_position_code       => 'Receptionist',
            p_phone               => '+94 77 999 0001',
            p_branch_id           => 999999, -- Non-existent branch
            p_email               => 'fail@catms.com',
            p_hire_date           => CURRENT_DATE,
            p_assignment_type     => 'PRIMARY',
            p_username            => 'fail.user',
            p_password_hash       => '$2b$12$e8Yk1.Kq9O2jM4jV6jQ8Nu8F/0kQ5lM1yZ7h9o8x7p6',
            p_role_code           => 'Reception',
            p_assigned_by_user_id => NULL,
            p_employee_id         => v_rec_emp_id,
            p_user_account_id     => v_rec_user_id,
            p_assignment_id       => v_rec_assign_id
        );
    EXCEPTION
        WHEN foreign_key_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: register_employee with invalid branch must fail';
    END IF;

    -- Verify zero partial rows were created
    SELECT count(*) INTO v_count FROM catms.employee WHERE nic = '991112223V';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Rule assertion failed: partial employee row left behind after rollback';
    END IF;

    SELECT count(*) INTO v_count FROM catms.user_account WHERE username = 'fail.user';
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Rule assertion failed: partial user_account row left behind after rollback';
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Successful Atomic Employee Registration: Doctor & Receptionist
    -- -------------------------------------------------------------------------
    -- 2a. Register Doctor Employee
    CALL catms.register_employee(
        p_employee_number     => 'EMP-DOC-01',
        p_nic                 => '851234567V',
        p_full_name           => 'Dr. Kasun Fernando',
        p_gender_code         => 'Male',
        p_date_of_birth       => '1985-06-15'::date,
        p_position_code       => 'Doctor',
        p_phone               => '+94 77 100 0001',
        p_branch_id           => v_branch_id_1,
        p_email               => 'kasun.fernando@catms.com',
        p_hire_date           => CURRENT_DATE,
        p_assignment_type     => 'PRIMARY',
        p_username            => 'dr.kasun',
        p_password_hash       => '$2b$12$e8Yk1.Kq9O2jM4jV6jQ8Nu8F/0kQ5lM1yZ7h9o8x7p6',
        p_role_code           => 'Clinician',
        p_assigned_by_user_id => NULL,
        p_employee_id         => v_doc_emp_id,
        p_user_account_id     => v_doc_user_id,
        p_assignment_id       => v_doc_assign_id
    );

    IF v_doc_emp_id IS NULL OR v_doc_user_id IS NULL OR v_doc_assign_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: register_employee returned NULL IDs';
    END IF;

    -- Verify employee state
    PERFORM 1 FROM catms.employee
    WHERE employee_id = v_doc_emp_id AND position_code = 'Doctor' AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: employee record missing or inactive';
    END IF;

    -- Verify primary assignment
    PERFORM 1 FROM catms.employee_branch_assignment
    WHERE employee_branch_assignment_id = v_doc_assign_id
      AND employee_id = v_doc_emp_id
      AND branch_id = v_branch_id_1
      AND is_active = TRUE
      AND upper(assignment_type) = 'PRIMARY';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: primary branch assignment missing or inactive';
    END IF;

    -- Verify user account & role
    PERFORM 1 FROM catms.user_account
    WHERE user_account_id = v_doc_user_id AND username = 'dr.kasun' AND account_status = 'Active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: user_account record missing or inactive';
    END IF;

    PERFORM 1 FROM catms.user_account_role
    WHERE user_account_id = v_doc_user_id AND branch_scope_id = v_branch_id_1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: user_account_role branch scoping missing';
    END IF;

    -- Verify audit event
    PERFORM 1 FROM catms.audit_event
    WHERE entity_type = 'EMPLOYEE' AND entity_id = v_doc_emp_id::text AND action_code = 'EMPLOYEE_REGISTERED';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: audit event for employee registration missing';
    END IF;

    -- 2b. Register Receptionist Employee
    CALL catms.register_employee(
        p_employee_number     => 'EMP-REC-01',
        p_nic                 => '925432109V',
        p_full_name           => 'Anusha Silva',
        p_gender_code         => 'Female',
        p_date_of_birth       => '1992-03-20'::date,
        p_position_code       => 'Receptionist',
        p_phone               => '+94 77 100 0002',
        p_branch_id           => v_branch_id_1,
        p_email               => 'anusha.silva@catms.com',
        p_hire_date           => CURRENT_DATE,
        p_assignment_type     => 'PRIMARY',
        p_username            => 'anusha.reception',
        p_password_hash       => '$2b$12$e8Yk1.Kq9O2jM4jV6jQ8Nu8F/0kQ5lM1yZ7h9o8x7p6',
        p_role_code           => 'Reception',
        p_assigned_by_user_id => v_doc_user_id,
        p_employee_id         => v_rec_emp_id,
        p_user_account_id     => v_rec_user_id,
        p_assignment_id       => v_rec_assign_id
    );

    -- -------------------------------------------------------------------------
    -- 3. Doctor-Position Invariant: non-doctor employee MUST be rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        CALL catms.register_doctor_profile(
            p_employee_id              => v_rec_emp_id, -- Receptionist!
            p_medical_license_no       => 'SLMC-REC-FAIL',
            p_practice_start_date      => '2015-01-01'::date,
            p_default_consultation_fee => 2500.00,
            p_specialty_ids            => ARRAY[v_spec_id_1],
            p_primary_specialty_id     => v_spec_id_1,
            p_assigned_by_user_id      => v_doc_user_id,
            p_doctor_id                => v_doc_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: register_doctor_profile must reject non-Doctor employee';
    END IF;

    -- Assert zero partial rows in doctor_profile or doctor_specialty
    SELECT count(*) INTO v_count FROM catms.doctor_profile WHERE doctor_id = v_rec_emp_id;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor_profile row created for non-doctor employee';
    END IF;

    SELECT count(*) INTO v_count FROM catms.doctor_specialty WHERE doctor_id = v_rec_emp_id;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor_specialty row created for non-doctor employee';
    END IF;

    -- -------------------------------------------------------------------------
    -- 4. Successful Doctor Profile Registration (Shared PK & Specialties)
    -- -------------------------------------------------------------------------
    CALL catms.register_doctor_profile(
        p_employee_id              => v_doc_emp_id,
        p_medical_license_no       => 'SLMC-98765',
        p_practice_start_date      => '2012-04-01'::date,
        p_default_consultation_fee => 3500.00,
        p_specialty_ids            => ARRAY[v_spec_id_1, v_spec_id_2],
        p_primary_specialty_id     => v_spec_id_1,
        p_assigned_by_user_id      => v_doc_user_id,
        p_doctor_id                => v_doc_id
    );

    IF v_doc_id <> v_doc_emp_id THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor_id (%) must equal employee_id (%)', v_doc_id, v_doc_emp_id;
    END IF;

    -- Verify doctor_profile row
    PERFORM 1 FROM catms.doctor_profile
    WHERE doctor_id = v_doc_emp_id
      AND medical_license_no = 'slmc-98765' -- citext case-insensitive match
      AND default_consultation_fee = 3500.00
      AND is_accepting_appointments = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor_profile record missing or incorrect';
    END IF;

    -- Verify specialties attached with exactly one active primary
    SELECT count(*) INTO v_count
    FROM catms.doctor_specialty
    WHERE doctor_id = v_doc_emp_id AND is_primary = TRUE;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Rule assertion failed: expected exactly 1 primary specialty, found %', v_count;
    END IF;

    SELECT count(*) INTO v_count
    FROM catms.doctor_specialty
    WHERE doctor_id = v_doc_emp_id;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Rule assertion failed: expected 2 attached specialties, found %', v_count;
    END IF;

    -- Verify audit event
    PERFORM 1 FROM catms.audit_event
    WHERE entity_type = 'DOCTOR_PROFILE' AND entity_id = v_doc_emp_id::text AND action_code = 'DOCTOR_REGISTERED';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: audit event for doctor registration missing';
    END IF;

    -- -------------------------------------------------------------------------
    -- 5. Branch Transfer (transfer_employee_branch): Atomic lifecycle transition
    -- -------------------------------------------------------------------------
    -- Transfer receptionist from branch 1 to branch 2
    CALL catms.transfer_employee_branch(
        p_employee_id         => v_rec_emp_id,
        p_new_branch_id       => v_branch_id_2,
        p_assignment_type     => 'PRIMARY',
        p_effective_date      => CURRENT_DATE,
        p_assigned_by_user_id => v_doc_user_id,
        p_new_assignment_id   => v_new_assign_id
    );

    IF v_new_assign_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: transfer_employee_branch returned NULL assignment ID';
    END IF;

    -- Assert old assignment is closed and marked inactive
    PERFORM 1 FROM catms.employee_branch_assignment
    WHERE employee_branch_assignment_id = v_rec_assign_id
      AND is_active = FALSE
      AND valid_to = CURRENT_DATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: old assignment was not closed properly';
    END IF;

    -- Assert new assignment is active
    PERFORM 1 FROM catms.employee_branch_assignment
    WHERE employee_branch_assignment_id = v_new_assign_id
      AND branch_id = v_branch_id_2
      AND is_active = TRUE
      AND valid_to IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: new assignment was not activated';
    END IF;

    -- Assert total assignments for this employee is 2 (history is retained!)
    SELECT count(*) INTO v_count
    FROM catms.employee_branch_assignment
    WHERE employee_id = v_rec_emp_id;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Rule assertion failed: assignment history was lost during transfer (count=%)', v_count;
    END IF;

    -- Assert user role branch scope was updated to branch 2
    PERFORM 1 FROM catms.user_account_role
    WHERE user_account_id = v_rec_user_id AND branch_scope_id = v_branch_id_2;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: user account role branch scope was not updated to new branch';
    END IF;

    -- 5b. Transfer to inactive branch must fail
    v_caught := FALSE;
    BEGIN
        CALL catms.transfer_employee_branch(
            p_employee_id         => v_rec_emp_id,
            p_new_branch_id       => v_inactive_branch_id,
            p_assignment_type     => 'PRIMARY',
            p_effective_date      => CURRENT_DATE,
            p_assigned_by_user_id => v_doc_user_id,
            p_new_assignment_id   => v_new_assign_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: transfer to inactive branch must fail';
    END IF;

    -- -------------------------------------------------------------------------
    -- 6. Soft Deactivation (deactivate_employee): Retains full history
    -- -------------------------------------------------------------------------
    CALL catms.deactivate_employee(
        p_employee_id            => v_doc_emp_id,
        p_reason                 => 'Relocation overseas',
        p_deactivated_by_user_id => v_rec_user_id,
        p_effective_date         => CURRENT_DATE
    );

    -- 6a. Employee state is inactive
    PERFORM 1 FROM catms.employee
    WHERE employee_id = v_doc_emp_id
      AND is_active = FALSE
      AND employment_status = 'Inactive'
      AND terminated_at = CURRENT_DATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: employee was not soft-deactivated';
    END IF;

    -- 6b. Active branch assignments closed
    SELECT count(*) INTO v_count
    FROM catms.employee_branch_assignment
    WHERE employee_id = v_doc_emp_id AND is_active = TRUE;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Rule assertion failed: active branch assignments remain after deactivation';
    END IF;

    -- 6c. Doctor appointments disabled
    PERFORM 1 FROM catms.doctor_profile
    WHERE doctor_id = v_doc_emp_id AND is_accepting_appointments = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor appointments were not disabled';
    END IF;

    -- 6d. User account disabled
    PERFORM 1 FROM catms.user_account
    WHERE employee_id = v_doc_emp_id AND account_status = 'Disabled';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: user account was not disabled';
    END IF;

    -- 6e. Audit event logged
    PERFORM 1 FROM catms.audit_event
    WHERE entity_type = 'EMPLOYEE' AND entity_id = v_doc_emp_id::text AND action_code = 'EMPLOYEE_DEACTIVATED';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: deactivation audit event missing';
    END IF;

    -- 6f. CRITICAL ACCEPTANCE: Assert NO records were physically deleted
    SELECT count(*) INTO v_count FROM catms.employee WHERE employee_id = v_doc_emp_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Rule assertion failed: employee record was deleted!';
    END IF;

    SELECT count(*) INTO v_count FROM catms.doctor_profile WHERE doctor_id = v_doc_emp_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor_profile record was deleted!';
    END IF;

    SELECT count(*) INTO v_count FROM catms.doctor_specialty WHERE doctor_id = v_doc_emp_id;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor_specialty records were deleted!';
    END IF;

    SELECT count(*) INTO v_count FROM catms.employee_branch_assignment WHERE employee_id = v_doc_emp_id;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Rule assertion failed: employee_branch_assignment records were deleted!';
    END IF;

    SELECT count(*) INTO v_count FROM catms.user_account WHERE employee_id = v_doc_emp_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Rule assertion failed: user_account record was deleted!';
    END IF;

    RAISE NOTICE '✅ 023_staff_procedures_rules: All business rule and invariant assertions passed.';
END;
$$;

ROLLBACK;
