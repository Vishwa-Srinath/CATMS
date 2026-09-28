-- 021_assignments_schema.sql
-- Test Suite: Schema structure validation for CATMS-016 (Staff & Manager Assignments)
-- Asserts table existence, primary keys, foreign keys (ON DELETE RESTRICT),
-- partial unique indexes, check constraints, and COMMENT ON presence.

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Table existence in schema catms
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name IN ('employee_branch_assignment', 'branch_manager_assignment');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 2 assignment tables, found %', v_count;
    END IF;

    -- 2. Primary Keys existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name IN ('pk_employee_branch_assignment', 'pk_branch_manager_assignment');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected primary keys pk_employee_branch_assignment and pk_branch_manager_assignment, found %', v_count;
    END IF;

    -- 3. Foreign Keys existence with RESTRICT delete rule
    SELECT count(*) INTO v_count
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.table_schema = 'catms'
      AND tc.constraint_name IN (
        'fk_employee_branch_assignment_employee',
        'fk_employee_branch_assignment_branch',
        'fk_branch_manager_assignment_branch',
        'fk_branch_manager_assignment_employee'
      )
      AND rc.delete_rule = 'RESTRICT';

    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 4 FKs with ON DELETE RESTRICT, found %', v_count;
    END IF;

    -- 4. Check Constraints existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
        'chk_employee_branch_assignment_dates',
        'chk_employee_branch_assignment_type',
        'chk_branch_manager_assignment_dates'
      );

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 3 check constraints for dates and assignment type, found %', v_count;
    END IF;

    -- 5. Partial Unique Indexes existence
    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE schemaname = 'catms'
      AND indexname IN ('uq_active_primary_employee_assignment', 'uq_active_branch_manager');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected partial unique indexes uq_active_primary_employee_assignment and uq_active_branch_manager, found %', v_count;
    END IF;

    -- 6. Table Comments presence
    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catms'
      AND c.relname IN ('employee_branch_assignment', 'branch_manager_assignment')
      AND d.objsubid = 0
      AND length(trim(d.description)) > 0;

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected COMMENT ON both assignment tables, found %', v_count;
    END IF;

    -- 7. Column Comments presence
    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catms'
      AND c.relname = 'employee_branch_assignment'
      AND d.objsubid > 0
      AND length(trim(d.description)) > 0;

    IF v_count < 8 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected comments on employee_branch_assignment columns, found %', v_count;
    END IF;

    RAISE NOTICE '✅ 021_assignments_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
