# CATMS-006: Decision Document — Insurance Eligibility, Multi-Policy Allocation and Claim Lifecycle Rules

**Project:** Clinic Appointment and Treatment Management System (CATMS)  
**Issue Key:** CATMS-006  
**Gate:** G0 (Decisions & Contracts)  
**Owner:** Dev3 (Patient Identity, Insurance & Claims)  
**Reviewers / Sign-off:** Dev4 (Clinical Care, Billing & Payments), Dev1 (Platform & Scheduling)  
**Status:** COMPLETE - SIGNED & FROZEN BASELINE  
**Labels:** `type:decision`, `module:B-patient-insurance`, `financial`, `priority:critical`  
**Dependencies:** CATMS-002 (Production ERD & Naming), CATMS-005 (Clinical Price & Invoice Rules)

---

## 1. Executive Summary & Problem Statement

In a multi-branch clinic management system, insurance claims directly alter real money owed by patients and receivable from insurers. Unclear rules around policy eligibility, coverage caps, multi-policy ordering, and claim approvals create high-risk financial vulnerabilities:
1. **Double Coverage / Over-Allocation:** Multiple policies each paying out on the same treatment line, causing total coverage to exceed 100% of the invoice line total.
2. **Silent Historical Drift:** Modifying policy terms in-place retroactively corrupts the financial calculations of historical claims.
3. **Premature Liability Reduction:** Reducing patient liability upon *submission* rather than upon *approved resolution*, leaving the clinic with uncollectible debt if claims are rejected.
4. **Desynchronized Claim-Invoice State:** Updating a claim status without atomically recalculating invoice liability, leading to irreconcilable balances between billing and insurance ledgers.

This decision document freezes the mathematical, temporal, and state-machine rules enforced at the PostgreSQL database level across Modules B (Patient/Insurance), D (Clinical/Billing), and E (Reports).

---

## 2. Terminology and Domain Entities

| Entity | Physical Table Name | Definition & Authority |
|---|---|---|
| **Patient** | `patient` | Clinic-wide unique patient master record. |
| **Primary Identity** | `patient_identity` | Normalized national ID (NIC) or passport with unique constraint clinic-wide. |
| **Insurance Provider** | `insurance_provider` | External insurance company (e.g., Ceylinco, Sri Lanka Insurance, AIA, Allianz). |
| **Insurance Policy** | `insurance_policy` | Specific policy contract held by/for a patient with policy number, validity dates, and status. |
| **Policy Coverage** | `policy_coverage` | Treatment-specific coverage terms (percentage, cap) with effective validity window. |
| **Invoice** | `invoice` | Canonical billing document issued upon completion of clinical care (owned by Dev4). |
| **Invoice Line** | `invoice_line` | Treatment item charge snapshot: `quantity * unit_price = line_total`. |
| **Insurance Claim** | `insurance_claim` | Claim document submitted to a single insurer for an invoice's treatments. |
| **Claim Line** | `insurance_claim_line` | Treatment-level allocation against a specific invoice line snapshotting terms. |
| **Claim Status Log** | `insurance_claim_status_log` | Append-only audit history of claim lifecycle transitions. |

---

## 3. Policy Eligibility Rules (Pre-Conditions)

A patient policy is eligible for claim submission against an invoice line if and only if **all** of the following conditions are satisfied at validation time:

### Rule 3.1 — Patient Ownership Invariant
- The `policy.patient_id` must strictly equal `invoice.patient_id`.
- Claims can **never** be attached to another patient's policy, even within the same family/group in Phase 1.

### Rule 3.2 — Policy Status Guard
- The policy's `policy_status` must equal `'ACTIVE'` at the time of claim generation.
- Policies with status `'EXPIRED'`, `'SUSPENDED'`, or `'CANCELLED'` are ineligible for new claim submissions.

### Rule 3.3 — Temporal Service-Date Validity Window
- Let $T_{\text{service}}$ be the date of service (the appointment start date or invoice issuance date).
- The policy must be valid on the service date:
  $$\text{policy.valid_from} \le T_{\text{service}} \le \text{policy.valid_to}$$
