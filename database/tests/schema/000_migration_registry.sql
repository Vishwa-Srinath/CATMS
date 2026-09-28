-- =============================================================================
-- database/tests/schema/000_migration_registry.sql
-- Owner: Dev1  |  Issue: CATMS-022
-- Reviewer: Dev4
--
-- Meta-test: validates that catms.schema_migrations is structurally sound and
-- internally consistent BEFORE any module schema tests run.
--
-- This file is intentionally numbered 000 so sort -V always places it first.
-- If this test fails, later module schema tests are meaningless because the
-- migration registry itself cannot be trusted.
--
-- Assertions (all read-only — no data is modified):
--   1. catms.schema_migrations table exists.
--   2. Every recorded version is a positive integer (> 0).
--   3. No row has a NULL applied_at — every committed migration must timestamp.
--   4. No row has a NULL or blank applied_by.
--   5. The three baseline migrations (001, 002, 003 → versions 1, 2, 3) are
--      present — they are preconditions for all module migrations.
--   6. When rows are ordered by version, applied_at timestamps are
--      non-decreasing — i.e., earlier versions were not applied after later
--      ones (detects runner ordering bugs).
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_count        INTEGER;
    v_bad          INTEGER;
    v_out_of_order INTEGER;
BEGIN

    -- ── 1. Table existence ──────────────────────────────────────────────────
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms'
      AND table_name   = 'schema_migrations';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'Migration registry absent: catms.schema_migrations does not exist. '
            'Run scripts/migrate.sh to bootstrap the database.';
    END IF;


    -- ── 2. No zero or negative version numbers ──────────────────────────────
    SELECT count(*) INTO v_bad
    FROM catms.schema_migrations
    WHERE version <= 0;

    IF v_bad > 0 THEN
        RAISE EXCEPTION
            'Migration registry integrity: % row(s) have version <= 0. '
            'Every migration version must be a positive integer.',
            v_bad;
    END IF;


    -- ── 3. No NULL applied_at ───────────────────────────────────────────────
    SELECT count(*) INTO v_bad
    FROM catms.schema_migrations
    WHERE applied_at IS NULL;

    IF v_bad > 0 THEN
        RAISE EXCEPTION
            'Migration registry integrity: % row(s) have NULL applied_at. '
            'applied_at must never be NULL — it is set by DEFAULT now() on commit.',
            v_bad;
    END IF;


    -- ── 4. No NULL or blank applied_by ──────────────────────────────────────
    SELECT count(*) INTO v_bad
    FROM catms.schema_migrations
    WHERE applied_by IS NULL
       OR trim(applied_by) = '';

    IF v_bad > 0 THEN
        RAISE EXCEPTION
            'Migration registry integrity: % row(s) have NULL/blank applied_by. '
            'applied_by must record the database role that ran the migration.',
            v_bad;
    END IF;


    -- ── 5. Baseline migrations 001 / 002 / 003 must be present ─────────────
    SELECT count(*) INTO v_count
    FROM catms.schema_migrations
    WHERE version IN (1, 2, 3);

    IF v_count <> 3 THEN
        RAISE EXCEPTION
            'Baseline migrations missing: expected versions 1, 2, 3 in '
            'catms.schema_migrations, found only % of 3. '
            'Run scripts/migrate.sh to apply all pending migrations.',
            v_count;
    END IF;


    -- ── 6. applied_at must be non-decreasing when ordered by version ────────
    -- A later version must not have been applied before an earlier one.
    -- We allow equal timestamps (same-second batch apply is fine).
    SELECT count(*) INTO v_out_of_order
    FROM (
        SELECT version,
               applied_at,
               lag(applied_at) OVER (ORDER BY version) AS prev_at
        FROM catms.schema_migrations
    ) ranked
    WHERE prev_at IS NOT NULL
      AND applied_at < prev_at;

    IF v_out_of_order > 0 THEN
        RAISE EXCEPTION
            'Migration registry ordering: % version(s) have an applied_at '
            'timestamp earlier than the previous version. '
            'Migrations must be applied in strict ascending order.',
            v_out_of_order;
    END IF;


    RAISE NOTICE 'Migration registry OK — % total migration(s) recorded.',
        (SELECT count(*) FROM catms.schema_migrations);

END;
$$;

-- Read-only assertions only — roll back so nothing changes.
ROLLBACK;
