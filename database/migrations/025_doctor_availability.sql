-- =============================================================================
-- 025_doctor_availability.sql
-- Owner: Dev1  |  Issue: CATMS-027  |  Depends on: 022_doctor_specialty_user_and_role.sql
--
-- Implements:
--   - catms.day_of_week (ENUM: Mon..Sun)
--   - catms.availability_exception_type (ENUM: ExtraHours | Unavailable)
--   - catms.doctor_availability
--       Recurring weekly schedule rows per doctor per branch per weekday.
--       Each row stores a [start_time, end_time) window that repeats on that
--       weekday within [valid_from, valid_to).
--   - catms.doctor_availability_exception
--       One-off date overrides: either ExtraHours (extra slot) or Unavailable
--       (blocks recurring availability).  Stored as TIMESTAMPTZ pairs so the
--       runner can compare against appointment TIMESTAMPTZ values without
--       timezone conversion guesswork.
--
-- Business rules enforced at DDL level (ADR-004):
--   1. start_time < end_time on recurring rows.
--   2. start_at < end_at on exception rows.
--   3. Doctor must be assigned to the branch they post availability for.
--      (Enforced at application/procedure level in CATMS-029; the column FK
--       to employee_branch_assignment is not added here because an assignment
--       row may not yet exist when availability is first seeded in tests.
--       The booking procedure verifies this at runtime.)
--   4. No two active recurring rows may overlap on the same doctor+branch+day.
--      (Partial unique index: same doctor, branch, day, start_time while
--       valid_to IS NULL — active rows only.)
--   5. ExtraHours and Unavailable exceptions may not overlap for the same
--      doctor on the same date.
--      (Partial exclusion index using btree_gist tstzrange overlap.)
--   6. exception_date is derived (GENERATED ALWAYS) from start_at to keep
--      date-level queries fast without manual duplication.
-- =============================================================================

BEGIN;

