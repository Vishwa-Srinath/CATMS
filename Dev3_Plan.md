# Dev3 Execution Plan â€” Patient, Insurance and Claims

**Project:** CATMS (Clinic Appointment and Treatment Management System)
**Owner:** Dev3 | **Load:** ~20% of the project
**Domain:** Patient identity Â· Insurance providers/policies/coverage Â· Claim lifecycle (eligibility â†’ submission â†’ resolution)
**Sources:** `member_plan.md` Â§10 + `CATMS_Complete_GitHub_Issue_Backlog.md` (issue chain: 006 â†’ 008 â†’ 018 â†’ 019 â†’ 025 â†’ 026 â†’ 037 â†’ 038 â†’ 039 â†’ 040 â†’ 048 â†’ 049 â†’ 059 â†’ 060 â†’ 067 â†’ 075)

---

## How to use this document

You are vibe-coding this â€” an AI will write most of the code â€” but you must understand **why** each step exists so you can judge what the AI produces. Each step has:

| Field | Purpose |
|---|---|
| **What** | The concrete deliverable |
| **Why** | What breaks or what risk stays if you skip it |
| **Depends on** | Must be Done first â€” do not skip ahead |
| **AI prompt tip** | What to say to get a good result from an AI |
| **Acceptance evidence** | How you prove it works, not just that it compiles |

The plan follows the team gate structure (G0â€“G6) because your modules feed Dev1 (scheduling), Dev4 (invoices), and Dev5 (reports). Going out of order means their work is built on assumptions that will not match what you ship.

---

## Overall Progress

> Update this table as you complete steps. Legend: ⬜ Not started · 🟡 In progress · ✅ Done · 🛑 Blocked

| Step | Issue | Name | Status |
|:---:|:---:|---|:---:|
| 1 | CATMS-006 | Freeze eligibility and claim rules | ✅ Done |
| 2 | CATMS-008 | Golden financial worked example | ✅ Done |
| 3 | CATMS-018 | Patient identity schema | 🟡 In progress |
| 4 | CATMS-019 | Provider, policy, coverage schema | ⬜ Not started |
| 5 | CATMS-025 | Atomic registration procedure | ⬜ Not started |
| 6 | CATMS-026 | Policy/coverage lifecycle procedures | ⬜ Not started |
| 7 | CATMS-037 | Claim, claim-line, status-history schema | ⬜ Not started |
| 8 | CATMS-038 | Claim eligibility and submission procedure | ⬜ Not started |
| 9 | CATMS-039 | Claim resolution and liability recalculation | ⬜ Not started |
| 10 | CATMS-040 | Prove insurance and claim rules (DB tests) | ⬜ Not started |
| 11 | CATMS-048 | Patient and Insurance Terms API | ⬜ Not started |
| 12 | CATMS-049 | Claims API and tests | ⬜ Not started |
| 13 | CATMS-059 | Connect Patient and Insurance frontend | ⬜ Not started |
| 14 | CATMS-060 | Connect Claim submission and review frontend | ⬜ Not started |
| 15 | CATMS-067 | Patient/Insurance/Claim frontend tests | ⬜ Not started |
| 16 | CATMS-075 | Reconcile at scale and privacy audit | ⬜ Not started |

---

## Phase G0 â€” Decisions and contracts
> **TL;DR:** Write down the rules and verify the math *before* writing a single line of code. Everything downstream depends on these two steps being unambiguous.

---

### Step 1 â€” CATMS-006: Freeze eligibility, multi-policy and claim rules
- [x] Rules documented in plain language plus a diagram (see `docs/CATMS-006_Insurance_Eligibility_and_Claim_Rules.md`)
- [x] Claim state machine defined (all states and transitions)
- [x] Dev1 and Dev4 sign-off section drafted and aligned with billing

**What:** Document, in plain language plus a diagram: when a policy is "eligible" for a treatment, how percentage/cap coverage is applied, how multiple policies on one patient are ordered and split, and the full claim state machine (Pending â†’ Approved / PartiallyApproved / Rejected, and what triggers each).

