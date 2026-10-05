# CATMS-037 through CATMS-040: Claims Lifecycle Implementation & Verification Guide

**Project:** Clinic Appointment and Treatment Management System (CATMS)  
**Module:** B-patient-insurance  
**Owner:** Dev3 (Patient Identity, Insurance & Claims)  
**Reviewers:** Dev4 (Invoicing, Billing & Payments), Dev1 (Architecture & Platform)  
**Branch:** `feat/Dev3-claims`  
**Milestone:** Gate G2 (Database Rules & Transactions)  
**Status:** COMPLETE & PROVEN  

---

## 1. Executive Summary

This deliverable implements the complete insurance claims lifecycle for CATMS, spanning:
- **CATMS-037**: Schema for `insurance_claim`, `insurance_claim_line`, and append-only `insurance_claim_status_log` (`110_insurance_claim.sql`).
- **CATMS-038**: Atomic claim eligibility evaluation and submission procedure with coordination of benefits (`111_claim_submission_procedure.sql`).
- **CATMS-039**: Claim resolution with RBAC authorization and atomic invoice liability recalculation (`112_claim_resolution_procedure.sql`).
- **CATMS-040**: Direct database test suite proving zero double-coverage, historical snapshot immutability, and 100% mathematical reconciliation with the signed golden worked example (`110`, `111`, `112`, `113` rules tests).

---

## 2. Deliverables & Physical Files

| Issue | File | Layer | Description |
|---|---|---|---|
| **CATMS-037** | `database/migrations/110_insurance_claim.sql` | Migration | Tables, constraints, ownership trigger, append-only status log, terminal state guard |
| **CATMS-038** | `database/migrations/111_claim_submission_procedure.sql` | Migration | `submit_claim()` with service date snapshotting and coordination of benefits |
| **CATMS-039** | `database/migrations/112_claim_resolution_procedure.sql` | Migration | `resolve_claim()` with RBAC check and atomic liability recalculation |
| **CATMS-037** | `database/tests/schema/110_insurance_claim_schema.sql` | Schema Test | Validates tables, PKs, FKs, UQs, CHECKs, comments, and registry versions 110–112 |
| **CATMS-037** | `database/tests/rules/110_insurance_claim_rules.sql` | Rules Test | Asserts ownership invariant, append-only history, and over-allocation ceiling |
| **CATMS-038** | `database/tests/rules/111_claim_submission_rules.sql` | Rules Test | Asserts temporal policy window, active guards, and pending liability invariant |
| **CATMS-039** | `database/tests/rules/112_claim_resolution_rules.sql` | Rules Test | Asserts RBAC restriction (403 for reception), partial approval, and terminality |
| **CATMS-040** | `database/tests/rules/113_insurance_and_claim_golden_rules.sql` | Golden Test | End-to-end replay of CATMS-008 signed golden financial worked example |
| **Docs** | `docs/Dev3_Plan.md` | Documentation | Progress register updated with Steps 7–10 marked Done |

---

## 3. Mathematical Foundations & Business Rules

### Rule 3.1: Patient Ownership Invariant
- A policy cannot be claimed against an invoice unless `policy.patient_id == invoice.appointment.patient_id`.
- Enforced at DB level by trigger `trg_guard_claim_patient_ownership`.

### Rule 5.2 & 5.3: Coordination of Benefits & Allocation Ceiling
- Sequential balance reduction across policies $P_1, P_2, \dots$:
  $$\text{NominalCover}(p, i) = \text{ROUND}\left(\frac{L_i \times \text{coverage\_percentage}(p, i)}{100}, 2\right)$$
  $$\text{MaxEligibleCover}(p, i) = \min(\text{NominalCover}, \text{cap}, L_i)$$
  $$\text{Claimed}(p, i) = \min(\text{MaxEligibleCover}(p, i), \text{RemainingUncoveredBalance}(i))$$
- Strict ceiling invariant:
  $$\sum_p \text{Claimed}(p, i) \le L_i$$
  Enforced by trigger `trg_guard_claim_line_consistency_and_ceiling`.

### Rule 6.1 & 6.2: Terminal States & Append-Only Audit History
- `Approved`, `PartiallyApproved`, and `Rejected` are terminal states.
- Status history table `insurance_claim_status_log` rejects `UPDATE` and `DELETE` via trigger `trg_guard_claim_status_log_immutable`.

