-- 021_staff_and_manager_assignments.sql
-- Owner: Dev2  |  Issue: CATMS-016  |  Depends on: 020_branch_and_employee.sql
--
-- Implements staff branch assignment history (catms.employee_branch_assignment)
-- and branch manager assignment history (catms.branch_manager_assignment).
--
-- Key requirements:
--   - Temporal validity ranges (valid_from, valid_to) with CHECK (valid_to >= valid_from)
--   - Partial unique index: at most one active PRIMARY branch assignment per employee
--   - Partial unique index: at most one active manager per branch
--   - Historical transfers and appointments remain queryable indefinitely
--   - Foreign keys to catms.employee and catms.branch configure ON DELETE RESTRICT
--   - Privileges granted to catms_app and catms_readonly roles
--   - Full COMMENT ON documentation on tables and columns

BEGIN;

-- =============================================================================
-- Table: catms.employee_branch_assignment
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.employee_branch_assignment (
    employee_branch_assignment_id BIGINT GENERATED ALWAYS AS IDENTITY,
    employee_id                   BIGINT                   NOT NULL,
    branch_id                     BIGINT                   NOT NULL,
    assignment_type               VARCHAR(20)              NOT NULL DEFAULT 'PRIMARY',
    valid_from                    DATE                     NOT NULL DEFAULT CURRENT_DATE,
    valid_to                      DATE,
    is_active                     BOOLEAN                  NOT NULL DEFAULT TRUE,
    assigned_by_user_id           BIGINT,
    created_at                    TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_employee_branch_assignment PRIMARY KEY (employee_branch_assignment_id),
    CONSTRAINT fk_employee_branch_assignment_employee FOREIGN KEY (employee_id)
        REFERENCES catms.employee(employee_id) ON DELETE RESTRICT,
    CONSTRAINT fk_employee_branch_assignment_branch FOREIGN KEY (branch_id)
        REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,
    CONSTRAINT chk_employee_branch_assignment_type CHECK (upper(assignment_type) IN ('PRIMARY', 'TEMPORARY', 'SECONDARY')),
    CONSTRAINT chk_employee_branch_assignment_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Partial unique index: At most one active PRIMARY branch assignment per employee
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_primary_employee_assignment
    ON catms.employee_branch_assignment (employee_id)
    WHERE (is_active = TRUE AND upper(assignment_type) = 'PRIMARY');

-- Query support index for employee assignments by branch and status
CREATE INDEX IF NOT EXISTS idx_employee_branch_assignment_lookup
    ON catms.employee_branch_assignment (employee_id, branch_id, is_active);

-- =============================================================================
-- Table: catms.branch_manager_assignment
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.branch_manager_assignment (
    branch_manager_assignment_id BIGINT GENERATED ALWAYS AS IDENTITY,
    branch_id                    BIGINT                   NOT NULL,
    employee_id                  BIGINT                   NOT NULL,
    valid_from                   DATE                     NOT NULL DEFAULT CURRENT_DATE,
    valid_to                     DATE,
    is_active                    BOOLEAN                  NOT NULL DEFAULT TRUE,
    reason                       VARCHAR(200),
    assigned_by_user_id          BIGINT,
    created_at                   TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_branch_manager_assignment PRIMARY KEY (branch_manager_assignment_id),
    CONSTRAINT fk_branch_manager_assignment_branch FOREIGN KEY (branch_id)
        REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,
    CONSTRAINT fk_branch_manager_assignment_employee FOREIGN KEY (employee_id)
        REFERENCES catms.employee(employee_id) ON DELETE RESTRICT,
    CONSTRAINT chk_branch_manager_assignment_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- Partial unique index: At most one active manager per branch
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_branch_manager
    ON catms.branch_manager_assignment (branch_id)
    WHERE (is_active = TRUE);

-- Query support index for branch manager lookup
CREATE INDEX IF NOT EXISTS idx_branch_manager_assignment_lookup
    ON catms.branch_manager_assignment (branch_id, employee_id, is_active);

-- =============================================================================
-- Triggers for Type Normalization and Timestamp Maintenance
-- =============================================================================

CREATE OR REPLACE FUNCTION catms.sync_assignment_normalization()
RETURNS TRIGGER AS $$
BEGIN
    NEW.assignment_type := upper(trim(NEW.assignment_type));

    -- If valid_to is in the past, de-activate the record
    IF NEW.valid_to IS NOT NULL AND NEW.valid_to < CURRENT_DATE THEN
        NEW.is_active := FALSE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_assignment_normalization ON catms.employee_branch_assignment;
CREATE TRIGGER trg_sync_assignment_normalization
    BEFORE INSERT OR UPDATE ON catms.employee_branch_assignment
    FOR EACH ROW
    EXECUTE FUNCTION catms.sync_assignment_normalization();

CREATE OR REPLACE FUNCTION catms.sync_manager_assignment_normalization()
RETURNS TRIGGER AS $$
BEGIN
    -- If valid_to is in the past, de-activate the record
    IF NEW.valid_to IS NOT NULL AND NEW.valid_to < CURRENT_DATE THEN
        NEW.is_active := FALSE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_manager_assignment_normalization ON catms.branch_manager_assignment;
CREATE TRIGGER trg_sync_manager_assignment_normalization
    BEFORE INSERT OR UPDATE ON catms.branch_manager_assignment
    FOR EACH ROW
    EXECUTE FUNCTION catms.sync_manager_assignment_normalization();

DROP TRIGGER IF EXISTS trg_touch_employee_branch_assignment_updated_at ON catms.employee_branch_assignment;
CREATE TRIGGER trg_touch_employee_branch_assignment_updated_at
    BEFORE UPDATE ON catms.employee_branch_assignment
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_branch_manager_assignment_updated_at ON catms.branch_manager_assignment;
CREATE TRIGGER trg_touch_branch_manager_assignment_updated_at
    BEFORE UPDATE ON catms.branch_manager_assignment
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

-- =============================================================================
-- COMMENT ON Statements
-- =============================================================================

-- Table: catms.employee_branch_assignment
COMMENT ON TABLE catms.employee_branch_assignment IS
  'Historical and active assignments of clinic staff to physical branches. '
  'Enforces at most one active PRIMARY branch assignment per employee via partial unique index. '
  'Transfers update valid_to and is_active; historical rows remain queryable.';

COMMENT ON COLUMN catms.employee_branch_assignment.employee_branch_assignment_id IS
  'Surrogate primary key generated by identity sequence.';

COMMENT ON COLUMN catms.employee_branch_assignment.employee_id IS
  'Foreign key to catms.employee. Uses ON DELETE RESTRICT.';

COMMENT ON COLUMN catms.employee_branch_assignment.branch_id IS
  'Foreign key to catms.branch. Uses ON DELETE RESTRICT.';

COMMENT ON COLUMN catms.employee_branch_assignment.assignment_type IS
  'Assignment nature: PRIMARY, TEMPORARY, or SECONDARY. Standardized to uppercase.';

COMMENT ON COLUMN catms.employee_branch_assignment.valid_from IS
  'Effective start date of the staff branch assignment.';

COMMENT ON COLUMN catms.employee_branch_assignment.valid_to IS
  'Effective end date of the assignment (NULL indicates open-ended/active).';

COMMENT ON COLUMN catms.employee_branch_assignment.is_active IS
  'Soft status indicator. Active primary assignment is restricted to at most one per employee.';

COMMENT ON COLUMN catms.employee_branch_assignment.assigned_by_user_id IS
  'Optional reference to the user account that authorized the assignment.';

COMMENT ON COLUMN catms.employee_branch_assignment.created_at IS
  'UTC timestamp when the assignment record was created.';

COMMENT ON COLUMN catms.employee_branch_assignment.updated_at IS
  'UTC timestamp when the assignment record was last modified.';

-- Table: catms.branch_manager_assignment
COMMENT ON TABLE catms.branch_manager_assignment IS
  'Effective-dated branch manager appointment records. '
  'Enforces at most one active manager per branch via partial unique index without circular FKs. '
  'Historical managers are retained with valid_to and is_active = FALSE.';

COMMENT ON COLUMN catms.branch_manager_assignment.branch_manager_assignment_id IS
  'Surrogate primary key generated by identity sequence.';

COMMENT ON COLUMN catms.branch_manager_assignment.branch_id IS
  'Foreign key to catms.branch. Uses ON DELETE RESTRICT.';

COMMENT ON COLUMN catms.branch_manager_assignment.employee_id IS
  'Foreign key to catms.employee. Uses ON DELETE RESTRICT.';

COMMENT ON COLUMN catms.branch_manager_assignment.valid_from IS
  'Effective start date of the branch manager appointment.';

COMMENT ON COLUMN catms.branch_manager_assignment.valid_to IS
  'Effective end date of the appointment (NULL indicates currently appointed manager).';

COMMENT ON COLUMN catms.branch_manager_assignment.is_active IS
  'Soft status indicator. Partial unique index guarantees at most one active manager per branch.';

COMMENT ON COLUMN catms.branch_manager_assignment.reason IS
  'Optional note or rationale for appointment, transfer, or acting coverage.';

COMMENT ON COLUMN catms.branch_manager_assignment.assigned_by_user_id IS
  'Optional reference to the administrator user account that authorized the appointment.';

COMMENT ON COLUMN catms.branch_manager_assignment.created_at IS
  'UTC timestamp when the manager appointment record was created.';

COMMENT ON COLUMN catms.branch_manager_assignment.updated_at IS
  'UTC timestamp when the manager appointment record was last modified.';

-- =============================================================================
-- Role Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON catms.employee_branch_assignment TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.branch_manager_assignment TO catms_app;

GRANT SELECT ON catms.employee_branch_assignment TO catms_readonly;
GRANT SELECT ON catms.branch_manager_assignment TO catms_readonly;

-- =============================================================================
-- Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (21, 'implement staff and manager assignment history schema', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
