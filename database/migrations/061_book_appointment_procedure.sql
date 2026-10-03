BEGIN;

-- =============================================================================
-- Procedure: catms.book_appointment
-- Description: Books an appointment with transactional validation for active
--              entities and doctor availability. 
-- Issue: CATMS-029
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.book_appointment(
    p_patient_id     BIGINT,
    p_doctor_id      BIGINT,
    p_branch_id      BIGINT,
    p_specialty_id   BIGINT,
    p_start_at       TIMESTAMPTZ,
    p_end_at         TIMESTAMPTZ,
    p_booking_type   catms.booking_type,
    p_created_by     BIGINT,
    p_notes          TEXT,
    OUT p_appointment_id BIGINT,
    OUT p_appointment_number CITEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_patient_active BOOLEAN;
    v_doctor_active BOOLEAN;
    v_branch_active BOOLEAN;
    v_specialty_active BOOLEAN;
    v_has_specialty BOOLEAN;
    
    v_start_time TIME;
    v_end_time TIME;
    v_day_of_week catms.day_of_week;
    v_date DATE;
    
    v_is_available BOOLEAN := FALSE;
    v_is_unavailable BOOLEAN := FALSE;
BEGIN
    -- 1. Validate Patient
    SELECT is_active INTO v_patient_active FROM catms.patient WHERE patient_id = p_patient_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patient % not found', p_patient_id USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_patient_active THEN
        RAISE EXCEPTION 'Patient % is inactive', p_patient_id USING ERRCODE = 'P0002';
    END IF;

    -- 2. Validate Doctor
    SELECT e.is_active INTO v_doctor_active 
    FROM catms.doctor_profile dp
    JOIN catms.employee e ON dp.doctor_id = e.employee_id
    WHERE dp.doctor_id = p_doctor_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Doctor % not found', p_doctor_id USING ERRCODE = 'D0001';
    END IF;
    IF NOT v_doctor_active THEN
        RAISE EXCEPTION 'Doctor % is inactive', p_doctor_id USING ERRCODE = 'D0002';
    END IF;

    -- 3. Validate Branch
    SELECT is_active INTO v_branch_active FROM catms.branch WHERE branch_id = p_branch_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Branch % not found', p_branch_id USING ERRCODE = 'B0001';
    END IF;
    IF NOT v_branch_active THEN
        RAISE EXCEPTION 'Branch % is inactive', p_branch_id USING ERRCODE = 'B0002';
    END IF;

    -- 4. Validate Specialty
    SELECT is_active INTO v_specialty_active FROM catms.specialty WHERE specialty_id = p_specialty_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Specialty % not found', p_specialty_id USING ERRCODE = 'S0001';
    END IF;
    IF NOT v_specialty_active THEN
        RAISE EXCEPTION 'Specialty % is inactive', p_specialty_id USING ERRCODE = 'S0002';
    END IF;

    -- 5. Validate Doctor has Specialty
    SELECT EXISTS (
        SELECT 1 FROM catms.doctor_specialty 
        WHERE doctor_id = p_doctor_id AND specialty_id = p_specialty_id
    ) INTO v_has_specialty;
    IF NOT v_has_specialty THEN
        RAISE EXCEPTION 'Doctor % does not have specialty %', p_doctor_id, p_specialty_id USING ERRCODE = 'DS001';
    END IF;

    -- 6. Validate Availability (CATMS-027 rules)
    v_start_time := p_start_at::TIME;
    v_end_time := p_end_at::TIME;
    v_date := p_start_at::DATE;
    v_day_of_week := trim(to_char(p_start_at, 'Dy'))::catms.day_of_week; -- e.g., 'Mon'

    -- Check for Unavailable exception first (overrides everything)
    SELECT EXISTS (
        SELECT 1 FROM catms.doctor_availability_exception
        WHERE doctor_id = p_doctor_id
          AND branch_id = p_branch_id
          AND exception_type = 'Unavailable'
          AND exception_date = v_date
          AND start_at < p_end_at
          AND end_at > p_start_at
    ) INTO v_is_unavailable;

    IF v_is_unavailable THEN
        RAISE EXCEPTION 'Doctor % is unavailable at this time', p_doctor_id USING ERRCODE = 'DA001';
    END IF;

    -- Check if there is an ExtraHours exception covering the requested slot
    SELECT EXISTS (
        SELECT 1 FROM catms.doctor_availability_exception
        WHERE doctor_id = p_doctor_id
          AND branch_id = p_branch_id
          AND exception_type = 'ExtraHours'
          AND exception_date = v_date
          AND start_at <= p_start_at
          AND end_at >= p_end_at
    ) INTO v_is_available;

    -- If not covered by ExtraHours, check regular recurring availability
    IF NOT v_is_available THEN
        SELECT EXISTS (
            SELECT 1 FROM catms.doctor_availability
            WHERE doctor_id = p_doctor_id
              AND branch_id = p_branch_id
              AND day_of_week = v_day_of_week
              AND start_time <= v_start_time
              AND end_time >= v_end_time
        ) INTO v_is_available;
    END IF;

    IF NOT v_is_available THEN
        RAISE EXCEPTION 'Time slot is outside of doctor % scheduled availability', p_doctor_id USING ERRCODE = 'DA002';
    END IF;

    -- 7. Insert Appointment
    -- Double-booking overlap is natively prevented by the GiST exclusion constraint on the table.
    -- We insert with a temporary placeholder number, retrieve the generated ID,
    -- then immediately update to the final formatted number in the same transaction.
    INSERT INTO catms.appointment (
        appointment_number,
        patient_id,
        doctor_id,
        branch_id,
        specialty_id,
        start_at,
        end_at,
        booking_type,
        notes,
        created_by
    ) VALUES (
        'APT-TMP',  -- temporary; updated immediately below
        p_patient_id,
        p_doctor_id,
        p_branch_id,
        p_specialty_id,
        p_start_at,
        p_end_at,
        p_booking_type,
        p_notes,
        p_created_by
    )
    RETURNING appointment_id INTO p_appointment_id;

    -- Build final, permanent appointment number from the real generated ID
    p_appointment_number := 'APT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(p_appointment_id::text, 4, '0');

    UPDATE catms.appointment
    SET appointment_number = p_appointment_number
    WHERE appointment_id = p_appointment_id;

END;
$$;

GRANT EXECUTE ON PROCEDURE catms.book_appointment TO catms_app;

-- Record Migration
INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (61, 'book appointment procedure', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
