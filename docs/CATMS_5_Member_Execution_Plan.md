# CATMS — Five-Member Database-First Execution Plan

**Clinic Appointment and Treatment Management System**  
**Target:** fully working, production-oriented local release for demonstration  
**Primary objective:** prove database correctness, transactional integrity, security and reporting through a thin API and the existing React QA frontend  
**Team:** Dev1–Dev5  
**Planning baseline:** 14 August 2026

---

## 1. Purpose and present position

This is the implementation plan the team should execute from the current repository state to the final local release. It replaces high-level statements such as “build the backend” with named ownership, dependencies, file boundaries, acceptance tests and hand-off conditions.

### Current baseline

- The React/TypeScript frontend prototype already exists and passes its current lint, unit-test and production-build checks.
- The frontend currently uses deterministic in-memory data through `ClinicContext`; it is not evidence of database correctness.
- The PostgreSQL schema, migrations, database roles, procedures, Express API, persistent seed data, Docker runtime and integration tests have not yet been implemented.
- The production implementation ERD is available in `docs/CATMS_Production_Implementation_ERD.drawio` and must be approved at Gate G0 before SQL implementation.
- The course project remains database-centred. The frontend is a shared team deliverable even though one person created the initial prototype; every module owner must integrate and test the screens for their own backend/database contract.

### Final result

From a clean clone, a team member must be able to run one documented command and obtain:

1. PostgreSQL 16 with all migrations, constraints, roles, procedures, views and indexes.
2. A Node.js/Express/TypeScript API with authentication, validation, role checks and stable error responses.
3. The existing React frontend connected to the API, with no in-memory business-rule simulation in the final mode.
4. Deterministic test fixtures, realistic bulk demo data and a named golden demonstration journey.
5. All five reports produced from database views/functions and reconciled against known expected totals.
6. Repeatable database reset, backup and restore procedures.
7. Automated evidence for overlap protection, treatment gating, invoice calculation, claims, overpayment prevention, RBAC and rollback.
8. A tagged local release that starts without internet access after dependencies and container images have been prepared.

“Production-ready locally” means the release is reproducible, secured, observable, testable and recoverable on the approved local environment. It does not mean that real patient data may be used or that public internet deployment is automatically safe; real deployment still requires a clinic-approved privacy, retention, infrastructure and operational review.

---

## 2. Frozen Phase 1 scope

### Required operational journey

```text
Authenticate staff
  -> search/register patient clinic-wide
  -> book/reschedule/cancel/walk-in appointment
  -> complete appointment
  -> record note and delivered treatments
  -> generate immutable invoice lines
  -> submit/resolve insurance claim
  -> take/reverse patient or insurer payment
  -> display outstanding balances and reports
```

### Included

- Branch, employee, doctor, specialty, staff assignment and branch-manager management
- User accounts, scoped application roles and database privileges
- Patient identity, emergency contacts, providers, policies and treatment coverage
- Doctor availability, exceptions, booking, rescheduling, cancellation and walk-ins
- Database-level overlap protection under concurrency
- Appointment status and schedule audit history
- Consultation-note revisions and delivered treatment records
- Treatment catalogue, price snapshots, invoice and invoice-line generation
- Treatment-level insurance eligibility and claim allocation
- Patient/insurer payments, overpayment protection and financial reversals
- Five database-derived management reports
- Deterministic seed/reset, controlled manual ingestion and local backup/restore
- Existing frontend integration and role-based QA flows

### Deferred

- Patient self-service portal
- External insurer transmission or insurer API integration
- SMS/email notifications
- Pharmacy, prescriptions, inventory and laboratory-device integration
- Multi-currency, multilingual UI and branch-specific treatment prices
- Public cloud production deployment

Deferred features must not enter a sprint unless a mandatory requirement is already complete and the change has written team approval.

### Internet and external API rule

Internet access may be used during development for package installation, documentation and approved tooling. The core patient-to-report journey must not depend on an external API and must work with the network disabled. If a later optional adapter uses an external service, it must have explicit timeouts, a disabled-by-default configuration, a local mock/fallback and a prohibition on sending patient or credential data. No external API is required for Phase 1 correctness.

---

## 3. Final architecture and technology decisions

### Technology stack

| Layer | Technology | Decision |
|---|---|---|
| Database | PostgreSQL 16 | Source of truth for integrity, concurrency and financial totals |
| Database extensions | `btree_gist`, `citext` | Overlap exclusion and case-insensitive identifiers |
| SQL access | `node-postgres` (`pg`) | Parameterized SQL; no ORM-generated schema |
| API | Node.js 20+, Express, TypeScript | Thin modular REST layer over stored procedures/views |
| Validation | Zod | Request, environment and response-contract validation |
| Authentication | bcrypt + short-lived JWT in HttpOnly cookie | Password hashes only; secure cookie profile for deployment |
| API security | Helmet, explicit CORS, CSRF protection, rate limiting | Defence in depth around database roles |
| Logging | Pino structured logging | Correlation IDs; no clinical text, passwords or tokens in logs |
| Frontend | Existing React + Vite + TypeScript | Adapt existing pages; do not rebuild the UI |
| Server state | TanStack Query | Replace in-memory mutations and synchronize API data |
| UI styling | Existing Tailwind/design system | Preserve current visual system and accessibility rules |
| Tests | Vitest, Supertest, SQL/integration test harness | Database, API, frontend and end-to-end layers |
| Local runtime | Docker Compose | PostgreSQL, API and web; pgAdmin optional profile |
| CI | GitHub Actions | Clean migrations, tests, builds and compose smoke test |

