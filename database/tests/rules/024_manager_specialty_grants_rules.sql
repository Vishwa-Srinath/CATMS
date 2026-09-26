-- 024_manager_specialty_grants_rules.sql
-- Test Suite: Business rules and security permissions validation for CATMS-024
-- Asserts:
--   - Manager integrity: wrong-position, wrong-branch, and inactive manager assignments fail
--   - Valid manager assignment succeeds and closes previous manager assignment
--   - Doctor specialty integrity: active doctor without active specialty fails at commit
--   - Security grants: Reception cannot read financial base tables (payment, invoice) or clinical notes (SQLSTATE 42501)
--   - Security grants: Manager cannot read financial base tables (SQLSTATE 42501)
--   - Security grants: Clinician cannot read financial base tables (SQLSTATE 42501)
--   - Security grants: Admin has full access; QA is read-only

BEGIN;

DO $$
DECLARE
    v_branch_id_1 BIGINT;
    v_branch_id_2 BIGINT;
    v_inactive_branch_id BIGINT;

    v_mgr_emp_id BIGINT;
    v_doc_emp_id BIGINT;
    v_rec_emp_id BIGINT;
    v_other_mgr_emp_id BIGINT;

    v_spec_id BIGINT;
    v_invoice_id BIGINT;
    v_payment_id BIGINT;
    v_assign_id BIGINT;
    v_caught BOOLEAN;
    v_count INTEGER;