**Why:** This is a *decision* issue, not a code issue. Insurance math is the single easiest place for silent bugs â€” double coverage, wrong liability, unrecoverable states. If you let AI generate the claim procedure before this is frozen, it will invent its own interpretation of "cap" or "partial approval." You will only discover the mismatch during integration, when it is expensive to fix.

**Depends on:** CATMS-002 (approved ERD) Â· CATMS-005 (Dev4 invoice/price rules)

**AI prompt tip:**
> "I need to document insurance claim rules for a clinic system. Business rules: [paste]. Generate a Markdown doc with: (1) plain-language explanation, (2) Mermaid state machine diagram, (3) worked example for multi-policy allocation. Do not generate any code."

**Acceptance evidence:**
- Coverage allocation can never exceed the invoice line total â€” written as an explicit rule, not just tested later
- Every claim status has documented entry/exit conditions
- Dev1 and Dev4 confirm no conflicts with scheduling/billing assumptions

---

### Step 2 â€” CATMS-008: Create the signed golden financial worked example
- [x] Hand-calculated example complete (see `docs/CATMS-008_Golden_Financial_Worked_Example.md`)
- [x] Dev4 independently reproducible final balances documented
- [x] Dev5 derived correct report totals from the example

**What:** By hand (paper or spreadsheet, not code), calculate: 2 treatment lines, 1 patient with 2 active policies, eligibility per treatment, one partial approval, one rejection, a patient payment, an insurer payment, a rejected overpayment attempt, and a reversal â€” ending in final reconciled balances.an insurer payment, a rejected overpayment attempt, and a reversal â€” ending in final reconciled balances.

**Why:** This is your ground truth. Once real code exists, "does the code work?" is subjective without a hand-verified answer. It forces you to apply Step 1 rules to real numbers *before* they are locked into SQL. Dev4 must independently reproduce your numbers â€” disagreement is exactly the bug you want to catch before code exists.

**Depends on:** CATMS-005 Â· CATMS-006 Â· CATMS-007 (Dev5 report definitions)

**AI prompt tip:**
> "I have these insurance calculation rules: [paste rules]. Help me create a financial worked example with: 2 treatments, 2 policies with different percentages and caps, one partial approval, one rejection, and final reconciled balances. Show every intermediate step."

**Acceptance evidence:**
- Every intermediate value shown, not just finals
- Dev4 gets the same result independently
- Dev5 can derive correct report totals from it

---

## Phase G1 â€” Foundational schema
> **TL;DR:** Build patient and insurance tables with constraints that make "clinic-wide" and "coverage history" true at the database level â€” not enforced by application code.

---

### Step 3 — CATMS-018: Patient, identity and emergency-contact schema
- [x] `patient`, `patient_identity`, `emergency_contact` tables created (`database/migrations/040_create_patient_identity_schema.sql`)
- [x] Clinic-wide NIC/passport uniqueness enforced (not per-branch)
- [x] Primary-identity and at-least-one-contact constraints verified (`database/tests/schema/040_patient_identity_schema.test.sql`)

**What:** Tables: `patient`, `patient_identity`, `emergency_contact`. Enforce clinic-wide (not per-branch) uniqueness of normalized NIC/passport. A patient must have exactly one primary identity and at least one emergency contact.

**Why:** The core requirement is "search/register patients clinic-wide" â€” a patient registered at Branch A must be bookable at Branch B. If you scope uniqueness by branch here, Dev1's scheduling module inherits that mistake and cannot fix it without touching your tables.

**Depends on:** CATMS-015 (branch schema) Â· CATMS-012 (extensions/base roles)

**AI prompt tip:**
> "Generate a PostgreSQL migration for `patient`, `patient_identity`, `emergency_contact`. Requirements: (1) NIC/passport uniqueness is clinic-wide â€” normalized form. (2) Exactly one `is_primary = true` row per patient in `patient_identity`. (3) At least one emergency contact per patient â€” enforce with deferred constraint or trigger. No application-level enforcement. Include rollback."

**Acceptance evidence:**
- NIC/passport uniqueness holds across branches, not just within one
- A second `is_primary = true` identity row is actually rejected

---

