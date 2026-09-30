-- 040_patient_identity_schema.sql
-- Test Suite: Schema validation for CATMS-018 (Patient, Identity & Emergency Contact)
-- Asserts table existence, primary keys, foreign keys, unique constraints, check constraints,
-- partial indexes, column types, and triggers in schema catms.

BEGIN;

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- 1. Table existence in schema catms
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms' 
      AND table_name IN ('patient', 'patient_identity', 'emergency_contact');

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 3 tables (patient, patient_identity, emergency_contact) in catms schema, found %', v_count;
    END IF;

    -- 2. Primary Keys existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name IN ('pk_patient', 'pk_patient_identity', 'pk_emergency_contact');

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected primary keys pk_patient, pk_patient_identity, pk_emergency_contact, found %', v_count;
    END IF;

    -- 3. Foreign Keys existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name IN (
          'fk_patient_registered_branch',
          'fk_patient_registered_by',
          'fk_patient_identity_patient',
          'fk_emergency_contact_patient'
      );

    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 4 foreign keys, found %', v_count;
    END IF;

    -- 4. Unique Constraints existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'UNIQUE'
      AND constraint_name IN (
          'uq_patient_patient_number',
          'uq_patient_identity_clinic_wide'
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 2 unique constraints, found %', v_count;
    END IF;

    -- 5. Partial Unique Indexes existence
    SELECT count(*) INTO v_count
    FROM pg_indexes
    WHERE schemaname = 'catms'
      AND indexname IN ('uq_patient_primary_identity', 'uq_patient_primary_contact');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected partial unique indexes for primary identity and primary contact, found %', v_count;
    END IF;

    -- 6. Check Constraints existence
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema = 'catms'
      AND constraint_type = 'CHECK'
      AND constraint_name IN (
          'chk_patient_gender',
          'chk_patient_blood_group',
          'chk_patient_dob',
          'chk_patient_identity_type'
      );

    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 4 check constraints, found %', v_count;
    END IF;

    -- 7. Column Types (citext for email and identity_number)
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'catms'
      AND (
          (table_name = 'patient' AND column_name = 'email' AND udt_name = 'citext') OR
          (table_name = 'patient_identity' AND column_name = 'identity_number' AND udt_name = 'citext')
      );

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected citext on patient.email and patient_identity.identity_number, found %', v_count;
    END IF;

    -- 8. Mandatory integrity triggers
    SELECT count(DISTINCT trigger_name) INTO v_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'catms'
      AND trigger_name IN (
          'trg_patient_primary_identity_mandatory',
          'trg_patient_emergency_contact_mandatory',
          'trg_emergency_contact_delete_guard'
      );

    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Schema assertion failed: expected 3 deferred integrity triggers, found %', v_count;
    END IF;

    RAISE NOTICE '✅ 040_patient_identity_schema: All schema assertions passed.';
END;
$$;

ROLLBACK;
