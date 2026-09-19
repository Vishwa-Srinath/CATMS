# Dev2 Execution Plan — Branch, Staff, Access and Security

**Project:** CATMS (Clinic Appointment and Treatment Management System)  
**Owner:** Dev2 | **Load:** ~20% of the project  
**Domain:** Branch Management · Employee & Doctor Profiles · Specialties · User Authentication (bcrypt + JWT) · RBAC · Database Grants & Security  
**Sources:** `member_plan.md` §9 + `CATMS_Complete_GitHub_Issue_Backlog.md` (issue chain: 003 → 015 → 016 → 017 → 023 → 024 → 045 → 046 → 047 → 058 → 066)

---

## How to use this document

You are driving the security and organizational backbone of CATMS. Every user session, database privilege, branch boundary, and staff assignment flows through your tables, procedures, and middleware. Each step in this plan has:

| Field | Purpose |
|---|---|
| **What** | The concrete deliverable |
| **Why** | What breaks or what risk stays if you skip it |
| **Depends on** | Must be Done first — do not skip ahead |
| **AI prompt tip** | What to say to get a high-quality result from an AI |
| **Acceptance evidence** | How you prove it works across UI, API, and DB |

The plan follows the team gate structure (G0–G6) because your tables (`branch`, `employee`, `user_account`, `app_role`) and roles (`catms_reception`, `catms_clinician`, `catms_manager`, `catms_admin`, `catms_qa`) are prerequisites for all scheduling (Dev1), insurance (Dev3), billing (Dev4), and reporting (Dev5).

---

## Overall Progress

> Update this table as you complete steps. Legend: ⬜ Not started · 🟡 In progress · ✅ Done · 🛑 Blocked

| Step | Issue | Name | Gate | Status |
|:---:|:---:|---|:---:|:---:|
| 1 | CATMS-003 | Freeze user roles, branch scope & permission matrix | G0 | ✅ Done |
| 2 | CATMS-015 | Implement Branch and Employee schema | G1 | ⬜ Not started |
| 3 | CATMS-016 | Implement staff/manager assignment history schema | G1 | ⬜ Not started |
| 4 | CATMS-017 | Implement doctor, specialty, user-account and role schema | G1 | ⬜ Not started |
| 5 | CATMS-023 | Implement staff registration, assignment & deactivation procedures | G2 | ⬜ Not started |
| 6 | CATMS-024 | Implement manager/specialty integrity & database grants | G2 | ⬜ Not started |
| 7 | CATMS-045 | Implement authentication, session & password security API | G3 | ⬜ Not started |
| 8 | CATMS-046 | Implement Branch, Staff & Access API | G3 | ⬜ Not started |
| 9 | CATMS-047 | Add authentication & administration API tests | G3 | ⬜ Not started |
| 10 | CATMS-058 | Connect Administration, staff & security frontend screens | G4 | ⬜ Not started |
| 11 | CATMS-066 | Add Administration frontend tests | G4 | ⬜ Not started |

---

## Phase G0 — Decisions and contracts

> **TL;DR:** Lock down roles, branch scopes, and the 3-layer security enforcement model *before* writing any SQL DDL or Express middleware.

---

### Step 1 — CATMS-003: Freeze user roles, branch scope and permission matrix
- [x] Canonical roles defined: Reception, Clinician, Branch Manager, Admin/Finance, QA
- [x] Branch-manager report access conflict resolved (operational R1/R4 allowed for assigned branch; financial R2/R3/R5 denied; BR-6 amended)
- [x] All-branch vs single-branch authority rules formalized
- [x] 3-layer permission matrix documented across Database, API, and UI (see `docs/CATMS-003_User_Roles_Branch_Scope_and_Permission_Matrix.md`)
- [x] Dev1 sign-off achieved

**What:** Authoritative decision document codifying permissions for all 5 roles across all database procedures/views, Express API routes, and React UI routes.

**Why:** Prevents security loopholes where an API endpoint checks a role but PostgreSQL allows raw table writes, or where the UI hides a tab but an unauthenticated actor can bypass it.

