-- CATMS-035 / CATMS-036: real-claim payment integration tests.
-- Requires migrations through 130 and the policy/treatment FK.
-- Run as catms_super in a development/test database.
-- All fixture data is rolled back; sequences may advance.

\set ON_ERROR_STOP on

BEGIN;
SET LOCAL statement_timeout = '30s';

DO $test$
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
    v_patient_payment BIGINT;
    v_insurer_payment BIGINT;
    v_retry BIGINT;
    v_caught BOOLEAN;
    v_count BIGINT;
    v_audit_count BIGINT;

    v_patient_key UUID := gen_random_uuid();
    v_insurer_key UUID := gen_random_uuid();
    v_failed_key UUID := gen_random_uuid();
BEGIN
    -- 1. Complete fictional clinical and financial fixture.

    INSERT INTO catms.branch (
        branch_code, name, address_line_1, city, contact_phone
    )
    VALUES (
        'RULE130', 'Payment Test Branch',
        'Test Address', 'Colombo', '0110000130'
    )
    RETURNING branch_id INTO v_branch;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code,
        date_of_birth, position_code, phone, hire_date
    )
    VALUES (
        'RULE130', '199001019930', 'Payment Test Doctor',
        'Male', '1990-01-01', 'Doctor',
        '0770000130', CURRENT_DATE
    )
    RETURNING employee_id INTO v_doctor;

    INSERT INTO catms.doctor_profile (
        doctor_id, medical_license_no, practice_start_date
    )
    VALUES (v_doctor, 'RULE130', '2015-01-01');

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('RULE130', 'Payment Test Specialty')
    RETURNING specialty_id INTO v_specialty;

    INSERT INTO catms.doctor_specialty (
        doctor_id, specialty_id, is_primary
    )
    VALUES (v_doctor, v_specialty, TRUE);

    INSERT INTO catms.user_account (
        employee_id, username, password_hash
    )
    VALUES (
        v_doctor, 'rule130_user',
        'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH'
    )
    RETURNING user_account_id INTO v_user;

    -- Explicit administrative authority for claim resolution.
    INSERT INTO catms.user_account_role (
        user_account_id, app_role_id
    )
    SELECT v_user, app_role_id
    FROM catms.app_role
    WHERE upper(role_code) = 'ADMIN';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FIXTURE_ERROR: Admin application role missing';
    END IF;

    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number,
        registered_branch_id, registered_by
    )
    VALUES (
        'RULE130', 'Temporary', 'Patient',
        '1995-01-01', 'Male', '0770000131',
        v_branch, v_doctor
    )
    RETURNING patient_id INTO v_patient;

    INSERT INTO catms.patient_identity (
        patient_id, identity_type, identity_number, is_primary
    )
    VALUES (v_patient, 'Passport', 'RULE130-PASSPORT', TRUE);

    INSERT INTO catms.emergency_contact (
        patient_id, contact_name, relationship,
        phone_number, is_primary
    )
    VALUES (
        v_patient, 'Test Contact', 'Sibling',
        '0770000132', TRUE
    );

    INSERT INTO catms.treatment_category (category_code, name)
    VALUES ('RULE130', 'Payment Test Category')
    RETURNING treatment_category_id INTO v_category;

    INSERT INTO catms.treatment_catalogue (
        treatment_category_id, service_code, name,
        current_price, default_duration_minutes,
        is_consultation_service
    )
    VALUES (
        v_category, 'RULE130-SERVICE', 'Payment Test Service',
        10000.00, 15, FALSE
    )
    RETURNING treatment_id INTO v_treatment;

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id,
        branch_id, specialty_id, start_at, end_at,
        status, created_by
    )
    VALUES (
        'RULE130', v_patient, v_doctor,
        v_branch, v_specialty,
        '2026-10-05 10:00:00+05:30',
        '2026-10-05 10:15:00+05:30',
        'Completed', v_user
    )
    RETURNING appointment_id INTO v_appointment;

    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;

    PERFORM catms.record_appointment_treatment(
        v_appointment, v_treatment, 1, v_user
    );

    v_invoice := catms.issue_invoice(v_appointment, v_user);

    INSERT INTO catms.insurance_provider (provider_code, name)
    VALUES ('RULE130', 'Payment Test Insurer')
    RETURNING provider_id INTO v_provider;

    INSERT INTO catms.insurance_policy (
        patient_id, provider_id, policy_number,
        policy_status, valid_from, valid_to
    )
    VALUES (
        v_patient, v_provider, 'RULE130-POLICY',
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

    v_claim := catms.submit_claim(v_invoice, v_policy, v_user);

    -- 2. Pending claims cannot receive insurer payments.

    v_caught := FALSE;

    BEGIN
        PERFORM catms.post_payment_idempotent(
            v_invoice, 'Insurer', 100.00, 'BankTransfer',
            v_user, gen_random_uuid(), v_claim
        );
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'PAYMENT_APPROVED_CLAIM_REQUIRED:%' THEN
            RAISE;
        END IF;
        v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: Pending claim accepted';
    END IF;

    IF EXISTS (
        SELECT 1 FROM catms.payment WHERE invoice_id = v_invoice
    ) THEN
        RAISE EXCEPTION 'FAIL: rejected claim payment left a receipt';
    END IF;

    RAISE NOTICE 'PASS: Pending claim payment rejected without receipt';

    -- 3. Patient pays before claim resolution.

    SET LOCAL ROLE catms_admin;

    v_patient_payment := catms.post_payment_idempotent(
        v_invoice, 'Patient', 5000.00, 'Cash',
        v_user, v_patient_key
    );

    RESET ROLE;

    IF NOT EXISTS (
        SELECT 1 FROM catms.invoice
        WHERE invoice_id = v_invoice
          AND patient_paid_amount = 5000.00
          AND patient_payment_status = 'PartiallyPaid'
    ) THEN
        RAISE EXCEPTION 'FAIL: partial patient payment totals/status';
    END IF;

    -- Approval reduces liability from 10,000 to 4,000.
    -- Preserve the existing 5,000 receipt, creating a 1,000 credit.

    PERFORM catms.resolve_claim(
        v_claim, 'PartiallyApproved', 6000.00, v_user
    );

    IF NOT EXISTS (
        SELECT 1 FROM catms.invoice
        WHERE invoice_id = v_invoice
          AND approved_insurance_amount = 6000.00
          AND patient_liability_amount = 4000.00
          AND patient_paid_amount = 5000.00
          AND patient_payment_status = 'Paid'
    ) THEN
        RAISE EXCEPTION 'FAIL: late approval credit/status';
    END IF;

    PERFORM catms.reverse_payment(
        v_patient_payment, 1000.00,
        'Refund patient credit after claim approval', v_user
    );

    RAISE NOTICE 'PASS: real claim approval preserves credit and permits refund';

    -- 4. Insurer receipt and identical retry produce one receipt.

    SET LOCAL ROLE catms_admin;

    v_insurer_payment := catms.post_payment_idempotent(
        v_invoice, 'Insurer', 6000.00, 'BankTransfer',
        v_user, v_insurer_key, v_claim
    );

    v_retry := catms.post_payment_idempotent(
        v_invoice, 'Insurer', 6000.00, 'BankTransfer',
        v_user, v_insurer_key, v_claim
    );

    RESET ROLE;

    IF v_retry <> v_insurer_payment THEN
        RAISE EXCEPTION 'FAIL: retry returned a different payment';
    END IF;

    SELECT count(*) INTO v_count
    FROM catms.payment
    WHERE invoice_id = v_invoice AND payer_type = 'Insurer';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: duplicate insurer receipt';
    END IF;

    SELECT count(*) INTO v_count
    FROM catms.audit_event
    WHERE entity_type = 'payment'
      AND entity_id = v_insurer_payment::TEXT
      AND action_code = 'PAYMENT_POSTED';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'FAIL: duplicate or missing payment audit';
    END IF;

    RAISE NOTICE 'PASS: insurer retry preserves one receipt and audit entry';

    -- 5. The insurer cannot pay beyond approved coverage.

    v_caught := FALSE;

    BEGIN
        PERFORM catms.post_payment_idempotent(
            v_invoice, 'Insurer', 0.01, 'BankTransfer',
            v_user, gen_random_uuid(), v_claim
        );
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'PAYMENT_OVER_CAP:%' THEN
            RAISE;
        END IF;
        v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: insurer overpayment accepted';
    END IF;

    -- 6. Partial reversal decreases net insurer receipts.

    PERFORM catms.reverse_payment(
        v_insurer_payment, 1000.00,
        'Incorrect insurer receipt allocation', v_user
    );

    IF NOT EXISTS (
        SELECT 1 FROM catms.payment
        WHERE payment_id = v_insurer_payment
          AND amount = 6000.00
          AND payment_status = 'PartiallyReversed'
    ) THEN
        RAISE EXCEPTION 'FAIL: reversal changed receipt facts/status';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM catms.invoice
        WHERE invoice_id = v_invoice
          AND insurer_paid_amount = 5000.00
    ) THEN
        RAISE EXCEPTION 'FAIL: insurer reversal total';
    END IF;

    -- Already reversed 1,000; only 5,000 remains reversible.
    v_caught := FALSE;

    BEGIN
        PERFORM catms.reverse_payment(
            v_insurer_payment, 5000.01,
            'This reversal must be rejected', v_user
        );
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'REVERSAL_OVER_CAP:%' THEN
            RAISE;
        END IF;
        v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: excessive reversal accepted';
    END IF;

    RAISE NOTICE 'PASS: insurer payment and reversal caps';

    -- 7. Forced failure rolls back receipt, audit and cached totals.

    SELECT count(*) INTO v_audit_count
    FROM catms.audit_event
    WHERE actor_user_id = v_user;

    v_caught := FALSE;

    BEGIN
        PERFORM catms.post_payment_idempotent(
            v_invoice, 'Insurer', 1000.00, 'BankTransfer',
            v_user, v_failed_key, v_claim
        );

        SET CONSTRAINTS ALL IMMEDIATE;

        RAISE EXCEPTION USING
            ERRCODE = 'PZ130',
            MESSAGE = 'INDUCED_PAYMENT_FAILURE';

    EXCEPTION WHEN SQLSTATE 'PZ130' THEN
        v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: induced error was not caught';
    END IF;

    IF EXISTS (
        SELECT 1 FROM catms.payment
        WHERE idempotency_key = v_failed_key
    ) THEN
        RAISE EXCEPTION 'FAIL: failed receipt survived rollback';
    END IF;

    IF (
        SELECT count(*) FROM catms.audit_event
        WHERE actor_user_id = v_user
    ) <> v_audit_count THEN
        RAISE EXCEPTION 'FAIL: failed receipt audit survived rollback';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM catms.invoice
        WHERE invoice_id = v_invoice
          AND insurer_paid_amount = 5000.00
    ) THEN
        RAISE EXCEPTION 'FAIL: cached insurer total survived failed write';
    END IF;

    -- The failed request left no receipt, so retrying its key can succeed.

    PERFORM catms.post_payment_idempotent(
        v_invoice, 'Insurer', 1000.00, 'BankTransfer',
        v_user, v_failed_key, v_claim
    );

    SET CONSTRAINTS ALL IMMEDIATE;

    IF NOT EXISTS (
        SELECT 1 FROM catms.invoice
        WHERE invoice_id = v_invoice
          AND subtotal_amount = 10000.00
          AND approved_insurance_amount = 6000.00
          AND patient_liability_amount = 4000.00
          AND patient_paid_amount = 4000.00
          AND insurer_paid_amount = 6000.00
          AND patient_payment_status = 'Paid'
    ) THEN
        RAISE EXCEPTION 'FAIL: final invoice reconciliation';
    END IF;

    RAISE NOTICE 'PASS: forced rollback, successful retry and final reconciliation';
END;
$test$;

ROLLBACK;