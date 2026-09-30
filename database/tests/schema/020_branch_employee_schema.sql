-- 020_branch_employee_schema.sql
-- Test Suite: Schema validation for CATMS-015 (Branch & Employee)
-- Asserts table existence, primary keys, unique constraints, check constraints,
-- column types, and COMMENT ON presence.

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Table existence in schema catms
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms' AND table_name IN ('branch', 'employee');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 2 tables in catms schema, found %', v_count;
    END IF;

    -- 2. Primary Keys existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name IN ('pk_branch', 'pk_employee');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected primary keys pk_branch and pk_employee, found %', v_count;
    END IF;

    -- 3. Unique Constraints existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'UNIQUE'
      AND constraint_name IN (
        'uq_branch_branch_code',
        'uq_branch_name',
        'uq_employee_employee_number',
        'uq_employee_nic'
      );

    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 4 unique constraints, found %', v_count;
    END IF;

    -- 4. Check Constraints existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
        'chk_employee_gender',
        'chk_employee_date_of_birth_past',
        'chk_employee_position',
        'chk_employee_employment_status',
        'chk_employee_termination_consistency'
      );

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 5 employee check constraints, found %', v_count;
    END IF;

    -- 5. Column Types (citext for identifiers)
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'catms'
      AND table_name = 'branch'
      AND column_name = 'branch_code'
      AND udt_name = 'citext';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: branch_code must be citext';
    END IF;

    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'catms'
      AND table_name = 'employee'
      AND column_name IN ('employee_number', 'nic')
      AND udt_name = 'citext';

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: employee_number and nic must be citext';
    END IF;

    -- 6. Table Comments presence
    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catms'
      AND c.relname IN ('branch', 'employee')
      AND d.objsubid = 0
      AND length(trim(d.description)) > 0;

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected COMMENT ON both branch and employee tables, found %', v_count;
    END IF;

    -- 7. Column Comments presence
    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catms'
      AND c.relname = 'employee'
      AND d.objsubid > 0
      AND length(trim(d.description)) > 0;

    IF v_count < 10 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected comments on employee columns, found %', v_count;
    END IF;

    RAISE NOTICE '✅ 020_branch_employee_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
