# CATMS — Codebase Structure & Standards Guide

**Who this is for:** Every team member — Dev1 through Dev5  
**Rule:** Follow this structure exactly. Do not create files or folders outside these boundaries without Dev1 sign-off.

> **Navigation:** Start at [`docs/README.md`](./README.md) if you are new to the project.  
> **What to build:** `docs/member_plan.md`  
> **What issues to track:** `docs/CATMS_Complete_GitHub_Issue_Backlog.md`  
> **UI/UX rules:** `docs/CATMS_Design_System.md`

---

## 1. Architecture

```
Browser (React + Vite + TypeScript)
         │  HTTP/JSON  │  HttpOnly cookie
         ▼
Express REST API  (Node.js 20 + TypeScript)
  ├─ Zod validation
  ├─ JWT + CSRF middleware
  ├─ API role guards (RBAC)
  └─ SET LOCAL ROLE per DB transaction
         │  Parameterized SQL only — no ORM
         ▼
PostgreSQL 16
  ├─ Tables, FKs, CHECK constraints
  ├─ GiST exclusion constraint (overlap prevention)
  ├─ Stored procedures & triggers
  ├─ Immutable audit histories
  └─ Reporting views / functions
```

**The database is the authority for every business rule.**  
The API is a thin, secure transport layer.  
The frontend is a role-gated QA and demo interface.

---

## 2. Required Folder Structure

Every member must create their files **inside** the paths shown below.  
This is the structure Dev1 sets up under CATMS-010.

```
CATMS/
│
├── database/
│   ├── migrations/          ← Numbered forward-only SQL files
│   ├── tests/
│   │   ├── schema/          ← PK/FK/UQ/CHECK/column tests
│   │   └── rules/           ← Business rule + concurrency tests
│   ├── seeds/
│   │   ├── tiny/            ← Fast deterministic CI fixture
│   │   ├── bulk/            ← Realistic fixed-seed demo data
│   │   └── golden/          ← Named demo journey + expected totals
│   ├── import/
│   │   ├── templates/       ← CSV templates for approved loads
│   │   └── examples/        ← Fictional example CSVs only
│   └── README.md
│
├── backend/
│   ├── src/
│   │   ├── app/             ← Express bootstrap + shared middleware   (Dev1)
│   │   │   └── middleware/  ← auth, rbac, csrf, errorHandler, correlationId
│   │   ├── db/              ← Pool, transaction helper, role switcher (Dev1)
│   │   ├── modules/         ← One folder per domain module
│   │   │   ├── auth-staff/            (Dev2)
│   │   │   ├── patients-insurance/    (Dev3)
│   │   │   ├── appointments/          (Dev1)
│   │   │   ├── clinical-billing/      (Dev4)
│   │   │   ├── claims/                (Dev3)
│   │   │   ├── payments/              (Dev4)
│   │   │   └── reports-import/        (Dev5)
│   │   ├── contracts/       ← TypeScript DTOs, one file per module
│   │   └── shared/          ← Errors, logger, utility functions
│   └── tests/               ← Supertest integration tests (one file per module)
│
├── frontend/
│   └── src/
│       ├── app/             ← Query client, router, session hook      (Dev1)
│       ├── api/             ← Typed API client, one file per module   (Dev1)
│       ├── features/        ← Domain feature folders (module owner)
│       │   ├── administration/        (Dev2)
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   └── index.ts
│       │   ├── patients-insurance/    (Dev3)
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   └── index.ts
│       │   ├── appointments/          (Dev1)
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   └── index.ts
│       │   ├── clinical-billing/      (Dev4)
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   └── index.ts
│       │   └── reports/               (Dev5)
│       │       ├── components/
│       │       ├── hooks/
│       │       └── index.ts
│       ├── components/      ← Shared UI primitives — LOCKED
│       │   ├── AppShell.tsx           ← sidebar, nav, portal theming
│       │   ├── ToastRegion.tsx        ← global toast notifications
│       │   └── ui.tsx                 ← Button, Badge, Modal, etc.
│       ├── pages/           ← Thin compositions — import from features/
│       │   ├── LoginPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── PatientsPage.tsx
│       │   ├── AppointmentsPage.tsx
│       │   ├── ClinicalPage.tsx
│       │   ├── FinancePage.tsx        ← Dev3 (claims) + Dev4 (payments)
│       │   ├── ReportsPage.tsx
│       │   ├── AdministrationPage.tsx
│       │   └── NotFoundPage.tsx
│       ├── context/
│       │   └── ClinicContext.tsx      ← session/UI state only, no business logic
│       └── types.ts                   ← shared TypeScript types
│
├── infra/
│   ├── compose.yaml         ← dev environment (PostgreSQL + API + web)
│   ├── compose.test.yaml    ← disposable test environment (tmpfs)
│   └── docker/
│       ├── postgres/
│       └── api/
│
├── scripts/                 ← Dev1 owns all scripts
│   ├── start.sh             ← Start all services
│   ├── reset.sh             ← Wipe DB and reload tiny fixture
│   ├── test.sh              ← Run all test layers
│   ├── backup.sh            ← Dump DB to encrypted local file
│   ├── restore.sh           ← Restore from dump
│   ├── import.sh            ← Controlled CSV bulk import
│   └── verify.sh            ← Smoke-test a running environment
│
├── docs/
│   ├── README.md                                ← START HERE (team navigation hub)
│   ├── CODEBASE_GUIDE.md                        ← This file (structure & standards)
│   ├── member_plan.md                           ← Per-developer task plans
│   ├── CATMS_Complete_GitHub_Issue_Backlog.md   ← All 85 issues with dependencies
│   ├── CATMS_Design_System.md                   ← UI/UX specification
│   ├── CATMS_SRS_new.pdf                        ← Requirements authority
│   ├── CATMS_Production_Implementation_ERD.drawio
│   ├── CATMS_Delivery_Plan.html
│   └── adr/                ← Architecture Decision Records (created during G0)
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── nightly.yml
│   ├── pull_request_template.md
│   └── CODEOWNERS
│
└── README.md
```

