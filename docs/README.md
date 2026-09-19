# CATMS — Documentation Hub

**Clinic Appointment and Treatment Management System**  
**Client:** MedSync Clinics · Colombo, Kandy, and Galle, Sri Lanka  
**Course:** CS3048 Database Management Systems  
**Release target:** `v1.0-demo` (local, reproducible, fully PostgreSQL-backed)

> **New to the project? Read this file first, then follow the reading order below.**  
> Every planning decision, task, and standard is already written down — do not guess, do not re-invent.

---

## What CATMS Is

CATMS replaces MedSync's disconnected paper records and spreadsheets with a single clinic-wide system covering the full patient journey:

```
Register patient → Book appointment → Complete consultation
                 → Record treatments → Generate invoice
                 → Take payment / submit insurance claim → View reports
```

The **database is the authority** for every business rule. PostgreSQL constraints, triggers, and stored procedures enforce correctness even when the application layer is bypassed. The React frontend is a role-gated QA and demonstration interface around the database — not the source of truth.

---

## Five-Person Team

| ID | Primary module | Cross-cutting role |
|---|---|---|
| **Dev1** — Team Lead | Module C · Appointment & Scheduling | Migrations, Docker, shared API platform, CI, integration, release |
| **Dev2** | Module A · Branch, Staff & Access | Authentication, RBAC, database grants |
| **Dev3** | Module B · Patient, Insurance & Claims | Claim eligibility, patient privacy checks |
| **Dev4** | Module D · Clinical Care, Invoices & Payments | Financial ACID, rollback tests |
| **Dev5** | Module E · Reports, Import & Demo Data | Report reconciliation, QA evidence, demo script |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL 16 (`btree_gist`, `citext`) |
| DB access | `node-postgres` (`pg`) — parameterized SQL, no ORM |
| Backend | Node.js 20 + Express + TypeScript |
| Validation | Zod |
| Auth | bcrypt + JWT in HttpOnly cookie |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Server state | TanStack Query |
| Local runtime | Docker Compose |
| CI | GitHub Actions |

---

## Documentation — Read in This Order

### For every new team member (read all of these before writing code)

| # | Document | What it contains |
|---|---|---|
| 1 | **This file** — `docs/README.md` | Project overview and doc navigation |
| 2 | [`docs/CODEBASE_GUIDE.md`](./CODEBASE_GUIDE.md) | Folder structure, file naming, coding standards, step-by-step feature checklist |
| 3 | [`docs/member_plan.md`](./member_plan.md) | Your specific task list, acceptance criteria, dependencies, and hand-off contracts |
| 4 | [`docs/CATMS_Complete_GitHub_Issue_Backlog.md`](./CATMS_Complete_GitHub_Issue_Backlog.md) | Every GitHub issue (CATMS-001 to CATMS-085), gate requirements, effort, and dependencies |
| 5 | [`docs/CATMS_Design_System.md`](./CATMS_Design_System.md) | Every UI color, typography, spacing, animation, and accessibility rule — read before any UI work |
| 6 | `docs/CATMS_SRS_new.pdf` | Full software requirements specification — the requirements authority |

### Reference documents (use when needed)

| Document | When to use it |
|---|---|
| [`docs/CATMS-003_User_Roles_Branch_Scope_and_Permission_Matrix.md`](./CATMS-003_User_Roles_Branch_Scope_and_Permission_Matrix.md) | Canonical user roles, branch scope rules, and 3-layer permission matrix (Dev2) |
| [`docs/CATMS-006_Insurance_Eligibility_and_Claim_Rules.md`](./CATMS-006_Insurance_Eligibility_and_Claim_Rules.md) | Insurance eligibility, multi-policy allocation, and claim state machine (Dev3) |
| [`docs/CATMS-008_Golden_Financial_Worked_Example.md`](./CATMS-008_Golden_Financial_Worked_Example.md) | Hand-calculated financial baseline and expected balances (Dev3 & Dev4) |
| `docs/CATMS_Production_Implementation_ERD.drawio` | Before writing any SQL — approve naming and relationships at Gate G0 |
| `docs/CATMS_Delivery_Plan.html` | Timeline, sprint structure, and milestone gates |
| `docs/CATMS_GitHub_Issue_Register.csv` | Quick lookup of all issue keys and ownership |

