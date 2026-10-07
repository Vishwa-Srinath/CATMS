# CATMS-031 — Scheduling Constraints, Concurrency & Viva Walkthrough Guide

Issue: CATMS-031 — Prove scheduling constraints and concurrency
Owner: Dev1 (Lead & Scheduling Module Owner)
Reviewer: Dev5 (Reports & Test Quality Lead)

Deliverables:
* `database/tests/rules/063_scheduling_concurrency_and_constraints_rules.sql`
* `database/tests/concurrency/031_scheduling_concurrency.sh`
* `database/tests/concurrency/031_scheduling_concurrency_fixture.sql`

## 1. What This Task Proves

Appointment scheduling is a high-concurrency operation. When receptionists or patients attempt to book or reschedule appointments simultaneously:
1. Application-level queries suffer from Time-of-Check to Time-of-Use (TOCTOU) race conditions.
2. Standard relational UNIQUE constraints cannot prevent overlapping time intervals.
3. Rescheduling failures must never leave partial state (original appointment must survive intact, and no orphaned schedule history or status log rows may survive).

CATMS-031 proves at the PostgreSQL storage engine level that:
* Simultaneous collisions yield exactly one commit; competing transactions receive a defined rejection.
* Zero deadlocks occur.
* An appointment survives intact at its original time slot if a reschedule attempt conflicts or fails.
* All audit history (`catms.appointment_schedule_history`) and lifecycle logs (`catms.appointment_status_log`) reconcile 1:1 with committed operations.

## 2. Core Architectural Invariants

### A. GiST Exclusion Constraint (`ex_appointment_doctor_time_no_overlap`)
Defined in `database/migrations/060_appointment_schema.sql`:

```sql
ALTER TABLE catms.appointment
ADD CONSTRAINT ex_appointment_doctor_time_no_overlap
EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
)
WHERE (status != 'Cancelled');
```

* `tstzrange(start_at, end_at, '[)')`: Represents the slot as a half-open interval, inclusive of `start_at`, exclusive of `end_at`.
* `WITH &&`: Overlap operator. Two ranges overlap if they share common time points.
* Half-open boundary semantics: Slot A `[09:00, 09:30)` and Slot B `[09:30, 10:00)` touch at `09:30` but do not overlap. Both are permitted consecutively for the same doctor.
* `WHERE (status != 'Cancelled')`: Partial index predicate. Cancelled appointments release their time slot immediately, allowing another patient to be booked into that slot without deleting the cancelled appointment's historical audit record.

### B. 15-Minute Grid CHECK Constraints
```sql
CONSTRAINT chk_appointment_start_minute_15 CHECK (EXTRACT(MINUTE FROM start_at)::INTEGER % 15 = 0),
CONSTRAINT chk_appointment_start_second_0  CHECK (EXTRACT(SECOND FROM start_at)::INTEGER = 0),
CONSTRAINT chk_appointment_end_minute_15   CHECK (EXTRACT(MINUTE FROM end_at)::INTEGER % 15 = 0),
CONSTRAINT chk_appointment_end_second_0    CHECK (EXTRACT(SECOND FROM end_at)::INTEGER = 0),
CONSTRAINT chk_appointment_duration        CHECK (end_at > start_at)
```

Appointments can only begin and end on `:00, :15, :30, :45` marks.

### C. Row-Level Locking in `reschedule_appointment`
Defined in `database/migrations/062_appointment_lifecycle_procedures.sql`:

```sql
SELECT start_at, end_at, status, doctor_id, branch_id 
INTO v_old_start_at, v_old_end_at, v_status, v_doctor_id, v_branch_id
FROM catms.appointment
WHERE appointment_id = p_appointment_id
FOR UPDATE;
```

`FOR UPDATE` locks the target appointment row at the start of the transaction, serializing concurrent status changes and reschedule requests on the same appointment row.

## 3. Test Suite Breakdown

### 1. In-Engine Rules Test: `063_scheduling_concurrency_and_constraints_rules.sql`
Automatically executed by GitHub Actions CI during `migration-smoke` and local `./scripts/test.sh --layer=rules`:

| Test Case | Description | Assertion / Expected Outcome |
| :--- | :--- | :--- |
| Test 1 | Valid initial booking on 15-minute grid | Returns generated `appointment_id` and formatted `appointment_number` (`APT-YYYYMMDD-XXXX`). |
| Test 2 | Adjacent boundary booking | Slot `[09:00, 09:30)` and Slot `[09:30, 10:00)` succeed side-by-side. |
| Test 3 | Direct SQL bypass attempt | Direct `INSERT INTO catms.appointment` overlapping an active slot fails with `exclusion_violation` (`23P01`). |
| Test 4 | Stored procedure overlap attempt | `CALL catms.book_appointment()` for overlapping slot fails with `exclusion_violation`. |
| Test 5 | Failed reschedule rollback | Attempting to reschedule an appointment into an occupied slot fails. Original appointment retains original start/end times untouched; 0 audit history rows created. |
| Test 6 | Valid reschedule audit record | Moving to an open slot creates exactly 1 row in `catms.appointment_schedule_history`. |
| Test 7 | Cancelled slot reuse | Cancelling an appointment allows an immediate re-booking into the exact same doctor/slot without exclusion violation. |
| Test 8 | Terminal state guard | Rescheduling a `Cancelled` or `Completed` appointment is blocked with error code `A0002`. |
| Test 9 | Parallel doctor independence | Booking Doctor 1 and Doctor 2 for the exact same time slot proceeds without interference. |
| Test 10 | Audit reconciliation | Schedule history and status log totals match committed operations 1:1. |