---

## 3. Module Ownership

Do not touch another developer's folder without their review.

| Layer / Area | Owner | Paths |
|---|---|---|
| Platform, infra, CI, release | **Dev1** | `infra/`, `scripts/`, `backend/src/app/`, `backend/src/db/`, `frontend/src/app/`, `frontend/src/api/` |
| Appointments & scheduling | **Dev1** | `database/migrations/060–089`, `backend/src/modules/appointments/`, `frontend/src/features/appointments/` |
| Branch, staff, doctor, auth/RBAC | **Dev2** | `database/migrations/020–039`, `backend/src/modules/auth-staff/`, `frontend/src/features/administration/` |
| Patient, insurance, claims | **Dev3** | `database/migrations/040–059` & `110–129`, `backend/src/modules/patients-insurance/`, `backend/src/modules/claims/`, `frontend/src/features/patients-insurance/` |
| Clinical, treatments, invoices, payments | **Dev4** | `database/migrations/090–109` & `130–139`, `backend/src/modules/clinical-billing/`, `backend/src/modules/payments/`, `frontend/src/features/clinical-billing/` |
| Reports, data, import | **Dev5** | `database/migrations/140–159`, `backend/src/modules/reports-import/`, `frontend/src/features/reports/` |

---

## 4. Migration File Naming & Template

```
NNN_short_description.sql
```

- `NNN` = three-digit number from your assigned range (§3 above).
- **Claim your number on the team board before creating the file.**
- Always wrap in `BEGIN` / `COMMIT`.
- Every table and column must have a `COMMENT ON` statement.
- Never modify a merged migration — add a corrective one instead.

```sql
-- NNN_description.sql
-- Owner: DevX  |  Issue: CATMS-XXX  |  Depends on: NNN-1

BEGIN;

CREATE TABLE example (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT   NOT NULL
);

COMMENT ON TABLE  example      IS 'Short description.';
COMMENT ON COLUMN example.id   IS 'Surrogate key.';
COMMENT ON COLUMN example.name IS 'Human-readable label.';

INSERT INTO schema_migrations (version, description)
VALUES (NNN, 'short description');

COMMIT;
```

---

## 5. Each Module's Files (Standard Pattern)

**Backend** — `backend/src/modules/<module>/` must contain:

```
<module>.routes.ts    ← Express router, auth/rbac guards, request/response
<module>.service.ts   ← DB calls via withTransaction(), business orchestration
<module>.schema.ts    ← Zod input validation schemas
```

> **Note on test placement:** Supertest integration tests live in `backend/tests/<module>.test.ts` — a single flat `tests/` folder that is a sibling to `src/`, not inside the module folder. This matches the `backend/` folder tree above and `member_plan.md §4`.

**Frontend** — `frontend/src/features/<module>/` must contain:

```
components/           ← UI components for this feature only
hooks/                ← TanStack Query hooks (useQuery, useMutation)
index.ts              ← Re-exports everything used by pages/
```

---

## 6. API Contract Standard

**URL prefix:** `/api/v1/<resource>`

**Success:**
```json
{ "data": {}, "meta": { "correlationId": "uuid" } }
```

**Error:**
```json
{
  "error": {
    "code": "APPOINTMENT_OVERLAP",
    "message": "The doctor already has an appointment in that time range.",
    "fieldErrors": []
  },
  "meta": { "correlationId": "uuid" }
}
```

**Non-negotiable:**
- Every state-changing route uses `withTransaction()`.
- `SET LOCAL ROLE` inside the transaction, never on the pool connection.
- Zod validates all inputs before any DB call.
- Never accept `total`, `amount_paid`, `status`, or audit timestamps from the browser.
- Raw SQL errors and stack traces must never reach the client.

---

## 7. Frontend Rules

- **`pages/`** files are thin compositions — they import from `features/`, not the other way.
- All logic, hooks, and components live inside `features/<module>/`.
- Every data-fetching component handles: `loading` · `empty` · `success` · `error` · `forbidden`.
- All values displayed to the user (totals, status, balances) must come from the API — never calculated in React.
- Disabled actions must show a tooltip naming the rule that is blocking them.
- Shared `components/` is **locked** — no changes without Dev1 + affected owner review.