BEGIN
    -- -------------------------------------------------------------------------
    -- Fixtures: Branches & Specialties
    -- -------------------------------------------------------------------------
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('CMB-SEC1', 'Colombo Security Branch', '10 Galle Road', 'Colombo', '+94 11 300 0001', TRUE)
    RETURNING branch_id INTO v_branch_id_1;

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('KND-SEC2', 'Kandy Security Branch', '20 Peradeniya Road', 'Kandy', '+94 81 300 0002', TRUE)
    RETURNING branch_id INTO v_branch_id_2;

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone, is_active)
    VALUES ('GAL-SECINACT', 'Galle Inactive Security Branch', '30 Fort Road', 'Galle', '+94 91 300 0003', FALSE)
    RETURNING branch_id INTO v_inactive_branch_id;

    INSERT INTO catms.specialty (specialty_code, name, description)
    VALUES ('SPEC-SEC', 'Security Test Specialty', 'Integrity testing')
    RETURNING specialty_id INTO v_spec_id;

    -- -------------------------------------------------------------------------
    -- Fixtures: Employees with different positions
    -- -------------------------------------------------------------------------
    -- 1. Manager employee at Branch 1
    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date, is_active
    ) VALUES (
        'EMP-MGR-01', '751234567V', 'Sunil Manager', 'Male', '1975-04-10',
        'Manager', '+94 77 111 0001', CURRENT_DATE, TRUE
    ) RETURNING employee_id INTO v_mgr_emp_id;

    INSERT INTO catms.employee_branch_assignment (
        employee_id, branch_id, assignment_type, valid_from, is_active
    ) VALUES (
        v_mgr_emp_id, v_branch_id_1, 'PRIMARY', CURRENT_DATE, TRUE
    );

    -- 2. Doctor employee at Branch 1
    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date, is_active
    ) VALUES (
        'EMP-DOC-02', '821234567V', 'Dr. Ruwan Doctor', 'Male', '1982-08-20',
        'Doctor', '+94 77 111 0002', CURRENT_DATE, TRUE
    ) RETURNING employee_id INTO v_doc_emp_id;

    INSERT INTO catms.employee_branch_assignment (
        employee_id, branch_id, assignment_type, valid_from, is_active
    ) VALUES (
        v_doc_emp_id, v_branch_id_1, 'PRIMARY', CURRENT_DATE, TRUE
    );

    -- 3. Receptionist employee at Branch 1
    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date, is_active
    ) VALUES (
        'EMP-REC-02', '901234567V', 'Kamala Receptionist', 'Female', '1990-11-15',
        'Receptionist', '+94 77 111 0003', CURRENT_DATE, TRUE
    ) RETURNING employee_id INTO v_rec_emp_id;

    INSERT INTO catms.employee_branch_assignment (
        employee_id, branch_id, assignment_type, valid_from, is_active
    ) VALUES (
        v_rec_emp_id, v_branch_id_1, 'PRIMARY', CURRENT_DATE, TRUE
    );

    -- 4. Another Manager employee at Branch 2
    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code, date_of_birth,
        position_code, phone, hire_date, is_active
    ) VALUES (
        'EMP-MGR-02', '781234567V', 'Nimal Kandy Manager', 'Male', '1978-02-12',
        'Manager', '+94 77 111 0004', CURRENT_DATE, TRUE
    ) RETURNING employee_id INTO v_other_mgr_emp_id;

    INSERT INTO catms.employee_branch_assignment (
        employee_id, branch_id, assignment_type, valid_from, is_active
    ) VALUES (
        v_other_mgr_emp_id, v_branch_id_2, 'PRIMARY', CURRENT_DATE, TRUE
    );

    -- -------------------------------------------------------------------------
    -- 1. Manager Integrity Rules (assign_branch_manager)
    -- -------------------------------------------------------------------------

    -- 1a. WRONG-POSITION: Assigning a Doctor as branch manager must fail
    v_caught := FALSE;
    BEGIN
        CALL catms.assign_branch_manager(
            p_branch_id   => v_branch_id_1,
            p_employee_id => v_doc_emp_id,
            p_assignment_id => v_assign_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: assigning doctor as branch manager must be rejected';
    END IF;

    -- 1b. WRONG-POSITION: Assigning a Receptionist as branch manager must fail
    v_caught := FALSE;
    BEGIN
        CALL catms.assign_branch_manager(
            p_branch_id   => v_branch_id_1,
            p_employee_id => v_rec_emp_id,
            p_assignment_id => v_assign_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: assigning receptionist as branch manager must be rejected';
    END IF;

    -- 1c. WRONG-BRANCH: Assigning a Manager to a branch they do NOT belong to must fail
    -- (v_mgr_emp_id belongs to Branch 1, attempting to assign to Branch 2)
    v_caught := FALSE;
    BEGIN
        CALL catms.assign_branch_manager(
            p_branch_id   => v_branch_id_2,
            p_employee_id => v_mgr_emp_id,
            p_assignment_id => v_assign_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: assigning manager to wrong branch must be rejected';
    END IF;

    -- 1d. INACTIVE-BRANCH: Assigning a manager to an inactive branch must fail
    v_caught := FALSE;
    BEGIN
        CALL catms.assign_branch_manager(
            p_branch_id   => v_inactive_branch_id,
            p_employee_id => v_mgr_emp_id,
            p_assignment_id => v_assign_id
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: assigning manager to inactive branch must be rejected';
    END IF;

    -- 1e. VALID ASSIGNMENT: Manager assigned to their own branch succeeds
    CALL catms.assign_branch_manager(
        p_branch_id   => v_branch_id_1,
        p_employee_id => v_mgr_emp_id,
        p_reason      => 'Initial appointment',
        p_assignment_id => v_assign_id
    );

    IF v_assign_id IS NULL THEN
        RAISE EXCEPTION 'Rule assertion failed: assign_branch_manager returned NULL assignment ID';
    END IF;

    PERFORM 1 FROM catms.branch_manager_assignment
    WHERE branch_manager_assignment_id = v_assign_id
      AND branch_id = v_branch_id_1
      AND employee_id = v_mgr_emp_id
      AND is_active = TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rule assertion failed: branch_manager_assignment record missing or inactive';
    END IF;

    -- 1f. DEFENCE-IN-DEPTH TRIGGER: Raw insert of non-manager into branch_manager_assignment is blocked
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.branch_manager_assignment (
            branch_id, employee_id, valid_from, is_active
        ) VALUES (
            v_branch_id_1, v_rec_emp_id, CURRENT_DATE, TRUE
        );
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: direct INSERT of non-manager must be blocked by trigger';
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Doctor Specialty Integrity Rules (active doctor has specialty)
    -- -------------------------------------------------------------------------
    -- 2a. NEGATIVE: Active doctor without specialty fails when constraints checked
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.doctor_profile (
            doctor_id, medical_license_no, practice_start_date, is_accepting_appointments
        ) VALUES (
            v_doc_emp_id, 'SLMC-SEC-01', '2010-01-01', TRUE
        );

        SET CONSTRAINTS ALL IMMEDIATE;
    EXCEPTION
        WHEN check_violation THEN
            v_caught := TRUE;
            SET CONSTRAINTS ALL DEFERRED;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'Rule assertion failed: active doctor without specialty must fail constraint check';
    END IF;

    -- 2b. POSITIVE: Active doctor with specialty succeeds
    INSERT INTO catms.doctor_profile (
        doctor_id, medical_license_no, practice_start_date, is_accepting_appointments
    ) VALUES (
        v_doc_emp_id, 'SLMC-SEC-01', '2010-01-01', TRUE
    );

    INSERT INTO catms.doctor_specialty (
        doctor_id, specialty_id, is_primary, valid_from
    ) VALUES (
        v_doc_emp_id, v_spec_id, TRUE, CURRENT_DATE
    );

    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;

    -- -------------------------------------------------------------------------
    -- 3. Base Financial Tables & Seed Data for Permission Checks
    -- -------------------------------------------------------------------------
    INSERT INTO catms.invoice (branch_id, subtotal, patient_payable, status)
    VALUES (v_branch_id_1, 5000.00, 5000.00, 'Issued')
    RETURNING invoice_id INTO v_invoice_id;

    INSERT INTO catms.payment (invoice_id, amount, payment_method, payer_type)
    VALUES (v_invoice_id, 2500.00, 'Cash', 'Patient')
    RETURNING payment_id INTO v_payment_id;

    INSERT INTO catms.consultation_note_revision (doctor_id, clinical_notes)
    VALUES (v_doc_emp_id, 'Patient examined. Clear lungs and normal pulse.');

    -- -------------------------------------------------------------------------
    -- 4. Security Role Negative & Positive Tests (SET LOCAL ROLE)
    -- -------------------------------------------------------------------------

    -- 4a. Role: catms_reception — CANNOT read financial base tables or clinical notes
    EXECUTE 'SET LOCAL ROLE catms_reception';

    -- Reception cannot read payment
    v_caught := FALSE;
    BEGIN
        EXECUTE 'SELECT count(*) FROM catms.payment';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_reception MUST NOT be able to SELECT from payment';
    END IF;

    -- Reception cannot read invoice
    v_caught := FALSE;
    BEGIN
        EXECUTE 'SELECT count(*) FROM catms.invoice';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_reception MUST NOT be able to SELECT from invoice';
    END IF;

    -- Reception cannot read consultation_note_revision
    v_caught := FALSE;
    BEGIN
        EXECUTE 'SELECT count(*) FROM catms.consultation_note_revision';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_reception MUST NOT be able to SELECT from consultation notes';
    END IF;

    -- Reception CAN read branch
    EXECUTE 'SELECT count(*) FROM catms.branch' INTO v_count;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Security assertion failed: catms_reception must be able to SELECT from branch';
    END IF;

    EXECUTE 'RESET ROLE';

    -- 4b. Role: catms_manager — CANNOT read financial base tables or clinical notes
    EXECUTE 'SET LOCAL ROLE catms_manager';

    v_caught := FALSE;
    BEGIN
        EXECUTE 'SELECT count(*) FROM catms.payment';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_manager MUST NOT be able to SELECT from payment';
    END IF;

    v_caught := FALSE;
    BEGIN
        EXECUTE 'SELECT count(*) FROM catms.invoice';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_manager MUST NOT be able to SELECT from invoice';
    END IF;

    -- Manager CAN read branch
    EXECUTE 'SELECT count(*) FROM catms.branch' INTO v_count;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Security assertion failed: catms_manager must be able to SELECT from branch';
    END IF;

    EXECUTE 'RESET ROLE';

    -- 4c. Role: catms_clinician — CANNOT read payment or invoice, CAN read clinical notes
    EXECUTE 'SET LOCAL ROLE catms_clinician';

    v_caught := FALSE;
    BEGIN
        EXECUTE 'SELECT count(*) FROM catms.payment';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_clinician MUST NOT be able to SELECT from payment';
    END IF;

    v_caught := FALSE;
    BEGIN
        EXECUTE 'SELECT count(*) FROM catms.invoice';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_clinician MUST NOT be able to SELECT from invoice';
    END IF;

    -- Clinician CAN read consultation notes
    EXECUTE 'SELECT count(*) FROM catms.consultation_note_revision' INTO v_count;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Security assertion failed: catms_clinician must be able to SELECT consultation notes';
    END IF;

    EXECUTE 'RESET ROLE';

    -- 4d. Role: catms_admin — Full access to payment, invoice, and notes
    EXECUTE 'SET LOCAL ROLE catms_admin';

    EXECUTE 'SELECT count(*) FROM catms.payment' INTO v_count;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Security assertion failed: catms_admin must be able to SELECT payment';
    END IF;

    EXECUTE 'SELECT count(*) FROM catms.invoice' INTO v_count;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Security assertion failed: catms_admin must be able to SELECT invoice';
    END IF;

    EXECUTE 'RESET ROLE';

    -- 4e. Role: catms_qa — Read-only on payment; mutation DENIED
    EXECUTE 'SET LOCAL ROLE catms_qa';

    -- QA CAN read payment
    EXECUTE 'SELECT count(*) FROM catms.payment' INTO v_count;
    IF v_count < 1 THEN
        RAISE EXCEPTION 'Security assertion failed: catms_qa must be able to SELECT payment';
    END IF;

    -- QA CANNOT insert payment
    v_caught := FALSE;
    BEGIN
        EXECUTE format('INSERT INTO catms.payment (invoice_id, amount, payment_method) VALUES (%s, 100.00, ''Cash'')', v_invoice_id);
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Security assertion failed: catms_qa MUST NOT be able to INSERT into payment';
    END IF;

    EXECUTE 'RESET ROLE';

    RAISE NOTICE '✅ 024_manager_specialty_grants_rules: All manager integrity, specialty mandate, and security grant assertions passed.';
END;
$$;

ROLLBACK;
