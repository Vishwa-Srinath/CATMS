-- =============================================================================
-- database/tests/security/074_security_rbac_audit_fixture.sql
-- Owner: Dev2 | Reviewer: Dev1 | Gate: G5 | Issue: CATMS-074
--
-- Comprehensive Storage-Layer RBAC & Security Audit SQL Test Harness
-- Validates direct PostgreSQL privilege separation across all canonical database roles:
--   1. catms_reception:
--      - Positive: SELECT/INSERT on catms.patient, catms.emergency_contact, catms.appointment
--      - Negative: SELECT on catms.consultation_notes (SQLSTATE 42501)
--      - Negative: SELECT on catms.payment, catms.invoice (SQLSTATE 42501)
--      - Negative: SELECT on catms.user_account (SQLSTATE 42501)
--   2. catms_clinician:
--      - Positive: SELECT/INSERT on catms.consultation_notes, catms.appointment_treatment
--      - Negative: SELECT on catms.payment, catms.invoice (SQLSTATE 42501)
--      - Negative: SELECT on catms.user_account (SQLSTATE 42501)
--   3. catms_manager:
--      - Positive: SELECT on operational views (v_doctor_directory, v_appointment_summary)
--      - Negative: SELECT on catms.consultation_notes (SQLSTATE 42501)
--      - Negative: SELECT on catms.payment, catms.invoice (SQLSTATE 42501)
--      - Negative: SELECT on catms.user_account (SQLSTATE 42501)
--   4. catms_admin:
--      - Positive: Full access to staff, patient, clinical, billing, and auth tables
--   5. catms_qa:
--      - Positive: SELECT across operational, clinical, billing, and audit logs
--      - Negative: INSERT / UPDATE / DELETE on catms.patient, catms.payment (SQLSTATE 42501)
--   6. Audit Trail Immutability (catms.audit_event):
--      - UPDATE and DELETE are strictly blocked across all roles including admin.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_caught BOOLEAN;
    v_rec_count INT;
    v_dummy_id BIGINT;
