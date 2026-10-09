/**
 * backend/tests/claims.test.ts
 * Owner: Dev3 | Issue: CATMS-049
 *
 * Supertest integration test suite for Claims API:
 *   - POST /api/v1/claims/preview        (Eligibility preview & coordination of benefits)
 *   - GET  /api/v1/claims/preview        (Query-param preview)
 *   - POST /api/v1/claims                (Multi-policy submission via catms.submit_claim)
 *   - POST /api/v1/claims/submit         (Alternative submit endpoint)
 *   - GET  /api/v1/claims                (List claims with pagination & filters)
 *   - GET  /api/v1/claims/:id            (Claim detail with snapshot lines & status log)
 *   - PATCH /api/v1/claims/:id/resolve   (Controlled resolution — finance/admin only)
 *   - POST  /api/v1/claims/:id/resolve   (Alternative POST resolution)
 *
 * Key Invariants & Acceptance Evidence:
 *   1. Full HTTP contracts, Zod validation schemas, and response envelope.
 *   2. Rejection of browser-supplied totals, amounts, and actor IDs.
 *   3. Eligibility preview calculates nominal cover, caps, and sequential balance
 *      coordination without altering database records.
 *   4. Pending submission invariant: invoice patient liability remains 10,000 LKR.
 *   5. Strict RBAC: Reception and Clinician users receive 403 Forbidden on resolve.
 *   6. Golden reconciliation (CATMS-008):
 *      - Ceylinco Claim 1: Claimed 6,550 LKR -> Partial approval 5,800 LKR -> Liability 4,200 LKR.
 *      - SLIC Claim 2: Claimed 1,500 LKR -> Rejection 0.00 LKR -> Liability remains 4,200 LKR.
 *   7. Re-resolving an already resolved claim is rejected (409 Conflict).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PoolClient } from 'pg';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'a'.repeat(64);

// ── Mock shared/env ──────────────────────────────────────────────────────────
vi.mock('../src/shared/env', () => ({
  env: {
    NODE_ENV:               'test',
    API_PORT:               3001,
    POSTGRES_HOST:          'localhost',
    POSTGRES_PORT:          5432,
    POSTGRES_DB:            'catms_test',
    POSTGRES_USER:          'catms_app',
    POSTGRES_PASSWORD:      'catms_test_password',
    JWT_SECRET:             'a'.repeat(64),
    CSRF_SECRET:            'b'.repeat(32),
    COOKIE_SECURE:          false,
    COOKIE_SAME_SITE:       'lax',
    COOKIE_MAX_AGE_SECONDS: 3600,
    ALLOWED_ORIGINS:        'http://localhost:5173',
    RATE_LIMIT_WINDOW_MS:   60_000,
    RATE_LIMIT_MAX:         200,
    LOG_LEVEL:              'silent',
  },
}));

// ── In-Memory Fixtures ───────────────────────────────────────────────────────

interface InvoiceRow {
  invoice_id: number;
  appointment_id: number;
  subtotal_amount: number;
  approved_insurance_amount: number;
  patient_liability_amount: number;
  patient_paid_amount: number;
  insurer_paid_amount: number;
  invoice_state: 'Draft' | 'Issued' | 'Cancelled';
  patient_payment_status: 'Unpaid' | 'PartiallyPaid' | 'Paid';
  created_at: string;
  updated_at: string;
}

interface InvoiceLineRow {
  invoice_line_id: number;
  invoice_id: number;
  appointment_treatment_id: number;
  line_number: number;
  treatment_id: number;
  service_code: string;
  treatment_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

interface AppointmentRow {
  appointment_id: number;
  patient_id: number;
  start_at: string;
  status: string;
}

interface PatientRow {
  patient_id: number;
  first_name: string;
  last_name: string;
}

interface ProviderRow {
  provider_id: number;
  provider_code: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface PolicyRow {
  policy_id: number;
  patient_id: number;
  provider_id: number;
  policy_number: string;
  policy_status: 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
  valid_from: string;
  valid_to: string | null;
}

interface CoverageRow {
  coverage_id: number;
  policy_id: number;
  treatment_id: number;
  coverage_percentage: number;
  coverage_cap: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface ClaimRow {
  claim_id: number;
  claim_number: string;
  invoice_id: number;
  policy_id: number;
  claim_status: 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected';
  claimed_amount: number;
  approved_amount: number;
  rejection_reason: string | null;
  submitted_by_user_id: number;
  submitted_at: string;
  resolved_by_user_id: number | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ClaimLineRow {
  claim_line_id: number;
  claim_id: number;
  invoice_line_id: number;
  policy_coverage_id: number | null;
  line_number: number;
  service_code_snapshot: string;
  description_snapshot: string;
  covered_percentage_snapshot: number;
  coverage_cap_snapshot: number | null;
  unit_price_snapshot: number;
  quantity_snapshot: number;
  line_total_snapshot: number;
  nominal_covered_amount: number;
  claimed_amount: number;
  approved_amount: number;
  created_at: string;
}

interface StatusLogRow {
  status_log_id: number;
  claim_id: number;
  from_status: 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected' | null;
  to_status: 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected';
  transitioned_by_user_id: number;
  transitioned_at: string;
  transition_reason: string | null;
}

interface UserRow {
  user_account_id: number;
  username: string;
  role: string;
}

let invoices: InvoiceRow[] = [];
let invoiceLines: InvoiceLineRow[] = [];
let appointments: AppointmentRow[] = [];
let patients: PatientRow[] = [];
let providers: ProviderRow[] = [];
let policies: PolicyRow[] = [];
let coverages: CoverageRow[] = [];
let claims: ClaimRow[] = [];
let claimLines: ClaimLineRow[] = [];
let statusLogs: StatusLogRow[] = [];
let users: UserRow[] = [];
let nextClaimSeq = 1001;

function seedGoldenFixture(): void {
  nextClaimSeq = 1001;

  users = [
    { user_account_id: 1, username: 'admin.user', role: 'Admin' },
    { user_account_id: 2, username: 'fin.manager', role: 'Manager' },
    { user_account_id: 3, username: 'rec.desk', role: 'Reception' },
    { user_account_id: 4, username: 'dr.silva', role: 'Clinician' },
    { user_account_id: 5, username: 'qa.auditor', role: 'QA' },
  ];

  patients = [
    { patient_id: 1001, first_name: 'Nimal', last_name: 'Perera' },
    { patient_id: 2002, first_name: 'Kamal', last_name: 'Gunaratne' },
  ];

  appointments = [
    {
      appointment_id: 501,
      patient_id: 1001,
      start_at: '2026-09-10T09:00:00.000Z',
      status: 'Completed',
    },
    {
      appointment_id: 502,
      patient_id: 1001,
      start_at: '2026-09-15T09:00:00.000Z',
      status: 'Booked', // Not issued
    },
  ];

  invoices = [
    {
      invoice_id: 701,
      appointment_id: 501,
      subtotal_amount: 10000.0,
      approved_insurance_amount: 0.0,
      patient_liability_amount: 10000.0,
      patient_paid_amount: 0.0,
      insurer_paid_amount: 0.0,
      invoice_state: 'Issued',
      patient_payment_status: 'Unpaid',
      created_at: '2026-09-10T10:00:00.000Z',
      updated_at: '2026-09-10T10:00:00.000Z',
    },
    {
      invoice_id: 702,
      appointment_id: 502,
      subtotal_amount: 5000.0,
      approved_insurance_amount: 0.0,
      patient_liability_amount: 5000.0,
      patient_paid_amount: 0.0,
      insurer_paid_amount: 0.0,
      invoice_state: 'Draft', // Draft - cannot claim
      patient_payment_status: 'Unpaid',
      created_at: '2026-09-15T10:00:00.000Z',
      updated_at: '2026-09-15T10:00:00.000Z',
    },
  ];

  invoiceLines = [
    {
      invoice_line_id: 801,
      invoice_id: 701,
      appointment_treatment_id: 901,
      line_number: 1,
      treatment_id: 1,
      service_code: 'TREAT-001',
      treatment_name: 'Specialist Cardiology Consultation',
      unit_price: 3500.0,
      quantity: 1,
      line_total: 3500.0,
    },
    {
      invoice_line_id: 802,
      invoice_id: 701,
      appointment_treatment_id: 902,
      line_number: 2,
      treatment_id: 2,
      service_code: 'TREAT-002',
      treatment_name: 'Diagnostic 12-Lead ECG + Report',
      unit_price: 6500.0,
      quantity: 1,
      line_total: 6500.0,
    },
  ];

  providers = [
    {
      provider_id: 1,
      provider_code: 'PROV-001',
      name: 'Ceylinco General Insurance',
      status: 'ACTIVE',
    },
    {
      provider_id: 2,
      provider_code: 'PROV-002',
      name: 'Sri Lanka Insurance Corporation',
      status: 'ACTIVE',
    },
    {
      provider_id: 3,
      provider_code: 'PROV-INACT',
      name: 'Inactive Provider Corp',
      status: 'INACTIVE',
    },
  ];

  policies = [
    {
      policy_id: 11,
      patient_id: 1001,
      provider_id: 1,
      policy_number: 'POL-CEY-001',
      policy_status: 'ACTIVE',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
    },
    {
      policy_id: 12,
      patient_id: 1001,
      provider_id: 2,
      policy_number: 'POL-SLIC-002',
      policy_status: 'ACTIVE',
      valid_from: '2026-06-01',
      valid_to: '2027-05-31',
    },
    {
      policy_id: 13,
      patient_id: 2002, // Other patient!
      provider_id: 1,
      policy_number: 'POL-OTHER-003',
      policy_status: 'ACTIVE',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
    },
    {
      policy_id: 14,
      patient_id: 1001,
      provider_id: 1,
      policy_number: 'POL-EXPIRED-004',
      policy_status: 'EXPIRED', // Inactive policy status!
      valid_from: '2025-01-01',
      valid_to: '2025-12-31',
    },
    {
      policy_id: 15,
      patient_id: 1001,
      provider_id: 3, // Inactive provider!
      policy_number: 'POL-INACT-PROV-005',
      policy_status: 'ACTIVE',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
    },
    {
      policy_id: 16,
      patient_id: 1001,
      provider_id: 1,
      policy_number: 'POL-OUT-WINDOW-006',
      policy_status: 'ACTIVE',
      valid_from: '2026-11-01', // Future validity - service date is 2026-09-10
      valid_to: '2027-10-31',
    },
  ];

  coverages = [
    // Policy 11 (Ceylinco): TREAT-001 80% cap 2000, TREAT-002 70% cap 5000
    {
      coverage_id: 101,
      policy_id: 11,
      treatment_id: 1,
      coverage_percentage: 80.0,
      coverage_cap: 2000.0,
      effective_from: '2026-01-01',
      effective_to: null,
    },
    {
      coverage_id: 102,
      policy_id: 11,
      treatment_id: 2,
      coverage_percentage: 70.0,
      coverage_cap: 5000.0,
      effective_from: '2026-01-01',
      effective_to: null,
    },
    // Policy 12 (SLIC): TREAT-001 50% cap 1500, TREAT-002 excluded
    {
      coverage_id: 103,
      policy_id: 12,
      treatment_id: 1,
      coverage_percentage: 50.0,
      coverage_cap: 1500.0,
      effective_from: '2026-06-01',
      effective_to: null,
    },
  ];

  claims = [];
  claimLines = [];
  statusLogs = [];
}

// ── Mock Pool & Transactions ─────────────────────────────────────────────────

function executeSubmitClaimProcedure(invoiceId: number, policyIds: number[], submittedBy: number): number[] {
  const inv = invoices.find((i) => i.invoice_id === invoiceId);
  if (!inv) throw new Error('ERR_INVOICE_NOT_FOUND');
  if (inv.invoice_state !== 'Issued') throw new Error('ERR_INVOICE_NOT_ISSUED');

  const app = appointments.find((a) => a.appointment_id === inv.appointment_id);
  if (!app) throw new Error('ERR_APPOINTMENT_NOT_FOUND');
  const serviceDate = app.start_at.slice(0, 10);

  const lines = invoiceLines.filter((l) => l.invoice_id === invoiceId).sort((a, b) => a.line_number - b.line_number);

  // Line balances tracking
  const lineBalances = new Map<number, number>();
  for (const l of lines) {
    const priorClaimed = claimLines
      .filter((cl) => {
        const parentClaim = claims.find((c) => c.claim_id === cl.claim_id);
        return cl.invoice_line_id === l.invoice_line_id && parentClaim && parentClaim.claim_status !== 'Rejected';
      })
      .reduce((sum, cl) => sum + cl.claimed_amount, 0);
    lineBalances.set(l.invoice_line_id, Math.max(0, l.line_total - priorClaimed));
  }

  const createdIds: number[] = [];

  for (const polId of policyIds) {
    const pol = policies.find((p) => p.policy_id === polId);
    if (!pol) throw new Error('ERR_POLICY_NOT_FOUND');
    if (pol.patient_id !== app.patient_id) throw new Error('ERR_CLAIM_POLICY_PATIENT_MISMATCH');
    if (pol.policy_status !== 'ACTIVE') throw new Error('ERR_POLICY_NOT_ACTIVE');

    const prov = providers.find((pr) => pr.provider_id === pol.provider_id);
    if (!prov || prov.status !== 'ACTIVE') throw new Error('ERR_PROVIDER_NOT_ACTIVE');

    if (serviceDate < pol.valid_from || (pol.valid_to && serviceDate > pol.valid_to)) {
      throw new Error('ERR_POLICY_WINDOW_INVALID');
    }

    const newClaimId = nextClaimSeq++;
    const claimNum = `CLM-${newClaimId}`;
    let policyClaimed = 0;

    const newClaim: ClaimRow = {
      claim_id: newClaimId,
      claim_number: claimNum,
      invoice_id: invoiceId,
      policy_id: polId,
      claim_status: 'Pending',
      claimed_amount: 0,
      approved_amount: 0,
      rejection_reason: null,
      submitted_by_user_id: submittedBy,
      submitted_at: new Date().toISOString(),
      resolved_by_user_id: null,
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    claims.push(newClaim);

    for (const l of lines) {
      const rem = lineBalances.get(l.invoice_line_id) ?? 0;
      const cov = coverages.find(
        (c) =>
          c.policy_id === polId &&
          c.treatment_id === l.treatment_id &&
          c.effective_from <= serviceDate &&
          (!c.effective_to || c.effective_to >= serviceDate),
      );

      let pct = 0;
      let cap: number | null = null;
      let nominal = 0;
      let maxCover = 0;
      let claimable = 0;

      if (cov) {
        pct = cov.coverage_percentage;
        cap = cov.coverage_cap;
        nominal = Math.round(((l.line_total * pct) / 100) * 100) / 100;
        maxCover = cap !== null ? Math.min(nominal, cap, l.line_total) : Math.min(nominal, l.line_total);
        claimable = Math.min(maxCover, rem);
      }

      lineBalances.set(l.invoice_line_id, Math.max(0, rem - claimable));
      policyClaimed = Math.round((policyClaimed + claimable) * 100) / 100;

      const newClaimLineId = claimLines.length + 1;
      claimLines.push({
        claim_line_id: newClaimLineId,
        claim_id: newClaimId,
        invoice_line_id: l.invoice_line_id,
        policy_coverage_id: cov?.coverage_id ?? null,
        line_number: l.line_number,
        service_code_snapshot: l.service_code,
        description_snapshot: l.treatment_name,
        covered_percentage_snapshot: pct,
        coverage_cap_snapshot: cap,
        unit_price_snapshot: l.unit_price,
        quantity_snapshot: l.quantity,
        line_total_snapshot: l.line_total,
        nominal_covered_amount: nominal,
        claimed_amount: claimable,
        approved_amount: 0.0,
        created_at: new Date().toISOString(),
      });
    }

    newClaim.claimed_amount = policyClaimed;

    statusLogs.push({
      status_log_id: statusLogs.length + 1,
      claim_id: newClaimId,
      from_status: null,
      to_status: 'Pending',
      transitioned_by_user_id: submittedBy,
      transitioned_at: new Date().toISOString(),
      transition_reason: 'Initial claim submission',
    });

    createdIds.push(newClaimId);
  }

  return createdIds;
}

function executeResolveClaimProcedure(
  claimId: number,
  resolution: 'Approved' | 'PartiallyApproved' | 'Rejected',
  approvedAmount: number,
  resolvedBy: number,
  rejectionReason: string | null,
  lineApprovalsJson: string | null,
): string {
  const claim = claims.find((c) => c.claim_id === claimId);
  if (!claim) throw new Error('ERR_CLAIM_NOT_FOUND');
  if (claim.claim_status !== 'Pending') throw new Error('ERR_CLAIM_NOT_PENDING');

  const inv = invoices.find((i) => i.invoice_id === claim.invoice_id);
  if (!inv) throw new Error('ERR_INVOICE_NOT_FOUND');

  // Update claim lines
  if (lineApprovalsJson) {
    const parsed = JSON.parse(lineApprovalsJson) as Array<{ invoice_line_id: number; approved_amount: number }>;
    let sumApproved = 0;
    for (const item of parsed) {
      const line = claimLines.find((cl) => cl.claim_id === claimId && cl.invoice_line_id === item.invoice_line_id);
      if (line) {
        line.approved_amount = item.approved_amount;
        sumApproved += item.approved_amount;
      }
    }
  } else {
    if (resolution === 'Approved') {
      claimLines
        .filter((cl) => cl.claim_id === claimId)
        .forEach((cl) => {
          cl.approved_amount = cl.claimed_amount;
        });
    } else if (resolution === 'Rejected') {
      claimLines
        .filter((cl) => cl.claim_id === claimId)
        .forEach((cl) => {
          cl.approved_amount = 0.0;
        });
    } else if (resolution === 'PartiallyApproved') {
      const lines = claimLines.filter((cl) => cl.claim_id === claimId);
      if (lines.length === 1) {
        lines[0]!.approved_amount = approvedAmount;
      } else {
        lines.forEach((cl) => {
          cl.approved_amount = Math.round(((cl.claimed_amount / claim.claimed_amount) * approvedAmount) * 100) / 100;
        });
      }
    }
  }

  // Update claim header
  claim.claim_status = resolution;
  claim.approved_amount = approvedAmount;
  claim.rejection_reason = rejectionReason;
  claim.resolved_by_user_id = resolvedBy;
  claim.resolved_at = new Date().toISOString();
  claim.updated_at = new Date().toISOString();

  // Status log
  statusLogs.push({
    status_log_id: statusLogs.length + 1,
    claim_id: claimId,
    from_status: 'Pending',
    to_status: resolution,
    transitioned_by_user_id: resolvedBy,
    transitioned_at: new Date().toISOString(),
    transition_reason: rejectionReason ?? `Claim resolved to ${resolution}`,
  });

  // Atomic invoice recalculation
  const allApproved = claims
    .filter((c) => c.invoice_id === claim.invoice_id && (c.claim_status === 'Approved' || c.claim_status === 'PartiallyApproved'))
    .reduce((sum, c) => sum + c.approved_amount, 0);

  inv.approved_insurance_amount = allApproved;
  inv.patient_liability_amount = Math.max(0, inv.subtotal_amount - allApproved);
  if (inv.patient_paid_amount >= inv.patient_liability_amount) {
    inv.patient_payment_status = 'Paid';
  } else if (inv.patient_paid_amount > 0) {
    inv.patient_payment_status = 'PartiallyPaid';
  } else {
    inv.patient_payment_status = 'Unpaid';
  }
  inv.updated_at = new Date().toISOString();

  return resolution;
}

function handleMockQuery(text: string, params: unknown[] = []): { rows: unknown[] } {
  // 1. SELECT invoice header for preview
  if (text.includes('FROM catms.invoice i') && text.includes('WHERE i.invoice_id = $1')) {
    const invId = Number(params[0]);
    const inv = invoices.find((i) => i.invoice_id === invId);
    if (!inv) return { rows: [] };
    const app = appointments.find((a) => a.appointment_id === inv.appointment_id);
    const pat = patients.find((p) => p.patient_id === app?.patient_id);
    return {
      rows: [
        {
          invoice_id: inv.invoice_id,
          appointment_id: inv.appointment_id,
          subtotal_amount: inv.subtotal_amount,
          invoice_state: inv.invoice_state,
          patient_id: app?.patient_id,
          service_date: app ? app.start_at.slice(0, 10) : '',
          patient_full_name: pat ? `${pat.first_name} ${pat.last_name}` : '',
        },
      ],
    };
  }

  // 2. SELECT policy header for preview
  if (text.includes('FROM catms.insurance_policy p') && text.includes('WHERE p.policy_id = $1')) {
    const polId = Number(params[0]);
    const pol = policies.find((p) => p.policy_id === polId);
    if (!pol) return { rows: [] };
    const prov = providers.find((pr) => pr.provider_id === pol.provider_id);
    return {
      rows: [
        {
          policy_id: pol.policy_id,
          policy_number: pol.policy_number,
          patient_id: pol.patient_id,
          provider_id: pol.provider_id,
          policy_status: pol.policy_status,
          valid_from: pol.valid_from,
          valid_to: pol.valid_to,
          provider_name: prov?.name ?? '',
          provider_status: prov?.status ?? 'INACTIVE',
        },
      ],
    };
  }

  // 3. SELECT invoice lines for preview
  if (text.includes('FROM catms.invoice_line il') && text.includes('WHERE il.invoice_id = $1')) {
    const invId = Number(params[0]);
    const lines = invoiceLines
      .filter((l) => l.invoice_id === invId)
      .map((l) => {
        const prior = claimLines
          .filter((cl) => {
            const c = claims.find((cm) => cm.claim_id === cl.claim_id);
            return cl.invoice_line_id === l.invoice_line_id && c && c.claim_status !== 'Rejected';
          })
          .reduce((sum, cl) => sum + cl.claimed_amount, 0);

        return {
          invoice_line_id: l.invoice_line_id,
          line_number: l.line_number,
          line_total: l.line_total,
          unit_price: l.unit_price,
          quantity: l.quantity,
          treatment_id: l.treatment_id,
          service_code: l.service_code,
          treatment_name: l.treatment_name,
          prior_claimed: prior,
        };
      });
    return { rows: lines };
  }

  // 4. SELECT policy coverage for preview
  if (text.includes('FROM catms.policy_coverage') && text.includes('ORDER BY effective_from DESC')) {
    const [polId, treatId, sDate] = params as [number, number, string];
    const cov = coverages
      .filter(
        (c) =>
          c.policy_id === Number(polId) &&
          c.treatment_id === Number(treatId) &&
          c.effective_from <= sDate &&
          (!c.effective_to || c.effective_to >= sDate),
      )
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];

    if (!cov) return { rows: [] };
    return {
      rows: [
        {
          coverage_id: cov.coverage_id,
          coverage_percentage: cov.coverage_percentage,
          coverage_cap: cov.coverage_cap,
        },
      ],
    };
  }

  // 5. CALL catms.submit_claim
  if (text.includes('catms.submit_claim')) {
    const [invId, polIds, subBy] = params as [number, number[], number];
    const created = executeSubmitClaimProcedure(Number(invId), polIds.map(Number), Number(subBy));
    return { rows: [{ claim_ids: created }] };
  }

  // 6. Lock and fetch claim FOR UPDATE in resolve
  if (text.includes('FROM catms.insurance_claim') && text.includes('FOR UPDATE')) {
    const clmId = Number(params[0]);
    const clm = claims.find((c) => c.claim_id === clmId);
    if (!clm) return { rows: [] };
    return {
      rows: [
        {
          claim_id: clm.claim_id,
          claim_number: clm.claim_number,
          invoice_id: clm.invoice_id,
          claim_status: clm.claim_status,
          claimed_amount: clm.claimed_amount,
        },
      ],
    };
  }

  // 7. CALL catms.resolve_claim
  if (text.includes('catms.resolve_claim')) {
    const [clmId, resolution, appAmount, resBy, rejReason, lineAppJson] = params as [
      number,
      'Approved' | 'PartiallyApproved' | 'Rejected',
      number,
      number,
      string | null,
      string | null,
    ];
    const res = executeResolveClaimProcedure(
      Number(clmId),
      resolution,
      Number(appAmount),
      Number(resBy),
      rejReason,
      lineAppJson,
    );
    return { rows: [{ new_status: res }] };
  }

  // 8. SELECT invoice liability after resolution
  if (text.includes('SELECT invoice_id, subtotal_amount') && text.includes('FROM catms.invoice')) {
    const invId = Number(params[0]);
    const inv = invoices.find((i) => i.invoice_id === invId);
    if (!inv) return { rows: [] };
    return {
      rows: [
        {
          invoice_id: inv.invoice_id,
          subtotal_amount: inv.subtotal_amount,
          approved_insurance_amount: inv.approved_insurance_amount,
          patient_liability_amount: inv.patient_liability_amount,
          patient_payment_status: inv.patient_payment_status,
        },
      ],
    };
  }

  // 9. SELECT single claim detail with header joins
  if (text.includes('FROM catms.insurance_claim c') && text.includes('WHERE c.claim_id = $1')) {
    const clmId = Number(params[0]);
    const c = claims.find((cl) => cl.claim_id === clmId);
    if (!c) return { rows: [] };
    const pol = policies.find((p) => p.policy_id === c.policy_id);
    const prov = providers.find((pr) => pr.provider_id === pol?.provider_id);
    const inv = invoices.find((i) => i.invoice_id === c.invoice_id);
    const app = appointments.find((a) => a.appointment_id === inv?.appointment_id);
    const pat = patients.find((p) => p.patient_id === app?.patient_id);
    const uSub = users.find((u) => u.user_account_id === c.submitted_by_user_id);
    const uRes = users.find((u) => u.user_account_id === c.resolved_by_user_id);

    return {
      rows: [
        {
          claim_id: c.claim_id,
          claim_number: c.claim_number,
          invoice_id: c.invoice_id,
          policy_id: c.policy_id,
          claim_status: c.claim_status,
          claimed_amount: c.claimed_amount,
          approved_amount: c.approved_amount,
          rejection_reason: c.rejection_reason,
          submitted_by_user_id: c.submitted_by_user_id,
          submitted_at: c.submitted_at,
          resolved_by_user_id: c.resolved_by_user_id,
          resolved_at: c.resolved_at,
          created_at: c.created_at,
          updated_at: c.updated_at,
          policy_number: pol?.policy_number,
          provider_id: prov?.provider_id,
          provider_name: prov?.name,
          patient_id: pat?.patient_id,
          patient_full_name: pat ? `${pat.first_name} ${pat.last_name}` : '',
          submitted_by_username: uSub?.username ?? null,
          resolved_by_username: uRes?.username ?? null,
          subtotal_amount: inv?.subtotal_amount,
          patient_liability_amount: inv?.patient_liability_amount,
          approved_insurance_amount: inv?.approved_insurance_amount,
          patient_payment_status: inv?.patient_payment_status,
        },
      ],
    };
  }

  // 10. SELECT claim lines
  if (text.includes('FROM catms.insurance_claim_line') && text.includes('WHERE claim_id = $1')) {
    const clmId = Number(params[0]);
    return { rows: claimLines.filter((cl) => cl.claim_id === clmId) };
  }

  // 11. SELECT claim status logs
  if (text.includes('FROM catms.insurance_claim_status_log') && text.includes('WHERE l.claim_id = $1')) {
    const clmId = Number(params[0]);
    const logs = statusLogs
      .filter((l) => l.claim_id === clmId)
      .map((l) => {
        const u = users.find((usr) => usr.user_account_id === l.transitioned_by_user_id);
        return {
          ...l,
          transitioned_by_username: u?.username ?? null,
        };
      });
    return { rows: logs };
  }

  // 12. SELECT claims count
  if (text.includes('count(*)::text') && text.includes('catms.insurance_claim c')) {
    let filtered = [...claims];
    if (text.includes('c.invoice_id = $')) {
      const invId = Number(params[0]);
      filtered = filtered.filter((c) => c.invoice_id === invId);
    }
    return { rows: [{ count: String(filtered.length) }] };
  }

  // 13. SELECT claims list
  if (text.includes('FROM catms.insurance_claim c') && text.includes('LIMIT')) {
    let filtered = [...claims];
    if (text.includes('c.invoice_id = $')) {
      const invId = Number(params[0]);
      filtered = filtered.filter((c) => c.invoice_id === invId);
    }
    const rows = filtered.map((c) => {
      const pol = policies.find((p) => p.policy_id === c.policy_id);
      const prov = providers.find((pr) => pr.provider_id === pol?.provider_id);
      const inv = invoices.find((i) => i.invoice_id === c.invoice_id);
      const app = appointments.find((a) => a.appointment_id === inv?.appointment_id);
      const pat = patients.find((p) => p.patient_id === app?.patient_id);
      const uSub = users.find((u) => u.user_account_id === c.submitted_by_user_id);
      const uRes = users.find((u) => u.user_account_id === c.resolved_by_user_id);
      return {
        ...c,
        policy_number: pol?.policy_number,
        provider_id: prov?.provider_id,
        provider_name: prov?.name,
        patient_id: pat?.patient_id,
        patient_full_name: pat ? `${pat.first_name} ${pat.last_name}` : '',
        submitted_by_username: uSub?.username ?? null,
        resolved_by_username: uRes?.username ?? null,
      };
    });
    return { rows };
  }

  return { rows: [] };
}

vi.mock('../src/db/pool', () => ({
  pool: {
    query: vi.fn(async (text: string, params: unknown[] = []) => handleMockQuery(text, params)),
    connect: vi.fn(),
  },
  checkDatabaseConnectivity: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  checkDatabaseMigrations: vi.fn().mockResolvedValue({ ok: true, maxMigration: 112 }),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db/transaction', () => ({
  withTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = {
      query: vi.fn(async (text: string, params: unknown[] = []) => handleMockQuery(text, params)),
    };
    return fn(mockClient as unknown as PoolClient);
  }),
}));

// ── Test Tokens ──────────────────────────────────────────────────────────────

let app: Express;

function makeToken(user: {
  userId: number;
  employeeId: number;
  username: string;
  role: string;
  branchId: number | 'all';
  fullName: string;
}): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}

const adminToken = makeToken({
  userId: 1,
  employeeId: 101,
  username: 'admin.user',
  role: 'Admin',
  branchId: 'all',
  fullName: 'System Administrator',
});

const managerToken = makeToken({
  userId: 2,
  employeeId: 102,
  username: 'fin.manager',
  role: 'Manager',
  branchId: 1,
  fullName: 'Finance Manager Kandy',
});

const receptionToken = makeToken({
  userId: 3,
  employeeId: 103,
  username: 'rec.desk',
  role: 'Reception',
  branchId: 1,
  fullName: 'Reception Front Desk',
});

const clinicianToken = makeToken({
  userId: 4,
  employeeId: 104,
  username: 'dr.silva',
  role: 'Clinician',
  branchId: 1,
  fullName: 'Dr. Sunil Silva',
});

const qaToken = makeToken({
  userId: 5,
  employeeId: 105,
  username: 'qa.auditor',
  role: 'QA',
  branchId: 'all',
  fullName: 'QA Compliance Officer',
});

beforeAll(async () => {
  const { createApp } = await import('../src/app/server');
  app = createApp() as Express;
});

beforeEach(() => {
  seedGoldenFixture();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test Suites
// ─────────────────────────────────────────────────────────────────────────────

describe('CATMS-049 — Claims API & Reconciliation Integration Test Suite', () => {
  // ── 1. Rejection of Browser-Supplied Totals and Actors ──────────────────────
  describe('Suite 1: Contract Enforcement & Rejection of Browser-Supplied Totals/Actors', () => {
    it('rejects submission request containing browser-supplied claimedAmount', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [11],
          claimedAmount: 6550.0, // FORBIDDEN: client trying to supply total
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fieldErrors[0].message).toContain('prohibited');
    });

    it('rejects submission request containing browser-supplied actor ID (submittedByUserId)', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [11],
          submittedByUserId: 999, // FORBIDDEN: actor must come strictly from session
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fieldErrors[0].message).toContain('prohibited');
    });

    it('rejects resolve request containing browser-supplied actor ID (resolvedByUserId)', async () => {
      const res = await request(app)
        .patch('/api/v1/claims/1001/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Approved',
          resolvedByUserId: 999, // FORBIDDEN
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects Rejected resolution when rejectionReason is missing or empty', async () => {
      const res = await request(app)
        .patch('/api/v1/claims/1001/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Rejected',
          // missing rejectionReason
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fieldErrors.some((fe: { field: string }) => fe.field === 'rejectionReason')).toBe(true);
    });

    it('rejects Rejected resolution when approvedAmount is non-zero', async () => {
      const res = await request(app)
        .patch('/api/v1/claims/1001/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Rejected',
          rejectionReason: 'Underwriting exclusion',
          approvedAmount: 500.0, // FORBIDDEN: must be 0 for rejection
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects PartiallyApproved resolution when approvedAmount is <= 0', async () => {
      const res = await request(app)
        .patch('/api/v1/claims/1001/resolve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'PartiallyApproved',
          approvedAmount: 0, // Must be > 0
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── 2. Eligibility Preview & Coordination of Benefits ──────────────────────
  describe('Suite 2: Eligibility Preview & Sequential Coordination of Benefits', () => {
    it('simulates multi-policy coordination of benefits matching CATMS-008 golden values', async () => {
      const res = await request(app)
        .post('/api/v1/claims/preview')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [11, 12], // Priority 1: Ceylinco, Priority 2: SLIC
        });

      expect(res.status).toBe(200);
      const preview = res.body.data;

      expect(preview.invoiceId).toBe(701);
      expect(preview.invoiceSubtotal).toBe(10000.0);
      expect(preview.policies).toHaveLength(2);

      // Policy 1 (Ceylinco):
      const p1 = preview.policies[0];
      expect(p1.policyId).toBe(11);
      expect(p1.policyNumber).toBe('POL-CEY-001');
      expect(p1.priority).toBe(1);
      expect(p1.lines).toHaveLength(2);

      // Line 1: TREAT-001 (3,500 LKR, 80% = 2,800 capped at 2,000 -> 2,000 LKR)
      expect(p1.lines[0].serviceCode).toBe('TREAT-001');
      expect(p1.lines[0].coveredPercentage).toBe(80.0);
      expect(p1.lines[0].coverageCap).toBe(2000.0);
      expect(p1.lines[0].nominalCoveredAmount).toBe(2800.0);
      expect(p1.lines[0].maxEligibleCover).toBe(2000.0);
      expect(p1.lines[0].claimableAmount).toBe(2000.0);
      expect(p1.lines[0].remainingLineBalance).toBe(1500.0); // 3500 - 2000 = 1500

      // Line 2: TREAT-002 (6,500 LKR, 70% = 4,550 capped at 5,000 -> 4,550 LKR)
      expect(p1.lines[1].serviceCode).toBe('TREAT-002');
      expect(p1.lines[1].coveredPercentage).toBe(70.0);
      expect(p1.lines[1].nominalCoveredAmount).toBe(4550.0);
      expect(p1.lines[1].maxEligibleCover).toBe(4550.0);
      expect(p1.lines[1].claimableAmount).toBe(4550.0);
      expect(p1.lines[1].remainingLineBalance).toBe(1950.0); // 6500 - 4550 = 1950

      expect(p1.totalClaimedAmount).toBe(6550.0); // 2000 + 4550 = 6550

      // Policy 2 (SLIC):
      const p2 = preview.policies[1];
      expect(p2.policyId).toBe(12);
      expect(p2.policyNumber).toBe('POL-SLIC-002');
      expect(p2.priority).toBe(2);

      // Line 1: TREAT-001 (Remaining balance 1500, 50% = 1750 capped at 1500 -> 1500 LKR)
      expect(p2.lines[0].coveredPercentage).toBe(50.0);
      expect(p2.lines[0].coverageCap).toBe(1500.0);
      expect(p2.lines[0].claimableAmount).toBe(1500.0);
      expect(p2.lines[0].remainingLineBalance).toBe(0.0); // 1500 - 1500 = 0

      // Line 2: TREAT-002 (Excluded -> 0 LKR)
      expect(p2.lines[1].coveredPercentage).toBe(0.0);
      expect(p2.lines[1].claimableAmount).toBe(0.0);
      expect(p2.lines[1].remainingLineBalance).toBe(1950.0);

      expect(p2.totalClaimedAmount).toBe(1500.0);

      // Grand totals: 6550 + 1500 = 8050 LKR
      expect(preview.totalEstimatedInsurance).toBe(8050.0);
      expect(preview.estimatedPatientLiability).toBe(1950.0); // 10000 - 8050 = 1950
    });

    it('supports GET /preview with query parameters', async () => {
      const res = await request(app)
        .get('/api/v1/claims/preview?invoiceId=701&policyIds=11,12')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.invoiceId).toBe(701);
      expect(res.body.data.policies).toHaveLength(2);
    });

    it('rejects preview for non-existent invoice (404 NOT_FOUND)', async () => {
      const res = await request(app)
        .post('/api/v1/claims/preview')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 999999,
          policyIds: [11],
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('rejects preview for non-issued invoice (409 CONFLICT)', async () => {
      const res = await request(app)
        .post('/api/v1/claims/preview')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 702, // State is 'Draft'
          policyIds: [11],
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('rejects preview when policy belongs to another patient (ownership guard)', async () => {
      const res = await request(app)
        .post('/api/v1/claims/preview')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [13], // Belongs to patient 2002
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('belongs to patient');
    });

    it('rejects preview when policy is not ACTIVE', async () => {
      const res = await request(app)
        .post('/api/v1/claims/preview')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [14], // EXPIRED
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('Only ACTIVE policies can be claimed');
    });

    it('rejects preview when insurance provider is deactivated', async () => {
      const res = await request(app)
        .post('/api/v1/claims/preview')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [15], // Provider is INACTIVE
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('deactivated');
    });

    it('rejects preview when service date is outside validity window', async () => {
      const res = await request(app)
        .post('/api/v1/claims/preview')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [16], // Valid from 2026-11-01, service date is 2026-09-10
        });

      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('validity window');
    });
  });

  // ── 3. Claim Submission & Pending Invariant ─────────────────────────────────
  describe('Suite 3: Claim Submission & Invariant Integrity', () => {
    it('submits claims for multi-policy invoice and snapshots coverage terms', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          invoiceId: 701,
          policyIds: [11, 12],
        });

      expect(res.status).toBe(201);
      const createdClaims = res.body.data;
      expect(createdClaims).toHaveLength(2);

      // Claim 1 (Ceylinco)
      const c1 = createdClaims[0];
      expect(c1.claimNumber).toBe('CLM-1001');
      expect(c1.claimStatus).toBe('Pending');
      expect(c1.claimedAmount).toBe(6550.0);
      expect(c1.approvedAmount).toBe(0.0);
      expect(c1.submittedByUserId).toBe(3); // reception.colombo
      expect(c1.lines).toHaveLength(2);
      expect(c1.lines[0].claimedAmount).toBe(2000.0);
      expect(c1.lines[1].claimedAmount).toBe(4550.0);
      expect(c1.statusLogs).toHaveLength(1);
      expect(c1.statusLogs[0].toStatus).toBe('Pending');

      // Claim 2 (SLIC)
      const c2 = createdClaims[1];
      expect(c2.claimNumber).toBe('CLM-1002');
      expect(c2.claimStatus).toBe('Pending');
      expect(c2.claimedAmount).toBe(1500.0);
      expect(c2.approvedAmount).toBe(0.0);
      expect(c2.lines[0].claimedAmount).toBe(1500.0);
      expect(c2.lines[1].claimedAmount).toBe(0.0);

      // CRITICAL INVARIANT: Invoice patient liability remains 10,000 LKR upon submission!
      const inv = invoices.find((i) => i.invoice_id === 701);
      expect(inv?.patient_liability_amount).toBe(10000.0);
      expect(inv?.approved_insurance_amount).toBe(0.0);
    });

    it('also supports submission on POST /api/v1/claims/submit', async () => {
      const res = await request(app)
        .post('/api/v1/claims/submit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          invoiceId: 701,
          policyIds: [11],
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].claimStatus).toBe('Pending');
    });

    it('rejects claim submission by Clinician role with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          invoiceId: 701,
          policyIds: [11],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects claim submission without authentication with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/claims')
        .send({
          invoiceId: 701,
          policyIds: [11],
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  // ── 4. Controlled Claim Resolution & Finance RBAC ───────────────────────────
  describe('Suite 4: Controlled Claim Resolution & RBAC Gate', () => {
    let claim1Id: number;
    let claim2Id: number;

    beforeEach(async () => {
      // Create initial claims
      const created = executeSubmitClaimProcedure(701, [11, 12], 3);
      claim1Id = created[0]!;
      claim2Id = created[1]!;
    });

    it('strictly forbids Reception role from resolving a claim (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          resolution: 'Approved',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('strictly forbids Clinician role from resolving a claim (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          resolution: 'Approved',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('strictly forbids QA compliance role from resolving a claim (403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${qaToken}`)
        .send({
          resolution: 'Approved',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('reconciles CATMS-008 Golden Partial Approval & Rejection flow', async () => {
      // Step A: Admin partially approves Claim 1 (5,800 LKR approved out of 6,550 LKR claimed)
      const res1 = await request(app)
        .patch(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'PartiallyApproved',
          approvedAmount: 5800.0,
          rejectionReason: 'Ceylinco deducted 750 LKR consumable portion on ECG',
          lineApprovals: [
            { invoiceLineId: 801, approvedAmount: 2000.0 },
            { invoiceLineId: 802, approvedAmount: 3800.0 },
          ],
        });

      expect(res1.status).toBe(200);
      const data1 = res1.body.data;
      expect(data1.claim.claimStatus).toBe('PartiallyApproved');
      expect(data1.claim.approvedAmount).toBe(5800.0);
      expect(data1.claim.resolvedByUserId).toBe(1); // admin.user

      // Verify atomic invoice liability update (CATMS-008 §3.3)
      expect(data1.invoiceLiability.approvedInsuranceAmount).toBe(5800.0);
      expect(data1.invoiceLiability.patientLiabilityAmount).toBe(4200.0); // 10000 - 5800 = 4200

      // Step B: Manager rejects Claim 2 (approvedAmount = 0.00 LKR)
      const res2 = await request(app)
        .patch(`/api/v1/claims/${claim2Id}/resolve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          resolution: 'Rejected',
          approvedAmount: 0.0,
          rejectionReason: 'Secondary top-up policy underwriting exclusion on consultation co-payment',
        });

      expect(res2.status).toBe(200);
      const data2 = res2.body.data;
      expect(data2.claim.claimStatus).toBe('Rejected');
      expect(data2.claim.approvedAmount).toBe(0.0);
      expect(data2.claim.rejectionReason).toContain('underwriting exclusion');

      // Verify invoice liability remains 4,200.00 LKR after rejection (CATMS-008 §3.4)
      expect(data2.invoiceLiability.approvedInsuranceAmount).toBe(5800.0);
      expect(data2.invoiceLiability.patientLiabilityAmount).toBe(4200.0);

      // Verify in-memory database record
      const inv = invoices.find((i) => i.invoice_id === 701);
      expect(inv?.approved_insurance_amount).toBe(5800.0);
      expect(inv?.patient_liability_amount).toBe(4200.0);
    });

    it('supports full approval and sets approvedAmount to claimedAmount automatically', async () => {
      const res = await request(app)
        .patch(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          resolution: 'Approved',
        });

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.claim.claimStatus).toBe('Approved');
      expect(data.claim.approvedAmount).toBe(6550.0); // Exactly claimedAmount
      expect(data.invoiceLiability.approvedInsuranceAmount).toBe(6550.0);
      expect(data.invoiceLiability.patientLiabilityAmount).toBe(3450.0); // 10000 - 6550 = 3450
    });

    it('rejects attempt to re-resolve an already resolved claim with 409 Conflict', async () => {
      // First resolve
      await request(app)
        .patch(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolution: 'Approved' });

      // Second attempt to resolve again
      const res = await request(app)
        .patch(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ resolution: 'Rejected', rejectionReason: 'Try to change mind' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('already resolved');
    });

    it('also supports resolution on POST /api/v1/claims/:id/resolve', async () => {
      const res = await request(app)
        .post(`/api/v1/claims/${claim1Id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          resolution: 'Approved',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.claim.claimStatus).toBe('Approved');
    });
  });

  // ── 5. Claim Listing and Detail ─────────────────────────────────────────────
  describe('Suite 5: Claim Listing and Detail Endpoints', () => {
    let claimId: number;

    beforeEach(() => {
      const created = executeSubmitClaimProcedure(701, [11], 3);
      claimId = created[0]!;
    });

    it('fetches claim list with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/claims?invoiceId=701&page=1&limit=10')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.claims).toHaveLength(1);
      expect(res.body.data.total).toBe(1);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(10);
      expect(res.body.data.claims[0].claimNumber).toBe('CLM-1001');
    });

    it('fetches single claim detail with snapshot lines and status log', async () => {
      const res = await request(app)
        .get(`/api/v1/claims/${claimId}`)
        .set('Authorization', `Bearer ${clinicianToken}`);

      expect(res.status).toBe(200);
      const detail = res.body.data;
      expect(detail.claimId).toBe(claimId);
      expect(detail.claimNumber).toBe('CLM-1001');
      expect(detail.lines).toHaveLength(2);
      expect(detail.lines[0].serviceCode).toBe('TREAT-001');
      expect(detail.lines[0].claimedAmount).toBe(2000.0);
      expect(detail.statusLogs).toHaveLength(1);
      expect(detail.statusLogs[0].toStatus).toBe('Pending');
    });

    it('returns 404 NOT_FOUND for non-existent claim ID', async () => {
      const res = await request(app)
        .get('/api/v1/claims/999999')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 422 for non-numeric claim ID', async () => {
      const res = await request(app)
        .get('/api/v1/claims/abc')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
