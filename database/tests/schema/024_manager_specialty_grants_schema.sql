-- 024_manager_specialty_grants_schema.sql
-- Test Suite: Schema validation for CATMS-024 (Manager/Specialty Integrity & Database Roles)
-- Asserts existence of database roles, base tables, integrity triggers, and procedure definitions.

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Verify all 5 database security roles exist
    SELECT count(*) INTO v_count
    FROM pg_roles
    WHERE rolname IN (
        'catms_reception',
        'catms_clinician',
        'catms_manager',
        'catms_admin',
        'catms_qa'
    );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 5 database security roles, found %', v_count;
    END IF;

    -- 2. Verify base tables exist
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name IN (
        'invoice',
        'payment',
        'consultation_note_revision'
      );

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 3 base tables (invoice, payment, consultation_note_revision), found %', v_count;
    END IF;

    -- 3. Verify procedure assign_branch_manager exists
    SELECT count(*) INTO v_count
    FROM information_schema.routines
    WHERE specific_schema = 'catms'
      AND routine_type = 'PROCEDURE'
      AND routine_name = 'assign_branch_manager';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: procedure catms.assign_branch_manager not found';
    END IF;

    -- 4. Verify triggers exist
    SELECT count(DISTINCT trigger_name) INTO v_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'catms'
      AND trigger_name IN (
        'trg_validate_branch_manager_integrity',
        'trg_enforce_active_doctor_specialty',
        'trg_enforce_doctor_specialty_count'
      );

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 3 integrity triggers, found %', v_count;
    END IF;

    RAISE NOTICE '✅ 024_manager_specialty_grants_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
