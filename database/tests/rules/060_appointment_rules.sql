-- =============================================================================
-- database/tests/rules/060_appointment_rules.sql
-- Owner: Dev1  |  Issue: CATMS-028  |  Reviewer: Dev4
--
-- Business-rule assertions for catms.appointment (ADR-004).
--
-- Test plan:
--   A. Fixture seed (branch, employee, doctor, specialty, patient, user_account)
--   B. Valid appointment inserts successfully
--   C. Overlapping non-cancelled appointment → exclusion_violation (GiST)
--   D. Adjacent (touching boundary) appointments → both succeed (half-open)
--   E. Cancelled appointment CAN overlap a Scheduled one (excluded from GiST)
--   F. start_at not on 15-min boundary → check_violation
--   G. end_at not on 15-min boundary → check_violation
--   H. end_at = start_at → check_violation
--   I. end_at < start_at → check_violation
--   J. Direct SQL double-booking rejected even bypassing the procedure
--
-- All changes are rolled back at the end — no permanent fixture data.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id     BIGINT;
    v_emp_id        BIGINT;
    v_user_id       BIGINT;
    v_doctor_id     BIGINT;
    v_specialty_id  BIGINT;
    v_patient_id    BIGINT;
    v_appt_id       BIGINT;
    v_appt2_id      BIGINT;
    v_ok            BOOLEAN;

    -- A fixed UTC slot for tests: 2026-12-01 09:00–09:30 UTC
    v_slot_start    TIMESTAMPTZ := '2026-12-01 09:00:00+00';
    v_slot_end      TIMESTAMPTZ := '2026-12-01 09:30:00+00';
