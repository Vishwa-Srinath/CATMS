# CATMS Database Test Harness

**Issue:** CATMS-022 · **Owner:** Dev1 · **Reviewer:** Dev4

This directory contains the automated database test suite that validates every
migration's structure and business rules against a disposable PostgreSQL
instance. Tests run on every PR via GitHub Actions and locally via
`scripts/test.sh`.

---

## Directory Structure

```
database/
└── tests/
    ├── README.md              ← this file
    ├── schema/                ← structural assertions (DDL correctness)
    │   ├── 000_migration_registry.sql   ← meta-test: registry integrity
    │   ├── 020_branch_employee_schema.sql
    │   ├── 021_assignments_schema.sql
    │   └── ...
    └── rules/                 ← business-rule assertions (DML behaviour)
        ├── 020_branch_employee_rules.sql
        ├── 021_assignments_rules.sql
        └── ...
```

---

## Two Kinds of Tests

### Schema Tests (`database/tests/schema/`)

**What they test:** Is the DDL correct?

- Table / column existence
- Primary keys, unique constraints, check constraints
- Foreign key delete actions (`RESTRICT`, `CASCADE`, `SET NULL`)
- `COMMENT ON` presence (required by the project standard)
- Extension installation (`btree_gist`, `citext`)
- Migration registry integrity (`000_migration_registry.sql`)

**How they work:**
Every file is a plain SQL script that runs `DO $$ ... END; $$;` blocks
containing assertions. A failed assertion raises an exception using
`RAISE EXCEPTION '...'`, which causes `psql` with `-v ON_ERROR_STOP=1` to
return a non-zero exit code, failing the test.

Schema tests are **read-only** — they only query `information_schema`,
`pg_catalog` views, and the `catms.*` tables. The last statement in every
schema test should be `ROLLBACK;` to make this explicit.

**Template:**

```sql
-- NNN_my_feature_schema.sql
-- Owner: DevX  |  Issue: CATMS-NNN
BEGIN;
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Table existence
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'catms' AND table_name = 'my_table';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'my_table does not exist in catms schema';
    END IF;

    -- Primary key
    SELECT count(*) INTO v_count
    FROM information_schema.table_constraints
    WHERE table_schema   = 'catms'
      AND table_name     = 'my_table'
      AND constraint_type = 'PRIMARY KEY';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'pk_my_table not found';
    END IF;

    RAISE NOTICE 'my_feature schema OK';
END;
$$;
ROLLBACK;
```

---

### Rules Tests (`database/tests/rules/`)

**What they test:** Do the business rules enforce correctly?

- Valid `INSERT` / `UPDATE` / `DELETE` operations succeed
- Invalid operations are rejected by constraints, triggers or stored procedures
- Edge cases: boundary values, NULL handling, concurrency scenarios
- Stored procedure atomic rollback (partial rows must not survive a failure)

**How they work:**
Rules tests perform real DML inside a `BEGIN` / `ROLLBACK` block so the
disposable test database stays clean between files. Each assertion typically:

1. Inserts prerequisite rows.
2. Attempts the operation being tested.
3. Asserts the outcome using `RAISE EXCEPTION` if it is wrong.
4. Rolls back so the next test starts from a clean state.

**Template:**

```sql
-- NNN_my_feature_rules.sql
-- Owner: DevX  |  Issue: CATMS-NNN
BEGIN;

DO $$
BEGIN
    -- ── 1. Valid insert succeeds ────────────────────────────────────────────
    INSERT INTO catms.my_table (col1, col2) VALUES ('a', 'b');
    -- No exception means it passed.

    -- ── 2. Duplicate must fail ──────────────────────────────────────────────
    BEGIN
        INSERT INTO catms.my_table (col1, col2) VALUES ('a', 'b'); -- duplicate
        RAISE EXCEPTION 'Expected unique violation — should not reach here';
    EXCEPTION
        WHEN unique_violation THEN NULL; -- expected
    END;

    RAISE NOTICE 'my_feature rules OK';
END;
$$;

ROLLBACK; -- Discard all test data
```

---

## Naming Convention

