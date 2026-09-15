# CATMS — Complete GitHub Issue Backlog and Execution Guide

**Purpose:** create and execute every issue required to turn the current React prototype into a working PostgreSQL-backed CATMS local release.  
**Companion plan:** `docs/member_plan.md`  
**ERD:** `docs/CATMS_Production_Implementation_ERD.drawio`  
**Planned release tag:** `v1.0-demo`

---

## 1. How to use this backlog

The identifiers `CATMS-001` to `CATMS-085` are planning keys. Include the key at the beginning of the GitHub issue title because GitHub will assign a different numeric issue number. Planning keys are identifiers; the explicit dependency list, not numeric order, controls execution.

Create issues milestone by milestone:

1. Create every G0 issue immediately.
2. Create G1 issues as soon as the board and labels exist.
3. Create G2–G6 as tracking issues initially; expand their descriptions from this document when the preceding gate is nearly complete.
4. Do not move an issue to `Ready` until all listed dependencies are Done.
5. Normally use one issue, one feature branch and one pull request.

### Board columns

```text
Backlog -> Ready -> In Progress -> In Review -> Verification -> Done
```

### Required milestones

- `G0 — Decisions and contracts`
- `G1 — Platform and foundational schema`
- `G2 — Database rules and transactions`
- `G3 — API and security`
- `G4 — Frontend integration`
- `G5 — Data, reports and NFR proof`
- `G6 — Release and demonstration`

### Required labels

```text
module:platform    module:A-staff       module:B-patient-insurance
module:C-scheduling module:D-clinical-billing module:E-reports-data

layer:database layer:api layer:frontend layer:test layer:infra layer:docs

type:decision type:feature type:test type:integration type:bug

priority:critical priority:high priority:normal
blocked cross-module security financial concurrency
```

### Effort scale

- **S:** a few focused hours
- **M:** approximately one working day
- **L:** approximately two working days

An issue that grows beyond L must be divided before implementation.

### Standard issue completion rule

Unless an issue explicitly says otherwise, it is complete only when:

- implementation is merged through a reviewed PR;
- relevant tests pass from a clean database/environment;
- one success and one failure case are independently reproduced;
- comments/contracts/runbooks are updated;
- evidence is linked in the issue;
- no unrelated warnings or uncommitted generated files remain.

---

## 2. G0 — Decisions and contracts

Nothing in G1 may be merged until all G0 issues are Done.

### CATMS-001 — Confirm Phase 1 scope and source-of-truth hierarchy

- **Owner:** Dev1
- **Reviewers:** Dev2, Dev3, Dev4, Dev5
- **Effort:** S
- **Labels:** `type:decision`, `module:platform`, `layer:docs`, `priority:critical`
- **Dependencies:** none
- **Deliverables:** signed scope list; document precedence order: approved ADRs → ERD → SRS → execution plan → API contract → implementation.
- **Acceptance:** every team member agrees what is included/deferred; contradictions are recorded as ADR actions; external APIs are confirmed unnecessary for the core offline journey.

### CATMS-002 — Approve production ERD, naming, datatypes and delete policies

- **Owner:** Dev1
- **Reviewers:** all module owners
- **Effort:** M
- **Labels:** `type:decision`, `layer:database`, `cross-module`, `priority:critical`
- **Dependencies:** CATMS-001
- **Deliverables:** approved list of 34 base relations; physical `snake_case` names; PK/FK/UQ/CHECK/nullability/delete-action decisions.
- **Acceptance:** ERD and planned SQL names match; all cross-module FKs have an owner; no unresolved relationship or cardinality blocks migration work.

### CATMS-003 — Freeze user roles, branch scope and permission matrix

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** M
- **Labels:** `type:decision`, `module:A-staff`, `security`, `priority:critical`
- **Dependencies:** CATMS-001
- **Deliverables:** permissions for Reception, Clinician, Branch Manager, Admin/Finance and QA across database procedures/views, API actions and UI routes.
- **Acceptance:** branch-manager report access conflict is resolved; every protected action has UI/API/DB enforcement defined; all-branch access is explicit.

### CATMS-004 — Freeze appointment, scheduling and time semantics

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** M
- **Labels:** `type:decision`, `module:C-scheduling`, `concurrency`, `priority:critical`
- **Dependencies:** CATMS-002, CATMS-003
- **Deliverables:** appointment state machine; availability rules; 15-minute boundaries; UTC storage; Asia/Colombo presentation/report rules; `[start,end)` overlap semantics.
- **Acceptance:** Booked/WalkIn and Scheduled/Completed/Cancelled meanings are unambiguous; valid/invalid transitions are documented; adjacent slots are permitted.

### CATMS-005 — Freeze clinical price and invoice calculation rules

- **Owner:** Dev4
- **Reviewers:** Dev1, Dev3
- **Effort:** M
- **Labels:** `type:decision`, `module:D-clinical-billing`, `financial`, `priority:critical`
- **Dependencies:** CATMS-002
- **Deliverables:** consultation-price selection; price-source meanings; invoice issuance point; line snapshot fields; subtotal/liability/status formulas.
- **Acceptance:** catalogue versus doctor-fee authority is settled; browser-supplied totals are prohibited; issued-line immutability is documented.

### CATMS-006 — Freeze insurance eligibility, multiple-policy and claim rules

- **Owner:** Dev3
- **Reviewers:** Dev4, Dev1
- **Effort:** M
- **Labels:** `type:decision`, `module:B-patient-insurance`, `financial`, `priority:critical`
- **Dependencies:** CATMS-002, CATMS-005
- **Deliverables:** effective-date eligibility; percentage/cap scopes; multi-policy ordering/allocation; claim state machine; approval effect on patient liability.
- **Acceptance:** treatment-level allocation cannot exceed invoice lines; Pending/Approved/PartiallyApproved/Rejected conditions are explicit; only approved coverage reduces liability.

### CATMS-007 — Freeze report definitions, filters and date bases

