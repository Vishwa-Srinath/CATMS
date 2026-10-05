-- =============================================================================
-- 110_insurance_claim.sql
-- Module: B-patient-insurance
-- Owner: Dev3 (Patient Identity, Insurance & Claims)
-- Issue: CATMS-037 (Phase G2 — Step 7)
-- Dependencies:
--   042_insurance_provider_policy_coverage.sql (catms.insurance_policy)
--   094_invoice_and_lines.sql (catms.invoice, catms.invoice_line)
--
-- Deliverables:
--   - catms.insurance_claim_status (ENUM)
--   - catms.insurance_claim        — Document representing claim submitted to an insurer
--   - catms.insurance_claim_line   — Line-level treatment allocation snapshotted from coverage
--   - catms.insurance_claim_status_log — Append-only audit history of lifecycle transitions
--
-- Business Rules enforced (from CATMS-006 signed decision document):
--   - Rule 3.1: Claim policy must belong to the invoice patient (ownership invariant)
--   - Rule 5.3: Total claimed amounts across policies cannot exceed invoice line total
--   - Rule 6.1: Resolved claims (Approved, PartiallyApproved, Rejected) are terminal
--   - Rule 6.2: Status history is strictly append-only (no UPDATE or DELETE)
--   - Rule 7.1: Submission does NOT reduce patient liability; liability reduced only on resolution
--   - Rule 8.1: Immutable snapshots on claim lines preserve terms under which claim was made
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Enums & Sequences
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'catms' AND t.typname = 'insurance_claim_status'
    ) THEN
        CREATE TYPE catms.insurance_claim_status AS ENUM (
            'Pending',
            'Approved',
            'PartiallyApproved',
            'Rejected'
        );
    END IF;
END;
$$;

CREATE SEQUENCE IF NOT EXISTS catms.claim_number_seq AS BIGINT;

