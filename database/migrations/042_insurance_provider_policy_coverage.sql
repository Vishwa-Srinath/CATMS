-- =============================================================================
-- 042_insurance_provider_policy_coverage.sql
-- Module: B-patient-insurance
-- Owner: Dev1 (implementing on behalf of Dev3 to unblock Dev4)
-- Issue: CATMS-019
-- Dependencies: 040_create_patient_identity_schema.sql (catms.patient)
--               091_treatment_catalogue.sql (catms.treatment_catalogue)
--
-- Deliverables:
--   - catms.insurance_provider    — Insurance company catalogue
--   - catms.insurance_policy      — Patient policy instances with status & dates
--   - catms.policy_coverage       — Treatment-specific coverage % and cap,
--                                   effective-dated with non-overlap guard
--
-- Business Rules enforced (from CATMS-006 signed decision document):
--   - Provider+policy number unique (Rule 3.1)
--   - Policy status: ACTIVE, EXPIRED, SUSPENDED, CANCELLED (Rule 3.2)
--   - Policy temporal window: valid_from <= service_date <= valid_to (Rule 3.3)
--   - Coverage: percentage 0–100, cap >= 0 (Rule 4.1)
--   - No overlapping coverage terms for same (policy_id, treatment_id) (Rule 8.2)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Enums
-- =============================================================================

CREATE TYPE catms.insurance_policy_status AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'SUSPENDED',
    'CANCELLED'
);

CREATE TYPE catms.insurance_provider_status AS ENUM (
    'ACTIVE',
    'INACTIVE'
);