### Runtime shape

```text
Browser (React)
       |
       | HTTP/JSON on localhost
       v
Express API
  - cookie authentication
  - Zod validation
  - API RBAC
  - correlation/error mapping
       |
       | parameterized calls and SET LOCAL ROLE in a transaction
       v
PostgreSQL 16
  - tables and keys
  - CHECK/UNIQUE/FK/EXCLUDE constraints
  - controlled procedures
  - immutable audit histories
  - reporting views/functions
```

### Non-negotiable database conventions

- Physical names use `snake_case`; conceptual ERD names may remain uppercase for display.
- Surrogate keys use `BIGINT GENERATED ALWAYS AS IDENTITY` unless a small reference table justifies `SMALLINT`.
- Money uses `NUMERIC(12,2)` and Phase 1 currency is `LKR`.
- Instants use `TIMESTAMPTZ` in UTC; daily reports convert to `Asia/Colombo` explicitly.
- Every table and important column receives a PostgreSQL `COMMENT`.
- Every FK declares an explicit `ON DELETE` action. Historical/financial FKs default to `RESTRICT`.
- Shared business rules are not trusted to React or Express. They are checks, constraints or controlled database procedures.
- Application roles do not receive unrestricted writes to financial/audit tables.
- Once a migration is merged, it is never edited. A new corrective migration is added.

---

## 4. Repository structure and ownership boundaries

The team should create this structure before feature implementation:

```text
CATMS/
├── database/
│   ├── migrations/               # Ordered forward-only SQL
│   ├── tests/                    # Direct database rule and concurrency tests
│   ├── seeds/
│   │   ├── tiny/                 # Fast deterministic integration fixture
│   │   ├── bulk/                 # Realistic fixed-seed dataset
│   │   └── golden/               # Named demo journey and expected totals
│   ├── import/
│   │   ├── templates/            # CSV templates for approved manual loads
│   │   └── examples/             # Fictional examples only
│   └── README.md
├── backend/
│   ├── src/
│   │   ├── app/                  # Express bootstrap and shared middleware
│   │   ├── db/                   # Pool, transaction and role helpers
│   │   ├── modules/
│   │   │   ├── auth-staff/
│   │   │   ├── patients-insurance/
│   │   │   ├── appointments/
│   │   │   ├── clinical-billing/
│   │   │   ├── claims/
│   │   │   ├── payments/
│   │   │   └── reports-import/
│   │   ├── contracts/            # One contract file per module
│   │   └── shared/               # Stable errors, logging and utilities
│   └── tests/
├── frontend/
│   └── src/
│       ├── app/                  # Query client, router and auth session
│       ├── features/
│       │   ├── administration/
│       │   ├── patients-insurance/
│       │   ├── appointments/
│       │   ├── clinical-billing/
│       │   └── reports/
│       ├── api/                  # Typed API client and error mapping
│       └── components/           # Existing shared UI components
├── infra/
│   ├── compose.yaml
│   ├── compose.test.yaml
│   └── docker/
├── scripts/                      # Start, reset, backup, restore, import, verify
├── docs/
│   ├── adr/                      # Architecture decision records
│   ├── api/                      # API contract and examples
│   ├── evidence/                 # Generated locally; sensitive data excluded
│   └── runbooks/                 # Module and recovery runbooks
├── .github/
│   ├── workflows/
│   ├── pull_request_template.md
│   └── CODEOWNERS
└── README.md
```

Shared bootstrap files are owned by Dev1. Module owners work inside their directories. Cross-module edits require the owner’s review before merge.

---

## 5. Work allocation

The workload is intentionally unequal as requested: Dev1 carries the critical path and most integration responsibility; Dev5 receives a smaller, lower-risk package. Dev2–Dev4 have comparable, substantial modules.

| Developer | Approx. load | Primary ownership | Cross-cutting ownership |
|---|---:|---|---|
| **Dev1** | **30%** | Appointment/scheduling database and API | Technical lead, migrations, Docker, shared API platform, integration, CI and release |
| **Dev2** | **20%** | Branch, staff, doctor/specialty and access | Authentication, RBAC, database grants and administration UI integration |
| **Dev3** | **20%** | Patient, identity, insurance terms and claims | Claim eligibility/allocation, patient/insurance UI integration and privacy checks |
| **Dev4** | **20%** | Clinical care, treatment catalogue, invoices and payments | Financial transactions, rollback tests and clinical/billing UI integration |
| **Dev5** | **10%** | Reports, controlled import and demo data | Report reconciliation, evidence index, demo checklist and documentation support |

### Important contribution rule

The existing frontend is a team asset. Each developer is responsible for integrating and testing the pages belonging to their module. The original frontend author receives credit for the foundation, but final feature ownership is demonstrated through module PRs, database/API work, tests, reviews and presentation—not by claiming the whole frontend as one person’s final contribution.

### Bus-factor safeguards