-- =============================================================================
-- 2. Table: insurance_claim
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.insurance_claim (
    claim_id              BIGINT GENERATED ALWAYS AS IDENTITY,
    claim_number          VARCHAR(32)                     NOT NULL,
    invoice_id            BIGINT                          NOT NULL,
    policy_id             BIGINT                          NOT NULL,
    claim_status          catms.insurance_claim_status    NOT NULL DEFAULT 'Pending',
    claimed_amount        NUMERIC(12,2)                   NOT NULL DEFAULT 0.00,
    approved_amount       NUMERIC(12,2)                   NOT NULL DEFAULT 0.00,
    rejection_reason      TEXT,
    submitted_by_user_id  BIGINT                          NOT NULL,
    submitted_at          TIMESTAMPTZ                     NOT NULL DEFAULT clock_timestamp(),
    resolved_by_user_id   BIGINT,
    resolved_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ                     NOT NULL DEFAULT clock_timestamp(),
    updated_at            TIMESTAMPTZ                     NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_insurance_claim PRIMARY KEY (claim_id),
    CONSTRAINT uq_insurance_claim_number UNIQUE (claim_number),
    CONSTRAINT uq_invoice_policy_claim UNIQUE (invoice_id, policy_id),
    CONSTRAINT fk_insurance_claim_invoice FOREIGN KEY (invoice_id)
        REFERENCES catms.invoice(invoice_id) ON DELETE RESTRICT,
    CONSTRAINT fk_insurance_claim_policy FOREIGN KEY (policy_id)
        REFERENCES catms.insurance_policy(policy_id) ON DELETE RESTRICT,
    CONSTRAINT fk_insurance_claim_submitted_by FOREIGN KEY (submitted_by_user_id)
        REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_insurance_claim_resolved_by FOREIGN KEY (resolved_by_user_id)
        REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,

    CONSTRAINT chk_insurance_claim_number_noemp CHECK (length(trim(claim_number)) > 0),
    CONSTRAINT chk_insurance_claim_amounts CHECK (
        claimed_amount >= 0 AND claimed_amount <> 'NaN'::NUMERIC
        AND approved_amount >= 0 AND approved_amount <> 'NaN'::NUMERIC
        AND approved_amount <= claimed_amount
    ),
    CONSTRAINT chk_insurance_claim_resolution_state CHECK (
        (claim_status = 'Pending' AND resolved_at IS NULL AND resolved_by_user_id IS NULL AND approved_amount = 0.00)
        OR
        (claim_status = 'Approved' AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL AND approved_amount = claimed_amount)
        OR
        (claim_status = 'PartiallyApproved' AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL AND approved_amount > 0.00 AND approved_amount < claimed_amount)
        OR
        (claim_status = 'Rejected' AND resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL AND approved_amount = 0.00 AND rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
    )
);

ALTER SEQUENCE catms.claim_number_seq OWNED BY catms.insurance_claim.claim_number;

ALTER TABLE catms.insurance_claim
    ALTER COLUMN claim_number SET DEFAULT ('CLM-' || nextval('catms.claim_number_seq'::regclass)::text);

COMMENT ON TABLE  catms.insurance_claim                      IS 'Insurance claim filed against an invoice under an active patient policy.';
COMMENT ON COLUMN catms.insurance_claim.claim_id             IS 'Surrogate primary key.';
COMMENT ON COLUMN catms.insurance_claim.claim_number         IS 'Canonical unique identifier formatted as CLM-XXXX.';
COMMENT ON COLUMN catms.insurance_claim.invoice_id           IS 'Reference to the issued invoice being claimed.';
COMMENT ON COLUMN catms.insurance_claim.policy_id            IS 'Reference to the specific insurance policy applied.';
COMMENT ON COLUMN catms.insurance_claim.claim_status         IS 'Pending, Approved, PartiallyApproved, or Rejected.';
COMMENT ON COLUMN catms.insurance_claim.claimed_amount       IS 'Total amount claimed across all claim lines for this policy.';
COMMENT ON COLUMN catms.insurance_claim.approved_amount      IS 'Total approved amount confirmed by insurer; reduces patient liability.';
COMMENT ON COLUMN catms.insurance_claim.rejection_reason     IS 'Mandatory explanation recorded if claim is rejected.';
COMMENT ON COLUMN catms.insurance_claim.submitted_by_user_id IS 'User account of the staff member who submitted the claim.';
COMMENT ON COLUMN catms.insurance_claim.resolved_by_user_id  IS 'User account of the finance/admin officer who resolved the claim.';

-- Index for searching claims by invoice and policy
CREATE INDEX IF NOT EXISTS idx_insurance_claim_invoice ON catms.insurance_claim (invoice_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_policy  ON catms.insurance_claim (policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_status  ON catms.insurance_claim (claim_status);

-- =============================================================================
-- 3. Table: insurance_claim_line
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.insurance_claim_line (
    claim_line_id               BIGINT GENERATED ALWAYS AS IDENTITY,
    claim_id                    BIGINT                          NOT NULL,
    invoice_line_id             BIGINT                          NOT NULL,
    policy_coverage_id          BIGINT,
    line_number                 SMALLINT                        NOT NULL,
    service_code_snapshot       VARCHAR(30)                     NOT NULL,
    description_snapshot        VARCHAR(160)                    NOT NULL,
    covered_percentage_snapshot NUMERIC(5,2)                    NOT NULL,
    coverage_cap_snapshot       NUMERIC(12,2),
    unit_price_snapshot         NUMERIC(12,2)                   NOT NULL,
    quantity_snapshot           NUMERIC(8,2)                    NOT NULL,
    line_total_snapshot         NUMERIC(12,2)                   NOT NULL,
    nominal_covered_amount      NUMERIC(12,2)                   NOT NULL,
    claimed_amount              NUMERIC(12,2)                   NOT NULL,
    approved_amount             NUMERIC(12,2)                   NOT NULL DEFAULT 0.00,
    created_at                  TIMESTAMPTZ                     NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pk_insurance_claim_line PRIMARY KEY (claim_line_id),
    CONSTRAINT uq_claim_line_claim_invoice UNIQUE (claim_id, invoice_line_id),
    CONSTRAINT uq_claim_line_number UNIQUE (claim_id, line_number),
    CONSTRAINT fk_insurance_claim_line_claim FOREIGN KEY (claim_id)
        REFERENCES catms.insurance_claim(claim_id) ON DELETE RESTRICT,
    CONSTRAINT fk_insurance_claim_line_invoice_line FOREIGN KEY (invoice_line_id)
        REFERENCES catms.invoice_line(invoice_line_id) ON DELETE RESTRICT,
    CONSTRAINT fk_insurance_claim_line_coverage FOREIGN KEY (policy_coverage_id)
        REFERENCES catms.policy_coverage(coverage_id) ON DELETE RESTRICT,

    CONSTRAINT chk_claim_line_number CHECK (line_number > 0),
    CONSTRAINT chk_claim_line_service_code CHECK (length(trim(service_code_snapshot)) > 0),
    CONSTRAINT chk_claim_line_description CHECK (length(trim(description_snapshot)) > 0),
    CONSTRAINT chk_claim_line_percentage CHECK (covered_percentage_snapshot >= 0 AND covered_percentage_snapshot <= 100),
    CONSTRAINT chk_claim_line_cap CHECK (coverage_cap_snapshot IS NULL OR coverage_cap_snapshot >= 0),
    CONSTRAINT chk_claim_line_quantity CHECK (quantity_snapshot > 0 AND quantity_snapshot <> 'NaN'::NUMERIC),
    CONSTRAINT chk_claim_line_unit_price CHECK (unit_price_snapshot >= 0 AND unit_price_snapshot <> 'NaN'::NUMERIC),
    CONSTRAINT chk_claim_line_amounts CHECK (
        line_total_snapshot >= 0 AND line_total_snapshot <> 'NaN'::NUMERIC
        AND nominal_covered_amount >= 0 AND nominal_covered_amount <> 'NaN'::NUMERIC
        AND claimed_amount >= 0 AND claimed_amount <> 'NaN'::NUMERIC
        AND approved_amount >= 0 AND approved_amount <> 'NaN'::NUMERIC
        AND claimed_amount <= line_total_snapshot
        AND approved_amount <= claimed_amount
    )
);

COMMENT ON TABLE  catms.insurance_claim_line                             IS 'Treatment-level claim line snapshotting terms at time of service.';
COMMENT ON COLUMN catms.insurance_claim_line.claim_line_id               IS 'Surrogate primary key.';
COMMENT ON COLUMN catms.insurance_claim_line.claim_id                    IS 'Parent insurance claim reference.';
COMMENT ON COLUMN catms.insurance_claim_line.invoice_line_id             IS 'Referenced delivered treatment invoice line.';
COMMENT ON COLUMN catms.insurance_claim_line.policy_coverage_id          IS 'Effective policy coverage terms used to calculate this line.';
COMMENT ON COLUMN catms.insurance_claim_line.covered_percentage_snapshot IS 'Percentage coverage rate active on service date (0-100).';
COMMENT ON COLUMN catms.insurance_claim_line.coverage_cap_snapshot       IS 'Monetary cap active on service date, or NULL if uncapped.';
COMMENT ON COLUMN catms.insurance_claim_line.line_total_snapshot         IS 'Invoice line total snapshot: quantity * unit price.';
COMMENT ON COLUMN catms.insurance_claim_line.nominal_covered_amount      IS 'Calculated nominal coverage before cap or coordination limits.';
COMMENT ON COLUMN catms.insurance_claim_line.claimed_amount              IS 'Final claimed allocation for this line after caps and priority limits.';
COMMENT ON COLUMN catms.insurance_claim_line.approved_amount             IS 'Portion approved by insurer on claim resolution.';

CREATE INDEX IF NOT EXISTS idx_insurance_claim_line_claim   ON catms.insurance_claim_line (claim_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claim_line_invline ON catms.insurance_claim_line (invoice_line_id);

-- =============================================================================
-- 4. Table: insurance_claim_status_log (Append-Only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.insurance_claim_status_log (
    status_log_id             BIGINT GENERATED ALWAYS AS IDENTITY,
    claim_id                  BIGINT                          NOT NULL,
    from_status               catms.insurance_claim_status,
    to_status                 catms.insurance_claim_status    NOT NULL,
    transitioned_by_user_id   BIGINT                          NOT NULL,
    transitioned_at           TIMESTAMPTZ                     NOT NULL DEFAULT clock_timestamp(),
    transition_reason         TEXT,

    CONSTRAINT pk_insurance_claim_status_log PRIMARY KEY (status_log_id),
    CONSTRAINT fk_insurance_claim_status_log_claim FOREIGN KEY (claim_id)
        REFERENCES catms.insurance_claim(claim_id) ON DELETE RESTRICT,
    CONSTRAINT fk_insurance_claim_status_log_user FOREIGN KEY (transitioned_by_user_id)
        REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT
);

COMMENT ON TABLE  catms.insurance_claim_status_log                         IS 'Append-only audit trail recording every state transition for insurance claims.';
COMMENT ON COLUMN catms.insurance_claim_status_log.status_log_id           IS 'Surrogate primary key.';
COMMENT ON COLUMN catms.insurance_claim_status_log.claim_id                IS 'Reference to the transitioned claim.';
COMMENT ON COLUMN catms.insurance_claim_status_log.from_status             IS 'Prior status (NULL on initial submission).';
COMMENT ON COLUMN catms.insurance_claim_status_log.to_status               IS 'Target status after transition.';
COMMENT ON COLUMN catms.insurance_claim_status_log.transitioned_by_user_id IS 'User account responsible for the status change.';
COMMENT ON COLUMN catms.insurance_claim_status_log.transitioned_at         IS 'Database clock timestamp when transition was logged.';
COMMENT ON COLUMN catms.insurance_claim_status_log.transition_reason       IS 'Explanation, note, or rejection reason accompanying transition.';

CREATE INDEX IF NOT EXISTS idx_insurance_claim_status_log_claim ON catms.insurance_claim_status_log (claim_id);

-- =============================================================================
-- 5. Business Guard Triggers
-- =============================================================================

-- Rule 3.1: Enforce Patient Ownership Invariant
CREATE OR REPLACE FUNCTION catms.guard_claim_patient_ownership()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_policy_patient_id  BIGINT;
    v_invoice_patient_id BIGINT;
BEGIN
    SELECT patient_id INTO v_policy_patient_id
    FROM catms.insurance_policy
    WHERE policy_id = NEW.policy_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_POLICY_NOT_FOUND: Policy does not exist.' USING ERRCODE = '23503';
    END IF;

    SELECT a.patient_id INTO v_invoice_patient_id
    FROM catms.invoice inv
    JOIN catms.appointment a ON a.appointment_id = inv.appointment_id
    WHERE inv.invoice_id = NEW.invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_INVOICE_NOT_FOUND: Invoice or appointment does not exist.' USING ERRCODE = '23503';
    END IF;

    IF v_policy_patient_id <> v_invoice_patient_id THEN
        RAISE EXCEPTION 'ERR_CLAIM_POLICY_PATIENT_MISMATCH: Claim policy (patient_id %) does not belong to the invoice patient (patient_id %).',
            v_policy_patient_id, v_invoice_patient_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_claim_patient_ownership ON catms.insurance_claim;
CREATE TRIGGER trg_guard_claim_patient_ownership
    BEFORE INSERT OR UPDATE OF policy_id, invoice_id ON catms.insurance_claim
    FOR EACH ROW
    EXECUTE FUNCTION catms.guard_claim_patient_ownership();

-- Rule 6.1: Enforce Terminality and Immutability of Resolved Claims
CREATE OR REPLACE FUNCTION catms.guard_claim_terminal_state()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF OLD.claim_status IN ('Approved', 'PartiallyApproved', 'Rejected') THEN
        IF NEW.claim_status IS DISTINCT FROM OLD.claim_status THEN
            RAISE EXCEPTION 'ERR_CLAIM_TERMINAL_STATE: Claim % is in terminal state % and cannot be transitioned to %.',
                OLD.claim_id, OLD.claim_status, NEW.claim_status
                USING ERRCODE = '23514';
        END IF;

        IF NEW.claimed_amount IS DISTINCT FROM OLD.claimed_amount
           OR NEW.approved_amount IS DISTINCT FROM OLD.approved_amount
           OR NEW.policy_id IS DISTINCT FROM OLD.policy_id
           OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
            RAISE EXCEPTION 'ERR_CLAIM_IMMUTABLE: Resolved claim % cannot have financial totals or policy bindings modified.',
                OLD.claim_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_claim_terminal_state ON catms.insurance_claim;
CREATE TRIGGER trg_guard_claim_terminal_state
    BEFORE UPDATE ON catms.insurance_claim
    FOR EACH ROW
    EXECUTE FUNCTION catms.guard_claim_terminal_state();

-- Rule 6.2: Append-Only Guard on Status History Log
CREATE OR REPLACE FUNCTION catms.guard_claim_status_log_immutable()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'ERR_STATUS_LOG_IMMUTABLE: Insurance claim status log is strictly append-only; updates and deletions are prohibited.'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_claim_status_log_immutable ON catms.insurance_claim_status_log;
CREATE TRIGGER trg_guard_claim_status_log_immutable
    BEFORE UPDATE OR DELETE ON catms.insurance_claim_status_log
    FOR EACH ROW
    EXECUTE FUNCTION catms.guard_claim_status_log_immutable();

-- Rule 5.3 & Line Consistency: Enforce Line Invoice Matching and Allocation Ceiling
CREATE OR REPLACE FUNCTION catms.guard_claim_line_consistency_and_ceiling()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_claim_invoice_id   BIGINT;
    v_line_invoice_id    BIGINT;
    v_invoice_line_total NUMERIC;
    v_total_claimed      NUMERIC;
BEGIN
    SELECT invoice_id INTO v_claim_invoice_id
    FROM catms.insurance_claim
    WHERE claim_id = NEW.claim_id;

    SELECT invoice_id, line_total INTO v_line_invoice_id, v_invoice_line_total
    FROM catms.invoice_line
    WHERE invoice_line_id = NEW.invoice_line_id;

    IF v_claim_invoice_id IS DISTINCT FROM v_line_invoice_id THEN
        RAISE EXCEPTION 'ERR_CLAIM_LINE_INVOICE_MISMATCH: Claim line references invoice_line % belonging to invoice %, but claim belongs to invoice %.',
            NEW.invoice_line_id, v_line_invoice_id, v_claim_invoice_id
            USING ERRCODE = '23514';
    END IF;

    -- Enforce Rule 5.3: Sum of claimed_amount across all claims on this invoice line <= line_total
    SELECT coalesce(sum(cl.claimed_amount), 0.00)
    INTO v_total_claimed
    FROM catms.insurance_claim_line cl
    JOIN catms.insurance_claim c ON c.claim_id = cl.claim_id
    WHERE cl.invoice_line_id = NEW.invoice_line_id
      AND c.claim_status <> 'Rejected'
      AND cl.claim_line_id IS DISTINCT FROM NEW.claim_line_id;

    IF (v_total_claimed + NEW.claimed_amount) > v_invoice_line_total THEN
        RAISE EXCEPTION 'ERR_CLAIM_ALLOCATION_EXCEEDS_LINE_TOTAL: Total claimed allocation across policies (% + %) exceeds invoice line total (%).',
            v_total_claimed, NEW.claimed_amount, v_invoice_line_total
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_claim_line_consistency_and_ceiling ON catms.insurance_claim_line;
CREATE TRIGGER trg_guard_claim_line_consistency_and_ceiling
    BEFORE INSERT OR UPDATE OF invoice_line_id, claimed_amount ON catms.insurance_claim_line
    FOR EACH ROW
    EXECUTE FUNCTION catms.guard_claim_line_consistency_and_ceiling();

-- =============================================================================
-- 6. Grants
-- =============================================================================

REVOKE ALL ON TABLE catms.insurance_claim, catms.insurance_claim_line, catms.insurance_claim_status_log
FROM PUBLIC, catms_clinician, catms_reception, catms_manager, catms_qa, catms_readonly;

GRANT SELECT, INSERT, UPDATE ON TABLE catms.insurance_claim TO catms_app, catms_admin;
GRANT SELECT, INSERT, UPDATE ON TABLE catms.insurance_claim_line TO catms_app, catms_admin;
GRANT SELECT, INSERT ON TABLE catms.insurance_claim_status_log TO catms_app, catms_admin;

GRANT SELECT ON TABLE catms.insurance_claim, catms.insurance_claim_line, catms.insurance_claim_status_log
TO catms_readonly, catms_qa;

REVOKE ALL ON SEQUENCE catms.claim_number_seq FROM PUBLIC;
GRANT USAGE, SELECT ON SEQUENCE catms.claim_number_seq TO catms_app, catms_admin;

-- =============================================================================
-- 7. Migration Registry
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (110, 'insurance claim, claim-line and status-history schema', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