| Component       | Pattern                        | Example                             |
|-----------------|--------------------------------|-------------------------------------|
| Schema test     | `NNN_<feature>_schema.sql`     | `020_branch_employee_schema.sql`    |
| Rules test      | `NNN_<feature>_rules.sql`      | `020_branch_employee_rules.sql`     |
| NNN prefix      | Matches the migration number   | `020` for migration `020_*.sql`     |
| Meta-test       | `000_migration_registry.sql`   | Always runs first (sort order)      |

**Rules:**
- `NNN` must exactly match the leading digits of the corresponding migration
  file so the test clearly traces to its migration.
- Use snake_case for the feature segment.
- One test file per migration file (one schema file + one rules file).

---

## How to Run Tests Locally

### Full suite (all layers)
```bash
./scripts/test.sh
```

### Schema tests only
```bash
./scripts/test.sh --layer schema
```

### Rules tests only
```bash
./scripts/test.sh --layer rules
```

### API and frontend tests only
```bash
./scripts/test.sh --layer api
./scripts/test.sh --layer frontend
```

`scripts/test.sh` automatically:
1. Pulls and starts a disposable PostgreSQL on port `5433` (tmpfs, no disk writes).
2. Runs `scripts/migrate.sh --test` to apply all migrations to a clean DB.
3. Executes the selected test layers in numeric file order.
4. Tears down the container regardless of outcome.

**Prerequisites:**
- Docker and `docker compose` installed and running
- `psql` client in PATH (`sudo apt install postgresql-client`)
- Node.js 20+ for `api` and `frontend` layers

---

## How CI Runs Tests

The `.github/workflows/ci.yml` `migration-smoke` job runs inside GitHub
Actions:

1. Starts a tmpfs PostgreSQL container.
2. Applies all migrations via `bash -x scripts/migrate.sh --test`.
3. Verifies migration count, extensions, roles, and idempotency.
4. Runs every file in `database/tests/schema/` and `database/tests/rules/`
   using `psql -v ON_ERROR_STOP=1`.
5. Tears down the container.

Any `RAISE EXCEPTION` in any test file causes the CI job to fail and the PR
cannot be merged.

---

## Adding Tests for a New Migration

When you write migration `NNN_my_feature.sql`, you **must** also add:

1. `database/tests/schema/NNN_my_feature_schema.sql`
   — asserts every table, column, constraint, and comment your migration creates.

2. `database/tests/rules/NNN_my_feature_rules.sql`
   — asserts every business rule your migration enforces.

The CI schema/rules step will automatically pick them up on the next PR because
the runner uses a `*.sql` glob sorted by `sort -V`.

---

## Shared Test Helpers

There are currently no shared helper functions (pure SQL has limited
reusability). Common patterns to copy-paste:

### Assert a constraint exists
```sql
SELECT count(*) INTO v_count
FROM information_schema.table_constraints
WHERE table_schema    = 'catms'
  AND table_name      = '<table>'
  AND constraint_type = '<PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY>'
  AND constraint_name = '<name>';
IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected constraint <name> not found';
END IF;
```

### Assert a column exists with a specific type
```sql
SELECT count(*) INTO v_count
FROM information_schema.columns
WHERE table_schema = 'catms'
  AND table_name   = '<table>'
  AND column_name  = '<column>'
  AND data_type    = '<type>';
IF v_count <> 1 THEN
    RAISE EXCEPTION 'Column <table>.<column> not found or wrong type';
END IF;
```

### Assert a COMMENT ON exists
```sql
SELECT count(*) INTO v_count
FROM pg_description d
JOIN pg_class      c ON c.oid = d.objoid
JOIN pg_namespace  n ON n.oid = c.relnamespace
WHERE n.nspname = 'catms'
  AND c.relname = '<table>'
  AND d.objsubid = 0;   -- 0 = table comment; use column ordinal for column comments
IF v_count <> 1 THEN
    RAISE EXCEPTION 'COMMENT ON TABLE catms.<table> missing';
END IF;
```

### Catch an expected violation
```sql
BEGIN
    INSERT INTO catms.<table> (...) VALUES (...); -- should fail
    RAISE EXCEPTION 'Expected <violation> — insert should have been rejected';
EXCEPTION
    WHEN <unique_violation|not_null_violation|check_violation|foreign_key_violation> THEN NULL;
END;
```