- **Owner:** Dev5
- **Reviewers:** Dev1, Dev2, Dev3, Dev4
- **Effort:** S
- **Labels:** `type:decision`, `module:E-reports-data`, `layer:docs`, `priority:high`
- **Dependencies:** CATMS-003, CATMS-004, CATMS-005, CATMS-006
- **Deliverables:** exact columns, filters, grouping and date basis for R1–R5.
- **Acceptance:** gross, collected, outstanding, approved insurance, insurer receipts and patient receipts have distinct definitions; branch-manager visibility is defined.

### CATMS-008 — Create signed golden financial worked example

- **Owner:** Dev3
- **Reviewers:** Dev4, Dev5, Dev1
- **Effort:** M
- **Labels:** `type:test`, `financial`, `cross-module`, `priority:critical`
- **Dependencies:** CATMS-005, CATMS-006, CATMS-007
- **Deliverables:** hand-calculated two-treatment, two-policy, partial-approval, patient-payment, insurer-payment, overpayment and reversal scenario.
- **Acceptance:** every intermediate and final value is shown; Dev3 and Dev4 independently obtain the same result; Dev5 derives expected report rows.

### CATMS-009 — Configure project board, ownership, migration registry and PR rules

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** M
- **Labels:** `module:platform`, `layer:docs`, `type:feature`, `priority:critical`
- **Dependencies:** CATMS-001, CATMS-002
- **Deliverables:** labels, milestones, board columns, issue/PR templates, CODEOWNERS draft, migration ranges and WIP limit.
- **Acceptance:** all CATMS planning keys can be tracked; one implementation issue per developer limit is visible; review and verification rules are documented.

**Gate G0 exit:** CATMS-001 through CATMS-009 are Done and signed in the decision log.

---

## 3. G1 — Platform and foundational schema

### CATMS-010 — Create final repository folder structure and contributor commands

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** M
- **Labels:** `module:platform`, `layer:infra`, `type:feature`
- **Dependencies:** CATMS-009
- **Deliverables:** `database`, `backend`, `infra`, `scripts`, contract, runbook and evidence folders; root commands documented.
- **Acceptance:** empty skeleton does not break existing frontend; ownership boundaries match CODEOWNERS; no duplicate configuration files are introduced.

### CATMS-011 — Create local PostgreSQL Docker Compose service

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:platform`, `layer:infra`, `priority:critical`
- **Dependencies:** CATMS-010
- **Deliverables:** PostgreSQL 16 service, persistent dev volume, disposable test profile, health check, localhost-only ports and `.env.example`.
- **Acceptance:** service starts on two machines; health becomes ready; data persists in dev and resets in test; no secret is committed.

### CATMS-012 — Implement migration runner, extensions and migration metadata

- **Owner:** Dev1
- **Reviewer:** Dev4
- **Effort:** L
- **Labels:** `module:platform`, `layer:database`, `priority:critical`
- **Dependencies:** CATMS-011
- **Deliverables:** `btree_gist`, `citext`; migration-history table; ordered forward-only runner; checksum/order checks; base schemas.
- **Acceptance:** migrations apply from empty DB; a repeated run is safe; changed merged migration is detected; failure stops without marking migration complete.

### CATMS-013 — Create Express/TypeScript backend skeleton

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:platform`, `layer:api`, `type:feature`
- **Dependencies:** CATMS-010
- **Deliverables:** TypeScript configuration, Express bootstrap, environment validation, lint/test/build scripts and module folders.
- **Acceptance:** API compiles and starts; invalid environment fails clearly; frontend remains independently runnable; no database business rule exists in shared middleware.

### CATMS-014 — Create CI foundation

- **Owner:** Dev1
- **Reviewer:** Dev5
- **Effort:** L
- **Labels:** `module:platform`, `layer:infra`, `type:test`
- **Dependencies:** CATMS-011, CATMS-012, CATMS-013
- **Deliverables:** frontend lint/test/build, backend lint/test/build and clean migration smoke jobs.
- **Acceptance:** CI runs on PR; deliberately broken migration/build fails; successful baseline passes; logs contain no secrets.

### CATMS-015 — Implement Branch and Employee schema

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-002, CATMS-012
- **Deliverables:** `branch`, `employee`, uniqueness/checks/comments and explicit deletion/deactivation policy.
- **Acceptance:** duplicate branch code/name, NIC and employee number are rejected; valid records insert; historical references use RESTRICT.

### CATMS-016 — Implement staff/manager assignment history schema

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-015
- **Deliverables:** `employee_branch_assignment`, `branch_manager_assignment`, effective dates and partial unique constraints.
- **Acceptance:** one active Primary assignment per employee and one active manager per branch; historical transfers remain queryable; invalid date ranges fail.

### CATMS-017 — Implement doctor, specialty, user-account and role schema

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:database`, `security`
- **Dependencies:** CATMS-015, CATMS-016
- **Deliverables:** `doctor_profile`, `specialty`, `doctor_specialty`, `user_account`, `app_role`, `user_account_role`, `audit_event`.
- **Acceptance:** unique licence/username/role keys work; doctor uses shared Employee PK; credentials contain no clinical data; role scope supports branch and all-branch cases.

### CATMS-018 — Implement Patient, identity and emergency-contact schema

- **Owner:** Dev3
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-015, CATMS-012
- **Deliverables:** `patient`, `patient_identity`, `emergency_contact`, normalized identity uniqueness and comments.
- **Acceptance:** NIC/passport uniqueness is clinic-wide; patient has registration provenance without branch restriction; one primary identity/contact constraint works.

### CATMS-019 — Implement provider, policy and effective coverage schema

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:database`, `financial`
- **Dependencies:** CATMS-018, CATMS-020
- **Deliverables:** `insurance_provider`, `insurance_policy`, `policy_coverage`, validity/percentage/cap constraints.
- **Acceptance:** provider+policy number is unique; coverage is treatment-specific and effective-dated; invalid percentages, caps and dates fail.

### CATMS-020 — Implement treatment category and catalogue schema

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** M
- **Labels:** `module:D-clinical-billing`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-012
- **Deliverables:** `treatment_category`, `treatment_catalogue`, service code/name/price/duration/active fields.
- **Acceptance:** service codes and categories are unique as approved; price is non-negative; duration is positive; deactivation preserves references.

### CATMS-021 — Create tiny fixture and evidence templates

