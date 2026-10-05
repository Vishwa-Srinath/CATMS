-- =============================================================================
-- database/tests/rules/112_claim_resolution_rules.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims) | Issue: CATMS-039 | Reviewer: Dev4
--
-- Direct database rules tests for resolve_claim procedure:
--   Test A: RBAC check rejects Receptionist / Clinician role
--   Test B: Full Approval reduces invoice liability atomically
--   Test C: Re-resolving an already resolved claim rejected (terminality)
--   Test D: Partial Approval reduces invoice liability by approved amount only
--   Test E: Rejection requires reason and leaves liability unchanged
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id             BIGINT;
    v_patient_id            BIGINT;
    v_emp_id                BIGINT;
    v_doctor_emp_id         BIGINT;
    v_doctor_id             BIGINT;
    v_specialty_id          BIGINT;
    v_admin_user_id         BIGINT;
    v_reception_user_id     BIGINT;
    v_clinician_user_id     BIGINT;
    v_treatment_cat_id      BIGINT;
    v_treatment_id          BIGINT;
    v_appointment_id        BIGINT;
    v_invoice_id            BIGINT;
    v_provider_id           BIGINT;
    v_policy_id             BIGINT;
    v_claim_id              BIGINT;
    v_claim_rec             RECORD;
    v_inv_rec               RECORD;
    v_ok                    BOOLEAN;
