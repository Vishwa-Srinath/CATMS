-- =============================================================================
-- database/tests/schema/060_appointment_schema.sql
-- Owner: Dev1  |  Issue: CATMS-028  |  Reviewer: Dev4
--
-- Schema assertion suite for migration 060_appointment_schema.sql.
-- Verifies:
--   1. ENUM types: appointment_status, booking_type
--   2. Table catms.appointment exists
--   3. Primary key constraint
--   4. Foreign key constraints (patient, doctor, branch, specialty, created_by)
--   5. CHECK constraints (15-min grid, duration)
--   6. GiST exclusion constraint (no double-booking)
--   7. Performance indexes
--   8. updated_at trigger
--   9. COMMENT ON table
--  10. Migration registry entry (version 60)
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
      AND t.typname = 'appointment_status'
      AND t.typtype = 'e';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ENUM catms.appointment_status does not exist';
    END IF;

    SELECT count(*) INTO v_count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'catms'
      AND t.typname = 'booking_type'
      AND t.typtype = 'e';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ENUM catms.booking_type does not exist';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Table exists
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name   = 'appointment';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Table catms.appointment does not exist';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Primary key
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND table_name      = 'appointment'
      AND constraint_type = 'PRIMARY KEY';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'PRIMARY KEY on catms.appointment not found';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Foreign key constraints
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND table_name      = 'appointment'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
          'fk_appointment_patient',
          'fk_appointment_doctor',
          'fk_appointment_branch',
          'fk_appointment_specialty',
          'fk_appointment_created_by'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Expected 5 FOREIGN KEY constraints on catms.appointment, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. CHECK constraints (15-min grid + duration)
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND table_name      = 'appointment'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
          'chk_appointment_start_minute_15',
          'chk_appointment_start_second_0',
          'chk_appointment_end_minute_15',
          'chk_appointment_end_second_0',
          'chk_appointment_duration'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Expected 5 CHECK constraints on catms.appointment, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. GiST exclusion constraint (no double-booking)
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_constraint
    WHERE conname  = 'ex_appointment_doctor_time_no_overlap'
      AND conrelid = 'catms.appointment'::regclass
      AND contype  = 'x';   -- 'x' = exclusion

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'GiST exclusion constraint ex_appointment_doctor_time_no_overlap not found on catms.appointment';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 7. Performance indexes
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE schemaname = 'catms'
      AND tablename  = 'appointment'
      AND indexname IN (
          'idx_appointment_patient',
          'idx_appointment_doctor_start',
          'idx_appointment_branch_start'
      );

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 performance indexes on catms.appointment, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 8. updated_at trigger exists
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'catms'
      AND trigger_name   = 'trg_touch_appointment_updated_at'
      AND event_object_table = 'appointment';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Trigger trg_touch_appointment_updated_at not found on catms.appointment';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 9. COMMENT ON table
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class     c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname   = 'catms'
      AND c.relname   = 'appointment'
      AND d.objsubid  = 0;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'COMMENT ON TABLE catms.appointment not found';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 10. Migration registry entry
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version = 60;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Migration version 60 not recorded in catms.schema_migrations';
    END IF;


    RAISE NOTICE 'CATMS-028 appointment schema assertions all passed OK (10 checks)';
END;
$$;

ROLLBACK;