- Dev2 is deputy for authentication/local startup instructions.
- Dev4 is deputy for database transaction and financial recovery logic.
- Dev5 maintains the release verification checklist independently of Dev1.
- Every owner produces a one-page module runbook and gives one walkthrough to an adjacent owner.
- Dev1 approves integration decisions but does not become the default implementer for overdue work owned by Dev2–Dev5.

---

## 6. Dependency and hand-off map

| Producer | Consumer | Frozen contract | Acceptance handshake |
|---|---|---|---|
| Dev2 staff/access | Dev1 scheduling | Active doctor, branch assignment, specialty and role eligibility | Dev2 supplies valid/inactive/wrong-branch fixtures; Dev1 proves invalid doctors cannot be booked |
| Dev3 patient | Dev1 scheduling | Active clinic-wide patient ID independent of registration branch | Dev3 supplies patients from every branch; Dev1 books each at another branch |
| Dev1 appointment | Dev4 clinical | Completed appointment with patient, doctor, branch and immutable ID | Dev1 supplies Scheduled/Completed/Cancelled cases; Dev4 proves only Completed accepts care |
| Dev3 insurance terms | Dev3 claims + Dev4 invoice | Effective policy/treatment coverage contract | Dev3 supplies active/expired/suspended/multi-policy cases with expected eligibility |
| Dev4 invoice lines | Dev3 claims | Stable invoice line and price snapshot | Dev4 supplies a hand-calculated invoice; Dev3 allocates claims per line exactly |
| Dev3 claims | Dev4 payments | Approved insurer liability and claim reference | Dev3 supplies approved/partial/rejected claims; Dev4 enforces payer-specific payment caps |
| Dev1–Dev4 domain data | Dev5 reports | Frozen status, date and financial meanings | Every source owner signs Dev5’s known report fixture totals |

No consumer may guess a producer’s schema. The producer publishes a small fixture, contract example and negative case before the consumer merges dependent work.

---

## 7. Delivery stages and gates

The plan assumes approximately 32 working days, or about six to seven calendar weeks. The team may compress duration, but not remove dependency order or acceptance gates.

### Stage 0 — Two days: freeze decisions and contracts

**Whole team**

- Review the ERD page by page.
- Freeze physical table/column names, PostgreSQL types, delete actions and ownership.
- Approve appointment, invoice, claim and payment state transitions.
- Approve a complete hand-calculated financial example containing:
  - two treatment lines;
  - one patient with two active policies;
  - eligibility per treatment;
  - partial claim approval;
  - patient payment;
  - insurer payment;
  - rejected overpayment;
  - reversal and final balances.
- Freeze report date semantics and the role-access matrix.
- Record decisions as ADRs.

**Gate G0:** ERD, state machines, financial example, role matrix, report definitions, migration ranges and API error format are signed by all five developers.

### Stage 1 — Four days: local platform and foundational schema

- Dev1 creates Compose, environment validation, migration runner, database test harness, API skeleton and CI foundation.
- Dev2 implements Branch/Employee/assignment/doctor/specialty/user/role tables and reference seeds.
- Dev3 implements Patient/identity/contact/provider/policy/coverage tables and fixtures.
- Dev4 prepares treatment category/catalogue migrations and the financial calculation specification.
- Dev5 creates report reconciliation templates, CSV templates and expected-data workbook/document.

**Gate G1:** empty-database migration succeeds; foundational constraints and seeds pass; every developer can start PostgreSQL and API health checks locally.

### Stage 2 — Six days: database behaviour and transactions

- Dev1 completes availability, appointments, exclusion constraint, rescheduling and status histories.
- Dev2 completes account procedures, password seeding, scoped roles, grants and negative database permission tests.
- Dev3 completes policy validity rules, claim tables, claim-line allocation and claim state history.
- Dev4 completes consultation revisions, delivered treatments, invoice/line generation, payments and reversals.
- Dev5 drafts all five SQL report queries against the shared tiny fixture and expands deterministic data specifications.

**Gate G2:** all critical rules pass when called directly against PostgreSQL, including two-session overlap, forced rollback, invalid claim allocation and payment over-cap tests. The UI is not accepted as proof.

### Stage 3 — Six days: API and security

- Each owner implements their module’s routes, Zod schemas, service calls and tests.
- Dev1 owns shared error mapping, database transaction helper, correlation IDs, health/readiness endpoints and API assembly.
- Dev2 owns login/logout/session, cookie/CSRF handling, role middleware and database role switching.
- No route accepts database-maintained totals, audit actors or status timestamps from the browser.

**Gate G3:** API contract tests pass; injection attempts are harmless; unauthorized actions fail at both API and PostgreSQL layers; all state-changing requests are transactional and return stable domain errors.

### Stage 4 — Five days: frontend integration

- Replace `ClinicContext` mutations with TanStack Query hooks and typed API requests.
- Keep the existing presentation components and routes wherever practical.
- Every module owner integrates their own pages and negative states.
- Dev1 owns authentication/session bootstrap, shared API client, router integration and the golden end-to-end path.

**Gate G4:** all mandatory journeys work from the browser against PostgreSQL; refresh preserves the session correctly; role changes and forbidden routes are safe; no “DB_*” message is simulated in the browser.

### Stage 5 — Five days: realistic data, reports and NFR proof

