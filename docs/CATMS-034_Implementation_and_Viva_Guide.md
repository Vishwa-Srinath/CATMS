# CATMS-034 — Full code and development/viva walkthrough

Prepared for Dev4, 4 October 2026.

## 1. What this task delivers

CATMS-033 records what the patient received and the price that applied at treatment time.
CATMS-034 turns those delivered-treatment rows into one issued invoice, with permanent line snapshots.

The task is owned by Dev4 and reviewed by Dev3 and Dev1.
Its documented dependencies are CATMS-033 and CATMS-005.

The full runnable draft is [catms-034.sql](../database/drafts/catms-034.sql).
The saved test suite is [catms-034-tests.sql](../database/drafts/catms-034-tests.sql).
The proposed complete replacement for the old 024 test is
[catms-034-024-test-update.sql](../database/drafts/catms-034-024-test-update.sql).

All three remain drafts. No production migration has been modified or committed.

## 2. Example

An appointment contains:

| Delivered service | Quantity | Previously captured unit price | Invoice line total |
|---|---:|---:|---:|
| Dressing | 2 | 500.00 | 1,000.00 |
| Consultation | 1 | 2,500.00 | 2,500.00 |

The invoice subtotal is 3,500.00 LKR.

At issuance there is no approved claim or posted payment for this new invoice, so:

- approved_insurance_amount = 0.00
- patient_liability_amount = 3,500.00
- patient_paid_amount = 0.00
- insurer_paid_amount = 0.00
- invoice_state = Issued
- patient_payment_status = Unpaid

The invoice copies the saved treatment price. It does not select the doctor's current fee again.

If the catalogue price changes tomorrow, existing treatment and invoice prices remain unchanged.
If the catalogue name changes tomorrow, the invoice's saved service label also remains unchanged.

## 3. Important document decisions

The production ERD defines invoice_state as Draft / Issued / Voided and a separate
patient_payment_status as Unpaid / PartiallyPaid / Paid.
CATMS-005 uses different state wording. This implementation uses the ERD's column/value names
and CATMS-005's immediate-issuance behavior.

The database only creates Issued invoices through this workflow. Draft and Voided are reserved
values, not implemented workflows. Invoice-state changes are currently rejected.
There is no manual price override.

The invoice description snapshot is the catalogue display name (name), which fits the
ERD's VARCHAR(160). It is not the optional long description field (VARCHAR(300)).
Service codes longer than the ERD's 30-character limit fail issuance explicitly; they are
not silently truncated.

A zero-total invoice starts with patient_payment_status = Paid because no patient balance is
due. This is a documented implementation choice for reviewer confirmation.
finalized_at remains NULL at issuance; its later meaning belongs to the settlement workflow.

At least one delivered-treatment line is required. Even a free invoice needs a treatment row.

## 4. Why the existing invoice table is altered

Migration 024 created a scaffold invoice table, and payment already references its invoice_id.
Creating another table with the same name would fail. Dropping the existing table could break
foreign keys or destroy data.

The migration preserves the invoice table and its primary key. It renames:

| Old column | New column |
|---|---|
| subtotal | subtotal_amount |
| insurance_covered | approved_insurance_amount |
| patient_payable | patient_liability_amount |
| status | invoice_state |
| created_at | issued_at |

It removes branch_id from the invoice because the branch is available through the appointment.
It adds appointment_id and the remaining ERD fields.

An initial DO block rejects the migration if invoice or payment contains rows.
There is no safe automatic way to infer which appointment owns each old scaffold invoice.
If the guard fails, preserve those rows and design a data migration. Do not clear real data just
to make this file run.

LOCK TABLE prevents another session from inserting scaffold rows while the migration checks
and changes the structure. The schema changes run in a single BEGIN / COMMIT transaction.

## 5. Invoice identity and constraints

invoice_id is the existing identity primary key.
invoice_number is a human-readable identifier such as INV-1, generated with a sequence.
Sequence gaps are normal after rollback; an invoice number is not a row count.

UNIQUE (appointment_id) enforces at most one invoice per appointment, even for direct SQL.
UNIQUE (invoice_number) prevents duplicate document numbers.

All monetary columns use NUMERIC(12,2), not floating point.
Checks reject negative amounts and NaN, require approved coverage not to exceed subtotal,
and require patient_liability_amount = subtotal_amount - approved_insurance_amount.

This task does not add permanent paid <= liability checks. Later insurance adjustments and
payment reversals need coordinated transaction rules in CATMS-035/039.

version_no starts at 1 and increments on later permitted updates.
The identity, appointment, currency, issued timestamp, document state, and subtotal are
protected from edits.

## 6. The invoice_line table

Each invoice line references:

- its invoice;
- exactly one appointment_treatment row.

