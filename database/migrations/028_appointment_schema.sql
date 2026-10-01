BEGIN;

-- =============================================================================
-- 1. Enums
-- =============================================================================

CREATE TYPE catms.appointment_status AS ENUM (
    'Scheduled',
    'Completed',
    'Cancelled'
);

CREATE TYPE catms.booking_type AS ENUM (
    'Booked',
    'WalkIn'
);

-- =============================================================================
-- 2. Table: appointment
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.appointment (
    appointment_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    appointment_number CITEXT NOT NULL,
    patient_id         BIGINT NOT NULL,
    doctor_id          BIGINT NOT NULL,
    branch_id          BIGINT NOT NULL,
    specialty_id       BIGINT NOT NULL,
    
    start_at           TIMESTAMPTZ NOT NULL,
    end_at             TIMESTAMPTZ NOT NULL,
    
    status             catms.appointment_status NOT NULL DEFAULT 'Scheduled',
    booking_type       catms.booking_type NOT NULL DEFAULT 'Booked',
    notes              TEXT,
    
    created_by         BIGINT NOT NULL, -- Which employee/user created this
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT uq_appointment_number UNIQUE (appointment_number),
    CONSTRAINT fk_appointment_patient FOREIGN KEY (patient_id) REFERENCES catms.patient(patient_id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_doctor FOREIGN KEY (doctor_id) REFERENCES catms.doctor_profile(doctor_id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_branch FOREIGN KEY (branch_id) REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_specialty FOREIGN KEY (specialty_id) REFERENCES catms.specialty(specialty_id) ON DELETE RESTRICT,
    CONSTRAINT fk_appointment_created_by FOREIGN KEY (created_by) REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,
    
    -- 15-minute grid alignment
    CONSTRAINT chk_appointment_start_minute_15 CHECK (EXTRACT(MINUTE FROM start_at)::INTEGER % 15 = 0),
    CONSTRAINT chk_appointment_start_second_0 CHECK (EXTRACT(SECOND FROM start_at)::INTEGER = 0),
    CONSTRAINT chk_appointment_end_minute_15 CHECK (EXTRACT(MINUTE FROM end_at)::INTEGER % 15 = 0),
    CONSTRAINT chk_appointment_end_second_0 CHECK (EXTRACT(SECOND FROM end_at)::INTEGER = 0),
    
    -- Duration logic
    CONSTRAINT chk_appointment_duration CHECK (end_at > start_at)
);

-- =============================================================================
-- 3. GiST Exclusion Constraint (No Double Booking)
-- =============================================================================

-- We only exclude active appointments (Scheduled, Completed). Cancelled appointments can overlap.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ex_appointment_doctor_time_no_overlap'
          AND conrelid = 'catms.appointment'::regclass
    ) THEN
        ALTER TABLE catms.appointment
        ADD CONSTRAINT ex_appointment_doctor_time_no_overlap
        EXCLUDE USING gist (
            doctor_id WITH =,
            tstzrange(start_at, end_at, '[)') WITH &&
        )
        WHERE (status != 'Cancelled');
    END IF;
END;
$$;

-- Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_appointment_patient ON catms.appointment(patient_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointment_doctor_start ON catms.appointment(doctor_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointment_branch_start ON catms.appointment(branch_id, start_at);

-- =============================================================================
-- 4. Triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION catms.trg_touch_appointment_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_appointment_updated_at ON catms.appointment;
CREATE TRIGGER trg_touch_appointment_updated_at
    BEFORE UPDATE ON catms.appointment
    FOR EACH ROW
    EXECUTE FUNCTION catms.trg_touch_appointment_updated_at();

-- =============================================================================
-- 5. Comments & Grants
-- =============================================================================

COMMENT ON TABLE catms.appointment IS 'Core scheduling table. Enforces no-overlap via GiST and 15-min grids via CHECK.';

GRANT SELECT, INSERT, UPDATE ON catms.appointment TO catms_app;
GRANT SELECT ON catms.appointment TO catms_readonly;

-- Record Migration
INSERT INTO catms.schema_migrations (version, description, applied_by, checksum_sha256, execution_ms)
VALUES (28, 'appointment schema', current_user, 'pending', 0)
ON CONFLICT (version) DO NOTHING;

COMMIT;