**Depends on:** CATMS-001 (Document Precedence & Scope)

**AI prompt tip:**
> "I need to document the RBAC permission matrix for a multi-branch clinic management system. Roles: Receptionist, Clinician, Branch Manager, Admin/Finance, QA. Resolve the SRS conflict where BR-6 prohibits non-admins from reports but §4.6.2 grants Branch Managers daily appointment summaries. Define 3-layer enforcement across PostgreSQL roles/grants, Express RBAC middleware, and React UI route guards."

**Acceptance evidence:**
- Branch-manager report conflict is explicitly resolved in writing.
- Every protected action maps to UI route, API route, and DB procedure/grant.
- All-branch access rules are explicit for Admin vs single-branch for Manager/Reception.

---

## Phase G1 — Foundational schema

> **TL;DR:** Build Branch, Employee, Assignment, Doctor, Specialty, and User Account tables in migration range `020–039`.

---

### Step 2 — CATMS-015: Implement Branch and Employee schema
- [ ] Migration file created in range `020–039` (e.g., `020_create_branch_and_employee.sql`)
- [ ] Tables: `branch`, `employee`
- [ ] Columns, PKs (`BIGINT GENERATED ALWAYS AS IDENTITY`), FKs, and `COMMENT ON` statements
- [ ] Normalized unique constraints: `branch.code`, `branch.name`, `employee.nic`, `employee.employee_number`
- [ ] Deletion policy: `ON DELETE RESTRICT` on historical employee references

**What:** Physical tables for branches (Colombo, Kandy, Galle) and clinic staff with strict uniqueness on NIC and employee numbers.

**Why:** NIC uniqueness clinic-wide prevents duplicate employee records across branches. `RESTRICT` deletion policy ensures audit trails and historical consultations never point to orphaned staff.

**Depends on:** CATMS-002 (Production ERD & Naming), CATMS-012 (Migration tool & schema baseline)

**AI prompt tip:**
> "Generate a PostgreSQL 16 migration for `branch` and `employee` tables. Use BIGINT GENERATED ALWAYS AS IDENTITY PKs, citext for NIC/codes, snake_case naming. Enforce unique constraints on branch code/name and employee NIC and employee number. Add CHECK constraint on gender and date of birth in the past. Include COMMENT ON for every table and column, and migration tracking INSERT."

**Acceptance evidence:**
- Duplicate NIC or employee number causes immediate unique violation.
- Attempting to hard-delete an employee with appointments/records is blocked by PostgreSQL.

---

### Step 3 — CATMS-016: Implement staff/manager assignment history schema
- [ ] Tables: `employee_branch_assignment`, `branch_manager_assignment`
- [ ] Temporal ranges (`valid_from`, `valid_to`) with `CHECK (valid_to >= valid_from)`
- [ ] Partial unique constraint: At most one active `PRIMARY` branch assignment per employee (`WHERE is_active = TRUE AND assignment_type = 'PRIMARY'`)
- [ ] Partial unique constraint: At most one active manager per branch (`WHERE is_active = TRUE`)

**What:** Historical and active staff assignments to physical clinic branches and branch manager appointments.

**Why:** Staff may transfer branches or float between locations; branches must always have at most one designated active manager. Partial unique indexes enforce this at the database level.

**Depends on:** CATMS-015

**AI prompt tip:**
> "Write a PostgreSQL migration for `employee_branch_assignment` and `branch_manager_assignment`. Requirements: (1) Temporal valid_from and valid_to with validity check. (2) Partial unique index ensuring each employee has at most one active PRIMARY assignment. (3) Partial unique index ensuring each branch has at most one active manager. (4) FKs with ON DELETE RESTRICT."

**Acceptance evidence:**
- Inserting two active `PRIMARY` branch assignments for one employee fails.
- Assigning two active managers to the same branch fails.

---

