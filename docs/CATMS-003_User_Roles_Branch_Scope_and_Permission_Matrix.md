# CATMS-003: Decision Document — User Roles, Branch Scope, and 3-Layer Permission Matrix

**Project:** Clinic Appointment and Treatment Management System (CATMS)  
**Issue Key:** CATMS-003  
**Gate:** G0 (Decisions & Contracts)  
**Owner:** Dev2 (Branch, Staff, Access & Security)  
**Reviewer / Sign-off:** Dev1 (Platform & Scheduling)  
**Status:** COMPLETE - SIGNED & FROZEN BASELINE  
**Labels:** `type:decision`, `module:A-staff`, `security`, `priority:critical`  
**Dependencies:** CATMS-001 (Document Precedence & Scope)

---

## 1. Executive Summary & Problem Statement

In a multi-branch healthcare management system operating across physical facilities (Colombo, Kandy, Galle), clinical, operational, and financial assets require strict, multi-layered authorization. The system architecture mandates **defence-in-depth**: security and business boundaries cannot rely solely on frontend visibility or API controllers, but must be anchored in the **database engine (PostgreSQL 16)** as the ultimate source of truth.

Prior to this decision document, two critical security ambiguities created implementation risks:
1. **The Branch-Manager Report Access Conflict:**
   - In SRS §2.3 and §4.6.2, a Branch Manager is explicitly designated to review branch-level operational data, specifically: *"Branch manager requests the daily appointment summary for their branch → system returns counts of Scheduled, Completed, and Cancelled appointments for the selected date."*
   - Conversely, in SRS §5.5 (Business Rule BR-6), the text states: *"Only staff with the Admin/Finance role may access billing internals, insurance claim approval, or the five management reports; Reception and Clinician roles are scoped to their respective operational tasks (Section 2.3)."*
   - This drafting contradiction creates a deadlock: either the Branch Manager cannot access their required operational summary, or BR-6 is violated without architectural justification.
2. **Ambiguity in Branch Scoping & All-Branch Authority:**
   - The boundary between clinic-wide operations (e.g., patient identity master search, administrative configuration) and branch-confined operations (e.g., local doctor schedules, cash drawer reconciliation, local branch manager oversight) was not formalized across database procedures, API endpoints, and UI views.

This decision document **freezes the canonical user roles, resolves the report access conflict, formalizes all-branch versus single-branch access rules, and provides a binding 3-layer permission matrix** across Database, API, and UI.

---

## 2. Canonical User Roles & Taxonomy

CATMS defines five (5) distinct application and database security roles. Every authenticated user maps to exactly one primary active role per session.

| Role Identifier | Display Label | Description & Primary Responsibilities | Scope Default |
|---|---|---|---|
| `Reception` | **Receptionist** | Front-desk staff managing patient check-in, registration, appointment scheduling, rescheduling, cancellations, and walk-ins. | Assigned Branch (Scheduling) / Clinic-Wide (Patient Search) |
| `Clinician` | **Doctor / Clinician** | Medical practitioners recording clinical consultation notes, diagnoses, vital signs, and delivered treatments against completed appointments. | Assigned Branch (Consultations) / Clinic-Wide (Patient History) |
| `Manager` | **Branch Manager** | Operational overseer of a designated clinic branch. Monitors staff schedules, daily appointment flow, and operational throughput for their branch. | Strictly Assigned Branch |
| `Admin` | **Admin / Finance** | System administrators and finance officers managing clinic configuration, branches, staff onboarding, billing, payments, payment reversals, insurance claims adjudication, and high-level management reporting. | Clinic-Wide (`all-branch`) |
| `QA` | **QA Auditor / Inspector** | Verification and compliance role used to test database invariants, inspect audit logs, and exercise operational journeys without executing raw SQL. Read-only on clinical/financial mutations. | Clinic-Wide (Inspection) |

---

## 3. Resolution of the Branch-Manager Report Access Conflict

### 3.1 Conflict Analysis
- **Source A (SRS §2.3 & §4.6.2):** Explicitly specifies that a Branch Manager reviews operational reports, specifically the daily appointment summary (R1) for their branch.
- **Source B (SRS §5.5 BR-6):** Broadly declares that *"Only staff with the Admin/Finance role may access billing internals, insurance claim approval, or the five management reports..."*