- If $T_{\text{service}}$ is outside this interval, the policy is ineligible.

### Rule 3.4 — Active Insurance Provider
- The parent `insurance_provider.status` must equal `'ACTIVE'`. Claims cannot be submitted to deactivated providers.

### Rule 3.5 — Treatment-Specific Effective Coverage
- Coverage is evaluated on a per-treatment basis.
- An eligible coverage record `policy_coverage` must exist for the pair `(policy_id, treatment_id)` satisfying:
  $$\text{policy_coverage.effective_from} \le T_{\text{service}} \le \text{policy_coverage.effective_to}$$
- If no matching `policy_coverage` row exists for the treatment on $T_{\text{service}}$, the treatment is **not covered** (coverage rate = 0.00%, eligible amount = 0.00 LKR).

---

## 4. Coverage Calculation & Cap Mechanics

For each invoice line delivering treatment $i$ with line total $L_i = \text{quantity}_i \times \text{unit\_price}_i$:

### Rule 4.1 — Coverage Percentage and Cap Scope
Each `policy_coverage` row defines:
1. $\text{coverage\_percentage} \in [0.00, 100.00]$
2. $\text{coverage\_cap} \in \text{NUMERIC}(12,2) \ge 0.00$ or `NULL` (uncapped)

### Rule 4.2 — Single Policy Nominal and Capped Coverage
The nominal covered amount for policy $p$ on line $i$ is:
$$\text{NominalCover}(p, i) = \text{ROUND}\left(\frac{L_i \times \text{coverage\_percentage}(p, i)}{100}, 2\right)$$

The allowable covered amount for policy $p$ on line $i$ is:
$$\text{MaxEligibleCover}(p, i) = \begin{cases} 
\min(\text{NominalCover}(p, i), \text{coverage\_cap}(p, i), L_i) & \text{if cap is specified} \\ 
\min(\text{NominalCover}(p, i), L_i) & \text{if cap is NULL} 
\end{cases}$$

---

## 5. Multiple Policy Ordering & Non-Duplication Allocation

When a patient has multiple active policies (e.g., Primary corporate policy and Secondary personal policy) applied to the same invoice:

### Rule 5.1 — Policy Priority & Ordering
- Policies applied to an invoice are ordered by an explicit priority sequence: $P_1, P_2, \dots, P_k$ (where $P_1$ is primary).
- In Phase 1, priority is explicitly established at the time of claim creation or based on policy hierarchy (e.g., Primary Policy selected first).

### Rule 5.2 — Coordination of Benefits (Sequential Balance Reduction)
Multi-policy claims use the **Coordination of Benefits (Balance-Only)** model:
1. For Primary Policy $P_1$:
   $$\text{Claimed}(P_1, i) = \text{MaxEligibleCover}(P_1, i)$$
   The remaining uncovered line balance is:
   $$\text{RemainingBalance}_1(i) = L_i - \text{Claimed}(P_1, i)$$

2. For Secondary Policy $P_2$:
   Policy $P_2$ can **only** cover up to the remaining uncovered balance:
   $$\text{Claimed}(P_2, i) = \min\left(\text{MaxEligibleCover}(P_2, i), \text{RemainingBalance}_1(i)\right)$$

### Rule 5.3 — Strict Non-Over-Allocation Invariant
Across all policies claiming against invoice line $i$, the sum of claimed/allocated amounts must never exceed the invoice line total:
$$\sum_{p=1}^k \text{Claimed}(p, i) \le L_i$$

Any procedure or transaction attempting to insert claim lines violating this invariant will be aborted and rolled back with a database exception:
`ERR_CLAIM_ALLOCATION_EXCEEDS_LINE_TOTAL`.

---

## 6. Claim State Machine & Lifecycle Transitions

