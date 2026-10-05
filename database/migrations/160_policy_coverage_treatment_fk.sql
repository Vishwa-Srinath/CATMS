-- =============================================================================
-- 160_policy_coverage_treatment_fk.sql
-- Module: B-patient-insurance (cross-module FK)
-- Owner: Dev3 (Module B-patient-insurance) with Dev1 cross-module coordination
-- Issue: CATMS-019 (cross-module FK follow-up)
-- Dependencies:
--   042_insurance_provider_policy_coverage.sql (catms.policy_coverage)
--   091_treatment_catalogue.sql (catms.treatment_catalogue)
--
-- Purpose:
--   Ensures the FOREIGN KEY from policy_coverage.treatment_id to
--   treatment_catalogue exists and is correct.
--
--   Migration 091 (Dev4) already contains an idempotent DO block that adds
--   this FK when policy_coverage exists. This migration is the authoritative
--   cross-module FK bridge and validates the constraint is correctly defined
--   regardless of which migration created it first.
--
--   Strategy (from CI recommendation):
--     - If the constraint does not exist: ADD it.
--     - If the constraint exists: verify it references the correct table.
--     - If it exists but references the wrong table: RAISE EXCEPTION.
--   This avoids silently accepting a wrongly-defined constraint.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_constraint_oid OID;
BEGIN
    -- Check whether fk_policy_coverage_treatment already exists
    SELECT c.oid
      INTO v_constraint_oid
      FROM pg_constraint c
      JOIN pg_class     t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'catms'
       AND t.relname = 'policy_coverage'
       AND c.conname = 'fk_policy_coverage_treatment';

    IF v_constraint_oid IS NULL THEN
        -- Constraint does not exist yet: add it now
        ALTER TABLE catms.policy_coverage
            ADD CONSTRAINT fk_policy_coverage_treatment
            FOREIGN KEY (treatment_id)
            REFERENCES catms.treatment_catalogue(treatment_id)
            ON DELETE RESTRICT;

        RAISE NOTICE 'fk_policy_coverage_treatment created by migration 092';

    ELSE
        -- Constraint exists (added by 091 DO block): validate it is correct
        IF NOT EXISTS (
            SELECT 1
              FROM pg_constraint c
             WHERE c.oid       = v_constraint_oid
               AND c.contype   = 'f'
               AND c.conrelid  = 'catms.policy_coverage'::regclass
               AND c.confrelid = 'catms.treatment_catalogue'::regclass
        ) THEN
            RAISE EXCEPTION
                'fk_policy_coverage_treatment exists but references the wrong table — manual inspection required';
        END IF;

        RAISE NOTICE 'fk_policy_coverage_treatment already exists and is correct — skipping ADD CONSTRAINT';
    END IF;
END;
$$;

COMMENT ON COLUMN catms.policy_coverage.treatment_id IS
    'FK to treatment_catalogue. Coverage is treatment-specific (Rule 3.5 of CATMS-006). '
    'Referential integrity enforced here (160) after treatment_catalogue was created in 091.';

-- Record migration
INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (160, 'policy_coverage treatment FK — cross-module constraint after 091', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
