-- 020_branch_and_employee.sql
-- Owner: Dev2  |  Issue: CATMS-015  |  Depends on: 003_migration_metadata.sql
--
-- Implements physical tables for physical clinic branches (Colombo, Kandy, Galle)
-- and clinic staff/employees in schema catms.
--
-- Key features:
--   - BIGINT GENERATED ALWAYS AS IDENTITY primary keys (pk_branch, pk_employee)
--   - citext case-insensitive uniqueness on branch codes, NIC numbers, employee numbers
--   - Dual identifier column support (branch_code/code, employee_number/employee_no, nic/nic_normalized)
--     synchronized automatically via triggers
--   - Check constraints for gender, past date of birth, position, employment status, non-empty fields
--   - Soft deactivation policy via is_active and employment_status
--   - Historical references protected with ON DELETE RESTRICT on all referencing relations
--   - Comprehensive COMMENT ON statements on tables and all columns
--   - Privileges granted to catms_app and catms_readonly roles

BEGIN;

-- =============================================================================
-- Table: catms.branch
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.branch (
    branch_id      BIGINT GENERATED ALWAYS AS IDENTITY,
    branch_code    CITEXT                   NOT NULL,
    code           CITEXT,
    name           VARCHAR(120)             NOT NULL,
    address_line_1 VARCHAR(180)             NOT NULL,
    address_line_2 VARCHAR(180),
    city           VARCHAR(80)              NOT NULL,
    district       VARCHAR(80),
    postal_code    VARCHAR(20),
    contact_phone  VARCHAR(25)              NOT NULL,
    time_zone      VARCHAR(40)              NOT NULL DEFAULT 'Asia/Colombo',
    is_active      BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_branch PRIMARY KEY (branch_id),
    CONSTRAINT uq_branch_branch_code UNIQUE (branch_code),
    CONSTRAINT uq_branch_code UNIQUE (code),
    CONSTRAINT uq_branch_name UNIQUE (name),
    CONSTRAINT chk_branch_branch_code_format CHECK (length(trim(branch_code)) > 0),
    CONSTRAINT chk_branch_name_nonempty CHECK (length(trim(name)) > 0),
    CONSTRAINT chk_branch_address_nonempty CHECK (length(trim(address_line_1)) > 0),
    CONSTRAINT chk_branch_city_nonempty CHECK (length(trim(city)) > 0),
    CONSTRAINT chk_branch_contact_phone_nonempty CHECK (length(trim(contact_phone)) > 0),
    CONSTRAINT chk_branch_time_zone_nonempty CHECK (length(trim(time_zone)) > 0)
);

-- =============================================================================
-- Table: catms.employee
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.employee (
    employee_id        BIGINT GENERATED ALWAYS AS IDENTITY,
    employee_number    CITEXT                   NOT NULL,
    employee_no        CITEXT,
    nic                CITEXT                   NOT NULL,
    nic_normalized     CITEXT,
    full_name          VARCHAR(150)             NOT NULL,
    gender_code        VARCHAR(20)              NOT NULL,
    date_of_birth      DATE                     NOT NULL,
    position_code      VARCHAR(30)              NOT NULL,
    phone              VARCHAR(25)              NOT NULL,
    email              CITEXT,
    hire_date          DATE                     NOT NULL,
    employment_status  VARCHAR(20)              NOT NULL DEFAULT 'Active',
    terminated_at      DATE,
    is_active          BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_employee PRIMARY KEY (employee_id),
    CONSTRAINT uq_employee_employee_number UNIQUE (employee_number),
    CONSTRAINT uq_employee_employee_no UNIQUE (employee_no),
    CONSTRAINT uq_employee_nic UNIQUE (nic),
    CONSTRAINT uq_employee_nic_normalized UNIQUE (nic_normalized),
    CONSTRAINT chk_employee_employee_number_format CHECK (length(trim(employee_number)) > 0),
    CONSTRAINT chk_employee_nic_format CHECK (length(trim(nic)) > 0),
    CONSTRAINT chk_employee_full_name_nonempty CHECK (length(trim(full_name)) > 0),
    CONSTRAINT chk_employee_gender CHECK (upper(gender_code) IN ('MALE', 'FEMALE', 'OTHER', 'M', 'F', 'O')),
    CONSTRAINT chk_employee_date_of_birth_past CHECK (date_of_birth < CURRENT_DATE),
    CONSTRAINT chk_employee_position CHECK (position_code IN ('Manager', 'Doctor', 'Nurse', 'Receptionist', 'Admin', 'Other')),
    CONSTRAINT chk_employee_employment_status CHECK (employment_status IN ('Active', 'Inactive', 'Terminated')),
    CONSTRAINT chk_employee_phone_nonempty CHECK (length(trim(phone)) > 0),
    CONSTRAINT chk_employee_termination_consistency CHECK (terminated_at IS NULL OR terminated_at >= hire_date)
);

