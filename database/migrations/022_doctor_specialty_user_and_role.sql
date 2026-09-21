-- 022_doctor_specialty_user_and_role.sql
-- Owner: Dev2  |  Issue: CATMS-017  |  Depends on: 021_staff_and_manager_assignments.sql
--
-- Implements:
--   - catms.doctor_profile (1:1 shared PK subtype of catms.employee)
--   - catms.specialty (medical specialties catalogue)
--   - catms.doctor_specialty (many-to-many doctor specialization with primary flag)
--   - catms.user_account (credentials isolated from clinical data, bcrypt hash)
--   - catms.app_role (canonical roles: Reception, Clinician, Manager, Admin, QA)
--   - catms.user_account_role (RBAC role assignments supporting branch and all-branch scope)
--   - catms.audit_event (append-only system security audit trail)
--   - Foreign key retrofits from assignment tables to user_account
--   - Triggers for synonym synchronization, timestamps, and append-only enforcement
--   - Grants to catms_app and catms_readonly roles

BEGIN;

-- =============================================================================
-- Table: catms.doctor_profile
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.doctor_profile (
    doctor_id                  BIGINT                   NOT NULL,
    id                         BIGINT GENERATED ALWAYS AS (doctor_id) STORED,
    medical_license_no         CITEXT                   NOT NULL,
    license_no                 CITEXT,
    practice_start_date        DATE                     NOT NULL,
    default_consultation_fee   NUMERIC(12,2),
    is_accepting_appointments  BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_at                 TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_doctor_profile PRIMARY KEY (doctor_id),
    CONSTRAINT fk_doctor_profile_employee FOREIGN KEY (doctor_id)
        REFERENCES catms.employee(employee_id) ON DELETE RESTRICT,
    CONSTRAINT uq_doctor_profile_medical_license_no UNIQUE (medical_license_no),
    CONSTRAINT uq_doctor_profile_license_no UNIQUE (license_no),
    CONSTRAINT chk_doctor_profile_fee CHECK (default_consultation_fee IS NULL OR default_consultation_fee >= 0),
    CONSTRAINT chk_doctor_profile_practice_start CHECK (practice_start_date <= CURRENT_DATE),
    CONSTRAINT chk_doctor_profile_license_format CHECK (length(trim(medical_license_no)) > 0)
);

-- =============================================================================
-- Table: catms.specialty
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.specialty (
    specialty_id   BIGINT GENERATED ALWAYS AS IDENTITY,
    specialty_code CITEXT                   NOT NULL,
    name           VARCHAR(100)             NOT NULL,
    description    VARCHAR(255),
    is_active      BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_specialty PRIMARY KEY (specialty_id),
    CONSTRAINT uq_specialty_specialty_code UNIQUE (specialty_code),
    CONSTRAINT uq_specialty_name UNIQUE (name),
    CONSTRAINT chk_specialty_code_format CHECK (length(trim(specialty_code)) > 0),
    CONSTRAINT chk_specialty_name_format CHECK (length(trim(name)) > 0)
);