- **Owner:** Dev5
- **Reviewers:** all module owners
- **Effort:** M
- **Labels:** `module:E-reports-data`, `layer:test`, `layer:docs`
- **Dependencies:** CATMS-015, CATMS-017, CATMS-018, CATMS-019, CATMS-020
- **Deliverables:** deterministic foundational rows; expected-value sheet; evidence naming convention.
- **Acceptance:** all current foundational tables receive valid rows; identifiers are stable; only fictional data is used; rerun gives identical values.

### CATMS-022 — Create database schema-test harness

- **Owner:** Dev1
- **Reviewer:** Dev4
- **Effort:** M
- **Labels:** `module:platform`, `layer:test`, `layer:database`
- **Dependencies:** CATMS-012, CATMS-021
- **Deliverables:** automated checks for tables, columns, PK/FK/UQ/CHECK/delete actions, comments and migration order.
- **Acceptance:** tests run against disposable PostgreSQL; known missing constraint causes failure; database is recreated without manual repair.

**Gate G1 exit:** clean migrations, foundational fixtures and schema tests pass on every developer machine.

---

## 4. G2 — Database rules and transactions

### CATMS-023 — Implement staff registration, assignment and deactivation procedures

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-016, CATMS-017
- **Deliverables:** controlled procedures for employee/doctor registration, branch transfer and soft deactivation.
- **Acceptance:** operations are atomic; doctor-position validation works; deactivation retains history; invalid subtype/assignment leaves no partial rows.

### CATMS-024 — Implement manager/specialty integrity and database grants

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:database`, `security`
- **Dependencies:** CATMS-003, CATMS-023
- **Deliverables:** manager and specialty integrity rules; PostgreSQL roles; initial GRANT/REVOKE matrix and negative tests.
- **Acceptance:** wrong-position/wrong-branch/inactive manager fails; active doctor has specialty; Reception cannot read financial base tables.

### CATMS-025 — Implement atomic patient-registration procedure

- **Owner:** Dev3
- **Reviewer:** Dev1
- **Effort:** M
- **Labels:** `module:B-patient-insurance`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-018, CATMS-021
- **Deliverables:** patient + primary identity + at least one emergency contact in one transaction.
- **Acceptance:** valid registration commits all rows; duplicate identity or missing contact rolls back everything; creator and timestamps are database-controlled.

### CATMS-026 — Implement policy and coverage lifecycle procedures

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** M
- **Labels:** `module:B-patient-insurance`, `layer:database`, `financial`
- **Dependencies:** CATMS-019, CATMS-006
- **Deliverables:** controlled provider/policy/coverage creation and effective-term updates.
- **Acceptance:** overlapping terms fail; expired/suspended policies are distinguishable; prior terms remain available for historical claims.

### CATMS-027 — Implement doctor availability and exception schema/rules

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:C-scheduling`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-017, CATMS-004
- **Deliverables:** `doctor_availability`, `doctor_availability_exception`, validity and time checks.
- **Acceptance:** recurring hours and ExtraHours/Unavailable exceptions are representable; doctor/branch assignment is validated; invalid ranges fail.

### CATMS-028 — Implement appointment schema and overlap exclusion

- **Owner:** Dev1
- **Reviewer:** Dev4
- **Effort:** L
- **Labels:** `module:C-scheduling`, `layer:database`, `concurrency`, `priority:critical`
- **Dependencies:** CATMS-017, CATMS-018, CATMS-027
- **Deliverables:** `appointment`, required indexes and GiST exclusion over doctor and `[start,end)` for non-cancelled rows.
- **Acceptance:** overlapping non-cancelled rows fail even through direct SQL; adjacent/cancelled cases succeed; 15-minute/end-after-start checks work.

### CATMS-029 — Implement transactional booking procedure

- **Owner:** Dev1
- **Reviewers:** Dev2, Dev3
- **Effort:** L
- **Labels:** `module:C-scheduling`, `layer:database`, `concurrency`
- **Dependencies:** CATMS-025, CATMS-027, CATMS-028
- **Deliverables:** `book_appointment` validating active patient/doctor/branch/specialty/availability and returning stable domain error codes.
- **Acceptance:** valid cross-branch patient booking succeeds; inactive/wrong-branch/non-doctor/invalid-specialty/overlap cases fail without side effects.

### CATMS-030 — Implement reschedule, status, cancellation and walk-in procedures

- **Owner:** Dev1
- **Reviewer:** Dev4
- **Effort:** L
- **Labels:** `module:C-scheduling`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-029
- **Deliverables:** `appointment_schedule_history`, `appointment_status_log`; controlled reschedule/status/walk-in operations.
- **Acceptance:** old/new schedule and actor/reason are retained; valid transitions only; terminal states do not reopen; cancelled rows remain reportable.

### CATMS-031 — Prove scheduling constraints and concurrency

- **Owner:** Dev1
- **Reviewer:** Dev5
- **Effort:** L
- **Labels:** `module:C-scheduling`, `layer:test`, `concurrency`, `priority:critical`
- **Dependencies:** CATMS-030
- **Deliverables:** valid/boundary/invalid/direct-SQL and two-session tests with timings.
- **Acceptance:** simultaneous collision yields exactly one commit; no deadlock; original appointment survives failed reschedule; audit rows reconcile.

### CATMS-032 — Implement consultation-note and revision model

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** M
- **Labels:** `module:D-clinical-billing`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-030
- **Deliverables:** `consultation_note`, `consultation_note_revision`, one-note-header and append-only revisions.
- **Acceptance:** only Completed appointments accept notes; revisions preserve history/actor/reason; update/delete of revision is denied.

### CATMS-033 — Implement delivered treatment and price-snapshot rules

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** M
- **Labels:** `module:D-clinical-billing`, `layer:database`, `financial`
- **Dependencies:** CATMS-020, CATMS-030, CATMS-005
- **Deliverables:** `appointment_treatment`, line numbering, quantity, price source and server-side price snapshot.
- **Acceptance:** only Completed accepts treatment; inactive/missing treatment fails; duplicate service can use separate lines; later catalogue change does not alter history.

### CATMS-034 — Implement invoice and immutable invoice-line generation

