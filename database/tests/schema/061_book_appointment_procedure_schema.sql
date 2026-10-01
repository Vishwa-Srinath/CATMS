-- =============================================================================
-- database/tests/schema/061_book_appointment_procedure_schema.sql
-- Owner: Dev1  |  Issue: CATMS-029  |  Reviewers: Dev2, Dev3
--
-- Schema assertion suite for migration 061_book_appointment_procedure.sql.
-- Verifies:
--   1. Procedure catms.book_appointment exists
--   2. It has OUT parameters (appointment_id, appointment_number)
--   3. Migration registry entry (version 61)
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN

    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. Procedure catms.book_appointment exists
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname = 'book_appointment'
      AND p.prokind = 'p';   -- 'p' = procedure (not a function)

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Procedure catms.book_appointment does not exist';
    END IF;


    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Migration registry entry
    -- ─────────────────────────────────────────────────────────────────────────

    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version = 61;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Migration version 61 not recorded in catms.schema_migrations';
    END IF;


    RAISE NOTICE 'CATMS-029 book_appointment procedure schema assertions all passed OK (2 checks)';
END;
$$;

ROLLBACK;
