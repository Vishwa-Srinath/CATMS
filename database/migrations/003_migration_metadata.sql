-- 003_migration_metadata.sql
-- Owner: Dev1  |  Issue: CATMS-012  |  Depends on: 002_schemas_and_base_roles.sql
--
-- Creates the migration history and checksum tracking table.
--
-- IMPORTANT — Bootstrap order:
--   The migration runner (scripts/migrate.sh) executes this file AS ITS FIRST
--   STEP before applying any other numbered migration. It is run unconditionally
--   using IF NOT EXISTS so a repeated run is always safe.
--
--   Execution order enforced by the runner:
--     1. Runner creates catms schema (if not exists) — inline bootstrap
--     2. Runner applies 003_migration_metadata.sql (this file) — creates the table
--     3. Runner applies 001, 002, 003, 004 … in numeric order,
--        skipping any version already recorded in schema_migrations.
--        003 itself is skipped on first run because the runner marks it applied
--        immediately after step 2.
--
-- Why a separate metadata migration?
--   Having the table definition in a versioned file means:
--     - It is tracked in git history alongside all other schema changes.
--     - The table can be peer-reviewed via normal PR.
--     - Future corrective migrations (160+) can reference it.
--
-- Table: catms.schema_migrations
--   version         — numeric order enforced by runner (no gaps allowed)
--   description     — human-readable description of what this migration does
--   applied_at      — UTC timestamp when the migration completed successfully
--   applied_by      — database role that ran the migration (for audit)
--   checksum_sha256 — SHA-256 of the migration file content at apply-time
--                     Runner verifies this on every run; abort if it changes.
--   execution_ms    — how long the migration took (diagnostics only)

BEGIN;

CREATE TABLE IF NOT EXISTS catms.schema_migrations (
    version          INTEGER                  NOT NULL,
    description      TEXT                     NOT NULL,
    applied_at       TIMESTAMPTZ              NOT NULL DEFAULT now(),
    applied_by       TEXT                     NOT NULL,
    checksum_sha256  TEXT,
    execution_ms     INTEGER,

    CONSTRAINT schema_migrations_pkey PRIMARY KEY (version),
    CONSTRAINT schema_migrations_version_positive CHECK (version > 0),
    CONSTRAINT schema_migrations_description_nonempty CHECK (length(trim(description)) > 0)
);

COMMENT ON TABLE catms.schema_migrations IS
  'Forward-only migration history. One row per successfully applied migration file. '
  'The runner validates checksum_sha256 before applying any previously-recorded version. '
  'Never delete or update rows; add a corrective migration instead.';

COMMENT ON COLUMN catms.schema_migrations.version IS
  'Numeric identifier from the NNN_ filename prefix. Must be applied in strict ascending order.';

COMMENT ON COLUMN catms.schema_migrations.description IS
  'Human-readable summary of what this migration does. Matches the filename description segment.';

COMMENT ON COLUMN catms.schema_migrations.applied_at IS
  'UTC timestamp when the migration transaction committed successfully.';

COMMENT ON COLUMN catms.schema_migrations.applied_by IS
  'Database role (current_user) that applied this migration. Typically the superuser.';

COMMENT ON COLUMN catms.schema_migrations.checksum_sha256 IS
  'SHA-256 hash of the migration file contents at apply-time. '
  'Runner aborts if this changes after the migration is merged.';

COMMENT ON COLUMN catms.schema_migrations.execution_ms IS
  'Wall-clock milliseconds the migration took to complete. Diagnostic only.';

-- Protect schema_migrations from accidental modification by the app role.
-- The runner uses the superuser; catms_app must never write to this table.
REVOKE ALL ON catms.schema_migrations FROM catms_app;
GRANT SELECT ON catms.schema_migrations TO catms_app;

-- catms_readonly can inspect migration history (useful for verify checks).
GRANT SELECT ON catms.schema_migrations TO catms_readonly;

-- Record this migration itself.
-- The runner inserts this row with checksum + execution_ms after bootstrapping.
-- The INSERT here records version 3 in case the runner re-applies from scratch.
INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (3, 'create migration history and checksum tracking table', current_user)
ON CONFLICT (version) DO NOTHING;

COMMIT;
