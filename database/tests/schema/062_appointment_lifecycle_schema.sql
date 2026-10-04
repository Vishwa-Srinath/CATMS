-- =============================================================================
-- database/tests/schema/062_appointment_lifecycle_schema.sql
-- Owner: Dev1  |  Issue: CATMS-030  |  Reviewer: Dev4
--
-- Schema assertion suite for migration 062_appointment_lifecycle_procedures.sql.
-- Verifies:
--   1. Tables: appointment_schedule_history, appointment_status_log
--   2. Primary keys on both tables
--   3. Foreign key constraints
--   4. Procedures: reschedule_appointment, update_appointment_status, cancel_appointment
--   5. Migration registry entry (version 62)
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Audit tables exist
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name IN (
          'appointment_schedule_history',
          'appointment_status_log'
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 audit tables (appointment_schedule_history, appointment_status_log) in catms, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Primary keys on both audit tables
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND table_name IN (
          'appointment_schedule_history',
          'appointment_status_log'
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Expected 2 PRIMARY KEY constraints on audit tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Foreign key constraints on audit tables
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema    = 'catms'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
          'fk_app_sch_hist_app',
          'fk_app_sch_hist_emp',
          'fk_app_stat_log_app',
          'fk_app_stat_log_emp'
      );

    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Expected 4 FOREIGN KEY constraints on audit tables, found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Lifecycle procedures exist
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname IN (
          'reschedule_appointment',
          'update_appointment_status',
          'cancel_appointment'
      )
      AND p.prokind = 'p';   -- 'p' = procedure

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 lifecycle procedures (reschedule, update_status, cancel), found %', v_count;
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Migration registry entry
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version = 62;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Migration version 62 not recorded in catms.schema_migrations';
    END IF;


    RAISE NOTICE 'CATMS-030 appointment lifecycle schema assertions all passed OK (5 checks)';
END;
$$;

ROLLBACK;
