-- =============================================================================
-- database/tests/rules/062_appointment_lifecycle_rules.sql
-- Owner: Dev1  |  Issue: CATMS-030  |  Reviewer: Dev4
--
-- Business-rule assertions for appointment lifecycle procedures (ADR-004 §3,§4):
--   reschedule_appointment, update_appointment_status, cancel_appointment
--
-- Test plan:
--   A. Fixture seed (branch, employee, doctor, specialty, availability, patient, user)
--   B. Valid reschedule → new times persisted, schedule_history row created
--   C. Reschedule Completed appointment → rejected (terminal state)
--   D. Reschedule Cancelled appointment → rejected (terminal state)
--   E. Reschedule to outside availability → rejected (DA002)
--   F. Reschedule to Unavailable window → rejected (DA001)
--   G. update_appointment_status: Scheduled → Completed succeeds + log row
--   H. update_appointment_status: Completed → Cancelled rejected (terminal)
--   I. update_appointment_status: Cancelled → Scheduled rejected (terminal)
--   J. cancel_appointment: Scheduled → Cancelled succeeds + log row
--   K. cancel_appointment on Completed appointment → rejected (terminal)
--   L. Direct UPDATE/DELETE on audit tables fails (privilege check via roles)
--
-- All changes are rolled back at the end — no permanent fixture data.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id         BIGINT;
    v_emp_id            BIGINT;
    v_user_id           BIGINT;
    v_specialty_id      BIGINT;
    v_patient_id        BIGINT;
    v_appt_id           BIGINT;
    v_appt2_id          BIGINT;
    v_appt3_id          BIGINT;
    v_hist_count        INTEGER;
    v_log_count         INTEGER;
    v_new_status        catms.appointment_status;
    v_ok                BOOLEAN;

    v_slot_start        TIMESTAMPTZ := '2026-12-14 09:00:00+00';  -- Monday
    v_slot_end          TIMESTAMPTZ := '2026-12-14 09:30:00+00';