- **Owner:** Dev4
- **Reviewers:** Dev3, Dev1
- **Effort:** L
- **Labels:** `module:D-clinical-billing`, `layer:database`, `financial`, `priority:critical`
- **Dependencies:** CATMS-033, CATMS-005
- **Deliverables:** `invoice`, `invoice_line`; care-to-invoice procedure; description/service/price snapshots; database totals.
- **Acceptance:** one invoice per appointment; lines equal delivered treatments; subtotal matches line totals; application roles cannot edit maintained totals.

### CATMS-035 — Implement patient/insurer payment and reversal procedures

- **Owner:** Dev4
- **Reviewers:** Dev3, Dev1
- **Effort:** L
- **Labels:** `module:D-clinical-billing`, `layer:database`, `financial`, `priority:critical`
- **Dependencies:** CATMS-034, CATMS-039, CATMS-006
- **Deliverables:** `payment`, `payment_reversal`; payer/method separation; idempotency; row locking; payer-specific caps.
- **Acceptance:** partial/full payments classify status; duplicates are idempotent; overpayment rolls back; insurer payment requires valid approved claim; reversals never exceed payment.

> Sequencing note: this issue intentionally waits for CATMS-039 because insurer payments must reference an approved claim. Its database migration belongs in Dev4's `130–139` range even though the planning key is CATMS-035.

### CATMS-036 — Prove clinical, invoice and payment transactions

- **Owner:** Dev4
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:D-clinical-billing`, `layer:test`, `financial`
- **Dependencies:** CATMS-032, CATMS-033, CATMS-034, CATMS-035
- **Deliverables:** valid/invalid/boundary/forced-failure/concurrent tests.
- **Acceptance:** treatment gating, price history, totals, payment cap and reversal pass; induced failure leaves no partial care/invoice/payment state.

### CATMS-037 — Implement insurance claim, claim-line and status-history schema

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** M
- **Labels:** `module:B-patient-insurance`, `layer:database`, `financial`
- **Dependencies:** CATMS-019, CATMS-034
- **Deliverables:** `insurance_claim`, `insurance_claim_line`, `insurance_claim_status_log` and conditional checks.
- **Acceptance:** policy belongs to invoice patient; line allocations reference invoice/coverage lines; claimed/approved ordering and resolution fields are valid.

### CATMS-038 — Implement claim eligibility and submission procedure

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:database`, `financial`
- **Dependencies:** CATMS-026, CATMS-037, CATMS-008
- **Deliverables:** treatment-level eligibility snapshots, multi-policy allocation validation and Pending claim creation.
- **Acceptance:** service-date validity and policy status are enforced; percentage/cap calculations match golden example; total allocated coverage cannot exceed line total.

### CATMS-039 — Implement claim resolution and liability recalculation

- **Owner:** Dev3
- **Reviewers:** Dev4, Dev1
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:database`, `financial`, `priority:critical`
- **Dependencies:** CATMS-038, CATMS-034
- **Deliverables:** Approved/Partial/Rejected transitions, immutable history and atomic invoice-liability recalculation.
- **Acceptance:** conditional status rules pass; only approved amount reduces liability; failure rolls back claim and invoice; golden example matches.

### CATMS-040 — Prove insurance and claim rules

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:test`, `financial`
- **Dependencies:** CATMS-039
- **Deliverables:** active/expired/suspended, cap, multi-policy, partial/rejected, direct-SQL and rollback tests.
- **Acceptance:** no double coverage; historical coverage snapshot survives later edits; claim actor/history and invoice totals reconcile.

### CATMS-041 — Prototype all five report queries against tiny fixture

- **Owner:** Dev5
- **Reviewers:** Dev1, Dev2, Dev3, Dev4
- **Effort:** L
- **Labels:** `module:E-reports-data`, `layer:database`, `type:feature`
- **Dependencies:** CATMS-030, CATMS-034, CATMS-035, CATMS-039
- **Deliverables:** draft SQL and raw expected rows for R1–R5.
- **Acceptance:** each query uses the frozen semantics; no hard-coded values; source owners approve input facts; branch scope can be applied safely.

### CATMS-042 — Assemble complete deterministic tiny integration fixture

- **Owner:** Dev5
- **Reviewers:** all module owners
- **Effort:** M
- **Labels:** `module:E-reports-data`, `layer:test`, `cross-module`
- **Dependencies:** CATMS-021, CATMS-031, CATMS-036, CATMS-040
- **Deliverables:** every role/status/payment/claim state and the golden journey in stable seed scripts.
- **Acceptance:** fixture loads from empty DB; all FKs/rules pass; expected counts/totals are recorded; rerun/reset is deterministic.

**Gate G2 exit:** database business rules pass without the API or frontend.

---

## 5. G3 — API and security

### CATMS-043 — Implement database pool, transaction and SET LOCAL ROLE helper

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:platform`, `layer:api`, `security`, `priority:critical`
- **Dependencies:** CATMS-024, CATMS-013
- **Deliverables:** configured `pg` pool, transaction wrapper, parameterization helper and transaction-scoped database role switching.
- **Acceptance:** commit/rollback/release always occurs; pooled connection never retains a role; invalid query parameters are not concatenated.

### CATMS-044 — Implement logging, error envelope, health and graceful shutdown

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** M
- **Labels:** `module:platform`, `layer:api`, `type:feature`
- **Dependencies:** CATMS-013, CATMS-043
- **Deliverables:** Pino/correlation IDs, sanitized domain mapping, liveness/readiness, migration-level check and pool shutdown.
- **Acceptance:** logs redact secrets/clinical text; raw SQL errors never reach clients; SIGTERM drains requests and closes the pool.

### CATMS-045 — Implement login, logout, session, CSRF and account protection

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:api`, `security`, `priority:critical`
- **Dependencies:** CATMS-017, CATMS-024, CATMS-043
- **Deliverables:** bcrypt hashing, HttpOnly JWT cookie, CSRF, explicit CORS, Helmet, rate limiting, lock/disable checks.
- **Acceptance:** valid login/session/logout works; bad/disabled account fails; state mutation without CSRF fails; password/token never appears in response/log.

