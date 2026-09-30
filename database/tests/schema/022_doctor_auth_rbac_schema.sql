-- 022_doctor_auth_rbac_schema.sql
-- Test Suite: Schema structure validation for CATMS-017 (Doctor, Specialty, User Account, RBAC & Audit)
-- Asserts table existence, primary keys (including shared PK), unique constraints,
-- foreign keys with ON DELETE RESTRICT, role seed data, and COMMENT ON presence.

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Verify all 7 tables exist in schema catms
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name IN (
        'doctor_profile',
        'specialty',
        'doctor_specialty',
        'user_account',
        'app_role',
        'user_account_role',
        'audit_event'
      );

    IF v_count <> 7 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 7 tables in catms, found %', v_count;
    END IF;

    -- 2. Primary Keys existence on all 7 tables
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name IN (
        'pk_doctor_profile',
        'pk_specialty',
        'pk_doctor_specialty',
        'pk_user_account',
        'pk_app_role',
        'pk_user_account_role',
        'pk_audit_event'
      );

    IF v_count <> 7 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 7 primary keys, found %', v_count;
    END IF;

    -- 3. Unique Constraints existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'UNIQUE'
      AND constraint_name IN (
        'uq_doctor_profile_medical_license_no',
        'uq_specialty_specialty_code',
        'uq_specialty_name',
        'uq_user_account_username',
        'uq_user_account_employee',
        'uq_app_role_role_code'
      );

    IF v_count <> 6 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 6 unique constraints, found %', v_count;
    END IF;

    -- 4. Shared PK and 1:1 Subtype check on doctor_profile
    -- doctor_id is both PK and FK referencing catms.employee(employee_id)
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
      AND tc.constraint_schema = rc.constraint_schema
    WHERE tc.table_schema = 'catms'
      AND tc.table_name = 'doctor_profile'
      AND tc.constraint_name = 'fk_doctor_profile_employee'
      AND rc.delete_rule = 'RESTRICT';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Schema assertion failed: doctor_profile must reference employee with ON DELETE RESTRICT';
    END IF;

    -- 5. Canonical Roles exist in catms.app_role
    SELECT count(*) INTO v_count
    FROM catms.app_role
    WHERE role_code IN ('Reception', 'Clinician', 'Manager', 'Admin', 'QA');

    IF v_count <> 5 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 5 pre-seeded canonical roles, found %', v_count;
    END IF;

    -- 6. Retrofitted FKs on assignment tables
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_name IN (
        'fk_employee_branch_assignment_assigned_by',
        'fk_branch_manager_assignment_assigned_by'
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: assignment tables must have FK to user_account';
    END IF;

    -- 7. Table Comments presence
    SELECT count(*) INTO v_count
    FROM pg_description d
    JOIN pg_class c ON c.oid = d.objoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'catms'
      AND c.relname IN ('doctor_profile', 'specialty', 'doctor_specialty', 'user_account', 'app_role', 'user_account_role', 'audit_event')
      AND d.objsubid = 0
      AND length(trim(d.description)) > 0;

    IF v_count < 7 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected comments on all 7 tables, found %', v_count;
    END IF;

    RAISE NOTICE '✅ 022_doctor_auth_rbac_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