```mermaid
stateDiagram-v2
    [*] --> Pending: submit_claim()
    
    state Pending {
        [*] --> InReview
        note right of InReview
            - Claimed amounts snapshotted
            - Invoice liability NOT yet reduced
            - resolved_at IS NULL
            - approved_amount = 0.00
        end note
    }

    Pending --> Approved: resolve_claim('Approved')\n[Finance Role Only]
    Pending --> PartiallyApproved: resolve_claim('PartiallyApproved')\n[Finance Role Only]
    Pending --> Rejected: resolve_claim('Rejected')\n[Finance Role Only]

    state Approved {
        note right of Approved
            - approved_amount == claimed_amount
            - Invoice liability reduced atomically
            - Terminal state in Phase 1
        end note
    }

    state PartiallyApproved {
        note right of PartiallyApproved
            - 0 < approved_amount < claimed_amount
            - Only approved_amount reduces liability
            - Unapproved portion reverts to patient liability
            - Terminal state in Phase 1
        end note
    }

    state Rejected {
        note right of Rejected
            - approved_amount == 0.00
            - Rejection reason mandatory
            - Patient liability remains 100%
            - Terminal state in Phase 1
        end note
    }

    Approved --> [*]
    PartiallyApproved --> [*]
    Rejected --> [*]
```

### Transition Specifications and Guards

| Transition | From State | To State | Trigger / Procedure | Required Actor Role | Guard Conditions & Validations |
|---|---|---|---|---|---|
| **T1: Submit Claim** | (None) | `Pending` | `submit_claim()` | Reception, Finance, Admin | Policies active, valid on service date; valid coverage exists; total allocation $\le$ line total; snapshot created. |
| **T2: Full Approval** | `Pending` | `Approved` | `resolve_claim()` | Finance, Admin | Current state is `Pending`; `approved_amount == claimed_amount`; sets `resolved_at`, `resolved_by`. |
| **T3: Partial Approval** | `Pending` | `PartiallyApproved` | `resolve_claim()` | Finance, Admin | Current state is `Pending`; $0.00 < \text{approved\_amount} < \text{claimed\_amount}$; explanation recorded. |
| **T4: Rejection** | `Pending` | `Rejected` | `resolve_claim()` | Finance, Admin | Current state is `Pending`; $\text{approved\_amount} = 0.00$; non-empty `rejection_reason` provided. |

### Rule 6.1 — Terminality and Immutability
- In Phase 1, `Approved`, `PartiallyApproved`, and `Rejected` are **terminal states**.
- A resolved claim cannot transition back to `Pending` or change to another resolved state via direct `UPDATE`.
- If an insurer adjusts an approved amount or issues an adjustment post-settlement, it must be handled via explicit accounting reversal or dispute adjustments (Dev4 payment reversal model).

### Rule 6.2 — Append-Only Status Audit Log
Every transition creates an immutable row in `insurance_claim_status_log`:
- `claim_status_log_id` (PK, UUID or BIGSERIAL)
- `insurance_claim_id` (FK to claim)
- `from_status` (`NULL` for creation, else prior status)
- `to_status` (`Pending`, `Approved`, `PartiallyApproved`, `Rejected`)
- `transitioned_by` (FK to `employee` account)
- `transitioned_at` (TIMESTAMPTZ, server generated `clock_timestamp()`)
- `transition_reason` (TEXT, explanation or insurer note)

---

## 7. Approval Effect on Invoice and Patient Liability

### Rule 7.1 — Submission Does NOT Alter Patient Liability
- While a claim is in `Pending` status:
  - `invoice.insurance_approved_amount` remains unchanged ($0.00$ for a new invoice).
  - `invoice.patient_liability_amount` remains equal to $\text{subtotal\_amount}$.
  - The UI may display `"Pending Insurance: X LKR"` as an informative preview, but the authoritative liability balance is not reduced until approval.

### Rule 7.2 — Atomic Liability Recalculation Formula
Upon resolving a claim for an invoice (via `resolve_claim` procedure), the following values are recalculated atomically inside the **same database transaction**:

1. **Total Approved Insurance**:
   $$\text{invoice.insurance\_approved\_amount} = \sum_{\text{claims } c \in \{\text{Approved, PartiallyApproved}\}} c.\text{approved\_amount}$$

2. **Patient Liability Amount**:
   $$\text{invoice.patient\_liability\_amount} = \max(0.00, \text{invoice.subtotal\_amount} - \text{invoice.insurance\_approved\_amount})$$

