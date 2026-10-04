-- =============================================================================
-- database/tests/rules/043_policy_coverage_lifecycle_rules.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims)
-- Issue: CATMS-026 (Phase G2 — Step 6)
--
-- Business rule and lifecycle procedure test suite:
--   1. Controlled provider creation and uniqueness guards.
--   2. Controlled policy creation, inactive provider guard, and date validation.
--   3. Policy status transitions (ACTIVE, SUSPENDED, EXPIRED).
--   4. Controlled initial coverage addition and constraint enforcement.
--   5. Lifecycle coverage updating:
--      - Closes prior active term at (new_effective_from - 1 day)
--      - Inserts new effective-dated row starting at new_effective_from
--      - Preserves historical percentage and cap without mutation
--      - Rejects invalid backdating
--   6. Effective-date eligibility resolution via get_effective_coverage():
--      - Proves old service dates resolve against historical terms (80%, 5000 cap)
--      - Proves new service dates resolve against updated terms (90%, 8000 cap)
--      - Proves suspended/expired policies are deemed ineligible
--
-- All changes are rolled back at the end of the test.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id          BIGINT;
    v_patient_id         BIGINT;
    v_treatment_id       BIGINT;
    v_treatment2_id      BIGINT;
    v_provider_id        BIGINT;
    v_inactive_prov_id   BIGINT;
    v_policy_id          BIGINT;
    v_coverage_id        BIGINT;
    v_new_coverage_id    BIGINT;

    v_old_term           RECORD;
    v_new_term           RECORD;
    v_cov_result         RECORD;
    v_caught             BOOLEAN;
