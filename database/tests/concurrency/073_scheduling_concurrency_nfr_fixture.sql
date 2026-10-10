-- =============================================================================
-- database/tests/concurrency/073_scheduling_concurrency_nfr_fixture.sql
-- Owner: Dev1 | Reviewer: Dev5 | Issues: CATMS-073, CATMS-031, CATMS-070
--
-- Fixture for 5-10 worker scheduling concurrency and performance NFR suite.
-- Sets up isolated test entities:
--   - 1 test branch and 1 specialty
--   - 2 active doctors with 24/7 availability
--   - 1 receptionist employee and active user account
--   - 10 distinct patients (with primary NIC identities and emergency contacts)
--   - 10 pre-created appointments for simultaneous reschedule collision tests
-- Records generated surrogate keys in public.catms073_test_ids.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
    IF current_database() NOT LIKE '%073%' 
       AND current_database() NOT LIKE '%031%' 
       AND current_database() NOT LIKE '%test%' 
       AND current_database() NOT LIKE '%dev%' THEN
        RAISE EXCEPTION
            'SAFETY GUARD: Use a disposable test/dev database. Current DB: %',
            current_database();
    END IF;
END;
$$;

DROP TABLE IF EXISTS public.catms073_test_ids;

CREATE TABLE public.catms073_test_ids (
    id                      INTEGER PRIMARY KEY DEFAULT 1,
    branch_id               BIGINT NOT NULL,
    specialty_id            BIGINT NOT NULL,
    doctor_primary_id       BIGINT NOT NULL,
    doctor_secondary_id     BIGINT NOT NULL,
    actor_user_id           BIGINT NOT NULL,
    actor_employee_id       BIGINT NOT NULL,
    patient_1_id            BIGINT NOT NULL,
    patient_2_id            BIGINT NOT NULL,
    patient_3_id            BIGINT NOT NULL,
    patient_4_id            BIGINT NOT NULL,
    patient_5_id            BIGINT NOT NULL,
    patient_6_id            BIGINT NOT NULL,
    patient_7_id            BIGINT NOT NULL,
    patient_8_id            BIGINT NOT NULL,
    patient_9_id            BIGINT NOT NULL,
    patient_10_id           BIGINT NOT NULL,
    reschedule_appt_1_id    BIGINT NOT NULL,
    reschedule_appt_2_id    BIGINT NOT NULL,
    reschedule_appt_3_id    BIGINT NOT NULL,
    reschedule_appt_4_id    BIGINT NOT NULL,
    reschedule_appt_5_id    BIGINT NOT NULL,
    reschedule_appt_6_id    BIGINT NOT NULL,
    reschedule_appt_7_id    BIGINT NOT NULL,
    reschedule_appt_8_id    BIGINT NOT NULL,
    reschedule_appt_9_id    BIGINT NOT NULL,
    reschedule_appt_10_id   BIGINT NOT NULL,
    test_date               DATE NOT NULL
);

DO $fixture$
DECLARE
    v_branch_id            BIGINT;
    v_specialty_id         BIGINT;
    v_doc1_emp             BIGINT;
    v_doc2_emp             BIGINT;
    v_staff_emp            BIGINT;
    v_staff_user           BIGINT;
    v_patient_ids          BIGINT[] := '{}';
    v_reschedule_ids       BIGINT[] := '{}';
    v_p_id                 BIGINT;
    v_appt_id              BIGINT;
    v_appt_num             CITEXT;
    v_test_date            DATE := '2026-12-16';
    v_dow                  catms.day_of_week;
    v_days                 catms.day_of_week[] := ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']::catms.day_of_week[];
    i                      INTEGER;
    v_start_slot           TIMESTAMPTZ;
    v_end_slot             TIMESTAMPTZ;