3. **Invoice Status Update**:
   - If `patient_paid_amount >= patient_liability_amount` AND `patient_liability_amount == 0`:
     - If insurer payment has also been received in full: `payment_status = 'FULLY_PAID'`.
     - If insurer payment is pending: `payment_status = 'PARTIALLY_PAID'` (or insurer-pending).
   - If `patient_paid_amount < patient_liability_amount`:
     - If `patient_paid_amount > 0`: `payment_status = 'PARTIALLY_PAID'`.
     - If `patient_paid_amount == 0`: `payment_status = 'UNPAID'`.

### Rule 7.3 — Handling Overpayments Caused by Post-Payment Approvals
If a patient has already paid part or all of their liability prior to claim resolution, and subsequent claim approval reduces patient liability below `patient_paid_amount`:
$$\text{CreditBalance} = \text{patient\_paid\_amount} - \text{patient\_liability\_amount} > 0$$
- This creates an explicit patient credit/refund balance.
- Overpayment must not crash the database or delete prior payment receipts; the procedure flags the invoice for refund/credit adjustment.

---

## 8. Effective Dating & Coverage History Preservation

### Rule 8.1 — Immutable Snapshots on Claim Lines
When a claim line is created in `insurance_claim_line`, it snapshots:
- `covered_percentage_snapshot = policy_coverage.coverage_percentage`
- `coverage_cap_snapshot = policy_coverage.coverage_cap`
- `unit_price_snapshot = invoice_line.unit_price`
- `quantity_snapshot = invoice_line.quantity`

Even if `policy_coverage` is later modified or updated, the historical claim record retains the exact terms under which it was calculated.

### Rule 8.2 — Closing Old Terms on Policy Updates
When updating policy coverage terms:
- Direct `UPDATE` of existing active coverage rows is disallowed for historical auditing.
- The lifecycle procedure `update_policy_coverage()`:
  1. Sets `effective_to = new_effective_from - INTERVAL '1 day'` on the currently active row.
  2. Inserts a new `policy_coverage` row with `effective_from = new_effective_from` and `effective_to = NULL` (or future end date).
  3. Rejects overlapping date intervals for `(policy_id, treatment_id)`.

---

## 9. Security & Role Permissions (RBAC Boundary)

| Action | Receptionist | Doctor / Nurse | Clinic Admin | Finance Officer / Manager | System / SuperAdmin |
|---|:---:|:---:|:---:|:---:|:---:|
| Search Patients Clinic-Wide | Yes | Yes | Yes | Yes | Yes |
| Register Patient & Identity | Yes | No | Yes | No | Yes |
| View Policy & Coverage Terms | Yes | Yes | Yes | Yes | Yes |
| Create / Update Policy Terms | No | No | Yes | Yes | Yes |
| Submit Claim (`Pending`) | Yes | No | Yes | Yes | Yes |
| Resolve Claim (`Approved` / `PartiallyApproved` / `Rejected`) | **NO (403)** | **NO (403)** | Yes | **YES** | Yes |
| Trigger Payment Reversals | **NO (403)** | **NO (403)** | Yes | **YES** | Yes |

Any attempt by a Receptionist or unauthorized role to invoke `resolve_claim` directly via the API or SQL will result in `403 Forbidden` / `ERR_INSUFFICIENT_PRIVILEGE`.

---

## 10. Reviewer Sign-Off Table

| Module Owner | Name / Handle | Role | Decision Impact | Sign-Off Status | Date |
|---|---|---|---|:---:|:---:|
| **Dev3** | @dev3 | Author / Insurance & Claims Owner | Formulated eligibility, allocation, and claim state machine | **SIGNED (Author)** | 2026-09-06 |
| **Dev4** | @dev4 | Reviewer / Clinical & Billing Owner | Confirmed invoice line snapshot compatibility & liability recalculation formula | **SIGNED (Baseline)** | 2026-09-06 |
| **Dev1** | @dev1 | Reviewer / Platform & Architecture Owner | Confirmed schema types, concurrency guards, and RBAC boundaries | **SIGNED (Baseline)** | 2026-09-06 |

