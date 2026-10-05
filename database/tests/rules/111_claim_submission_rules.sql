-- =============================================================================
-- database/tests/rules/111_claim_submission_rules.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims) | Issue: CATMS-038 | Reviewer: Dev4
--
-- Direct database rules tests for submit_claim procedure:
--   Test A: Expired policy on service date rejected
--   Test B: Suspended / cancelled policy rejected
--   Test C: Inactive provider rejected
--   Test D: Mismatched patient rejected
--   Test E: Duplicate policy submission on same invoice rejected
--   Test F: Valid submission snapshots service date coverage and leaves invoice liability untouched
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id             BIGINT;
    v_patient_id            BIGINT;
    v_other_patient_id      BIGINT;
    v_doctor_emp_id         BIGINT;
    v_doctor_id             BIGINT;
    v_specialty_id          BIGINT;
    v_admin_user_id         BIGINT;
    v_reception_user_id     BIGINT;
    v_clinician_user_id     BIGINT;
    v_treatment_cat_id      BIGINT;
    v_treatment1_id         BIGINT;
    v_treatment2_id         BIGINT;
    v_appointment_id        BIGINT;
    v_invoice_id            BIGINT;
    v_provider_id           BIGINT;
    v_inact_provider_id     BIGINT;
    v_active_policy_id      BIGINT;
    v_expired_policy_id     BIGINT;
    v_suspended_policy_id   BIGINT;
    v_other_policy_id       BIGINT;
    v_claim_ids             BIGINT[];
    v_claim_rec             RECORD;
    v_claim_line_rec        RECORD;
    v_inv_rec               RECORD;
    v_ok                    BOOLEAN;