### 2. Multi-Session Race Test Script: `031_scheduling_concurrency.sh`

Runs two independent PostgreSQL client processes concurrently against a test database to prove multi-connection race behavior.

#### Race Scenario 1: Double-Booking Collision on Same Doctor & Time Slot
* Session A calls `book_appointment(Doctor A, 09:00-09:30)` and holds transaction with `pg_sleep(4)`.
* Session B attempts `book_appointment(Doctor A, 09:00-09:30)`.
* Session B blocks on GiST exclusion lock held by Session A.
* Session A commits.
* Session B unblocks and fails with `exclusion_violation` (`23P01`).
* Proof: Exactly 1 appointment committed. Zero deadlock. Session B rejected.

#### Race Scenario 2: Parallel Doctors at Identical Timestamp
* Session A books Doctor A for `[10:00, 10:30)`.
* Session B books Doctor B for `[10:00, 10:30)`.
* Proof: Both commit cleanly and concurrently without blocking.

#### Race Scenario 3: Reschedule Collision & State Preservation
* Doctor A has Appointment 1 at `11:00-11:30` and Appointment 2 at `14:00-14:30`.
* Session A reschedules Appointment 1 to open slot `12:00-12:30` and holds transaction.
* Session B attempts to reschedule Appointment 2 to `12:00-12:30`.
* Proof: Session B is blocked, then fails with `exclusion_violation`.
* Verification: Appointment 1 rescheduled to `12:00-12:30` with 1 history record; Appointment 2 survives completely intact at `14:00-14:30` with 0 history records.

#### Race Scenario 4: Concurrent New Booking vs. Reschedule
* Session A books a new patient into slot `15:00-15:30`.
* Session B attempts to reschedule Appointment 2 into `15:00-15:30`.
* Proof: New booking wins; competing reschedule is blocked and cleanly rejected.

## 4. How to Run the Tests

### 1. Run the CI Rules Suite
```bash
./scripts/test.sh --layer=rules
```

### 2. Run the Multi-Session Concurrency Script
```bash
bash database/tests/concurrency/031_scheduling_concurrency.sh --setup
```

## 5. Viva Questions & Defense (Dev1 Cheat Sheet)

Q1: Why did you choose GiST index exclusion constraints instead of validating availability in Node.js or stored procedure logic?
> Application or procedure queries (`SELECT 1 FROM appointment WHERE ...`) are subject to Time-of-Check to Time-of-Use (TOCTOU) race conditions. In Read Committed isolation, two concurrent transactions can simultaneously query, both see the slot as open, and both execute an INSERT, creating a double-booking. The GiST exclusion constraint enforces mathematical non-overlap (`&&`) directly in the PostgreSQL storage engine using page-level locking, guaranteeing that no two overlapping rows can ever be committed simultaneously.

Q2: Why is the GiST exclusion constraint defined as a partial constraint with `WHERE (status != 'Cancelled')`?
> When an appointment is cancelled, we do not delete the row because medical systems require a complete audit trail. However, the time slot must immediately become available for other patients. By adding `WHERE (status != 'Cancelled')`, PostgreSQL excludes cancelled appointments from the GiST index, allowing new appointments to occupy that exact time range without constraint violation.

Q3: How does CATMS guarantee that a failed reschedule leaves no partial state?
> In `reschedule_appointment()`, all operations (updating the appointment row and inserting the audit record into `catms.appointment_schedule_history`) occur inside a single atomic transaction. Furthermore, the procedure begins with `SELECT ... FOR UPDATE` to lock the target appointment row. If the new slot violates doctor availability or overlaps another appointment, PostgreSQL raises an exception and rolls back the entire transaction. The appointment row remains in its original slot with its original start and end times, and no orphaned history rows are created.

Q4: How do half-open ranges (`[)`) prevent false positive conflicts between adjacent appointments?
> We use `tstzrange(start_at, end_at, '[)')`. The square bracket `[` means inclusive of the start boundary, while the round parenthesis `)` means exclusive of the end boundary. Therefore, an appointment from 09:00 to 09:30 ends at 09:29:59.999..., and the next appointment from 09:30 to 10:00 starts at 09:30:00.000. Their intersection is empty (`&&` evaluates to FALSE), allowing back-to-back appointments without requiring gaps.