### Step 4 — CATMS-017: Implement doctor, specialty, user-account and role schema
- [ ] Tables: `doctor_profile`, `specialty`, `doctor_specialty`, `user_account`, `app_role`, `user_account_role`, `audit_event`
- [ ] Shared PK between `doctor_profile.id` and `employee.id` (1-to-1 subtype)
- [ ] Medical licence unique constraint (`citext` / case-insensitive)
- [ ] `user_account` stores `password_hash` (bcrypt), `status` (`ACTIVE`, `LOCKED`, `DISABLED`)
- [ ] `audit_event` append-only audit trail table

**What:** Doctor specialization models, credentials storage, role assignments, and security audit log schema.

**Why:** Separates credentials from clinical data (NFR-9). Doctor subtype inheritance ensures doctors are legitimate employees. Audit events provide forensic traceability.

**Depends on:** CATMS-015, CATMS-016

**AI prompt tip:**
> "Generate a PostgreSQL migration for `doctor_profile`, `specialty`, `doctor_specialty`, `user_account`, `app_role`, `user_account_role`, and `audit_event`. `doctor_profile` must share PK with `employee` (id BIGINT PRIMARY KEY REFERENCES employee(id)). Unique licence number with citext. `user_account` must store password_hash, failed_login_attempts, and status enum. `audit_event` must be append-only with event_type, actor_id, payload JSONB, and created_at."

**Acceptance evidence:**
- Unique licence and username constraints work.
- User account holds zero plain-text passwords or clinical text.

---

## Phase G2 — Database rules and transactions

> **TL;DR:** Implement stored procedures for atomic registration, branch transfers, deactivations, and configure native PostgreSQL roles and privileges.

---

### Step 5 — CATMS-023: Implement staff registration, assignment and deactivation procedures
- [ ] Procedure: `register_employee(p_name, p_nic, p_role, p_branch_id, ...)`
- [ ] Procedure: `register_doctor_profile(p_employee_id, p_license_no, p_fee, p_specialty_ids)`
- [ ] Procedure: `transfer_employee_branch(p_employee_id, p_new_branch_id, p_type)`
- [ ] Procedure: `deactivate_employee(p_employee_id, p_reason)`
- [ ] Invariant checks: Doctor profile requires employee position = `Doctor`. Soft-deactivation closes active assignments.

**What:** Atomic transactional procedures for employee lifecycle management.

**Why:** Changing an employee's branch or deactivating them requires multiple table mutations (closing old assignment, inserting new assignment, updating account status) that must succeed or fail atomically.

**Depends on:** CATMS-016, CATMS-017

**AI prompt tip:**
> "Write PostgreSQL stored procedures for employee administration: (1) `register_employee` creating employee, initial primary branch assignment, and user account in one transaction. (2) `register_doctor_profile` verifying employee position is 'Doctor' before creating doctor_profile and attaching specialty IDs. (3) `transfer_employee_branch` closing active assignment and inserting new assignment atomically. (4) `deactivate_employee` closing assignments, disabling user account, and logging audit_event."

**Acceptance evidence:**
- Registering a doctor without the `Doctor` role fails and rolls back fully.
- Deactivating an employee sets `is_active = FALSE` and closes assignment timestamps without deleting records.

---

### Step 6 — CATMS-024: Implement manager/specialty integrity and database grants
- [ ] Procedure: `assign_branch_manager(p_branch_id, p_employee_id)` with manager validation
- [ ] Database roles created: `catms_reception`, `catms_clinician`, `catms_manager`, `catms_admin`, `catms_qa`
- [ ] Object privileges configured (`GRANT` / `REVOKE`) per CATMS-003 matrix
- [ ] SQL test suite in `database/tests/rules/` verifying direct database permission denials

**What:** Integrity checks ensuring active managers belong to the branch and have position `Manager`, plus creation of PostgreSQL security roles.

**Why:** Proves Gate G2 requirement: direct database role cannot bypass security rules even if connected directly through `psql`.

**Depends on:** CATMS-003, CATMS-023

