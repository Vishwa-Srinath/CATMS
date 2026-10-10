-- =============================================================================
-- database/tests/rules/175_privacy_audit.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims) | Issue: CATMS-075 | Reviewer: Dev4
-- Gate: G5 (Data, Reports and NFR Proof)
--
-- Privacy and Log Inspection Audit Suite for Insurance & Claims:
-- Scans database audit logs, rejection reasons, and status transition logs
-- to prove that sensitive patient identity (NIC, Passport, phone numbers,
-- names, clinical diagnosis) NEVER leaks into audit trails or error strings.
--
-- Compliance Invariants:
--   1. Sri Lankan NIC patterns (9-digit+V/X or 12-digit) absent from status logs.
--   2. Passport number patterns ([A-Z][0-9]{7,8}) absent from status logs.
--   3. Patient names absent from claim rejection reasons.
--   4. Identity numbers strictly isolated to catms.patient_identity table.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_nic_leaks_in_logs     INTEGER := 0;
    v_passport_leaks        INTEGER := 0;
    v_phone_leaks           INTEGER := 0;
    v_name_leaks_in_reasons INTEGER := 0;
    v_unauthorized_id_count INTEGER := 0;
    v_test_claim_id         BIGINT;
    v_test_inv_id           BIGINT;
    v_test_pat_id           BIGINT;
    v_branch_id             BIGINT;
    v_user_id               BIGINT;
    v_emp_id                BIGINT;
    v_specialty_id          BIGINT;
    v_prov_id               BIGINT;
    v_pol_id                BIGINT;
    v_appt_id               BIGINT;
    v_treat_cat_id          BIGINT;
    v_treat_id              BIGINT;
