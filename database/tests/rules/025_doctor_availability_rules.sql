-- =============================================================================
-- database/tests/rules/025_doctor_availability_rules.sql
-- Owner: Dev1  |  Issue: CATMS-027  |  Reviewer: Dev2
--
-- Business-rule assertions for catms.doctor_availability and
-- catms.doctor_availability_exception.
--
-- Test plan (ADR-004 §2 rules):
--   A. Prerequisite fixture seed (branch + employee + doctor_profile)
--   B. Valid recurring availability row inserts successfully
--   C. Duplicate active slot (same doctor/branch/day/start_time) is rejected
--   D. end_time <= start_time is rejected by CHECK constraint
--   E. Window shorter than 15 minutes is rejected
--   F. valid_to < valid_from is rejected
--   G. Expired availability (valid_to < today) can still be inserted
--      (historical archival use case)
--   H. Valid ExtraHours exception inserts successfully
--   I. Valid Unavailable exception inserts successfully
--   J. Overlapping same-type exception for same doctor is rejected (GiST)
--   K. ExtraHours + Unavailable on the same window are ALLOWED (different types)
--   L. Exception with end_at <= start_at is rejected
--   M. Exception shorter than 15 minutes is rejected
--   N. UPDATE on exception row is rejected (immutability trigger)
--   O. DELETE on availability row succeeds (availability is mutable)
--
-- All changes are rolled back at the end — no permanent fixture data.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_branch_id    BIGINT;
    v_branch2_id   BIGINT;
    v_emp_id       BIGINT;
    v_avail_id     BIGINT;
    v_exc_id       BIGINT;
    v_dummy        BIGINT;
    v_ok           BOOLEAN;
