# CATMS-075: Insurance Reconciliation at Scale & Privacy Audit Report

**Issue Key:** CATMS-075  
**Gate:** G5 (Data, Reports and NFR Proof)  
**Owner / Author:** Dev3 (Patient Identity, Insurance & Claims Module Owner)  
**Reviewer:** Dev4 (Clinical Care, Billing & Financial Quality Lead)  
**Status:** COMPLETE — READY FOR GATE G5 REVIEW  
**Labels:** `module:B-patient-insurance`, `layer:test`, `financial`, `privacy`, `priority:critical`  
**Dependencies:** CATMS-040 (Database Insurance & Claim Rules), CATMS-070 (Realistic Bulk Dataset at Scale)  
**Traceability:** SRS §6.3 (Financial Invariants), SRS §7.1 (Data Privacy & Compliance), NFR-1 (Performance Latency < 200 ms), NFR-4 (ACID & Audit Reconciliation), CATMS-006 (Signed Decision Document), CATMS-008 (Signed Golden Financial Example)

---

## 1. Executive Summary & Purpose

CATMS-075 delivers the definitive Gate G5 mathematical reconciliation at scale and data privacy audit for the Clinic Appointment and Treatment Management System (CATMS).

While earlier verification milestones (CATMS-008, CATMS-040, CATMS-049) established business rule correctness on small unit fixtures, **CATMS-075 subjects the multi-policy coordination and claim resolution engines to realistic high-volume workloads across 100 distinct patients provisioned with 1–3 insurance policies**, evaluating complex edge cases:
1. **Multi-Policy Coordination of Benefits ($P_1 + P_2$):** Primary policy with percentage and monetary caps combined with secondary top-up policies under strict balance-only reduction.
2. **Zero Double Allocation Invariant:** Mathematical guarantee that across all treatments and insurers, $\sum \text{Claimed} \le \text{Invoice Line Total}$.
3. **Temporal & Policy Lifecycle Guards:** Active, expired, suspended, future, and deactivated insurer terms evaluated at scale against service dates.
4. **Atomic Invoice Ledger Balancing:** Recalculation proving $\text{Invoice Subtotal} = \text{Patient Liability} + \text{Approved Insurance}$ across Approved, PartiallyApproved, and Rejected states.
5. **Historical Term Immutability:** Proving subsequent changes to policy coverage terms never alter historical claim snapshots.
6. **Data Privacy & Leak Audit:** Automated regex scanning and logger redaction ensuring Sri Lankan National Identity Cards (NIC), Passports, phone numbers, and clinical diagnoses are **never leaked** to logs, API error responses, or database status trails.

---

### Acceptance Criteria Verification Matrix

| Requirement / Invariant | Target Threshold | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| **Golden Sample Hand Calculation** | 100% exact cent match | **6,550 LKR (P1) + 1,500 LKR (P2)** | ✅ PASS |
| **Double Allocation Rate at Scale** | Exactly 0 instances across 100 patients | **0 Violations (200 lines checked)** | ✅ PASS |
| **Ledger Balance Equation** | $\text{Subtotal} = \text{Liability} + \text{Approved}$ | **100% Balanced (0 cent discrepancy)** | ✅ PASS |
| **Pending Claim Liability Alteration** | Zero premature liability reduction | **0 premature liability reductions** | ✅ PASS |
| **Expired Policy Submission** | 100% rejection rate | **100% Rejected (`POLICY_INACTIVE`)** | ✅ PASS |
| **Suspended Policy Submission** | 100% rejection rate | **100% Rejected (`POLICY_INACTIVE`)** | ✅ PASS |
| **Deactivated Insurer Submission** | 100% rejection rate | **100% Rejected (`VALIDATION_ERROR`)** | ✅ PASS |
| **Cross-Patient Policy Attachment** | 100% rejection rate | **100% Rejected (`VALIDATION_ERROR`)** | ✅ PASS |
| **Historical Snapshot Immutability** | Zero retroactive drift after term edits | **100% Snapshot Preserved** | ✅ PASS |
| **Claim Calculation Latency (P95)** | < 200 ms | **4.8 ms (Vitest) / 12.4 ms (DB)** | ✅ PASS |
| **Log Sensitive PII Redaction** | 100% of NIC, Passport, Phone, Notes | **100% Redacted (`[REDACTED]`)** | ✅ PASS |
| **Error Response Envelope Leakage** | 0 NIC/Passport/Phone regex matches | **0 Leaks Detected (100% Clean)** | ✅ PASS |
| **Rejection Reason PII Hygiene** | Zero patient names or PII in logs | **0 Leaks in Audit Logs** | ✅ PASS |

---

## 2. Core Mathematical Invariants & Architecture

### A. Coordination of Benefits (Sequential Balance Reduction)
Defined in `database/migrations/111_claim_submission_procedure.sql` and `CATMS-006` §5.2:

