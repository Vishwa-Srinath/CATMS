# ADR-001: Phase 1 Scope Boundary and Document Precedence Hierarchy

* **Date:** 2026-09-03
* **Status:** Accepted
* **Deciders:** Dev1 (Lead/Scheduling), Dev2 (Staff/Access), Dev3 (Patient/Claims), Dev4 (Clinical/Billing), Dev5 (Reports/Data)
* **CATMS Issue:** `CATMS-001`
* **SRS Traceability:** `REQ-01` through `REQ-42`

---

## Context

CATMS (Clinic Appointment and Treatment Management System) is being implemented as a database-centred software project for MedSync Clinics across Colombo, Kandy, and Galle. To ensure all five module owners remain aligned and prevent scope creep during execution, the exact operational boundaries of Phase 1 must be frozen, and an explicit hierarchy of authority must resolve any potential documentation contradictions.

---

## Decision

### 1. Frozen Phase 1 Scope Boundary

#### Included in Phase 1 (`v1.0-demo`)
* **Branch & Staff Management:** 3 physical branches (Colombo, Kandy, Galle); employee registration, primary branch assignments, branch manager assignments, doctor profiles, specialties, and doctor-specialty mappings.
* **Authentication & RBAC:** Scoped user accounts across 5 roles (Receptionist, Clinician, Branch Manager, Admin/Finance, QA Tester) enforced at both application API and database PostgreSQL privilege layers (`GRANT`/`REVOKE`).
* **Patient & Insurance Management:** Clinic-wide patient registration, primary contact identity (NIC/Passport), emergency contacts, insurance providers, policies, and treatment-level effective coverage caps and percentages.
* **Appointment & Scheduling:** Availability rules, exception handling, booked, rescheduled, cancelled, and walk-in appointments. Database-level double-booking prevention using GiST exclusion constraints over `[start_at, end_at)` intervals. Immutable audit logs for schedule and status changes.
* **Clinical Care & Billing:** Consultation notes and delivered treatment recording restricted exclusively to `Completed` appointments. Price snapshots at treatment time (`unit_price_at_time`), automated invoice and line generation.
* **Payments & Claims:** Patient payments (full/partial), overpayment rejection, payment reversals, insurance claim generation, treatment-line claim allocation, multi-policy handling, claim status tracking (Pending, Approved, Partially Approved, Rejected), and insurer payment posting.
* **Management Reports:** 5 database-derived reporting objects (Branch daily summary, Doctor revenue, Outstanding balances, Treatment category counts, Insurance vs out-of-pocket).
* **Local Runtime & Quality:** Docker Compose environment (PostgreSQL 16, Express API, React QA frontend), fixed-seed demo data, and deterministic database reset scripts.

#### Explicitly Deferred (Out of Scope for Phase 1)
* Patient-facing online booking portal or self-service app.
* Real-time electronic claim submission or integration with external insurance provider APIs.
* SMS, WhatsApp, or email reminder integrations.
* Pharmacy, medication dispensing, laboratory device integration, or inventory management.
* Multi-currency support or branch-specific treatment price variations (Phase 1 uses **LKR** with `NUMERIC(12,2)`).
* Cloud deployment infrastructure or managed database services.

---

### 2. Source-of-Truth Hierarchy

When a discrepancy is discovered between design documents, code comments, or user interface implementations, team members must resolve conflict strictly according to the following precedence hierarchy:

```text
Level 1: Approved Architecture Decision Records (docs/adr/*.md)
   │
Level 2: Production Implementation ERD (docs/CATMS_Production_Implementation_ERD.drawio)
   │
Level 3: Software Requirements Specification (docs/CATMS_SRS_new.pdf)
   │
Level 4: Team Execution Plan & Navigation (docs/member_plan.md & docs/README.md)
   │
Level 5: Module API Contract Specifications (backend/src/contracts/ & docs/api/)
   │
Level 6: Source Code Implementation (database/migrations/, backend/src/, frontend/src/)
```

1. **Approved ADRs (`docs/adr/`)** are the highest authority for architecture, invariants, and scope decisions signed by the team.
2. **Production ERD** governs table names, column names, foreign keys, cardinality, and data types.
3. **SRS Specification** governs functional and business rule requirements.
4. **Execution Plans** govern developer task assignments, gate requirements, and hand-off boundaries.
5. **API Contracts** govern HTTP payloads, query parameters, and JSON response envelopes.
6. **Source Code** implements the higher-level specifications.

---

## Consequences

* **Positive:** Prevents feature bloat and ensures every developer builds toward identical scope and authority assumptions.
* **Negative:** Any change to frozen requirements requires a formal ADR update signed by Dev1 and affected module owners.