### CATMS-046 — Implement Branch, Staff and Access API

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:api`, `type:feature`
- **Dependencies:** CATMS-023, CATMS-024, CATMS-045
- **Deliverables:** validated endpoints for branches, employees, assignments, doctors, specialties, manager and application-role actions.
- **Acceptance:** endpoints call controlled procedures; authorization/branch scope works; maintained/audit fields are rejected from input.

### CATMS-047 — Add authentication and administration API tests

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** M
- **Labels:** `module:A-staff`, `layer:test`, `layer:api`, `security`
- **Dependencies:** CATMS-045, CATMS-046
- **Deliverables:** validation, session, CSRF, role, injection, success and DB-denial tests.
- **Acceptance:** Reception/Admin differences are proven at API and DB; injection payload is harmless; stable errors match contract.

### CATMS-048 — Implement Patient and Insurance Terms API

- **Owner:** Dev3
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:api`, `type:feature`
- **Dependencies:** CATMS-025, CATMS-026, CATMS-045
- **Deliverables:** patient clinic-wide search/register/detail; emergency contacts; providers/policies/coverage endpoints.
- **Acceptance:** identity data is validated/redacted appropriately; registration is atomic; search ignores registration branch for accessibility.

### CATMS-049 — Implement Claims API and tests

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:api`, `layer:test`, `financial`
- **Dependencies:** CATMS-038, CATMS-039, CATMS-045
- **Deliverables:** claim eligibility preview, submission, list/detail and controlled resolution endpoints plus contract tests.
- **Acceptance:** only permitted finance roles resolve; browser cannot submit totals/actors; golden and invalid allocation cases pass.

### CATMS-050 — Implement Appointments API

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:C-scheduling`, `layer:api`, `concurrency`
- **Dependencies:** CATMS-029, CATMS-030, CATMS-045
- **Deliverables:** availability/day list, book, walk-in, reschedule, cancel and complete endpoints.
- **Acceptance:** endpoints call procedures; overlap maps to stable 409-domain response; branch/role scope and filters are validated.

### CATMS-051 — Add appointment API and concurrency mapping tests

- **Owner:** Dev1
- **Reviewer:** Dev5
- **Effort:** M
- **Labels:** `module:C-scheduling`, `layer:test`, `layer:api`, `concurrency`
- **Dependencies:** CATMS-050
- **Deliverables:** endpoint contracts, role failures, overlap/reschedule rollback and concurrent-request tests.
- **Acceptance:** HTTP behavior matches DB results; one of two collisions succeeds; response contains sanitized conflict, not SQL internals.

### CATMS-052 — Implement Clinical, Catalogue and Invoice API

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** L
- **Labels:** `module:D-clinical-billing`, `layer:api`, `financial`
- **Dependencies:** CATMS-032, CATMS-033, CATMS-034, CATMS-045
- **Deliverables:** clinical worklist, care recording/revision, catalogue actions and read-only invoice endpoints.
- **Acceptance:** financial totals not accepted from browser; Completed gate maps correctly; role and immutable-field enforcement pass.

### CATMS-053 — Implement Payment and Reversal API

- **Owner:** Dev4
- **Reviewers:** Dev3, Dev1
- **Effort:** M
- **Labels:** `module:D-clinical-billing`, `layer:api`, `financial`
- **Dependencies:** CATMS-035, CATMS-039, CATMS-045
- **Deliverables:** payment preview/post/list and controlled reversal endpoints with idempotency key.
- **Acceptance:** payer-specific cap and approved-claim requirement work; duplicate key does not double-post; reversal is authorized and audited.

### CATMS-054 — Add clinical, invoice and payment API tests

- **Owner:** Dev4
- **Reviewer:** Dev1
- **Effort:** M
- **Labels:** `module:D-clinical-billing`, `layer:test`, `layer:api`, `financial`
- **Dependencies:** CATMS-052, CATMS-053
- **Deliverables:** validation, role, maintained-field, rollback, idempotency and error-shape tests.
- **Acceptance:** premature treatment and overpayment have no side effects; invoice response equals database values; Reception denial is proven.

### CATMS-055 — Implement report/import API contract skeleton

- **Owner:** Dev5
- **Reviewer:** Dev1
- **Effort:** S
- **Labels:** `module:E-reports-data`, `layer:api`, `type:feature`
- **Dependencies:** CATMS-041, CATMS-044, CATMS-045
- **Deliverables:** validated route definitions, filters, response DTOs and access checks for reports/import status.
- **Acceptance:** contracts match CATMS-007; no report calculation occurs in JavaScript; branch manager only receives permitted branch report.

**Gate G3 exit:** all required operations work through API tests with two-layer RBAC and database-controlled state.

---

## 6. G4 — Frontend integration

### CATMS-056 — Add typed API client, TanStack Query and session bootstrap

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:platform`, `layer:frontend`, `type:integration`
- **Dependencies:** CATMS-044, CATMS-045
- **Deliverables:** base client, cookie/CSRF handling, query provider, module error mapping and current-user session.
- **Acceptance:** loading/error/session expiry work; correlation/domain errors display safely; no duplicated global fetch logic.

### CATMS-057 — Refactor feature folders and split Finance ownership boundary

- **Owner:** Dev1
- **Reviewers:** Dev3, Dev4
- **Effort:** M
- **Labels:** `module:platform`, `layer:frontend`, `cross-module`
- **Dependencies:** CATMS-056
- **Deliverables:** owned feature directories; separate claim and invoice/payment/catalogue components; stable top-level route composition.
- **Acceptance:** current UI still builds; Dev3/Dev4 can work without editing the same feature files; shared component changes are minimized.

### CATMS-058 — Connect Login and Administration frontend

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** L
- **Labels:** `module:A-staff`, `layer:frontend`, `type:integration`
- **Dependencies:** CATMS-046, CATMS-047, CATMS-056, CATMS-057
- **Deliverables:** real login/logout/session; branches/staff/doctor/specialty/manager/deactivation operations.
- **Acceptance:** refresh/session/logout work; server validation and permission errors display; no demo role-card bypass exists in final mode.

### CATMS-059 — Connect Patient and Insurance frontend

- **Owner:** Dev3
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:B-patient-insurance`, `layer:frontend`, `type:integration`
- **Dependencies:** CATMS-048, CATMS-056, CATMS-057
- **Deliverables:** clinic-wide search, registration/detail/contact and policy/coverage actions using API.
- **Acceptance:** duplicate identity and invalid policy errors display; new patient persists after refresh; branch filter never hides clinic-wide availability incorrectly.