- Dev5 leads bulk/golden data generation and report reconciliation with source-owner review.
- Dev1 runs concurrency and scheduling performance tests.
- Dev2 runs full RBAC, secret and authentication checks.
- Dev3 reconciles policy and claim scenarios.
- Dev4 reconciles invoices, payments, reversals and rollback scenarios.
- Team performs accessibility, backup/restore, reset and offline-start checks.

**Gate G5:** all NFR evidence is recorded; reports match expected totals; backup/restore and deterministic reset work on a second machine.

### Stage 6 — Four days: release and demonstration

- Freeze features. Only Severity 1/2 fixes merge.
- Run full requirements traceability from a clean clone and empty database.
- Rehearse on primary and backup laptops.
- Create release notes, database dump, screenshots and short fallback recording.
- Tag the exact demonstrated commit `v1.0-demo`.

**Gate G6:** zero open critical/high defects, two successful rehearsals, clean install and restore verified, signed go/no-go decision by Dev1, Dev5 and one independent module owner.

---

## 8. Dev1 detailed plan — scheduling and integration

**Load:** highest, approximately 30%.  
**Owns:** critical path, shared platform and release.  
**Must delegate:** Dev1 reviews shared integration but must not silently implement other owners’ modules.

### Step-by-step tasks

1. **Freeze architecture**
   - Chair G0 and record unresolved decisions.
   - Maintain the migration registry and integration calendar.
   - Approve cross-module FK and transaction boundaries.

2. **Create local platform**
   - Add PostgreSQL/API/web Compose services and health checks.
   - Provide development, test and frozen-demo profiles.
   - Add `.env.example` files and strict startup validation.
   - Implement `scripts/start`, `reset`, `test`, `backup`, `restore` and `verify` commands.

3. **Create database foundation**
   - Add extensions, schemas, base database roles and migration metadata.
   - Implement the migration runner and checksum/order validation.
   - Build the disposable test-database workflow.

4. **Implement Module C database**
   - `doctor_availability`
   - `doctor_availability_exception`
   - `appointment`
   - `appointment_schedule_history`
   - `appointment_status_log`
   - GiST exclusion constraint over doctor and `[start,end)` for non-cancelled appointments
   - active doctor/patient/branch/specialty validation
   - 15-minute boundary and date-range checks
   - immutable history triggers/permissions

5. **Implement scheduling procedures**
   - `book_appointment`
   - `reschedule_appointment`
   - `change_appointment_status`
   - cancellation and walk-in handling
   - stable SQLSTATE/domain error mapping

6. **Prove concurrency**
   - Use two independent database connections.
   - Attempt the same doctor/time booking concurrently.
   - Assert exactly one commit and one defined rejection.
   - Retain timings and query-plan evidence.

7. **Build shared API platform**
   - Express bootstrap and graceful shutdown
   - database pool and transaction helper
   - `SET LOCAL ROLE` helper inside transactions only
   - structured logger and correlation ID
   - error envelope and PostgreSQL-domain error translation
   - live/readiness endpoints

8. **Implement appointment API and frontend integration**
   - Appointment filters/day view
   - book, walk-in, reschedule, cancel and complete routes
   - connect `AppointmentsPage` to real API data
   - remove browser-only conflict authority

9. **Integration and release**
   - Assemble module routers and compose profiles.
   - Run the golden path twice weekly.
   - Maintain the release branch/tag, go/no-go checklist and fallback environment.

### Dev1 acceptance evidence

- Clean migration and rollback-safe failure test
- Concurrent overlap result
- Appointment audit rows for booking/reschedule/status change
- API contract and negative-role tests
- Clean clone/start/reset/backup/restore logs
- Final release tag and integration report

---

## 9. Dev2 detailed plan — Branch, staff, access and security

**Load:** approximately 20%.  
**Owns:** Module A and all authentication/RBAC implementation.

### Step-by-step tasks

1. Approve staff, manager, doctor and authorization assumptions at G0.
2. Implement:
   - `branch`
   - `employee`
   - `employee_branch_assignment`
   - `branch_manager_assignment`
   - `doctor_profile`
   - `specialty`
   - `doctor_specialty`
   - `user_account`
   - `app_role`
   - `user_account_role`
   - `audit_event`
3. Add partial unique and effective-date rules:
   - one active Primary branch assignment per employee;
   - one active manager per branch;
   - active manager must have Manager position and same branch assignment;
   - doctor subtype requires Doctor position;
   - unique normalized NIC, employee number, licence and username.
4. Add controlled procedures for employee registration, assignment, deactivation, manager assignment and role assignment.
5. Define database roles and privileges for Reception, Clinician, Branch Manager, Admin/Finance and QA.
6. Implement bcrypt hashing, login, logout, session refresh/expiry and account locking.
7. Implement cookie, CSRF, CORS, Helmet and rate-limit configuration.
8. Implement backend modules for administration and authentication.
9. Connect Login and Administration frontend screens to the API.
10. Perform negative tests at three layers:
    - hidden/disabled UI action;
    - API returns forbidden;
    - direct database role cannot read/write/execute the protected object.
11. Review every backend module for parameterized SQL and sensitive-data logging.

### Dev2 acceptance evidence

- Role/permission matrix
- Password-hash inspection without revealing credentials
- Direct PostgreSQL permission-denial tests
- Invalid manager/doctor assignment tests
- Disabled-user login rejection
- Administration CRUD/deactivation browser journey
- Security review checklist

---

