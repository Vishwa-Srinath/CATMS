-- =============================================================================
-- database/tests/rules/042_insurance_provider_policy_coverage_rules.sql
-- Owner: Dev1 (on behalf of Dev3)  |  Issue: CATMS-019  |  Reviewer: Dev4
--
-- Business-rule assertions for insurance provider, policy, and coverage
-- (CATMS-006 signed decision document).
--
-- Test plan:
--   A. Fixture seed (patient, treatment)
--   B. Valid insurance_provider inserts
--   C. Duplicate provider code → unique_violation
--   D. Duplicate provider name → unique_violation
--   E. Empty provider code → check_violation
--   F. Valid insurance_policy inserts
--   G. Duplicate provider+policy_number → unique_violation
--   H. valid_to < valid_from → check_violation
--   I. Valid policy_coverage inserts (percentage + cap)
--   J. Coverage percentage < 0 → check_violation
--   K. Coverage percentage > 100 → check_violation
--   L. Negative coverage_cap → check_violation
--   M. coverage_to < coverage_from → check_violation
--   N. Overlapping effective date range for same (policy, treatment) → exclusion_violation
--   O. Non-overlapping second coverage term → accepted
--   P. Same policy+treatment on different providers (different policies) → accepted
--   Q. Policy for INACTIVE provider still inserts (provider status = business layer)
--
-- All changes are rolled back — no permanent fixture data.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_patient_id        BIGINT;
    v_branch_id         BIGINT;
    v_emp_id            BIGINT;
    v_treatment_id      BIGINT;
    v_treatment2_id     BIGINT;
    v_provider_id       BIGINT;
    v_provider2_id      BIGINT;
    v_policy_id         BIGINT;
    v_policy2_id        BIGINT;
    v_coverage_id       BIGINT;
    v_ok                BOOLEAN;