### CATMS-060 — Connect Claim submission and review frontend

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** M
- **Labels:** `module:B-patient-insurance`, `layer:frontend`, `financial`
- **Dependencies:** CATMS-049, CATMS-057, CATMS-059
- **Deliverables:** eligibility preview, policy selection, submission, status/history and finance review UI.
- **Acceptance:** approved/partial/rejected values come from API; invalid multi-policy allocation displays DB-derived rejection; unauthorized controls are inaccessible.

### CATMS-061 — Connect Appointments and scheduling dashboard frontend

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:C-scheduling`, `layer:frontend`, `type:integration`
- **Dependencies:** CATMS-050, CATMS-051, CATMS-056
- **Deliverables:** live availability/day list, booking, walk-in, reschedule, cancel, complete and audit display.
- **Acceptance:** persisted changes survive refresh; overlap is decided by server/database; current role/branch filtering works; exact user-safe conflict is shown.

### CATMS-062 — Connect Clinical, Catalogue and Invoice frontend

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** L
- **Labels:** `module:D-clinical-billing`, `layer:frontend`, `financial`
- **Dependencies:** CATMS-052, CATMS-056, CATMS-057
- **Deliverables:** completed worklist, note/treatment entry, catalogue management and read-only invoice lines/totals.
- **Acceptance:** premature care remains rejected if UI is bypassed; price/totals are read-only; invoice matches database after refresh.

### CATMS-063 — Connect Payment and Reversal frontend

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** M
- **Labels:** `module:D-clinical-billing`, `layer:frontend`, `financial`
- **Dependencies:** CATMS-053, CATMS-057, CATMS-062
- **Deliverables:** payer/method selection, payment history, idempotent submit handling, balance/status and authorized reversal flow.
- **Acceptance:** double-click does not double-pay; patient/insurer balances are distinct; overpayment/reversal validation displays correctly.

### CATMS-064 — Connect Reports frontend to live API contract

- **Owner:** Dev5
- **Reviewer:** Dev1
- **Effort:** M
- **Labels:** `module:E-reports-data`, `layer:frontend`, `type:integration`
- **Dependencies:** CATMS-055, CATMS-056
- **Deliverables:** live report hooks, validated filters, raw tables and charts sharing identical API rows.
- **Acceptance:** no hard-coded monthly/history values remain; Manager sees only allowed report; empty/error/loading/export states work.

### CATMS-065 — Remove in-memory database simulations from final mode

- **Owner:** Dev1
- **Reviewers:** Dev2, Dev3, Dev4
- **Effort:** M
- **Labels:** `module:platform`, `layer:frontend`, `type:integration`, `priority:critical`
- **Dependencies:** CATMS-058, CATMS-059, CATMS-060, CATMS-061, CATMS-062, CATMS-063
- **Deliverables:** eliminate business-rule mutations/report totals from `ClinicContext`; optional demo adapter isolated and disabled in final profile.
- **Acceptance:** final mode cannot work without API/database; every displayed transactional value originates from server; existing build passes.

### CATMS-066 — Add Administration frontend tests

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** S
- **Labels:** `module:A-staff`, `layer:test`, `layer:frontend`
- **Dependencies:** CATMS-058
- **Deliverables:** login/session, staff success/error and permission-state tests.
- **Acceptance:** tests prove disabled/forbidden states and server error display.

### CATMS-067 — Add Patient/Insurance/Claim frontend tests

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** S
- **Labels:** `module:B-patient-insurance`, `layer:test`, `layer:frontend`
- **Dependencies:** CATMS-059, CATMS-060
- **Deliverables:** registration, duplicate, policy, claim and permission-state tests.
- **Acceptance:** UI does not calculate authoritative approved/liability values and handles API errors.

### CATMS-068 — Add Clinical/Billing/Payment frontend tests

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** S
- **Labels:** `module:D-clinical-billing`, `layer:test`, `layer:frontend`
- **Dependencies:** CATMS-062, CATMS-063
- **Deliverables:** care, invoice, payment, overpayment and reversal-state tests.
- **Acceptance:** maintained fields are read-only; double submit is safe; errors retain original form context.

### CATMS-069 — Implement golden end-to-end browser journey

- **Owner:** Dev1
- **Reviewers:** Dev2, Dev3, Dev4, Dev5
- **Effort:** L
- **Labels:** `cross-module`, `layer:test`, `type:integration`, `priority:critical`
- **Dependencies:** CATMS-064, CATMS-065, CATMS-066, CATMS-067, CATMS-068
- **Deliverables:** scripted/manual automated journey from authentication through reports, including required rejection cases.
- **Acceptance:** journey starts from reset fixture; persists across refresh; every module participates; final totals equal CATMS-008.

**Gate G4 exit:** all operational requirements can be exercised from the browser against PostgreSQL.

---

## 7. G5 — Data, reports and NFR proof

### CATMS-070 — Build realistic deterministic bulk and golden data sets

- **Owner:** Dev5
- **Reviewers:** all module owners
- **Effort:** L
- **Labels:** `module:E-reports-data`, `layer:database`, `layer:test`
- **Dependencies:** CATMS-042, CATMS-069
- **Deliverables:** SRS-scale fixed-seed bulk data and named golden overlay with stable dates/IDs/totals.
- **Acceptance:** volumes/distributions match plan; constraints are never bypassed unsafely; reset reproduces record counts and financial totals.

### CATMS-071 — Implement controlled local CSV ingestion

- **Owner:** Dev5
- **Reviewer:** Dev2
- **Effort:** M
- **Labels:** `module:E-reports-data`, `layer:database`, `layer:api`
- **Dependencies:** CATMS-055, CATMS-070
- **Deliverables:** templates for approved reference data; header/value validation; staging/transactional import; accepted/rejected summary.
- **Acceptance:** invalid rows do not corrupt data; role restriction works; only fictional examples exist; direct SQL is unnecessary for demonstrated manual ingestion.

### CATMS-072 — Finalize report objects, reconcile totals and tune indexes

- **Owner:** Dev5
- **Reviewers:** Dev1, Dev2, Dev3, Dev4
- **Effort:** L
- **Labels:** `module:E-reports-data`, `layer:database`, `financial`
- **Dependencies:** CATMS-041, CATMS-064, CATMS-070
- **Deliverables:** final R1–R5 views/functions, indexes, expected-vs-actual evidence and `EXPLAIN ANALYZE` plans.
- **Acceptance:** raw SQL/API/table/chart values agree; filters/date boundaries pass; each report meets 2-second target; every index has measured justification.

### CATMS-073 — Run scheduling concurrency and performance NFR suite

- **Owner:** Dev1
- **Reviewer:** Dev5
- **Effort:** M
- **Labels:** `module:C-scheduling`, `layer:test`, `concurrency`
- **Dependencies:** CATMS-031, CATMS-070
- **Deliverables:** 5–10 simultaneous collisions, representative reads, timing and query-plan evidence.
- **Acceptance:** exactly one conflicting booking commits; target response is under 200 ms in approved environment; no deadlocks/corruption.

### CATMS-074 — Perform complete authentication/RBAC/security audit

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** M
- **Labels:** `module:A-staff`, `security`, `layer:test`
- **Dependencies:** CATMS-047, CATMS-065, CATMS-070
- **Deliverables:** UI/API/DB role matrix execution, injection check, password/secrets/log review and dependency/config checklist.
- **Acceptance:** all negative permissions fail at required layers; no plaintext credential/secret/real patient data; findings fixed or release-blocking.

### CATMS-075 — Reconcile privacy, policy and claim scenarios at scale

- **Owner:** Dev3
- **Reviewer:** Dev4
- **Effort:** M
- **Labels:** `module:B-patient-insurance`, `layer:test`, `financial`
- **Dependencies:** CATMS-040, CATMS-070
- **Deliverables:** multi-policy/expiry/suspension/cap/partial/rejected reconciliation and privacy-log checks.
- **Acceptance:** golden/bulk samples match hand calculations; no double allocation; sensitive identities absent from logs/evidence.

### CATMS-076 — Reconcile invoices, payments, reversals and forced rollback

- **Owner:** Dev4
- **Reviewer:** Dev3
- **Effort:** M
- **Labels:** `module:D-clinical-billing`, `layer:test`, `financial`
- **Dependencies:** CATMS-036, CATMS-070
- **Deliverables:** sample ledger reconciliation, concurrent/idempotent payment, reversal and induced-failure evidence.
- **Acceptance:** line/subtotal/liability/receipt/outstanding totals balance; no partial transaction; historical snapshots remain unchanged.

### CATMS-077 — Implement reset, backup, restore and offline-start runbook

- **Owner:** Dev1
- **Reviewer:** Dev2
- **Effort:** L
- **Labels:** `module:platform`, `layer:infra`, `type:feature`, `priority:critical`
- **Dependencies:** CATMS-070, CATMS-072
- **Deliverables:** safe explicit-target reset, tagged dump, restore verification, health checks and network-disabled start instructions.
- **Acceptance:** reset under 2 minutes; restore matches counts/checksums/known totals; core journey works without internet after preparation.

### CATMS-078 — Complete requirements/NFR traceability and evidence index

- **Owner:** Dev5
- **Reviewer:** Dev1
- **Effort:** S
- **Labels:** `module:E-reports-data`, `layer:docs`, `type:test`
- **Dependencies:** CATMS-072, CATMS-073, CATMS-074, CATMS-075, CATMS-076, CATMS-077
- **Deliverables:** every REQ/BR/NFR linked to migration, procedure/view, API, UI, automated/manual test, owner, reviewer and evidence.
- **Acceptance:** no mandatory requirement is blank; links resolve; evidence contains fictional/non-sensitive data only.

### CATMS-079 — Run accessibility, usability and second-user test

- **Owner:** Dev5
- **Reviewer:** Dev2
- **Effort:** S
- **Labels:** `module:E-reports-data`, `layer:test`, `layer:frontend`
- **Dependencies:** CATMS-069, CATMS-070
- **Deliverables:** keyboard/focus/labels/non-colour/error/loading/empty/tablet checks and uninstructed patient-booking test.
- **Acceptance:** critical flows have no blocking accessibility/usability issue; findings are filed and Severity 1/2 issues fixed before G6.

**Gate G5 exit:** data, reports, security, performance, recovery and traceability evidence are complete.

---

## 8. G6 — Release and demonstration

### CATMS-080 — Complete setup, module and troubleshooting runbooks

- **Owner:** Dev1
- **Reviewers:** every module owner for their section
- **Effort:** M
- **Labels:** `module:platform`, `layer:docs`, `type:integration`
- **Dependencies:** CATMS-077, CATMS-078
- **Deliverables:** clean setup, commands, architecture, module runbooks, common failures, reset/backup/restore and demo accounts.
- **Acceptance:** a non-author follows docs without unpublished knowledge; every developer can explain their module and one adjacent module.

### CATMS-081 — Run full regression and defect triage

- **Owner:** Dev5
- **Reviewer:** Dev1
- **Effort:** M
- **Labels:** `layer:test`, `cross-module`, `priority:critical`
- **Dependencies:** CATMS-078, CATMS-079, CATMS-080
- **Deliverables:** full checklist, defect severity/owner/status and release recommendation.
- **Acceptance:** zero open Severity 1/2; Severity 3 has workaround/owner; all gate evidence references final candidate.

### CATMS-082 — Verify clean clone on second machine

- **Owner:** Dev2
- **Reviewer:** Dev1
- **Effort:** S
- **Labels:** `layer:infra`, `layer:test`, `type:integration`
- **Dependencies:** CATMS-080, CATMS-081
- **Deliverables:** second-machine clone, environment setup, migration/seed/start and golden-journey evidence.
- **Acceptance:** no manual DB repair or hidden file is needed; documented commands work; UI/API/DB health checks pass.

### CATMS-083 — Build frozen release Compose profile and database artifact

- **Owner:** Dev1
- **Reviewers:** Dev2, Dev5
- **Effort:** M
- **Labels:** `module:platform`, `layer:infra`, `priority:critical`
- **Dependencies:** CATMS-077, CATMS-081, CATMS-082
- **Deliverables:** pinned DB/API/web profile, migration version, golden seed, final dump/checksum and offline dependency/image preparation.
- **Acceptance:** release starts identically on primary/backup machines; dump restores; no dev hot-reload or external service is required.

### CATMS-084 — Prepare timed demo, evidence pack and fallback recording

- **Owner:** Dev5
- **Reviewers:** Dev1, all presenters
- **Effort:** M
- **Labels:** `layer:docs`, `layer:test`, `cross-module`
- **Dependencies:** CATMS-081, CATMS-083
- **Deliverables:** 10–12 minute script, presenter ownership, bookmarks/IDs, SQL evidence, screenshots and short backup recording.
- **Acceptance:** every developer speaks for their module; required success/rejection proofs fit the time; fallback steps are rehearsed.

### CATMS-085 — Rehearse, approve go/no-go and tag v1.0-demo

- **Owner:** Dev1
- **Reviewers:** Dev5 and one independent module owner
- **Effort:** M
- **Labels:** `module:platform`, `type:integration`, `priority:critical`
- **Dependencies:** CATMS-083, CATMS-084
- **Deliverables:** two complete rehearsals, signed go/no-go, release notes and immutable Git tag.
- **Acceptance:** primary and backup laptops pass; final commit/evidence/dump correspond; tag is `v1.0-demo`; no required work remains.

**Gate G6 exit:** the tagged local product is working, demonstrable, recoverable and fully evidenced.

---

## 9. Member-wise issue order

Developers should follow these orders rather than selecting unrelated later work.

### Dev1 — critical path and integration

```text
001 -> 002 -> 009 -> 010 -> 011 -> 012 -> 013 -> 014 -> 022
-> 027 -> 028 -> 029 -> 030 -> 031
-> 043 -> 044 -> 050 -> 051
-> 056 -> 057 -> 061 -> 065 -> 069
-> 073 -> 077 -> 080 -> 083 -> 085
```

### Dev2 — staff, access and security

```text
003 -> 015 -> 016 -> 017 -> 023 -> 024
-> 045 -> 046 -> 047
-> 058 -> 066
-> 074 -> 082
```

### Dev3 — patient, insurance and claims

```text
006 -> 008 -> 018 -> [after CATMS-020] 019 -> [after CATMS-021] 025 -> 026
-> 037 -> 038 -> 039 -> 040
-> 048 -> 049
-> 059 -> 060 -> 067
-> 075
```

### Dev4 — clinical, invoicing and payments

```text
005 -> 020 -> 032 -> 033 -> 034 -> [after CATMS-039] 035 -> 036
-> 052 -> 053 -> 054
-> 062 -> 063 -> 068
-> 076
```

### Dev5 — lighter reports/data/verification track

```text
007 -> 021 -> 041 -> 042 -> 055 -> 064
-> 070 -> 071 -> 072 -> 078 -> 079
-> 081 -> 084
```

Issue count does not equal workload. Dev5’s issues are intentionally smaller/read-oriented; Dev1’s include the longest critical integration and concurrency work.

---

## 10. Smooth execution rules

### Daily working pattern

1. Pull/rebase personal feature branch from `develop`.
2. Move one Ready issue to In Progress.
3. Post expected completion and blocker status.
4. Implement only the issue’s declared files/contract.
5. Run module tests and clean migration where relevant.
6. Open PR using `Closes #<github-number>`.
7. Move to In Review, then Verification after approval.
8. Independent reviewer reproduces acceptance before Done.

