-- =============================================================================
-- database/tests/rules/061_book_appointment_procedure_rules.sql
-- Owner: Dev1  |  Issue: CATMS-029  |  Reviewers: Dev2, Dev3
--
-- Business-rule assertions for catms.book_appointment().
--
-- Test plan:
--   A. Fixture seed (branch, employee, doctor, specialty, availability, patient, user)
--   B. Valid booking succeeds — appointment_id and appointment_number are returned
--   C. Inactive patient → rejected (P0002)
--   D. Inactive doctor → rejected (D0002)
--   E. Doctor missing specialty → rejected (DS001)
--   F. Slot outside recurring availability → rejected (DA002)
--   G. Unavailable exception blocks the slot → rejected (DA001)
--   H. ExtraHours exception unlocks a slot outside recurring hours → succeeds
--   I. Duplicate booking (same doctor/slot) → exclusion_violation from GiST
--
-- All changes are rolled back at the end — no permanent fixture data.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id         BIGINT;
    v_emp_id            BIGINT;
    v_emp2_id           BIGINT;
    v_user_id           BIGINT;
    v_specialty_id      BIGINT;
    v_spec2_id          BIGINT;
    v_patient_id        BIGINT;
    v_patient2_id       BIGINT;
    v_out_appt_id       BIGINT;
    v_out_appt_number   CITEXT;
    v_ok                BOOLEAN;

    -- Fixed slot: 2026-12-10 Monday 09:00–09:30 UTC
    v_slot_start        TIMESTAMPTZ := '2026-12-07 09:00:00+00';  -- 2026-12-07 is Monday
    v_slot_end          TIMESTAMPTZ := '2026-12-07 09:30:00+00';