### 3.2 Authoritative Resolution Decision
The conflict is formally resolved as follows:

1. **Operational vs. Financial Report Classification:**
   The five management reports are formally split into two security categories:
   - **Operational Management Reports:**
     - **R1:** Branch-wise Daily Appointment Summary (Scheduled, Completed, Cancelled).
     - **R4:** Treatment Counts Delivered by Category over a date range.
   - **Financial Management Reports:**
     - **R2:** Doctor Gross Revenue and Actual Collections.
     - **R3:** Patient Outstanding Balances and Aging Dues.
     - **R5:** Approved Insurance Coverage vs. Out-of-Pocket Collections by Month.

2. **Branch Manager Access Entitlement:**
   - A **Branch Manager IS GRANTED ACCESS** to **Report R1** and **Report R4**, strictly filtered to their own assigned branch (`branch_id = session.branch_id`).
   - A **Branch Manager IS STRICTLY DENIED ACCESS** to **Reports R2, R3, and R5**. Financial ledgers, doctor revenue breakdowns, and patient debt lists remain restricted to Admin/Finance.
   - A Branch Manager CANNOT query R1 or R4 for any branch other than their assigned branch.

3. **Admin/Finance Access Entitlement:**
   - Staff with the **Admin/Finance** role retain full, unrestricted access to **all five reports (R1, R2, R3, R4, R5)** across all branches (`branch_id = 'all'` or filtered to any specific branch).

4. **Reception & Clinician Report Restriction:**
   - **Reception** and **Clinician** roles are **STRICTLY DENIED** access to all five reports (R1–R5). They have no access to the `/reports` UI route, no access to `/api/v1/reports/*` API endpoints, and execute/select privileges are revoked in PostgreSQL.

5. **Formal Amendment to Business Rule BR-6:**
   > **Amended Business Rule BR-6 (Binding Text):**  
   > *"Only staff with the Admin/Finance role may access billing internals, insurance claim resolution, or financial management reports (R2, R3, R5). Branch Managers may access operational management reports (R1, R4) strictly scoped to their assigned branch. Reception and Clinician roles are scoped exclusively to their operational front-desk and clinical tasks, and are prohibited from accessing any management reports."*

---

## 4. Branch Scope Architecture & All-Branch Authority

### 4.1 Underlying Entity Model
Multi-branch scoping is rooted in Module A relations:
- `branch`: The physical clinic location (`id`, `code`, `name`, `city`, `address`, `phone`, `is_active`).
- `employee_branch_assignment`: Maps an `employee_id` to a `branch_id` with `assignment_type` (`PRIMARY` or `SECONDARY`), effective dates (`valid_from`, `valid_to`), and a partial unique constraint ensuring **at most one active PRIMARY branch assignment per employee**.
- `branch_manager_assignment`: Maps a `branch_id` to an active `employee_id` where the employee holds the `Manager` position, ensuring **at most one active manager per branch**.
- `user_account`: Holds credentials, username, and account status (`ACTIVE`, `LOCKED`, `DISABLED`).
- `user_account_role`: Maps a user account to an `app_role` (`Receptionist`, `Clinician`, `Manager`, `Admin`, `QA`).

### 4.2 Branch Scope Matrix

| Role | Branch Context in Session | Cross-Branch Query Allowed? | Branch Context Modification Allowed? | Invariant Rule |
|---|---|---|---|---|
| **Admin / Finance** | `all` (or selected branch) | **YES (Clinic-Wide)** | **YES** | Can toggle between `all` and specific branches (Colombo, Kandy, Galle) via header selector. |
| **Branch Manager** | Fixed to assigned `branch_id` | **NO (Strictly Denied)** | **NO (Locked)** | Header branch selector is disabled/read-only. API rejects requests where query `branchId != session.branchId`. |
| **Receptionist** | Fixed to assigned `branch_id` | **NO for Appointments / Doctors**; **YES for Patient Master Search** | **NO (Locked)** | Appointments, walk-ins, and doctor day views are locked to home branch. Patient registry search/lookup is clinic-wide. |
| **Clinician** | Fixed to consultation `branch_id` | **NO for Scheduling**; **YES for Patient History** | **NO (Locked)** | Can only conduct appointments scheduled at their active branch. Can view complete clinical history of a patient regardless of visit branch. |
| **QA Auditor** | `all` (or selected branch) | **YES (Inspection only)** | **YES** | Read-only inspection across all branches to verify database integrity. |

