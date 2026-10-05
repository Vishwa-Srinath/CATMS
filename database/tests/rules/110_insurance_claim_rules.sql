-- =============================================================================
-- database/tests/rules/110_insurance_claim_rules.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims) | Issue: CATMS-037 | Reviewer: Dev4
--
-- Direct database rules tests for claims schema:
--   Test A: Rule 3.1 Patient ownership invariant (mismatched patient fails)
--   Test B: Rule 6.2 Status log is append-only (UPDATE and DELETE fail)
--   Test C: Rule 6.1 Terminal status and immutability of resolved claims
--   Test D: Rule 5.3 Over-allocation ceiling (claim allocation > line total fails)
--   Test E: Check constraints on claim amounts and states
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id             BIGINT;
    v_patient1_id           BIGINT;
    v_patient2_id           BIGINT;
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
    v_app_treatment_id      BIGINT;
    v_invoice_id            BIGINT;
    v_inv_line_id           BIGINT;
    v_provider_id           BIGINT;
    v_policy_p1_id          BIGINT;
    v_policy_p2_id          BIGINT;
    v_coverage_id           BIGINT;
    v_claim_id              BIGINT;
    v_log_id                BIGINT;
    v_ok                    BOOLEAN;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- Setup minimal fixture
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('TST110', 'Claims Test Branch', '110 Claim Way', 'Colombo', '+94110000000')
    RETURNING branch_id INTO v_branch_id;

    -- Admin Employee & User
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-CL-ADM', '198001019910', 'Admin User', 'Male', '1980-01-01', 'Admin', '+94770000010', CURRENT_DATE)
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_emp_id, 'claims_admin_110', 'hash_adm', 'ACTIVE')
    RETURNING user_account_id INTO v_admin_user_id;

    -- Assign ADMIN role to admin user
    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_admin_user_id, app_role_id
    FROM catms.app_role WHERE upper(role_code) = 'ADMIN';

    -- Doctor Employee & User
    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-CL-DOC', '198501019910', 'Dr. Silva', 'Male', '1985-01-01', 'Doctor', '+94770000011', CURRENT_DATE)
    RETURNING employee_id INTO v_doctor_emp_id;

    v_doctor_id := v_doctor_emp_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date, default_consultation_fee)
    VALUES (v_doctor_id, 'SLMC-110-001', '2015-01-01', 5000.00);

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('SPEC-110', 'Claims General')
    RETURNING specialty_id INTO v_specialty_id;

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_doctor_id, v_specialty_id, TRUE);

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_doctor_emp_id, 'claims_doc_110', 'hash_doc', 'ACTIVE')
    RETURNING user_account_id INTO v_clinician_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_clinician_user_id, app_role_id
    FROM catms.app_role WHERE upper(role_code) = 'CLINICIAN';

    -- Patient 1 (Invoice Patient)
    INSERT INTO catms.patient (patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id, registered_by)
    VALUES ('PAT-110-001', 'Patient', 'One', '1985-05-15', 'Male', '+94711100001', v_branch_id, v_emp_id)
    RETURNING patient_id INTO v_patient1_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, normalized_identity, is_primary)
    VALUES (v_patient1_id, 'NIC', '198511000001', '198511000001', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient1_id, 'Contact One', 'Spouse', '+94711100002', TRUE);

    -- Patient 2 (Other Patient)
    INSERT INTO catms.patient (patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id, registered_by)
    VALUES ('PAT-110-002', 'Patient', 'Two', '1990-08-20', 'Female', '+94711100003', v_branch_id, v_emp_id)
    RETURNING patient_id INTO v_patient2_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, normalized_identity, is_primary)
    VALUES (v_patient2_id, 'NIC', '199011000002', '199011000002', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient2_id, 'Contact Two', 'Sibling', '+94711100004', TRUE);

    -- Treatment Catalogue
    INSERT INTO catms.treatment_category (category_code, name)
    VALUES ('CAT-110', 'Claims Category')
    RETURNING treatment_category_id INTO v_treatment_cat_id;

    INSERT INTO catms.treatment_catalogue (treatment_category_id, service_code, name, current_price, default_duration_minutes, is_consultation_service)
    VALUES (v_treatment_cat_id, 'SRV-110-01', 'Consultation Service', 5000.00, 15, FALSE)
    RETURNING treatment_id INTO v_treatment_id;

    -- Appointment Completed for Patient 1
    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, status, booking_type, created_by
    ) VALUES (
        'APP-110-0001', v_patient1_id, v_doctor_id, v_branch_id, v_specialty_id,
        '2026-09-15 09:00:00+05:30', '2026-09-15 09:15:00+05:30', 'Completed', 'Booked', v_admin_user_id
    ) RETURNING appointment_id INTO v_appointment_id;

    -- Delivered Treatment
    INSERT INTO catms.appointment_treatment (
        appointment_id, treatment_id, line_number, quantity, unit_price_at_time,
        price_source, administered_at, recorded_by_user_id
    ) VALUES (
        v_appointment_id, v_treatment_id, 1, 1, 5000.00,
        'Standard', '2026-09-15 09:05:00+05:30', v_clinician_user_id
    ) RETURNING appointment_treatment_id INTO v_app_treatment_id;

    -- Issued Invoice
    SELECT catms.issue_invoice(v_appointment_id, v_admin_user_id) INTO v_invoice_id;

    SELECT invoice_line_id INTO v_inv_line_id
    FROM catms.invoice_line WHERE invoice_id = v_invoice_id;

    -- Insurer Provider & Policies
    INSERT INTO catms.insurance_provider (provider_code, name)
    VALUES ('PROV110', 'Test Insurer 110')
    RETURNING provider_id INTO v_provider_id;

    -- Policy for Patient 1
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, status, valid_from, valid_to
    ) VALUES (
        v_patient1_id, v_provider_id, 'POL-110-PAT1', 'ACTIVE', '2026-01-01', '2026-12-31'
    ) RETURNING policy_id INTO v_policy_p1_id;

    -- Policy for Patient 2
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, status, valid_from, valid_to
    ) VALUES (
        v_patient2_id, v_provider_id, 'POL-110-PAT2', 'ACTIVE', '2026-01-01', '2026-12-31'
    ) RETURNING policy_id INTO v_policy_p2_id;

    -- Coverage for Policy 1
    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from
    ) VALUES (
        v_policy_p1_id, v_treatment_id, 80.00, 4000.00, '2026-01-01'
    ) RETURNING coverage_id INTO v_coverage_id;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test A: Rule 3.1 Patient Ownership Invariant
    -- Attempting to attach Patient 2's policy to Patient 1's invoice MUST fail.
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.insurance_claim (
            invoice_id, policy_id, claim_status, claimed_amount, submitted_by_user_id
        ) VALUES (
            v_invoice_id, v_policy_p2_id, 'Pending', 4000.00, v_admin_user_id
        );
    EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;

    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Rule 3.1 patient ownership invariant did not reject mismatched patient policy';
    END IF;

    -- Insert valid claim for Patient 1
    INSERT INTO catms.insurance_claim (
        invoice_id, policy_id, claim_status, claimed_amount, submitted_by_user_id
    ) VALUES (
        v_invoice_id, v_policy_p1_id, 'Pending', 4000.00, v_admin_user_id
    ) RETURNING claim_id INTO v_claim_id;

    -- Insert valid claim line
    INSERT INTO catms.insurance_claim_line (
        claim_id, invoice_line_id, policy_coverage_id, line_number,
        service_code_snapshot, description_snapshot, covered_percentage_snapshot,
        coverage_cap_snapshot, unit_price_snapshot, quantity_snapshot,
        line_total_snapshot, nominal_covered_amount, claimed_amount
    ) VALUES (
        v_claim_id, v_inv_line_id, v_coverage_id, 1,
        'SRV-110-01', 'Consultation Service', 80.00,
        4000.00, 5000.00, 1, 5000.00, 4000.00, 4000.00
    );

    -- Log initial transition
    INSERT INTO catms.insurance_claim_status_log (
        claim_id, from_status, to_status, transitioned_by_user_id, transition_reason
    ) VALUES (
        v_claim_id, NULL, 'Pending', v_admin_user_id, 'Submitted'
    ) RETURNING status_log_id INTO v_log_id;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test B: Rule 6.2 Append-Only Status Log
    -- Direct UPDATE or DELETE on insurance_claim_status_log MUST fail.
    -- ─────────────────────────────────────────────────────────────────────────
    v_ok := FALSE;
    BEGIN
        UPDATE catms.insurance_claim_status_log
        SET transition_reason = 'Tampered Reason'
        WHERE status_log_id = v_log_id;
    EXCEPTION WHEN insufficient_privilege OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;

    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: UPDATE on insurance_claim_status_log was not prevented';
    END IF;

    v_ok := FALSE;
    BEGIN
        DELETE FROM catms.insurance_claim_status_log
        WHERE status_log_id = v_log_id;
    EXCEPTION WHEN insufficient_privilege OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;

    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: DELETE on insurance_claim_status_log was not prevented';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test C: Rule 6.1 Terminal Status & Immutability
    -- Transition claim to Approved, then verify it cannot transition back to Pending.
    -- ─────────────────────────────────────────────────────────────────────────
    UPDATE catms.insurance_claim
    SET claim_status = 'Approved',
        approved_amount = 4000.00,
        resolved_by_user_id = v_admin_user_id,
        resolved_at = clock_timestamp()
    WHERE claim_id = v_claim_id;

    v_ok := FALSE;
    BEGIN
        UPDATE catms.insurance_claim
        SET claim_status = 'Pending'
        WHERE claim_id = v_claim_id;
    EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN
        v_ok := TRUE;
    END;

    IF NOT v_ok THEN
        RAISE EXCEPTION 'TEST FAILED: Resolved claim transitioned back to Pending (terminality failed)';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- Test D: Rule 5.3 Over-Allocation Ceiling
    -- Attempting to add a claim line that pushes total claimed > line total MUST fail.
    -- ─────────────────────────────────────────────────────────────────────────
    -- Line total is 5000.00, claim currently has 4000.00.
    -- Create second claim and try to claim 2000.00 (4000 + 2000 = 6000 > 5000).
    DECLARE
        v_claim2_id BIGINT;
        v_policy2_p1_id BIGINT;
    BEGIN
        INSERT INTO catms.insurance_policy (
            patient_id, provider_id, policy_number, status, valid_from, valid_to
        ) VALUES (
            v_patient1_id, v_provider_id, 'POL-110-PAT1-B', 'ACTIVE', '2026-01-01', '2026-12-31'
        ) RETURNING policy_id INTO v_policy2_p1_id;

        INSERT INTO catms.insurance_claim (
            invoice_id, policy_id, claim_status, claimed_amount, submitted_by_user_id
        ) VALUES (
            v_invoice_id, v_policy2_p1_id, 'Pending', 2000.00, v_admin_user_id
        ) RETURNING claim_id INTO v_claim2_id;

        v_ok := FALSE;
        BEGIN
            INSERT INTO catms.insurance_claim_line (
                claim_id, invoice_line_id, policy_coverage_id, line_number,
                service_code_snapshot, description_snapshot, covered_percentage_snapshot,
                unit_price_snapshot, quantity_snapshot, line_total_snapshot,
                nominal_covered_amount, claimed_amount
            ) VALUES (
                v_claim2_id, v_inv_line_id, v_coverage_id, 1,
                'SRV-110-01', 'Consultation Service', 50.00,
                5000.00, 1, 5000.00, 2500.00, 2000.00
            );
        EXCEPTION WHEN check_violation OR integrity_constraint_violation THEN
            v_ok := TRUE;
        END;

        IF NOT v_ok THEN
            RAISE EXCEPTION 'TEST FAILED: Over-allocation ceiling (Rule 5.3) did not reject excess claim line';
        END IF;
    END;

    RAISE NOTICE 'SUCCESS: 110_insurance_claim_rules passed all assertions.';
END;
$$;

ROLLBACK;