---

## Quick Reference by Developer

### Dev1 — Read first
`CODEBASE_GUIDE.md` → `member_plan.md §8` → Issues: CATMS-001, 004, 009, 010, 011, 012, 013, 014, 027, 028, 029, 030, 031, 043, 044, 050, 051, 056, 061, 065, 069

### Dev2 — Read first
`CODEBASE_GUIDE.md` → `member_plan.md §9` → [`Dev2_Plan.md`](./Dev2_Plan.md) → [`CATMS-003`](./CATMS-003_User_Roles_Branch_Scope_and_Permission_Matrix.md) → Issues: CATMS-003, 015, 016, 017, 023, 024, 045, 046, 047, 058, 066

### Dev3 — Read first
`CODEBASE_GUIDE.md` → `member_plan.md §10` → [`Dev3_Plan.md`](./Dev3_Plan.md) → [`CATMS-006`](./CATMS-006_Insurance_Eligibility_and_Claim_Rules.md) → Issues: CATMS-006, 008, 018, 019, 025, 026, 037, 038, 039, 040, 048, 049, 059, 060, 067

### Dev4 — Read first
`CODEBASE_GUIDE.md` → `member_plan.md §11` → [`CATMS-005`](./CATMS-005_Clinical_Price_and_Invoice_Rules.md) → Issues: CATMS-005, 008, 020, 032, 033, 034, 035, 036, 052, 053, 054, 062, 063, 068

### Dev5 — Read first
`CODEBASE_GUIDE.md` → `member_plan.md §12` → Issues: CATMS-007, 021, 041, 042, 055, 064, 070

---

## Delivery Gates — At a Glance

| Gate | What must pass before the next stage begins |
|---|---|
| **G0** | ERD, state machines, financial example, role matrix, report definitions, and migration ranges signed by all five developers |
| **G1** | Empty-database migration succeeds; foundational constraints and seeds pass on every machine |
| **G2** | All critical database rules pass when called directly against PostgreSQL (no API or frontend needed as proof) |
| **G3** | All required operations work through API tests with two-layer RBAC and database-controlled state |
| **G4** | Every operational requirement can be exercised from the browser against a live PostgreSQL database |
| **G5** | All NFR evidence recorded; reports match expected totals; backup/restore and reset proven on two machines |
| **G6** | Zero critical defects, two successful rehearsals, clean install verified — tag `v1.0-demo` |

---

## Core Database Rules (PostgreSQL Must Enforce These)

1. A doctor cannot hold two overlapping, non-cancelled appointments.
2. Treatments and consultation notes can be recorded only for a `Completed` appointment.
3. Invoice totals, insurance-covered amounts, and patient-payable amounts are maintained by database billing logic only.
4. A payment cannot make the total paid exceed the patient-payable amount.
5. Rescheduling and status changes must be written to immutable audit trails.
6. A branch manager must be an active employee with the Manager role at that branch.
7. Employee NICs, doctor licence numbers, and business identifiers must be unique.
8. Historical records use soft deactivation — no unsafe `DELETE` on financial or clinical data.
9. Concurrent booking attempts for the same doctor must be serialised — only one valid booking commits.
10. All multi-step state changes must fully commit or fully roll back.

---

## Git Workflow — Summary

```
main          ← protected, release-ready only
develop       ← shared integration branch
feature/<module>-<name>   ← short-lived, from develop
fix/<module>-<name>       ← defect work, from develop
```

- Commits follow **Conventional Commits**: `feat`, `fix`, `test`, `docs`, `chore`
- Every PR needs one reviewer other than the author
- Cross-module PRs need both affected owners
- CI must pass before merge
- Squash merge into `develop`

---

## Key Non-Negotiables

- **No business logic in React or Express.** Constraints, triggers, and procedures live in PostgreSQL.
- **No ORM.** Parameterized SQL via `node-postgres` only.
- **No real patient data.** Ever. Fictional data only.
- **No hard-coded financial totals in the frontend.** All values come from the API.
- **No editing merged migrations.** Add corrective migrations instead.