UNIQUE (appointment_treatment_id) prevents the same delivered treatment from being invoiced
more than once. UNIQUE (invoice_id, line_number) prevents duplicate line numbers in an invoice.

Each line stores service_code_snapshot, description_snapshot, quantity, and unit_price.
These snapshots are permanent invoice data, not live catalogue lookups.

line_total is generated by PostgreSQL:

    round(quantity * unit_price, 2)

A GENERATED ALWAYS AS (...) STORED column is calculated by the database and stored with the row.
The caller does not provide its value.

The subtotal sums the individually rounded line totals. It does not round an unrounded
grand total using a different formula.

The invoice_line foreign keys use ON DELETE RESTRICT. Issued history is not discarded.

## 7. guard_invoice_header()

This is a BEFORE INSERT OR UPDATE trigger function.

On INSERT it:

1. Locks and reads the appointment.
2. Requires Completed status.
3. Requires immediate Issued state.
4. Requires at least one delivered treatment.
5. Calculates the subtotal from saved treatment quantities/prices.
6. Sets the initial coverage, liability, payment amounts and status.
7. Sets database-controlled timestamps and version.

On UPDATE it rejects changes to issued identity and subtotal.
It allows the schema to support later controlled changes to coverage/payment fields, but ordinary
application roles do not have table-write privileges. CATMS-035/039 must implement the routines
that maintain those fields and their status transitions.

A trigger is not called explicitly by the application. PostgreSQL runs it when its configured
table operation occurs.

## 8. snapshot_invoice_line()

This BEFORE INSERT trigger fills invoice-line data from the source treatment and catalogue.

The procedure is:

1. Find and lock the invoice.
2. Find its delivered-treatment row and catalogue label.
3. Require the treatment and invoice to refer to the same appointment.
4. Copy line number, quantity, and the treatment's historical price.
5. Copy catalogue code and display name at issuance.
6. Return NEW so insertion continues.

FOR SHARE protects the source rows during capture.
Using the catalogue name here does not change the saved unit price.

A direct insert cannot choose a different unit price: the trigger derives it.
Foreign keys, uniqueness, and deferred completeness checks still apply.

## 9. Immutable history and billed treatments

reject_invoice_history_changes() rejects:

- deleting an invoice;
- truncating invoices;
- updating/deleting invoice lines;
- truncating invoice lines.

guard_billed_treatment() prevents adding, updating, or deleting delivered-treatment rows after
an invoice exists. Otherwise a later treatment could be omitted from an already-issued invoice.

It also prevents moving an existing treatment to a different appointment or changing its row identity.

This is why treatment recording must finish before invoice issuance.
If the application needs a correction workflow, it must be explicitly designed; users should not
delete issued financial history.

## 10. Deferred consistency checks

The invoice header is inserted first and invoice lines second. Between those statements the
header is temporarily incomplete.

check_invoice_consistency() is attached as an AFTER constraint trigger with:

    DEFERRABLE INITIALLY DEFERRED

Normally it runs at the transaction's end and checks:

- the invoice has at least one line;
- the number of invoice lines equals the delivered-treatment count;
- the sum of line totals equals the header subtotal.

The line foreign keys, unique treatment reference, and cross-appointment guard ensure this count
comparison represents a complete one-to-one set of billed treatment lines.

For tests, SET CONSTRAINTS ALL IMMEDIATE forces pending checks before ROLLBACK.
ROLLBACK alone would discard rows without demonstrating that deferred checks pass.

Leave these constraints deferred while constructing a new invoice.
The issuance function does not change the caller's constraint mode.

## 11. issue_invoice(appointment_id, user_id)

This is the entry point:

    SELECT catms.issue_invoice(appointment_id, user_account_id);

It is a PostgreSQL FUNCTION, called with SELECT, consistent with your earlier recording functions.
It performs the server-side issuance operation described as a procedure in the task.
If the team requires literal CREATE PROCEDURE / CALL APIs, agree that naming/interface convention
before promotion; the transaction behavior described here is the same all-or-nothing operation.

The caller supplies two identifiers, never prices or totals.

The function:

1. Locks the appointment FOR UPDATE.
2. Rejects missing or non-Completed appointments.
3. Rejects a second invoice.
4. Requires an existing recording user.
5. Locks the source treatment rows and catalogue labels.
6. Inserts the invoice header.
7. Inserts all invoice lines.
8. Writes an INVOICE_ISSUED audit_event.
9. Returns invoice_id.

There is no COMMIT inside the function. The caller controls the outer transaction.

If line creation fails after the header insert, the function call fails and its preceding writes
are rolled back. The tests force such a failure using an overlong service code.

The user-account check establishes existence, not authentication.
The API must provide a trusted authenticated actor and apply branch authorization.
This draft does not pretend that an arbitrary user-id argument proves who is logged in.