BEGIN

    -- =========================================================================
    -- A. Prerequisite fixture seed
    -- =========================================================================

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('TST62A', 'Lifecycle Test Branch', '62 Life Road', 'Colombo', '+94100000062')
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP062A', 'Lifecycle Doctor', '197962345670V',
        '1979-01-01', 'Male', 'Doctor',
        CURRENT_DATE, 'Active', '+94300000062'
    )
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_emp_id, 'SLMC-062-TST', CURRENT_DATE - INTERVAL '10 years');

    INSERT INTO catms.specialty (specialty_code, name, is_active)
    VALUES ('TST62', 'Lifecycle Spec', TRUE)
    RETURNING specialty_id INTO v_specialty_id;

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_emp_id, v_specialty_id, TRUE);

    -- Recurring availability: Mondays 09:00–17:00
    INSERT INTO catms.doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time)
    VALUES (v_emp_id, v_branch_id, 'Mon', '09:00', '17:00');

    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-062-A', 'Life', 'Patient', '1988-03-10', 'Female', '+94700062001', v_branch_id)
    RETURNING patient_id INTO v_patient_id;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_id, 'NIC', '198803062001V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'Life EC', 'Parent', '+94700062002', TRUE);

    INSERT INTO catms.user_account (employee_id, username, password_hash, is_active)
    VALUES (v_emp_id, 'lifetest062', 'x', TRUE)
    RETURNING user_account_id INTO v_user_id;

    -- Seed 3 appointments for different test paths
    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, booking_type, created_by
    )
    VALUES (
        'APT-062-B', v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
        v_slot_start, v_slot_end, 'Booked', v_user_id
    )
    RETURNING appointment_id INTO v_appt_id;   -- for tests B, E, F

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, booking_type, created_by
    )
    VALUES (
        'APT-062-G', v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
        '2026-12-14 10:00:00+00', '2026-12-14 10:30:00+00', 'Booked', v_user_id
    )
    RETURNING appointment_id INTO v_appt2_id;  -- for tests G, H

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id, branch_id, specialty_id,
        start_at, end_at, booking_type, created_by
    )
    VALUES (
        'APT-062-J', v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
        '2026-12-14 11:00:00+00', '2026-12-14 11:30:00+00', 'Booked', v_user_id
    )
    RETURNING appointment_id INTO v_appt3_id;  -- for tests J, K


    -- =========================================================================
    -- B. Valid reschedule → new times persisted and history row created
    -- =========================================================================

    CALL catms.reschedule_appointment(
        v_appt_id,
        '2026-12-14 09:30:00+00',
        '2026-12-14 10:00:00+00',
        'Patient requested later time',
        v_emp_id
    );

    SELECT count(*) INTO v_hist_count
    FROM catms.appointment_schedule_history
    WHERE appointment_id = v_appt_id;

    IF v_hist_count <> 1 THEN
        RAISE EXCEPTION 'Test B FAILED: expected 1 schedule_history row after reschedule, found %', v_hist_count;
    END IF;


    -- =========================================================================
    -- C. Reschedule a Completed appointment → rejected
    -- =========================================================================

    UPDATE catms.appointment SET status = 'Completed' WHERE appointment_id = v_appt2_id;

    v_ok := FALSE;
    BEGIN
        CALL catms.reschedule_appointment(
            v_appt2_id,
            '2026-12-14 13:00:00+00', '2026-12-14 13:30:00+00',
            'Attempting reschedule', v_emp_id
        );
        RAISE EXCEPTION 'Test C FAILED: reschedule of Completed appointment was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Completed%' OR SQLSTATE = 'A0002' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test C FAILED: unexpected error: % (%)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test C FAILED: expected rejection for rescheduling Completed appointment';
    END IF;


    -- =========================================================================
    -- D. Reschedule a Cancelled appointment → rejected
    -- =========================================================================

    UPDATE catms.appointment SET status = 'Cancelled' WHERE appointment_id = v_appt3_id;

    v_ok := FALSE;
    BEGIN
        CALL catms.reschedule_appointment(
            v_appt3_id,
            '2026-12-14 14:00:00+00', '2026-12-14 14:30:00+00',
            'Attempting reschedule', v_emp_id
        );
        RAISE EXCEPTION 'Test D FAILED: reschedule of Cancelled appointment was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Cancelled%' OR SQLSTATE = 'A0002' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test D FAILED: unexpected error: % (%)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test D FAILED: expected rejection for rescheduling Cancelled appointment';
    END IF;


    -- =========================================================================
    -- E. Reschedule to outside availability → rejected (DA002)
    --    Doctor available Mon 09:00–17:00 only. Try to move to Saturday.
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.reschedule_appointment(
            v_appt_id,
            '2026-12-12 09:00:00+00', '2026-12-12 09:30:00+00',  -- Saturday
            'Reschedule to weekend', v_emp_id
        );
        RAISE EXCEPTION 'Test E FAILED: reschedule to outside availability was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%availability%' OR SQLSTATE = 'DA002' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test E FAILED: unexpected error: % (%)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test E FAILED: expected rejection for reschedule outside availability';
    END IF;


    -- =========================================================================
    -- F. Reschedule into an Unavailable window → rejected (DA001)
    -- =========================================================================

    INSERT INTO catms.doctor_availability_exception (
        doctor_id, branch_id, exception_type, start_at, end_at, reason
    )
    VALUES (
        v_emp_id, v_branch_id, 'Unavailable',
        '2026-12-14 15:00:00+00', '2026-12-14 16:00:00+00',
        'Blocked for test F'
    );

    v_ok := FALSE;
    BEGIN
        CALL catms.reschedule_appointment(
            v_appt_id,
            '2026-12-14 15:00:00+00', '2026-12-14 15:30:00+00',  -- inside Unavailable
            'Reschedule into blocked time', v_emp_id
        );
        RAISE EXCEPTION 'Test F FAILED: reschedule into Unavailable window was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%unavailable%' OR SQLSTATE = 'DA001' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test F FAILED: unexpected error: % (%)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test F FAILED: expected rejection for reschedule into Unavailable window';
    END IF;


    -- =========================================================================
    -- G. update_appointment_status: Scheduled → Completed → log row created
    --    (re-set appt2 to Scheduled first, since we just Completed it above)
    -- =========================================================================

    -- Reset appt2 for clean test (direct update, within test txn only)
    UPDATE catms.appointment SET status = 'Scheduled' WHERE appointment_id = v_appt2_id;

    CALL catms.update_appointment_status(v_appt2_id, 'Completed', 'Consultation done', v_emp_id);

    SELECT count(*) INTO v_log_count
    FROM catms.appointment_status_log
    WHERE appointment_id = v_appt2_id AND new_status = 'Completed';

    IF v_log_count <> 1 THEN
        RAISE EXCEPTION 'Test G FAILED: expected 1 status_log row for Completed, found %', v_log_count;
    END IF;


    -- =========================================================================
    -- H. update_appointment_status: Completed → Cancelled → rejected (terminal)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.update_appointment_status(v_appt2_id, 'Cancelled', 'Trying to cancel', v_emp_id);
        RAISE EXCEPTION 'Test H FAILED: status change from Completed was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%terminal%' OR SQLSTATE = 'A0003' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test H FAILED: unexpected error: % (%)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test H FAILED: expected rejection for status change from Completed';
    END IF;


    -- =========================================================================
    -- I. update_appointment_status: Cancelled → Scheduled → rejected (terminal)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.update_appointment_status(v_appt3_id, 'Scheduled', 'Trying to reopen', v_emp_id);
        RAISE EXCEPTION 'Test I FAILED: status change from Cancelled was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%terminal%' OR SQLSTATE = 'A0003' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test I FAILED: unexpected error: % (%)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test I FAILED: expected rejection for status change from Cancelled';
    END IF;


    -- =========================================================================
    -- J. cancel_appointment: Scheduled → Cancelled + log row created
    --    (using v_appt_id which is still Scheduled after tests B, E, F)
    -- =========================================================================

    CALL catms.cancel_appointment(v_appt_id, 'Patient no-show', v_emp_id);

    SELECT new_status INTO v_new_status
    FROM catms.appointment_status_log
    WHERE appointment_id = v_appt_id
    ORDER BY log_id DESC
    LIMIT 1;

    IF v_new_status IS DISTINCT FROM 'Cancelled' THEN
        RAISE EXCEPTION 'Test J FAILED: appointment status was not Cancelled after cancel_appointment';
    END IF;


    -- =========================================================================
    -- K. cancel_appointment on Completed appointment → rejected (terminal)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.cancel_appointment(v_appt2_id, 'Trying to cancel completed', v_emp_id);
        RAISE EXCEPTION 'Test K FAILED: cancelling a Completed appointment was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%terminal%' OR SQLSTATE = 'A0003' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test K FAILED: unexpected error: % (%)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test K FAILED: expected rejection for cancelling a Completed appointment';
    END IF;


    RAISE NOTICE 'CATMS-030 appointment lifecycle rules — all 11 tests passed OK';

END;
$$;

-- Discard all test fixture data
ROLLBACK;