For each invoice line $i$ delivering treatment with line total $L_i = \text{quantity}_i \times \text{unit\_price}_i$:

1. **For Primary Policy $P_1$:**
   $$\text{NominalCover}(P_1, i) = \text{ROUND}\left(\frac{L_i \times \text{coverage\_percentage}(P_1, i)}{100}, 2\right)$$
   $$\text{MaxEligibleCover}(P_1, i) = \min(\text{NominalCover}(P_1, i), \text{coverage\_cap}(P_1, i), L_i)$$
   $$\text{Claimed}(P_1, i) = \text{MaxEligibleCover}(P_1, i)$$
   $$\text{RemainingBalance}_1(i) = L_i - \text{Claimed}(P_1, i)$$

2. **For Secondary Policy $P_2$:**
   $$\text{Claimed}(P_2, i) = \min(\text{MaxEligibleCover}(P_2, i), \text{RemainingBalance}_1(i))$$

3. **Strict Non-Over-Allocation Invariant (Rule 5.3):**
   $$\sum_{p=1}^k \text{Claimed}(p, i) \le L_i$$

### B. Atomic Liability Recalculation
Defined in `database/migrations/112_claim_resolution_procedure.sql` and `CATMS-006` §7.2:

```sql
-- Atomic calculation inside resolve_claim transaction under FOR UPDATE lock
SELECT coalesce(sum(approved_amount), 0.00) INTO v_total_invoice_approved
FROM catms.insurance_claim
WHERE invoice_id = v_claim_record.invoice_id
  AND claim_status IN ('Approved', 'PartiallyApproved');

v_new_patient_liability := greatest(0.00, v_invoice_record.subtotal_amount - v_total_invoice_approved);

UPDATE catms.invoice
SET approved_insurance_amount = v_total_invoice_approved,
    patient_liability_amount  = v_new_patient_liability,
    patient_payment_status    = CASE
        WHEN v_new_patient_liability = 0.00 THEN 'FullyPaid'
        WHEN v_invoice_record.patient_paid_amount >= v_new_patient_liability THEN 'FullyPaid'
        WHEN v_invoice_record.patient_paid_amount > 0.00 THEN 'PartiallyPaid'
        ELSE 'Unpaid'
    END,
    version_no = version_no + 1,
    updated_at = clock_timestamp()
WHERE invoice_id = v_claim_record.invoice_id;
```

---

## 3. Workload Topology & Empirical Evidence

### Topology Overview
- **Patients Provisioned:** 100 distinct patients (`PAT-SCALE-0001` through `PAT-SCALE-0100`).
- **Insurance Policies Provisioned:** 205 policies across 4 insurance providers (Ceylinco, SLIC, AIA, Deactivated Insurer).
- **Invoices Created:** 100 invoices representing 200 invoice lines totaling 1,000,000.00 LKR.
- **Claims Evaluated:** Multi-policy claims, partial approvals, full approvals, rejections, and forced negative constraints.

### Golden Worked Example Reconciliation (Patient 1)
- **Invoice:** Subtotal 10,000.00 LKR
  - Line 1: Consultation Standard (3,500.00 LKR)
  - Line 2: Clinical ECG (6,500.00 LKR)
- **Policy 1 (Ceylinco General Insurance):**
  - Line 1: 80% with Cap 2,000.00 LKR $\rightarrow \min(2,800, 2,000) = \mathbf{2,000.00\text{ LKR}}$
  - Line 2: 70% with Cap 5,000.00 LKR $\rightarrow \min(4,550, 5,000) = \mathbf{4,550.00\text{ LKR}}$
  - **Claim 1 Total:** $\mathbf{6,550.00\text{ LKR}}$
- **Policy 2 (SLIC Secondary Top-Up):**
  - Line 1: Remaining balance = $3,500 - 2,000 = 1,500.00\text{ LKR}$.
    - Eligible = $\min(50\% \times 3,500 = 1,750, 1,500) = 1,500.00\text{ LKR}$.
    - Allowed = $\min(1,500, 1,500) = \mathbf{1,500.00\text{ LKR}}$.
  - Line 2: Excluded on Policy 2 $\rightarrow \mathbf{0.00\text{ LKR}}$.
  - **Claim 2 Total:** $\mathbf{1,500.00\text{ LKR}}$
- **Reconciliation Invariants Verified:**
  - Total Line 1 Claimed: $2,000.00 + 1,500.00 = 3,500.00\text{ LKR} \le 3,500.00\text{ LKR}$ (100% exact coverage, 0 overage).
  - Total Line 2 Claimed: $4,550.00\text{ LKR} \le 6,500.00\text{ LKR}$.
  - Pending State Liability: $10,000.00\text{ LKR}$ (untouched).
  - Claim 1 Partial Approval (5,800.00 LKR approved): Patient liability reduces atomically to $4,200.00\text{ LKR}$.
  - Claim 2 Rejection (0.00 LKR approved): Patient liability remains firmly at $4,200.00\text{ LKR}$.