### Step 4 â€” CATMS-019: Provider, policy and effective-coverage schema
- [ ] `insurance_provider`, `insurance_policy`, `policy_coverage` tables created
- [ ] Coverage is treatment-specific and effective-dated
- [ ] Overlap constraint verified for same policy + treatment

**What:** Tables: `insurance_provider`, `insurance_policy`, `policy_coverage`. Coverage is treatment-specific and effective-dated (start/end validity window), with percentage and cap fields.

**Why:** Coverage terms change over time. Without effective-dating, you cannot answer "what did this policy cover on the date the treatment happened" â€” which is exactly what a claim needs. Building this now avoids a painful migration later when someone needs coverage history for an old claim.

**Depends on:** CATMS-018 Â· CATMS-020 (Dev4 treatment catalogue)

**AI prompt tip:**
> "Generate a PostgreSQL migration for `insurance_provider`, `insurance_policy`, `policy_coverage`. Requirements: (1) Provider + policy number unique. (2) `policy_coverage` has `effective_from` and `effective_to`. (3) Constraint preventing overlapping date ranges for same `policy_id` + `treatment_id`. (4) Reject invalid percentages (0â€“100) and negative caps. Include rollback."

**Acceptance evidence:**
- Provider + policy number uniqueness enforced
- Invalid percentage/cap/date values rejected by constraints, not application code
- Overlapping date ranges for same policy + treatment rejected

---

## Phase G2 â€” Database rules and transactions
> **TL;DR:** Wrap all multi-row writes in stored procedures. The database â€” not the API or frontend â€” guarantees no partial or corrupt state ever exists.

---

### Step 5 â€” CATMS-025: Atomic patient-registration procedure
- [ ] Single procedure creates patient + identity + contact in one transaction
- [ ] Duplicate-identity attempt leaves zero rows behind (confirmed)
- [ ] Missing-contact attempt leaves zero rows behind (confirmed)

**What:** A single database procedure that creates `patient` + `patient_identity` + at least one `emergency_contact` together in one transaction.

**Why:** A half-registered patient (identity row exists but no emergency contact because the second insert failed) is worse than no patient â€” it is a data-integrity landmine that surfaces months later. One controlled procedure means the database guarantees no partial patient ever exists.

**Depends on:** CATMS-018 Â· CATMS-021 (fixture data for testing)

**AI prompt tip:**
> "Write a PostgreSQL procedure `register_patient(...)` that atomically creates a patient, their primary identity, and at least one emergency contact in one transaction. Roll back everything on any failure. `registered_by` and `registered_at` must come from inside the procedure, not from the caller. Return the new `patient_id`."

**Acceptance evidence:**
- Duplicate-identity attempt leaves zero rows â€” not a dangling patient row
- Missing-contact attempt also leaves zero rows
- Timestamps and creator fields come from the database, not client input

---

### Step 6 â€” CATMS-026: Policy and coverage lifecycle procedures
- [ ] Procedures for creating providers/policies/coverage exist
- [ ] "Updating" coverage closes old term and opens a new one (no raw UPDATE)
- [ ] Old claims still resolve correctly against historical terms after a policy change

**What:** Controlled procedures for creating providers/policies/coverage and updating effective terms â€” not raw UPDATE/INSERT from the API.

**Why:** "Updating" coverage means closing the old term and opening a new row â€” so historical claims resolve against the terms true when the treatment happened. If you allow a plain UPDATE, someone will silently rewrite history for past claims.

**Depends on:** CATMS-019 Â· CATMS-006 (frozen rules)

**AI prompt tip:**
> "Write a PostgreSQL procedure `update_policy_coverage(policy_id, treatment_id, new_percentage, new_cap, effective_from)`. It must: (1) set the current coverage row's `effective_to` to `effective_from - 1 day`, (2) insert a new row starting on `effective_from`, (3) reject overlapping dates. No direct UPDATE of existing coverage rows. Wrap in a transaction."

**Acceptance evidence:**
- Overlapping terms rejected
- Expired/suspended policy distinguishable from active
- Claim made under old term recalculates correctly even after policy changes

---

