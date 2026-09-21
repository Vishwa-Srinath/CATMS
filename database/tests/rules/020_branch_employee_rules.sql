-- 020_branch_employee_rules.sql
-- Test Suite: Business rules, constraints, uniqueness, and deletion policy for CATMS-015
-- Asserts valid insertions succeed, duplicates are rejected, checks enforce domain validity,
-- and ON DELETE RESTRICT blocks hard-deletion of referenced entities.

BEGIN;

DO $$
DECLARE
    v_branch_id BIGINT;
    v_employee_id BIGINT;
    v_caught BOOLEAN;
BEGIN
    -- -------------------------------------------------------------------------
    -- 1. Valid Branch Insertion
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch (
        branch_code, name, address_line_1, city, district, postal_code, contact_phone
    ) VALUES (
        'CMB-TEST', 'Colombo Test Branch', '123 Galle Road', 'Colombo', 'Colombo', '00300', '+94 11 200 0001'
    ) RETURNING branch_id INTO v_branch_id;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: valid branch insert failed to return branch_id';
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Duplicate Branch Code Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.branch (
            branch_code, name, address_line_1, city, contact_phone
        ) VALUES (
            'cmb-test', 'Duplicate Code Branch', '456 Road', 'Colombo', '+94 11 200 0002'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate branch_code was not rejected with unique_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. Duplicate Branch Name Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.branch (
            branch_code, name, address_line_1, city, contact_phone
        ) VALUES (
            'CMB-DIFF', 'Colombo Test Branch', '789 Road', 'Colombo', '+94 11 200 0003'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate branch name was not rejected with unique_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 4. Valid Employee Insertion
    -- -------------------------------------------------------------------------
    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, email, hire_date, employment_status
    ) VALUES (
        'EMP-TEST-001', '886521430V', 'Dr. Test Clinician', 'Female', '1988-04-12',
        'Doctor', '077 123 4567', 'test.doctor@medsync.lk', '2022-01-15', 'Active'
    ) RETURNING employee_id INTO v_employee_id;

    IF v_employee_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: valid employee insert failed to return employee_id';
    END IF;

    -- -------------------------------------------------------------------------
    -- 5. Duplicate Employee Number Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee (
            employee_number, nic, full_name, gender_code, date_of_birth,
            position_code, phone, hire_date
        ) VALUES (
            'emp-test-001', '901234567V', 'Another Employee', 'Male', '1990-05-20',
            'Nurse', '077 999 8888', '2023-01-01'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate employee_number was not rejected with unique_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 6. Duplicate Employee NIC Rejected (Case-Insensitive)
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee (
            employee_number, nic, full_name, gender_code, date_of_birth,
            position_code, phone, hire_date
        ) VALUES (
            'EMP-TEST-002', '886521430v', 'Another Employee with same NIC', 'Male', '1990-05-20',
            'Nurse', '077 999 8888', '2023-01-01'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: duplicate employee NIC was not rejected with unique_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 7. Check Constraint: Invalid Gender Code Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee (
            employee_number, nic, full_name, gender_code, date_of_birth,
            position_code, phone, hire_date
        ) VALUES (
            'EMP-TEST-003', '912345678V', 'Invalid Gender Staff', 'Alien', '1991-06-15',
            'Receptionist', '077 111 2222', '2023-02-01'
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: invalid gender_code was not rejected with check_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 8. Check Constraint: Future Date of Birth Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee (
            employee_number, nic, full_name, gender_code, date_of_birth,
            position_code, phone, hire_date
        ) VALUES (
            'EMP-TEST-004', '922345678V', 'Future Born Staff', 'Female', CURRENT_DATE + INTERVAL '1 day',
            'Receptionist', '077 111 3333', '2023-02-01'
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: future date_of_birth was not rejected with check_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 9. Check Constraint: Invalid Position Code Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee (
            employee_number, nic, full_name, gender_code, date_of_birth,
            position_code, phone, hire_date
        ) VALUES (
            'EMP-TEST-005', '932345678V', 'Unknown Role Staff', 'Female', '1993-07-20',
            'Superhero', '077 111 4444', '2023-02-01'
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: invalid position_code was not rejected with check_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 10. Check Constraint: Invalid Employment Status Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee (
            employee_number, nic, full_name, gender_code, date_of_birth,
            position_code, phone, hire_date, employment_status
        ) VALUES (
            'EMP-TEST-006', '942345678V', 'Bad Status Staff', 'Male', '1994-08-25',
            'Admin', '077 111 5555', '2023-02-01', 'OnVacation'
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: invalid employment_status was not rejected with check_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 11. Check Constraint: Terminated At Before Hire Date Rejected
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee (
            employee_number, nic, full_name, gender_code, date_of_birth,
            position_code, phone, hire_date, employment_status, terminated_at
        ) VALUES (
            'EMP-TEST-007', '952345678V', 'Time Traveler Staff', 'Male', '1995-09-30',
            'Admin', '077 111 6666', '2023-05-01', 'Terminated', '2023-04-01'
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: terminated_at < hire_date was not rejected with check_violation';
    END IF;

    -- -------------------------------------------------------------------------
    -- 12. Deletion Policy: Historical References Protected with ON DELETE RESTRICT
    -- -------------------------------------------------------------------------
    -- Create temporary dependent table simulating historical records
    CREATE TEMP TABLE test_dependent_record (
        record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        employee_id BIGINT NOT NULL REFERENCES catms.employee(employee_id) ON DELETE RESTRICT
    ) ON COMMIT DROP;

    INSERT INTO test_dependent_record (employee_id) VALUES (v_employee_id);

    -- Attempting physical hard deletion must fail with foreign_key_violation
    v_caught := FALSE;
    BEGIN
        DELETE FROM catms.employee WHERE employee_id = v_employee_id;
    EXCEPTION
        WHEN foreign_key_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: hard-delete of referenced employee was not blocked with foreign_key_violation';
    END IF;

    -- Soft deactivation must succeed
    UPDATE catms.employee
    SET is_active = FALSE, employment_status = 'Inactive'
    WHERE employee_id = v_employee_id;

    PERFORM 1 FROM catms.employee WHERE employee_id = v_employee_id AND is_active = FALSE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: soft-deactivation failed to update employee record';
    END IF;

    RAISE NOTICE '✅ 020_branch_employee_rules: All business rule assertions passed.';
END;
$$;

ROLLBACK;
