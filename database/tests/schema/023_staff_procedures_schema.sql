-- 023_staff_procedures_schema.sql
-- Test Suite: Schema validation for CATMS-023 (Staff Registration, Assignment & Deactivation Procedures)
-- Asserts procedure existence, routine types, comments, and role execution privileges.

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Verify all 5 procedures exist in schema catms
    SELECT count(DISTINCT routine_name) INTO v_count
    FROM information_schema.routines
    WHERE specific_schema = 'catms'
      AND routine_type = 'PROCEDURE'
      AND routine_name IN (
        'register_employee',
        'register_doctor_profile',
        'transfer_employee_branch',
        'assign_employee_branch',
        'deactivate_employee'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 5 procedures in catms, found %', v_count;
    END IF;

    -- 2. Verify procedure comments exist
    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_description d ON d.objoid = p.oid
    WHERE n.nspname = 'catms'
      AND p.proname IN (
        'register_employee',
        'register_doctor_profile',
        'transfer_employee_branch',
        'assign_employee_branch',
        'deactivate_employee'
      )
      AND length(trim(d.description)) > 0;

    IF v_count < 5 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected comments on all 5 procedures, found %', v_count;
    END IF;

    -- 3. Verify catms_app has execute privilege on the procedures
    SELECT count(DISTINCT routine_name) INTO v_count
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'catms'
      AND grantee = 'catms_app'
      AND privilege_type = 'EXECUTE'
      AND routine_name IN (
        'register_employee',
        'register_doctor_profile',
        'transfer_employee_branch',
        'assign_employee_branch',
        'deactivate_employee'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Schema assertion failed: catms_app must have EXECUTE on all 5 procedures, found %', v_count;
    END IF;

    -- 4. Verify catms_readonly does NOT have execute privilege on the procedures
    SELECT count(*) INTO v_count
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'catms'
      AND grantee = 'catms_readonly'
      AND privilege_type = 'EXECUTE'
      AND routine_name IN (
        'register_employee',
        'register_doctor_profile',
        'transfer_employee_branch',
        'assign_employee_branch',
        'deactivate_employee'
      );

    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Schema assertion failed: catms_readonly must NOT have EXECUTE on state-changing procedures, found %', v_count;
    END IF;

    RAISE NOTICE '✅ 023_staff_procedures_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
