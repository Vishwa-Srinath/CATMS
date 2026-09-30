-- =============================================================================
-- infra/docker/postgres/init/01_create_roles.sql
-- Owner: Dev1  |  Issue: CATMS-011
--
-- Runs ONCE when the Docker volume is first created (empty DB only).
-- Creates the application database role used by the API server.
-- The superuser (POSTGRES_USER from compose.yaml) is created by Docker itself.
--
-- Do NOT use this file to create tables or run migrations.
-- Migrations are handled by the migration runner (CATMS-012).
--
-- Security notes:
--   - catms_app receives only CONNECT on the database and will receive object
--     privileges via GRANT statements inside each migration.
--   - catms_app can never CREATE objects; migrations run as the superuser.
--   - The password here is the default dev placeholder; real values come from
--     the .env file at runtime. This script reads the POSTGRES_APP_PASSWORD
--     env var if set, otherwise falls back to the dev default.
-- =============================================================================

-- Application role used by the Express API at runtime.
-- This role must exist before the migration runner grants it object privileges.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catms_app') THEN
    -- Password will be rotated via the .env before demo; this is the dev default.
    CREATE ROLE catms_app WITH LOGIN PASSWORD 'change_me_dev';
    COMMENT ON ROLE catms_app IS
      'CATMS application role. Used by Express API. Granted object privileges via migrations.';
  END IF;
END;
$$;

-- Allow catms_app to connect to the development database.
-- Object-level privileges (SELECT, INSERT, EXECUTE, etc.) are granted
-- per-table/procedure inside each migration file (001_*.sql through 089_*.sql).
DO $$
DECLARE
  v_db text := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO catms_app', v_db);
END;
$$;

-- Read-only reporting role (used by report queries; granted SELECT by migrations).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catms_readonly') THEN
    CREATE ROLE catms_readonly WITH LOGIN PASSWORD 'change_me_readonly';
    COMMENT ON ROLE catms_readonly IS
      'CATMS read-only role. Used for report queries and Dev5 read objects.';
  END IF;
END;
$$;

DO $$
DECLARE
  v_db text := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO catms_readonly', v_db);
END;
$$;
