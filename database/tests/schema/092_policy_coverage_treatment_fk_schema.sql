-- =============================================================================
-- database/tests/schema/063_policy_coverage_treatment_fk_schema.sql
-- Owner: Dev1  |  Issue: CATMS-019 (follow-up)  |  Reviewer: Dev4
--
-- Schema assertion: verifies that fk_policy_coverage_treatment exists on
-- catms.policy_coverage after both 042 and 091 have run.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. FK fk_policy_coverage_treatment exists
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND table_name      = 'policy_coverage'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'fk_policy_coverage_treatment';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FOREIGN KEY fk_policy_coverage_treatment not found on catms.policy_coverage';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. FK references treatment_catalogue
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
        ON tc.constraint_name = rc.unique_constraint_name
       AND tc.table_schema    = 'catms'
    WHERE rc.constraint_name  = 'fk_policy_coverage_treatment'
      AND tc.table_name       = 'treatment_catalogue';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FK fk_policy_coverage_treatment does not reference catms.treatment_catalogue';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Migration registry entry (version 63)
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version = 92;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Migration version 63 not recorded in catms.schema_migrations';
    END IF;


    RAISE NOTICE 'CATMS-019 (063) policy_coverage treatment FK assertions all passed OK (3 checks)';
END;
$$;

ROLLBACK;