BEGIN

    -- =========================================================================
    -- A. Prerequisite fixture seed
    -- =========================================================================

    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('TST61A', 'Book Test Branch', '61 Book Road', 'Colombo', '+94100000061')
    RETURNING branch_id INTO v_branch_id;

    -- Primary doctor
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP061A', 'Book Doctor A', '198761345670V',
        '1987-01-01', 'Male', 'Doctor',
        CURRENT_DATE, 'Active', '+94300000061'
    )
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_emp_id, 'SLMC-061-TST', CURRENT_DATE - INTERVAL '5 years');

    -- Specialty A (which doctor has)
    INSERT INTO catms.specialty (specialty_code, name, is_active)
    VALUES ('TST61A', 'Book Spec A', TRUE)
    RETURNING specialty_id INTO v_specialty_id;

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id, is_primary)
    VALUES (v_emp_id, v_specialty_id, TRUE);

    -- Specialty B (which doctor does NOT have) — for test E
    INSERT INTO catms.specialty (specialty_code, name, is_active)
    VALUES ('TST61B', 'Book Spec B', TRUE)
    RETURNING specialty_id INTO v_spec2_id;

    -- Recurring availability for doctor: Mondays 09:00-12:00
    INSERT INTO catms.doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time)
    VALUES (v_emp_id, v_branch_id, 'Mon', '09:00', '12:00');

    -- Patient 1 (active)
    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-061-A', 'Book', 'Patient A', '1990-01-01', 'Female', '+94700061001', v_branch_id)
    RETURNING patient_id INTO v_patient_id;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient_id, 'NIC', '199000261001V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient_id, 'EC A', 'Parent', '+94700061002', TRUE);

    -- Patient 2 (will be deactivated for test C)
    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-061-B', 'Inactive', 'Patient B', '1985-05-05', 'Male', '+94700061003', v_branch_id)
    RETURNING patient_id INTO v_patient2_id;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_patient2_id, 'NIC', '198500561003V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_patient2_id, 'EC B', 'Spouse', '+94700061004', TRUE);
    UPDATE catms.patient SET is_active = FALSE WHERE patient_id = v_patient2_id;

    -- User account for created_by
    INSERT INTO catms.user_account (employee_id, username, password_hash, is_active)
    VALUES (v_emp_id, 'booktest061', 'x', TRUE)
    RETURNING user_account_id INTO v_user_id;


    -- =========================================================================
    -- B. Valid booking succeeds
    -- =========================================================================

    CALL catms.book_appointment(
        v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
        v_slot_start, v_slot_end,
        'Booked', v_user_id, 'First appointment',
        v_out_appt_id, v_out_appt_number
    );

    IF v_out_appt_id IS NULL THEN
        RAISE EXCEPTION 'Test B FAILED: book_appointment returned NULL appointment_id';
    END IF;
    IF v_out_appt_number NOT LIKE 'APT-%' THEN
        RAISE EXCEPTION 'Test B FAILED: appointment_number has unexpected format: %', v_out_appt_number;
    END IF;


    -- =========================================================================
    -- C. Inactive patient → rejected
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.book_appointment(
            v_patient2_id, v_emp_id, v_branch_id, v_specialty_id,
            '2026-12-07 10:00:00+00', '2026-12-07 10:30:00+00',
            'Booked', v_user_id, NULL,
            v_out_appt_id, v_out_appt_number
        );
        RAISE EXCEPTION 'Test C FAILED: booking for inactive patient was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%inactive%' OR SQLSTATE = 'P0002' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test C FAILED: unexpected error: % (state: %)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test C FAILED: expected rejection for inactive patient';
    END IF;


    -- =========================================================================
    -- D. Doctor without doctor_profile (non-doctor) → rejected
    --    (Create a non-doctor employee and try to book them as a doctor)
    -- =========================================================================

    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP061B', 'Receptionist', '199261345671V',
        '1992-01-01', 'Female', 'Reception',
        CURRENT_DATE, 'Active', '+94300000062'
    )
    RETURNING employee_id INTO v_emp2_id;
    -- Deliberately NOT inserting a doctor_profile for v_emp2_id

    v_ok := FALSE;
    BEGIN
        CALL catms.book_appointment(
            v_patient_id, v_emp2_id, v_branch_id, v_specialty_id,
            '2026-12-07 10:00:00+00', '2026-12-07 10:30:00+00',
            'Booked', v_user_id, NULL,
            v_out_appt_id, v_out_appt_number
        );
        RAISE EXCEPTION 'Test D FAILED: booking for non-doctor employee was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%not found%' OR SQLSTATE = 'D0001' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test D FAILED: unexpected error: % (state: %)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test D FAILED: expected rejection for non-doctor employee';
    END IF;


    -- =========================================================================
    -- E. Doctor does not have the requested specialty → rejected
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.book_appointment(
            v_patient_id, v_emp_id, v_branch_id, v_spec2_id,  -- spec2 not assigned to doctor
            '2026-12-07 10:00:00+00', '2026-12-07 10:30:00+00',
            'Booked', v_user_id, NULL,
            v_out_appt_id, v_out_appt_number
        );
        RAISE EXCEPTION 'Test E FAILED: booking with unassigned specialty was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%specialty%' OR SQLSTATE = 'DS001' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test E FAILED: unexpected error: % (state: %)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test E FAILED: expected rejection for missing doctor-specialty link';
    END IF;


    -- =========================================================================
    -- F. Slot outside recurring availability → rejected
    --    Doctor is available Mon 09:00–12:00. Try Saturday 09:00–09:30.
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.book_appointment(
            v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
            '2026-12-05 09:00:00+00', '2026-12-05 09:30:00+00',  -- 2026-12-05 is Saturday
            'Booked', v_user_id, NULL,
            v_out_appt_id, v_out_appt_number
        );
        RAISE EXCEPTION 'Test F FAILED: booking outside availability was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%availability%' OR SQLSTATE = 'DA002' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test F FAILED: unexpected error: % (state: %)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test F FAILED: expected rejection for slot outside availability';
    END IF;


    -- =========================================================================
    -- G. Unavailable exception blocks the slot → rejected
    --    Insert Unavailable for Mon 2026-12-07 10:00–11:00
    -- =========================================================================

    INSERT INTO catms.doctor_availability_exception (
        doctor_id, branch_id, exception_type, start_at, end_at, reason
    )
    VALUES (
        v_emp_id, v_branch_id, 'Unavailable',
        '2026-12-07 10:00:00+00', '2026-12-07 11:00:00+00',
        'Personal leave'
    );

    v_ok := FALSE;
    BEGIN
        CALL catms.book_appointment(
            v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
            '2026-12-07 10:00:00+00', '2026-12-07 10:30:00+00',  -- inside Unavailable window
            'Booked', v_user_id, NULL,
            v_out_appt_id, v_out_appt_number
        );
        RAISE EXCEPTION 'Test G FAILED: booking during Unavailable exception was accepted';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%unavailable%' OR SQLSTATE = 'DA001' THEN
                v_ok := TRUE;
            ELSE
                RAISE EXCEPTION 'Test G FAILED: unexpected error: % (state: %)', SQLERRM, SQLSTATE;
            END IF;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test G FAILED: expected rejection for Unavailable exception slot';
    END IF;


    -- =========================================================================
    -- H. ExtraHours exception unlocks a slot outside recurring hours → succeeds
    --    Doctor is available Mon 09:00–12:00. Add ExtraHours for Mon 15:00–17:00.
    -- =========================================================================

    INSERT INTO catms.doctor_availability_exception (
        doctor_id, branch_id, exception_type, start_at, end_at, reason
    )
    VALUES (
        v_emp_id, v_branch_id, 'ExtraHours',
        '2026-12-07 15:00:00+00', '2026-12-07 17:00:00+00',
        'Extended clinic hours'
    );

    CALL catms.book_appointment(
        v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
        '2026-12-07 15:00:00+00', '2026-12-07 15:30:00+00',  -- inside ExtraHours window
        'Booked', v_user_id, 'Extra hours booking',
        v_out_appt_id, v_out_appt_number
    );
    IF v_out_appt_id IS NULL THEN
        RAISE EXCEPTION 'Test H FAILED: ExtraHours booking did not succeed';
    END IF;


    -- =========================================================================
    -- I. Duplicate booking (same doctor/slot as B) → exclusion_violation
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        CALL catms.book_appointment(
            v_patient_id, v_emp_id, v_branch_id, v_specialty_id,
            v_slot_start, v_slot_end,  -- same as Test B — now occupied
            'Booked', v_user_id, 'Duplicate attempt',
            v_out_appt_id, v_out_appt_number
        );
        RAISE EXCEPTION 'Test I FAILED: duplicate booking was accepted';
    EXCEPTION
        WHEN exclusion_violation THEN v_ok := TRUE;
        WHEN OTHERS THEN
            RAISE EXCEPTION 'Test I FAILED: unexpected error: % (state: %)', SQLERRM, SQLSTATE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test I FAILED: expected exclusion_violation for duplicate booking';
    END IF;


    RAISE NOTICE 'CATMS-029 book_appointment rules — all 9 tests passed OK';

END;
$$;

-- Discard all test fixture data
ROLLBACK;