-- =============================================================================
-- Triggers for Column Synchronization and Timestamp Maintenance
-- =============================================================================

CREATE OR REPLACE FUNCTION catms.sync_branch_identifiers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.branch_code IS NULL AND NEW.code IS NOT NULL THEN
        NEW.branch_code := trim(NEW.code);
    ELSIF NEW.code IS NULL AND NEW.branch_code IS NOT NULL THEN
        NEW.code := trim(NEW.branch_code);
    ELSE
        NEW.branch_code := trim(NEW.branch_code);
        NEW.code := trim(NEW.branch_code);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_branch_identifiers ON catms.branch;
CREATE TRIGGER trg_sync_branch_identifiers
    BEFORE INSERT OR UPDATE ON catms.branch
    FOR EACH ROW
    EXECUTE FUNCTION catms.sync_branch_identifiers();

CREATE OR REPLACE FUNCTION catms.sync_employee_identifiers()
RETURNS TRIGGER AS $$
BEGIN
    -- Employee number synchronization
    IF NEW.employee_number IS NULL AND NEW.employee_no IS NOT NULL THEN
        NEW.employee_number := trim(NEW.employee_no);
    ELSIF NEW.employee_no IS NULL AND NEW.employee_number IS NOT NULL THEN
        NEW.employee_no := trim(NEW.employee_number);
    ELSE
        NEW.employee_number := trim(NEW.employee_number);
        NEW.employee_no := trim(NEW.employee_number);
    END IF;

    -- NIC synchronization (upper-case normalized)
    IF NEW.nic IS NULL AND NEW.nic_normalized IS NOT NULL THEN
        NEW.nic := upper(trim(NEW.nic_normalized));
    ELSIF NEW.nic_normalized IS NULL AND NEW.nic IS NOT NULL THEN
        NEW.nic_normalized := upper(trim(NEW.nic));
    ELSE
        NEW.nic := upper(trim(NEW.nic));
        NEW.nic_normalized := upper(trim(NEW.nic));
    END IF;

    -- Status deactivation alignment
    IF NEW.employment_status IN ('Inactive', 'Terminated') THEN
        NEW.is_active := FALSE;
    ELSIF NEW.is_active = FALSE AND NEW.employment_status = 'Active' THEN
        NEW.employment_status := 'Inactive';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_employee_identifiers ON catms.employee;
CREATE TRIGGER trg_sync_employee_identifiers
    BEFORE INSERT OR UPDATE ON catms.employee
    FOR EACH ROW
    EXECUTE FUNCTION catms.sync_employee_identifiers();

CREATE OR REPLACE FUNCTION catms.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_branch_updated_at ON catms.branch;
CREATE TRIGGER trg_touch_branch_updated_at
    BEFORE UPDATE ON catms.branch
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_employee_updated_at ON catms.employee;
CREATE TRIGGER trg_touch_employee_updated_at
    BEFORE UPDATE ON catms.employee
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

-- =============================================================================
-- COMMENT ON Statements
-- =============================================================================

-- Table: catms.branch
COMMENT ON TABLE catms.branch IS
  'Physical clinic locations (Colombo, Kandy, Galle). '
  'Referenced branches are deactivated (is_active = false), never physically deleted. '
  'Foreign keys from operational tables must use ON DELETE RESTRICT.';

COMMENT ON COLUMN catms.branch.branch_id IS
  'Surrogate primary key generated by identity sequence.';

COMMENT ON COLUMN catms.branch.branch_code IS
  'Unique business code for branch (e.g. CMB, KDY, GLE). Case-insensitive citext.';