### 4.3 Clinic-Wide Patient Master Invariant
To prevent fragmented medical records across branches, **patient identity is clinic-wide**:
1. `patient` and `patient_identity` tables have clinic-wide uniqueness on normalized National Identity Card (NIC) or Passport number.
2. A patient registered at the Colombo branch may be searched, booked, and treated at the Kandy or Galle branch without re-registration.
3. Every staff member with `Reception`, `Clinician`, `Manager`, `Admin`, or `QA` role has read access to the clinic-wide patient search index (`v_patient_search`).

---

## 5. The 3-Layer Security Enforcement Model

Security is enforced synchronously at three distinct boundaries:

```
[Layer 1: Browser UI (React)]
  ├─ ProtectedPage route guard (redirects unauthorized roles to /)
  ├─ Sidebar navigation item conditional rendering
  └─ Action buttons: disabled with tooltip rule rationale if precondition fails

[Layer 2: REST API (Express + TypeScript)]
  ├─ requireAuth: validates signed HttpOnly JWT cookie
  ├─ requireRole([...]): rejects unauthorized HTTP calls with 403 Forbidden
  ├─ enforceBranchScope: validates branchId against session claims
  └─ Zod schema validation: strips client-supplied totals, status, and audit fields

[Layer 3: Database Engine (PostgreSQL 16)]
  ├─ SET LOCAL ROLE inside withTransaction() per request
  ├─ Dedicated database roles: catms_reception, catms_clinician, catms_manager, catms_admin, catms_qa
  ├─ Table-level & View-level GRANT / REVOKE privileges
  ├─ Controlled stored procedures (SECURITY DEFINER / INVOKER with explicit caller checks)
  └─ CHECK constraints, GiST exclusion constraints, and trigger-maintained financial fields
```

---

## 6. Comprehensive 3-Layer Permission Enforcement Matrix

The following matrix defines every protected operational and reporting action in CATMS across the three architectural layers.

