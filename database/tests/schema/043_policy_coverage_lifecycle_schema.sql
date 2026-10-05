-- =============================================================================
-- database/tests/schema/043_policy_coverage_lifecycle_schema.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims)
-- Issue: CATMS-026 (Phase G2 — Step 6)
--
-- Schema assertion suite for 043_policy_coverage_lifecycle_procedures.sql
-- Verifies:
--   1. Procedures exist: create_insurance_provider, create_insurance_policy,
--      update_policy_status, add_policy_coverage, update_policy_coverage
--   2. Functions exist: get_effective_coverage
--   3. COMMENT ON exists for all routines
--   4. Role permissions: EXECUTE granted to catms_app / catms_readonly
--   5. Migration registry entry for version 43
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Procedures exist in catms schema
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname IN (
          'create_insurance_provider',
          'create_insurance_policy',
          'update_policy_status',
          'add_policy_coverage',
          'update_policy_coverage'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 5 procedures in catms schema, found %', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Function exists in catms schema
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname = 'get_effective_coverage';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected function catms.get_effective_coverage to exist';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Comments exist on all 6 routines
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_proc p ON p.oid = d.objoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname IN (
          'create_insurance_provider',
          'create_insurance_policy',
          'update_policy_status',
          'add_policy_coverage',
          'update_policy_coverage',
          'get_effective_coverage'
      )
      AND length(trim(d.description)) > 0;

    IF v_count <> 6 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected descriptions on 6 routines, found %', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Role permissions
    -- ─────────────────────────────────────────────────────────────────────────

    -- catms_app EXECUTE privileges
    SELECT count(DISTINCT routine_name) INTO v_count
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'catms'
      AND routine_name IN (
          'create_insurance_provider',
          'create_insurance_policy',
          'update_policy_status',
          'add_policy_coverage',
          'update_policy_coverage',
          'get_effective_coverage'
      )
      AND grantee = 'catms_app'
      AND privilege_type = 'EXECUTE';

    IF v_count <> 6 THEN
        RAISE EXCEPTION 'Schema assertion failed: catms_app missing EXECUTE privileges on lifecycle routines, found % of 6', v_count;
    END IF;

    -- catms_readonly EXECUTE privilege on get_effective_coverage
    SELECT count(*) INTO v_count
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'catms'
      AND routine_name = 'get_effective_coverage'
      AND grantee = 'catms_readonly'
      AND privilege_type = 'EXECUTE';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: catms_readonly missing EXECUTE privilege on get_effective_coverage';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Migration registry entry
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version = 43;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: migration version 43 not recorded in catms.schema_migrations';
    END IF;

    RAISE NOTICE '✅ 043_policy_coverage_lifecycle_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
