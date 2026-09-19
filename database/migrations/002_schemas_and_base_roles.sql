-- 002_schemas_and_base_roles.sql
-- Owner: Dev1  |  Issue: CATMS-012  |  Depends on: 001_extensions.sql
--
-- Creates the application schema and configures database-level role privileges.
--
-- Schema:
--   catms   — contains ALL application tables, views, functions and procedures.
--             All migrations create objects inside this schema.
--             The public schema is not used for application objects.
--
-- Role privilege model (roles created in infra/docker/postgres/init/01_create_roles.sql):
--   catms_app       — runtime application role (Express API)
--                     Receives USAGE on schema catms.
--                     Specific table/function privileges are granted per migration.
--   catms_readonly  — read-only reporting role (Dev5 report queries)
--                     Receives USAGE on schema catms.
--                     Specific SELECT privileges granted by Dev5 migrations (140–159).
--
-- DEFAULT PRIVILEGES:
--   Any future table created inside catms schema by the superuser automatically
--   grants SELECT to catms_readonly (convenience for Dev5).
--   catms_app receives only the explicit grants in each migration — principle of
--   least privilege.
--
-- search_path:
--   Not set globally. Every migration and application query uses fully-qualified
--   names (catms.table_name) to prevent search_path injection attacks.

BEGIN;

-- Application schema — all objects live here.
CREATE SCHEMA IF NOT EXISTS catms;

COMMENT ON SCHEMA catms IS
  'CATMS application schema. Contains all tables, views, functions and procedures. '
  'Use fully-qualified names (catms.table_name) in all queries.';

-- Grant schema usage to runtime roles.
-- Object-level privileges are added per migration as tables/functions are created.
GRANT USAGE ON SCHEMA catms TO catms_app;
GRANT USAGE ON SCHEMA catms TO catms_readonly;

-- Default privilege: every new table in catms schema is automatically
-- SELECT-able by catms_readonly without an extra GRANT in each migration.
-- catms_app still requires explicit per-table grants for write access.
ALTER DEFAULT PRIVILEGES IN SCHEMA catms
  GRANT SELECT ON TABLES TO catms_readonly;

-- Record this migration.
INSERT INTO catms.schema_migrations (version, description, applied_by)
VALUES (2, 'create catms schema and configure base role privileges', current_user);

COMMIT;