BEGIN

    -- =========================================================================
    -- A. Prerequisite fixture seed
    --    Minimal rows to satisfy FKs: branch → employee → doctor_profile
    -- =========================================================================

    INSERT INTO catms.branch (branch_code, name, address, phone, email)
    VALUES ('TST27A', 'Avail Test Branch A', '1 Test Rd', '+94111111111', 'avail_a@test.local')
    RETURNING branch_id INTO v_branch_id;

    INSERT INTO catms.branch (branch_code, name, address, phone, email)
    VALUES ('TST27B', 'Avail Test Branch B', '2 Test Rd', '+94222222222', 'avail_b@test.local')
    RETURNING branch_id INTO v_branch2_id;

    INSERT INTO catms.employee (
        employee_number, first_name, last_name, nic,
        date_of_birth, gender, employment_type, position,
        hire_date, employment_status
    )
    VALUES (
        'EMP027TST', 'Avail', 'Doctor', '200012345679V',
        '2000-01-01', 'Male', 'Full-Time', 'Doctor',
        CURRENT_DATE, 'Active'
    )
    RETURNING employee_id INTO v_emp_id;

    INSERT INTO catms.doctor_profile (
        doctor_id, medical_license_no, practice_start_date
    )
    VALUES (v_emp_id, 'SLMC-027-TEST', CURRENT_DATE - INTERVAL '2 years');


    -- =========================================================================
    -- B. Valid recurring availability row inserts
    -- =========================================================================

    INSERT INTO catms.doctor_availability (
        doctor_id, branch_id, day_of_week, start_time, end_time
    )
    VALUES (v_emp_id, v_branch_id, 'Mon', '09:00', '12:00')
    RETURNING availability_id INTO v_avail_id;

    IF v_avail_id IS NULL THEN
        RAISE EXCEPTION 'Test B FAILED: valid recurring availability did not insert';
    END IF;

    -- A second non-overlapping window on the same day is allowed
    INSERT INTO catms.doctor_availability (
        doctor_id, branch_id, day_of_week, start_time, end_time
    )
    VALUES (v_emp_id, v_branch_id, 'Mon', '14:00', '17:00');


    -- =========================================================================
    -- C. Duplicate active slot: same doctor + branch + day + start_time → rejected
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability (
            doctor_id, branch_id, day_of_week, start_time, end_time
        )
        VALUES (v_emp_id, v_branch_id, 'Mon', '09:00', '11:00'); -- duplicate start_time
        RAISE EXCEPTION 'Test C FAILED: duplicate active availability was accepted';
    EXCEPTION
        WHEN unique_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test C FAILED: expected unique_violation for duplicate active slot';
    END IF;


    -- =========================================================================
    -- D. end_time <= start_time → rejected by CHECK
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability (
            doctor_id, branch_id, day_of_week, start_time, end_time
        )
        VALUES (v_emp_id, v_branch_id, 'Tue', '14:00', '14:00');
        RAISE EXCEPTION 'Test D FAILED: equal start/end was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test D FAILED: expected check_violation for end_time = start_time';
    END IF;

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability (
            doctor_id, branch_id, day_of_week, start_time, end_time
        )
        VALUES (v_emp_id, v_branch_id, 'Tue', '14:00', '13:00');
        RAISE EXCEPTION 'Test D FAILED: reversed start/end was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test D FAILED: expected check_violation for end_time < start_time';
    END IF;


    -- =========================================================================
    -- E. Window < 15 minutes → rejected by CHECK
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability (
            doctor_id, branch_id, day_of_week, start_time, end_time
        )
        VALUES (v_emp_id, v_branch_id, 'Wed', '10:00', '10:10');
        RAISE EXCEPTION 'Test E FAILED: 10-minute window was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test E FAILED: expected check_violation for window < 15 minutes';
    END IF;


    -- =========================================================================
    -- F. valid_to < valid_from → rejected by CHECK
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability (
            doctor_id, branch_id, day_of_week, start_time, end_time,
            valid_from, valid_to
        )
        VALUES (v_emp_id, v_branch_id, 'Thu', '08:00', '09:00',
                CURRENT_DATE, CURRENT_DATE - 1);
        RAISE EXCEPTION 'Test F FAILED: valid_to < valid_from was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test F FAILED: expected check_violation for valid_to < valid_from';
    END IF;


    -- =========================================================================
    -- G. Historical (past valid_to) availability can be inserted
    -- =========================================================================

    INSERT INTO catms.doctor_availability (
        doctor_id, branch_id, day_of_week, start_time, end_time,
        valid_from, valid_to
    )
    VALUES (
        v_emp_id, v_branch_id, 'Fri', '08:00', '10:00',
        CURRENT_DATE - 30, CURRENT_DATE - 1
    );
    -- If we reach here without exception, test G passed.


    -- =========================================================================
    -- H. Valid ExtraHours exception inserts
    -- =========================================================================

    INSERT INTO catms.doctor_availability_exception (
        doctor_id, branch_id, exception_type, start_at, end_at, reason
    )
    VALUES (
        v_emp_id, v_branch_id,
        'ExtraHours',
        now() + INTERVAL '1 day',
        now() + INTERVAL '1 day' + INTERVAL '2 hours',
        'Emergency clinic extension'
    )
    RETURNING exception_id INTO v_exc_id;

    IF v_exc_id IS NULL THEN
        RAISE EXCEPTION 'Test H FAILED: valid ExtraHours exception did not insert';
    END IF;


    -- =========================================================================
    -- I. Valid Unavailable exception inserts
    -- =========================================================================

    INSERT INTO catms.doctor_availability_exception (
        doctor_id, branch_id, exception_type, start_at, end_at, reason
    )
    VALUES (
        v_emp_id, v_branch_id,
        'Unavailable',
        now() + INTERVAL '2 days',
        now() + INTERVAL '2 days' + INTERVAL '4 hours',
        'Conference'
    );


    -- =========================================================================
    -- J. Overlapping same-type exception → rejected (GiST exclusion)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability_exception (
            doctor_id, branch_id, exception_type, start_at, end_at
        )
        VALUES (
            v_emp_id, v_branch_id,
            'ExtraHours',
            now() + INTERVAL '1 day' + INTERVAL '30 minutes',  -- overlaps H
            now() + INTERVAL '1 day' + INTERVAL '3 hours'
        );
        RAISE EXCEPTION 'Test J FAILED: overlapping ExtraHours exception was accepted';
    EXCEPTION
        WHEN exclusion_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test J FAILED: expected exclusion_violation for overlapping same-type exception';
    END IF;


    -- =========================================================================
    -- K. ExtraHours + Unavailable on the same window → ALLOWED (different types)
    -- =========================================================================

    -- Insert an ExtraHours window
    INSERT INTO catms.doctor_availability_exception (
        doctor_id, branch_id, exception_type, start_at, end_at
    )
    VALUES (
        v_emp_id, v_branch2_id,
        'ExtraHours',
        now() + INTERVAL '3 days',
        now() + INTERVAL '3 days' + INTERVAL '2 hours'
    );

    -- Insert an Unavailable on the same window for the same doctor → should succeed
    INSERT INTO catms.doctor_availability_exception (
        doctor_id, branch_id, exception_type, start_at, end_at
    )
    VALUES (
        v_emp_id, v_branch2_id,
        'Unavailable',
        now() + INTERVAL '3 days',
        now() + INTERVAL '3 days' + INTERVAL '2 hours'
    );
    -- If both inserted without error, test K passed.


    -- =========================================================================
    -- L. Exception with end_at <= start_at → rejected by CHECK
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability_exception (
            doctor_id, branch_id, exception_type, start_at, end_at
        )
        VALUES (
            v_emp_id, v_branch_id,
            'Unavailable',
            now() + INTERVAL '5 days',
            now() + INTERVAL '5 days'   -- equal = not strictly after
        );
        RAISE EXCEPTION 'Test L FAILED: equal start_at/end_at was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test L FAILED: expected check_violation for end_at = start_at';
    END IF;


    -- =========================================================================
    -- M. Exception < 15 minutes → rejected by CHECK
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        INSERT INTO catms.doctor_availability_exception (
            doctor_id, branch_id, exception_type, start_at, end_at
        )
        VALUES (
            v_emp_id, v_branch_id,
            'Unavailable',
            now() + INTERVAL '6 days',
            now() + INTERVAL '6 days' + INTERVAL '10 minutes'
        );
        RAISE EXCEPTION 'Test M FAILED: 10-minute exception was accepted';
    EXCEPTION
        WHEN check_violation THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test M FAILED: expected check_violation for exception < 15 minutes';
    END IF;


    -- =========================================================================
    -- N. UPDATE on exception row → rejected (immutability trigger)
    -- =========================================================================

    v_ok := FALSE;
    BEGIN
        UPDATE catms.doctor_availability_exception
        SET reason = 'tampered'
        WHERE exception_id = v_exc_id;
        RAISE EXCEPTION 'Test N FAILED: UPDATE on exception was not blocked';
    EXCEPTION
        WHEN raise_exception THEN v_ok := TRUE;
    END;
    IF NOT v_ok THEN
        RAISE EXCEPTION 'Test N FAILED: expected raise_exception from immutability trigger';
    END IF;


    -- =========================================================================
    -- O. DELETE on availability row succeeds (availability is mutable)
    -- =========================================================================

    DELETE FROM catms.doctor_availability WHERE availability_id = v_avail_id;
    -- If we reach here without error, test O passed.


    RAISE NOTICE 'CATMS-027 availability rules — all % tests passed OK', 15;

END;
$$;

-- Discard all test fixture data
ROLLBACK;