**AI prompt tip:**
> "Write a PostgreSQL migration creating roles: `catms_reception`, `catms_clinician`, `catms_manager`, `catms_admin`, `catms_qa`. Apply GRANT and REVOKE rules matching CATMS-003: catms_reception cannot SELECT from payment, invoice, or consultation notes; catms_manager can SELECT v_daily_appointment_summary and v_treatment_category_report but is DENIED financial reports; catms_admin has full rights. Include procedure `assign_branch_manager` verifying employee position = 'Manager' and employee active at that branch."

**Acceptance evidence:**
- Assigning a non-Manager employee as branch manager is rejected.
- Direct query `SET LOCAL ROLE catms_reception; SELECT * FROM payment;` raises SQLSTATE `42501` (`insufficient_privilege`).

---

## Phase G3 — Thin REST API & platform tests

> **TL;DR:** Build Express authentication and administration endpoints with Zod validation, JWT cookies, rate limiting, and RBAC guards.

---

### Step 7 — CATMS-045: Implement authentication, session and password security API
- [ ] Express module: `backend/src/modules/auth-staff/auth.routes.ts`, `auth.service.ts`, `auth.schema.ts`
- [ ] Password verification using `bcrypt.compare`
- [ ] Signed `HttpOnly`, `SameSite=Lax`, `Secure` JWT cookie
- [ ] Rate limiting on `/api/v1/auth/login` (brute-force protection)
- [ ] Account lockout handling (`LOCKED` after repeated failures)
- [ ] Authentication middleware `requireAuth` and session endpoint `GET /api/v1/auth/me`

**What:** Production-grade authentication and session lifecycle management.

**Why:** Protects credentials in transit and rest; HttpOnly cookies prevent XSS credential theft.

**Depends on:** CATMS-017, CATMS-024, CATMS-043

**AI prompt tip:**
> "Build the Express auth module for CATMS: (1) `POST /api/v1/auth/login` validating username/password with bcrypt, tracking failed attempts, locking account after 5 failures, issuing JWT in HttpOnly cookie. (2) `POST /api/v1/auth/logout` clearing cookie and logging audit event. (3) `GET /api/v1/auth/me` returning current session payload. (4) Middleware `requireAuth` verifying JWT and attaching `req.user` with role and branchId."

**Acceptance evidence:**
- Correct password sets HttpOnly cookie and returns user session.
- Disabled or locked accounts cannot authenticate.
- Password hashes and tokens never appear in response payloads or server logs.

---

### Step 8 — CATMS-046: Implement Branch, Staff and Access API
- [ ] Endpoints:
  - `GET, POST, PUT /api/v1/branches`
  - `GET, POST /api/v1/employees`
  - `DELETE /api/v1/employees/:id` (Deactivation)
  - `POST /api/v1/branches/:id/manager`
  - `POST /api/v1/doctors`
  - `GET, POST /api/v1/admin/users`
- [ ] Route guards: `requireRole('Admin')`, `requireRole('Admin', 'Manager')`
- [ ] Zod schema validation stripping client-supplied IDs or maintained timestamps
- [ ] Invocation of stored procedures via `withTransaction()`

**What:** REST endpoints for organizational and staff administration.

**Why:** Allows the administration UI to manage branches, staff, doctors, and role assignments securely.

**Depends on:** CATMS-023, CATMS-024, CATMS-045

**AI prompt tip:**
> "Build Express routes for `backend/src/modules/auth-staff/staff.routes.ts`. Implement endpoints for branch listing, employee registration, doctor specialization attachment, and employee deactivation. Enforce `requireRole('Admin')` on mutations and `requireRole('Admin', 'Manager')` on employee listings. Use `withTransaction()` with `SET LOCAL ROLE` in service layer."

**Acceptance evidence:**
- Non-admin calling `POST /api/v1/employees` receives `403 Forbidden`.
- Successful staff registration calls `register_employee()` and returns `201 Created`.

---

### Step 9 — CATMS-047: Add authentication and administration API tests
- [ ] Supertest integration tests in `backend/tests/auth-staff.test.ts`
- [ ] Test cases:
  - Login success & invalid credentials rejection
  - Account locking after consecutive failed attempts
  - CSRF protection and missing token rejection
  - Role-based authorization matrix (Reception vs Admin access)
  - Parameterized query verification (SQL injection payload tests)
  - Negative database role denial test via API execution