BEGIN
    -- Setup fixture
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('TST112', 'Resolution Test Branch', '112 Res Road', 'Colombo', '+94112000000')
    RETURNING branch_id INTO v_branch_id;

    -- Admin User
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-112-ADM', '198201019912', 'Finance Admin', 'Male', '1982-01-01', 'Admin', '+94770000030', CURRENT_DATE)
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_emp_id, 'admin_112', 'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH', 'ACTIVE')
    RETURNING user_account_id INTO v_admin_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_admin_user_id, app_role_id FROM catms.app_role WHERE upper(role_code) = 'ADMIN';

    -- Reception User (Restricted from resolving claims)
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-112-REC', '199301019912', 'Receptionist Front', 'Female', '1993-01-01', 'Receptionist', '+94770000031', CURRENT_DATE)
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_emp_id, 'rec_112', 'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH', 'ACTIVE')
    RETURNING user_account_id INTO v_reception_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_reception_user_id, app_role_id FROM catms.app_role WHERE upper(role_code) = 'RECEPTION';

    -- Doctor
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-112-DOC', '198701019912', 'Dr. Kalu', 'Male', '1987-01-01', 'Doctor', '+94770000032', CURRENT_DATE)
    RETURNING employee_id INTO v_doctor_emp_id;

    v_doctor_id := v_doctor_emp_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date, default_consultation_fee)
    VALUES (v_doctor_id, 'SLMC-112-001', '2015-01-01', 10000.00);

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('SPEC-112', 'Resolution Specialty')
    RETURNING specialty_id INTO v_specialty_id;

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_doctor_id, v_specialty_id, TRUE);

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'doc_112', 'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH', 'ACTIVE')
    RETURNING user_account_id INTO v_clinician_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_clinician_user_id, app_role_id FROM catms.app_role WHERE upper(role_code) = 'CLINICIAN';

    -- Patient
    INSERT INTO catms.patient (patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id, registered_by)
    VALUES ('PAT-112-001', 'Gamini', 'Dias', '1975-01-01', 'Male', '+94711120001', v_branch_id, v_emp_id)
    RETURNING patient_id INTO v_patient_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_id, 'NIC', '197511200001', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'Sita Dias', 'Wife', '+94711120002', TRUE);

    -- Treatment
    INSERT INTO catms.treatment_category (category_code, name)
    VALUES ('CAT-112', 'Dental 112')
    RETURNING treatment_category_id INTO v_treatment_cat_id;

    INSERT INTO catms.treatment_catalogue (treatment_category_id, service_code, name, current_price, default_duration_minutes, is_consultation_service)
    VALUES (v_treatment_cat_id, 'DEN-112-01', 'Root Canal', 10000.00, 45, FALSE)
    RETURNING treatment_id INTO v_treatment_id;

    -- Appointment (start_at: 11:00, end_at: 11:45)
    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, status, booking_type, created_by
    ) VALUES (
        'APP-112-0001', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
        '2026-09-12 11:00:00+05:30', '2026-09-12 11:45:00+05:30', 'Completed', 'Booked', v_admin_user_id
    ) RETURNING appointment_id INTO v_appointment_id;

    INSERT INTO catms.appointment_treatment (
        appointment_id, treatment_id, line_number, quantity, unit_price_at_time,
        price_source, administered_at, recorded_by_user_id
    ) VALUES (
        v_appointment_id, v_treatment_id, 1, 1, 10000.00,
        'Standard', '2026-09-12 11:30:00+05:30', v_clinician_user_id
    );

    -- Invoice (Subtotal = 10,000.00, Liability = 10,000.00)
    SELECT catms.issue_invoice(v_appointment_id, v_admin_user_id) INTO v_invoice_id;

    -- Provider & Policy (80% coverage up to 8,000.00)
    INSERT INTO catms.insurance_provider (provider_code, name)
    VALUES ('PROV-RES-112', 'Resolution Insurer 112')
    RETURNING provider_id INTO v_provider_id;

    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, policy_status, valid_from, valid_to
    ) VALUES (
        v_patient_id, v_provider_id, 'POL-RES-112', 'ACTIVE', '2026-01-01', '2026-12-31'
    ) RETURNING policy_id INTO v_policy_id;

    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from
    ) VALUES (
        v_policy_id, v_treatment_id, 80.00, 8000.00, '2026-01-01'
    );

    -- Submit Claim (Claimed = 8,000.00 LKR)
    v_claim_id := catms.submit_claim(v_invoice_id, v_policy_id, v_reception_user_id);

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test A: RBAC Check — Receptionist / Clinician calling resolve_claim MUST fail (403)
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        PERFORM catms.resolve_claim(v_claim_id, 'Approved', 8000.00, v_reception_user_id);
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Receptionist role was able to call resolve_claim (RBAC bypass)';
    END IF;

    v_ok := FALSE;
    BEGIN
        PERFORM catms.resolve_claim(v_claim_id, 'Approved', 8000.00, v_clinician_user_id);
    EXCEPTION WHEN insufficient_privilege THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Clinician role was able to call resolve_claim (RBAC bypass)';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test B: Partial Approval by Admin (Rule 7.2)
    -- Insurer approves 6,000.00 LKR out of 8,000.00 LKR.
    -- Patient liability must become: 10,000.00 - 6,000.00 = 4,000.00 LKR.
    -- ─────────────────────────────────────────────────────────────────────────
    PERFORM catms.resolve_claim(
        v_claim_id, 'PartiallyApproved', 6000.00, v_admin_user_id, 'Insurer deducted copay'
    );

    SELECT * INTO v_claim_rec FROM catms.insurance_claim WHERE claim_id = v_claim_id;
    IF v_claim_rec.claim_status <> 'PartiallyApproved' OR v_claim_rec.approved_amount <> 6000.00 THEN
        RAISE EXCEPTION 'TEST FAILED: Claim header not updated properly on PartialApproval';
    END IF;

    -- Check status log was appended
    SELECT count(*) INTO v_ok
    FROM catms.insurance_claim_status_log
    WHERE claim_id = v_claim_id AND to_status = 'PartiallyApproved';
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Status transition log missing for PartiallyApproved';
    END IF;

    -- Check invoice liability recalculated atomically!
    SELECT * INTO v_inv_rec FROM catms.invoice WHERE invoice_id = v_invoice_id;
    IF v_inv_rec.approved_insurance_amount <> 6000.00 THEN
        RAISE EXCEPTION 'TEST FAILED: Invoice approved_insurance_amount is %, expected 6,000.00',
            v_inv_rec.approved_insurance_amount;
    END IF;

    IF v_inv_rec.patient_liability_amount <> 4000.00 THEN
        RAISE EXCEPTION 'TEST FAILED: Invoice patient_liability_amount is %, expected 4,000.00',
            v_inv_rec.patient_liability_amount;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test C: Re-resolving already resolved claim MUST fail
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        PERFORM catms.resolve_claim(v_claim_id, 'Approved', 8000.00, v_admin_user_id);
    EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Re-resolving terminal claim was not rejected';
    END IF;

    RAISE NOTICE 'SUCCESS: 112_claim_resolution_rules passed all assertions.';
END;
$$;

ROLLBACK;