## 10. Dev3 detailed plan — Patient, insurance and claims

**Load:** approximately 20%.  
**Owns:** patient/insurance domain and claim eligibility/approval.

### Step-by-step tasks

1. Freeze identity normalization, multiple-policy rules, coverage-cap meaning and claim state transitions.
2. Implement:
   - `patient`
   - `patient_identity`
   - `emergency_contact`
   - `insurance_provider`
   - `insurance_policy`
   - `policy_coverage`
   - `insurance_claim`
   - `insurance_claim_line`
   - `insurance_claim_status_log`
3. Add atomic patient registration requiring a primary identity and at least one emergency contact.
4. Enforce clinic-wide identity uniqueness while supporting NIC and passport identifiers.
5. Implement effective-dated coverage and prevent overlapping terms for the same policy/treatment.
6. Validate policy ownership, validity and status against the invoice patient and service date.
7. Implement claim eligibility per invoice line using snapshotted percentage/cap/scope.
8. Prevent total allocations across multiple policies from exceeding an invoice line’s total.
9. Implement claim submission and resolution procedures with conditional state checks and append-only history.
10. Recalculate approved insurance and patient liability atomically when a claim resolves or reverses.
11. Implement patient, policy and claim API modules.
12. Integrate Patients/Insurance screens and the Claims section of Finance without editing Dev4’s payment components.
13. Add privacy checks: fictional data only, no clinical/identity values in logs or error messages.

### Dev3 acceptance evidence

- Cross-branch patient search and booking fixture
- Duplicate identity rejection
- Patient registration atomic rollback when required contact fails
- Active/expired/suspended policy tests
- Two-policy allocation test with no double coverage
- Pending/approved/partial/rejected conditional-state tests
- Invoice-liability recalculation matching the signed financial example

---

## 11. Dev4 detailed plan — Clinical care, invoicing and payments

**Load:** approximately 20%.  
**Owns:** Module D plus invoice/payment transactions.

### Step-by-step tasks

1. Freeze the consultation-price rule: catalogue price by default, doctor-specific fee only for a consultation service and always recorded as `price_source`.
2. Implement:
   - `consultation_note`
   - `consultation_note_revision`
   - `treatment_category`
   - `treatment_catalogue`
   - `appointment_treatment`
   - `invoice`
   - `invoice_line`
   - `payment`
   - `payment_reversal`
3. Enforce Completed-only consultation notes and treatment lines.
4. Make note revisions append-only; do not overwrite clinical text.
5. Copy treatment price server-side; reject browser-supplied financial totals.
6. Generate immutable invoice-line description/service/price snapshots.
7. Maintain invoice subtotal, approved coverage, patient liability, patient paid, insurer paid and status only through database logic.
8. Distinguish payer (`Patient`/`Insurer`) from method (`Cash`/`Card`/`BankTransfer`/`Online`).
9. Implement idempotent payment posting under an invoice row lock.
10. Enforce patient and insurer caps independently.
11. Record financial corrections as payment reversals rather than deleting or editing settled payments.
12. Implement clinical, catalogue, invoice and payment API modules.
13. Integrate Clinical and Billing/Payment screens; coordinate the Claims tab boundary with Dev3.
14. Build induced-failure tests proving care/invoice/payment transactions roll back fully.

### Dev4 acceptance evidence

- Treatment/note rejected for Scheduled and Cancelled appointments
- Historical price unaffected by later catalogue change
- Invoice lines and totals matching the signed example
- Partial/full payment transitions
- Concurrent duplicate/idempotent payment test
- Overpayment rejection with no partial side effects
- Partial/full reversal reconciliation
- Read-only financial fields at API and database role layers

---

## 12. Dev5 detailed plan — Reports, ingestion, data and evidence

**Load:** approximately 10%, intentionally lighter and lower criticality.  
**Owns:** read-oriented reporting, controlled local data utilities and evidence organization.  
**Does not own:** core financial calculations, authentication or state-changing domain procedures.

### Step-by-step tasks

1. Freeze exact input filters, date basis and output columns for all reports.
2. Create a small hand-calculated fixture and expected-results document.
3. Implement read-only objects:
   - R1 branch-wise daily appointment summary;
   - R2 doctor gross revenue and actual collections;
   - R3 patient outstanding balances;
   - R4 treatment counts by category/date range;
   - R5 approved insurance, insurer receipts and patient receipts by month.
4. Add report indexes only after measuring query plans.
5. Implement reports API endpoints with validated filters and pagination where relevant.
6. Connect the existing Reports page to live API rows; charts must use the exact same response as tables.
7. Create three data modes:
   - tiny integration fixture;
   - realistic deterministic bulk dataset;
   - named golden demo overlay.
8. Create controlled CSV templates for approved reference data such as branches, treatments and providers.
9. Implement/import-document a local import command that validates rows, uses one transaction per batch and produces accepted/rejected counts. Patient data remains fictional.
10. Maintain the requirements/evidence index, manual QA checklist and demo reset instructions.
11. Reconcile every report with source owners before charts are accepted.

### Dev5 acceptance evidence

- Expected-vs-actual report workbook/document
- SQL result and API result equality
- Date/filter boundary tests
- `EXPLAIN ANALYZE` evidence
- Deterministic reset produces identical record counts/totals
- Invalid CSV row rejection without corrupting accepted data
- Demo checklist and evidence index

