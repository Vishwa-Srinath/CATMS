-- CATMS-036: committed fixture for two-session tests.
-- Requires the real schema, including migrations 110–112 and 130.
-- Run only in a freshly prepared disposable test database.
-- Never run against catms_dev.

\set ON_ERROR_STOP on

BEGIN;
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF current_database() <> 'catms036_concurrency' THEN
        RAISE EXCEPTION
            'Use the disposable database catms036_concurrency only.';
    END IF;

    IF to_regclass('public.catms036_test_ids') IS NOT NULL THEN
        RAISE EXCEPTION
            'Fixture already exists. Recreate the disposable database before rerunning.';
    END IF;
END;
$$;

CREATE TABLE public.catms036_test_ids (
    scenario TEXT PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    actor_id BIGINT NOT NULL,
    claim_id BIGINT
);

DO $fixture$
DECLARE
    v_branch BIGINT;
    v_doctor BIGINT;
    v_specialty BIGINT;
    v_user BIGINT;
    v_patient BIGINT;
    v_category BIGINT;
    v_treatment BIGINT;
    v_appointment BIGINT;
    v_invoice BIGINT;
    v_provider BIGINT;
    v_policy BIGINT;
    v_claim BIGINT;
    v_start TIMESTAMPTZ;
    v_scenario TEXT;
BEGIN
    INSERT INTO catms.branch (
        branch_code, name, address_line_1, city, contact_phone
    )
    VALUES (
        'CON036', 'Concurrency Test Branch',
        'Test Address', 'Colombo', '0110000036'
    )
    RETURNING branch_id INTO v_branch;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code,
        date_of_birth, position_code, phone, hire_date
    )
    VALUES (
        'CON036', '199001019936', 'Concurrency Test Doctor',
        'Male', '1990-01-01', 'Doctor',
        '0770000036', CURRENT_DATE
    )
    RETURNING employee_id INTO v_doctor;

    INSERT INTO catms.doctor_profile (
        doctor_id, medical_license_no, practice_start_date
    )
    VALUES (v_doctor, 'CON036', '2015-01-01');

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('CON036', 'Concurrency Test Specialty')
    RETURNING specialty_id INTO v_specialty;

    INSERT INTO catms.doctor_specialty (
        doctor_id, specialty_id, is_primary
    )
    VALUES (v_doctor, v_specialty, TRUE);

    INSERT INTO catms.user_account (
        employee_id, username, password_hash
    )
    VALUES (
        v_doctor, 'con036_user',
        'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH'
    )
    RETURNING user_account_id INTO v_user;

    INSERT INTO catms.user_account_role (
        user_account_id, app_role_id
    )
    SELECT v_user, app_role_id
    FROM catms.app_role
    WHERE upper(role_code) = 'ADMIN';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Admin application role is missing.';
    END IF;

    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number,
        registered_branch_id, registered_by
    )
    VALUES (
        'CON036', 'Temporary', 'Patient',
        '1995-01-01', 'Male', '0770000037',
        v_branch, v_doctor
    )
    RETURNING patient_id INTO v_patient;

    INSERT INTO catms.patient_identity (
        patient_id, identity_type, identity_number, is_primary
    )
    VALUES (v_patient, 'Passport', 'CON036-PASSPORT', TRUE);

    INSERT INTO catms.emergency_contact (
        patient_id, contact_name, relationship,
        phone_number, is_primary
    )
    VALUES (
        v_patient, 'Test Contact', 'Sibling',
        '0770000038', TRUE
    );

    INSERT INTO catms.treatment_category (category_code, name)
    VALUES ('CON036', 'Concurrency Test Category')
    RETURNING treatment_category_id INTO v_category;

    INSERT INTO catms.treatment_catalogue (
        treatment_category_id, service_code, name,
        current_price, default_duration_minutes,
        is_consultation_service
    )
    VALUES (
        v_category, 'CON036-SERVICE', 'Concurrency Test Service',
        10000.00, 15, FALSE
    )
    RETURNING treatment_id INTO v_treatment;

    INSERT INTO catms.insurance_provider (provider_code, name)
    VALUES ('CON036', 'Concurrency Test Insurer')
    RETURNING provider_id INTO v_provider;

    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number,
        policy_status, valid_from, valid_to
    )
    VALUES (
        v_patient, v_provider, 'CON036-POLICY',
        'ACTIVE', '2026-01-01', '2026-12-31'
    )
    RETURNING policy_id INTO v_policy;

    INSERT INTO catms.policy_coverage (
        policy_id, treatment_id, coverage_percentage,
        coverage_cap, effective_from
    )
    VALUES (
        v_policy, v_treatment, 80.00,
        8000.00, '2026-01-01'
    );

    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;

    -- Use separate invoices so payment-cap tests do not affect
    -- the claim-resolution concurrency scenario.
    FOREACH v_scenario IN ARRAY ARRAY['patient', 'claim'] LOOP
        IF v_scenario = 'patient' THEN
            v_start := '2026-10-05 09:00:00+05:30';
        ELSE
            v_start := '2026-10-05 10:00:00+05:30';
        END IF;

        INSERT INTO catms.appointment (
            appointment_number, patient_id, doctor_id,
            branch_id, specialty_id, start_at, end_at,
            status, created_by
        )
        VALUES (
            'CON036-' || v_scenario,
            v_patient, v_doctor, v_branch, v_specialty,
            v_start, v_start + INTERVAL '15 minutes',
            'Completed', v_user
        )
        RETURNING appointment_id INTO v_appointment;

        PERFORM catms.record_appointment_treatment(
            v_appointment, v_treatment, 1, v_user
        );

        v_invoice := catms.issue_invoice(v_appointment, v_user);
        v_claim := NULL;

        IF v_scenario = 'claim' THEN
            v_claim := catms.submit_claim(
                v_invoice, v_policy, v_user
            );
        END IF;

        INSERT INTO public.catms036_test_ids (
            scenario, invoice_id, actor_id, claim_id
        )
        VALUES (
            v_scenario, v_invoice, v_user, v_claim
        );
    END LOOP;

    SET CONSTRAINTS ALL IMMEDIATE;
END;
$fixture$;

COMMIT;