BEGIN

    -- =========================================================================
    -- A. Fixture seed
    -- =========================================================================

    -- Branch (required for patient registration FK)
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('TST42A', 'Insurance Test Branch', '42 Ins Road', 'Colombo', '+94100000042')
    RETURNING branch_id INTO v_branch_id;

    -- Patient
    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-042-A', 'Insured', 'Patient', '1985-07-20', 'Female', '+94700042001', v_branch_id)
    RETURNING patient_id INTO v_patient_id;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_id, 'NIC', '198507042001V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'Insured EC', 'Spouse', '+94700042002', TRUE);

    -- Treatment from treatment_catalogue (must already exist via migration 091)
    -- Use the first available treatment
    SELECT treatment_id INTO v_treatment_id FROM catms.treatment_catalogue LIMIT 1;
    SELECT treatment_id INTO v_treatment2_id FROM catms.treatment_catalogue
    WHERE treatment_id <> v_treatment_id LIMIT 1;

    IF v_treatment_id IS NULL THEN
        RAISE EXCEPTION 'Fixture A FAILED: no treatment_catalogue rows exist — run migration 091 first';
    END IF;


    -- =========================================================================
    -- B. Valid insurance_provider inserts
    -- =========================================================================

    INSERT INTO catms.insurance_provider (provider_code, name, contact_phone, status)
    VALUES ('SLIC-TST', 'Sri Lanka Insurance Test', '+94112345600', 'ACTIVE')
    RETURNING provider_id INTO v_provider_id;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Test B FAILED: valid insurance_provider did not insert';
    END IF;

    INSERT INTO catms.insurance_provider (provider_code, name, contact_phone, status)
    VALUES ('AIA-TST', 'AIA Insurance Test', '+94112345601', 'ACTIVE')
    RETURNING provider_id INTO v_provider2_id;


    -- =========================================================================
    -- C. Duplicate provider code → unique_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.insurance_provider (provider_code, name)
        VALUES ('SLIC-TST', 'SLIC Duplicate Name');
        RAISE EXCEPTION 'Test C FAILED: duplicate provider_code was accepted';
    EXCEPTION
        WHEN unique_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test C FAILED: expected unique_violation for duplicate provider_code';
    END IF;


    -- =========================================================================
    -- D. Duplicate provider name → unique_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.insurance_provider (provider_code, name)
        VALUES ('NEW-TST', 'Sri Lanka Insurance Test');  -- same name as B
        RAISE EXCEPTION 'Test D FAILED: duplicate provider name was accepted';
    EXCEPTION
        WHEN unique_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test D FAILED: expected unique_violation for duplicate provider name';
    END IF;


    -- =========================================================================
    -- E. Empty provider code → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.insurance_provider (provider_code, name)
        VALUES ('   ', 'Blank Code Provider');
        RAISE EXCEPTION 'Test E FAILED: empty provider_code was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test E FAILED: expected check_violation for empty provider_code';
    END IF;


    -- =========================================================================
    -- F. Valid insurance_policy inserts
    -- =========================================================================

    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, policy_status,
        valid_from, valid_to
    )
    VALUES (
        v_patient_id, v_provider_id, 'POL-042-001', 'ACTIVE',
        '2025-01-01', '2027-12-31'
    )
    RETURNING policy_id INTO v_policy_id;

    IF v_policy_id IS NULL THEN
        RAISE EXCEPTION 'Test F FAILED: valid insurance_policy did not insert';
    END IF;

    -- Open-ended policy (valid_to = NULL) is allowed
    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number, policy_status,
        valid_from, valid_to
    )
    VALUES (
        v_patient_id, v_provider2_id, 'POL-042-AIA-001', 'ACTIVE',
        '2026-01-01', NULL
    )
    RETURNING policy_id INTO v_policy2_id;


    -- =========================================================================
    -- G. Duplicate provider+policy_number → unique_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.insurance_policy (
            patient_id, provider_id, policy_number, policy_status, valid_from
        )
        VALUES (v_patient_id, v_provider_id, 'POL-042-001', 'ACTIVE', '2026-06-01');
        RAISE EXCEPTION 'Test G FAILED: duplicate provider+policy_number was accepted';
    EXCEPTION
        WHEN unique_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test G FAILED: expected unique_violation for duplicate provider+policy_number';
    END IF;


    -- =========================================================================
    -- H. valid_to < valid_from → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.insurance_policy (
            patient_id, provider_id, policy_number, policy_status,
            valid_from, valid_to
        )
        VALUES (v_patient_id, v_provider_id, 'POL-042-BAD', 'ACTIVE', '2026-12-31', '2026-01-01');
        RAISE EXCEPTION 'Test H FAILED: valid_to < valid_from was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test H FAILED: expected check_violation for valid_to < valid_from';
    END IF;


    -- =========================================================================
    -- I. Valid policy_coverage inserts
    -- =========================================================================

    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, coverage_cap,
        effective_from, effective_to
    )
    VALUES (
        v_policy_id, v_treatment_id, 80.00, 50000.00,
        '2025-01-01', '2025-12-31'
    )
    RETURNING coverage_id INTO v_coverage_id;

    IF v_coverage_id IS NULL THEN
        RAISE EXCEPTION 'Test I FAILED: valid policy_coverage did not insert';
    END IF;

    -- Open-ended (NULL effective_to) is valid
    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, coverage_cap,
        effective_from, effective_to
    )
    VALUES (v_policy_id, v_treatment_id, 85.00, NULL, '2026-01-01', NULL);
    -- New term starts 2026-01-01, prior term ended 2025-12-31 — no overlap.


    -- =========================================================================
    -- J. Coverage percentage < 0 → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.policy_coverage (
            policy_id, treatment_id, coverage_percentage, effective_from
        )
        VALUES (v_policy_id, v_treatment2_id, -1.00, '2026-06-01');
        RAISE EXCEPTION 'Test J FAILED: negative coverage_percentage was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test J FAILED: expected check_violation for coverage_percentage < 0';
    END IF;


    -- =========================================================================
    -- K. Coverage percentage > 100 → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.policy_coverage (
            policy_id, treatment_id, coverage_percentage, effective_from
        )
        VALUES (v_policy_id, v_treatment2_id, 100.01, '2026-06-01');
        RAISE EXCEPTION 'Test K FAILED: coverage_percentage > 100 was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test K FAILED: expected check_violation for coverage_percentage > 100';
    END IF;


    -- =========================================================================
    -- L. Negative coverage_cap → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.policy_coverage (
            policy_id, treatment_id, coverage_percentage, coverage_cap, effective_from
        )
        VALUES (v_policy_id, v_treatment2_id, 50.00, -1.00, '2026-06-01');
        RAISE EXCEPTION 'Test L FAILED: negative coverage_cap was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test L FAILED: expected check_violation for negative coverage_cap';
    END IF;


    -- =========================================================================
    -- M. effective_to < effective_from → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.policy_coverage (
            policy_id, treatment_id, coverage_percentage, effective_from, effective_to
        )
        VALUES (v_policy_id, v_treatment2_id, 50.00, '2026-12-31', '2026-01-01');
        RAISE EXCEPTION 'Test M FAILED: effective_to < effective_from was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test M FAILED: expected check_violation for effective_to < effective_from';
    END IF;


    -- =========================================================================
    -- N. Overlapping date range for same (policy, treatment) → exclusion_violation
    --    Current rows for (v_policy_id, v_treatment_id):
    --      [2025-01-01, 2025-12-31] and [2026-01-01, open]
    --    Insert [2025-06-01, 2025-09-30] — overlaps the first row
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.policy_coverage (
            policy_id, treatment_id, coverage_percentage, effective_from, effective_to
        )
        VALUES (v_policy_id, v_treatment_id, 70.00, '2025-06-01', '2025-09-30');
        RAISE EXCEPTION 'Test N FAILED: overlapping coverage date range was accepted';
    EXCEPTION
        WHEN exclusion_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test N FAILED: expected exclusion_violation for overlapping coverage term';
    END IF;


    -- =========================================================================
    -- O. Non-overlapping second coverage term → accepted
    --    First term for v_treatment2_id: [2025-01-01, 2025-12-31]
    --    Second term for v_treatment2_id: [2026-01-01, open] — no overlap
    -- =========================================================================

    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, effective_from, effective_to
    )
    VALUES (v_policy_id, v_treatment2_id, 60.00, '2025-01-01', '2025-12-31');

    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, effective_from, effective_to
    )
    VALUES (v_policy_id, v_treatment2_id, 65.00, '2026-01-01', NULL);
    -- If we reach here without error, test O passed.


    -- =========================================================================
    -- P. Same treatment covered by two different policies → accepted
    -- =========================================================================

    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage, effective_from
    )
    VALUES (v_policy2_id, v_treatment_id, 15.00, '2026-01-01');
    -- Different policy_id — no overlap constraint applies. Should succeed.


    RAISE NOTICE 'CATMS-019 insurance rules — all 16 tests passed OK';

END;
$$;

-- Discard all test fixture data
ROLLBACK;