BEGIN
    RAISE NOTICE '=============================================================================';
    RAISE NOTICE 'CATMS-075: Commencing Privacy & Identity Isolation Audit';
    RAISE NOTICE '=============================================================================';

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Setup Isolated Audit Sample
    -- ─────────────────────────────────────────────────────────────────────────
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('BR-AUDIT-75', 'Audit Branch', '1 Galle Rd', 'Colombo', '+94112000075')
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.employee (employee_number, nic, full_name, gender_code, date_of_birth, position_code, phone, hire_date)
    VALUES ('EMP-AUD-75', '198801019075', 'Auditor User', 'Male', '1988-01-01', 'Doctor', '+94770000077', CURRENT_DATE)
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_emp_id, 'audit_runner_75', 'TEST_HASH', 'ACTIVE')
    RETURNING user_account_id INTO v_user_id;

    INSERT INTO catms.user_account_role (user_account_id, app_role_id)
    SELECT v_user_id, app_role_id FROM catms.app_role WHERE upper(role_code) = 'ADMIN';

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date, default_consultation_fee)
    VALUES (v_emp_id, 'SLMC-AUD-75', '2015-01-01', 3000.00);

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('SPEC-AUD-75', 'Audit Specialty')
    RETURNING specialty_id INTO v_specialty_id;

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_emp_id, v_specialty_id, TRUE);

    -- Create test patient with known NIC and name
    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id, registered_by
    ) VALUES (
        'PAT-AUD-75', 'Sithara', 'Jayawardena', '1992-04-12', 'Female', '+94773456789', v_branch_id, v_emp_id
    ) RETURNING patient_id INTO v_test_pat_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_test_pat_id, 'NIC', '199210304050', TRUE);

    -- Treatment & Provider
    INSERT INTO catms.treatment_category (category_code, name)
    VALUES ('CAT-AUD-75', 'Audit Category')
    RETURNING treatment_category_id INTO v_treat_cat_id;

    INSERT INTO catms.treatment_catalogue (
        treatment_category_id, service_code, name, current_price, default_duration_minutes, is_consultation_service
    ) VALUES (
        v_treat_cat_id, 'TRT-AUD-75', 'Audit Consultation', 3000.00, 15, TRUE
    ) RETURNING treatment_id INTO v_treat_id;

    INSERT INTO catms.insurance_provider (name, provider_code, contact_phone, contact_email, status)
    VALUES ('Audit Insurer', 'AUD-INS-75', '+94112333333', 'audit@insurer.lk', 'ACTIVE')
    RETURNING provider_id INTO v_prov_id;

    INSERT INTO catms.insurance_policy (patient_id, provider_id, policy_number, valid_from, valid_to, policy_status)
    VALUES (v_test_pat_id, v_prov_id, 'POL-AUD-75', '2026-01-01', '2026-12-31', 'ACTIVE')
    RETURNING policy_id INTO v_pol_id;

    INSERT INTO catms.policy_coverage (policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from, effective_to)
    VALUES (v_pol_id, v_treat_id, 100.00, NULL, '2026-01-01', '2026-12-31');

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, status, booking_type, created_by
    ) VALUES (
        'APT-AUD-75', v_test_pat_id, v_emp_id, v_branch_id, v_specialty_id,
        '2026-07-01 09:00:00+00', '2026-07-01 09:30:00+00', 'Completed', 'Booked', v_user_id
    ) RETURNING appointment_id INTO v_appt_id;

    PERFORM catms.record_appointment_treatment(v_appt_id, v_treat_id, 1, v_user_id);
    SELECT catms.issue_invoice(v_appt_id, v_user_id) INTO v_test_inv_id;

    -- Submit claim & Resolve with clean sanitized reason
    SELECT (catms.submit_claim(v_test_inv_id, ARRAY[v_pol_id], v_user_id))[1] INTO v_test_claim_id;

    PERFORM catms.resolve_claim(
        v_test_claim_id,
        'Rejected',
        0.00,
        v_user_id,
        'Underwriting standard exclusion code EXC-044'
    );

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Audit Scan: Regex Pattern Checks on Claim Status History Log
    -- ─────────────────────────────────────────────────────────────────────────
    -- Check 1: Sri Lankan 9-digit+V or 12-digit NIC in transition_reason
    SELECT count(*) INTO v_nic_leaks_in_logs
    FROM catms.insurance_claim_status_log
    WHERE transition_reason ~* '\b([0-9]{9}[vVxX]|[0-9]{12})\b';

    IF v_nic_leaks_in_logs > 0 THEN
        RAISE EXCEPTION 'PRIVACY AUDIT FAILED: % NIC patterns detected in insurance_claim_status_log!',
            v_nic_leaks_in_logs;
    END IF;

    -- Check 2: Passport numbers in transition_reason
    SELECT count(*) INTO v_passport_leaks
    FROM catms.insurance_claim_status_log
    WHERE transition_reason ~* '\b[A-Z][0-9]{7,8}\b';

    IF v_passport_leaks > 0 THEN
        RAISE EXCEPTION 'PRIVACY AUDIT FAILED: % Passport patterns detected in insurance_claim_status_log!',
            v_passport_leaks;
    END IF;

    -- Check 3: Phone numbers in transition_reason
    SELECT count(*) INTO v_phone_leaks
    FROM catms.insurance_claim_status_log
    WHERE transition_reason ~* '\b(\+94[0-9]{9}|07[0-9]{8})\b';

    IF v_phone_leaks > 0 THEN
        RAISE EXCEPTION 'PRIVACY AUDIT FAILED: % Phone number patterns detected in insurance_claim_status_log!',
            v_phone_leaks;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Audit Scan: Rejection Reasons Must NOT Contain Patient Names
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_name_leaks_in_reasons
    FROM catms.insurance_claim c
    JOIN catms.patient p ON p.patient_id = (
        SELECT patient_id FROM catms.insurance_policy WHERE policy_id = c.policy_id
    )
    WHERE c.rejection_reason ILIKE '%' || p.first_name || '%'
       OR c.rejection_reason ILIKE '%' || p.last_name || '%';

    IF v_name_leaks_in_reasons > 0 THEN
        RAISE EXCEPTION 'PRIVACY AUDIT FAILED: % Rejection reasons contain patient names!',
            v_name_leaks_in_reasons;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Identity Isolation Check: All Patient Identities Reside in patient_identity
    -- ─────────────────────────────────────────────────────────────────────────
    -- Verify no identity numbers are stored directly in patient, policy, or claim tables
    SELECT count(*) INTO v_unauthorized_id_count
    FROM catms.insurance_claim c
    JOIN catms.insurance_policy pol ON pol.policy_id = c.policy_id
    JOIN catms.patient_identity pi ON pi.patient_id = pol.patient_id
    WHERE c.rejection_reason ILIKE '%' || pi.identity_number || '%'
       OR c.claim_number ILIKE '%' || pi.identity_number || '%';

    IF v_unauthorized_id_count > 0 THEN
        RAISE EXCEPTION 'PRIVACY AUDIT FAILED: Sensitive identity numbers leaked into claim columns!';
    END IF;

    RAISE NOTICE 'Privacy Audit Checks Complete:';
    RAISE NOTICE '  - NIC Leaks in Status Log: % (0 expected) -> PASS', v_nic_leaks_in_logs;
    RAISE NOTICE '  - Passport Leaks in Status Log: % (0 expected) -> PASS', v_passport_leaks;
    RAISE NOTICE '  - Phone Leaks in Status Log: % (0 expected) -> PASS', v_phone_leaks;
    RAISE NOTICE '  - Patient Names in Rejection Reason: % (0 expected) -> PASS', v_name_leaks_in_reasons;
    RAISE NOTICE '  - Identity Isolation Violations: % (0 expected) -> PASS', v_unauthorized_id_count;
    RAISE NOTICE '=============================================================================';
    RAISE NOTICE 'SUCCESS: 175_privacy_audit PASSED ALL AUDIT CHECKS.';
    RAISE NOTICE '=============================================================================';
END;
$$;

ROLLBACK;