**What:** Automated regression test suite for authentication, authorization, and staff administration.

**Why:** Proves Gate G3 requirement: all required operations work through API tests with two-layer RBAC.

**Depends on:** CATMS-045, CATMS-046

**AI prompt tip:**
> "Write Supertest integration tests for CATMS auth and staff endpoints. Test: (1) Valid login sets cookie. (2) 5 invalid attempts locks account. (3) Reception user calling POST /api/v1/employees receives 403. (4) Admin successfully registers staff. (5) SQL injection payloads in login and employee search fail harmlessly. (6) Calling an endpoint with altered role header fails at DB SET LOCAL ROLE."

**Acceptance evidence:**
- All Supertest tests pass in clean CI runner.
- Injection payloads (`' OR 1=1 --`) result in harmless validation errors.

---

## Phase G4 — Frontend integration and QA journeys

> **TL;DR:** Connect the React Administration and Login screens to real API endpoints, removing in-memory mock mutations.

---

### Step 10 — CATMS-058: Connect Administration, staff and security frontend screens
- [ ] Update `frontend/src/features/administration/` with TanStack Query hooks and API clients
- [ ] Connect `LoginPage.tsx` to `/api/v1/auth/login`
- [ ] Connect `AdministrationPage.tsx` tabs:
  - Branches tab (list, add, edit)
  - Staff tab (list, filter by branch, add employee, assign doctor specialty, transfer branch, deactivate)
  - User Accounts tab (view accounts, change role, unlock)
  - Audit Trail tab (view security and procedural audit log)
- [ ] Synchronize session with `useClinic()` hook

**What:** Live integration of the Administration feature with the backend API.

**Why:** Allows administrators to manage clinic staff and QA testers to log in as different roles from the browser.

**Depends on:** CATMS-046, CATMS-056, CATMS-057

**AI prompt tip:**
> "Connect `AdministrationPage.tsx` and `LoginPage.tsx` to the real backend API. Replace ClinicContext mock mutations with TanStack Query hooks in `frontend/src/features/administration/hooks/`. Handle loading, error, empty, and forbidden states. Implement disabled action buttons with tooltips showing business rules. Show toast notifications on error/success."

**Acceptance evidence:**
- Refreshing the browser preserves active session.
- Adding an employee through the UI creates rows in PostgreSQL.
- Deactivated employee immediately cannot log in.

---

### Step 11 — CATMS-066: Add Administration frontend tests
- [ ] Component and journey tests for `LoginPage` and `AdministrationPage`
- [ ] Verify role-based navigation and route guarding (`ProtectedPage`)
- [ ] Verify disabled action states show explanatory tooltips
- [ ] Verify toast alerts on server-side rejection

**What:** Automated frontend test suite for authentication and administration UI.

**Why:** Proves Gate G4 requirement: every operational requirement can be exercised from the browser against live PostgreSQL.

**Depends on:** CATMS-058

**AI prompt tip:**
> "Write Vitest / React Testing Library tests for `AdministrationPage` and `LoginPage`: (1) ProtectedPage redirects unauthenticated users to /login and unauthorized roles to /. (2) Login form submits credentials and handles error toasts. (3) Staff tab renders active employees. (4) Disabled action buttons display hover tooltip with business rule rationale."

**Acceptance evidence:**
- Frontend test suite passes (`npm run test`).
- Unauthorized navigation is blocked and redirected to `/`.

---

## Phase G5 & G6 — Hardening, Rehearsal and Release

1. **Gate G5 (NFR & Audit Hardening):**
   - Verify rate limiting under concurrent load (NFR-1 / NFR-3).
   - Audit log completeness: every login, role change, and deactivation captured in `audit_event`.
2. **Gate G6 (Final Rehearsal & Sign-Off):**
   - Seeded demonstration journey: Log in as Admin, create Colombo staff member, log in as Reception, verify branch boundary, log in as Manager, verify R1/R4 report access and R2/R3/R5 denial.
   - Tag release `v1.0-demo`.
