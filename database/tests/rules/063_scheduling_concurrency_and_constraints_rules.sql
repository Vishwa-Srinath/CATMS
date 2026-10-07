-- CATMS-031: scheduling constraints and concurrency rule tests.
-- Requires migrations through 062.
-- All fixture data is rolled back.

BEGIN;

SET LOCAL statement_timeout = '30s';

DO $$
DECLARE
    v_branch_id        BIGINT;
    v_emp_doc_id       BIGINT;
    v_emp_doc2_id      BIGINT;
    v_emp_staff_id     BIGINT;
    v_user_staff_id    BIGINT;
    v_specialty_id     BIGINT;
    v_patient_1_id     BIGINT;
    v_patient_2_id     BIGINT;
    v_patient_3_id     BIGINT;

    v_appt_1_id        BIGINT;
    v_appt_1_num       CITEXT;
    v_appt_2_id        BIGINT;
    v_appt_2_num       CITEXT;
    v_appt_3_id        BIGINT;
    v_appt_3_num       CITEXT;

    v_slot_1_start     TIMESTAMPTZ := '2026-12-14 09:00:00+00';
    v_slot_1_end       TIMESTAMPTZ := '2026-12-14 09:30:00+00';
    v_slot_2_start     TIMESTAMPTZ := '2026-12-14 09:30:00+00';
    v_slot_2_end       TIMESTAMPTZ := '2026-12-14 10:00:00+00';
    v_slot_3_start     TIMESTAMPTZ := '2026-12-14 10:00:00+00';
    v_slot_3_end       TIMESTAMPTZ := '2026-12-14 10:30:00+00';

    v_current_start    TIMESTAMPTZ;
    v_current_end      TIMESTAMPTZ;
    v_current_status   catms.appointment_status;
    v_hist_count       INTEGER;
    v_log_count        INTEGER;
    v_caught           BOOLEAN;
