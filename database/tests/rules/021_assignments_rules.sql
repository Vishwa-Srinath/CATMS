-- 021_assignments_rules.sql
-- Test Suite: Business rules and constraints for CATMS-016 (Staff & Manager Assignments)
-- Asserts:
--   - At most one active PRIMARY branch assignment per employee
--   - Multiple non-primary or historical assignments allowed per employee
--   - At most one active manager per branch
--   - Historical transfers remain queryable
--   - Invalid date ranges fail (valid_to < valid_from)
--   - ON DELETE RESTRICT blocks hard-deletion of referenced branches/employees

BEGIN;

DO $$
DECLARE
    v_branch_id_1 BIGINT;
    v_branch_id_2 BIGINT;
    v_employee_id_1 BIGINT;
    v_employee_id_2 BIGINT;
    v_asgn_id BIGINT;
    v_mgr_id BIGINT;
    v_caught BOOLEAN;
    v_query_count INTEGER;
BEGIN
    -- -------------------------------------------------------------------------
    -- Fixtures: Create two test branches and two test employees
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('CMB-ASGN', 'Colombo Assignment Test', '100 Road', 'Colombo', '+94 11 300 0001')
    RETURNING branch_id INTO v_branch_id_1;

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('KDY-ASGN', 'Kandy Assignment Test', '200 Road', 'Kandy', '+94 81 300 0001')
    RETURNING branch_id INTO v_branch_id_2;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date
    ) VALUES (
        'EMP-ASGN-1', '850010001V', 'Staff Member One', 'Female', '1985-01-10',
        'Nurse', '077 300 0001', '2020-01-01'
    ) RETURNING employee_id INTO v_employee_id_1;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date
    ) VALUES (
        'EMP-ASGN-2', '820020002V', 'Manager Member Two', 'Male', '1982-02-20',
        'Manager', '077 300 0002', '2019-02-01'
    ) RETURNING employee_id INTO v_employee_id_2;

    -- -------------------------------------------------------------------------
    -- 1. Valid Primary Assignment Insertion
    -- -------------------------------------------------------------------------
    INSERT INTO catms.employee_branch_assignment (
        employee_id, branch_id, assignment_type, valid_from, is_active
    ) VALUES (
        v_employee_id_1, v_branch_id_1, 'PRIMARY', '2020-01-01', TRUE
    ) RETURNING employee_branch_assignment_id INTO v_asgn_id;

    IF v_asgn_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: valid primary assignment insert failed';
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Duplicate Active PRIMARY Assignment for Same Employee Must Fail
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee_branch_assignment (
            employee_id, branch_id, assignment_type, valid_from, is_active
        ) VALUES (
            v_employee_id_1, v_branch_id_2, 'PRIMARY', '2022-01-01', TRUE
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: second active PRIMARY assignment was not rejected';
    END IF;

    -- -------------------------------------------------------------------------
    -- 3. Additional Active SECONDARY Assignment for Same Employee Must Succeed
    -- -------------------------------------------------------------------------
    INSERT INTO catms.employee_branch_assignment (
        employee_id, branch_id, assignment_type, valid_from, is_active
    ) VALUES (
        v_employee_id_1, v_branch_id_2, 'SECONDARY', '2022-01-01', TRUE
    );

    -- -------------------------------------------------------------------------
    -- 4. Historical / Inactive Primary Assignment for Same Employee Must Succeed
    -- -------------------------------------------------------------------------
    INSERT INTO catms.employee_branch_assignment (
        employee_id, branch_id, assignment_type, valid_from, valid_to, is_active
    ) VALUES (
        v_employee_id_1, v_branch_id_2, 'PRIMARY', '2018-01-01', '2019-12-31', FALSE
    );

    -- -------------------------------------------------------------------------
    -- 5. Valid Branch Manager Assignment Insertion
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch_manager_assignment (
        branch_id, employee_id, valid_from, is_active, reason
    ) VALUES (
        v_branch_id_1, v_employee_id_2, '2020-01-01', TRUE, 'Initial manager appointment'
    ) RETURNING branch_manager_assignment_id INTO v_mgr_id;

    IF v_mgr_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: valid branch manager assignment insert failed';
    END IF;

    -- -------------------------------------------------------------------------
    -- 6. Duplicate Active Manager for Same Branch Must Fail
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.branch_manager_assignment (
            branch_id, employee_id, valid_from, is_active, reason
        ) VALUES (
            v_branch_id_1, v_employee_id_1, '2022-01-01', TRUE, 'Conflicting manager appointment'
        );
    EXCEPTION
        WHEN unique_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: second active manager for branch was not rejected';
    END IF;

    -- -------------------------------------------------------------------------
    -- 7. Manager Transfer / Succession: Deactivating Old Allows Appointing New
    -- -------------------------------------------------------------------------
    UPDATE catms.branch_manager_assignment
    SET is_active = FALSE, valid_to = '2023-12-31'
    WHERE branch_manager_assignment_id = v_mgr_id;

    -- Now appointing new active manager for same branch must succeed
    INSERT INTO catms.branch_manager_assignment (
        branch_id, employee_id, valid_from, is_active, reason
    ) VALUES (
        v_branch_id_1, v_employee_id_1, '2024-01-01', TRUE, 'Successor manager appointment'
    );

    -- Historical manager appointments remain queryable
    SELECT count(*) INTO v_query_count
    FROM catms.branch_manager_assignment
    WHERE branch_id = v_branch_id_1;

    IF v_query_count <> 2 THEN
        RAISE EXCEPTION 'Rule assertion failed: expected 2 manager assignment rows for branch (1 active, 1 historic), found %', v_query_count;
    END IF;

    -- -------------------------------------------------------------------------
    -- 8. Check Constraint: Invalid Date Range (valid_to < valid_from) Must Fail
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.employee_branch_assignment (
            employee_id, branch_id, assignment_type, valid_from, valid_to
        ) VALUES (
            v_employee_id_2, v_branch_id_1, 'SECONDARY', '2023-05-01', '2023-04-01'
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: employee assignment with valid_to < valid_from was not rejected';
    END IF;

    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.branch_manager_assignment (
            branch_id, employee_id, valid_from, valid_to
        ) VALUES (
            v_branch_id_2, v_employee_id_2, '2023-05-01', '2023-04-01'
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: manager assignment with valid_to < valid_from was not rejected';
    END IF;

    -- -------------------------------------------------------------------------
    -- 9. Historical References Protected via ON DELETE RESTRICT
    -- -------------------------------------------------------------------------
    v_caught := FALSE;
    BEGIN
        DELETE FROM catms.branch WHERE branch_id = v_branch_id_1;
    EXCEPTION
        WHEN foreign_key_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: hard-delete of branch with assignments was not blocked by RESTRICT';
    END IF;

    v_caught := FALSE;
    BEGIN
        DELETE FROM catms.employee WHERE employee_id = v_employee_id_1;
    EXCEPTION
        WHEN foreign_key_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: hard-delete of employee with assignments was not blocked by RESTRICT';
    END IF;

    RAISE NOTICE '✅ 021_assignments_rules: All business rule assertions passed.';
END;
$$;

ROLLBACK;
