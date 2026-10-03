-- =============================================================================
-- database/tests/schema/042_insurance_provider_policy_coverage_schema.sql
-- Owner: Dev1 (on behalf of Dev3)  |  Issue: CATMS-019  |  Reviewer: Dev4
--
-- Schema assertion suite for 042_insurance_provider_policy_coverage.sql
-- Verifies:
--   1. ENUM types: insurance_provider_status, insurance_policy_status
--   2. Tables exist: insurance_provider, insurance_policy, policy_coverage
--   3. Primary keys
--   4. Unique constraints
--   5. Foreign key constraints
--   6. Check constraints (percentage, cap, dates)
--   7. GiST exclusion on policy_coverage date ranges
--   8. Indexes
--   9. Triggers
--  10. Migration registry entry (version 42)
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. ENUM types exist
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'catms'
      AND t.typname = 'insurance_provider_status'
      AND t.typtype = 'e';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ENUM catms.insurance_provider_status does not exist';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'catms'
      AND t.typname = 'insurance_policy_status'
      AND t.typtype = 'e';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ENUM catms.insurance_policy_status does not exist';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Tables exist
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name IN ('insurance_provider', 'insurance_policy', 'policy_coverage');
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 insurance tables in catms schema, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Primary keys
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name IN (
          'pk_insurance_provider',
          'pk_insurance_policy',
          'pk_policy_coverage'
      );
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 PRIMARY KEY constraints on insurance tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Unique constraints
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'UNIQUE'
      AND constraint_name IN (
          'uq_insurance_provider_code',
          'uq_insurance_provider_name',
          'uq_insurance_policy_provider_number'
      );
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 UNIQUE constraints on insurance tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Foreign key constraints
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
          'fk_insurance_policy_patient',
          'fk_insurance_policy_provider',
          'fk_policy_coverage_policy'
          -- NOTE: fk_policy_coverage_treatment is verified in 063 schema test
      );
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 FOREIGN KEY constraints on insurance tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. Check constraints
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
          'chk_insurance_provider_code_noemp',
          'chk_insurance_provider_name_noemp',
          'chk_insurance_policy_policy_number_noemp',
          'chk_insurance_policy_valid_dates',
          'chk_policy_coverage_percentage',
          'chk_policy_coverage_cap',
          'chk_policy_coverage_dates'
      );
    IF v_count <> 7 THEN
        RAISE EXCEPTION 'Expected 7 CHECK constraints on insurance tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 7. GiST exclusion on policy_coverage
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_constraint
    WHERE conname  = 'ex_policy_coverage_no_date_overlap'
      AND conrelid = 'catms.policy_coverage'::regclass
      AND contype  = 'x';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'GiST exclusion constraint ex_policy_coverage_no_date_overlap not found on catms.policy_coverage';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 8. Indexes
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE schemaname = 'catms'
      AND indexname IN (
          'idx_insurance_policy_patient',
          'idx_policy_coverage_lookup'
      );
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 performance indexes on insurance tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 9. Triggers
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'catms'
      AND trigger_name IN (
          'trg_touch_insurance_provider_updated_at',
          'trg_touch_insurance_policy_updated_at'
      );
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 updated_at triggers on insurance tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 10. Migration registry entry
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version = 42;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Migration version 42 not recorded in catms.schema_migrations';
    END IF;


    RAISE NOTICE 'CATMS-019 insurance schema assertions all passed OK (10 checks)';
END;
$$;

ROLLBACK;
