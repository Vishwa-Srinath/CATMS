-- =============================================================================
-- database/tests/schema/110_insurance_claim_schema.sql
-- Owner: Dev3 (Patient Identity, Insurance & Claims) | Issue: CATMS-037 | Reviewer: Dev4
--
-- Schema assertion suite for insurance claims, lines, and lifecycle procedures.
-- Verifies:
--   1. ENUM types: insurance_claim_status
--   2. Tables exist: insurance_claim, insurance_claim_line, insurance_claim_status_log
--   3. Primary keys
--   4. Unique constraints
--   5. Foreign key constraints
--   6. Check constraints
--   7. Stored procedures / functions exist
--   8. Triggers exist
--   9. Table and column comments
--  10. Migration registry entries (versions 110, 111, 112)
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- ─────────────────────────────────────────────────────────────────────────
    -- 1. ENUM type exists
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'catms'
      AND t.typname = 'insurance_claim_status'
      AND t.typtype = 'e';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: ENUM catms.insurance_claim_status does not exist';
    END IF;

    -- Verify enum labels
    SELECT count(*) INTO v_count
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'catms'
      AND t.typname = 'insurance_claim_status'
      AND e.enumlabel IN ('Pending', 'Approved', 'PartiallyApproved', 'Rejected');
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: ENUM catms.insurance_claim_status does not have exactly 4 valid states';
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 2. Tables exist
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name IN ('insurance_claim', 'insurance_claim_line', 'insurance_claim_status_log');
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Expected 3 claims tables in catms schema, found %', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 3. Primary keys
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND table_name IN ('insurance_claim', 'insurance_claim_line', 'insurance_claim_status_log');
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Missing primary key on claims tables (found % of 3)', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 4. Unique constraints
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'UNIQUE'
      AND constraint_name IN (
          'uq_insurance_claim_number',
          'uq_invoice_policy_claim',
          'uq_claim_line_claim_invoice',
          'uq_claim_line_number'
      );
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Expected 4 unique constraints, found %', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 5. Foreign keys
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
          'fk_insurance_claim_invoice',
          'fk_insurance_claim_policy',
          'fk_insurance_claim_submitted_by',
          'fk_insurance_claim_line_claim',
          'fk_insurance_claim_line_invoice_line',
          'fk_insurance_claim_status_log_claim',
          'fk_insurance_claim_status_log_user'
      );
    IF v_count < 7 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Expected at least 7 foreign key constraints, found %', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 6. Check constraints
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM information_schema.check_constraints
    WHERE constraint_schema = 'catms'
      AND constraint_name IN (
          'chk_insurance_claim_amounts',
          'chk_insurance_claim_resolution_state',
          'chk_claim_line_percentage',
          'chk_claim_line_amounts'
      );
    IF v_count < 4 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Expected check constraints missing (found % of 4)', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 7. Functions / Stored Procedures
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname IN ('submit_claim', 'resolve_claim');
    IF v_count < 2 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Stored functions submit_claim / resolve_claim missing (found %)', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 8. Triggers
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'catms'
      AND trigger_name IN (
          'trg_guard_claim_patient_ownership',
          'trg_guard_claim_terminal_state',
          'trg_guard_claim_status_log_immutable',
          'trg_guard_claim_line_consistency_and_ceiling'
      );
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Expected 4 business guard triggers, found %', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 9. Comments
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catms'
      AND c.relname IN ('insurance_claim', 'insurance_claim_line', 'insurance_claim_status_log')
      AND d.objsubid = 0;
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: All claims tables must have table comments (found % of 3)', v_count;
    END IF;

    -- ─────────────────────────────────────────────────────────────────────────
    -- 10. Migration registry entries
    -- ─────────────────────────────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version IN (110, 111, 112);
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'ASSERTION FAILED: Expected migration registry entries 110, 111, 112 (found % of 3)', v_count;
    END IF;

    RAISE NOTICE 'SUCCESS: 110_insurance_claim_schema passed all assertions.';
END;
$$;

ROLLBACK;