| Domain Area | Protected Action | Permitted Roles | Layer 1: UI Enforcement | Layer 2: API Route & Guard | Layer 3: DB Role & Privilege |
|---|---|---|---|---|---|
| **Auth** | Staff Login | *Public* | `/login` form | `POST /api/v1/auth/login` (Rate limited) | `EXECUTE ON FUNCTION authenticate_user()` |
| **Auth** | Staff Logout | *All authenticated* | User menu → Logout button | `POST /api/v1/auth/logout` | `REVOKE` session token |
| **Auth** | Session Refresh | *All authenticated* | Transparent silent refresh | `GET /api/v1/auth/me` | `SELECT` on `v_user_session` |
| **Staff & Branch** | View Branches | All | Branch selector / Settings view | `GET /api/v1/branches` | `SELECT ON branch` (`catms_app_user`) |
| **Staff & Branch** | Create / Update Branch | Admin | `/administration` (Branch tab) | `POST, PUT /api/v1/branches` (`requireRole('Admin')`) | `INSERT, UPDATE ON branch` (`catms_admin`) |
| **Staff & Branch** | View Staff & Employees | Admin, Manager | `/administration` (Staff tab) | `GET /api/v1/employees` (`requireRole('Admin', 'Manager')`) | `SELECT ON employee, employee_branch_assignment` |
| **Staff & Branch** | Register Employee | Admin | Button `+ Add Employee` in Admin UI | `POST /api/v1/employees` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE register_employee()` (`catms_admin`) |
| **Staff & Branch** | Assign Employee to Branch | Admin | Modal `Assign Branch` in Admin UI | `POST /api/v1/employees/:id/assignments` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE assign_employee_branch()` (`catms_admin`) |
| **Staff & Branch** | Assign Branch Manager | Admin | Modal `Assign Manager` in Admin UI | `POST /api/v1/branches/:id/manager` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE assign_branch_manager()` (`catms_admin`) |
| **Staff & Branch** | Deactivate Employee | Admin | Action `Deactivate Employee` (Admin UI) | `DELETE /api/v1/employees/:id` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE deactivate_employee()` (`catms_admin`) |
| **Doctor Profile** | Register Doctor & Specialties | Admin | Doctor Profile Form (Admin UI) | `POST /api/v1/doctors` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE register_doctor_profile()` (`catms_admin`) |
| **Doctor Profile** | View Doctor Profiles & Schedules | Reception, Clinician, Manager, Admin, QA | `/appointments` (Doctor Day View) | `GET /api/v1/doctors`, `GET /api/v1/doctors/:id/schedule` | `SELECT ON v_doctor_directory, doctor_availability` |
| **Patient Identity** | Clinic-Wide Patient Search | Reception, Clinician, Manager, Admin, QA | `/patients` search bar (NIC, name, phone) | `GET /api/v1/patients/search` | `SELECT ON v_patient_search` |
| **Patient Identity** | Register Patient | Reception, Admin | `/patients` (Button `+ New Patient`) | `POST /api/v1/patients` (`requireRole('Reception', 'Admin')`) | `EXECUTE ON PROCEDURE register_patient_atomic()` (`catms_reception`, `catms_admin`) |
| **Patient Identity** | Update Patient / Contacts | Reception, Admin | `/patients/:id` edit form | `PUT /api/v1/patients/:id` (`requireRole('Reception', 'Admin')`) | `UPDATE ON patient, emergency_contact` |
| **Insurance Policy** | Add / Manage Patient Policy | Reception, Admin | `/patients/:id` (Insurance tab) | `POST, PUT /api/v1/patients/:id/policies` (`requireRole('Reception', 'Admin')`) | `EXECUTE ON PROCEDURE attach_patient_policy()` |
| **Appointments** | View Branch Appointments | Reception, Clinician, Manager, Admin, QA | `/appointments` calendar/list view | `GET /api/v1/appointments` (`enforceBranchScope`) | `SELECT ON v_appointment_summary` |
| **Appointments** | Book Appointment | Reception, Admin | `/appointments` (Button `Book Slot`) | `POST /api/v1/appointments/book` (`requireRole('Reception', 'Admin')`) | `EXECUTE ON PROCEDURE book_appointment()` (`catms_reception`, `catms_admin`) |
| **Appointments** | Create Walk-in Appointment | Reception, Admin | `/appointments` (Button `+ Walk-in`) | `POST /api/v1/appointments/walk-in` (`requireRole('Reception', 'Admin')`) | `EXECUTE ON PROCEDURE create_walkin_appointment()` (`catms_reception`, `catms_admin`) |
| **Appointments** | Reschedule Appointment | Reception, Admin | Action `Reschedule Slot` in appointment row | `POST /api/v1/appointments/:id/reschedule` (`requireRole('Reception', 'Admin')`) | `EXECUTE ON PROCEDURE reschedule_appointment()` (`catms_reception`, `catms_admin`) |
| **Appointments** | Cancel Appointment | Reception, Admin | Action `Cancel Appointment` with reason | `POST /api/v1/appointments/:id/cancel` (`requireRole('Reception', 'Admin')`) | `EXECUTE ON PROCEDURE cancel_appointment()` (`catms_reception`, `catms_admin`) |
| **Appointments** | Mark Appointment Completed | Clinician, Admin | Action `Complete Appointment` in Clinical UI | `POST /api/v1/appointments/:id/complete` (`requireRole('Clinician', 'Admin')`) | `EXECUTE ON PROCEDURE complete_appointment()` (`catms_clinician`, `catms_admin`) |
| **Clinical Care** | View Completed Worklist | Clinician, Admin | `/clinical` (Consultation queue) | `GET /api/v1/clinical/worklist` (`requireRole('Clinician', 'Admin')`) | `SELECT ON v_clinical_worklist` (`catms_clinician`, `catms_admin`) |
| **Clinical Care** | Record Notes & Treatments | Clinician, Admin | `/clinical/:id` (Enabled ONLY if Completed) | `POST /api/v1/clinical/:id/record` (`requireRole('Clinician', 'Admin')`) | `EXECUTE ON PROCEDURE record_clinical_consultation()` (`catms_clinician`, `catms_admin`) |
| **Clinical Care** | View Patient Clinical History | Clinician, Admin | `/patients/:id/clinical-history` | `GET /api/v1/patients/:id/history` (`requireRole('Clinician', 'Admin')`) | `SELECT ON consultation_note_revision, appointment_treatment` |
| **Treatment Catalogue**| Manage Treatment Catalogue | Admin | `/administration` (Catalogue tab) | `POST, PUT, DELETE /api/v1/treatments` (`requireRole('Admin')`) | `INSERT, UPDATE ON treatment_catalogue` (`catms_admin`) |
| **Treatment Catalogue**| View Treatment Catalogue | All authenticated | Read-only selection dropdowns | `GET /api/v1/treatments` | `SELECT ON treatment_catalogue` (`catms_app_user`) |
| **Billing & Invoicing**| View Invoice Details | Clinician (view-only), Admin | `/finance` (Invoices tab) / Clinical summary | `GET /api/v1/invoices/:id` (`requireRole('Clinician', 'Admin')`) | `SELECT ON v_invoice_detail` (`catms_clinician`, `catms_admin`) |
| **Billing & Invoicing**| Post Payment | Admin | `/finance` (Modal `Post Payment`) | `POST /api/v1/payments` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE post_payment_idempotent()` (`catms_admin`) |
| **Billing & Invoicing**| Post Payment Reversal | Admin | `/finance` (Action `Reverse Payment`) | `POST /api/v1/payments/:id/reverse` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE reverse_payment()` (`catms_admin`) |
| **Insurance Claims** | Preview Claim Eligibility | Admin | `/finance` (Claims tab → New Claim) | `POST /api/v1/claims/preview` (`requireRole('Admin')`) | `EXECUTE ON FUNCTION preview_claim_eligibility()` (`catms_admin`) |
| **Insurance Claims** | Submit Insurance Claim | Admin | `/finance` (Claims tab → Submit) | `POST /api/v1/claims/submit` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE submit_insurance_claim()` (`catms_admin`) |
| **Insurance Claims** | Resolve Claim (Approve/Reject)| Admin | `/finance` (Claims tab → Adjudicate) | `POST /api/v1/claims/:id/resolve` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE resolve_insurance_claim()` (`catms_admin`) |
| **Reports (R1)** | Branch Daily Appointment Summary| Manager (Assigned Branch Only), Admin (Any/All), QA | `/reports` (Tab `R1: Daily Appointments`) | `GET /api/v1/reports/daily-appointments` (`requireRole('Manager', 'Admin', 'QA')`) | `SELECT ON v_daily_appointment_summary` |
| **Reports (R2)** | Doctor Revenue & Collections | Admin (Any/All), QA | `/reports` (Tab `R2: Doctor Revenue`) | `GET /api/v1/reports/doctor-revenue` (`requireRole('Admin', 'QA')`) | `SELECT ON v_doctor_revenue_report` (`catms_admin`, `catms_qa`) |
| **Reports (R3)** | Patient Outstanding Balances | Admin (Any/All), QA | `/reports` (Tab `R3: Outstanding Balances`) | `GET /api/v1/reports/patient-outstanding` (`requireRole('Admin', 'QA')`) | `SELECT ON v_patient_outstanding_report` (`catms_admin`, `catms_qa`) |
| **Reports (R4)** | Treatments Delivered by Category| Manager (Assigned Branch Only), Admin (Any/All), QA | `/reports` (Tab `R4: Treatment Categories`) | `GET /api/v1/reports/treatments-by-category` (`requireRole('Manager', 'Admin', 'QA')`) | `SELECT ON v_treatment_category_report` |
| **Reports (R5)** | Insurance vs Out-of-Pocket | Admin (Any/All), QA | `/reports` (Tab `R5: Insurance vs Cash`) | `GET /api/v1/reports/insurance-vs-cash` (`requireRole('Admin', 'QA')`) | `SELECT ON v_insurance_vs_pocket_report` (`catms_admin`, `catms_qa`) |
| **Administration** | User Account & Role Management | Admin | `/administration` (Accounts tab) | `POST, PUT /api/v1/admin/users` (`requireRole('Admin')`) | `EXECUTE ON PROCEDURE manage_user_account()` (`catms_admin`) |
| **Audit Logs** | View Security & State Audit Trail| Admin, QA | `/administration` (Audit tab) | `GET /api/v1/admin/audit-logs` (`requireRole('Admin', 'QA')`) | `SELECT ON audit_event, appointment_history, claim_status_log` |

---

## 7. Database Role Architecture & PostgreSQL Grants

### 7.1 Database Roles Taxonomy
PostgreSQL enforces privileges through native role accounts. Application connections authenticate through a secure runtime user (`catms_app_user`) and execute transactions using `SET LOCAL ROLE`:

```sql
-- Role definitions created in Migration 024
CREATE ROLE catms_reception NOINHERIT;
CREATE ROLE catms_clinician NOINHERIT;
CREATE ROLE catms_manager   NOINHERIT;
CREATE ROLE catms_admin     NOINHERIT;
CREATE ROLE catms_qa        NOINHERIT;
```

### 7.2 Database Grant Specifications by Role

#### Role: `catms_reception`
- **GRANT SELECT ON:** `branch`, `employee`, `employee_branch_assignment`, `doctor_profile`, `specialty`, `doctor_specialty`, `doctor_availability`, `patient`, `patient_identity`, `emergency_contact`, `insurance_provider`, `insurance_policy`, `policy_coverage`, `appointment`, `treatment_catalogue`, `v_patient_search`, `v_doctor_directory`, `v_appointment_summary`.
- **GRANT EXECUTE ON:** `register_patient_atomic()`, `attach_patient_policy()`, `book_appointment()`, `create_walkin_appointment()`, `reschedule_appointment()`, `cancel_appointment()`.
- **STRICTLY REVOKED (No Access):** `invoice`, `invoice_line`, `payment`, `payment_reversal`, `insurance_claim`, `insurance_claim_line`, `consultation_note_revision`, `appointment_treatment`, and all reporting views (`v_daily_appointment_summary`, `v_doctor_revenue_report`, etc.).

#### Role: `catms_clinician`
- **GRANT SELECT ON:** `branch`, `employee`, `doctor_profile`, `patient`, `emergency_contact`, `appointment`, `treatment_catalogue`, `consultation_note_revision`, `appointment_treatment`, `v_clinical_worklist`, `v_invoice_detail`.
- **GRANT EXECUTE ON:** `complete_appointment()`, `record_clinical_consultation()`.
- **STRICTLY REVOKED (No Access):** Direct `INSERT/UPDATE` on `invoice`, `payment`, `payment_reversal`, `insurance_claim`, and all reporting views.

#### Role: `catms_manager`
- **GRANT SELECT ON:** `branch`, `employee`, `employee_branch_assignment`, `branch_manager_assignment`, `doctor_profile`, `doctor_availability`, `appointment`, `treatment_catalogue`, `v_appointment_summary`, `v_daily_appointment_summary`, `v_treatment_category_report`.
- **GRANT EXECUTE ON:** None (Manager role in Phase 1 is supervisory and review-oriented).
- **STRICTLY REVOKED (No Access):** Base clinical tables (`consultation_note_revision`), base financial tables (`invoice`, `payment`, `payment_reversal`, `insurance_claim`), and financial reporting views (`v_doctor_revenue_report`, `v_patient_outstanding_report`, `v_insurance_vs_pocket_report`).

#### Role: `catms_admin`
- **GRANT SELECT, INSERT, UPDATE ON:** All domain tables across Module A, B, C, D, and E.
- **GRANT EXECUTE ON:** All stored procedures and functions: `register_employee()`, `assign_employee_branch()`, `assign_branch_manager()`, `deactivate_employee()`, `register_doctor_profile()`, `post_payment_idempotent()`, `reverse_payment()`, `preview_claim_eligibility()`, `submit_insurance_claim()`, `resolve_insurance_claim()`, `manage_user_account()`.
- **GRANT SELECT ON:** All reporting views (R1, R2, R3, R4, R5) without restriction.

#### Role: `catms_qa`
- **GRANT SELECT ON:** All application tables, history logs (`appointment_history`, `insurance_claim_status_log`), audit trail (`audit_event`), and reporting views (R1–R5).
- **STRICTLY REVOKED (No Access):** No `INSERT`, `UPDATE`, `DELETE`, or state-changing procedure execution on live clinical or financial ledgers.

### 7.3 Procedural `SET LOCAL ROLE` Invariant
All backend database transactions must invoke the role-switching helper inside the active transaction block before executing queries:

```typescript
// Enforced in backend/src/db/transaction.helper.ts
await client.query('BEGIN');
await client.query(`SET LOCAL ROLE ${roleMap[session.role]}`);
// execute queries / procedures
await client.query('COMMIT');
```

If an unauthorized role attempts to read or execute a restricted object, PostgreSQL immediately aborts the transaction with SQLSTATE `42501` (`insufficient_privilege`), ensuring zero privilege leakage even in the event of an API middleware defect.

---

## 8. UI Layer Guard & Disabled Action Policy

In accordance with the CATMS Design System (`docs/CATMS_Design_System.md`) and SRS §3.1 / §4.7:

1. **Navigation Item Visibility:**
   - The top/sidebar navigation only renders links to pages permitted for the authenticated role.
   - Unauthorized navigation attempts (direct URL entry) are intercepted by `<ProtectedPage roles={[...]}>` and redirected to `/` with an alert toast.

2. **Visible Action Disabling with Tooltips:**
   - Buttons and controls disabled due to business rules (e.g., `Record Treatment` on a `Scheduled` appointment, or `Submit Claim` with zero eligible policies) must be rendered in a visible disabled state (`disabled` attribute, `opacity-50`, `cursor-not-allowed`).
   - Every disabled button **must provide a hover tooltip** (`title` or custom tooltip) explaining the exact business invariant blocking the action (e.g., *"Treatments can only be recorded once appointment status is Completed (BR-2)"*).

3. **Role-Specific UI Screen Visibility Matrix:**

| Route / Screen | Receptionist | Clinician | Branch Manager | Admin / Finance | QA Auditor |
|---|:---:|:---:|:---:|:---:|:---:|
| `/` (Dashboard) | Visible | Visible | Visible | Visible | Visible |
| `/patients` (Patient Registry) | Visible | Visible | Hidden | Visible | Visible |
| `/appointments` (Scheduling) | Visible | Visible | Visible | Visible | Visible |
| `/clinical` (Consultations) | Hidden | Visible | Hidden | Visible | Visible |
| `/finance` (Billing, Payments & Claims) | Hidden | Hidden | Hidden | Visible | Visible |
| `/reports` (Management Reports) | **Hidden** | **Hidden** | **Visible (R1, R4 only)** | **Visible (All 5)** | **Visible (All 5)** |
| `/administration` (Staff & System) | Hidden | Hidden | Hidden | Visible | Visible |

---

## 9. Negative Testing & Verification Strategy

To guarantee compliance at Gate G0 and downstream Gates G2, G3, and G4, negative tests must verify that unauthorized operations fail across all three layers:

```mermaid
flowchart TD
    subgraph Layer1 [Layer 1: UI Verification]
        UI1[Reception user opens /reports] --> UI2[ProtectedPage redirects to /]
        UI3[Manager clicks R2 Doctor Revenue] --> UI4[Tab is hidden / disabled]
    end

    subgraph Layer2 [Layer 2: API Verification]
        API1[Reception calls POST /api/v1/payments] --> API2[requireRole returns 403 Forbidden]
        API3[Manager calls GET /api/v1/reports/doctor-revenue] --> API4[requireRole returns 403 Forbidden]
        API5[Manager requests Colombo data with Kandy session] --> API6[enforceBranchScope returns 403 Forbidden]
    end

    subgraph Layer3 [Layer 3: Database Verification]
        DB1[SET LOCAL ROLE catms_reception; SELECT * FROM payment;] --> DB2[PostgreSQL raises 42501 permission denied]
        DB3[SET LOCAL ROLE catms_clinician; CALL post_payment_idempotent(...);] --> DB4[PostgreSQL raises 42501 permission denied]
        DB5[SET LOCAL ROLE catms_manager; SELECT * FROM v_doctor_revenue_report;] --> DB6[PostgreSQL raises 42501 permission denied]
    end
```

---

## 10. Document Sign-off & Gate G0 Contract

This document forms the binding specification for Module A, authorization, and RBAC across the CATMS project. All five developers must adhere to these role boundaries, API guards, and database privileges.

- **Dev2 (Owner — Branch, Staff, Access & Security):** *SIGNED & FROZEN*  
- **Dev1 (Reviewer — Platform & Scheduling):** *SIGNED & FROZEN*  
- **Date:** 15 September 2026  
- **Revision:** 1.0.0 (Final G0 Baseline)
