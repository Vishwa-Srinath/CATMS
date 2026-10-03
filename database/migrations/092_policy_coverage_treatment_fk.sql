-- =============================================================================
-- 063_policy_coverage_treatment_fk.sql
-- Module: B-patient-insurance (cross-module FK)
-- Owner: Dev1 (Dev1 second block 060-089 — cross-module constraint)
-- Issue: CATMS-019 (follow-up)
-- Dependencies:
--   042_insurance_provider_policy_coverage.sql (catms.policy_coverage)
--   091_treatment_catalogue.sql (catms.treatment_catalogue)
--
-- Purpose:
--   Adds the FOREIGN KEY from policy_coverage.treatment_id to
--   treatment_catalogue. This could not be added in migration 042
--   because treatment_catalogue (migration 091) runs after it under
--   ADR-009 migration number ownership rules (Dev3: 040-059, Dev4: 090-129).
--   Migration 063 is in Dev1's second block (060-089) and runs after both.
-- =============================================================================

BEGIN;

ALTER TABLE catms.policy_coverage
    ADD CONSTRAINT fk_policy_coverage_treatment
    FOREIGN KEY (treatment_id)
    REFERENCES catms.treatment_catalogue(treatment_id)
    ON DELETE RESTRICT;

COMMENT ON COLUMN catms.policy_coverage.treatment_id IS
    'FK to treatment_catalogue. Coverage is treatment-specific (Rule 3.5 of CATMS-006). '
    'Referential integrity enforced here (063) after treatment_catalogue was created in 091.';

-- Grant (catms_app already has SELECT, INSERT, UPDATE from 042, no new grants needed)

-- Record migration
INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (92, 'policy_coverage treatment FK — cross-module constraint after 091', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