## 12. Concurrent requests

Treatment recording and invoice issuance both lock the appointment first.

When two sessions invoice the same appointment, the second waits for the first transaction.
After the first commits, the second sees the existing invoice and returns INVOICE_ALREADY_EXISTS.

The unique appointment constraint provides an additional database guarantee.

A two-session test on 4 October 2026 observed the second request wait about five seconds and
then reject the duplicate. Exactly one invoice committed.

## 13. Permissions

The entry function uses SECURITY DEFINER, so it can write using its trusted migration owner's
permissions even though application roles cannot directly write invoice tables.

Its search_path is fixed to pg_catalog, pg_temp, and application tables are schema-qualified.

EXECUTE is granted to catms_app, catms_clinician and catms_admin.
Reception, Manager, QA, readonly and PUBLIC cannot issue invoices through this function.

The existing base-table restriction for clinicians is preserved: they do not get direct SELECT
on invoice. A later approved view/API can expose their permitted invoice information.

Admin/QA/readonly can read invoice data as configured, but application Admin cannot directly
rewrite totals. Database owners and superusers remain administrative authorities.

No payment or insurance reconciliation is implemented here.
The existing payment scaffold remains for CATMS-035.

## 14. Why the old 024 test needs an update again

The old fixture inserts branch_id, subtotal, patient_payable and status directly.
Those are scaffold columns replaced by this migration.

The prepared 024 replacement creates a treatment and calls issue_invoice() after creating
the test appointment. The permission assertions are preserved.

It still inserts a legacy payment row solely for its existing permission checks.
That row is not evidence of a complete payment workflow or reconciled paid totals.

Use the replacement only when you apply the invoice migration. Until then keep the current
tracked 024 test, which matches your current development schema.

## 15. Files and next steps

Review the draft files first. Candidate migration number 094 is not yet reserved.

After reserving 094, copy:

- database/drafts/catms-034.sql
  to database/migrations/094_invoice_and_lines.sql
- database/drafts/catms-034-tests.sql
  to database/tests/rules/094_invoice_and_lines.sql
- database/drafts/catms-034-024-test-update.sql
  over database/tests/rules/024_manager_specialty_grants_rules.sql

Do not modify merged migrations 024, 092 or 093.

Before applying to catms_dev, check both invoice and payment row counts.
They must be zero for this scaffold migration. A nonzero result needs a data-preservation plan.

Use the migration runner to apply 094, then run the new 094 test and updated 024 test with
psql -v ON_ERROR_STOP=1. Run the existing 092 and 093 tests too for integration confidence.

Commit only the promoted migration, tests and documentation you intend to share.
Leave drafts unstaged. Request Dev1/Dev3 review and Dev2 review of the updated 024 test fixture.

## 16. Validation performed

The schema-only copy of catms_dev was used to create a temporary database.
The full invoice draft applied successfully there.

The saved single-session test passed:
- successful issuance by the clinician role;
- two lines totaling 3,500 LKR;
- actor-linked audit entry;
- unchanged snapshots after catalogue edits;
- duplicate invoice rejection;
- immutable invoice lines and subtotal;
- billed-treatment addition/edit rejection;
- Scheduled/Cancelled/no-treatment rejection;
- rejection of incomplete invoice commits;
- forced mid-issuance failure without partial invoice rows;
- rejected unauthorized issuance and direct total writes.

The proposed updated 024 test passed all its original assertions.
The separate concurrent issuance test passed; it is not encoded in the single-session test file.

These results do not claim that claim resolution, payment posting, UI/API authorization,
all possible isolation levels, or the whole project test suite have been verified.

## 17. Viva answers

**Why two tables?**
The header holds document-level information; the lines hold individual billed services.
One invoice can therefore contain many treatments without repeating header fields.

**Why store a price again?**
The treatment snapshot records the clinical price decision. The invoice snapshot preserves
what was issued on the bill. Both must remain stable when master data changes.

**Why generated line_total?**
It prevents the caller from providing a total inconsistent with quantity and unit price.

**Why a transaction?**
The invoice header, all lines and audit entry must succeed or fail together.

**Why an appointment lock and a unique constraint?**
The lock coordinates concurrent operations and produces a clear duplicate error.
The unique constraint independently enforces the one-invoice rule.

**Why a deferred trigger?**
Header creation temporarily precedes line creation. We validate the complete result at
transaction end rather than rejecting the legitimate intermediate state.

**Does Paid mean cash was received?**
For a zero-liability invoice, there is no amount due. Paid status does not by itself prove
a payment row exists; the explicit paid amount and payment ledger represent receipts.

**Is CATMS-034 the entire billing module?**
No. It issues immutable bills. Insurance resolution and patient/insurer payments belong to
later tasks and update only the permitted settlement fields through controlled routines.

