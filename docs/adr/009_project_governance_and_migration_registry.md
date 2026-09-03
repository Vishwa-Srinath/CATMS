# ADR-009: Project Governance, Migration Registry, and Contribution Rules

* **Date:** 2026-09-03
* **Status:** Accepted
* **Deciders:** Dev1 (Lead/Scheduling), Dev2 (Staff/Access), Dev3 (Patient/Claims), Dev4 (Clinical/Billing), Dev5 (Reports/Data)
* **CATMS Issue:** `CATMS-009`

---

## Context

With five developers building database migrations, Express API modules, and React frontend features concurrently, clear governance rules are needed to prevent migration number collisions, enforce code ownership, standardize pull requests, and maintain traceability back to software requirements.

---

## Decision

### 1. Reserved Migration Ranges

Migration sequence numbers are strictly assigned by module ownership to eliminate sequence collisions:

| Migration Range | Owner | Domain / Area |
|---|---|---|
| `001–019` | **Dev1** | Database extensions (`btree_gist`, `citext`), schemas, migration metadata, base roles, pool/transaction functions |
| `020–039` | **Dev2** | Branch, employee, staff assignment, manager assignment, doctor profile, specialty, user accounts, app roles, audit events |
| `040–059` | **Dev3** | Patient master, identity types, emergency contacts, insurance providers, policies, coverage terms |
| `060–089` | **Dev1** | Doctor availability, availability exceptions, appointment master, GiST exclusion constraint, schedule/status audit logs |
| `090–109` | **Dev4** | Consultation notes, note revisions, treatment categories, treatment catalogue, appointment treatments, invoice header & lines |
| `110–129` | **Dev3** | Insurance claims, claim lines, claim status log, claim eligibility & allocation procedures |
| `130–139` | **Dev4** | Payment transactions, payment reversals, payer caps, financial reconciliation procedures |
| `140–159` | **Dev5** | Report views (R1–R5), report indexes, controlled CSV import utilities |
| `160+` | **Dev1 + Owner** | Cross-module integration, final release fixes |

#### Migration Rules
* **Claim Before Creating:** Developers must claim their migration number on the project board before creating the `.sql` file.
* **Forward-Only Migrations:** Never edit a merged migration file. Any schema change requires a new corrective migration file.
* **Transaction Wrapping:** Every migration script must be wrapped in `BEGIN; ... COMMIT;`.

---

### 2. Git & GitHub Workflow Standards

* **Protected `main` Branch:** Direct pushes to `main` are disabled. All changes enter `main` via reviewed Pull Requests from `develop`.
* **Branch Naming:** `feature/<module-letter>-<short-description>` (e.g., `feature/c-appointment-exclusion`, `feature/d-payment-procedure`).
* **Conventional Commits:** Commit messages must follow `type(scope): message`:
  * Types: `feat`, `fix`, `test`, `docs`, `chore`, `perf`, `refactor`.
  * Scopes: `db-a`, `db-b`, `db-c`, `db-d`, `db-e`, `api-a`, `api-b`, `api-c`, `api-d`, `api-e`, `ui-a`, `ui-b`, `ui-c`, `ui-d`, `ui-e`, `infra`, `ci`.

---

### 3. Pull Request & Verification Rules

Every Pull Request must satisfy:
1. **Traceability:** Explicitly link the CATMS issue ID (e.g. `CATMS-029`) and SRS requirements.
2. **Reviewers:** At least one non-author developer review. Cross-module PRs require approval from both affected owners.
3. **CI Pass:** GitHub Actions build, lint, and clean-migration smoke test must pass.
4. **Empirical Evidence:** PR description must include stdout or screenshot evidence of:
   * One **success case** (happy path working cleanly).
   * One **failure case** (business rule / validation rejection working as designed).

---

## Consequences

* **Positive:** Eliminates git merge conflicts on migration filenames and ensures all team contributions are verified against business requirements.
* **Negative:** Requires team members to maintain strict PR discipline and submit evidence with every change.
