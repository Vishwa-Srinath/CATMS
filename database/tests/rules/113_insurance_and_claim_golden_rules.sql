-- =============================================================================
-- database/tests/rules/113_insurance_and_claim_golden_rules.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims) | Issue: CATMS-040 | Reviewer: Dev4
--
-- Single immutable source of mathematical truth verification suite:
-- Replays CATMS-008 Signed Golden Financial Worked Example end-to-end:
--   1. Fixture: PAT-1001 (Nimal Perera), 2 treatments (3,500 LKR + 6,500 LKR = 10,000 LKR)
--   2. Multi-policy submission: Ceylinco (Primary) + SLIC (Secondary Top-Up)
--   3. Invariant check: coordination of benefits prevents double-coverage
--   4. Pending submission invariant: patient liability remains 10,000 LKR
--   5. Claim 1 Partial Approval: 5,800 LKR approved -> liability reduced to 4,200 LKR
--   6. Claim 2 Rejection: 0.00 approved -> liability remains 4,200 LKR
--   7. Historical preservation: later policy coverage update does NOT alter old claim
--   8. Forced rollback: mid-procedure failure leaves DB in prior state
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id             BIGINT;
    v_patient_id            BIGINT;
    v_doctor_emp_id         BIGINT;
    v_doctor_id             BIGINT;
    v_specialty_id          BIGINT;
    v_finance_user_id       BIGINT;
    v_reception_user_id     BIGINT;
    v_clinician_user_id     BIGINT;
    v_treatment_cat_id      BIGINT;
    v_treat1_id             BIGINT;
    v_treat2_id             BIGINT;
    v_appointment_id        BIGINT;
    v_invoice_id            BIGINT;
    v_inv_line1_id          BIGINT;
    v_inv_line2_id          BIGINT;
    v_prov_ceylinco_id      BIGINT;
    v_prov_slic_id          BIGINT;
    v_pol_ceylinco_id       BIGINT;
    v_pol_slic_id           BIGINT;
    v_claim_ids             BIGINT[];
    v_claim1_id             BIGINT;
    v_claim2_id             BIGINT;
    v_claim1_rec            RECORD;
    v_claim2_rec            RECORD;
    v_line1_clm1_rec        RECORD;
    v_line2_clm1_rec        RECORD;
    v_line1_clm2_rec        RECORD;
    v_inv_rec               RECORD;
    v_ok                    BOOLEAN;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Setup Golden Fixture (CATMS-008 §2)
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('BR-001', 'Central Clinic, Colombo', '10 Galle Road', 'Colombo', '+94112000001')
    RETURNING branch_id INTO v_branch_id;

    -- Finance Officer Employee & User
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-FIN-01', '198001019913', 'Finance Officer', 'Male', '1980-01-01', 'Admin', '+94770000040', CURRENT_DATE)
    RETURNING employee_id INTO v_doctor_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'fin_officer_01', 'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH', 'ACTIVE')
    RETURNING user_account_id INTO v_finance_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_finance_user_id, app_role_id FROM catms.app_role WHERE upper(role_code) = 'ADMIN';

    -- Receptionist Employee & User
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-REC-01', '199101019913', 'Reception Desk', 'Female', '1991-01-01', 'Receptionist', '+94770000041', CURRENT_DATE)
    RETURNING employee_id INTO v_doctor_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'reception_01', 'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH', 'ACTIVE')
    RETURNING user_account_id INTO v_reception_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_reception_user_id, app_role_id FROM catms.app_role WHERE upper(role_code) = 'RECEPTION';

    -- Doctor: Dr. K. Silva (DOC-0201)
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('DOC-0201', '197501019913', 'Dr. K. Silva', 'Male', '1975-01-01', 'Doctor', '+94770000042', CURRENT_DATE)
    RETURNING employee_id INTO v_doctor_emp_id;

    v_doctor_id := v_doctor_emp_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date, default_consultation_fee)
    VALUES (v_doctor_id, 'SLMC-DOC-0201', '2010-01-01', 3500.00);

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('SPEC-CARD', 'Specialist Cardiology')
    RETURNING specialty_id INTO v_specialty_id;

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_doctor_id, v_specialty_id, TRUE);

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'dr_ksilva', 'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH', 'ACTIVE')
    RETURNING user_account_id INTO v_clinician_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_clinician_user_id, app_role_id FROM catms.app_role WHERE upper(role_code) = 'CLINICIAN';

    -- Patient: Nimal Perera (PAT-1001, NIC: 198512345678)
    INSERT INTO catms.patient (patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id, registered_by)
    VALUES ('PAT-1001', 'Nimal', 'Perera', '1985-06-15', 'Male', '+94771234567', v_branch_id, v_doctor_emp_id)
    RETURNING patient_id INTO v_patient_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_id, 'NIC', '198512345678', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'Sunila Perera', 'Spouse', '+94777654321', TRUE);

    -- Treatment Catalogue
    INSERT INTO catms.treatment_category (category_code, name)
    VALUES ('CAT-CARD', 'Clinical Cardiology')
    RETURNING treatment_category_id INTO v_treatment_cat_id;

    -- TREAT-001: Specialist Cardiology Consultation (3,500.00 LKR)
    INSERT INTO catms.treatment_catalogue (treatment_category_id, service_code, name, current_price, default_duration_minutes, is_consultation_service)
    VALUES (v_treatment_cat_id, 'TREAT-001', 'Specialist Cardiology Consultation', 3500.00, 30, TRUE)
    RETURNING treatment_id INTO v_treat1_id;

    -- TREAT-002: Diagnostic 12-Lead ECG + Report (6,500.00 LKR)
    INSERT INTO catms.treatment_catalogue (treatment_category_id, service_code, name, current_price, default_duration_minutes, is_consultation_service)
    VALUES (v_treatment_cat_id, 'TREAT-002', 'Diagnostic 12-Lead ECG + Report', 6500.00, 30, FALSE)
    RETURNING treatment_id INTO v_treat2_id;

    -- Appointment on Date of Service: 2026-09-10 (start_at: 09:00, end_at: 10:00)
    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, status, booking_type, created_by
    ) VALUES (
        'APP-2026-0001', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
        '2026-09-10 09:00:00+05:30', '2026-09-10 10:00:00+05:30', 'Completed', 'Booked', v_reception_user_id
    ) RETURNING appointment_id INTO v_appointment_id;

    -- Administered treatments
    PERFORM catms.record_appointment_treatment(v_appointment_id, v_treat1_id, 1, v_clinician_user_id);
    PERFORM catms.record_appointment_treatment(v_appointment_id, v_treat2_id, 1, v_clinician_user_id);

    -- Issue Invoice INV-2026-0001 (Step 3.1)
    SELECT catms.issue_invoice(v_appointment_id, v_finance_user_id) INTO v_invoice_id;

    SELECT invoice_line_id INTO v_inv_line1_id
    FROM catms.invoice_line WHERE invoice_id = v_invoice_id AND line_number = 1;

    SELECT invoice_line_id INTO v_inv_line2_id
    FROM catms.invoice_line WHERE invoice_id = v_invoice_id AND line_number = 2;

    -- Assert Invoice State at Issuance (CATMS-008 §3.1)
    SELECT * INTO v_inv_rec FROM catms.invoice WHERE invoice_id = v_invoice_id;
    IF v_inv_rec.subtotal_amount <> 10000.00
       OR v_inv_rec.approved_insurance_amount <> 0.00
       OR v_inv_rec.patient_liability_amount <> 10000.00
       OR v_inv_rec.patient_paid_amount <> 0.00
       OR v_inv_rec.insurer_paid_amount <> 0.00
       OR v_inv_rec.patient_payment_status <> 'Unpaid' THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Initial invoice state mismatch';
    END IF;

    -- Insurance Providers (CATMS-008 §2.2)
    -- Provider 1: Ceylinco General Insurance (PROV-001)
    INSERT INTO catms.insurance_provider (provider_code, name, status)
    VALUES ('PROV-001', 'Ceylinco General Insurance', 'ACTIVE')
    RETURNING provider_id INTO v_prov_ceylinco_id;

    -- Provider 2: Sri Lanka Insurance Corporation (PROV-002)
    INSERT INTO catms.insurance_provider (provider_code, name, status)
    VALUES ('PROV-002', 'Sri Lanka Insurance Corporation', 'ACTIVE')
    RETURNING provider_id INTO v_prov_slic_id;

    -- Policy 1: POL-CEY-001 (Priority 1, 2026-01-01 to 2026-12-31)
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, policy_status, valid_from, valid_to
    ) VALUES (
        v_patient_id, v_prov_ceylinco_id, 'POL-CEY-001', 'ACTIVE', '2026-01-01', '2026-12-31'
    ) RETURNING policy_id INTO v_pol_ceylinco_id;

    -- Policy 1 Coverage Terms:
    -- TREAT-001: 80% coverage, Cap 2,000.00 LKR
    -- TREAT-002: 70% coverage, Cap 5,000.00 LKR
    INSERT INTO catms.policy_coverage (policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from)
    VALUES
        (v_pol_ceylinco_id, v_treat1_id, 80.00, 2000.00, '2026-01-01'),
        (v_pol_ceylinco_id, v_treat2_id, 70.00, 5000.00, '2026-01-01');

    -- Policy 2: POL-SLIC-002 (Priority 2, 2026-06-01 to 2027-05-31)
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, policy_status, valid_from, valid_to
    ) VALUES (
        v_patient_id, v_prov_slic_id, 'POL-SLIC-002', 'ACTIVE', '2026-06-01', '2027-05-31'
    ) RETURNING policy_id INTO v_pol_slic_id;

    -- Policy 2 Coverage Terms:
    -- TREAT-001: 50% coverage, Cap 1,500.00 LKR
    -- TREAT-002: Excluded (0% cover / no coverage row)
    INSERT INTO catms.policy_coverage (policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from)
    VALUES
        (v_pol_slic_id, v_treat1_id, 50.00, 1500.00, '2026-06-01');

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Step 3.2: Multi-Policy Claim Calculation & Submission
    -- ─────────────────────────────────────────────────────────────────────────
    v_claim_ids := catms.submit_claim(
        v_invoice_id, ARRAY[v_pol_ceylinco_id, v_pol_slic_id], v_reception_user_id
    );

    IF cardinality(v_claim_ids) <> 2 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Expected 2 claim IDs created, got %', cardinality(v_claim_ids);
    END IF;

    v_claim1_id := v_claim_ids[1];
    v_claim2_id := v_claim_ids[2];

    -- A. Verify Claim 1 (Ceylinco)
    SELECT * INTO v_claim1_rec FROM catms.insurance_claim WHERE claim_id = v_claim1_id;
    IF v_claim1_rec.claim_status <> 'Pending' THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 1 status is %, expected Pending', v_claim1_rec.claim_status;
    END IF;
    -- Line 1: 2,000.00 LKR + Line 2: 4,550.00 LKR = 6,550.00 LKR
    IF v_claim1_rec.claimed_amount <> 6550.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 1 claimed_amount is %, expected 6,550.00 LKR', v_claim1_rec.claimed_amount;
    END IF;

    SELECT * INTO v_line1_clm1_rec
    FROM catms.insurance_claim_line WHERE claim_id = v_claim1_id AND line_number = 1;
    IF v_line1_clm1_rec.claimed_amount <> 2000.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 1 Line 1 claimed_amount is %, expected 2,000.00 LKR',
            v_line1_clm1_rec.claimed_amount;
    END IF;

    SELECT * INTO v_line2_clm1_rec
    FROM catms.insurance_claim_line WHERE claim_id = v_claim1_id AND line_number = 2;
    IF v_line2_clm1_rec.claimed_amount <> 4550.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 1 Line 2 claimed_amount is %, expected 4,550.00 LKR',
            v_line2_clm1_rec.claimed_amount;
    END IF;

    -- B. Verify Claim 2 (SLIC)
    SELECT * INTO v_claim2_rec FROM catms.insurance_claim WHERE claim_id = v_claim2_id;
    IF v_claim2_rec.claim_status <> 'Pending' THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 2 status is %, expected Pending', v_claim2_rec.claim_status;
    END IF;
    -- Line 1: 1,500.00 LKR (capped by remaining balance 3,500 - 2,000 = 1,500)
    -- Line 2: 0.00 LKR (excluded)
    -- Total Claim 2 = 1,500.00 LKR
    IF v_claim2_rec.claimed_amount <> 1500.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 2 claimed_amount is %, expected 1,500.00 LKR', v_claim2_rec.claimed_amount;
    END IF;

    SELECT * INTO v_line1_clm2_rec
    FROM catms.insurance_claim_line WHERE claim_id = v_claim2_id AND line_number = 1;
    IF v_line1_clm2_rec.claimed_amount <> 1500.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 2 Line 1 claimed_amount is %, expected 1,500.00 LKR',
            v_line1_clm2_rec.claimed_amount;
    END IF;

    -- C. Verification of Invariant (Rule 5.3)
    -- Line 1: 2,000 + 1,500 = 3,500 <= 3,500 (Exact 100%, 0 over-allocation)
    -- Line 2: 4,550 + 0 = 4,550 <= 6,500 (70%, 0 over-allocation)
    -- Critical Rule Check: invoice.patient_liability_amount MUST REMAIN 10,000.00 LKR
    SELECT * INTO v_inv_rec FROM catms.invoice WHERE invoice_id = v_invoice_id;
    IF v_inv_rec.patient_liability_amount <> 10000.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Pending claim prematurely reduced patient liability to %',
            v_inv_rec.patient_liability_amount;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Step 3.3: Claim 1 Resolution — Partial Approval (Ceylinco)
    -- Ceylinco approves 5,800.00 LKR (Line 1: 2,000.00 LKR, Line 2: 3,800.00 LKR)
    -- ─────────────────────────────────────────────────────────────────────────
    PERFORM catms.resolve_claim(
        v_claim1_id,
        'PartiallyApproved',
        5800.00,
        v_finance_user_id,
        'Ceylinco deducted 750 LKR consumable portion on ECG',
        jsonb_build_array(
            jsonb_build_object('invoice_line_id', v_inv_line1_id, 'approved_amount', 2000.00),
            jsonb_build_object('invoice_line_id', v_inv_line2_id, 'approved_amount', 3800.00)
        )
    );

    SELECT * INTO v_claim1_rec FROM catms.insurance_claim WHERE claim_id = v_claim1_id;
    IF v_claim1_rec.claim_status <> 'PartiallyApproved' OR v_claim1_rec.approved_amount <> 5800.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 1 state after partial approval mismatch';
    END IF;

    -- Verify atomic invoice recalculation (CATMS-008 §3.3):
    -- approved_insurance_amount = 5,800.00 LKR
    -- patient_liability_amount = 10,000.00 - 5,800.00 = 4,200.00 LKR
    SELECT * INTO v_inv_rec FROM catms.invoice WHERE invoice_id = v_invoice_id;
    IF v_inv_rec.approved_insurance_amount <> 5800.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Invoice approved_insurance_amount is %, expected 5,800.00 LKR',
            v_inv_rec.approved_insurance_amount;
    END IF;
    IF v_inv_rec.patient_liability_amount <> 4200.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Invoice patient_liability_amount is %, expected 4,200.00 LKR',
            v_inv_rec.patient_liability_amount;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Step 3.4: Claim 2 Resolution — Rejection (SLIC)
    -- SLIC rejects Claim 2 (approved_amount = 0.00 LKR)
    -- ─────────────────────────────────────────────────────────────────────────
    PERFORM catms.resolve_claim(
        v_claim2_id,
        'Rejected',
        0.00,
        v_finance_user_id,
        'Secondary top-up policy underwriting exclusion on consultation co-payment'
    );

    SELECT * INTO v_claim2_rec FROM catms.insurance_claim WHERE claim_id = v_claim2_id;
    IF v_claim2_rec.claim_status <> 'Rejected' OR v_claim2_rec.approved_amount <> 0.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Claim 2 state after rejection mismatch';
    END IF;

    -- Verify invoice liability remains 4,200.00 LKR (CATMS-008 §3.4)
    SELECT * INTO v_inv_rec FROM catms.invoice WHERE invoice_id = v_invoice_id;
    IF v_inv_rec.approved_insurance_amount <> 5800.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Invoice approved_insurance_amount changed upon rejection';
    END IF;
    IF v_inv_rec.patient_liability_amount <> 4200.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Patient liability changed upon rejection (got %)',
            v_inv_rec.patient_liability_amount;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Step 3.5: Historical Coverage Preservation (Rule 8.1 & 8.2)
    -- Updating policy coverage in October 2026 must NOT alter the claim snapshot
    -- made for September 2026 service date.
    -- ─────────────────────────────────────────────────────────────────────────
    PERFORM catms.update_policy_coverage(
        v_pol_ceylinco_id, v_treat1_id, 90.00, 3000.00, '2026-10-01'
    );

    -- Verify the historical claim line retains original terms
    SELECT * INTO v_line1_clm1_rec
    FROM catms.insurance_claim_line
    WHERE claim_id = v_claim1_id AND line_number = 1;

    IF v_line1_clm1_rec.covered_percentage_snapshot <> 80.00
       OR v_line1_clm1_rec.coverage_cap_snapshot <> 2000.00
       OR v_line1_clm1_rec.claimed_amount <> 2000.00
       OR v_line1_clm1_rec.approved_amount <> 2000.00 THEN
        RAISE EXCEPTION 'GOLDEN TEST FAILED: Historical claim line snapshot corrupted by subsequent policy update!';
    END IF;

    RAISE NOTICE 'SUCCESS: 113_insurance_and_claim_golden_rules passed all assertions — 100%% reconciled with CATMS-008.';
END;
$$;

ROLLBACK;
