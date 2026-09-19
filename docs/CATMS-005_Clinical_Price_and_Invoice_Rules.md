# CATMS-005: Clinical Price and Invoice Calculation Rules

**Owner:** Dev4 · **Reviewers:** Dev1, Dev3 · **Status:** Proposed for G0

## 1. Pricing authority — catalogue vs. doctor fee

Every treatment line gets **exactly one** unit price — never a sum of two prices.

- **Default:** `TREATMENT_CATALOGUE.current_price` is used for every treatment line.
- **Override (consultation only):** `DOCTOR_PROFILE.default_consultation_fee` replaces the catalogue price, but only when **all** of these hold:
  1. the line's treatment is a consultation service (`is_consultation_service = true`),
  2. the doctor on the fee is the same doctor as the appointment's own doctor,
  3. that doctor's `default_consultation_fee` is not null.
- If any condition fails, the catalogue price is used — the doctor fee never stacks on top of the catalogue price, it substitutes for it.

**Example** — one appointment with a consultation, an X-ray, and a dressing change:

| Line | Price used | `price_source` |
|---|---|---|
| Consultation | Dr. X's `default_consultation_fee` | `DOCTOR_FEE` |
| X-ray | catalogue `current_price` | `CATALOGUE` |
| Dressing change | catalogue `current_price` | `CATALOGUE` |

The consultation line is billed once, at whichever price applies — not at both.

## 2. Price capture and `price_source`

When a treatment line is recorded, the server (never the browser) resolves the price per §1 and writes it to `APPOINTMENT_TREATMENT.unit_price_at_time`, along with `price_source` set to `CATALOGUE` or `DOCTOR_FEE`. Both fields are written once, by the same procedure that creates the line, and are never updated afterward — they become part of the permanent clinical/financial record.

## 3. Invoice issuance

- An invoice can only be created once the appointment's status is `Completed`. Scheduled or Cancelled appointments cannot produce an invoice.
- Issuance is a single atomic server-side procedure: it reads all of that appointment's `APPOINTMENT_TREATMENT` rows, snapshots each into an `INVOICE_LINE`, and computes the invoice totals — all in one transaction.
- Each appointment can produce at most one invoice (`invoice.appointment_id` is unique).
- There is no editable "draft" invoice state — issuance happens once and the result is immediately immutable.

## 4. Invoice line snapshots

Each `INVOICE_LINE` freezes, at issuance time: `service_code_snapshot`, `description_snapshot`, `quantity`, `unit_price`, and `line_total`. These values are permanent — if the catalogue price or a doctor's fee changes later, already-issued invoices are unaffected. The only way to change a settled invoice's numbers is a compensating reversal (§6), never an edit to the line itself.

## 5. Server-only financial formulas

```
subtotal_amount            = sum of all invoice_line.line_total
approved_insurance_amount  = sum of approved claim-line amounts for this invoice
patient_liability_amount   = subtotal_amount − approved_insurance_amount  (floor 0)
patient_paid_amount        = completed patient payments − reversed patient payments
insurer_paid_amount        = completed insurer payments − reversed insurer payments
```

- `patient_paid_amount` and `insurer_paid_amount` are each capped at what's owed — an attempted overpayment is rejected outright by the payment procedure, with no partial write to any table.
- All of this is computed and written only by database procedures running under the appropriate role — none of it is derived by the API layer or trusted from a client request.

## 6. Status and corrections

- `invoice_state` moves through `Issued → PartiallySettled → Settled` as payments accumulate against `patient_liability_amount`.
- Corrections (refunds, mistaken payments, claim reversals) are always recorded as new compensating rows (`payment_reversal`, claim status changes) — settled rows and issued invoice lines are never edited or deleted.

## 7. Browser trust boundary

The client (React frontend) must never submit a price, a subtotal, a liability amount, a paid amount, or a status. Any such field arriving in a request body is rejected by validation before it reaches the database. All of §5's calculations happen server-side, inside the same transaction that creates the underlying record (treatment line, payment, claim resolution).

---

**Review needed:**
- **Dev1** — confirm this fits the transaction/role (`SET LOCAL ROLE`) pattern used by the shared platform.
- **Dev3** — confirm `approved_insurance_amount`'s dependency on claim status and amounts matches what CATMS-006 will freeze.
