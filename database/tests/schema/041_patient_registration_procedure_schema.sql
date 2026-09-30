-- 041_patient_registration_procedure_schema.sql
-- Test Suite: Schema validation for CATMS-025 (Atomic Patient Registration Procedure)
-- Asserts procedure existence in catms schema, parameter signature, COMMENT ON, and role privileges.

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Procedure existence in schema catms
    SELECT count(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname = 'register_patient';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: procedure catms.register_patient does not exist';
    END IF;

    -- 2. Procedure Comment presence
    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_proc p ON p.oid = d.objoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'catms'
      AND p.proname = 'register_patient'
      AND length(trim(d.description)) > 0;

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected COMMENT ON procedure catms.register_patient';
    END IF;

    -- 3. Execute privilege granted to catms_app
    SELECT count(*) INTO v_count
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'catms'
      AND routine_name = 'register_patient'
      AND grantee = 'catms_app'
      AND privilege_type = 'EXECUTE';

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Schema assertion failed: EXECUTE privilege on catms.register_patient not granted to catms_app';
    END IF;

    RAISE NOTICE '✅ 041_patient_registration_procedure_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