---

## 13. Migration ownership and ordering

Reserve migration ranges before writing SQL:

| Range | Owner | Purpose |
|---|---|---|
| `001–019` | Dev1 | Extensions, schemas, migration metadata, base roles and platform functions |
| `020–039` | Dev2 | Branch/staff/access tables, procedures and grants |
| `040–059` | Dev3 | Patient/insurance-term tables and procedures |
| `060–089` | Dev1 | Availability, appointments, exclusion rule and histories |
| `090–119` | Dev4 | Clinical, treatments, invoices, payments and reversals |
| `120–139` | Dev3 | Claims, claim lines, histories and approval procedures |
| `140–159` | Dev5 | Reporting objects, report indexes and controlled import support |
| `160+` | Dev1 + affected owner | Cross-module integration/corrections only |

Rules:

- Claim the next number in the team board before creating the file.
- One migration has one coherent responsibility.
- The migration contains its forward change and comments; destructive rollback is not required for production data.
- Never modify a merged migration. Add a corrective migration.
- Cross-module FK migrations are owned by the consuming module and reviewed by the producer.
- CI applies every migration to an empty database on every PR.

---

## 14. API contract standard

### Route pattern

```text
/api/v1/auth/*
/api/v1/branches/*
/api/v1/staff/*
/api/v1/patients/*
/api/v1/insurance/*
/api/v1/appointments/*
/api/v1/clinical/*
/api/v1/invoices/*
/api/v1/claims/*
/api/v1/payments/*
/api/v1/reports/*
/api/v1/imports/*
```

### Response envelope

Success:

```json
{
  "data": {},
  "meta": { "correlationId": "uuid" }
}
```

Failure:

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

Rules:

- Stable domain code; sanitized human message; correlation ID.
- Never expose raw SQL, stack traces, hashes, tokens or sensitive patient values.
- Every list endpoint defines filtering, ordering, pagination and timezone semantics.
- State-changing endpoints support an idempotency key where duplicate execution is financially/operationally dangerous.
- Zod validates input; PostgreSQL remains the invariant authority.
- Contracts live per module to avoid one frequently conflicted global file.

---

## 15. Frontend integration strategy

Do not discard the current frontend. Convert it incrementally.

### Required refactor

1. Keep a short-lived demo adapter while the API is incomplete.
2. Add a typed API client and TanStack Query provider.
3. Move domain operations out of `ClinicContext`; final `ClinicContext` should contain session/UI concerns only or be removed.
4. Split combined Finance responsibilities:
   - Dev3 owns claim components/hooks;
   - Dev4 owns invoice/payment/catalogue components/hooks;
   - the page composition changes require both reviews.
5. Each feature supports loading, empty, success, validation, database rejection and permission-denied states.
6. The frontend may pre-check input for usability but never presents that as database proof.
7. The final demo profile must not contain hard-coded report history or calculated claim totals.

### Page ownership

| Frontend area | Owner |
|---|---|
| Login/session | Dev2, reviewed by Dev1 |
| Appointments/dashboard scheduling data | Dev1 |
| Administration | Dev2 |
| Patients and policy forms | Dev3 |
| Claim list/submission/review | Dev3 |
| Clinical worklist and treatment entry | Dev4 |
| Invoices, catalogue, payments and reversals | Dev4 |
| Reports and CSV export | Dev5 |
| Shared API client/router/query setup | Dev1 |
| Shared visual components/design tokens | Locked baseline; changes require Dev1 plus affected owner |

---

## 16. Data ingestion and local data operation

### Data mode A — Tiny integration fixture

- Minimal deterministic rows covering every role, status, payment state and claim state.
- Runs quickly in CI.
- Owned in parts by module owners; assembled by Dev1.

### Data mode B — Realistic bulk dataset

- 3 branches
- approximately 20 employees
- 10–12 doctors
- 8–10 specialties
- 60–100 patients
- approximately 40% with active policies
- 3–4 providers
- 15–20 treatments
- 150–300 appointments over a fixed 2–3 month window
- scheduled/completed/cancelled mix and approximately 15% walk-ins
- paid/partial/unpaid invoices and approved/partial/rejected claims

Use a fixed random seed and fixed date anchor so screenshots and expected report values remain identical.

### Data mode C — Golden demonstration overlay

- Named fictional Sri Lankan patients, doctors and staff.
- Known appointment IDs and times.
- One overlap rejection.
- One reschedule and walk-in.
- One treatment-gating rejection.
- One price snapshot.
- One multi-policy claim with partial approval.
- One partial patient payment, insurer receipt, overpayment rejection and reversal.
- Known expected values for all reports.

### Manual ingestion

- Normal operational data is entered through the role-protected frontend/API.
- Bulk demo/reference data may be loaded by deterministic SQL or a controlled CLI import.
- CSV imports first validate headers and values, then stage rows, then call controlled procedures inside a transaction.
- Import results show accepted/rejected counts and row-level reasons without logging sensitive values.
- Direct ad hoc `INSERT` statements are allowed only for developer troubleshooting and are not the final demonstrated ingestion method.
- Never use real patient data in this repository or demo environment.

---

## 17. Testing and acceptance strategy

### Layer 1 — Schema tests

- PK/FK/UQ/CHECK/delete actions
- partial unique and exclusion constraints
- table/column comments
- expected indexes and role grants
- migration order and clean reapplication