## Phase G2 continued â€” Claims (highest-risk part of your module)
> **TL;DR:** Claims touch real money across three modules. Every rule must live in the database. Atomic transactions on every multi-step write.

---

### Step 7 â€” CATMS-037: Claim, claim-line and status-history schema
- [ ] `insurance_claim`, `insurance_claim_line`, `insurance_claim_status_log` created
- [ ] DB-level check: claim policy belongs to the invoice patient
- [ ] Status-history is append-only (no UPDATE or DELETE)

**What:** Tables: `insurance_claim`, `insurance_claim_line`, `insurance_claim_status_log`, with checks that a claim's policy belongs to the invoice's patient and claim lines reference real invoice/coverage lines.

**Why:** Without database-level enforcement of "this policy belongs to this patient," it is possible to submit a claim for the wrong patient's policy â€” a fraud/audit problem, not just a bug. Status-history is append-only because financial/audit data must never be silently overwritten.

**Depends on:** CATMS-019 Â· CATMS-034 (Dev4 invoice-line schema)

**AI prompt tip:**
> "Generate a PostgreSQL migration for `insurance_claim`, `insurance_claim_line`, `insurance_claim_status_log`. Requirements: (1) CHECK/FK constraint â€” claim's `policy_id` must belong to the invoice's patient. (2) `insurance_claim_status_log` is append-only â€” trigger prevents UPDATE or DELETE. (3) Claimed amounts per line cannot exceed the invoice line total. Include rollback."

**Acceptance evidence:**
- Claim on a policy not belonging to the invoice patient rejected at DB level
- Status log rows cannot be updated or deleted

---

### Step 8 â€” CATMS-038: Claim eligibility and submission procedure
- [ ] Procedure snapshots coverage at service date (not current terms)
- [ ] Multi-policy allocation sum-check enforced (never exceeds line total)
- [ ] Output matches golden example from Step 2

**What:** A procedure that snapshots treatment-level eligibility (percentage/cap as of service date), validates multi-policy allocation does not exceed the invoice line total, and creates the claim in `Pending` status.

**Why:** "Snapshot" is the key word â€” coverage terms can change after submission, but the claim must always reflect what was true on the service date. The multi-policy cap check is where "double coverage" bugs live â€” two policies can each pay 80% of the same line without an explicit sum-check.

**Depends on:** CATMS-026 Â· CATMS-037 Â· CATMS-008 (golden example â€” validate output against hand-calculated numbers)

**AI prompt tip:**
> "Write a PostgreSQL procedure `submit_claim(invoice_id, policy_ids[], service_date)` that: (1) looks up effective coverage for each policy as of `service_date` â€” not current terms, (2) calculates each policy's allocation using percentage/cap rules, (3) checks that the sum of allocations does not exceed the invoice line total, (4) creates an `insurance_claim` in Pending status. Roll back and raise a descriptive error on any failure. Rules: [paste from Step 1]."

**Acceptance evidence:**
- Expired policy on service date cannot be claimed
- Percentage/cap math matches golden example exactly
- Total allocated coverage never exceeds line total

---

### Step 9 â€” CATMS-039: Claim resolution and liability recalculation
- [ ] Procedure transitions claim to Approved/PartiallyApproved/Rejected
- [ ] Transition recorded immutably in status log
- [ ] Liability recalculation is atomic with the status transition

**What:** Procedure for transitioning a claim to Approved/PartiallyApproved/Rejected, recording immutably, and â€” atomically, in the same transaction â€” recalculating the patient's outstanding liability on the invoice.

**Why:** Liability recalculation touches real money. If the claim resolves but the recalculation fails (or vice versa), you get an invoice and a claim that disagree â€” and nobody can tell which is correct. One transaction means either both happen or neither does.

**Depends on:** CATMS-038 Â· CATMS-034

**AI prompt tip:**
> "Write a PostgreSQL procedure `resolve_claim(claim_id, resolution, approved_amount, resolved_by)` where resolution is one of Approved, PartiallyApproved, Rejected. It must: (1) validate claim is in Pending, (2) INSERT into `insurance_claim_status_log` â€” never UPDATE, (3) in the same transaction, UPDATE the patient's invoice liability â€” only `approved_amount` reduces liability. Roll back the status change if the liability update fails."