BEGIN
    -- Fixture setup
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('BR031', 'Concurrency Test Branch', '31 Hospital Square', 'Colombo', '+94112345031')
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('SPEC031', 'Scheduling Concurrency Specialty')
    RETURNING specialty_id INTO v_specialty_id;

    -- Doctor 1
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP031DOC1', 'Dr. Concurrency Lead', '198511223344V',
        '1985-05-15', 'Male', 'Doctor',
        '2020-01-01', 'Active', '+94771122031'
    )
    RETURNING employee_id INTO v_emp_doc_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_emp_doc_id, 'SLMC-031-1', CURRENT_DATE - INTERVAL '5 years');

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id)
    VALUES (v_emp_doc_id, v_specialty_id);

    -- Doctor 2
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP031DOC2', 'Dr. Parallel Specialist', '198611223345V',
        '1986-06-16', 'Female', 'Doctor',
        '2020-02-01', 'Active', '+94771122032'
    )
    RETURNING employee_id INTO v_emp_doc2_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_emp_doc2_id, 'SLMC-031-2', CURRENT_DATE - INTERVAL '3 years');

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id)
    VALUES (v_emp_doc2_id, v_specialty_id);

    -- Staff Member & User Account
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP031STF', 'Receptionist Concurrency', '199211223346V',
        '1992-07-20', 'Female', 'Receptionist',
        '2022-01-01', 'Active', '+94771122033'
    )
    RETURNING employee_id INTO v_emp_staff_id;

    INSERT INTO catms.user_account (
        employee_id, username, password_hash, account_status
    )
    VALUES (
        v_emp_staff_id, 'rec_concurrency_031',
        '$2b$12$0123456789012345678901', 'Active'
    )
    RETURNING user_account_id INTO v_user_staff_id;

    -- Recurring availability
    INSERT INTO catms.doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time)
    VALUES 
        (v_emp_doc_id, v_branch_id, 'Mon', '08:00', '18:00'),
        (v_emp_doc2_id, v_branch_id, 'Mon', '08:00', '18:00');

    -- Patients
    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth,
        gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-031-A', 'Alice', 'Smith', '1990-01-01', 'Female', '+94710000031', v_branch_id)
    RETURNING patient_id INTO v_patient_1_id;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_1_id, 'NIC', '199011110031V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_1_id, 'Bob Smith', 'Spouse', '+94710000032', TRUE);

    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth,
        gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-031-B', 'Charlie', 'Brown', '1988-02-02', 'Male', '+94710000033', v_branch_id)
    RETURNING patient_id INTO v_patient_2_id;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_2_id, 'NIC', '198822220031V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_2_id, 'Sally Brown', 'Sister', '+94710000034', TRUE);

    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth,
        gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-031-C', 'Diana', 'Prince', '1995-03-03', 'Female', '+94710000035', v_branch_id)
    RETURNING patient_id INTO v_patient_3_id;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_3_id, 'NIC', '199533330031V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_3_id, 'Hippolyta Prince', 'Mother', '+94710000036', TRUE);

    -- Test 1: Valid initial booking on 15-minute grid [09:00, 09:30)
    CALL catms.book_appointment(
        v_patient_1_id, v_emp_doc_id, v_branch_id, v_specialty_id,
        v_slot_1_start, v_slot_1_end, 'Booked', v_user_staff_id, 'Test 1 booking',
        v_appt_1_id, v_appt_1_num
    );

    IF v_appt_1_id IS NULL OR v_appt_1_num IS NULL THEN
        RAISE EXCEPTION 'CATMS-031 Test 1 FAILED: Booking 1 did not return generated appointment.';
    END IF;

    -- Test 2: Adjacent non-overlapping booking succeeds [09:30, 10:00)
    CALL catms.book_appointment(
        v_patient_2_id, v_emp_doc_id, v_branch_id, v_specialty_id,
        v_slot_2_start, v_slot_2_end, 'Booked', v_user_staff_id, 'Test 2 adjacent booking',
        v_appt_2_id, v_appt_2_num
    );

    IF v_appt_2_id IS NULL THEN
        RAISE EXCEPTION 'CATMS-031 Test 2 FAILED: Adjacent booking was incorrectly rejected.';
    END IF;

    -- Test 3: Direct-SQL double-booking bypass attempt is blocked by GiST
    v_caught := FALSE;
    BEGIN
        INSERT INTO catms.appointment (
            appointment_number, patient_id, doctor_id, branch_id, specialty_id,
            start_at, end_at, booking_type, created_by
        ) VALUES (
            'APT-031-BYPASS', v_patient_3_id, v_emp_doc_id, v_branch_id, v_specialty_id,
            '2026-12-14 09:15:00+00', '2026-12-14 09:45:00+00', 'Booked', v_user_staff_id
        );
        RAISE EXCEPTION 'CATMS-031 Test 3 FAILED: Direct SQL double-booking bypassed GiST constraint!';
    EXCEPTION
        WHEN exclusion_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'CATMS-031 Test 3 FAILED: exclusion_violation was not raised for direct SQL.';
    END IF;

    -- Test 4: Procedure overlapping booking attempt is blocked by GiST
    v_caught := FALSE;
    BEGIN
        CALL catms.book_appointment(
            v_patient_3_id, v_emp_doc_id, v_branch_id, v_specialty_id,
            '2026-12-14 09:15:00+00', '2026-12-14 09:45:00+00', 'Booked', v_user_staff_id, 'Overlapping',
            v_appt_3_id, v_appt_3_num
        );
        RAISE EXCEPTION 'CATMS-031 Test 4 FAILED: book_appointment accepted overlapping slot!';
    EXCEPTION
        WHEN exclusion_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'CATMS-031 Test 4 FAILED: exclusion_violation was not raised for procedure.';
    END IF;

    -- Test 5: Reschedule collision failure and atomic state preservation
    v_caught := FALSE;
    BEGIN
        CALL catms.reschedule_appointment(
            v_appt_1_id,
            '2026-12-14 09:15:00+00', '2026-12-14 09:45:00+00',
            'Conflicting reschedule attempt', v_emp_staff_id
        );
        RAISE EXCEPTION 'CATMS-031 Test 5 FAILED: Reschedule allowed overlapping time slot!';
    EXCEPTION
        WHEN exclusion_violation THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'CATMS-031 Test 5 FAILED: Expected exclusion_violation on conflicting reschedule.';
    END IF;

    SELECT start_at, end_at, status INTO v_current_start, v_current_end, v_current_status
    FROM catms.appointment WHERE appointment_id = v_appt_1_id;

    IF v_current_start <> v_slot_1_start OR v_current_end <> v_slot_1_end THEN
        RAISE EXCEPTION 'CATMS-031 Test 5 FAILED: Original appointment corrupted after failed reschedule! Found [%, %]',
            v_current_start, v_current_end;
    END IF;

    IF v_current_status <> 'Scheduled' THEN
        RAISE EXCEPTION 'CATMS-031 Test 5 FAILED: Original appointment status changed after failed reschedule!';
    END IF;

    SELECT count(*) INTO v_hist_count
    FROM catms.appointment_schedule_history WHERE appointment_id = v_appt_1_id;

    IF v_hist_count <> 0 THEN
        RAISE EXCEPTION 'CATMS-031 Test 5 FAILED: Failed reschedule left % orphaned history row(s).', v_hist_count;
    END IF;

    -- Test 6: Valid reschedule updates schedule and creates exactly 1 audit row
    CALL catms.reschedule_appointment(
        v_appt_1_id,
        v_slot_3_start, v_slot_3_end,
        'Patient requested later time', v_emp_staff_id
    );

    SELECT start_at, end_at INTO v_current_start, v_current_end
    FROM catms.appointment WHERE appointment_id = v_appt_1_id;

    IF v_current_start <> v_slot_3_start OR v_current_end <> v_slot_3_end THEN
        RAISE EXCEPTION 'CATMS-031 Test 6 FAILED: Appointment not moved to new time.';
    END IF;

    SELECT count(*) INTO v_hist_count
    FROM catms.appointment_schedule_history
    WHERE appointment_id = v_appt_1_id
      AND old_start_at = v_slot_1_start
      AND new_start_at = v_slot_3_start
      AND changed_by_employee_id = v_emp_staff_id;

    IF v_hist_count <> 1 THEN
        RAISE EXCEPTION 'CATMS-031 Test 6 FAILED: Expected exactly 1 history row, found %', v_hist_count;
    END IF;

    -- Test 7: Cancelled appointment frees slot for another booking
    CALL catms.cancel_appointment(
        v_appt_2_id, 'Patient cancelled due to travel', v_emp_staff_id
    );

    SELECT status INTO v_current_status
    FROM catms.appointment WHERE appointment_id = v_appt_2_id;

    IF v_current_status <> 'Cancelled' THEN
        RAISE EXCEPTION 'CATMS-031 Test 7 FAILED: Appointment 2 status is not Cancelled.';
    END IF;

    CALL catms.book_appointment(
        v_patient_3_id, v_emp_doc_id, v_branch_id, v_specialty_id,
        v_slot_2_start, v_slot_2_end, 'Booked', v_user_staff_id, 'Replacement booking',
        v_appt_3_id, v_appt_3_num
    );

    IF v_appt_3_id IS NULL THEN
        RAISE EXCEPTION 'CATMS-031 Test 7 FAILED: Re-booking into cancelled slot was rejected.';
    END IF;

    -- Test 8: Terminal state protection against reschedule
    v_caught := FALSE;
    BEGIN
        CALL catms.reschedule_appointment(
            v_appt_2_id,
            '2026-12-14 11:00:00+00', '2026-12-14 11:30:00+00',
            'Attempt to resurrect cancelled appointment', v_emp_staff_id
        );
        RAISE EXCEPTION 'CATMS-031 Test 8 FAILED: Cancelled appointment was allowed to be rescheduled!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLSTATE = 'A0002' OR SQLERRM LIKE '%Cannot reschedule%' THEN
                v_caught := TRUE;
            ELSE
                RAISE EXCEPTION 'CATMS-031 Test 8 FAILED: Unexpected error: % (state %)', SQLERRM, SQLSTATE;
            END IF;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'CATMS-031 Test 8 FAILED: Terminal state guard A0002 was not triggered.';
    END IF;

    -- Test 9: Independent simultaneous bookings for different doctors succeed
    DECLARE
        v_doc2_appt_id BIGINT;
        v_doc2_appt_num CITEXT;
    BEGIN
        CALL catms.book_appointment(
            v_patient_2_id, v_emp_doc2_id, v_branch_id, v_specialty_id,
            v_slot_3_start, v_slot_3_end, 'Booked', v_user_staff_id, 'Doctor 2 parallel booking',
            v_doc2_appt_id, v_doc2_appt_num
        );

        IF v_doc2_appt_id IS NULL THEN
            RAISE EXCEPTION 'CATMS-031 Test 9 FAILED: Doctor 2 booking at same time was blocked by Doctor 1!';
        END IF;
    END;

    -- Test 10: Audit trail reconciliation
    SELECT count(*) INTO v_hist_count
    FROM catms.appointment_schedule_history
    WHERE appointment_id IN (v_appt_1_id, v_appt_2_id, v_appt_3_id);

    IF v_hist_count <> 1 THEN
        RAISE EXCEPTION 'CATMS-031 Test 10 FAILED: Expected exactly 1 schedule history row, found %', v_hist_count;
    END IF;

    SELECT count(*) INTO v_log_count
    FROM catms.appointment_status_log
    WHERE appointment_id IN (v_appt_1_id, v_appt_2_id, v_appt_3_id);

    IF v_log_count <> 1 THEN
        RAISE EXCEPTION 'CATMS-031 Test 10 FAILED: Expected exactly 1 status log row, found %', v_log_count;
    END IF;

    RAISE NOTICE '063_scheduling_concurrency_and_constraints_rules: All rule assertions passed.';
END;
$$;

ROLLBACK;