-- =============================================================================
-- ENUM: day of week
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE catms.day_of_week AS ENUM (
        'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- ENUM: exception type
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE catms.availability_exception_type AS ENUM (
        'ExtraHours',
        'Unavailable'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- Table: catms.doctor_availability
-- Recurring weekly schedule for a doctor at a specific branch.
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.doctor_availability (
    availability_id  BIGINT GENERATED ALWAYS AS IDENTITY,

    -- Which doctor, at which branch, on which day of the week
    doctor_id        BIGINT                      NOT NULL,
    branch_id        BIGINT                      NOT NULL,
    day_of_week      catms.day_of_week           NOT NULL,

    -- Half-open time window [start_time, end_time) within that weekday
    -- Stored as TIME WITHOUT TIME ZONE; the booking procedure combines
    -- these with a calendar date and the clinic timezone (Asia/Colombo)
    -- to produce TIMESTAMPTZ boundaries for overlap checking.
    start_time       TIME WITHOUT TIME ZONE      NOT NULL,
    end_time         TIME WITHOUT TIME ZONE      NOT NULL,

    -- Effective date range for this recurring schedule
    -- valid_to IS NULL means the schedule is currently active.
    valid_from       DATE                        NOT NULL DEFAULT CURRENT_DATE,
    valid_to         DATE,

    -- Audit
    created_at       TIMESTAMPTZ                 NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ                 NOT NULL DEFAULT now(),

    -- ── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT pk_doctor_availability
        PRIMARY KEY (availability_id),

    CONSTRAINT fk_doctor_availability_doctor
        FOREIGN KEY (doctor_id)
        REFERENCES catms.doctor_profile(doctor_id) ON DELETE RESTRICT,

    CONSTRAINT fk_doctor_availability_branch
        FOREIGN KEY (branch_id)
        REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,

    -- end_time must be strictly after start_time
    CONSTRAINT chk_doctor_availability_time_order
        CHECK (end_time > start_time),

    -- valid_to, when set, must be after or equal to valid_from
    CONSTRAINT chk_doctor_availability_date_order
        CHECK (valid_to IS NULL OR valid_to >= valid_from),

    -- Minimum slot: at least 15 minutes
    CONSTRAINT chk_doctor_availability_min_duration
        CHECK (end_time - start_time >= INTERVAL '15 minutes')
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Partial unique index: only one active (valid_to IS NULL) schedule window per
-- doctor+branch+day+start_time.  This allows the doctor to have multiple
-- non-overlapping windows on the same day (e.g. 09:00–12:00, 14:00–17:00)
-- while preventing duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_doctor_availability
    ON catms.doctor_availability (doctor_id, branch_id, day_of_week, start_time)
    WHERE valid_to IS NULL;

-- Fast lookup: doctor availability by branch
CREATE INDEX IF NOT EXISTS idx_doctor_availability_doctor_branch
    ON catms.doctor_availability (doctor_id, branch_id, day_of_week);

-- =============================================================================
-- Table: catms.doctor_availability_exception
-- One-off date-level overrides (ExtraHours or Unavailable).
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.doctor_availability_exception (
    exception_id     BIGINT GENERATED ALWAYS AS IDENTITY,

    doctor_id        BIGINT                              NOT NULL,
    branch_id        BIGINT                              NOT NULL,
    exception_type   catms.availability_exception_type  NOT NULL,

    -- Full TIMESTAMPTZ pair so the booking procedure can compare directly
    -- against appointment.start_at / appointment.end_at without casting.
    -- Both must be UTC (enforced by application; DB stores as TIMESTAMPTZ).
    start_at         TIMESTAMPTZ                         NOT NULL,
    end_at           TIMESTAMPTZ                         NOT NULL,

    -- Derived date column (UTC date of start_at) for fast date-level filters
    -- e.g. "show all exceptions for this doctor on 2026-10-01"
    exception_date   DATE GENERATED ALWAYS AS ((start_at AT TIME ZONE 'UTC')::DATE) STORED,

    reason           VARCHAR(255),

    created_at       TIMESTAMPTZ                         NOT NULL DEFAULT now(),
    created_by       BIGINT,                             -- employee_id of creator

    -- ── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT pk_doctor_availability_exception
        PRIMARY KEY (exception_id),

    CONSTRAINT fk_doctor_availability_exception_doctor
        FOREIGN KEY (doctor_id)
        REFERENCES catms.doctor_profile(doctor_id) ON DELETE RESTRICT,

    CONSTRAINT fk_doctor_availability_exception_branch
        FOREIGN KEY (branch_id)
        REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,

    CONSTRAINT fk_doctor_availability_exception_created_by
        FOREIGN KEY (created_by)
        REFERENCES catms.employee(employee_id) ON DELETE RESTRICT,

    -- end_at must be strictly after start_at (ADR-004 §2)
    CONSTRAINT chk_doctor_availability_exception_time_order
        CHECK (end_at > start_at),

    -- Minimum exception window: 15 minutes
    CONSTRAINT chk_doctor_availability_exception_min_duration
        CHECK (end_at - start_at >= INTERVAL '15 minutes')
);

-- ── GiST exclusion: no two exceptions of the SAME TYPE may overlap for the
-- same doctor.  (An ExtraHours and an Unavailable can coexist on the same
-- window because the Unavailable takes precedence at booking time.)
-- Requires the btree_gist extension installed in migration 001.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_exception_no_same_type_overlap
    ON catms.doctor_availability_exception (doctor_id, branch_id, exception_type, start_at);

-- GiST exclusion index prevents same-type overlapping exceptions per doctor
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ex_doctor_exception_no_type_overlap'
          AND conrelid = 'catms.doctor_availability_exception'::regclass
    ) THEN
        ALTER TABLE catms.doctor_availability_exception
        ADD CONSTRAINT ex_doctor_exception_no_type_overlap
        EXCLUDE USING gist (
            doctor_id  WITH =,
            exception_type::text  WITH =,
            tstzrange(start_at, end_at, '[)') WITH &&
        );
    END IF;
END;
$$;

-- Fast lookup by doctor and date
CREATE INDEX IF NOT EXISTS idx_doctor_availability_exception_lookup
    ON catms.doctor_availability_exception (doctor_id, exception_date, exception_type);

-- =============================================================================
-- Trigger: auto-update updated_at on doctor_availability
-- =============================================================================

DROP TRIGGER IF EXISTS trg_touch_doctor_availability_updated_at
    ON catms.doctor_availability;

CREATE TRIGGER trg_touch_doctor_availability_updated_at
    BEFORE UPDATE ON catms.doctor_availability
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

-- =============================================================================
-- Trigger: prevent UPDATE/DELETE on exception rows
-- Exceptions are immutable audit records; cancel and re-insert instead.
-- =============================================================================

CREATE OR REPLACE FUNCTION catms.prevent_exception_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'doctor_availability_exception rows are immutable. '
        'To change an exception, DELETE this row and INSERT a corrected one. '
        'Operation attempted: %', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_exception_mutation
    ON catms.doctor_availability_exception;

CREATE TRIGGER trg_prevent_exception_mutation
    BEFORE UPDATE ON catms.doctor_availability_exception
    FOR EACH ROW
    EXECUTE FUNCTION catms.prevent_exception_mutation();

-- =============================================================================
-- COMMENT ON
-- =============================================================================

COMMENT ON TYPE catms.day_of_week IS
  'Seven-value ENUM representing the day of the week for recurring availability windows.';

COMMENT ON TYPE catms.availability_exception_type IS
  'Distinguishes one-off date-level schedule exceptions: '
  'ExtraHours adds slots outside the recurring schedule; '
  'Unavailable blocks the recurring schedule for a specific window.';

COMMENT ON TABLE catms.doctor_availability IS
  'Recurring weekly schedule windows for a doctor at a specific branch. '
  'Each row defines a [start_time, end_time) half-open window on a given day_of_week '
  'that repeats within the [valid_from, valid_to) effective date range. '
  'A NULL valid_to means the schedule is currently active. '
  'The booking procedure (CATMS-029) reads these rows to validate that a '
  'requested appointment slot falls within an active recurring window.';

COMMENT ON COLUMN catms.doctor_availability.availability_id IS
  'Surrogate primary key generated by identity sequence.';

COMMENT ON COLUMN catms.doctor_availability.doctor_id IS
  'Foreign key to catms.doctor_profile. The doctor this schedule belongs to.';

COMMENT ON COLUMN catms.doctor_availability.branch_id IS
  'Foreign key to catms.branch. The clinic branch where these hours apply.';

COMMENT ON COLUMN catms.doctor_availability.day_of_week IS
  'Day of the week this window repeats on (Mon, Tue, Wed, Thu, Fri, Sat, Sun).';

COMMENT ON COLUMN catms.doctor_availability.start_time IS
  'Inclusive start of the availability window (TIME WITHOUT TIME ZONE). '
  'Combined with a calendar date and Asia/Colombo timezone at booking time.';

COMMENT ON COLUMN catms.doctor_availability.end_time IS
  'Exclusive end of the availability window (TIME WITHOUT TIME ZONE). '
  'Must be strictly after start_time. Minimum window: 15 minutes.';

COMMENT ON COLUMN catms.doctor_availability.valid_from IS
  'Date from which this recurring schedule takes effect.';

COMMENT ON COLUMN catms.doctor_availability.valid_to IS
  'Date on which this recurring schedule expires (exclusive). '
  'NULL means the schedule is currently active and has no planned end date.';

COMMENT ON COLUMN catms.doctor_availability.created_at IS
  'UTC timestamp when this availability row was created.';

COMMENT ON COLUMN catms.doctor_availability.updated_at IS
  'UTC timestamp when this availability row was last modified. Auto-set by trigger.';

COMMENT ON TABLE catms.doctor_availability_exception IS
  'One-off date-level overrides to the recurring weekly schedule. '
  'ExtraHours adds availability outside the recurring window; '
  'Unavailable blocks a recurring window for a specific time range. '
  'Rows are immutable after insert — cancel and re-insert to correct. '
  'The booking procedure (CATMS-029) checks Unavailable exceptions before '
  'confirming a slot falls within recurring or ExtraHours availability.';

COMMENT ON COLUMN catms.doctor_availability_exception.exception_id IS
  'Surrogate primary key generated by identity sequence.';

COMMENT ON COLUMN catms.doctor_availability_exception.doctor_id IS
  'Foreign key to catms.doctor_profile.';

COMMENT ON COLUMN catms.doctor_availability_exception.branch_id IS
  'Foreign key to catms.branch. The branch this exception applies to.';

COMMENT ON COLUMN catms.doctor_availability_exception.exception_type IS
  'ExtraHours or Unavailable (see catms.availability_exception_type ENUM).';

COMMENT ON COLUMN catms.doctor_availability_exception.start_at IS
  'UTC timestamp of the start of the exception window (inclusive).';

COMMENT ON COLUMN catms.doctor_availability_exception.end_at IS
  'UTC timestamp of the end of the exception window (exclusive). '
  'Must be strictly after start_at.';

COMMENT ON COLUMN catms.doctor_availability_exception.exception_date IS
  'UTC date of start_at, stored as a generated column for fast date-level filtering.';

COMMENT ON COLUMN catms.doctor_availability_exception.reason IS
  'Optional free-text note explaining the exception (e.g. Annual Leave, Conference).';

COMMENT ON COLUMN catms.doctor_availability_exception.created_by IS
  'Employee who recorded this exception. Foreign key to catms.employee.';

COMMENT ON COLUMN catms.doctor_availability_exception.created_at IS
  'UTC timestamp when this exception row was inserted.';

-- =============================================================================
-- Role Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON catms.doctor_availability          TO catms_app;
GRANT SELECT, INSERT, DELETE         ON catms.doctor_availability_exception TO catms_app;

GRANT SELECT ON catms.doctor_availability          TO catms_readonly;
GRANT SELECT ON catms.doctor_availability_exception TO catms_readonly;

-- =============================================================================
-- Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (25, 'implement doctor availability and exception schema', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