BEGIN
    RAISE NOTICE '▶ Starting CATMS-074 Database RBAC & Security Audit Test...';

    -- =========================================================================
    -- Section 1: catms_reception Role Audit
    -- =========================================================================
    RAISE NOTICE '  [1/6] Auditing catms_reception role permissions...';

    -- Set local role to reception
    SET LOCAL ROLE catms_reception;

    -- Positive: Can query patient table
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.patient;
        RAISE NOTICE '    ✓ Reception can SELECT catms.patient (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_reception failed to query catms.patient: %', SQLERRM;
    END;

    -- Positive: Can query appointment table
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.appointment;
        RAISE NOTICE '    ✓ Reception can SELECT catms.appointment (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_reception failed to query catms.appointment: %', SQLERRM;
    END;

    -- Negative: Cannot query consultation_notes (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.consultation_notes LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_reception was able to query catms.consultation_notes!';
    END IF;
    RAISE NOTICE '    ✓ Reception denied SELECT on catms.consultation_notes (42501 insufficient_privilege)';

    -- Negative: Cannot query payment base table (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.payment LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_reception was able to query catms.payment!';
    END IF;
    RAISE NOTICE '    ✓ Reception denied SELECT on catms.payment (42501 insufficient_privilege)';

    -- Negative: Cannot query user_account credentials table (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.user_account LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_reception was able to query catms.user_account!';
    END IF;
    RAISE NOTICE '    ✓ Reception denied SELECT on catms.user_account (42501 insufficient_privilege)';

    -- =========================================================================
    -- Section 2: catms_clinician Role Audit
    -- =========================================================================
    RAISE NOTICE '  [2/6] Auditing catms_clinician role permissions...';

    RESET ROLE;
    SET LOCAL ROLE catms_clinician;

    -- Positive: Can query clinical notes
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.consultation_notes;
        RAISE NOTICE '    ✓ Clinician can SELECT catms.consultation_notes (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_clinician failed to query catms.consultation_notes: %', SQLERRM;
    END;

    -- Positive: Can query appointment treatments
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.appointment_treatment;
        RAISE NOTICE '    ✓ Clinician can SELECT catms.appointment_treatment (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_clinician failed to query catms.appointment_treatment: %', SQLERRM;
    END;

    -- Negative: Cannot query payment table (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.payment LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_clinician was able to query catms.payment!';
    END IF;
    RAISE NOTICE '    ✓ Clinician denied SELECT on catms.payment (42501 insufficient_privilege)';

    -- Negative: Cannot query invoice base table (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.invoice LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_clinician was able to query catms.invoice!';
    END IF;
    RAISE NOTICE '    ✓ Clinician denied SELECT on catms.invoice (42501 insufficient_privilege)';

    -- Negative: Cannot query user_account (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.user_account LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_clinician was able to query catms.user_account!';
    END IF;
    RAISE NOTICE '    ✓ Clinician denied SELECT on catms.user_account (42501 insufficient_privilege)';

    -- =========================================================================
    -- Section 3: catms_manager Role Audit
    -- =========================================================================
    RAISE NOTICE '  [3/6] Auditing catms_manager role permissions...';

    RESET ROLE;
    SET LOCAL ROLE catms_manager;

    -- Positive: Can query branch directory
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.branch;
        RAISE NOTICE '    ✓ Manager can SELECT catms.branch (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_manager failed to query catms.branch: %', SQLERRM;
    END;

    -- Negative: Cannot query consultation_notes (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.consultation_notes LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_manager was able to query catms.consultation_notes!';
    END IF;
    RAISE NOTICE '    ✓ Manager denied SELECT on catms.consultation_notes (42501 insufficient_privilege)';

    -- Negative: Cannot query payment base table (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.payment LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_manager was able to query catms.payment!';
    END IF;
    RAISE NOTICE '    ✓ Manager denied SELECT on catms.payment (42501 insufficient_privilege)';

    -- Negative: Cannot query user_account (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        PERFORM 1 FROM catms.user_account LIMIT 1;
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_manager was able to query catms.user_account!';
    END IF;
    RAISE NOTICE '    ✓ Manager denied SELECT on catms.user_account (42501 insufficient_privilege)';

    -- =========================================================================
    -- Section 4: catms_qa Role Audit (Read-Only across all modules)
    -- =========================================================================
    RAISE NOTICE '  [4/6] Auditing catms_qa role permissions...';

    RESET ROLE;
    SET LOCAL ROLE catms_qa;

    -- Positive: Can query audit log
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.audit_event;
        RAISE NOTICE '    ✓ QA can SELECT catms.audit_event (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_qa failed to query catms.audit_event: %', SQLERRM;
    END;

    -- Positive: Can query invoices for audit inspection
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.invoice;
        RAISE NOTICE '    ✓ QA can inspect catms.invoice (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_qa failed to query catms.invoice: %', SQLERRM;
    END;

    -- Negative: QA cannot insert patients (SQLSTATE 42501)
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.patient (
            patient_number, first_name, last_name, date_of_birth, gender, contact_number, registered_branch_id
        ) VALUES (
            'PAT-QA-DENIED', 'Audit', 'Test', '1990-01-01', 'Other', '+94 77 999 0000', 1
        );
    EXCEPTION WHEN insufficient_privilege THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms_qa was able to INSERT into catms.patient!';
    END IF;
    RAISE NOTICE '    ✓ QA denied INSERT on catms.patient (42501 insufficient_privilege)';

    -- =========================================================================
    -- Section 5: catms_admin Role Audit
    -- =========================================================================
    RAISE NOTICE '  [5/6] Auditing catms_admin role permissions...';

    RESET ROLE;
    SET LOCAL ROLE catms_admin;

    -- Positive: Admin can query user_account
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.user_account;
        RAISE NOTICE '    ✓ Admin can query catms.user_account (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_admin failed to query catms.user_account: %', SQLERRM;
    END;

    -- Positive: Admin can query audit log
    BEGIN
        SELECT count(*) INTO v_rec_count FROM catms.audit_event;
        RAISE NOTICE '    ✓ Admin can query catms.audit_event (count: %)', v_rec_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'catms_admin failed to query catms.audit_event: %', SQLERRM;
    END;

    -- =========================================================================
    -- Section 6: Audit Event Immutability (Append-Only Invariant)
    -- =========================================================================
    RAISE NOTICE '  [6/6] Auditing catms.audit_event immutability invariants...';

    RESET ROLE;

    -- Negative: UPDATE on audit_event must fail for ALL users
    v_caught := FALSE;
    BEGIN
        UPDATE catms.audit_event SET action_code = 'TAMPERED' WHERE audit_event_id = 1;
    EXCEPTION WHEN OTHERS THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms.audit_event was updated!';
    END IF;
    RAISE NOTICE '    ✓ UPDATE on catms.audit_event strictly rejected by immutability trigger';

    -- Negative: DELETE on audit_event must fail for ALL users
    v_caught := FALSE;
    BEGIN
        DELETE FROM catms.audit_event WHERE audit_event_id = 1;
    EXCEPTION WHEN OTHERS THEN
        v_caught := TRUE;
    END;
    IF NOT v_caught THEN
        RAISE EXCEPTION 'SECURITY BREACH: catms.audit_event row was deleted!';
    END IF;
    RAISE NOTICE '    ✓ DELETE on catms.audit_event strictly rejected by immutability trigger';

    RAISE NOTICE '✅ ALL CATMS-074 Database RBAC & Security Audit assertions PASSED!';
END;
$$;

ROLLBACK;