**Acceptance evidence:**
- Only the approved amount reduces liability â€” partial approval reduces by approved portion only
- Induced failure mid-procedure leaves both claim and invoice in prior state

---

### Step 10 â€” CATMS-040: Prove insurance and claim rules (database tests)
- [ ] Direct DB tests written (not through API or UI)
- [ ] No double-coverage scenario passes
- [ ] Coverage snapshot on old claim survives policy edits
- [ ] Amounts reconcile with golden example

**What:** Test suite run directly against PostgreSQL: active/expired/suspended policies, cap enforcement, multi-policy allocation, partial/rejected claims, forced-rollback scenarios.

**Why:** "The UI is not accepted as proof" for database rules. A passing UI test can hide a database rule that does not actually exist. Testing directly against the database proves the rule holds even if a future API bug or malicious request tries to break it.

**Depends on:** CATMS-039

**AI prompt tip:**
> "Write a pgTAP test suite for the claim system. Tests: (1) expired policy claim â€” must fail, (2) multi-policy allocation exceeding line total â€” must fail, (3) approving a claim â€” verify invoice liability reduced correctly, (4) mid-procedure failure â€” confirm rollback. Expected values: [paste golden example from Step 2]."

**Acceptance evidence:**
- No double coverage under any tested combination
- Coverage snapshot on old claim survives after editing the policy
- Claim actor and invoice totals reconcile with golden example

---

## Phase G3 â€” API layer
> **TL;DR:** Thin routes only â€” validation, shaping, and role checks. Rules live in the database. Never re-implement business logic here.

---

### Step 11 â€” CATMS-048: Patient and Insurance Terms API
- [ ] Patient search/register/detail endpoints implemented
- [ ] Provider/policy/coverage endpoints implemented
- [ ] Zod validation in place; `registered_by` cannot be supplied by client

**What:** Endpoints for clinic-wide patient search/register/detail, emergency contacts, and provider/policy/coverage â€” thin routes calling database procedures from Steps 3â€“6, plus Zod validation.

**Why:** The API is deliberately thin â€” rules live in the database. This layer only validates, shapes requests/responses, and blocks what the database would not accept. Building this after database rules exist (not as the place to implement them) is what keeps "business rules are not trusted to React or Express" true in practice.

**Depends on:** CATMS-025 Â· CATMS-026 Â· CATMS-045 (Dev1 shared API platform/error-mapping)

**AI prompt tip:**
> "Generate an Express + TypeScript router for patient management. Routes: POST /patients, GET /patients/search?q=, GET /patients/:id. Each route: (1) validates with Zod, (2) calls the existing DB procedure â€” no business logic in the handler, (3) uses the shared error envelope from CATMS-045, (4) strips `registered_by` and `registered_at` from the request body. Procedure signatures: [paste]."

**Acceptance evidence:**
- Search ignores registration branch (proves clinic-wide search works end-to-end)
- Registration is atomic through the API, same as at the database level

---

### Step 12 â€” CATMS-049: Claims API and tests
- [ ] Eligibility preview endpoint implemented
- [ ] Claim submission endpoint implemented
- [ ] Claim resolution restricted to finance-role users
- [ ] Browser-supplied totals/actors rejected

**What:** Endpoints for eligibility preview, claim submission, list/detail, and controlled resolution (finance-role only) â€” plus contract tests.

**Why:** Approving or rejecting a claim changes real money owed. A Reception-level user must literally be unable to call the resolution endpoint, even if they know the URL. The API must compute eligibility server-side and reject any client-supplied total.

**Depends on:** CATMS-038 Â· CATMS-039 Â· CATMS-045

**AI prompt tip:**
> "Generate an Express + TypeScript router for claims. Routes: POST /claims, GET /claims/:id, PATCH /claims/:id/resolve (finance role only). For resolve: (1) enforce role check â€” reject non-finance with 403, (2) ignore `approved_amount` from request body â€” compute server-side, (3) return new claim state and updated invoice liability."

