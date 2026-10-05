-- CATMS-031: fixture for two-session scheduling concurrency tests.
-- Requires migrations through 062.
-- Run in disposable test database only.

\set ON_ERROR_STOP on

BEGIN;
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF current_database() NOT LIKE '%031%' AND current_database() NOT LIKE '%test%' THEN
        RAISE EXCEPTION
            'SAFETY GUARD: Use a disposable test database matching *031* or *test*. Current DB: %',
            current_database();
    END IF;

    IF to_regclass('public.catms031_test_ids') IS NOT NULL THEN
        RAISE EXCEPTION
            'Fixture already exists in public.catms031_test_ids. Recreate the disposable database before rerunning.';
    END IF;
END;
$$;

CREATE TABLE public.catms031_test_ids (
    id                     INTEGER PRIMARY KEY DEFAULT 1,
    branch_id              BIGINT NOT NULL,
    specialty_id           BIGINT NOT NULL,
    doctor_a_id            BIGINT NOT NULL,
    doctor_b_id            BIGINT NOT NULL,
    actor_user_id          BIGINT NOT NULL,
    actor_employee_id      BIGINT NOT NULL,
    patient_1_id           BIGINT NOT NULL,
    patient_2_id           BIGINT NOT NULL,
    patient_3_id           BIGINT NOT NULL,
    reschedule_appt_1_id   BIGINT NOT NULL,
    reschedule_appt_2_id   BIGINT NOT NULL,
    test_date              DATE NOT NULL
);

DO $fixture$
DECLARE
    v_branch_id            BIGINT;
    v_specialty_id         BIGINT;
    v_doc_a_emp            BIGINT;
    v_doc_b_emp            BIGINT;
    v_staff_emp            BIGINT;
    v_staff_user           BIGINT;
    v_pat_1                BIGINT;
    v_pat_2                BIGINT;
    v_pat_3                BIGINT;
    v_appt_1               BIGINT;
    v_appt_1_num           CITEXT;
    v_appt_2               BIGINT;
    v_appt_2_num           CITEXT;
    v_test_date            DATE := '2026-12-14';
BEGIN
    -- Branch
    INSERT INTO catms.branch (branch_code, name, address_line_1, city, contact_phone)
    VALUES ('BR031C', 'Concurrency Branch', '100 Galle Road', 'Colombo', '+94112000031')
    RETURNING branch_id INTO v_branch_id;

    -- Specialty
    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('SPEC031C', 'General Medicine Concurrency')
    RETURNING specialty_id INTO v_specialty_id;

    -- Doctors
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP031DOCA', 'Dr. Concurrency Alpha', '198001010031V',
        '1980-01-01', 'Male', 'Doctor',
        '2018-01-01', 'Active', '+94770000031'
    )
    RETURNING employee_id INTO v_doc_a_emp;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_doc_a_emp, 'SLMC-031-A', CURRENT_DATE - INTERVAL '5 years');

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id)
    VALUES (v_doc_a_emp, v_specialty_id);

    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP031DOCB', 'Dr. Concurrency Beta', '198202020031V',
        '1982-02-02', 'Female', 'Doctor',
        '2019-01-01', 'Active', '+94770000032'
    )
    RETURNING employee_id INTO v_doc_b_emp;

    INSERT INTO catms.doctor_profile (doctor_id, medical_license_no, practice_start_date)
    VALUES (v_doc_b_emp, 'SLMC-031-B', CURRENT_DATE - INTERVAL '3 years');

    INSERT INTO catms.doctor_specialty (doctor_id, specialty_id)
    VALUES (v_doc_b_emp, v_specialty_id);

    -- Recurring availability
    INSERT INTO catms.doctor_availability (doctor_id, branch_id, day_of_week, start_time, end_time)
    VALUES 
        (v_doc_a_emp, v_branch_id, 'Mon', '08:00', '18:00'),
        (v_doc_b_emp, v_branch_id, 'Mon', '08:00', '18:00');

    -- Staff and user account
    INSERT INTO catms.employee (
        employee_number, full_name, nic,
        date_of_birth, gender_code, position_code,
        hire_date, employment_status, phone
    )
    VALUES (
        'EMP031RECP', 'Concurrency Operator', '199003030031V',
        '1990-03-03', 'Female', 'Receptionist',
        '2021-01-01', 'Active', '+94770000033'
    )
    RETURNING employee_id INTO v_staff_emp;

    INSERT INTO catms.user_account (
        employee_id, username, password_hash, account_status
    )
    VALUES (
        v_staff_emp, 'rec_operator_031',
        '$2b$12$0123456789012345678901', 'Active'
    )
    RETURNING user_account_id INTO v_staff_user;

    -- Patients
    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth,
        gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-031C-1', 'Patient', 'One', '1991-04-04', 'Female', '+94711110031', v_branch_id)
    RETURNING patient_id INTO v_pat_1;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_pat_1, 'NIC', '199104040031V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_pat_1, 'EC One', 'Parent', '+94711110032', TRUE);

    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth,
        gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-031C-2', 'Patient', 'Two', '1992-05-05', 'Male', '+94711110033', v_branch_id)
    RETURNING patient_id INTO v_pat_2;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_pat_2, 'NIC', '199205050031V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_pat_2, 'EC Two', 'Spouse', '+94711110034', TRUE);

    INSERT INTO catms.patient (
        patient_number, first_name, last_name, date_of_birth,
        gender, contact_number, registered_branch_id
    )
    VALUES ('PAT-031C-3', 'Patient', 'Three', '1993-06-06', 'Female', '+94711110035', v_branch_id)
    RETURNING patient_id INTO v_pat_3;
    INSERT INTO catms.patient_identity (patient_id, identity_type, identity_number, is_primary)
    VALUES (v_pat_3, 'NIC', '199306060031V', TRUE);
    INSERT INTO catms.emergency_contact (patient_id, contact_name, relationship, phone_number, is_primary)
    VALUES (v_pat_3, 'EC Three', 'Sibling', '+94711110036', TRUE);

    -- Pre-created appointments for reschedule collision tests
    CALL catms.book_appointment(
        v_pat_1, v_doc_a_emp, v_branch_id, v_specialty_id,
        (v_test_date || ' 11:00:00+00')::TIMESTAMPTZ,
        (v_test_date || ' 11:30:00+00')::TIMESTAMPTZ,
        'Booked', v_staff_user, 'Pre-created appointment 1',
        v_appt_1, v_appt_1_num
    );

    CALL catms.book_appointment(
        v_pat_2, v_doc_a_emp, v_branch_id, v_specialty_id,
        (v_test_date || ' 14:00:00+00')::TIMESTAMPTZ,
        (v_test_date || ' 14:30:00+00')::TIMESTAMPTZ,
        'Booked', v_staff_user, 'Pre-created appointment 2',
        v_appt_2, v_appt_2_num
    );

    INSERT INTO public.catms031_test_ids (
        id, branch_id, specialty_id, doctor_a_id, doctor_b_id,
        actor_user_id, actor_employee_id, patient_1_id, patient_2_id, patient_3_id,
        reschedule_appt_1_id, reschedule_appt_2_id, test_date
    ) VALUES (
        1, v_branch_id, v_specialty_id, v_doc_a_emp, v_doc_b_emp,
        v_staff_user, v_staff_emp, v_pat_1, v_pat_2, v_pat_3,
        v_appt_1, v_appt_2, v_test_date
    );

    RAISE NOTICE '031_scheduling_concurrency_fixture seeded.';
END;
$fixture$;

COMMIT;