-- =============================================================================
-- Table: catms.doctor_specialty
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.doctor_specialty (
    doctor_specialty_id BIGINT GENERATED ALWAYS AS IDENTITY,
    doctor_id           BIGINT                   NOT NULL,
    specialty_id        BIGINT                   NOT NULL,
    is_primary          BOOLEAN                  NOT NULL DEFAULT FALSE,
    valid_from          DATE                     NOT NULL DEFAULT CURRENT_DATE,
    valid_to            DATE,
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_doctor_specialty PRIMARY KEY (doctor_specialty_id),
    CONSTRAINT fk_doctor_specialty_doctor FOREIGN KEY (doctor_id)
        REFERENCES catms.doctor_profile(doctor_id) ON DELETE RESTRICT,
    CONSTRAINT fk_doctor_specialty_specialty FOREIGN KEY (specialty_id)
        REFERENCES catms.specialty(specialty_id) ON DELETE RESTRICT,
    CONSTRAINT uq_doctor_specialty_temporal UNIQUE (doctor_id, specialty_id, valid_from),
    CONSTRAINT chk_doctor_specialty_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

-- At most one active primary specialty per doctor
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_primary_doctor_specialty
    ON catms.doctor_specialty (doctor_id)
    WHERE (is_primary = TRUE AND (valid_to IS NULL OR valid_to >= CURRENT_DATE));

-- =============================================================================
-- Table: catms.user_account
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.user_account (
    user_account_id        BIGINT GENERATED ALWAYS AS IDENTITY,
    employee_id            BIGINT                   NOT NULL,
    username               CITEXT                   NOT NULL,
    password_hash          TEXT                     NOT NULL,
    account_status         VARCHAR(20)              NOT NULL DEFAULT 'Active',
    status                 VARCHAR(20),
    failed_login_count     SMALLINT                 NOT NULL DEFAULT 0,
    failed_login_attempts  SMALLINT,
    last_login_at          TIMESTAMPTZ,
    password_changed_at    TIMESTAMPTZ              NOT NULL DEFAULT now(),
    created_at             TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_user_account PRIMARY KEY (user_account_id),
    CONSTRAINT uq_user_account_employee UNIQUE (employee_id),
    CONSTRAINT uq_user_account_username UNIQUE (username),
    CONSTRAINT fk_user_account_employee FOREIGN KEY (employee_id)
        REFERENCES catms.employee(employee_id) ON DELETE RESTRICT,
    CONSTRAINT chk_user_account_status CHECK (upper(account_status) IN ('ACTIVE', 'LOCKED', 'DISABLED')),
    CONSTRAINT chk_user_account_failed_logins CHECK (failed_login_count >= 0),
    CONSTRAINT chk_user_account_username_format CHECK (length(trim(username)) >= 3),
    CONSTRAINT chk_user_account_password_hash CHECK (length(trim(password_hash)) >= 20)
);

-- =============================================================================
-- Table: catms.app_role
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.app_role (
    app_role_id  SMALLINT GENERATED ALWAYS AS IDENTITY,
    role_code    CITEXT                   NOT NULL,
    display_name VARCHAR(80)              NOT NULL,
    description  VARCHAR(255),
    is_active    BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_app_role PRIMARY KEY (app_role_id),
    CONSTRAINT uq_app_role_role_code UNIQUE (role_code),
    CONSTRAINT chk_app_role_code CHECK (upper(role_code) IN ('RECEPTION', 'CLINICIAN', 'MANAGER', 'BRANCHMANAGER', 'ADMIN', 'ADMINFINANCE', 'QA'))
);

-- Pre-seed canonical application roles
INSERT INTO catms.app_role (role_code, display_name, description) VALUES
    ('Reception', 'Receptionist', 'Front-desk patient check-in, registration and scheduling'),
    ('Clinician', 'Doctor / Clinician', 'Medical consultation notes and treatment recording'),
    ('Manager', 'Branch Manager', 'Operational oversight of assigned clinic branch'),
    ('Admin', 'Admin / Finance', 'Full administrative and financial management access'),
    ('QA', 'QA Auditor', 'Read-only compliance and invariant verification')
ON CONFLICT (role_code) DO NOTHING;

-- =============================================================================
-- Table: catms.user_account_role
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.user_account_role (
    user_account_role_id BIGINT GENERATED ALWAYS AS IDENTITY,
    user_account_id      BIGINT                   NOT NULL,
    app_role_id          SMALLINT                 NOT NULL,
    branch_scope_id      BIGINT,
    valid_from           TIMESTAMPTZ              NOT NULL DEFAULT now(),
    valid_to             TIMESTAMPTZ,
    assigned_by_user_id  BIGINT,
    created_at           TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT pk_user_account_role PRIMARY KEY (user_account_role_id),
    CONSTRAINT fk_user_account_role_user FOREIGN KEY (user_account_id)
        REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_account_role_role FOREIGN KEY (app_role_id)
        REFERENCES catms.app_role(app_role_id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_account_role_branch FOREIGN KEY (branch_scope_id)
        REFERENCES catms.branch(branch_id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_account_role_assigned_by FOREIGN KEY (assigned_by_user_id)
        REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,
    CONSTRAINT chk_user_account_role_dates CHECK (valid_to IS NULL OR valid_to >= valid_from),
    CONSTRAINT uq_user_account_role UNIQUE NULLS NOT DISTINCT (user_account_id, app_role_id, branch_scope_id, valid_from)
);

-- =============================================================================
-- Table: catms.audit_event (Append-Only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS catms.audit_event (
    audit_event_id BIGINT GENERATED ALWAYS AS IDENTITY,
    actor_user_id  BIGINT,
    actor_id       BIGINT,
    entity_type    VARCHAR(80)              NOT NULL,
    entity_id      VARCHAR(80)              NOT NULL,
    action_code    VARCHAR(80)              NOT NULL,
    event_type     VARCHAR(80),
    occurred_at    TIMESTAMPTZ              NOT NULL DEFAULT now(),
    created_at     TIMESTAMPTZ              NOT NULL DEFAULT now(),
    correlation_id UUID,
    before_data    JSONB,
    after_data     JSONB,
    payload        JSONB,
    client_ip      INET,

    CONSTRAINT pk_audit_event PRIMARY KEY (audit_event_id),
    CONSTRAINT fk_audit_event_actor FOREIGN KEY (actor_user_id)
        REFERENCES catms.user_account(user_account_id) ON DELETE RESTRICT,
    CONSTRAINT chk_audit_event_entity_type CHECK (length(trim(entity_type)) > 0),
    CONSTRAINT chk_audit_event_entity_id CHECK (length(trim(entity_id)) > 0),
    CONSTRAINT chk_audit_event_action CHECK (length(trim(action_code)) > 0)
);

-- =============================================================================
-- Triggers for Synonyms, Updates, and Append-Only Invariants
-- =============================================================================

-- 1. Doctor license synchronization
CREATE OR REPLACE FUNCTION catms.sync_doctor_profile_license()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.medical_license_no IS NULL AND NEW.license_no IS NOT NULL THEN
        NEW.medical_license_no := trim(NEW.license_no);
    ELSIF NEW.license_no IS NULL AND NEW.medical_license_no IS NOT NULL THEN
        NEW.license_no := trim(NEW.medical_license_no);
    ELSE
        NEW.medical_license_no := trim(NEW.medical_license_no);
        NEW.license_no := trim(NEW.medical_license_no);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_doctor_profile_license ON catms.doctor_profile;
CREATE TRIGGER trg_sync_doctor_profile_license
    BEFORE INSERT OR UPDATE ON catms.doctor_profile
    FOR EACH ROW
    EXECUTE FUNCTION catms.sync_doctor_profile_license();

-- 2. User account status and attempt count synchronization
CREATE OR REPLACE FUNCTION catms.sync_user_account_synonyms()
RETURNS TRIGGER AS $$
BEGIN
    -- status <-> account_status
    IF NEW.account_status IS NULL AND NEW.status IS NOT NULL THEN
        NEW.account_status := trim(NEW.status);
    ELSIF NEW.status IS NULL AND NEW.account_status IS NOT NULL THEN
        NEW.status := trim(NEW.account_status);
    ELSE
        NEW.account_status := trim(NEW.account_status);
        NEW.status := trim(NEW.account_status);
    END IF;

    -- failed_login_attempts <-> failed_login_count
    IF NEW.failed_login_count IS NULL AND NEW.failed_login_attempts IS NOT NULL THEN
        NEW.failed_login_count := NEW.failed_login_attempts;
    ELSIF NEW.failed_login_attempts IS NULL AND NEW.failed_login_count IS NOT NULL THEN
        NEW.failed_login_attempts := NEW.failed_login_count;
    ELSE
        NEW.failed_login_attempts := NEW.failed_login_count;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_account_synonyms ON catms.user_account;
CREATE TRIGGER trg_sync_user_account_synonyms
    BEFORE INSERT OR UPDATE ON catms.user_account
    FOR EACH ROW
    EXECUTE FUNCTION catms.sync_user_account_synonyms();

-- 3. Audit event synonyms
CREATE OR REPLACE FUNCTION catms.sync_audit_event_synonyms()
RETURNS TRIGGER AS $$
BEGIN
    -- actor_id <-> actor_user_id
    IF NEW.actor_user_id IS NULL AND NEW.actor_id IS NOT NULL THEN
        NEW.actor_user_id := NEW.actor_id;
    ELSIF NEW.actor_id IS NULL AND NEW.actor_user_id IS NOT NULL THEN
        NEW.actor_id := NEW.actor_user_id;
    END IF;

    -- event_type <-> action_code
    IF NEW.action_code IS NULL AND NEW.event_type IS NOT NULL THEN
        NEW.action_code := trim(NEW.event_type);
    ELSIF NEW.event_type IS NULL AND NEW.action_code IS NOT NULL THEN
        NEW.event_type := trim(NEW.action_code);
    END IF;

    -- payload <-> after_data
    IF NEW.after_data IS NULL AND NEW.payload IS NOT NULL THEN
        NEW.after_data := NEW.payload;
    ELSIF NEW.payload IS NULL AND NEW.after_data IS NOT NULL THEN
        NEW.payload := NEW.after_data;
    END IF;

    IF NEW.created_at IS NULL AND NEW.occurred_at IS NOT NULL THEN
        NEW.created_at := NEW.occurred_at;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_audit_event_synonyms ON catms.audit_event;
CREATE TRIGGER trg_sync_audit_event_synonyms
    BEFORE INSERT ON catms.audit_event
    FOR EACH ROW
    EXECUTE FUNCTION catms.sync_audit_event_synonyms();

-- 4. Append-only trigger for audit_event
CREATE OR REPLACE FUNCTION catms.prevent_audit_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_event is an append-only audit trail: % is prohibited', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_event_mutation ON catms.audit_event;
CREATE TRIGGER trg_prevent_audit_event_mutation
    BEFORE UPDATE OR DELETE ON catms.audit_event
    FOR EACH ROW
    EXECUTE FUNCTION catms.prevent_audit_event_mutation();

-- 5. Updated_at timestamp triggers
DROP TRIGGER IF EXISTS trg_touch_doctor_profile_updated_at ON catms.doctor_profile;
CREATE TRIGGER trg_touch_doctor_profile_updated_at
    BEFORE UPDATE ON catms.doctor_profile
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_specialty_updated_at ON catms.specialty;
CREATE TRIGGER trg_touch_specialty_updated_at
    BEFORE UPDATE ON catms.specialty
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_user_account_updated_at ON catms.user_account;
CREATE TRIGGER trg_touch_user_account_updated_at
    BEFORE UPDATE ON catms.user_account
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_app_role_updated_at ON catms.app_role;
CREATE TRIGGER trg_touch_app_role_updated_at
    BEFORE UPDATE ON catms.app_role
    FOR EACH ROW
    EXECUTE FUNCTION catms.touch_updated_at();

-- =============================================================================
-- Retrofit Foreign Keys from 021 Assignment Tables to User Account
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_employee_branch_assignment_assigned_by'
          AND table_schema = 'catms'
    ) THEN
        ALTER TABLE catms.employee_branch_assignment
            ADD CONSTRAINT fk_employee_branch_assignment_assigned_by
            FOREIGN KEY (assigned_by_user_id) REFERENCES catms.user_account(user_account_id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_branch_manager_assignment_assigned_by'
          AND table_schema = 'catms'
    ) THEN
        ALTER TABLE catms.branch_manager_assignment
            ADD CONSTRAINT fk_branch_manager_assignment_assigned_by
            FOREIGN KEY (assigned_by_user_id) REFERENCES catms.user_account(user_account_id)
            ON DELETE RESTRICT;
    END IF;
END;
$$;

-- =============================================================================
-- COMMENT ON Statements
-- =============================================================================

COMMENT ON TABLE catms.doctor_profile IS
  'Doctor specialization details extending employee in a 1:1 shared primary key subtype. '
  'Enforces case-insensitive medical licence uniqueness and tracks appointment eligibility.';

COMMENT ON COLUMN catms.doctor_profile.doctor_id IS
  'Shared primary key and foreign key referencing catms.employee(employee_id).';

COMMENT ON COLUMN catms.doctor_profile.medical_license_no IS
  'Sri Lanka Medical Council (SLMC) licence identifier. Case-insensitive citext.';

COMMENT ON COLUMN catms.doctor_profile.practice_start_date IS
  'Date when medical practice commenced. Used to derive years of experience without stale data.';

COMMENT ON COLUMN catms.doctor_profile.default_consultation_fee IS
  'Default standard consultation fee in LKR. Specific appointment lines snapshot fee at delivery.';

COMMENT ON COLUMN catms.doctor_profile.is_accepting_appointments IS
  'Availability switch. If false, doctor cannot receive new appointment bookings.';

COMMENT ON TABLE catms.specialty IS
  'Master catalogue of medical specialties offered across clinic branches.';

COMMENT ON COLUMN catms.specialty.specialty_id IS
  'Surrogate primary key for specialty catalogue.';

COMMENT ON COLUMN catms.specialty.specialty_code IS
  'Unique business code (e.g. CARD, PEDI, DERM). Case-insensitive citext.';

COMMENT ON COLUMN catms.specialty.name IS
  'Official display name of medical specialty (e.g. Cardiology, Paediatrics).';

COMMENT ON TABLE catms.doctor_specialty IS
  'Many-to-many junction mapping doctors to specialties with temporal validity and primary indicator.';

COMMENT ON TABLE catms.user_account IS
  'Staff authentication credentials, account lock state and login history. '
  'Isolated from clinical data (NFR-9). Passwords are stored exclusively as bcrypt hashes.';

COMMENT ON COLUMN catms.user_account.user_account_id IS
  'Surrogate primary key for user account.';

COMMENT ON COLUMN catms.user_account.employee_id IS
  '1:1 foreign key referencing employee. Every account must belong to a registered staff member.';

COMMENT ON COLUMN catms.user_account.username IS
  'Login username. Unique case-insensitive citext.';

COMMENT ON COLUMN catms.user_account.password_hash IS
  'Cryptographic bcrypt password hash. Plain-text passwords must never be stored or logged.';

COMMENT ON COLUMN catms.user_account.account_status IS
  'Authentication status: Active, Locked, or Disabled.';

COMMENT ON TABLE catms.app_role IS
  'Application role definitions for 3-layer authorization (Reception, Clinician, Manager, Admin, QA).';

COMMENT ON COLUMN catms.app_role.role_code IS
  'Canonical security role code. Unique case-insensitive citext.';

COMMENT ON TABLE catms.user_account_role IS
  'Maps user accounts to application roles with optional branch scoping. '
  'When branch_scope_id is NULL, the role applies clinic-wide (all-branch access for Admin/QA).';

COMMENT ON COLUMN catms.user_account_role.branch_scope_id IS
  'Branch scope restriction. NULL indicates clinic-wide (all-branch) authorization.';

COMMENT ON TABLE catms.audit_event IS
  'Append-only security and administrative audit trail. Mutation and deletion are prohibited by trigger.';

-- =============================================================================
-- Role Grants
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON catms.doctor_profile TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.specialty TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.doctor_specialty TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.user_account TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.app_role TO catms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catms.user_account_role TO catms_app;
GRANT SELECT, INSERT ON catms.audit_event TO catms_app;

GRANT SELECT ON catms.doctor_profile TO catms_readonly;
GRANT SELECT ON catms.specialty TO catms_readonly;
GRANT SELECT ON catms.doctor_specialty TO catms_readonly;
GRANT SELECT ON catms.user_account TO catms_readonly;
GRANT SELECT ON catms.app_role TO catms_readonly;
GRANT SELECT ON catms.user_account_role TO catms_readonly;
GRANT SELECT ON catms.audit_event TO catms_readonly;

-- =============================================================================
-- Migration Tracking
-- =============================================================================

INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (22, 'implement doctor specialty user account and role schema', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
