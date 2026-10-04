-- CATMS-032: consultation recording, revisions, and rejection tests.
-- Requires migrations through 092.
-- All fixture rows are rolled back.

BEGIN;

DO $$
DECLARE
    v_branch BIGINT;
    v_doctor BIGINT;
    v_specialty BIGINT;
    v_user BIGINT;
    v_patient BIGINT;
    v_appointment BIGINT;
    v_note BIGINT;
    v_revision INTEGER;
    v_caught BOOLEAN;
BEGIN
    -- Create the required test records.
    INSERT INTO catms.branch (
        branch_code, name, address_line_1, city, contact_phone
    )
    VALUES (
        'RULE092', 'Clinical Rule Test Branch',
        'Test Address', 'Colombo', '0110000092'
    )
    RETURNING branch_id INTO v_branch;

    INSERT INTO catms.employee (
        employee_number, nic, full_name, gender_code,
        date_of_birth, position_code, phone, hire_date
    )
    VALUES (
        'RULE092', '199001019992', 'Clinical Test Doctor',
        'Male', '1990-01-01', 'Doctor', '0770000092', CURRENT_DATE
    )
    RETURNING employee_id INTO v_doctor;

    INSERT INTO catms.doctor_profile (
        doctor_id, medical_license_no, practice_start_date
    )
    VALUES (v_doctor, 'RULE092', '2015-01-01');

    INSERT INTO catms.specialty (specialty_code, name)
    VALUES ('RULE092', 'Clinical Rule Test Specialty')
    RETURNING specialty_id INTO v_specialty;

    INSERT INTO catms.doctor_specialty (
        doctor_id, specialty_id, is_primary
    )
    VALUES (v_doctor, v_specialty, TRUE);

    -- Dummy credential for this rollback-only test.
    INSERT INTO catms.user_account (
        employee_id, username, password_hash
    )
    VALUES (
        v_doctor, 'rule092_user',
        'TEST_ONLY_NOT_A_USABLE_PASSWORD_HASH'
    )
    RETURNING user_account_id INTO v_user;

    INSERT INTO catms.patient (
        patient_number, first_name, last_name,
        date_of_birth, gender, contact_number,
        registered_branch_id, registered_by
    )
    VALUES (
        'RULE092', 'Temporary', 'Patient',
        '1995-01-01', 'Male', '0770000093',
        v_branch, v_doctor
    )
    RETURNING patient_id INTO v_patient;

    INSERT INTO catms.patient_identity (
        patient_id, identity_type, identity_number, is_primary
    )
    VALUES (v_patient, 'Passport', 'RULE092-PASSPORT', TRUE);

    INSERT INTO catms.emergency_contact (
        patient_id, contact_name, relationship,
        phone_number, is_primary
    )
    VALUES (
        v_patient, 'Test Contact', 'Sibling',
        '0770000094', TRUE
    );

    INSERT INTO catms.appointment (
        appointment_number, patient_id, doctor_id,
        branch_id, specialty_id, start_at, end_at,
        status, created_by
    )
    VALUES (
        'RULE092', v_patient, v_doctor,
        v_branch, v_specialty,
        '2026-10-01 15:00:00+05:30',
        '2026-10-01 15:15:00+05:30',
        'Completed', v_user
    )
    RETURNING appointment_id INTO v_appointment;

    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;

    -- 1. A clinician can record and amend a note.
    SET LOCAL ROLE catms_clinician;

    v_note := catms.record_consultation_note(
        v_appointment, v_user, 'Original notes.'
    );

    v_revision := catms.amend_consultation_note(
        v_appointment, v_user,
        'Updated notes.', 'Added information.'
    );

    IF v_revision <> 2 THEN
        RAISE EXCEPTION 'FAIL: amendment did not return revision 2';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM catms.consultation_note_revision
        WHERE consultation_note_id = v_note
          AND revision_no = 1
          AND notes = 'Original notes.'
    ) THEN
        RAISE EXCEPTION 'FAIL: original revision was not preserved';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM catms.consultation_note_revision
        WHERE consultation_note_id = v_note
          AND revision_no = 2
          AND notes = 'Updated notes.'
          AND amendment_reason = 'Added information.'
          AND recorded_by_user_id = v_user
    ) THEN
        RAISE EXCEPTION 'FAIL: amendment content or author is incorrect';
    END IF;

    RAISE NOTICE 'PASS: recording, amendment, history, and author';

    -- 2. A blank amendment reason is rejected.
    v_caught := FALSE;

    BEGIN
        PERFORM catms.amend_consultation_note(
            v_appointment, v_user, 'Rejected notes.', '   '
        );
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'AMENDMENT_REASON_REQUIRED:%' THEN
            RAISE;
        END IF;
        v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: blank amendment reason was accepted';
    END IF;

    RAISE NOTICE 'PASS: blank amendment reason rejected';

    -- Use the administrator to exercise the immutable-row trigger.
    RESET ROLE;

    -- 3. Updating a stored revision is rejected.
    v_caught := FALSE;

    BEGIN
        UPDATE catms.consultation_note_revision
        SET notes = 'Forbidden change.'
        WHERE consultation_note_id = v_note
          AND revision_no = 1;
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'CLINICAL_REVISION_IMMUTABLE:%' THEN
            RAISE;
        END IF;
        v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: revision update was accepted';
    END IF;

    -- 4. Deleting a stored revision is rejected.
    v_caught := FALSE;

    BEGIN
        DELETE FROM catms.consultation_note_revision
        WHERE consultation_note_id = v_note
          AND revision_no = 1;
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM NOT LIKE 'CLINICAL_REVISION_IMMUTABLE:%' THEN
            RAISE;
        END IF;
        v_caught := TRUE;
    END;

    IF NOT v_caught THEN
        RAISE EXCEPTION 'FAIL: revision delete was accepted';
    END IF;

    RAISE NOTICE 'PASS: revision update and delete rejected';

    -- 5. Failed operations must leave exactly two revisions.
    IF (
        SELECT count(*)
        FROM catms.consultation_note_revision
        WHERE consultation_note_id = v_note
    ) <> 2 THEN
        RAISE EXCEPTION 'FAIL: unexpected revision count';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM catms.consultation_note
        WHERE consultation_note_id = v_note
          AND current_revision_no = 2
    ) THEN
        RAISE EXCEPTION 'FAIL: incorrect header revision';
    END IF;

    SET CONSTRAINTS ALL IMMEDIATE;

    RAISE NOTICE 'PASS: header consistency and deferred constraints';
END;
$$;

ROLLBACK;