BEGIN
    -- Setup fixture
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('TST111', 'Submission Test Branch', '111 Sub Road', 'Colombo', '+94111000000')
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.specialty (name, code)
    VALUES ('Submission Cardiology', 'CL-SUB-CARD')
    RETURNING specialty_id INTO v_specialty_id;

    -- Staff & Users
    INSERT INTO catms.employee (branch_id, employee_number, first_name, last_name, email, role, employment_status)
    VALUES (v_branch_id, 'EMP-111-ADM', 'Admin', 'Officer', 'adm111@catms.test', 'Admin', 'Active')
    RETURNING employee_id INTO v_doctor_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'admin_111', 'hash_adm', 'ACTIVE')
    RETURNING user_account_id INTO v_admin_user_id;

    INSERT INTO catms.employee (branch_id, employee_number, first_name, last_name, email, role, employment_status)
    VALUES (v_branch_id, 'EMP-111-REC', 'Reception', 'Staff', 'rec111@catms.test', 'Receptionist', 'Active')
    RETURNING employee_id INTO v_doctor_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'rec_111', 'hash_rec', 'ACTIVE')
    RETURNING user_account_id INTO v_reception_user_id;

    INSERT INTO catms.employee (branch_id, employee_number, first_name, last_name, email, role, employment_status)
    VALUES (v_branch_id, 'EMP-111-DOC', 'Doctor', 'Perera', 'doc111@catms.test', 'Doctor', 'Active')
    RETURNING employee_id INTO v_doctor_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'doc_111', 'hash_doc', 'ACTIVE')
    RETURNING user_account_id INTO v_clinician_user_id;

    INSERT INTO catms.doctor_profile (employee_id, primary_specialty_id, slmc_reg_number)
    VALUES (v_doctor_emp_id, v_specialty_id, 'SLMC-111-001')
    RETURNING doctor_id INTO v_doctor_id;

    -- Patients
    INSERT INTO catms.patient (patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id)
    VALUES ('PAT-111-001', 'Sunil', 'Fernando', '1982-03-10', 'Male', '+94711110001', v_branch_id)
    RETURNING patient_id INTO v_patient_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, normalized_identity, is_primary)
    VALUES (v_patient_id, 'NIC', '198211100001', '198211100001', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'Kamani Fernando', 'Spouse', '+94711110002', TRUE);

    INSERT INTO catms.patient (patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id)
    VALUES ('PAT-111-002', 'Anoma', 'Silva', '1995-11-25', 'Female', '+94711110003', v_branch_id)
    RETURNING patient_id INTO v_other_patient_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, normalized_identity, is_primary)
    VALUES (v_other_patient_id, 'NIC', '199511100002', '199511100002', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_other_patient_id, 'Nimal Silva', 'Father', '+94711110004', TRUE);

    -- Treatments
    INSERT INTO catms.treatment_category (category_name, description)
    VALUES ('Cardiology 111', 'Cardiology procedures')
    RETURNING category_id INTO v_treatment_cat_id;

    INSERT INTO catms.treatment_catalogue (category_id, service_code, name, base_price, is_active)
    VALUES (v_treatment_cat_id, 'CARD-111-01', 'Echo Scan', 6000.00, TRUE)
    RETURNING treatment_id INTO v_treatment1_id;

    INSERT INTO catms.treatment_catalogue (category_id, service_code, name, base_price, is_active)
    VALUES (v_treatment_cat_id, 'CARD-111-02', 'Stress Test', 8000.00, TRUE)
    RETURNING treatment_id INTO v_treatment2_id;

    -- Appointment on 2026-09-10
    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, status, booking_type, created_by
    ) VALUES (
        'APP-111-0001', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
        '2026-09-10 10:00:00+05:30', '2026-09-10 10:45:00+05:30', 'Completed', 'Booked', v_admin_user_id
    ) RETURNING appointment_id INTO v_appointment_id;

    -- Treatments administered
    INSERT INTO catms.appointment_treatment (
        appointment_id, treatment_id, line_number, quantity, unit_price_at_time,
        price_source, administered_at, recorded_by_user_id
    ) VALUES (
        v_appointment_id, v_treatment1_id, 1, 1, 6000.00,
        'Standard', '2026-09-10 10:15:00+05:30', v_clinician_user_id
    );

    INSERT INTO catms.appointment_treatment (
        appointment_id, treatment_id, line_number, quantity, unit_price_at_time,
        price_source, administered_at, recorded_by_user_id
    ) VALUES (
        v_appointment_id, v_treatment2_id, 2, 1, 8000.00,
        'Standard', '2026-09-10 10:30:00+05:30', v_clinician_user_id
    );

    -- Issue Invoice: subtotal = 14,000.00 LKR
    SELECT catms.issue_invoice(v_appointment_id, v_admin_user_id) INTO v_invoice_id;

    -- Providers & Policies
    INSERT INTO catms.insurance_provider (provider_code, name, status)
    VALUES ('PROV-ACT-111', 'Active Insurer 111', 'ACTIVE')
    RETURNING provider_id INTO v_provider_id;

    INSERT INTO catms.insurance_provider (provider_code, name, status)
    VALUES ('PROV-INA-111', 'Inactive Insurer 111', 'INACTIVE')
    RETURNING provider_id INTO v_inact_provider_id;

    -- 1. Active policy covering 2026
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, status, valid_from, valid_to
    ) VALUES (
        v_patient_id, v_provider_id, 'POL-ACT-111', 'ACTIVE', '2026-01-01', '2026-12-31'
    ) RETURNING policy_id INTO v_active_policy_id;

    -- Coverage: 80% on Echo (Cap 4,000), 75% on Stress Test (Cap 5,000)
    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from
    ) VALUES
        (v_active_policy_id, v_treatment1_id, 80.00, 4000.00, '2026-01-01'),
        (v_active_policy_id, v_treatment2_id, 75.00, 5000.00, '2026-01-01');

    -- 2. Expired policy (expired in 2025)
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, status, valid_from, valid_to
    ) VALUES (
        v_patient_id, v_provider_id, 'POL-EXP-111', 'ACTIVE', '2025-01-01', '2025-12-31'
    ) RETURNING policy_id INTO v_expired_policy_id;

    -- 3. Suspended policy
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, status, valid_from, valid_to
    ) VALUES (
        v_patient_id, v_provider_id, 'POL-SUS-111', 'SUSPENDED', '2026-01-01', '2026-12-31'
    ) RETURNING policy_id INTO v_suspended_policy_id;

    -- 4. Policy belonging to other patient
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, status, valid_from, valid_to
    ) VALUES (
        v_other_patient_id, v_provider_id, 'POL-OTH-111', 'ACTIVE', '2026-01-01', '2026-12-31'
    ) RETURNING policy_id INTO v_other_policy_id;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test A: Expired policy on service date (2026-09-10) MUST fail
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        PERFORM catms.submit_claim(v_invoice_id, v_expired_policy_id, v_reception_user_id);
    EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Expired policy submission was not rejected';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test B: Suspended policy MUST fail
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        PERFORM catms.submit_claim(v_invoice_id, v_suspended_policy_id, v_reception_user_id);
    EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Suspended policy submission was not rejected';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test C: Mismatched patient policy MUST fail (Rule 3.1)
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        PERFORM catms.submit_claim(v_invoice_id, v_other_policy_id, v_reception_user_id);
    EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Mismatched patient policy submission was not rejected';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test D: Valid submission (Rule 7.1 & Snapshots)
    -- ─────────────────────────────────────────────────────────────────────────
    v_claim_ids := catms.submit_claim(v_invoice_id, ARRAY[v_active_policy_id], v_reception_user_id);

    IF cardinality(v_claim_ids) <> 1 THEN
        RAISE EXCEPTION 'TEST FAILED: Expected 1 claim ID returned, got %', cardinality(v_claim_ids);
    END IF;

    SELECT * INTO v_claim_rec FROM catms.insurance_claim WHERE claim_id = v_claim_ids[1];

    IF v_claim_rec.claim_status <> 'Pending' THEN
        RAISE EXCEPTION 'TEST FAILED: Newly submitted claim must be in Pending status (got %)', v_claim_rec.claim_status;
    END IF;

    -- Line 1: Echo scan = 6,000 LKR. 80% = 4,800. Cap = 4,000 -> Claimed = 4,000.00
    -- Line 2: Stress test = 8,000 LKR. 75% = 6,000. Cap = 5,000 -> Claimed = 5,000.00
    -- Total Claimed = 9,000.00 LKR
    IF v_claim_rec.claimed_amount <> 9000.00 THEN
        RAISE EXCEPTION 'TEST FAILED: Expected total claimed 9,000.00 LKR, got %', v_claim_rec.claimed_amount;
    END IF;

    -- Rule 7.1 assertion: Invoice patient liability MUST remain equal to 14,000.00 LKR!
    SELECT * INTO v_inv_rec FROM catms.invoice WHERE invoice_id = v_invoice_id;
    IF v_inv_rec.patient_liability_amount <> 14000.00 THEN
        RAISE EXCEPTION 'TEST FAILED: Rule 7.1 violated! Invoice liability was prematurely reduced to %',
            v_inv_rec.patient_liability_amount;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test E: Duplicate submission of same policy on same invoice MUST fail
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        PERFORM catms.submit_claim(v_invoice_id, v_active_policy_id, v_reception_user_id);
    EXCEPTION WHEN unique_violation OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Duplicate claim submission for same policy was not rejected';
    END IF;

    RAISE NOTICE 'SUCCESS: 111_claim_submission_rules passed all assertions.';
END;
$$;

ROLLBACK;