BEGIN
    -- Idempotent cleanup of previous fixture runs
    DELETE FROM catms.appointment_schedule_history 
    WHERE changed_by_employee_id IN (SELECT employee_id FROM catms.employee WHERE employee_number LIKE 'EMP073%');

    DELETE FROM catms.appointment_status_log 
    WHERE changed_by_employee_id IN (SELECT employee_id FROM catms.employee WHERE employee_number LIKE 'EMP073%');

    DELETE FROM catms.appointment 
    WHERE branch_id IN (SELECT branch_id FROM catms.branch WHERE branch_code = 'BR073NFR');

    DELETE FROM catms.patient 
    WHERE patient_number LIKE 'PAT-073NFR-%';

    DELETE FROM catms.doctor_availability 
    WHERE branch_id IN (SELECT branch_id FROM catms.branch WHERE branch_code = 'BR073NFR');

    DELETE FROM catms.doctor_specialty 
    WHERE specialty_id IN (SELECT specialty_id FROM catms.specialty WHERE specialty_code = 'SPEC073NFR');

    DELETE FROM catms.doctor_profile 
    WHERE doctor_id IN (SELECT employee_id FROM catms.employee WHERE employee_number LIKE 'EMP073%');

    DELETE FROM catms.user_account 
    WHERE username = 'rec_operator_073';

    DELETE FROM catms.employee 
    WHERE employee_number LIKE 'EMP073%';

    DELETE FROM catms.specialty 
    WHERE specialty_code = 'SPEC073NFR';

    DELETE FROM catms.branch 
    WHERE branch_code = 'BR073NFR';

    -- 1. Branch
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('BR073NFR', 'NFR Concurrency Branch', '73 Performance Way', 'Colombo', '+94112000073')
    RETURNING branch_id INTO v_branch_id;

    -- 2. Specialty
    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('SPEC073NFR', 'NFR Scheduling Specialty')
    RETURNING specialty_id INTO v_specialty_id;

    -- 3. Primary Doctor (Dr. NFR Alpha)
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP073DOC1', 'Dr. NFR Alpha Lead', '198001010073V',
        '1980-01-01', 'Male', 'Doctor',
        '2018-01-01', 'Active', '+94770000071'
    )
    RETURNING employee_id INTO v_doc1_emp;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_doc1_emp, 'SLMC-073-1', CURRENT_DATE - INTERVAL '6 years');

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id)
    VALUES (v_doc1_emp, v_specialty_id);

    -- 4. Secondary Doctor (Dr. NFR Beta - Parallel Doctor tests)
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP073DOC2', 'Dr. NFR Beta Parallel', '198202020073V',
        '1982-02-02', 'Female', 'Doctor',
        '2019-01-01', 'Active', '+94770000072'
    )
    RETURNING employee_id INTO v_doc2_emp;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_doc2_emp, 'SLMC-073-2', CURRENT_DATE - INTERVAL '4 years');

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id)
    VALUES (v_doc2_emp, v_specialty_id);

    -- 5. Doctor Availability (Full 7-day 07:00-21:00 availability)
    FOREACH v_dow IN ARRAY v_days LOOP
        INSERT INTO catms.doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time)
        VALUES 
            (v_doc1_emp, v_branch_id, v_dow, '07:00', '21:00'),
            (v_doc2_emp, v_branch_id, v_dow, '07:00', '21:00');
    END LOOP;

    -- 6. Receptionist Staff & User Account
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP073RECP', 'NFR Reception Operator', '199204040073V',
        '1992-04-04', 'Female', 'Receptionist',
        '2021-01-01', 'Active', '+94770000074'
    )
    RETURNING employee_id INTO v_staff_emp;

    INSERT INTO catms.user_account (
        employee_id, username, password_hash, account_status
    )
    VALUES (
        v_staff_emp, 'rec_operator_073',
        '$2b$12$0123456789012345678901', 'Active'
    )
    RETURNING user_account_id INTO v_staff_user;

    -- 7. 10 Distinct Patients with Identities and Emergency Contacts
    FOR i IN 1..10 LOOP
        INSERT INTO catms.patient (
            patient_number, first_name, last_name, date_of_birth,
            gender, contact_number, registered_branch_id, registered_by
        )
        VALUES (
            'PAT-073NFR-' || i,
            'Patient' || i,
            'NfrTest',
            '1990-01-01'::DATE + (i * 30),
            CASE WHEN i % 2 = 0 THEN 'Female' ELSE 'Male' END,
            '+9471' || LPAD(i::TEXT, 7, '0'),
            v_branch_id,
            v_staff_emp
        )
        RETURNING patient_id INTO v_p_id;

        INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
        VALUES (v_p_id, 'NIC', '19900101' || LPAD(i::TEXT, 4, '0') || 'V', TRUE);

        INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
        VALUES (v_p_id, 'Emergency Contact ' || i, 'Family', '+9472' || LPAD(i::TEXT, 7, '0'), TRUE);

        v_patient_ids := array_append(v_patient_ids, v_p_id);
    END LOOP;

    -- 8. 10 Pre-created appointments for Reschedule Collision Tests
    -- Spread them non-overlapping across 13:00 to 18:00 on test_date
    FOR i IN 1..10 LOOP
        v_start_slot := (v_test_date || ' 13:00:00+00')::TIMESTAMPTZ + ((i - 1) * INTERVAL '30 minutes');
        v_end_slot   := v_start_slot + INTERVAL '30 minutes';

        CALL catms.book_appointment(
            v_patient_ids[i], v_doc1_emp, v_branch_id, v_specialty_id,
            v_start_slot, v_end_slot,
            'Booked', v_staff_user, 'Pre-created appointment ' || i || ' for reschedule NFR test',
            v_appt_id, v_appt_num
        );

        v_reschedule_ids := array_append(v_reschedule_ids, v_appt_id);
    END LOOP;

    -- 9. Persist all IDs
    INSERT INTO public.catms073_test_ids (
        id, branch_id, specialty_id, doctor_primary_id, doctor_secondary_id,
        actor_user_id, actor_employee_id,
        patient_1_id, patient_2_id, patient_3_id, patient_4_id, patient_5_id,
        patient_6_id, patient_7_id, patient_8_id, patient_9_id, patient_10_id,
        reschedule_appt_1_id, reschedule_appt_2_id, reschedule_appt_3_id, reschedule_appt_4_id, reschedule_appt_5_id,
        reschedule_appt_6_id, reschedule_appt_7_id, reschedule_appt_8_id, reschedule_appt_9_id, reschedule_appt_10_id,
        test_date
    ) VALUES (
        1, v_branch_id, v_specialty_id, v_doc1_emp, v_doc2_emp,
        v_staff_user, v_staff_emp,
        v_patient_ids[1], v_patient_ids[2], v_patient_ids[3], v_patient_ids[4], v_patient_ids[5],
        v_patient_ids[6], v_patient_ids[7], v_patient_ids[8], v_patient_ids[9], v_patient_ids[10],
        v_reschedule_ids[1], v_reschedule_ids[2], v_reschedule_ids[3], v_reschedule_ids[4], v_reschedule_ids[5],
        v_reschedule_ids[6], v_reschedule_ids[7], v_reschedule_ids[8], v_reschedule_ids[9], v_reschedule_ids[10],
        v_test_date
    );

    RAISE NOTICE '073_scheduling_concurrency_nfr_fixture seeded successfully with 10 patients and 10 baseline appointments.';
END;
$fixture$;

COMMIT;
