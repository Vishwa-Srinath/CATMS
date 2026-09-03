# ADR-002: ERD Naming Conventions, Standard Datatypes, and Delete Policies

* **Date:** 2026-09-03
* **Status:** Accepted
* **Deciders:** Dev1 (Lead/Scheduling), Dev2 (Staff/Access), Dev3 (Patient/Claims), Dev4 (Clinical/Billing), Dev5 (Reports/Data)
* **CATMS Issue:** `CATMS-002`
* **ERD Reference:** `docs/CATMS_Production_Implementation_ERD.drawio`

---

## Context

The CATMS physical relational schema consists of 34 base tables and 2 pure junction tables distributed across 5 functional modules. To maintain consistency, ensure data integrity, and support auditability across all developer migrations, standard conventions for object naming, data types, primary key generation, and foreign key deletion rules must be enforced across PostgreSQL 16 migrations.

---

## Decision

### 1. Physical Object Naming Standard
* **Tables & Views:** Singular noun in `snake_case` (e.g., `appointment`, `invoice_line`, `doctor_availability`). Views use the `v_` prefix (e.g., `v_daily_appointment_summary`).
* **Columns:** Descriptive `snake_case` (e.g., `start_at`, `unit_price_at_time`, `is_active`).
* **Constraints & Indexes:** Standard prefix naming:
  * Primary Keys: `pk_<table_name>`
  * Foreign Keys: `fk_<source_table>_<target_table>`
  * Unique Constraints: `uq_<table_name>_<column_name>`
  * Check Constraints: `chk_<table_name>_<rule_name>`
  * Indexes: `idx_<table_name>_<column_names>`

---

### 2. Standard Data Types & Technical Rules

| Concept | PostgreSQL Data Type | Rule / Guideline |
|---|---|---|
| Primary Keys | `BIGINT GENERATED ALWAYS AS IDENTITY` | Standard surrogate primary key for all base tables. |
| Money & Financial Amounts | `NUMERIC(12,2)` | Exact fixed-point arithmetic in **LKR**. Floating-point types (`FLOAT`, `REAL`, `DOUBLE`) are strictly forbidden. |
| Timestamps & Instants | `TIMESTAMPTZ` | Stored exclusively in **UTC**. Timezone conversion to `Asia/Colombo` occurs only in presentation layers and management report views. |
| Natural / National IDs | `citext` | Case-insensitive text extension for NICs, licence numbers, and usernames to prevent duplicate entries with case variations. |
| Booleans | `BOOLEAN NOT NULL DEFAULT TRUE/FALSE` | Soft status indicators (e.g., `is_active`, `is_primary`). |

---

### 3. Complete 34 Base Relation Inventory by Module

#### Module A: Branch, Staff & Access (11 tables — Dev2)
1. `branch` — Branch details (Colombo, Kandy, Galle)
2. `employee` — Core staff identity and attributes
3. `employee_branch_assignment` — Staff branch assignment history
4. `branch_manager_assignment` — Effective-dated branch manager assignment
5. `doctor_profile` — Doctor subtype details (licence number, consultation fee)
6. `specialty` — Medical specialty catalogue
7. `doctor_specialty` — Doctor to specialty many-to-many junction
8. `user_account` — Staff authentication credentials & lock status
9. `app_role` — Application role definitions (Receptionist, Clinician, Manager, Admin, QA)
10. `user_account_role` — User account role assignment
11. `audit_event` — System security audit log

#### Module B: Patient & Insurance (6 tables — Dev3)
12. `patient` — Master patient record (clinic-wide visibility)
13. `patient_identity` — Patient NIC/Passport identification records
14. `emergency_contact` — Patient emergency contact contacts
15. `insurance_provider` — Insurance company catalogue
16. `insurance_policy` — Patient policy instances and status
17. `policy_coverage` — Treatment-specific policy coverage percentages & caps

#### Module C: Appointment & Scheduling (5 tables — Dev1)
18. `doctor_availability` — Recurring weekly availability schedule
19. `doctor_availability_exception` — Date-specific doctor exceptions (leave/extra hours)
20. `appointment` — Master appointment record (with GiST exclusion constraint)
21. `appointment_schedule_history` — Immutable audit trail of rescheduled appointments
22. `appointment_status_log` — Immutable audit trail of appointment status transitions

#### Module D: Clinical Care, Treatment & Billing (7 tables — Dev4)
23. `consultation_note` — Clinical note header for completed appointments
24. `consultation_note_revision` — Append-only revision history for clinical notes
25. `treatment_category` — Category breakdown for clinical treatments
26. `treatment_catalogue` — Master price list of procedures/services
27. `appointment_treatment` — Delivered treatment lines with price snapshot
28. `invoice` — Immutable invoice header
29. `invoice_line` — Immutable invoice line snapshot

#### Module E: Payments, Claims & Reporting (7 objects — Dev3, Dev4, Dev5)
30. `insurance_claim` — Insurance claim header (Dev3)
31. `insurance_claim_line` — Claim line coverage allocation (Dev3)
32. `insurance_claim_status_log` — Claim status transition audit log (Dev3)
33. `payment` — Financial payment transaction (Dev4)
34. `payment_reversal` — Compensating financial payment reversal (Dev4)

---

### 4. Foreign Key Delete Policies & History Protection

To protect financial, audit, and medical history from accidental or malicious deletion:
* **`ON DELETE RESTRICT` (Default):** Applied to all foreign keys referencing core operational entities (`patient`, `employee`, `doctor_profile`, `appointment`, `invoice`, `treatment_catalogue`). Hard deletion of referenced entities is blocked if dependent records exist.
* **Soft Deactivation (`is_active`):** Staff, doctors, patients, policies, and treatment catalogue items use `is_active = FALSE` for logical deactivation instead of physical `DELETE`.
* **Cascade Delete (`ON DELETE CASCADE`):** Reserved exclusively for tightly coupled child composition entities that have no independent life outside their parent (e.g., `invoice_line` when an unissued draft invoice is discarded, or `patient_identity` during atomic registration rollback).

---

## Consequences

* **Positive:** Ensures schema consistency across all 5 developer migration suites and guarantees strict auditability of clinical/financial data.
* **Negative:** Requires explicit soft-deactivation handling in queries (`WHERE is_active = TRUE`) rather than standard table deletions.