BEGIN

    -- =========================================================================
    -- A. Prerequisite fixture seed
    --    branch → employee → doctor_profile → specialty → patient → user_account
    -- =========================================================================

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('TST60A', 'Appt Test Branch', '1 Appt Road', 'Colombo', '+94100000001')
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP060TST', 'Appt Doctor', '199112345670V',
        '1991-01-01', 'Male', 'Doctor',
        CURRENT_DATE, 'Active', '+94300000001'
    )
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_emp_id, 'SLMC-060-TST', CURRENT_DATE - INTERVAL '3 years');

    v_doctor_id := v_emp_id;

    INSERT INTO catms.specialty (specialty_code, name, is_active)
    VALUES ('TST60', 'Test Specialty 60', TRUE)
    RETURNING specialty_id INTO v_specialty_id;

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_doctor_id, v_specialty_id, TRUE);

    -- Patient registration requires: patient + patient_identity + emergency_contact in same txn
    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number,
        registered_branch_id
    )
    VALUES ('PAT-060-TST', 'Test', 'Patient', '1990-06-15', 'Male', '+94700000001', v_branch_id)
    RETURNING patient_id INTO v_patient_id;

    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_id, 'NIC', '199012360001V', TRUE);

    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'Test EC', 'Sibling', '+94700000002', TRUE);

    INSERT INTO catms.user_account (employee_id, username, password_hash, account_status)
    VALUES (v_emp_id, 'appttest060', '$2b$12$0123456789012345678901', 'ACTIVE')
    RETURNING user_account_id INTO v_user_id;


    -- =========================================================================
    -- B. Valid appointment inserts successfully (direct SQL)
    -- =========================================================================

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, booking_type, created_by
    )
    VALUES (
        'APT-060-TEST-001', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
        v_slot_start, v_slot_end, 'Booked', v_user_id
    )
    RETURNING appointment_id INTO v_appt_id;

    IF v_appt_id IS NULL THEN
        RAISE EXCEPTION 'Test B FAILED: valid appointment did not insert';
    END IF;


    -- =========================================================================
    -- C. Overlapping non-cancelled appointment → exclusion_violation (GiST)
    --    The new appointment [09:15, 09:45) overlaps B [09:00, 09:30)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.appointment (
            appointment_number, patient_id, doctor_id, branch_id, specialty_id,
            start_at, end_at, booking_type, created_by
        )
        VALUES (
            'APT-060-TEST-002', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
            '2026-12-01 09:15:00+00', '2026-12-01 09:45:00+00', 'Booked', v_user_id
        );
        RAISE EXCEPTION 'Test C FAILED: overlapping appointment was accepted';
    EXCEPTION
        WHEN exclusion_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test C FAILED: expected exclusion_violation for overlapping appointment';
    END IF;


    -- =========================================================================
    -- D. Adjacent appointments (touching boundary) → both accepted (half-open interval)
    --    B ends at 09:30, new starts at 09:30 — no overlap
    -- =========================================================================

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, booking_type, created_by
    )
    VALUES (
        'APT-060-TEST-003', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
        '2026-12-01 09:30:00+00', '2026-12-01 10:00:00+00', 'Booked', v_user_id
    )
    RETURNING appointment_id INTO v_appt2_id;

    IF v_appt2_id IS NULL THEN
        RAISE EXCEPTION 'Test D FAILED: adjacent (non-overlapping) appointment was rejected';
    END IF;


    -- =========================================================================
    -- E. Cancelled appointment CAN overlap a Scheduled one
    --    Mark B as Cancelled, then re-use the same slot — must succeed
    -- =========================================================================

    UPDATE catms.appointment SET status = 'Cancelled' WHERE appointment_id = v_appt_id;

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, booking_type, created_by
    )
    VALUES (
        'APT-060-TEST-004', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
        v_slot_start, v_slot_end, 'Booked', v_user_id
    );
    -- If we get here without error, test E passed.


    -- =========================================================================
    -- F. start_at not on 15-min boundary → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.appointment (
            appointment_number, patient_id, doctor_id, branch_id, specialty_id,
            start_at, end_at, booking_type, created_by
        )
        VALUES (
            'APT-060-TEST-F', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
            '2026-12-01 11:07:00+00', '2026-12-01 11:30:00+00', 'Booked', v_user_id
        );
        RAISE EXCEPTION 'Test F FAILED: non-15-min start_at was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test F FAILED: expected check_violation for start_at not on 15-min grid';
    END IF;


    -- =========================================================================
    -- G. end_at not on 15-min boundary → check_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.appointment (
            appointment_number, patient_id, doctor_id, branch_id, specialty_id,
            start_at, end_at, booking_type, created_by
        )
        VALUES (
            'APT-060-TEST-G', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
            '2026-12-01 11:00:00+00', '2026-12-01 11:22:00+00', 'Booked', v_user_id
        );
        RAISE EXCEPTION 'Test G FAILED: non-15-min end_at was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test G FAILED: expected check_violation for end_at not on 15-min grid';
    END IF;


    -- =========================================================================
    -- H. end_at = start_at → check_violation (zero-duration)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.appointment (
            appointment_number, patient_id, doctor_id, branch_id, specialty_id,
            start_at, end_at, booking_type, created_by
        )
        VALUES (
            'APT-060-TEST-H', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
            '2026-12-01 12:00:00+00', '2026-12-01 12:00:00+00', 'Booked', v_user_id
        );
        RAISE EXCEPTION 'Test H FAILED: zero-duration appointment was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test H FAILED: expected check_violation for end_at = start_at';
    END IF;


    -- =========================================================================
    -- I. end_at < start_at → check_violation (negative duration)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.appointment (
            appointment_number, patient_id, doctor_id, branch_id, specialty_id,
            start_at, end_at, booking_type, created_by
        )
        VALUES (
            'APT-060-TEST-I', v_patient_id, v_doctor_id, v_branch_id, v_specialty_id,
            '2026-12-01 12:30:00+00', '2026-12-01 12:00:00+00', 'Booked', v_user_id
        );
        RAISE EXCEPTION 'Test I FAILED: negative-duration appointment was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test I FAILED: expected check_violation for end_at < start_at';
    END IF;


    RAISE NOTICE 'CATMS-028 appointment rules — all 9 tests passed OK';

END;
$$;

-- Discard all test fixture data
ROLLBACK;
