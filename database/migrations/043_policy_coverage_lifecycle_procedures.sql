-- =============================================================================
-- 043_policy_coverage_lifecycle_procedures.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity, Insurance & Claims)
-- Issue: CATMS-026 (Phase G2 — Step 6)
-- Dependencies: 042_insurance_provider_policy_coverage.sql, 006 (signed rules)
--
-- Deliverables:
--   - catms.create_insurance_provider   — Controlled provider creation
--   - catms.create_insurance_policy     — Controlled policy registration
--   - catms.update_policy_status        — Lifecycle status transition (ACTIVE, SUSPENDED, EXPIRED, CANCELLED)
--   - catms.add_policy_coverage         — Initial coverage term creation
--   - catms.update_policy_coverage      — Immutable coverage lifecycle update
--                                         (closes old term with effective_to = new_from - 1,
--                                          inserts new row starting at new_from; NO raw updates)
--   - catms.get_effective_coverage      — Service-date eligibility & terms lookup
--
-- Business Rules Enforced (CATMS-006 signed decision document & Dev3_Plan.md):
--   - Rule 3.1: Policy belongs to specific patient.
--   - Rule 3.2: Distinguishable policy statuses (ACTIVE, EXPIRED, SUSPENDED, CANCELLED).
--   - Rule 3.3: Temporal service date validity (valid_from <= service_date <= valid_to).
--   - Rule 3.4: Policies cannot be created for inactive providers.
--   - Rule 4.1: Percentage [0, 100], non-negative caps.
--   - Rule 8.2: Closing old terms on policy updates (no raw UPDATE of historical rates;
--               effective_to = new_effective_from - 1 day; overlap forbidden).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Procedure: catms.create_insurance_provider
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.create_insurance_provider(
    p_provider_code     CITEXT,
    p_name              VARCHAR(200),
    p_contact_name      VARCHAR(150) DEFAULT NULL,
    p_contact_phone     VARCHAR(30)  DEFAULT NULL,
    p_contact_email     CITEXT       DEFAULT NULL,
    p_status            catms.insurance_provider_status DEFAULT 'ACTIVE',
    p_notes             TEXT         DEFAULT NULL,
    INOUT p_provider_id BIGINT       DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Validations
    IF p_provider_code IS NULL OR length(trim(p_provider_code::text)) = 0 THEN
        RAISE EXCEPTION 'Provider code cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'Provider name cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    IF p_status IS NULL THEN
        RAISE EXCEPTION 'Provider status cannot be null' USING ERRCODE = 'check_violation';
    END IF;

    -- Pre-check code uniqueness
    IF EXISTS (SELECT 1 FROM catms.insurance_provider WHERE provider_code = trim(p_provider_code)) THEN
        RAISE EXCEPTION 'Insurance provider with code % already exists', trim(p_provider_code)
            USING ERRCODE = 'unique_violation';
    END IF;

    -- Pre-check name uniqueness
    IF EXISTS (SELECT 1 FROM catms.insurance_provider WHERE name = trim(p_name)) THEN
        RAISE EXCEPTION 'Insurance provider with name % already exists', trim(p_name)
            USING ERRCODE = 'unique_violation';
    END IF;

    -- 2. Insert provider record
    INSERT INTO catms.insurance_provider (
        provider_code,
        name,
        contact_name,
        contact_phone,
        contact_email,
        status,
        notes,
        created_at,
        updated_at
    ) VALUES (
        trim(p_provider_code),
        trim(p_name),
        NULLIF(trim(p_contact_name), ''),
        NULLIF(trim(p_contact_phone), ''),
        NULLIF(trim(p_contact_email), ''),
        p_status,
        NULLIF(trim(p_notes), ''),
        clock_timestamp(),
        clock_timestamp()
    )
    RETURNING provider_id INTO p_provider_id;
END;
$$;

COMMENT ON PROCEDURE catms.create_insurance_provider IS
  'Controlled procedure to create an insurance provider with code/name uniqueness enforcement.';


-- =============================================================================
-- 2. Procedure: catms.create_insurance_policy
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.create_insurance_policy(
    p_patient_id        BIGINT,
    p_provider_id       BIGINT,
    p_policy_number     CITEXT,
    p_valid_from        DATE,
    p_valid_to          DATE DEFAULT NULL,
    p_policy_status     catms.insurance_policy_status DEFAULT 'ACTIVE',
    p_notes             TEXT DEFAULT NULL,
    INOUT p_policy_id   BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_provider_status catms.insurance_provider_status;
BEGIN
    -- 1. Validate patient existence
    IF NOT EXISTS (SELECT 1 FROM catms.patient WHERE patient_id = p_patient_id) THEN
        RAISE EXCEPTION 'Patient with ID % does not exist', p_patient_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 2. Validate provider existence and ACTIVE status (Rule 3.4)
    SELECT status INTO v_provider_status
    FROM catms.insurance_provider
    WHERE provider_id = p_provider_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insurance provider with ID % does not exist', p_provider_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_provider_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Cannot create policy for inactive insurance provider %', p_provider_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Validate policy number
    IF p_policy_number IS NULL OR length(trim(p_policy_number::text)) = 0 THEN
        RAISE EXCEPTION 'Policy number cannot be empty' USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Validate dates (Rule 3.3)
    IF p_valid_from IS NULL THEN
        RAISE EXCEPTION 'Policy valid_from date is required' USING ERRCODE = 'check_violation';
    END IF;

    IF p_valid_to IS NOT NULL AND p_valid_to < p_valid_from THEN
        RAISE EXCEPTION 'Policy valid_to (%) cannot precede valid_from (%)', p_valid_to, p_valid_from
            USING ERRCODE = 'check_violation';
    END IF;

    -- 5. Duplicate provider + policy_number check (Rule 3.1)
    IF EXISTS (
        SELECT 1 FROM catms.insurance_policy
        WHERE provider_id = p_provider_id
          AND policy_number = trim(p_policy_number)
    ) THEN
        RAISE EXCEPTION 'Policy % already exists for provider %', trim(p_policy_number), p_provider_id
            USING ERRCODE = 'unique_violation';
    END IF;

    -- 6. Insert policy
    INSERT INTO catms.insurance_policy (
        patient_id,
        provider_id,
        policy_number,
        policy_status,
        valid_from,
        valid_to,
        notes,
        created_at,
        updated_at
    ) VALUES (
        p_patient_id,
        p_provider_id,
        trim(p_policy_number),
        COALESCE(p_policy_status, 'ACTIVE'),
        p_valid_from,
        p_valid_to,
        NULLIF(trim(p_notes), ''),
        clock_timestamp(),
        clock_timestamp()
    )
    RETURNING policy_id INTO p_policy_id;
END;
$$;

COMMENT ON PROCEDURE catms.create_insurance_policy IS
  'Controlled procedure to create a patient insurance policy. Enforces active provider guard and provider+number uniqueness.';


-- =============================================================================
-- 3. Procedure: catms.update_policy_status
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.update_policy_status(
    p_policy_id     BIGINT,
    p_new_status    catms.insurance_policy_status,
    p_notes         TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_curr_status catms.insurance_policy_status;
BEGIN
    IF p_new_status IS NULL THEN
        RAISE EXCEPTION 'New policy status cannot be null' USING ERRCODE = 'check_violation';
    END IF;

    SELECT policy_status INTO v_curr_status
    FROM catms.insurance_policy
    WHERE policy_id = p_policy_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insurance policy with ID % does not exist', p_policy_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    UPDATE catms.insurance_policy
    SET policy_status = p_new_status,
        notes = CASE 
            WHEN p_notes IS NOT NULL AND length(trim(p_notes)) > 0 THEN 
                COALESCE(notes || E'\n', '') || '[' || CURRENT_DATE || '] Status changed from ' || v_curr_status || ' to ' || p_new_status || ': ' || trim(p_notes)
            ELSE notes
        END,
        updated_at = clock_timestamp()
    WHERE policy_id = p_policy_id;
END;
$$;

COMMENT ON PROCEDURE catms.update_policy_status IS
  'Controlled procedure to update policy status (ACTIVE, SUSPENDED, EXPIRED, CANCELLED) with optional audit notes.';


-- =============================================================================
-- 4. Procedure: catms.add_policy_coverage
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.add_policy_coverage(
    p_policy_id           BIGINT,
    p_treatment_id        BIGINT,
    p_coverage_percentage NUMERIC(5,2),
    p_coverage_cap        NUMERIC(12,2) DEFAULT NULL,
    p_effective_from      DATE DEFAULT CURRENT_DATE,
    p_effective_to        DATE DEFAULT NULL,
    INOUT p_coverage_id   BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Validate policy existence
    IF NOT EXISTS (SELECT 1 FROM catms.insurance_policy WHERE policy_id = p_policy_id) THEN
        RAISE EXCEPTION 'Policy with ID % does not exist', p_policy_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 2. Validate treatment existence if treatment_catalogue table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'catms' AND table_name = 'treatment_catalogue'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM catms.treatment_catalogue WHERE treatment_id = p_treatment_id) THEN
            RAISE EXCEPTION 'Treatment with ID % does not exist in catalogue', p_treatment_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    -- 3. Validate percentage and cap (Rule 4.1)
    IF p_coverage_percentage IS NULL OR p_coverage_percentage < 0.00 OR p_coverage_percentage > 100.00 THEN
        RAISE EXCEPTION 'Coverage percentage must be between 0.00 and 100.00, got %', p_coverage_percentage
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_coverage_cap IS NOT NULL AND p_coverage_cap < 0.00 THEN
        RAISE EXCEPTION 'Coverage cap cannot be negative, got %', p_coverage_cap
            USING ERRCODE = 'check_violation';
    END IF;

    -- 4. Validate dates
    IF p_effective_from IS NULL THEN
        RAISE EXCEPTION 'effective_from date is required' USING ERRCODE = 'check_violation';
    END IF;

    IF p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN
        RAISE EXCEPTION 'effective_to (%) cannot precede effective_from (%)', p_effective_to, p_effective_from
            USING ERRCODE = 'check_violation';
    END IF;

    -- 5. Overlap pre-check (Rule 8.2 & exclusion constraint)
    IF EXISTS (
        SELECT 1 FROM catms.policy_coverage
        WHERE policy_id = p_policy_id
          AND treatment_id = p_treatment_id
          AND daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') &&
              daterange(p_effective_from, COALESCE(p_effective_to, '9999-12-31'::date), '[]')
    ) THEN
        RAISE EXCEPTION 'Coverage term overlaps with existing effective period for policy % and treatment %',
            p_policy_id, p_treatment_id
            USING ERRCODE = 'exclusion_violation';
    END IF;

    -- 6. Insert coverage term
    INSERT INTO catms.policy_coverage (
        policy_id,
        treatment_id,
        coverage_percentage,
        coverage_cap,
        effective_from,
        effective_to,
        created_at
    ) VALUES (
        p_policy_id,
        p_treatment_id,
        p_coverage_percentage,
        p_coverage_cap,
        p_effective_from,
        p_effective_to,
        clock_timestamp()
    )
    RETURNING coverage_id INTO p_coverage_id;
END;
$$;

COMMENT ON PROCEDURE catms.add_policy_coverage IS
  'Controlled procedure to add an initial treatment coverage term for an insurance policy.';


-- =============================================================================
-- 5. Procedure: catms.update_policy_coverage (Lifecycle Procedure)
--
-- Rule 8.2: Never UPDATE an active coverage row in-place.
-- Closes the current term:
--   effective_to = p_effective_from - INTERVAL ''1 day''
-- Inserts a new coverage row:
--   effective_from = p_effective_from, effective_to = p_effective_to
-- All executed in one transaction. Overlapping intervals are rejected.
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.update_policy_coverage(
    p_policy_id             BIGINT,
    p_treatment_id          BIGINT,
    p_new_percentage        NUMERIC(5,2),
    p_new_cap               NUMERIC(12,2) DEFAULT NULL,
    p_effective_from        DATE DEFAULT CURRENT_DATE,
    p_effective_to          DATE DEFAULT NULL,
    INOUT p_new_coverage_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_coverage_id      BIGINT;
    v_old_effective_from   DATE;
    v_old_effective_to     DATE;
BEGIN
    -- 1. Validations
    IF p_effective_from IS NULL THEN
        RAISE EXCEPTION 'effective_from date is required' USING ERRCODE = 'check_violation';
    END IF;

    IF p_new_percentage IS NULL OR p_new_percentage < 0.00 OR p_new_percentage > 100.00 THEN
        RAISE EXCEPTION 'Coverage percentage must be between 0.00 and 100.00, got %', p_new_percentage
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_new_cap IS NOT NULL AND p_new_cap < 0.00 THEN
        RAISE EXCEPTION 'Coverage cap cannot be negative, got %', p_new_cap
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_effective_to IS NOT NULL AND p_effective_to < p_effective_from THEN
        RAISE EXCEPTION 'effective_to (%) cannot precede effective_from (%)', p_effective_to, p_effective_from
            USING ERRCODE = 'check_violation';
    END IF;

    -- Validate policy exists
    IF NOT EXISTS (SELECT 1 FROM catms.insurance_policy WHERE policy_id = p_policy_id) THEN
        RAISE EXCEPTION 'Policy with ID % does not exist', p_policy_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Validate treatment exists if catalogue table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'catms' AND table_name = 'treatment_catalogue'
    ) THEN
        IF NOT EXISTS (SELECT 1 FROM catms.treatment_catalogue WHERE treatment_id = p_treatment_id) THEN
            RAISE EXCEPTION 'Treatment with ID % does not exist in catalogue', p_treatment_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    -- 2. Find currently active / latest open term for this policy + treatment
    -- Any row where effective_to IS NULL or effective_to >= p_effective_from
    SELECT coverage_id, effective_from, effective_to
    INTO v_old_coverage_id, v_old_effective_from, v_old_effective_to
    FROM catms.policy_coverage
    WHERE policy_id = p_policy_id
      AND treatment_id = p_treatment_id
      AND (effective_to IS NULL OR effective_to >= p_effective_from)
    ORDER BY effective_from DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        -- Verify that new effective_from is strictly after the old start date
        IF p_effective_from <= v_old_effective_from THEN
            RAISE EXCEPTION 'New effective_from date (%) must be strictly after prior term start date (%)',
                p_effective_from, v_old_effective_from
                USING ERRCODE = 'check_violation';
        END IF;

        -- 3. Close the old term by setting effective_to = p_effective_from - 1 day
        UPDATE catms.policy_coverage
        SET effective_to = p_effective_from - 1
        WHERE coverage_id = v_old_coverage_id;
    END IF;

    -- 4. Insert the new effective-dated coverage row
    INSERT INTO catms.policy_coverage (
        policy_id,
        treatment_id,
        coverage_percentage,
        coverage_cap,
        effective_from,
        effective_to,
        created_at
    ) VALUES (
        p_policy_id,
        p_treatment_id,
        p_new_percentage,
        p_new_cap,
        p_effective_from,
        p_effective_to,
        clock_timestamp()
    )
    RETURNING coverage_id INTO p_new_coverage_id;
END;
$$;

COMMENT ON PROCEDURE catms.update_policy_coverage IS
  'Lifecycle procedure to update policy coverage terms. Closes prior active term at (effective_from - 1 day) and inserts new term row. Never mutates historical percentage/cap.';


-- =============================================================================
-- 6. Helper Function: catms.get_effective_coverage
--
-- Returns coverage details for a given policy and treatment as of service_date.
-- Determines eligibility based on:
--   - Policy status = ACTIVE
--   - Provider status = ACTIVE
--   - Policy valid_from <= service_date <= policy.valid_to
--   - Coverage effective_from <= service_date <= coverage.effective_to
-- =============================================================================

CREATE OR REPLACE FUNCTION catms.get_effective_coverage(
    p_policy_id     BIGINT,
    p_treatment_id  BIGINT,
    p_service_date  DATE
)
RETURNS TABLE (
    coverage_id         BIGINT,
    policy_id           BIGINT,
    treatment_id        BIGINT,
    coverage_percentage NUMERIC(5,2),
    coverage_cap        NUMERIC(12,2),
    effective_from      DATE,
    effective_to        DATE,
    is_eligible         BOOLEAN,
    ineligibility_reason TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_policy_status   catms.insurance_policy_status;
    v_provider_status catms.insurance_provider_status;
    v_valid_from      DATE;
    v_valid_to        DATE;
    v_found_cov       RECORD;
BEGIN
    -- Check policy and provider
    SELECT p.policy_status, p.valid_from, p.valid_to, prov.status
    INTO v_policy_status, v_valid_from, v_valid_to, v_provider_status
    FROM catms.insurance_policy p
    JOIN catms.insurance_provider prov ON prov.provider_id = p.provider_id
    WHERE p.policy_id = p_policy_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            NULL::BIGINT, p_policy_id, p_treatment_id,
            0.00::NUMERIC(5,2), NULL::NUMERIC(12,2),
            NULL::DATE, NULL::DATE,
            FALSE, 'Policy does not exist';
        RETURN;
    END IF;

    -- Evaluate provider status
    IF v_provider_status <> 'ACTIVE' THEN
        RETURN QUERY SELECT
            NULL::BIGINT, p_policy_id, p_treatment_id,
            0.00::NUMERIC(5,2), NULL::NUMERIC(12,2),
            NULL::DATE, NULL::DATE,
            FALSE, 'Insurance provider is inactive';
        RETURN;
    END IF;

    -- Evaluate policy status
    IF v_policy_status <> 'ACTIVE' THEN
        RETURN QUERY SELECT
            NULL::BIGINT, p_policy_id, p_treatment_id,
            0.00::NUMERIC(5,2), NULL::NUMERIC(12,2),
            NULL::DATE, NULL::DATE,
            FALSE, 'Policy status is ' || v_policy_status::text || ' (must be ACTIVE)';
        RETURN;
    END IF;

    -- Evaluate policy temporal window
    IF p_service_date < v_valid_from OR (v_valid_to IS NOT NULL AND p_service_date > v_valid_to) THEN
        RETURN QUERY SELECT
            NULL::BIGINT, p_policy_id, p_treatment_id,
            0.00::NUMERIC(5,2), NULL::NUMERIC(12,2),
            NULL::DATE, NULL::DATE,
            FALSE, 'Service date ' || p_service_date::text || ' is outside policy validity window (' || v_valid_from::text || ' to ' || COALESCE(v_valid_to::text, 'open') || ')';
        RETURN;
    END IF;

    -- Look up effective coverage row for treatment
    SELECT c.coverage_id, c.coverage_percentage, c.coverage_cap, c.effective_from, c.effective_to
    INTO v_found_cov
    FROM catms.policy_coverage c
    WHERE c.policy_id = p_policy_id
      AND c.treatment_id = p_treatment_id
      AND c.effective_from <= p_service_date
      AND (c.effective_to IS NULL OR c.effective_to >= p_service_date)
    ORDER BY c.effective_from DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT
            NULL::BIGINT, p_policy_id, p_treatment_id,
            0.00::NUMERIC(5,2), NULL::NUMERIC(12,2),
            NULL::DATE, NULL::DATE,
            FALSE, 'Treatment is not covered under this policy on the service date';
        RETURN;
    END IF;

    -- All checks passed: eligible
    RETURN QUERY SELECT
        v_found_cov.coverage_id,
        p_policy_id,
        p_treatment_id,
        v_found_cov.coverage_percentage,
        v_found_cov.coverage_cap,
        v_found_cov.effective_from,
        v_found_cov.effective_to,
        TRUE,
        NULL::TEXT;
END;
$$;

COMMENT ON FUNCTION catms.get_effective_coverage IS
  'Queries effective coverage terms and checks eligibility for a policy and treatment on a given service date.';


-- =============================================================================
-- 7. Permissions & Grants
-- =============================================================================

GRANT EXECUTE ON PROCEDURE catms.create_insurance_provider TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.create_insurance_policy   TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.update_policy_status      TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.add_policy_coverage       TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.update_policy_coverage    TO catms_app;

GRANT EXECUTE ON FUNCTION catms.get_effective_coverage     TO catms_app;
GRANT EXECUTE ON FUNCTION catms.get_effective_coverage     TO catms_readonly;


-- =============================================================================
-- 8. Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (43, 'policy and coverage lifecycle procedures', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
