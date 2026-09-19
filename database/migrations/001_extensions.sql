-- 001_extensions.sql
-- Owner: Dev1  |  Issue: CATMS-012  |  Depends on: (first migration — runner bootstraps schema_migrations before this runs)
--
-- Enables PostgreSQL extensions required by CATMS.
-- Must run first — subsequent migrations depend on these types and operators.
--
-- Bootstrap note:
--   The migration runner creates catms.schema_migrations before applying any
--   numbered file (see scripts/migrate.sh). So it is safe for every migration,
--   including this one, to INSERT into catms.schema_migrations at the end.
--
-- Extensions installed:
--   btree_gist  — required by 061_appointment_overlap_exclusion.sql
--                 Adds GiST operator classes for scalar types (BIGINT, TIMESTAMPTZ)
--                 so that EXCLUDE USING GIST can combine them with tstzrange.
--
--   citext      — required by Dev2 (020–039) and Dev3 (040–059) migrations.
--                 Case-insensitive text type used for NIC, licence_number,
--                 email, username — prevents duplicate identity records that
--                 differ only in letter case.
--
-- Idempotency: CREATE EXTENSION IF NOT EXISTS is safe to rerun.
-- No rollback: extensions are cluster-level; removing them would break all schemas.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

-- Record this migration. The runner validates the checksum of this file
-- against catms.schema_migrations.checksum_sha256 before running it.
-- If the checksum changes after merging, the runner aborts with an error.
INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (1, 'enable btree_gist and citext extensions', current_user);

COMMIT;