-- =============================================================================
-- 2. Table: insurance_provider
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.insurance_provider (
    provider_id          BIGINT GENERATED ALWAYS AS IDENTITY,
    provider_code        citext                               NOT NULL,
    name                 VARCHAR(200)                         NOT NULL,
    contact_name         VARCHAR(150),
    contact_phone        VARCHAR(30),
    contact_email        citext,
    status               catms.insurance_provider_status     NOT NULL DEFAULT 'ACTIVE',
    notes                TEXT,
    created_at           TIMESTAMPTZ                          NOT NULL DEFAULT clock_timestamp(),
    updated_at           TIMESTAMPTZ                          NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_insurance_provider             PRIMARY KEY (provider_id),
    CONSTRAINT uq_insurance_provider_code        UNIQUE (provider_code),
    CONSTRAINT uq_insurance_provider_name        UNIQUE (name),
    CONSTRAINT chk_insurance_provider_code_noemp CHECK (length(trim(provider_code::text)) > 0),
    CONSTRAINT chk_insurance_provider_name_noemp CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE  catms.insurance_provider        IS 'Catalogue of insurance companies that cover CATMS patients.';
COMMENT ON COLUMN catms.insurance_provider.provider_id   IS 'Surrogate primary key.';
COMMENT ON COLUMN catms.insurance_provider.provider_code IS 'Short code for the insurer (e.g., SLIC, CIC, AIA). Case-insensitive unique.';
COMMENT ON COLUMN catms.insurance_provider.name          IS 'Full legal name of the insurance company.';
COMMENT ON COLUMN catms.insurance_provider.status        IS 'ACTIVE = can accept new claims. INACTIVE = historical only.';

-- =============================================================================
-- 3. Table: insurance_policy
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.insurance_policy (
    policy_id            BIGINT GENERATED ALWAYS AS IDENTITY,
    patient_id           BIGINT                               NOT NULL,
    provider_id          BIGINT                               NOT NULL,
    policy_number        citext                               NOT NULL,
    policy_status        catms.insurance_policy_status        NOT NULL DEFAULT 'ACTIVE',
    valid_from           DATE                                 NOT NULL,
    valid_to             DATE,
    notes                TEXT,
    created_at           TIMESTAMPTZ                          NOT NULL DEFAULT clock_timestamp(),
    updated_at           TIMESTAMPTZ                          NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_insurance_policy               PRIMARY KEY (policy_id),
    -- Provider + policy number must be globally unique (same policy can't be duplicated)
    CONSTRAINT uq_insurance_policy_provider_number UNIQUE (provider_id, policy_number),
    CONSTRAINT fk_insurance_policy_patient       FOREIGN KEY (patient_id)
        REFERENCES catms.patient(patient_id) ON DELETE RESTRICT,
    CONSTRAINT fk_insurance_policy_provider      FOREIGN KEY (provider_id)
        REFERENCES catms.insurance_provider(provider_id) ON DELETE RESTRICT,
    CONSTRAINT chk_insurance_policy_policy_number_noemp CHECK (length(trim(policy_number::text)) > 0),
    CONSTRAINT chk_insurance_policy_valid_dates  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

COMMENT ON TABLE  catms.insurance_policy          IS 'Patient-level insurance policy contract with an insurer. Each row is one policy held by/for one patient.';
COMMENT ON COLUMN catms.insurance_policy.policy_id      IS 'Surrogate primary key.';
COMMENT ON COLUMN catms.insurance_policy.patient_id     IS 'Patient who owns this policy (Rule 3.1: patient ownership invariant).';
COMMENT ON COLUMN catms.insurance_policy.provider_id    IS 'FK to insurance_provider. Provider must be ACTIVE for claim eligibility (Rule 3.4).';
COMMENT ON COLUMN catms.insurance_policy.policy_number  IS 'Insurer-assigned policy contract number. Unique within a provider.';
COMMENT ON COLUMN catms.insurance_policy.policy_status  IS 'ACTIVE = eligible for claims. EXPIRED/SUSPENDED/CANCELLED = ineligible (Rule 3.2).';
COMMENT ON COLUMN catms.insurance_policy.valid_from     IS 'Policy inception date. Service date must be >= valid_from for eligibility (Rule 3.3).';
COMMENT ON COLUMN catms.insurance_policy.valid_to       IS 'Policy expiry date (NULL = open-ended). Service date must be <= valid_to for eligibility (Rule 3.3).';

-- Index for fast patient policy lookups
CREATE INDEX IF NOT EXISTS idx_insurance_policy_patient
    ON catms.insurance_policy (patient_id, policy_status);

-- =============================================================================
-- 4. Table: policy_coverage
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.policy_coverage (
    coverage_id          BIGINT GENERATED ALWAYS AS IDENTITY,
    policy_id            BIGINT                               NOT NULL,
    treatment_id         BIGINT                               NOT NULL,
    coverage_percentage  NUMERIC(5,2)                         NOT NULL,
    coverage_cap         NUMERIC(12,2),                        -- NULL = uncapped (Rule 4.1)
    effective_from       DATE                                 NOT NULL,
    effective_to         DATE,                                 -- NULL = currently active
    created_at           TIMESTAMPTZ                          NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_policy_coverage                PRIMARY KEY (coverage_id),
    CONSTRAINT fk_policy_coverage_policy         FOREIGN KEY (policy_id)
        REFERENCES catms.insurance_policy(policy_id) ON DELETE RESTRICT,
    CONSTRAINT fk_policy_coverage_treatment      FOREIGN KEY (treatment_id)
        REFERENCES catms.treatment_catalogue(treatment_id) ON DELETE RESTRICT,

    -- Rules 4.1: percentage must be in [0.00, 100.00]
    CONSTRAINT chk_policy_coverage_percentage    CHECK (coverage_percentage >= 0.00 AND coverage_percentage <= 100.00),
    -- Rule 4.1: cap must be non-negative if specified
    CONSTRAINT chk_policy_coverage_cap           CHECK (coverage_cap IS NULL OR coverage_cap >= 0.00),
    -- Date sanity: effective_to must not precede effective_from
    CONSTRAINT chk_policy_coverage_dates         CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE  catms.policy_coverage          IS 'Treatment-specific coverage terms for an insurance policy. Effective-dated rows preserve historical terms (Rule 8.2). Overlapping date ranges for the same policy+treatment are blocked by the exclusion constraint.';
COMMENT ON COLUMN catms.policy_coverage.policy_id            IS 'FK to insurance_policy.';
COMMENT ON COLUMN catms.policy_coverage.treatment_id         IS 'FK to treatment_catalogue. Coverage is treatment-specific (Rule 3.5).';
COMMENT ON COLUMN catms.policy_coverage.coverage_percentage  IS 'Percentage of invoice line total covered by this policy. Range: 0.00–100.00 (Rule 4.1).';
COMMENT ON COLUMN catms.policy_coverage.coverage_cap         IS 'Maximum LKR amount this policy will pay per line for this treatment. NULL = uncapped (Rule 4.1).';
COMMENT ON COLUMN catms.policy_coverage.effective_from       IS 'Start of this coverage term. Used for service-date eligibility (Rule 3.5).';
COMMENT ON COLUMN catms.policy_coverage.effective_to         IS 'End of this coverage term. NULL = still active. Closed when a new term is created (Rule 8.2).';

-- =============================================================================
-- 5. GiST exclusion: no overlapping date ranges for same (policy_id, treatment_id)
--    Enforces Rule 8.2 — overlapping effective terms are forbidden.
--    Uses daterange with BTREE_GIST so overlapping rows are rejected.
-- =============================================================================

ALTER TABLE catms.policy_coverage
    ADD CONSTRAINT ex_policy_coverage_no_date_overlap
    EXCLUDE USING gist (
        policy_id    WITH =,
        treatment_id WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
    );

-- Index for fast coverage lookup by service date
CREATE INDEX IF NOT EXISTS idx_policy_coverage_lookup
    ON catms.policy_coverage (policy_id, treatment_id, effective_from, effective_to);

-- =============================================================================
-- 6. updated_at triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION catms.trg_touch_insurance_provider_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_insurance_provider_updated_at ON catms.insurance_provider;
CREATE TRIGGER trg_touch_insurance_provider_updated_at
    BEFORE UPDATE ON catms.insurance_provider
    FOR EACH ROW
    EXECUTE FUNCTION catms.trg_touch_insurance_provider_updated_at();

CREATE OR REPLACE FUNCTION catms.trg_touch_insurance_policy_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_insurance_policy_updated_at ON catms.insurance_policy;
CREATE TRIGGER trg_touch_insurance_policy_updated_at
    BEFORE UPDATE ON catms.insurance_policy
    FOR EACH ROW
    EXECUTE FUNCTION catms.trg_touch_insurance_policy_updated_at();

-- =============================================================================
-- 7. Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON catms.insurance_provider TO catms_app;
GRANT SELECT, INSERT, UPDATE ON catms.insurance_policy   TO catms_app;
GRANT SELECT, INSERT, UPDATE ON catms.policy_coverage    TO catms_app;

GRANT SELECT ON catms.insurance_provider TO catms_readonly;
GRANT SELECT ON catms.insurance_policy   TO catms_readonly;
GRANT SELECT ON catms.policy_coverage    TO catms_readonly;

-- =============================================================================
-- 8. Migration registry
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (42, 'insurance provider, policy and coverage schema', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