### Rule 7.1: Submission Does NOT Alter Patient Liability
- Submitting a claim puts it in `Pending` status.
- `invoice.patient_liability_amount` remains 100% equal to `subtotal_amount`.

### Rule 7.2: Atomic Liability Recalculation on Resolution
- In the same database transaction as `resolve_claim()`:
  $$\text{invoice.approved\_insurance\_amount} = \sum_{\text{Approved, PartiallyApproved}} \text{claim.approved\_amount}$$
  $$\text{invoice.patient\_liability\_amount} = \max(0.00, \text{invoice.subtotal\_amount} - \text{invoice.approved\_insurance\_amount})$$
  $$\text{patient\_payment\_status} = \begin{cases} \text{'Paid'} & \text{if } \text{patient\_paid} \ge \text{liability} \\ \text{'PartiallyPaid'} & \text{if } 0 < \text{patient\_paid} < \text{liability} \\ \text{'Unpaid'} & \text{if } \text{patient\_paid} = 0 \end{cases}$$

### Rule 8.1 & 8.2: Service-Date Snapshots & Historical Preservation
- Coverage terms (% and cap) are evaluated as of $T_{\text{service}} = \text{appointment.start\_at::date}$.
- Snapshots on `insurance_claim_line` ensure that subsequent policy changes never alter historical claims.

---

## 4. Verification Against Golden Worked Example (CATMS-008)

The test `113_insurance_and_claim_golden_rules.sql` validates:
1. **Invoice Issuance**: Line 1 (3,500.00 LKR) + Line 2 (6,500.00 LKR) = Subtotal 10,000.00 LKR, Liability 10,000.00 LKR.
2. **Submission**:
   - Ceylinco Claim: Line 1 = 2,000.00 LKR (capped), Line 2 = 4,550.00 LKR -> Total 6,550.00 LKR (`Pending`).
   - SLIC Claim: Line 1 = 1,500.00 LKR (balance limit), Line 2 = 0.00 LKR -> Total 1,500.00 LKR (`Pending`).
   - Line 1 total allocation = 3,500.00 LKR (exact 100%, 0 over-allocation).
   - Patient liability remains 10,000.00 LKR!
3. **Claim 1 Partial Approval**:
   - Approved: 5,800.00 LKR (Line 1: 2,000.00, Line 2: 3,800.00).
   - Invoice Liability becomes: 10,000.00 - 5,800.00 = 4,200.00 LKR!
4. **Claim 2 Rejection**:
   - Approved: 0.00 LKR.
   - Invoice Liability remains: 4,200.00 LKR!
5. **Coverage Update in Future**:
   - Updating Ceylinco policy to 90% (3,000.00 LKR cap) does not alter the historical claim snapshot (retains 80%, 2,000.00 LKR).

---

## 5. Viva & Defense Reference

**Q1: Why must insurance claims enforce patient ownership at the database level?**  
*Answer:* A clinic handles hundreds of patients across multiple branches. Without a database-level invariant (`trg_guard_claim_patient_ownership`), an application bug or malicious API call could attach Patient B's high-coverage policy to Patient A's invoice, creating fraudulent insurance claims. Enforcing this at the DB level prevents fraud regardless of API bugs.

**Q2: Why does claim submission NOT reduce patient liability?**  
*Answer:* Submitting a claim is merely an application for coverage. The insurer may partially approve or reject the claim. If liability were reduced at submission, the clinic's ledger would show money not owed by the patient, leaving uncollectible debt upon rejection. Liability is only reduced by the authoritative `approved_amount` inside `resolve_claim()`.

**Q3: How is double-coverage prevented when a patient has multiple policies?**  
*Answer:* Via the Coordination of Benefits sequential balance reduction algorithm. The primary policy covers up to its cap, and subsequent policies are bounded by $\min(\text{Eligible}, \text{RemainingUncoveredBalance})$. Additionally, the trigger `trg_guard_claim_line_consistency_and_ceiling` enforces $\sum \text{Claimed} \le \text{LineTotal}$ at the database level.

**Q4: Why is `insurance_claim_status_log` append-only?**  
*Answer:* In financial and healthcare compliance, claim state transitions represent an immutable legal and audit record. Updating or deleting status transitions would violate financial auditability and traceability requirements.