COMMENT ON COLUMN catms.branch.code IS
  'Synonym alias for branch_code maintained via synchronization trigger.';

COMMENT ON COLUMN catms.branch.name IS
  'Official clinic branch facility name (e.g. Colombo Central, Kandy Lakeside). Unique.';

COMMENT ON COLUMN catms.branch.address_line_1 IS
  'Primary physical address line of the clinic facility.';

COMMENT ON COLUMN catms.branch.address_line_2 IS
  'Secondary physical address line (suite, building, floor).';

COMMENT ON COLUMN catms.branch.city IS
  'City or municipality where the clinic branch is located.';

COMMENT ON COLUMN catms.branch.district IS
  'Administrative district of Sri Lanka (e.g. Colombo, Kandy, Galle).';

COMMENT ON COLUMN catms.branch.postal_code IS
  'Postal code for physical mail delivery.';

COMMENT ON COLUMN catms.branch.contact_phone IS
  'Direct contact phone number for the branch front desk.';

COMMENT ON COLUMN catms.branch.time_zone IS
  'IANA timezone for local operational day views (default Asia/Colombo).';

COMMENT ON COLUMN catms.branch.is_active IS
  'Soft status indicator. Inactive branches are hidden from new bookings but retained for historical reporting.';

COMMENT ON COLUMN catms.branch.created_at IS
  'UTC timestamp when the branch record was created.';

COMMENT ON COLUMN catms.branch.updated_at IS
  'UTC timestamp when the branch record was last modified.';

-- Table: catms.employee
COMMENT ON TABLE catms.employee IS
  'Core employee and staff registry across all clinic branches. '
  'Enforces clinic-wide uniqueness on national identity card (NIC) and employee number. '
  'Historical references must use ON DELETE RESTRICT. Deactivation uses is_active = false and employment_status.';

COMMENT ON COLUMN catms.employee.employee_id IS
  'Surrogate primary key generated by identity sequence. Shared as PK/FK by doctor_profile.';

COMMENT ON COLUMN catms.employee.employee_number IS
  'Unique staff business identifier (e.g. EMP-0001). Case-insensitive citext.';

COMMENT ON COLUMN catms.employee.employee_no IS
  'Synonym alias for employee_number maintained via synchronization trigger.';

COMMENT ON COLUMN catms.employee.nic IS
  'Sri Lankan National Identity Card number (e.g. 886521430V or 12-digit format). Clinic-wide unique citext.';

COMMENT ON COLUMN catms.employee.nic_normalized IS
  'Synonym alias for nic maintained via synchronization trigger in normalized upper case.';

COMMENT ON COLUMN catms.employee.full_name IS
  'Full legal name of the employee.';

COMMENT ON COLUMN catms.employee.gender_code IS
  'Configured gender code: Male, Female, Other.';

COMMENT ON COLUMN catms.employee.date_of_birth IS
  'Date of birth. Must be strictly in the past.';

COMMENT ON COLUMN catms.employee.position_code IS
  'Employment position: Manager, Doctor, Nurse, Receptionist, Admin, Other. Describes employment; app_role controls authorization.';

COMMENT ON COLUMN catms.employee.phone IS
  'Primary contact telephone number.';

COMMENT ON COLUMN catms.employee.email IS
  'Work contact email address. Case-insensitive citext.';

COMMENT ON COLUMN catms.employee.hire_date IS
  'Official date when employment commenced.';

COMMENT ON COLUMN catms.employee.employment_status IS
  'Employment lifecycle status: Active, Inactive, Terminated.';

COMMENT ON COLUMN catms.employee.terminated_at IS
  'Date of resignation or termination. Must be >= hire_date when populated.';

COMMENT ON COLUMN catms.employee.is_active IS
  'Soft status indicator. Active employees can be assigned to branches and granted access.';

COMMENT ON COLUMN catms.employee.created_at IS
  'UTC timestamp when the employee record was created.';

COMMENT ON COLUMN catms.employee.updated_at IS
  'UTC timestamp when the employee record was last modified.';

-- =============================================================================
-- Role Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON catms.branch TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.employee TO catms_app;

GRANT SELECT ON catms.branch TO catms_readonly;
GRANT SELECT ON catms.employee TO catms_readonly;

-- =============================================================================
-- Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (20, 'implement branch and employee schema', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