**Acceptance evidence:**
- Only permitted finance roles can resolve a claim
- Browser-supplied totals rejected at route level
- Golden example and one invalid-allocation case pass through the actual HTTP layer

---

## Phase G4 â€” Frontend integration
> **TL;DR:** Replace fake in-memory data with your real API. After this phase, your screens only work if your database and API are correct.

---

### Step 13 â€” CATMS-059: Connect Patient and Insurance frontend
- [ ] Patient search wired to real API
- [ ] Registration wired to real API
- [ ] Policy/coverage actions wired to real API
- [ ] Persisted patient survives page refresh

**What:** Wire the existing Patients/Insurance screens to your real API â€” replacing `ClinicContext` in-memory data â€” for search, registration, detail, contact management, and policy/coverage actions.

**Why:** The frontend currently "works" with fake in-memory data â€” which proves nothing about your actual database/API. After this step, the screens can only work if your database and API are genuinely correct. The plan explicitly states in-memory simulation is "not evidence of database correctness."

**Depends on:** CATMS-048 Â· CATMS-056 (shared query-client/router) Â· CATMS-057 (Finance-page boundary split)

**AI prompt tip:**
> "Replace all `ClinicContext` data reads in Patient and Insurance screens with React Query hooks. For each screen: (1) `useQuery` for reads, `useMutation` for writes, (2) show loading state while fetching, (3) display the actual API error message on failure â€” not a generic fallback â€” especially for duplicate-identity or invalid-policy errors. Endpoints: [paste from Step 11]."

**Acceptance evidence:**
- Newly registered patient survives a page refresh (proves actual persistence)
- Duplicate-identity and invalid-policy errors in the UI come from the database rejection â€” not a client guess

---

### Step 14 â€” CATMS-060: Connect Claim submission and review frontend
- [ ] Eligibility preview wired to real API
- [ ] Policy selection and submission wired to real API
- [ ] Status/history display wired to real API
- [ ] Finance-review UI role-gated (non-finance users genuinely blocked)

**What:** Wire eligibility preview, policy selection, submission, status/history display, and the finance-review UI to the Claims API.

**Why:** Approved/partial/rejected values must come from the API response â€” that is the only place the real calculation happens. Any client-side calculation silently reintroduces the double-coverage/liability bug your database rules (Steps 8â€“10) were built to prevent.

**Depends on:** CATMS-049 Â· CATMS-057 Â· CATMS-059

**AI prompt tip:**
> "Wire the claim submission flow in React to the Claims API. The eligibility preview must call GET /claims/preview and display the server's calculated allocation â€” never compute percentages or amounts on the client. The Approve/Reject controls should be hidden for non-finance roles via auth context, but also call an endpoint that enforces the role check server-side â€” hiding is UX, not security."

**Acceptance evidence:**
- Invalid multi-policy allocation shows a rejection originating from the database/API â€” not a client guess
- A Reception-role user is actually blocked from the resolution controls, not just visually hidden

---

## Phase G5 â€” Tests and reconciliation
> **TL;DR:** Lock in the guarantees. Tests fail if the UI ever calculates money itself. Scale test proves edge cases do not break the rules.

---

### Step 15 â€” CATMS-067: Patient/Insurance/Claim frontend tests
- [ ] Automated tests for registration and duplicate handling
- [ ] Automated tests for policy actions
- [ ] Automated tests for claim flows
- [ ] Test verifies UI does NOT calculate liability/approval values itself

**What:** Automated tests for registration, duplicate handling, policy actions, claim flows, and permission-restricted states.

**Why:** This locks in the guarantee from Steps 13â€“14 so it cannot silently regress â€” specifically, a test proving the UI does not calculate authoritative approved/liability values itself. Without this, a future "quick fix" by you, a teammate, or an AI could reintroduce client-side calculation without anyone noticing until the demo.

**Depends on:** CATMS-059 Â· CATMS-060

**AI prompt tip:**
> "Write React Testing Library tests for the Claims frontend. Include: (1) a test that mocks the API to return a specific `approved_amount` and confirms the UI displays exactly that value â€” not a computed value from other props, (2) a test that mocks a 403 for a non-finance user attempting resolution and confirms an error is shown, (3) a test that a failed registration leaves the UI recoverable."