### Layer 2 — Database rule tests

- valid, invalid and boundary cases
- direct SQL bypass attempts
- two-session concurrency tests
- induced failure and rollback
- immutable history update/delete rejection
- financial reconciliation after every causal change

### Layer 3 — API tests

- validation and stable error codes
- role and branch scope
- parameterized injection payloads
- transaction success/rollback
- response shapes, filters and pagination
- authentication expiry/logout/disabled account

### Layer 4 — Frontend tests

- hooks/components for success and all failure states
- protected routes and role navigation
- database-derived error display
- keyboard focus and non-colour state cues
- no hard-coded financial/report values

### Layer 5 — End-to-end and operations

- golden patient journey
- clean clone/start
- deterministic reset
- backup/restore
- offline start
- primary/backup laptop run

### Critical must-pass cases

1. Two concurrent overlapping bookings: exactly one succeeds.
2. Adjacent appointment ranges: both succeed.
3. Scheduled/Cancelled care entry: rejected with no side effects.
4. Historical treatment/invoice remains unchanged after catalogue edit.
5. Multiple-policy approval cannot cover more than an invoice line.
6. Claim approval recalculates patient liability atomically.
7. Patient/insurer payment caps are enforced independently.
8. Overpayment and induced failure leave no payment/total changes.
9. Reception cannot access raw billing/report objects at UI, API or DB layers.
10. Five report results equal the signed expected fixture.

---

## 18. Git and GitHub workflow

### Branches

- `main`: protected, release-ready only.
- `develop`: shared integration branch.
- `feature/<module>-<short-name>`: short-lived branches from `develop`.
- `fix/<module>-<short-name>`: defect work.
- `release/v1.0-demo`: short stabilization branch only if needed.

Examples:

```text
feature/c-appointment-exclusion
feature/a-role-grants
feature/b-claim-allocation
feature/d-payment-procedure
feature/e-report-views
```

### Daily branch procedure

```bash
git switch develop
git pull --rebase origin develop
git switch -c feature/c-appointment-exclusion

# work, test and commit

git fetch origin
git rebase origin/develop
git push -u origin feature/c-appointment-exclusion
```

Only rebase personal feature branches. Never rebase `develop`, `main` or another person’s shared branch.

### Commit convention

```text
feat(db-c): add appointment overlap exclusion
feat(api-b): add claim eligibility endpoint
test(db-d): prove payment rollback on cap violation
docs(adr): freeze report date semantics
fix(ui-e): use live monthly funding rows
```

### Pull-request rules

- One requirement or coherent work item per PR.
- PR description lists REQ/BR/NFR identifiers.
- Include migration/API/UI impact and exact test commands.
- Include success plus at least one failure case.
- At least one reviewer other than the author.
- Cross-module PR requires both affected owners.
- Shared platform/financial/security changes require Dev1 plus the relevant specialist.
- CI must pass before merge.
- Use squash merge for a clean `develop` history; PR retains detailed contribution evidence.

### Project board

Use one GitHub Projects board with these columns:

```text
Backlog -> Ready -> In Progress -> In Review -> Verification -> Done
```

- A card enters Ready only when it satisfies Definition of Ready.
- Each developer has a work-in-progress limit of one implementation card, plus one small review.
- Labels identify module (`A`–`E`/platform), layer (`db`/`api`/`ui`/`test`/`docs`), priority and REQ/BR/NFR.
- A blocker older than one working day is raised at the next team update and assigned an explicit resolution owner.
- “In Review” means a PR exists; “Verification” means an independent reviewer is reproducing acceptance, not merely reading code.

### Suggested CODEOWNERS

```text
/infra/                              @dev1
/scripts/                            @dev1
/database/migrations/00*             @dev1
/database/migrations/02*             @dev2
/database/migrations/04*             @dev3
/database/migrations/06*             @dev1
/database/migrations/09*             @dev4
/database/migrations/1[0-1]*          @dev4
/database/migrations/12*             @dev3
/database/migrations/14*             @dev5
/backend/src/app/                    @dev1
/backend/src/db/                     @dev1
/backend/src/modules/auth-staff/     @dev2
/backend/src/modules/patients-insurance/ @dev3
/backend/src/modules/claims/         @dev3
/backend/src/modules/appointments/   @dev1
/backend/src/modules/clinical-billing/ @dev4
/backend/src/modules/payments/       @dev4
/backend/src/modules/reports-import/ @dev5
/frontend/src/features/appointments/ @dev1
/frontend/src/features/administration/ @dev2
/frontend/src/features/patients-insurance/ @dev3
/frontend/src/features/clinical-billing/ @dev4
/frontend/src/features/reports/      @dev5
```

Replace placeholders with actual GitHub usernames.

### Conflict prevention

- Dev1 alone edits Compose/bootstrap/migration registry unless pairing is agreed.
- Module owners add files inside their own folders.
- Avoid a single global `types.ts`; contracts are split by module.
- Refactor the combined Finance page before Dev3 and Dev4 integrate it concurrently.
- Claim migration numbers before creating files.
- Do not mix formatting/reorganization with feature logic.
- Feature branches live no longer than two to three working days where possible.
- Pull/rebase daily and raise blockers after 24 hours.

---

## 19. CI pipeline

