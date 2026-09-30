# database/

This directory contains every artefact that touches PostgreSQL directly.
**Dev1 owns the runner, extensions, base schema, and migration ranges 001–019 and 060–089.**
All other developers work inside their reserved migration number ranges.

---

## Directory Layout

```
database/
├── migrations/         ← Ordered forward-only SQL files (NNN_description.sql)
├── tests/
│   ├── schema/         ← PK / FK / UQ / CHECK / column / comment tests
│   └── rules/          ← Business rule, concurrency and induced-failure tests
├── seeds/
│   ├── tiny/           ← Fast deterministic CI fixture (runs in < 5 s)
│   ├── bulk/           ← Realistic fixed-seed demo dataset (fixed random seed)
│   └── golden/         ← Named demo journey + known expected report values
├── import/
│   ├── templates/      ← CSV column templates for approved bulk loads
│   └── examples/       ← Fictional example CSVs only — NO real patient data
└── README.md           ← This file
```

---

## Migration Rules (Non-Negotiable)

| Rule | Detail |
|---|---|
| **Claim your number first** | Reserve the next number in the GitHub project board before creating the file |
| **One responsibility** | One migration = one coherent schema change |
| **Forward-only** | Migrations apply forward; destructive rollback is not required |
| **Never edit after merge** | If a merged migration is wrong, add a new corrective migration |
| **Cross-module FKs** | Owned by the consuming module; reviewed by the FK producer |
| **CI always replays from zero** | Every PR applies all migrations to an empty database |
| **COMMENT ON everything** | Every table and important column must have a `COMMENT ON` statement |

## Migration Number Ranges

| Range | Owner | Purpose |
|---|---|---|
| `001–019` | Dev1 | Extensions, schemas, migration metadata, base roles, platform functions |
| `020–039` | Dev2 | Branch / staff / access tables, procedures and grants |
| `040–059` | Dev3 | Patient / insurance-term tables and procedures |
| `060–089` | Dev1 | Doctor availability, appointments, exclusion rule, audit histories |
| `090–109` | Dev4 | Clinical notes, treatments, invoices |
| `110–129` | Dev3 | Insurance claims, claim lines, histories, approval procedures |
| `130–139` | Dev4 | Patient / insurer payments, claim links, caps, reversals |
| `140–159` | Dev5 | Reporting objects, report indexes, controlled import support |
| `160+`    | Dev1 + affected owner | Cross-module integration / corrections only |

## Migration File Naming

```
NNN_verb_noun.sql

Examples:
  001_extensions_and_schemas.sql
  002_migration_metadata.sql
  003_base_roles_and_grants.sql
  020_branch_and_employee.sql
  060_doctor_availability.sql
```

## Test Conventions

- **`database/tests/schema/`** — assert PK, FK, UQ, CHECK, delete actions, column types, `COMMENT ON` presence, migration order.
- **`database/tests/rules/`** — assert valid inserts succeed, invalid inserts fail with expected SQLSTATE, boundary cases, direct bypass attempts, two-session concurrency, induced failure + rollback, immutable history rejection.

## Seed Conventions

- All seeds use **fictional Sri Lankan names and data only**.
- `tiny/` seeds must be deterministic and idempotent — used in CI.
- `bulk/` seeds use a fixed random seed and a fixed date anchor so report values are reproducible.
- `golden/` seeds describe named journeys with known expected report totals.
- Never commit real patient data in any form.