### Branch naming

```text
feature/catms-028-appointment-exclusion
feature/catms-048-patient-insurance-api
test/catms-073-scheduling-performance
fix/catms-xxx-short-description
```

### Conflict prevention

- Never edit another owner’s module without notifying them and requesting review.
- Never edit a merged migration; add a corrective migration.
- Claim migration numbers before creating SQL files.
- Dev3 and Dev4 must not edit one combined Finance file simultaneously; CATMS-057 creates the boundary first.
- Shared API/bootstrap/Compose files require Dev1 review.
- Database roles/security changes require Dev2 review.
- Financial formula changes require Dev3 and Dev4 review plus an updated golden example.
- Report semantic changes require source-owner approval.
- Keep branches under three working days where possible.

### Integration rhythm

- Twice weekly: reset clean database, run migrations/fixture and execute golden journey.
- At each gate: owner demonstrates one success and one failure; reviewer signs evidence.
- Feature freeze begins after G5; only release-blocking fixes enter G6.

---

## 11. Product-completion coverage

Completing CATMS-001 through CATMS-085 covers:

- approved requirements, ERD and financial semantics;
- PostgreSQL schema, constraints, triggers/procedures, views and indexes;
- concurrency-safe appointment scheduling;
- clinical and financial transaction integrity;
- treatment-level insurance and multi-policy controls;
- local authentication and defence-in-depth RBAC;
- complete Express API;
- integration of the existing React frontend;
- controlled manual/local ingestion and deterministic seed data;
- five reconciled reports;
- database/API/UI/NFR tests;
- CI, reset, backup, restore and offline operation;
- clean-clone release and final demonstration.

Any newly discovered mandatory work must become a numbered follow-up issue linked to the requirement and inserted before the relevant gate. Do not hide new work inside an unrelated issue.

---

## 12. Later online-server migration — not part of the local v1 critical path

Do not mix hosting work into the 85 local-production issues. If the team later approves an online deployment, create a separate Phase 2 epic covering: hosting and regional data-residency decision; staging and production environments; TLS and domain setup; managed PostgreSQL migration rehearsal; encrypted secrets and key rotation; automated off-site backups and restore drill; deployment pipeline; centralized monitoring; and a rollback/runbook exercise. The application and migration design in this backlog must remain environment-driven so this later move does not require business-logic rewrites.
