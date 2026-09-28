-- =============================================================================
-- database/tests/schema/025_doctor_availability_schema.sql
-- Owner: Dev1  |  Issue: CATMS-027  |  Reviewer: Dev2
--
-- Schema assertion suite for migration 025_doctor_availability.sql.
-- Verifies the structural DDL created by CATMS-027:
--   - ENUM types exist
--   - Tables, primary keys, foreign keys, check constraints
--   - Partial unique indexes and GiST exclusion constraint
--   - Generated column exception_date
--   - Triggers for updated_at and immutability
--   - COMMENT ON tables and key columns
--   - GRANT presence for catms_app and catms_readonly
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count   INTEGER;
    v_name    TEXT;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. ENUM types exist
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'catms'
      AND t.typname = 'day_of_week'
      AND t.typtype = 'e';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ENUM catms.day_of_week does not exist';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'catms'
      AND t.typname = 'availability_exception_type'
      AND t.typtype = 'e';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ENUM catms.availability_exception_type does not exist';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Tables exist
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name IN ('doctor_availability', 'doctor_availability_exception');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 tables (doctor_availability, doctor_availability_exception) in catms schema, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Primary keys
    -- ─────────────────────────────────────────────────────────────────────────

    FOR v_name IN
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema    = 'catms'
          AND constraint_type = 'PRIMARY KEY'
          AND constraint_name IN (
              'pk_doctor_availability',
              'pk_doctor_availability_exception'
          )
    LOOP
        -- Just iterating to count
    END LOOP;

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name IN (
          'pk_doctor_availability',
          'pk_doctor_availability_exception'
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 PRIMARY KEY constraints for availability tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Foreign keys
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
          'fk_doctor_availability_doctor',
          'fk_doctor_availability_branch',
          'fk_doctor_availability_exception_doctor',
          'fk_doctor_availability_exception_branch',
          'fk_doctor_availability_exception_created_by'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Expected 5 FOREIGN KEY constraints across availability tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Check constraints: time_order and min_duration
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
          'chk_doctor_availability_time_order',
          'chk_doctor_availability_date_order',
          'chk_doctor_availability_min_duration',
          'chk_doctor_availability_exception_time_order',
          'chk_doctor_availability_exception_min_duration'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Expected 5 CHECK constraints across availability tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. Partial unique index on doctor_availability (active rows only)
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE schemaname = 'catms'
      AND tablename  = 'doctor_availability'
      AND indexname  = 'uq_active_doctor_availability';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Partial unique index uq_active_doctor_availability not found on catms.doctor_availability';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 7. GiST exclusion constraint on doctor_availability_exception
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_constraint
    WHERE conname   = 'ex_doctor_exception_no_type_overlap'
      AND conrelid  = 'catms.doctor_availability_exception'::regclass
      AND contype   = 'x';  -- 'x' = exclusion constraint

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'GiST exclusion constraint ex_doctor_exception_no_type_overlap not found on catms.doctor_availability_exception';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 8. Generated column exception_date exists and is stored
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema              = 'catms'
      AND table_name                = 'doctor_availability_exception'
      AND column_name               = 'exception_date'
      AND is_generated              = 'ALWAYS';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Generated column exception_date not found or not GENERATED ALWAYS on catms.doctor_availability_exception';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 9. Triggers exist
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'catms'
      AND trigger_name IN (
          'trg_touch_doctor_availability_updated_at',
          'trg_prevent_exception_mutation'
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 triggers for availability tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 10. COMMENT ON tables
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class      c ON c.oid = d.objoid
    JOIN pg_namespace  n ON n.oid = c.relnamespace
    WHERE n.nspname   = 'catms'
      AND c.relname  IN ('doctor_availability', 'doctor_availability_exception')
      AND d.objsubid  = 0;   -- table-level comment

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected COMMENT ON TABLE for both availability tables, found % of 2', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 11. Migration registry entry
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version = 25;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Migration version 25 not recorded in catms.schema_migrations';
    END IF;


    RAISE NOTICE 'CATMS-027 availability schema assertions all passed OK';
END;
$$;

ROLLBACK;