**Acceptance evidence:**
- Tests fail if the UI attempts its own liability/approval math instead of reading API values
- API error states (rejected claim, 403) handled gracefully â€” not left blank/broken

---

### Step 16 â€” CATMS-075: Reconcile at scale and privacy audit
- [ ] Bulk scenario results match hand calculations
- [ ] No double allocation at scale
- [ ] Log/error review shows no patient identity or clinical data leaking

**What:** Run multi-policy/expiry/suspension/cap/partial/rejected scenarios against bulk data and reconcile against hand calculations. Separately audit logs and error messages for leaked patient identity or clinical data.

**Why:** Everything up to this point was verified with a tiny fixture. This step proves the same rules hold at realistic data volumes, where edge cases (e.g., a patient with three overlapping historical policies) are more likely to surface. The privacy check catches correct business logic that accidentally logs a patient's NIC in an error message â€” a real compliance risk.

**Depends on:** CATMS-040 Â· CATMS-070 (security/secrets review checklist)

**AI prompt tip:**
> "Generate a PostgreSQL seed script creating 100 patients, each with 1â€“3 insurance policies with varying coverage terms, expiry dates, overlapping policy periods, expired policies, and suspended policies. Also generate an audit query searching application logs for NIC numbers, passport numbers, or claim rejection messages containing patient names."

**Acceptance evidence:**
- Bulk-scale results match hand calculations â€” no double allocation
- Log/error review shows no patient identity or clinical data leaking outside the database

---

## Cross-cutting rules (apply at every step)

| Rule | Why it exists |
|---|---|
| **Never trust the browser with a number that matters** | Any total, approval amount, or liability must be computed by the database/API â€” this is why Steps 8, 9, 12, and 14 exist the way they do |
| **Coverage and history are append-only** | Never UPDATE a coverage or claim-status row â€” close old terms and add new rows (Steps 4, 6, 7). If an AI suggests "just update the percentage," add a new effective-dated row instead |
| **Do not guess Dev4 or Dev1 schema** | Wait for their fixture + contract + negative case before building against their tables â€” guessing Dev4 invoice-line shape before Step 7 is a named conflict risk |
| **File ownership is strict** | Work inside `/backend/src/modules/patients-insurance/`, `/backend/src/modules/claims/`, `/frontend/src/features/patients-insurance/`, and migrations `11*`â€“`12*`. Anything outside needs the owner's review |
| **Claim migration numbers before creating files** | A coordination rule â€” skipping causes merge pain with Dev4 who owns adjacent migration ranges |

---

## Quick-reference dependency chain

```
006 â†’ 008 â†’ 018 â†’ [needs 020 from Dev4] â†’ 019 â†’ [needs 021 from Dev5] â†’ 025 â†’ 026
    â†’ 037 â†’ 038 â†’ 039 â†’ 040
    â†’ 048 â†’ 049
    â†’ 059 â†’ 060 â†’ 067
    â†’ 075
```

**External dependencies â€” wait for these, do not guess:**

| Dependency | Owner | Needed by |
|---|---|---|
| CATMS-020 (treatment catalogue) | Dev4 | Step 4 â€” CATMS-019 |
| CATMS-021 (base fixture) | Dev5 | Step 5 â€” CATMS-025 |
| CATMS-034 (invoice-line schema) | Dev4 | Step 7 â€” CATMS-037 |
| CATMS-045 (shared API platform) | Dev1 | Steps 11â€“12 â€” CATMS-048/049 |
| CATMS-056 (query-client/router) | Dev1 | Step 13 â€” CATMS-059 |
| CATMS-057 (Finance-page boundary) | Dev1 | Steps 13â€“14 â€” CATMS-059/060 |
| CATMS-070 (security/secrets review) | Dev1 | Step 16 â€” CATMS-075 |

Work strictly left to right. Where a dependency belongs to another dev, wait for it to be marked Done â€” vibe-coding around a missing dependency is exactly the scenario this plan exists to prevent.