Every PR runs:

1. Formatting and lint.
2. Frontend unit tests and production build.
3. Backend unit/API tests and TypeScript build.
4. Start disposable PostgreSQL 16.
5. Apply every migration from zero.
6. Load tiny fixture.
7. Run schema and database-rule tests.
8. Run API integration tests.
9. Run selected golden-path integration tests.
10. Scan repository for committed secrets and forbidden real data patterns.
11. Build Compose services and verify health checks.

Nightly or pre-release jobs run the full concurrency, bulk-data reports, performance, backup/restore and offline-start suites.

---

## 20. Security, reliability and operations

### Security

- HttpOnly, SameSite cookie; `Secure` required outside localhost.
- CSRF protection for cookie-authenticated state-changing requests.
- Password hashes only; no demo password reused outside the project.
- Least-privilege database roles and controlled procedure execution.
- Stable sanitized domain errors.
- Parameterized SQL only.
- Secrets supplied by environment and never committed.
- Logs redact authorization, cookies, identities and clinical text.

### Reliability

- Health and readiness checks distinguish API process health from database readiness/migration version.
- Graceful shutdown drains HTTP requests and database pool.
- Payment/claim operations use idempotency keys.
- Financial/audit corrections use append-only compensating records.
- Database backups are encrypted when leaving the local device.
- Restore is rehearsed, not merely documented.

### Performance targets

- Overlap accept/reject under 200 ms for the target fixture and 5–10 concurrent attempts.
- Each report under 2 seconds at the agreed demo scale.
- 20 simulated staff users without deadlocks.
- Indexes retained only when query plans demonstrate benefit.

---

## 21. Team rhythm and decision process

| Rhythm | Activity | Output |
|---|---|---|
| Daily async update | Yesterday / today / blocker / PR link | Current board and visible blockers |
| Twice weekly, 30 min | Clean integration start and golden path | Pass/fail integration log |
| End of stage | Owner demonstrates success and failure cases | Signed gate checklist |
| Weekly risk review | Scope, dependency, security, data and demo risks | Updated risk register |

Decision authority:

- Local module detail: module owner.
- Cross-module schema/API contract: Dev1 plus affected owners.
- Authentication/security: Dev2 plus Dev1.
- Insurance eligibility/claims: Dev3 plus Dev4 review for invoice impact.
- Invoice/payment formula: Dev4 plus Dev3 and Dev1 review.
- Reports/expected totals: Dev5 plus every source owner.
- Release quality: Dev1, Dev5 and one independent owner.

---

## 22. Final demonstration sequence

Target approximately 10–12 minutes:

1. **Dev1:** architecture, local startup and database-authority statement.
2. **Dev2:** authenticate as Reception/Admin; show staff/role boundary.
3. **Dev3:** find/register patient clinic-wide and show policy terms.
4. **Dev1:** valid booking, concurrent overlap rejection, reschedule audit and walk-in.
5. **Dev4:** treatment blocked before completion; complete appointment; record care; show invoice snapshots.
6. **Dev3:** submit and partially approve a treatment-level claim; show patient liability update.
7. **Dev4:** post partial patient payment, reject overpayment, post insurer receipt and show reversal evidence.
8. **Dev5:** show five reports; reconcile one raw table to known totals.
9. **Dev2:** demonstrate Reception denial at UI/API/database layers.
10. **Dev1:** show concurrency/rollback evidence, tagged release and backup/restore readiness.

Prepare known accounts, bookmarked routes and IDs. Do not type long SQL, edit migrations or improvise data during the live presentation.

---

## 23. Definition of Ready and Done

### A task is Ready when

- owner and reviewer are named;
- REQ/BR/NFR links exist;
- dependencies and contract example are available;
- success, boundary and failure acceptance cases are written;
- migration range/file ownership is clear;
- UI/API/database responsibility is identified.

### A task is Done when

- code/migration is merged through reviewed PR;
- clean database migration passes;
- direct database tests pass where a DB invariant exists;
- API and UI tests pass where applicable;
- documentation/contract/ERD is updated;
- reviewer reproduces one success and one failure case;
- traceability evidence is linked;
- no hard-coded demo calculation replaces database behaviour;
- feature works in the integrated Compose stack.

### Project-level Done

- G0–G6 are signed.
- All mandatory requirements pass from a fresh clone and empty database.
- All five reports reconcile.
- No Severity 1/2 defects remain.
- RBAC works at UI, API and DB levels.
- Concurrency and rollback evidence is retained.
- Reset, backup, restore and offline start are proven on two machines.
- Exact demonstrated commit is tagged `v1.0-demo`.
- Every developer can explain their tables, invariants, transaction boundaries, indexes, tests and one adjacent module.

---

## 24. Immediate next actions

1. Dev1 creates the board, migration registry, Compose skeleton and G0 meeting agenda.
2. Dev2 drafts the final employment-position/application-role matrix.
3. Dev3 writes the two-policy worked eligibility/claim example.
4. Dev4 completes the same example from invoice through payment/reversal.
5. Dev5 creates the expected-report and evidence templates.
6. Whole team reviews and signs the ERD/state/report decisions.
7. Only after G0, begin migrations in the reserved order.

This sequence prevents the most expensive failure: building five independent modules that look complete but disagree on identity, status, dates, insurance and financial totals during final integration.