BEGIN

    -- =========================================================================
    -- Fixtures Setup (Self-contained)
    -- =========================================================================

    -- 1. Branch
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('BR-43-LFC', 'Lifecycle Test Clinic', '43 Hospital Rd', 'Colombo', '+94112345043')
    ON CONFLICT (branch_code) DO UPDATE SET is_active = TRUE
    RETURNING branch_id INTO v_branch_id;

    -- 2. Patient
    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-43-LFC', 'Perera', 'Silva', '1990-05-15', 'Male', '+94770000043', v_branch_id)
    RETURNING patient_id INTO v_patient_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_id, 'NIC', '199013500043V', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'Amara Silva', 'Spouse', '+94770000044', TRUE);

    -- 3. Treatments (treatment category + treatments in catalogue)
    SELECT treatment_id INTO v_treatment_id
    FROM catms.treatment_catalogue
    WHERE is_active = TRUE
    LIMIT 1;

    IF v_treatment_id IS NULL THEN
        DECLARE
            v_cat_id BIGINT;
        BEGIN
            INSERT INTO catms.treatment_category (category_code, name, is_active)
            VALUES ('CAT-43-TST', 'Lifecycle Test Category', TRUE)
            RETURNING treatment_category_id INTO v_cat_id;

            INSERT INTO catms.treatment_catalogue (
                treatment_category_id, service_code, name, current_price, default_duration_minutes, is_active
            )
            VALUES (v_cat_id, 'SRV-43-001', 'General Consultation', 2000.00, 30, TRUE)
            RETURNING treatment_id INTO v_treatment_id;

            INSERT INTO catms.treatment_catalogue (
                treatment_category_id, service_code, name, current_price, default_duration_minutes, is_active
            )
            VALUES (v_cat_id, 'SRV-43-002', 'Dental Cleaning', 5000.00, 45, TRUE)
            RETURNING treatment_id INTO v_treatment2_id;
        END;
    ELSE
        SELECT treatment_id INTO v_treatment2_id
        FROM catms.treatment_catalogue
        WHERE treatment_id <> v_treatment_id
        LIMIT 1;

        IF v_treatment2_id IS NULL THEN
            DECLARE
                v_cat_id BIGINT;
            BEGIN
                SELECT treatment_category_id INTO v_cat_id FROM catms.treatment_catalogue WHERE treatment_id = v_treatment_id;
                INSERT INTO catms.treatment_catalogue (
                    treatment_category_id, service_code, name, current_price, default_duration_minutes, is_active
                )
                VALUES (v_cat_id, 'SRV-43-EXTRA', 'Extra Test Service', 3500.00, 30, TRUE)
                RETURNING treatment_id INTO v_treatment2_id;
            END;
        END IF;
    END IF;


    -- =========================================================================
    -- Test 1: Controlled Insurance Provider Creation
    -- =========================================================================

    CALL catms.create_insurance_provider(
        p_provider_code := 'SLIC-43',
        p_name          := 'Sri Lanka Insurance Corp 43',
        p_contact_name  := 'Kamal Fernando',
        p_contact_phone := '+94112000043',
        p_contact_email := 'contact@slic43.lk',
        p_status        := 'ACTIVE',
        p_notes         := 'Test active provider for CATMS-026',
        p_provider_id   := v_provider_id
    );

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Test 1 failed: create_insurance_provider did not return provider_id';
    END IF;

    -- Duplicate code rejection
    v_caught := FALSE;
    BEGIN
        CALL catms.create_insurance_provider(
            p_provider_code := 'SLIC-43',
            p_name          := 'Different Name',
            p_provider_id   := v_inactive_prov_id
        );
    EXCEPTION WHEN unique_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 1 failed: duplicate provider_code was not rejected with unique_violation';
    END IF;

    -- Empty name rejection
    v_caught := FALSE;
    BEGIN
        CALL catms.create_insurance_provider(
            p_provider_code := 'NEW-CODE-43',
            p_name          := '   ',
            p_provider_id   := v_inactive_prov_id
        );
    EXCEPTION WHEN check_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 1 failed: empty provider name was not rejected with check_violation';
    END IF;

    -- Create an inactive provider for negative testing
    CALL catms.create_insurance_provider(
        p_provider_code := 'INACT-43',
        p_name          := 'Inactive Insurance 43',
        p_status        := 'INACTIVE',
        p_provider_id   := v_inactive_prov_id
    );


    -- =========================================================================
    -- Test 2: Controlled Insurance Policy Creation
    -- =========================================================================

    -- Success case
    CALL catms.create_insurance_policy(
        p_patient_id    := v_patient_id,
        p_provider_id   := v_provider_id,
        p_policy_number := 'POL-43-GOLD',
        p_valid_from    := '2026-01-01'::DATE,
        p_valid_to      := '2026-12-31'::DATE,
        p_policy_status := 'ACTIVE',
        p_notes         := 'Gold healthcare corporate policy',
        p_policy_id     := v_policy_id
    );

    IF v_policy_id IS NULL THEN
        RAISE EXCEPTION 'Test 2 failed: create_insurance_policy did not return policy_id';
    END IF;

    -- Inactive provider rejection
    v_caught := FALSE;
    BEGIN
        CALL catms.create_insurance_policy(
            p_patient_id    := v_patient_id,
            p_provider_id   := v_inactive_prov_id,
            p_policy_number := 'POL-FAIL-INACT',
            p_valid_from    := '2026-01-01'::DATE
        );
    EXCEPTION WHEN check_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 2 failed: policy on inactive provider was not rejected';
    END IF;

    -- valid_to < valid_from rejection
    v_caught := FALSE;
    BEGIN
        CALL catms.create_insurance_policy(
            p_patient_id    := v_patient_id,
            p_provider_id   := v_provider_id,
            p_policy_number := 'POL-FAIL-DATES',
            p_valid_from    := '2026-06-01'::DATE,
            p_valid_to      := '2026-05-01'::DATE
        );
    EXCEPTION WHEN check_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 2 failed: inverted valid_to < valid_from was not rejected';
    END IF;

    -- Duplicate (provider_id, policy_number) rejection
    v_caught := FALSE;
    BEGIN
        CALL catms.create_insurance_policy(
            p_patient_id    := v_patient_id,
            p_provider_id   := v_provider_id,
            p_policy_number := 'POL-43-GOLD',
            p_valid_from    := '2026-01-01'::DATE
        );
    EXCEPTION WHEN unique_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 2 failed: duplicate provider+policy_number was not rejected with unique_violation';
    END IF;


    -- =========================================================================
    -- Test 3: Policy Status Transitions
    -- =========================================================================

    CALL catms.update_policy_status(
        p_policy_id  := v_policy_id,
        p_new_status := 'SUSPENDED',
        p_notes      := 'Temporary suspension pending premium payment'
    );

    IF (SELECT policy_status FROM catms.insurance_policy WHERE policy_id = v_policy_id) <> 'SUSPENDED' THEN
        RAISE EXCEPTION 'Test 3 failed: policy_status was not updated to SUSPENDED';
    END IF;

    -- Reactivate policy
    CALL catms.update_policy_status(
        p_policy_id  := v_policy_id,
        p_new_status := 'ACTIVE',
        p_notes      := 'Premium received, policy restored'
    );

    IF (SELECT policy_status FROM catms.insurance_policy WHERE policy_id = v_policy_id) <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Test 3 failed: policy_status was not restored to ACTIVE';
    END IF;


    -- =========================================================================
    -- Test 4: Controlled Initial Coverage Addition
    -- =========================================================================

    CALL catms.add_policy_coverage(
        p_policy_id           := v_policy_id,
        p_treatment_id        := v_treatment_id,
        p_coverage_percentage := 80.00,
        p_coverage_cap        := 5000.00,
        p_effective_from      := '2026-01-01'::DATE,
        p_effective_to        := NULL,
        p_coverage_id         := v_coverage_id
    );

    IF v_coverage_id IS NULL THEN
        RAISE EXCEPTION 'Test 4 failed: add_policy_coverage did not return coverage_id';
    END IF;

    -- Invalid percentage (> 100) rejection
    v_caught := FALSE;
    BEGIN
        CALL catms.add_policy_coverage(
            p_policy_id           := v_policy_id,
            p_treatment_id        := v_treatment2_id,
            p_coverage_percentage := 120.00,
            p_effective_from      := '2026-01-01'::DATE
        );
    EXCEPTION WHEN check_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 4 failed: percentage > 100 was not rejected with check_violation';
    END IF;

    -- Negative cap rejection
    v_caught := FALSE;
    BEGIN
        CALL catms.add_policy_coverage(
            p_policy_id           := v_policy_id,
            p_treatment_id        := v_treatment2_id,
            p_coverage_percentage := 50.00,
            p_coverage_cap        := -100.00,
            p_effective_from      := '2026-01-01'::DATE
        );
    EXCEPTION WHEN check_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 4 failed: negative cap was not rejected with check_violation';
    END IF;

    -- Overlapping coverage rejection for same treatment
    v_caught := FALSE;
    BEGIN
        CALL catms.add_policy_coverage(
            p_policy_id           := v_policy_id,
            p_treatment_id        := v_treatment_id,
            p_coverage_percentage := 70.00,
            p_effective_from      := '2026-06-01'::DATE
        );
    EXCEPTION WHEN exclusion_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 4 failed: overlapping coverage term was not rejected';
    END IF;


    -- =========================================================================
    -- Test 5: Lifecycle Coverage Update (Rule 8.2: Close Old & Insert New)
    -- =========================================================================

    -- New term starts on 2026-07-01: coverage increased to 90%, cap to 8000.00
    CALL catms.update_policy_coverage(
        p_policy_id             := v_policy_id,
        p_treatment_id          := v_treatment_id,
        p_new_percentage        := 90.00,
        p_new_cap               := 8000.00,
        p_effective_from        := '2026-07-01'::DATE,
        p_effective_to          := NULL,
        p_new_coverage_id       := v_new_coverage_id
    );

    IF v_new_coverage_id IS NULL THEN
        RAISE EXCEPTION 'Test 5 failed: update_policy_coverage did not return new coverage_id';
    END IF;

    -- Verify old term was closed at 2026-06-30 (new_effective_from - 1 day)
    SELECT * INTO v_old_term
    FROM catms.policy_coverage
    WHERE coverage_id = v_coverage_id;

    IF v_old_term.effective_to <> '2026-06-30'::DATE THEN
        RAISE EXCEPTION 'Test 5 failed: prior coverage term effective_to was not closed at 2026-06-30, got %', v_old_term.effective_to;
    END IF;

    IF v_old_term.coverage_percentage <> 80.00 OR v_old_term.coverage_cap <> 5000.00 THEN
        RAISE EXCEPTION 'Test 5 failed: historical coverage rates were mutated! Must remain immutable.';
    END IF;

    -- Verify new term starts on 2026-07-01 with new rates
    SELECT * INTO v_new_term
    FROM catms.policy_coverage
    WHERE coverage_id = v_new_coverage_id;

    IF v_new_term.effective_from <> '2026-07-01'::DATE OR v_new_term.effective_to IS NOT NULL THEN
        RAISE EXCEPTION 'Test 5 failed: new coverage term date range mismatch';
    END IF;

    IF v_new_term.coverage_percentage <> 90.00 OR v_new_term.coverage_cap <> 8000.00 THEN
        RAISE EXCEPTION 'Test 5 failed: new coverage term rates do not match specified values';
    END IF;

    -- Invalid backdating attempt: setting new start before prior term start date
    v_caught := FALSE;
    BEGIN
        CALL catms.update_policy_coverage(
            p_policy_id      := v_policy_id,
            p_treatment_id   := v_treatment_id,
            p_new_percentage := 95.00,
            p_effective_from := '2026-05-01'::DATE -- before the current term's 2026-07-01 start!
        );
    EXCEPTION WHEN check_violation THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'Test 5 failed: invalid backdating before prior term start was not rejected';
    END IF;


    -- =========================================================================
    -- Test 6: Historical Eligibility Resolution via get_effective_coverage()
    -- =========================================================================

    -- Service date in Period 1 (e.g. 2026-03-15) must resolve to Historical Term (80%, 5000 cap)
    SELECT * INTO v_cov_result
    FROM catms.get_effective_coverage(v_policy_id, v_treatment_id, '2026-03-15'::DATE);

    IF NOT v_cov_result.is_eligible THEN
        RAISE EXCEPTION 'Test 6 failed: treatment should be eligible on 2026-03-15, reason: %', v_cov_result.ineligibility_reason;
    END IF;

    IF v_cov_result.coverage_percentage <> 80.00 OR v_cov_result.coverage_cap <> 5000.00 THEN
        RAISE EXCEPTION 'Test 6 failed: historical coverage rates on 2026-03-15 mismatch: expected 80%% / 5000, got % / %',
            v_cov_result.coverage_percentage, v_cov_result.coverage_cap;
    END IF;

    -- Service date in Period 2 (e.g. 2026-08-20) must resolve to New Term (90%, 8000 cap)
    SELECT * INTO v_cov_result
    FROM catms.get_effective_coverage(v_policy_id, v_treatment_id, '2026-08-20'::DATE);

    IF NOT v_cov_result.is_eligible THEN
        RAISE EXCEPTION 'Test 6 failed: treatment should be eligible on 2026-08-20, reason: %', v_cov_result.ineligibility_reason;
    END IF;

    IF v_cov_result.coverage_percentage <> 90.00 OR v_cov_result.coverage_cap <> 8000.00 THEN
        RAISE EXCEPTION 'Test 6 failed: updated coverage rates on 2026-08-20 mismatch: expected 90%% / 8000, got % / %',
            v_cov_result.coverage_percentage, v_cov_result.coverage_cap;
    END IF;

    -- Service date before policy inception (e.g. 2025-11-01) must be Ineligible
    SELECT * INTO v_cov_result
    FROM catms.get_effective_coverage(v_policy_id, v_treatment_id, '2025-11-01'::DATE);

    IF v_cov_result.is_eligible THEN
        RAISE EXCEPTION 'Test 6 failed: service date prior to policy inception was marked eligible';
    END IF;

    -- When policy is suspended, service date must be Ineligible
    CALL catms.update_policy_status(v_policy_id, 'SUSPENDED');

    SELECT * INTO v_cov_result
    FROM catms.get_effective_coverage(v_policy_id, v_treatment_id, '2026-08-20'::DATE);

    IF v_cov_result.is_eligible THEN
        RAISE EXCEPTION 'Test 6 failed: suspended policy was marked eligible for coverage';
    END IF;

    RAISE NOTICE '✅ 043_policy_coverage_lifecycle_rules: All business rule and lifecycle assertions passed.';

END;
$$;

ROLLBACK;
