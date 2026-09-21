-- 022_doctor_auth_rbac_rules.sql
-- Test Suite: Business rules and security constraints for CATMS-017
-- Asserts:
--   - Shared Employee PK for doctor_profile
--   - Unique medical licence (case-insensitive citext)
--   - Unique username (case-insensitive citext)
--   - 1:1 employee to user_account
--   - Single-branch and all-branch (NULL) role scoping
--   - Append-only audit event trigger blocks UPDATE and DELETE
--   - ON DELETE RESTRICT blocks hard deletion of referenced entities

BEGIN;

DO $$
DECLARE
    v_branch_id BIGINT;
    v_doc_emp_id BIGINT;
    v_staff_emp_id BIGINT;
    v_spec_id_1 BIGINT;
    v_spec_id_2 BIGINT;
    v_user_id BIGINT;
    v_role_clinician_id SMALLINT;
    v_role_admin_id SMALLINT;
    v_audit_id BIGINT;
    v_caught BOOLEAN;
BEGIN
    -- -------------------------------------------------------------------------
    -- Fixtures: Branch, Employees (Doctor & Staff)
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('CMB-RBAC', 'Colombo RBAC Branch', '10 Galle Road', 'Colombo', '+94 11 400 0001')
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date
    ) VALUES (
        'EMP-DOC-1', '801234567V', 'Dr. Perera Clinician', 'Male', '1980-03-15',
        'Doctor', '077 400 0001', '2018-05-01'
    ) RETURNING employee_id INTO v_doc_emp_id;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date
    ) VALUES (
        'EMP-ADMIN-1', '831234567V', 'Admin Staff Member', 'Female', '1983-06-20',
        'Admin', '077 400 0002', '2019-01-10'
    ) RETURNING employee_id INTO v_staff_emp_id;

    -- -------------------------------------------------------------------------
    -- 1. Doctor Profile inherits shared Employee PK
    -- -------------------------------------------------------------------------
    INSERT INTO catms.doctor_profile (
        doctor_id, medical_license_no, practice_start_date, default_consultation_fee
    ) VALUES (
        v_doc_emp_id, 'SLMC-10001', '2010-01-01', 3500.00
    );

    PERFORM 1 FROM catms.doctor_profile WHERE doctor_id = v_doc_emp_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: doctor_profile was not created with shared employee PK';
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Duplicate Medical License Rejected (Case-Insensitive citext)
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.doctor_profile (
            doctor_id, medical_license_no, practice_start_date
        ) VALUES (
            v_staff_emp_id, 'slmc-10001', '2015-01-01'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate medical license was not rejected';
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. Specialty Catalogue and Doctor Specialty Primary Constraint
    -- -------------------------------------------------------------------------
    INSERT INTO catms.specialty (specialty_code, name, description)
    VALUES ('CARD-TEST', 'Cardiology Test', 'Heart care')
    RETURNING specialty_id INTO v_spec_id_1;

    INSERT INTO catms.specialty (specialty_code, name, description)
    VALUES ('PEDI-TEST', 'Paediatrics Test', 'Child health')
    RETURNING specialty_id INTO v_spec_id_2;

    -- Primary specialty for doctor
    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_doc_emp_id, v_spec_id_1, TRUE);

    -- Second active primary specialty for same doctor must fail
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
        VALUES (v_doc_emp_id, v_spec_id_2, TRUE);
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: second active primary specialty was not rejected';
    END IF;

    -- Non-primary specialty succeeds
    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_doc_emp_id, v_spec_id_2, FALSE);

    -- -------------------------------------------------------------------------
    -- 4. User Account: Credentials and 1:1 Employee Link
    -- -------------------------------------------------------------------------
    INSERT INTO catms.user_account (
        employee_id, username, password_hash, account_status
    ) VALUES (
        v_staff_emp_id, 'admin.user', '$2b$12$e8Yk1.Kq9O2jM4jV6jQ8Nu8F/0kQ5lM1yZ7h9o8x7p6', 'Active'
    ) RETURNING user_account_id INTO v_user_id;

    -- Duplicate username (case-insensitive) fails
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.user_account (
            employee_id, username, password_hash
        ) VALUES (
            v_doc_emp_id, 'ADMIN.USER', '$2b$12$someotherfakehashstringxxxxxxxxxxxxxxxxxxxxxxx'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate username was not rejected';
    END IF;

    -- Second account for same employee fails (1:1 constraint)
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.user_account (
            employee_id, username, password_hash
        ) VALUES (
            v_staff_emp_id, 'different.username', '$2b$12$someotherfakehashstringxxxxxxxxxxxxxxxxxxxxxxx'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate account for same employee was not rejected';
    END IF;

    -- -------------------------------------------------------------------------
    -- 5. RBAC Scoping: Branch-Specific vs All-Branch (NULL) Scope
    -- -------------------------------------------------------------------------
    SELECT app_role_id INTO v_role_clinician_id FROM catms.app_role WHERE role_code = 'Clinician';
    SELECT app_role_id INTO v_role_admin_id FROM catms.app_role WHERE role_code = 'Admin';

    -- Branch-scoped role assignment (e.g. Clinician locked to Colombo)
    INSERT INTO catms.user_account_role (
        user_account_id, app_role_id, branch_scope_id, assigned_by_user_id
    ) VALUES (
        v_user_id, v_role_clinician_id, v_branch_id, v_user_id
    );

    -- All-branch role assignment (branch_scope_id IS NULL for Admin)
    INSERT INTO catms.user_account_role (
        user_account_id, app_role_id, branch_scope_id, assigned_by_user_id
    ) VALUES (
        v_user_id, v_role_admin_id, NULL, v_user_id
    );

    PERFORM 1 FROM catms.user_account_role
    WHERE user_account_id = v_user_id AND branch_scope_id IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: all-branch role scope (NULL) was not recorded';
    END IF;

    -- -------------------------------------------------------------------------
    -- 6. Append-Only Audit Event
    -- -------------------------------------------------------------------------
    INSERT INTO catms.audit_event (
        actor_user_id, entity_type, entity_id, action_code, payload
    ) VALUES (
        v_user_id, 'USER_ACCOUNT', v_user_id::text, 'ROLE_ASSIGNED', '{"role": "Admin", "scope": "all"}'::jsonb
    ) RETURNING audit_event_id INTO v_audit_id;

    -- Attempting UPDATE must fail via trigger
    v_caught := FALSE;
    BEGIN
        UPDATE catms.audit_event
        SET action_code = 'MUTATED'
        WHERE audit_event_id = v_audit_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: UPDATE on audit_event was not blocked';
    END IF;

    -- Attempting DELETE must fail via trigger
    v_caught := FALSE;
    BEGIN
        DELETE FROM catms.audit_event
        WHERE audit_event_id = v_audit_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: DELETE on audit_event was not blocked';
    END IF;

    -- -------------------------------------------------------------------------
    -- 7. ON DELETE RESTRICT on Doctor and User Account
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        DELETE FROM catms.employee WHERE employee_id = v_doc_emp_id;
    EXCEPTION
        WHEN foreign_key_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: hard-delete of employee with doctor_profile was not blocked by RESTRICT';
    END IF;

    RAISE NOTICE '✅ 022_doctor_auth_rbac_rules: All business rule assertions passed.';
END;
$$;

ROLLBACK;
