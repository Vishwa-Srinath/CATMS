-- CATMS-036: cross-module transaction rollback evidence.
--
-- Required: consultation notes, treatment recording and invoice issuance
-- from migrations 092, 093 and 094.
--
-- Optional: CATMS-035 payment implementation.
-- If payment posting is unavailable, the payment case is explicitly
-- reported as PENDING. That does not mean CATMS-036 is complete.
--
-- Run as catms_super against a development/test database.
-- Every fixture created here is rolled back.
-- Sequence numbers may advance despite rollback.

\set ON_ERROR_STOP on

BEGIN;

SET LOCAL statement_timeout = '30s';

DO $test$
DECLARE
    v_branch       BIGINT;
    v_doctor       BIGINT;
    v_specialty    BIGINT;
    v_user         BIGINT;
    v_patient      BIGINT;
    v_appointment  BIGINT;
    v_category     BIGINT;
    v_treatment    BIGINT;

    v_note         BIGINT;
    v_line         BIGINT;
    v_invoice      BIGINT;
    v_payment      BIGINT;

    v_revision     INTEGER;
    v_caught       BOOLEAN;
    v_payment_available BOOLEAN;

    v_key UUID := gen_random_uuid();
BEGIN
    -- ================================================================
    -- 1. Create a complete fictional fixture.
    -- ================================================================

    INSERT INTO catms.branch (
        branch_code, name, address_line_1, city, contact_phone
    )
    VALUES (
        'RULE036', 'Transaction Test Branch',
        'Test Address', 'Colombo', '0110000036'
    )
    RETURNING branch_id INTO v_branch;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code,
        date_of_birth, position_code, phone, hire_date
    )
    VALUES (
        'RULE036', '199001019936', 'Transaction Test Doctor',
        'Male', '1990-01-01', 'Doctor',
        '0770000036', CURRENT_DATE
    )
    RETURNING employee_id INTO v_doctor;

    INSERT INTO catms.doctor_profile (
        doctor_id, medical_license_no, practice_start_date
    )
    VALUES (
        v_doctor, 'RULE036', '2015-01-01'
    );

    INSERT INTO catms.specialty (
        specialty_code, name
    )
    VALUES (
        'RULE036', 'Transaction Test Specialty'
    )
    RETURNING specialty_id INTO v_specialty;

    INSERT INTO catms.doctor_specialty (
        doctor_id, specialty_id, is_primary
    )
    VALUES (
        v_doctor, v_specialty, TRUE
    );

    INSERT INTO catms.user_account (
        employee_id, username, password_hash
    )
    VALUES (
        v_doctor,
        'rule036_user',
        'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH'
    )
    RETURNING user_account_id INTO v_user;

    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number,
        registered_branch_id, registered_by
    )
    VALUES (
        'RULE036', 'Temporary', 'Patient',
        '1995-01-01', 'Male', '0770000037',
        v_branch, v_doctor
    )
    RETURNING patient_id INTO v_patient;

    INSERT INTO catms.patient_identity (
        patient_id, identity_type, identity_number, is_primary
    )
    VALUES (
        v_patient, 'Passport', 'RULE036-PASSPORT', TRUE
    );

    INSERT INTO catms.emergency_contact (
        patient_id, contact_name, relationship,
        phone_number, is_primary
    )
    VALUES (
        v_patient, 'Test Contact', 'Sibling',
        '0770000038', TRUE
    );

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id,
        branch_id, specialty_id, start_at, end_at,
        status, created_by
    )
    VALUES (
        'RULE036',
        v_patient,
        v_doctor,
        v_branch,
        v_specialty,
        '2026-10-05 09:00:00+05:30',
        '2026-10-05 09:15:00+05:30',
        'Completed',
        v_user
    )
    RETURNING appointment_id INTO v_appointment;

    INSERT INTO catms.treatment_category (
        category_code, name
    )
    VALUES (
        'RULE036', 'Transaction Test Category'
    )
    RETURNING treatment_category_id INTO v_category;

    INSERT INTO catms.treatment_catalogue (
        treatment_category_id,
        service_code,
        name,
        current_price,
        default_duration_minutes,
        is_consultation_service
    )
    VALUES (
        v_category,
        'RULE036-SERVICE',
        'Transaction Test Service',
        500.00,
        15,
        FALSE
    )
    RETURNING treatment_id INTO v_treatment;

    -- Validate all fixture relationships before testing business actions.
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;

    v_payment_available := to_regprocedure(
        'catms.post_payment_idempotent(bigint,text,numeric,text,bigint,uuid,bigint,text)'
    ) IS NOT NULL;

    -- ================================================================
    -- 2. Force failure after clinical and financial writes.
    --
    -- A block with an EXCEPTION handler is a subtransaction.
    -- Its database writes are rolled back when its error is caught.
    -- ================================================================

    v_caught := FALSE;

    BEGIN
        v_note := catms.record_consultation_note(
            v_appointment,
            v_user,
            'This note must disappear after forced failure.'
        );

        v_line := catms.record_appointment_treatment(
            v_appointment,
            v_treatment,
            2,
            v_user
        );

        v_invoice := catms.issue_invoice(
            v_appointment,
            v_user
        );

        IF NOT EXISTS (
            SELECT 1
            FROM catms.invoice
            WHERE invoice_id = v_invoice
              AND subtotal_amount = 1000.00
        ) THEN
            RAISE EXCEPTION
                'FAIL: invoice was not correctly created before failure';
        END IF;

        -- Dynamic SQL keeps this test usable before CATMS-035 is installed.
        -- Payment coverage is conditional and reported explicitly below.
        IF v_payment_available THEN
            EXECUTE
                'SELECT catms.post_payment_idempotent(
                    $1, $2, $3, $4, $5, $6, $7, $8
                )'
            INTO v_payment
            USING
                v_invoice,
                'Patient'::TEXT,
                100.00::NUMERIC,
                'Cash'::TEXT,
                v_user,
                v_key,
                NULL::BIGINT,
                NULL::TEXT;

            IF NOT EXISTS (
                SELECT 1
                FROM catms.invoice
                WHERE invoice_id = v_invoice
                  AND patient_paid_amount = 100.00
            ) THEN
                RAISE EXCEPTION
                    'FAIL: payment did not update invoice before failure';
            END IF;
        END IF;

        -- Confirm that the transaction is otherwise valid.
        SET CONSTRAINTS ALL IMMEDIATE;

        -- Deliberately fail AFTER the writes above succeeded.
        RAISE EXCEPTION USING
            ERRCODE = 'PZ036',
            MESSAGE = 'INDUCED_CATMS036_FAILURE';

    EXCEPTION
        WHEN SQLSTATE 'PZ036' THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: induced failure was not caught';
    END IF;

    -- Only our deliberate error was caught.
    -- Unexpected errors automatically fail the test.

    IF EXISTS (
        SELECT 1
        FROM catms.consultation_note
        WHERE appointment_id = v_appointment
    ) THEN
        RAISE EXCEPTION 'FAIL: consultation header survived rollback';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM catms.consultation_note_revision
        WHERE consultation_note_id = v_note
    ) THEN
        RAISE EXCEPTION 'FAIL: consultation revision survived rollback';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM catms.appointment_treatment
        WHERE appointment_id = v_appointment
    ) THEN
        RAISE EXCEPTION 'FAIL: treatment survived rollback';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM catms.invoice
        WHERE appointment_id = v_appointment
    ) THEN
        RAISE EXCEPTION 'FAIL: invoice survived rollback';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM catms.invoice_line
        WHERE invoice_id = v_invoice
    ) THEN
        RAISE EXCEPTION 'FAIL: invoice line survived rollback';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM catms.payment
        WHERE invoice_id = v_invoice
    ) THEN
        RAISE EXCEPTION 'FAIL: payment survived rollback';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM catms.audit_event
        WHERE entity_type = 'invoice'
          AND entity_id = v_invoice::TEXT
          AND action_code = 'INVOICE_ISSUED'
    ) THEN
        RAISE EXCEPTION 'FAIL: invoice audit survived rollback';
    END IF;

    IF v_payment_available AND EXISTS (
        SELECT 1
        FROM catms.audit_event
        WHERE entity_type = 'payment'
          AND entity_id = v_payment::TEXT
          AND action_code = 'PAYMENT_POSTED'
    ) THEN
        RAISE EXCEPTION 'FAIL: payment audit survived rollback';
    END IF;

    RAISE NOTICE
        'PASS: forced failure leaves no consultation, treatment, invoice or invoice audit';

    IF v_payment_available THEN
        RAISE NOTICE
            'PASS: payment and payment audit also rolled back';
    ELSE
        RAISE NOTICE
            'PENDING: payment rollback case requires CATMS-035 installation';
    END IF;

    -- ================================================================
    -- 3. Demonstrate successful recovery after the failed transaction.
    -- ================================================================

    SET CONSTRAINTS ALL DEFERRED;

    v_note := catms.record_consultation_note(
        v_appointment,
        v_user,
        'Original consultation.'
    );

    -- Fail AFTER a valid amendment was written.
    v_caught := FALSE;

    BEGIN
        v_revision := catms.amend_consultation_note(
            v_appointment,
            v_user,
            'This amendment must disappear.',
            'Testing amendment rollback.'
        );

        IF v_revision <> 2 THEN
            RAISE EXCEPTION 'FAIL: expected revision 2 before rollback';
        END IF;

        SET CONSTRAINTS ALL IMMEDIATE;

        RAISE EXCEPTION USING
            ERRCODE = 'PZ036',
            MESSAGE = 'INDUCED_AMENDMENT_FAILURE';

    EXCEPTION
        WHEN SQLSTATE 'PZ036' THEN
            v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: amendment failure was not caught';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM catms.consultation_note
        WHERE consultation_note_id = v_note
          AND current_revision_no = 1
    ) THEN
        RAISE EXCEPTION 'FAIL: header revision was not restored';
    END IF;

    IF (
        SELECT count(*)
        FROM catms.consultation_note_revision
        WHERE consultation_note_id = v_note
    ) <> 1 THEN
        RAISE EXCEPTION 'FAIL: failed amendment left extra revisions';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM catms.consultation_note_revision
        WHERE consultation_note_id = v_note
          AND revision_no = 1
          AND notes = 'Original consultation.'
    ) THEN
        RAISE EXCEPTION 'FAIL: original revision changed';
    END IF;

    RAISE NOTICE 'PASS: failed amendment restores header and history';

    -- Retry as a new, successful operation.
    SET CONSTRAINTS ALL DEFERRED;

    v_revision := catms.amend_consultation_note(
        v_appointment,
        v_user,
        'Valid updated consultation.',
        'Additional examination findings.'
    );

    IF v_revision <> 2 THEN
        RAISE EXCEPTION 'FAIL: successful retry did not create revision 2';
    END IF;

    v_line := catms.record_appointment_treatment(
        v_appointment,
        v_treatment,
        2,
        v_user
    );

    v_invoice := catms.issue_invoice(
        v_appointment,
        v_user
    );

    SET CONSTRAINTS ALL IMMEDIATE;

    IF NOT EXISTS (
        SELECT 1
        FROM catms.invoice
        WHERE invoice_id = v_invoice
          AND subtotal_amount = 1000.00
          AND patient_liability_amount = 1000.00
          AND patient_paid_amount = 0
          AND insurer_paid_amount = 0
    ) THEN
        RAISE EXCEPTION 'FAIL: successful retry totals are incorrect';
    END IF;

    IF (
        SELECT count(*)
        FROM catms.invoice_line
        WHERE invoice_id = v_invoice
    ) <> 1 THEN
        RAISE EXCEPTION 'FAIL: successful retry has incorrect line count';
    END IF;

    RAISE NOTICE
        'PASS: consultation, amendment, treatment and invoice succeed after rollback';
END;
$test$;

ROLLBACK;