---

## 8. Naming Conventions

### SQL
```sql
-- Tables: singular, snake_case
appointment,  invoice_line,  insurance_claim

-- Columns: snake_case
start_at,  created_by,  unit_price_at_time

-- Procedures: verb_noun
book_appointment(),  resolve_claim(),  post_payment()

-- Views: v_ prefix
v_daily_appointment_summary

-- Indexes: idx_table_columns
idx_appointment_doctor_time
```

### TypeScript
```
Files:      kebab-case       →  appointments.routes.ts,  use-appointments.ts
Types:      PascalCase       →  Appointment,  AppointmentStatus
Functions:  camelCase        →  bookAppointment(),  useAppointments()
Constants:  SCREAMING_SNAKE  →  MAX_DURATION_MIN
```

### Git commits (Conventional Commits — mandatory)
```
feat(db-c): add appointment overlap exclusion constraint
feat(api-b): add claim eligibility endpoint
test(db-d): prove payment rollback on cap violation
fix(ui-a): show disabled state on branch limit
docs(adr): record JWT session strategy
```

Scopes: `db-a` `db-b` `db-c` `db-d` `db-e` · `api-a` `api-b` `api-c` `api-d` `api-e` · `ui-a` `ui-b` `ui-c` `ui-d` `ui-e` · `infra` `ci` `docs`

### Branch naming
```
feature/c-appointment-exclusion
feature/a-role-grants
feature/b-claim-allocation
feature/d-payment-procedure
feature/e-report-views
fix/c-walk-in-status-bug
```

---

## 9. Database Conventions (Non-Negotiable)

| Rule | Value |
|---|---|
| All physical names | `snake_case` |
| Primary keys | `BIGINT GENERATED ALWAYS AS IDENTITY` |
| Money | `NUMERIC(12,2)`, currency always `LKR` |
| Timestamps | `TIMESTAMPTZ` stored UTC; convert to `Asia/Colombo` only in reports |
| Case-insensitive IDs (NIC, licence) | `citext` extension |
| FK delete actions | Explicit on every FK; financial/audit default to `RESTRICT` |
| Business rules location | PostgreSQL only — not in Express or React |
| SQL access | `node-postgres (pg)` — parameterized SQL only, no ORM |

---

## 10. Adding a Feature — Step-by-Step Checklist

Do these in order for every feature branch:

- [ ] Claim migration number from your range on the team board
- [ ] Write `database/migrations/NNN_description.sql` (with `COMMENT ON` everything)
- [ ] Add direct SQL tests in `database/tests/rules/` — valid, invalid, boundary, direct bypass
- [ ] Write `backend/src/modules/<module>/<module>.service.ts` using `withTransaction()`
- [ ] Write `backend/src/modules/<module>/<module>.schema.ts` (Zod)
- [ ] Write `backend/src/modules/<module>/<module>.routes.ts` (with auth + rbac middleware)
- [ ] Add DTO types to `backend/src/contracts/<module>.contract.ts`
- [ ] Write `backend/tests/<module>.test.ts` (Supertest integration tests)
- [ ] Add typed API call to `frontend/src/api/<module>.api.ts`
- [ ] Add hooks in `frontend/src/features/<module>/hooks/`
- [ ] Build component in `frontend/src/features/<module>/components/`
- [ ] Export from `frontend/src/features/<module>/index.ts`
- [ ] Import into the relevant `frontend/src/pages/` file
- [ ] Open PR with: CATMS-XXX key · REQ IDs · test commands · success case + failure case

---

## 11. Pull Request Rules

Every PR description must contain:

1. CATMS issue key (e.g. `CATMS-029`)
2. SRS requirement IDs (e.g. `REQ-14`, `BR-03`)
3. Exact commands to run to verify
4. One **success case** (pasted output or screenshot)
5. One **failure case** (pasted output or screenshot)

Other rules:
- One PR = one coherent thing — no formatting changes mixed with features
- Cross-module PR requires both affected owners as reviewers
- CI must pass before merge
- Squash merge into `develop` only

---

## 12. The Rules Everyone Must Know

1. **Database first.** Write the SQL rule before the API route.
2. **No business logic in React.** If it can be wrong, it belongs in PostgreSQL.
3. **Never edit a merged migration.** Add a corrective one instead.
4. **Claim your migration number** before creating the file.
5. **Publish your fixture and contract before the consumer merges** dependent work.
6. **One PR = one coherent thing.** No formatting mixed with features.
7. **Both success and failure cases in every PR description.**
8. **Rebase feature branches onto `develop`** — never merge `develop` into your branch.
9. **Squash merge into `develop`** only — keeps history clean.
10. **No real patient data.** Ever. Fictional data only in this repository.

---

*Synced with: `docs/README.md` · `docs/member_plan.md` · `docs/CATMS_Complete_GitHub_Issue_Backlog.md` · `docs/CATMS_Design_System.md`*
