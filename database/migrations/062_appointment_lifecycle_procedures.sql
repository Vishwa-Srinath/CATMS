BEGIN;

-- =============================================================================
-- 1. Audit History Tables (CATMS-030)
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.appointment_schedule_history (
    history_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id         BIGINT NOT NULL,
    old_start_at           TIMESTAMPTZ NOT NULL,
    old_end_at             TIMESTAMPTZ NOT NULL,
    new_start_at           TIMESTAMPTZ NOT NULL,
    new_end_at             TIMESTAMPTZ NOT NULL,
    reason                 TEXT NOT NULL,
    changed_by_employee_id BIGINT NOT NULL,
    changed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_app_sch_hist_app FOREIGN KEY (appointment_id) REFERENCES catms.appointment(appointment_id) ON DELETE CASCADE,
    CONSTRAINT fk_app_sch_hist_emp FOREIGN KEY (changed_by_employee_id) REFERENCES catms.employee(employee_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS catms.appointment_status_log (
    log_id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_id         BIGINT NOT NULL,
    old_status             catms.appointment_status NOT NULL,
    new_status             catms.appointment_status NOT NULL,
    reason                 TEXT,
    changed_by_employee_id BIGINT NOT NULL,
    changed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_app_stat_log_app FOREIGN KEY (appointment_id) REFERENCES catms.appointment(appointment_id) ON DELETE CASCADE,
    CONSTRAINT fk_app_stat_log_emp FOREIGN KEY (changed_by_employee_id) REFERENCES catms.employee(employee_id) ON DELETE RESTRICT
);

-- =============================================================================
-- 2. Procedure: catms.reschedule_appointment
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.reschedule_appointment(
    p_appointment_id         BIGINT,
    p_new_start_at           TIMESTAMPTZ,
    p_new_end_at             TIMESTAMPTZ,
    p_reason                 TEXT,
    p_changed_by_employee_id BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_start_at TIMESTAMPTZ;
    v_old_end_at TIMESTAMPTZ;
    v_status catms.appointment_status;
    v_doctor_id BIGINT;
    v_branch_id BIGINT;
    
    v_start_time TIME;
    v_end_time TIME;
    v_day_of_week catms.day_of_week;
    v_date DATE;
    v_is_available BOOLEAN := FALSE;
    v_is_unavailable BOOLEAN := FALSE;
BEGIN
    -- 1. Get current appointment
    SELECT start_at, end_at, status, doctor_id, branch_id 
    INTO v_old_start_at, v_old_end_at, v_status, v_doctor_id, v_branch_id
    FROM catms.appointment
    WHERE appointment_id = p_appointment_id
    FOR UPDATE; -- lock row to prevent concurrent updates

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id USING ERRCODE = 'A0001';
    END IF;

    -- 2. Terminal state guard
    IF v_status IN ('Completed', 'Cancelled') THEN
        RAISE EXCEPTION 'Cannot reschedule appointment % because it is %', p_appointment_id, v_status USING ERRCODE = 'A0002';
    END IF;

    -- 3. Validate new time availability (same logic as booking)
    v_start_time := p_new_start_at::TIME;
    v_end_time := p_new_end_at::TIME;
    v_date := p_new_start_at::DATE;
    v_day_of_week := trim(to_char(p_new_start_at, 'Dy'))::catms.day_of_week;

    -- Check for Unavailable
    SELECT EXISTS (
        SELECT 1 FROM catms.doctor_availability_exception
        WHERE doctor_id = v_doctor_id
          AND branch_id = v_branch_id
          AND exception_type = 'Unavailable'
          AND exception_date = v_date
          AND start_at < p_new_end_at
          AND end_at > p_new_start_at
    ) INTO v_is_unavailable;

    IF v_is_unavailable THEN
        RAISE EXCEPTION 'Doctor % is unavailable at this new time', v_doctor_id USING ERRCODE = 'DA001';
    END IF;

    -- Check for ExtraHours
    SELECT EXISTS (
        SELECT 1 FROM catms.doctor_availability_exception
        WHERE doctor_id = v_doctor_id
          AND branch_id = v_branch_id
          AND exception_type = 'ExtraHours'
          AND exception_date = v_date
          AND start_at <= p_new_start_at
          AND end_at >= p_new_end_at
    ) INTO v_is_available;

    IF NOT v_is_available THEN
        SELECT EXISTS (
            SELECT 1 FROM catms.doctor_availability
            WHERE doctor_id = v_doctor_id
              AND branch_id = v_branch_id
              AND day_of_week = v_day_of_week
              AND start_time <= v_start_time
              AND end_time >= v_end_time
        ) INTO v_is_available;
    END IF;

    IF NOT v_is_available THEN
        RAISE EXCEPTION 'New time slot is outside of doctor % availability', v_doctor_id USING ERRCODE = 'DA002';
    END IF;

    -- 4. Apply changes
    UPDATE catms.appointment
    SET start_at = p_new_start_at,
        end_at = p_new_end_at
    WHERE appointment_id = p_appointment_id;

    -- 5. Record history
    INSERT INTO catms.appointment_schedule_history (
        appointment_id, old_start_at, old_end_at, new_start_at, new_end_at, reason, changed_by_employee_id
    ) VALUES (
        p_appointment_id, v_old_start_at, v_old_end_at, p_new_start_at, p_new_end_at, p_reason, p_changed_by_employee_id
    );

END;
$$;

-- =============================================================================
-- 3. Procedure: catms.update_appointment_status
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.update_appointment_status(
    p_appointment_id         BIGINT,
    p_new_status             catms.appointment_status,
    p_reason                 TEXT,
    p_changed_by_employee_id BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_old_status catms.appointment_status;
BEGIN
    SELECT status INTO v_old_status
    FROM catms.appointment
    WHERE appointment_id = p_appointment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment % not found', p_appointment_id USING ERRCODE = 'A0001';
    END IF;

    -- Terminal state guard
    IF v_old_status IN ('Completed', 'Cancelled') THEN
        RAISE EXCEPTION 'Cannot change status of appointment %. It is already in terminal state %.', p_appointment_id, v_old_status USING ERRCODE = 'A0003';
    END IF;

    -- Valid transitions from Scheduled
    IF v_old_status = 'Scheduled' AND p_new_status NOT IN ('Completed', 'Cancelled') THEN
         RAISE EXCEPTION 'Invalid status transition from Scheduled to %', p_new_status USING ERRCODE = 'A0004';
    END IF;

    UPDATE catms.appointment
    SET status = p_new_status
    WHERE appointment_id = p_appointment_id;

    INSERT INTO catms.appointment_status_log (
        appointment_id, old_status, new_status, reason, changed_by_employee_id
    ) VALUES (
        p_appointment_id, v_old_status, p_new_status, p_reason, p_changed_by_employee_id
    );

END;
$$;

-- =============================================================================
-- 4. Procedure: catms.cancel_appointment
-- =============================================================================

CREATE OR REPLACE PROCEDURE catms.cancel_appointment(
    p_appointment_id         BIGINT,
    p_reason                 TEXT,
    p_changed_by_employee_id BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Just a convenient wrapper around update_appointment_status
    CALL catms.update_appointment_status(p_appointment_id, 'Cancelled', p_reason, p_changed_by_employee_id);
END;
$$;

-- Permissions
GRANT SELECT ON catms.appointment_schedule_history TO catms_readonly;
GRANT SELECT ON catms.appointment_status_log TO catms_readonly;
GRANT INSERT, UPDATE ON catms.appointment_schedule_history TO catms_app;
GRANT INSERT, UPDATE ON catms.appointment_status_log TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.reschedule_appointment TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.update_appointment_status TO catms_app;
GRANT EXECUTE ON PROCEDURE catms.cancel_appointment TO catms_app;

-- Record Migration
INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (62, 'appointment lifecycle procedures', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
