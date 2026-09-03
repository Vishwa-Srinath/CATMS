# CATMS — Codebase Structure & Standards Guide

**Clinic Appointment and Treatment Management System**  
**Who this is for:** Every team member — Dev1 through Dev5  
**Rule:** Follow this structure exactly. Do not create files or folders outside these boundaries without Dev1 sign-off.

> **Companion docs:**
> - Requirements → `docs/CATMS_SRS_new.pdf`
> - What to build & who owns what → `docs/member_plan.md`
> - What issues to track → `docs/CATMS_Complete_GitHub_Issue_Backlog.md`
> - UI/UX rules → `docs/CATMS_Design_System.md`

---

## 1. Architecture in One Picture

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
  ├─ GiST exclusion (overlap prevention)
  ├─ Stored procedures & triggers
  ├─ Immutable audit histories
  └─ Reporting views / functions
```

**The database is the authority for every business rule.**  
The API is a thin, secure transport layer.  
The frontend is a role-gated QA/demo interface.

---

## 2. Required Folder Structure

Every member must create their files **inside** the paths shown below. This is the structure to set up in the repo (CATMS-010).

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
│   └── src/
│       ├── app/             ← Express bootstrap + shared middleware (Dev1)
│       │   └── middleware/  ← auth, rbac, csrf, errorHandler, correlationId
│       ├── db/              ← Pool, transaction helper, role switcher (Dev1)
│       ├── modules/         ← One folder per domain module
│       │   ├── auth-staff/          (Dev2)
│       │   ├── patients-insurance/  (Dev3)
│       │   ├── appointments/        (Dev1)
│       │   ├── clinical-billing/    (Dev4)
│       │   ├── claims/              (Dev3)
│       │   ├── payments/            (Dev4)
│       │   └── reports-import/      (Dev5)
│       ├── contracts/       ← TypeScript DTOs, one file per module
│       └── shared/          ← Errors, logger, utility functions
│
├── frontend/
│   └── src/
│       ├── app/             ← Query client, router, session hook (Dev1)
│       ├── api/             ← Typed API client, one file per module (Dev1)
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
│       ├── components/      ← Shared UI primitives — LOCKED, no edits without Dev1
│       │   ├── AppShell.tsx
│       │   ├── ToastRegion.tsx
│       │   └── ui.tsx
│       ├── pages/           ← Thin compositions, import from features/
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
│       │   └── ClinicContext.tsx      ← Session/UI state only (no business logic)
│       └── types.ts                   ← Shared TypeScript types
│
├── infra/
│   ├── compose.yaml         ← Dev environment (PostgreSQL + API + web)
│   ├── compose.test.yaml    ← Disposable test environment (tmpfs, no volume)
│   └── docker/
│       ├── postgres/
│       └── api/
│
├── scripts/                 ← Dev1 owns all scripts
│   ├── start.sh
│   ├── reset.sh
│   ├── backup.sh
│   ├── restore.sh
│   ├── test.sh
│   └── import.sh
│
├── docs/
│   ├── adr/                 ← Architecture Decision Records
│   ├── api/                 ← API contract examples per module
│   ├── evidence/            ← Generated locally, never committed
│   ├── runbooks/            ← Operational recovery guides
│   ├── CATMS_Design_System.md
│   ├── member_plan.md
│   ├── CATMS_Complete_GitHub_Issue_Backlog.md
│   ├── CODEBASE_GUIDE.md    ← This file
│   └── CATMS_SRS_new.pdf
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

| Layer / Area | Owner | Folders |
|---|---|---|
| Platform, infra, CI, release | **Dev1** | `infra/`, `scripts/`, `backend/src/app/`, `backend/src/db/`, `frontend/src/app/`, `frontend/src/api/` |
| Appointments & scheduling | **Dev1** | `database/migrations/060–089`, `backend/src/modules/appointments/`, `frontend/src/features/appointments/` |
| Branch, staff, doctor, auth/RBAC | **Dev2** | `database/migrations/020–039`, `backend/src/modules/auth-staff/`, `frontend/src/features/administration/` |
| Patient, insurance, claims | **Dev3** | `database/migrations/040–059` & `110–129`, `backend/src/modules/patients-insurance/`, `backend/src/modules/claims/`, `frontend/src/features/patients-insurance/` |
| Clinical, treatments, invoices, payments | **Dev4** | `database/migrations/090–109` & `130–139`, `backend/src/modules/clinical-billing/`, `backend/src/modules/payments/`, `frontend/src/features/clinical-billing/` |
| Reports, data, import | **Dev5** | `database/migrations/140–159`, `backend/src/modules/reports-import/`, `frontend/src/features/reports/` |

---

## 4. Each Module's Files (Standard Pattern)

Every `backend/src/modules/<module>/` folder must contain exactly these files:

```
<module>.routes.ts    ← Express router, auth/rbac guards, request/response
<module>.service.ts   ← DB calls via withTransaction(), business orchestration
<module>.schema.ts    ← Zod input validation schemas
<module>.test.ts      ← Supertest integration tests
```

Every `frontend/src/features/<module>/` folder must contain:

```
components/           ← UI components for this feature only
hooks/                ← TanStack Query hooks (useQuery, useMutation)
index.ts              ← Re-export everything used by pages/
```

---

## 5. Migration File Naming

```
NNN_short_description.sql
```

- `NNN` = three-digit number from your assigned range (§3 above).
- **Claim your number on the team board before creating the file.**
- Always wrap in `BEGIN` / `COMMIT`.
- Every table and column must have a `COMMENT ON ...` statement.
- Never modify a merged migration — add a corrective one instead.

### Migration file template

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

## 6. API Contract (All Routes Must Follow This)

**URL pattern:**
```
/api/v1/auth/*
/api/v1/branches/*       /api/v1/staff/*
/api/v1/patients/*       /api/v1/insurance/*
/api/v1/appointments/*
/api/v1/clinical/*       /api/v1/invoices/*
/api/v1/claims/*         /api/v1/payments/*
/api/v1/reports/*        /api/v1/imports/*
```

**Success response:**
```json
{ "data": {}, "meta": { "correlationId": "uuid" } }
```

**Error response:**
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

**Non-negotiable rules:**
- Every state-changing route uses `withTransaction()`.
- Never accept `total`, `amount_paid`, `status`, or audit fields from the browser.
- Never log clinical data, passwords, tokens, or cookie values.
- Raw SQL errors, stack traces, and hashes must never reach the client.

---

## 7. Frontend Rules

- **`pages/`** files are thin compositions only — they import from `features/`.
- All logic, hooks, and components live inside `features/<module>/`.
- Every data-fetching component must handle: `loading`, `empty`, `success`, `error`, `forbidden`.
- All values displayed to the user (totals, status, balances) must come from the API — never calculated in React.
- Disabled actions must show a tooltip naming the rule blocking them.
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

-- Indexes: idx_table_column
idx_appointment_doctor_time
```

### TypeScript (backend + frontend)

```
Files:        kebab-case         →  appointments.routes.ts,  use-appointments.ts
Types:        PascalCase         →  Appointment,  AppointmentStatus
Functions:    camelCase          →  bookAppointment(),  useAppointments()
Constants:    SCREAMING_SNAKE    →  MAX_DURATION_MIN
```

### Git commits (Conventional Commits — mandatory)

```
feat(db-c): add appointment overlap exclusion constraint
feat(api-b): add claim eligibility endpoint
test(db-d): prove payment rollback on cap violation
fix(ui-a): show disabled state on branch limit
docs(adr): record JWT session strategy
```

Scopes: `db-a`, `db-b`, `db-c`, `db-d`, `db-e` | `api-a/b/c/d/e` | `ui-a/b/c/d/e` | `infra` | `ci` | `docs`

### Branches

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
| Timestamps | `TIMESTAMPTZ` stored in UTC; convert to `Asia/Colombo` only in reports |
| Case-insensitive identifiers (NIC, licence) | `citext` extension |
| FK delete actions | Explicit on every FK; financial/audit default to `RESTRICT` |
| Business rules location | PostgreSQL only — NOT in Express or React |
| SQL access | `node-postgres (pg)` — parameterized SQL only, no ORM |

---

## 10. How to Add a Feature — Checklist

Do these in order for every feature branch:

- [ ] **Claim migration number** from your range on the team board
- [ ] Write `database/migrations/NNN_description.sql` (with `COMMENT ON` everything)
- [ ] Add direct SQL tests in `database/tests/rules/` (valid, invalid, boundary, bypass attempt)
- [ ] Write `backend/src/modules/<module>/<module>.service.ts` using `withTransaction()`
- [ ] Write `backend/src/modules/<module>/<module>.schema.ts` (Zod)
- [ ] Write `backend/src/modules/<module>/<module>.routes.ts` (with auth + rbac middleware)
- [ ] Add DTO types to `backend/src/contracts/<module>.contract.ts`
- [ ] Write API tests in `backend/src/modules/<module>/<module>.test.ts`
- [ ] Add typed API call to `frontend/src/api/<module>.api.ts`
- [ ] Add `useQuery` / `useMutation` hooks in `frontend/src/features/<module>/hooks/`
- [ ] Build component in `frontend/src/features/<module>/components/`
- [ ] Export from `frontend/src/features/<module>/index.ts`
- [ ] Import into the relevant `frontend/src/pages/` file
- [ ] Open PR: title `CATMS-XXX feat(layer-module): description`, include REQ IDs, success case + failure case

---

## 11. Pull Request Rules

Every PR must include in its description:

1. CATMS issue key (`CATMS-XXX`)
2. SRS requirement IDs (`REQ-XX`, `BR-XX`)
3. Exact test commands to verify
4. One **success case** output
5. One **failure case** output

Other rules:
- One PR = one coherent thing (no formatting mixed with features)
- Cross-module PR requires both affected owners as reviewers
- CI must pass before merge
- Squash merge into `develop` only

---

## 12. The 10 Rules Everyone Must Know

1. **Database first.** Write the SQL rule before the API route.
2. **No business logic in React.** If it can be wrong, it belongs in PostgreSQL.
3. **Never edit a merged migration.** Add a new corrective one.
4. **Claim your migration number** before creating the file.
5. **Publish your contract before the consumer merges** dependent work.
6. **One PR = one coherent thing.** No formatting mixed with features.
7. **Both success and failure cases in every PR description.**
8. **Rebase feature branches onto `develop`.** Never merge develop into your branch.
9. **Squash merge into `develop`** only — keeps history clean.
10. **No real patient data.** Ever. Fictional data only in this repository.

---

*Based on: `member_plan.md` · `CATMS_Complete_GitHub_Issue_Backlog.md` · `CATMS_Design_System.md`*