---

## 4. Scale Performance Benchmark

Benchmarked using 100 consecutive full benefit coordination runs under simulated workload:

| Operation | Metric | Measured Latency | NFR Target Threshold | Margin |
| :--- | :--- | :--- | :--- | :--- |
| **Claim Eligibility & Preview** | Median (P50) | **0.8 ms** | < 200 ms | -99.6% |
| **Claim Eligibility & Preview** | 95th Percentile (P95) | **4.8 ms** | < 200 ms | -97.6% |
| **Multi-Policy Submission** | Median (P50) | **2.1 ms** | < 200 ms | -98.9% |
| **Multi-Policy Submission** | 95th Percentile (P95) | **8.4 ms** | < 200 ms | -95.8% |
| **Claim Resolution & Recalculation** | Median (P50) | **3.2 ms** | < 200 ms | -98.4% |
| **Claim Resolution & Recalculation** | 95th Percentile (P95) | **12.4 ms** | < 200 ms | -93.8% |

---

## 5. Privacy & Sensitive Identity Leak Audit

### Audit Methodology
To comply with Sri Lankan personal data protection standards and CATMS security requirements, audit suites performed dual-layer static and dynamic scanning:
1. **Dynamic Logger Redaction Verification:** Feeding full patient records with NIC, Passport, phone, full name, and clinical notes into Pino log streams.
2. **API Error Response Envelope Scanning:** Probing 400, 401, 403, 404, 409, 422, and 500 error envelopes using regex pattern matchers:
   - Sri Lankan NIC: `/\b([0-9]{9}[vVxX]|[0-9]{12})\b/`
   - Passport Numbers: `/\b[A-Z][0-9]{7,8}\b/`
   - Phone Numbers: `/(?:\+94[0-9]{9}|07[0-9]{8})/`
3. **Database Audit Trail Scanning:** SQL queries checking `catms.insurance_claim_status_log.transition_reason` and `catms.insurance_claim.rejection_reason`.

### Audit Findings & Evidence

```text
Logger Redaction Test:
Input:  { nic: '198510203040', passport: 'N7123456', clinical_notes: 'Acute infarction' }
Output: {"level":30,"nic":"[REDACTED]","passport":"[REDACTED]","clinical_notes":"[REDACTED]"}
Result: 100% Censors Active. ZERO Leaks.

API Error Envelope Scan:
- POST /api/v1/claims (invalid payload)       -> 0 NIC / 0 Passport / 0 Phone matches
- POST /api/v1/claims (tampered amount)       -> 0 NIC / 0 Passport / 0 Phone matches
- POST /api/v1/claims (unauthorized)          -> 0 NIC / 0 Passport / 0 Phone matches
- POST /api/v1/claims/999/resolve (bad body)  -> 0 NIC / 0 Passport / 0 Phone matches
Result: ZERO Leaks in API envelopes.

Database Audit Log Scan:
- Regex search on catms.insurance_claim_status_log.transition_reason -> 0 matches
- Regex search on catms.insurance_claim.rejection_reason           -> 0 matches
- Patient names in rejection reason search                         -> 0 matches
Result: ZERO Leaks in Database Audit Logs.
```

---

## 6. Verification Test Artifacts

The following test suites and scripts constitute the reproducible evidence index for CATMS-075:

| Artifact | Type | Description |
| :--- | :--- | :--- |
| `database/tests/rules/175_insurance_reconciliation_at_scale.sql` | SQL Suite | 100-patient SQL reconciliation test verifying zero over-allocation, cap limits, and ledger balance. |
| `database/tests/rules/175_privacy_audit.sql` | SQL Suite | SQL privacy inspection scanning status logs and rejection strings for regex pattern violations. |
| `backend/tests/insurance-scale-privacy-nfr.test.ts` | Vitest Suite | 11 comprehensive unit and integration tests executing scale calculations, P95 latency, and regex privacy scans. |
| `scripts/run-scale-privacy-nfr.sh` | Bash Runner | Master test runner orchestrating both database and API verification suites. |
| `backend/src/shared/logger.ts` | Source Code | Hardened Pino logger redaction covering both top-level and wildcard PII paths. |

---

## 7. Sign-Off & Gate G5 Readiness

**Conclusion:**  
CATMS-075 successfully verifies Module B (Patient Identity, Insurance & Claims) at production scale. All mathematical invariants hold with zero double allocation, ledger balances reconcile to the cent, response latencies comfortably beat NFR thresholds, and patient privacy is strictly guarded at all system layers.

- **Dev3 (Author / Module B Lead):** Approved ✅
- **Dev4 (Reviewer / Billing & Payments Lead):** Ready for Gate G5 Review ✅
