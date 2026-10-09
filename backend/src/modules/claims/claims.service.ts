/**
 * src/modules/claims/claims.service.ts
 * Owner: Dev3 | Issue: CATMS-049
 *
 * Core service operations for Insurance Claims:
 *   - Preview claim eligibility & coordination of benefits
 *   - Submit multi-policy claims via catms.submit_claim procedure
 *   - List and get claim details with snapshot lines and status logs
 *   - Controlled claim resolution via catms.resolve_claim procedure
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003, CATMS-006, CATMS-008):
 *   - All mutations execute inside withTransaction().
 *   - Calculations and terms snapshots are computed server-side.
 *   - Client-supplied totals and actor IDs are rejected.
 *   - Resolution is role-gated to finance/admin accounts.
 *   - Approving/rejecting claims updates invoice liability atomically.
 */

import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { withTransaction, type DbRole } from '../../db/transaction';
import { AppError } from '../../shared/errors';
import type { JwtPayload } from '../../app/middleware/auth';
import type {
  ClaimDto,
  ClaimDetailDto,
  ClaimLineDto,
  ClaimStatusLogDto,
  SubmitClaimInput,
  ResolveClaimInput,
  ClaimResolutionResultDto,
  ClaimFilters,
  ClaimPreviewResultDto,
  ClaimPolicyPreviewDto,
  ClaimLinePreviewDto,
} from '../../contracts/claims.contract';

function resolveDbRole(user?: JwtPayload): DbRole {
  if (!user) return 'catms_app';
  const role = (user.role || '').toLowerCase();
  if (role === 'admin') return 'catms_admin';
  if (role === 'reception' || role === 'receptionist') return 'catms_reception';
  if (role === 'clinician' || role === 'doctor') return 'catms_clinician';
  if (role === 'manager' || role === 'branchmanager') return 'catms_manager';
  if (role === 'qa') return 'catms_qa';
  return 'catms_app';
}

function roundToCent(val: number): number {
  return Math.round(val * 100) / 100;
}

interface RawClaimRow {
  claim_id: string | number;
  claim_number: string;
  invoice_id: string | number;
  policy_id: string | number;
  policy_number?: string;
  provider_id?: string | number;
  provider_name?: string;
  patient_id?: string | number;
  patient_full_name?: string;
  claim_status: 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected';
  claimed_amount: string | number;
  approved_amount: string | number;
  rejection_reason: string | null;
  submitted_by_user_id: string | number;
  submitted_by_username?: string | null;
  submitted_at: Date | string;
  resolved_by_user_id: string | number | null;
  resolved_by_username?: string | null;
  resolved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  subtotal_amount?: string | number;
  patient_liability_amount?: string | number;
  approved_insurance_amount?: string | number;
  patient_payment_status?: string;
}

interface RawClaimLineRow {
  claim_line_id: string | number;
  claim_id: string | number;
  invoice_line_id: string | number;
  policy_coverage_id: string | number | null;
  line_number: number;
  service_code_snapshot: string;
  description_snapshot: string;
  covered_percentage_snapshot: string | number;
  coverage_cap_snapshot: string | number | null;
  unit_price_snapshot: string | number;
  quantity_snapshot: string | number;
  line_total_snapshot: string | number;
  nominal_covered_amount: string | number;
  claimed_amount: string | number;
  approved_amount: string | number;
  created_at: Date | string;
}

interface RawStatusLogRow {
  status_log_id: string | number;
  claim_id: string | number;
  from_status: 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected' | null;
  to_status: 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected';
  transitioned_by_user_id: string | number;
  transitioned_by_username?: string | null;
  transitioned_at: Date | string;
  transition_reason: string | null;
}

function mapClaimRow(r: RawClaimRow): ClaimDto {
  return {
    claimId: Number(r.claim_id),
    claimNumber: r.claim_number,
    invoiceId: Number(r.invoice_id),
    policyId: Number(r.policy_id),
    policyNumber: r.policy_number,
    providerId: r.provider_id ? Number(r.provider_id) : undefined,
    providerName: r.provider_name,
    patientId: r.patient_id ? Number(r.patient_id) : undefined,
    patientFullName: r.patient_full_name,
    claimStatus: r.claim_status,
    claimedAmount: Number(r.claimed_amount),
    approvedAmount: Number(r.approved_amount),
    rejectionReason: r.rejection_reason ?? null,
    submittedByUserId: Number(r.submitted_by_user_id),
    submittedByUsername: r.submitted_by_username ?? undefined,
    submittedAt: r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at),
    resolvedByUserId: r.resolved_by_user_id ? Number(r.resolved_by_user_id) : null,
    resolvedByUsername: r.resolved_by_username ?? undefined,
    resolvedAt: r.resolved_at ? (r.resolved_at instanceof Date ? r.resolved_at.toISOString() : String(r.resolved_at)) : null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

function mapClaimLineRow(r: RawClaimLineRow): ClaimLineDto {
  return {
    claimLineId: Number(r.claim_line_id),
    claimId: Number(r.claim_id),
    invoiceLineId: Number(r.invoice_line_id),
    policyCoverageId: r.policy_coverage_id ? Number(r.policy_coverage_id) : null,
    lineNumber: Number(r.line_number),
    serviceCode: r.service_code_snapshot,
    description: r.description_snapshot,
    coveredPercentage: Number(r.covered_percentage_snapshot),
    coverageCap: r.coverage_cap_snapshot !== null && r.coverage_cap_snapshot !== undefined ? Number(r.coverage_cap_snapshot) : null,
    unitPrice: Number(r.unit_price_snapshot),
    quantity: Number(r.quantity_snapshot),
    lineTotal: Number(r.line_total_snapshot),
    nominalCoveredAmount: Number(r.nominal_covered_amount),
    claimedAmount: Number(r.claimed_amount),
    approvedAmount: Number(r.approved_amount),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

function mapStatusLogRow(r: RawStatusLogRow): ClaimStatusLogDto {
  return {
    statusLogId: Number(r.status_log_id),
    claimId: Number(r.claim_id),
    fromStatus: r.from_status,
    toStatus: r.to_status,
    transitionedByUserId: Number(r.transitioned_by_user_id),
    transitionedByUsername: r.transitioned_by_username ?? undefined,
    transitionedAt: r.transitioned_at instanceof Date ? r.transitioned_at.toISOString() : String(r.transitioned_at),
    transitionReason: r.transition_reason,
  };
}

async function fetchClaimDetail(queryable: Pool | PoolClient, claimId: number): Promise<ClaimDetailDto | null> {
  const claimRes = await queryable.query<RawClaimRow>(
    `SELECT
       c.claim_id, c.claim_number, c.invoice_id, c.policy_id,
       c.claim_status, c.claimed_amount, c.approved_amount, c.rejection_reason,
       c.submitted_by_user_id, c.submitted_at, c.resolved_by_user_id, c.resolved_at,
       c.created_at, c.updated_at,
       p.policy_number,
       prov.provider_id, prov.name AS provider_name,
       pat.patient_id, (pat.first_name || ' ' || pat.last_name) AS patient_full_name,
       u_sub.username AS submitted_by_username,
       u_res.username AS resolved_by_username,
       inv.subtotal_amount, inv.patient_liability_amount, inv.approved_insurance_amount,
       inv.patient_payment_status
     FROM catms.insurance_claim c
     JOIN catms.insurance_policy p ON p.policy_id = c.policy_id
     JOIN catms.insurance_provider prov ON prov.provider_id = p.provider_id
     JOIN catms.invoice inv ON inv.invoice_id = c.invoice_id
     JOIN catms.appointment app ON app.appointment_id = inv.appointment_id
     JOIN catms.patient pat ON pat.patient_id = app.patient_id
     JOIN catms.user_account u_sub ON u_sub.user_account_id = c.submitted_by_user_id
     LEFT JOIN catms.user_account u_res ON u_res.user_account_id = c.resolved_by_user_id
     WHERE c.claim_id = $1`,
    [claimId],
  );

  if (claimRes.rows.length === 0) {
    return null;
  }

  const rawClaim = claimRes.rows[0]!;
  const baseDto = mapClaimRow(rawClaim);

  // Fetch lines
  const linesRes = await queryable.query<RawClaimLineRow>(
    `SELECT *
     FROM catms.insurance_claim_line
     WHERE claim_id = $1
     ORDER BY line_number ASC`,
    [claimId],
  );

  // Fetch status logs
  const logsRes = await queryable.query<RawStatusLogRow>(
    `SELECT l.*, u.username AS transitioned_by_username
     FROM catms.insurance_claim_status_log l
     JOIN catms.user_account u ON u.user_account_id = l.transitioned_by_user_id
     WHERE l.claim_id = $1
     ORDER BY l.status_log_id ASC`,
    [claimId],
  );

  return {
    ...baseDto,
    lines: linesRes.rows.map(mapClaimLineRow),
    statusLogs: logsRes.rows.map(mapStatusLogRow),
    invoiceSubtotal: rawClaim.subtotal_amount !== undefined ? Number(rawClaim.subtotal_amount) : undefined,
    invoicePatientLiability: rawClaim.patient_liability_amount !== undefined ? Number(rawClaim.patient_liability_amount) : undefined,
    invoiceApprovedInsurance: rawClaim.approved_insurance_amount !== undefined ? Number(rawClaim.approved_insurance_amount) : undefined,
    patientPaymentStatus: rawClaim.patient_payment_status,
  };
}

export class ClaimsService {
  /**
   * Preview claim eligibility and multi-policy coordination of benefits
   * without mutating the database state.
   */
  async previewClaimEligibility(invoiceId: number, policyIds: number[]): Promise<ClaimPreviewResultDto> {
    // 1. Fetch invoice header, appointment, patient
    const invRes = await pool.query<{
      invoice_id: number;
      appointment_id: number;
      subtotal_amount: string | number;
      invoice_state: string;
      patient_id: number;
      service_date: string;
      patient_full_name: string;
    }>(
      `SELECT
         i.invoice_id, i.appointment_id, i.subtotal_amount, i.invoice_state,
         a.patient_id, a.start_at::date::text AS service_date,
         (p.first_name || ' ' || p.last_name) AS patient_full_name
       FROM catms.invoice i
       JOIN catms.appointment a ON a.appointment_id = i.appointment_id
       JOIN catms.patient p ON p.patient_id = a.patient_id
       WHERE i.invoice_id = $1`,
      [invoiceId],
    );

    if (invRes.rows.length === 0) {
      throw AppError.notFound('Invoice');
    }

    const inv = invRes.rows[0]!;
    if (inv.invoice_state !== 'Issued') {
      throw AppError.conflict(`Claims can only be filed against Issued invoices (current state: ${inv.invoice_state}).`);
    }

    const serviceDate = inv.service_date;
    const patientId = Number(inv.patient_id);
    const invoiceSubtotal = Number(inv.subtotal_amount);

    // 2. Validate policies
    interface PolicyHeaderRow {
      policy_id: number;
      policy_number: string;
      patient_id: number;
      provider_id: number;
      provider_name: string;
      provider_status: string;
      policy_status: string;
      valid_from: string;
      valid_to: string | null;
    }

    const validatedPolicies: PolicyHeaderRow[] = [];

    for (const polId of policyIds) {
      const polRes = await pool.query<PolicyHeaderRow>(
        `SELECT
           p.policy_id, p.policy_number, p.patient_id, p.provider_id,
           p.policy_status, p.valid_from::text, p.valid_to::text,
           prov.name AS provider_name, prov.status AS provider_status
         FROM catms.insurance_policy p
         JOIN catms.insurance_provider prov ON prov.provider_id = p.provider_id
         WHERE p.policy_id = $1`,
        [polId],
      );

      if (polRes.rows.length === 0) {
        throw AppError.notFound(`Insurance policy ID ${polId}`);
      }

      const pol = polRes.rows[0]!;

      // Rule 3.1: Ownership invariant
      if (Number(pol.patient_id) !== patientId) {
        throw AppError.validationError(`Policy ${pol.policy_number} belongs to patient ${pol.patient_id}, not invoice patient ${patientId}.`);
      }

      // Rule 3.2: Status guard
      if (pol.policy_status !== 'ACTIVE') {
        throw AppError.validationError(`Policy ${pol.policy_number} is in status ${pol.policy_status}. Only ACTIVE policies can be claimed.`);
      }

      // Rule 3.4: Active provider
      if (pol.provider_status !== 'ACTIVE') {
        throw AppError.validationError(`Insurance provider ${pol.provider_name} is deactivated.`);
      }

      // Rule 3.3: Service date validity window
      if (serviceDate < pol.valid_from || (pol.valid_to && serviceDate > pol.valid_to)) {
        throw AppError.validationError(`Service date ${serviceDate} is outside policy ${pol.policy_number} validity window (${pol.valid_from} to ${pol.valid_to ?? 'indefinite'}).`);
      }

      validatedPolicies.push(pol);
    }

    // 3. Fetch invoice lines and prior claimed amounts
    interface InvoiceLineRow {
      invoice_line_id: number;
      line_number: number;
      line_total: string | number;
      unit_price: string | number;
      quantity: string | number;
      treatment_id: number;
      service_code: string;
      treatment_name: string;
      prior_claimed: string | number;
    }

    const linesRes = await pool.query<InvoiceLineRow>(
      `SELECT
         il.invoice_line_id, il.line_number, il.line_total, il.unit_price, il.quantity,
         at.treatment_id, tc.service_code, tc.name AS treatment_name,
         coalesce(clm.total_claimed, 0.00) AS prior_claimed
       FROM catms.invoice_line il
       JOIN catms.appointment_treatment at ON at.appointment_treatment_id = il.appointment_treatment_id
       JOIN catms.treatment_catalogue tc ON tc.treatment_id = at.treatment_id
       LEFT JOIN (
         SELECT cl.invoice_line_id, sum(cl.claimed_amount) AS total_claimed
         FROM catms.insurance_claim_line cl
         JOIN catms.insurance_claim c ON c.claim_id = cl.claim_id
         WHERE c.claim_status <> 'Rejected'
         GROUP BY cl.invoice_line_id
       ) clm ON clm.invoice_line_id = il.invoice_line_id
       WHERE il.invoice_id = $1
       ORDER BY il.line_number ASC`,
      [invoiceId],
    );

    if (linesRes.rows.length === 0) {
      throw AppError.validationError(`Invoice ${invoiceId} has no invoice lines to claim.`);
    }

    // Line balances tracked during multi-policy sequential coordination
    const lineBalances = new Map<number, number>();
    for (const l of linesRes.rows) {
      const lineTotal = Number(l.line_total);
      const prior = Number(l.prior_claimed);
      const rem = Math.max(0, roundToCent(lineTotal - prior));
      lineBalances.set(Number(l.invoice_line_id), rem);
    }

    // 4. Sequential coordination across policies
    const policyPreviews: ClaimPolicyPreviewDto[] = [];
    let grandTotalClaimed = 0;

    for (let priority = 0; priority < validatedPolicies.length; priority++) {
      const pol = validatedPolicies[priority]!;
      let policyTotal = 0;
      const linePreviews: ClaimLinePreviewDto[] = [];

      for (const line of linesRes.rows) {
        const lineId = Number(line.invoice_line_id);
        const lineTotal = Number(line.line_total);
        const remBalance = lineBalances.get(lineId) ?? 0;

        // Lookup coverage on service date
        const covRes = await pool.query<{
          coverage_id: number;
          coverage_percentage: string | number;
          coverage_cap: string | number | null;
        }>(
          `SELECT coverage_id, coverage_percentage, coverage_cap
           FROM catms.policy_coverage
           WHERE policy_id = $1
             AND treatment_id = $2
             AND effective_from <= $3
             AND (effective_to IS NULL OR effective_to >= $3)
           ORDER BY effective_from DESC
           LIMIT 1`,
          [pol.policy_id, line.treatment_id, serviceDate],
        );

        let covId: number | null = null;
        let pct = 0;
        let cap: number | null = null;
        let nominalCover = 0;
        let maxEligibleCover = 0;
        let claimableAmount = 0;

        if (covRes.rows.length > 0) {
          const cov = covRes.rows[0]!;
          covId = Number(cov.coverage_id);
          pct = Number(cov.coverage_percentage);
          cap = cov.coverage_cap !== null && cov.coverage_cap !== undefined ? Number(cov.coverage_cap) : null;

          nominalCover = roundToCent((lineTotal * pct) / 100);
          maxEligibleCover = cap !== null ? Math.min(nominalCover, cap, lineTotal) : Math.min(nominalCover, lineTotal);
          claimableAmount = roundToCent(Math.min(maxEligibleCover, remBalance));
        }

        const newRemaining = roundToCent(Math.max(0, remBalance - claimableAmount));
        lineBalances.set(lineId, newRemaining);
        policyTotal = roundToCent(policyTotal + claimableAmount);

        linePreviews.push({
          invoiceLineId: lineId,
          lineNumber: Number(line.line_number),
          serviceCode: line.service_code,
          description: line.treatment_name,
          unitPrice: Number(line.unit_price),
          quantity: Number(line.quantity),
          lineTotal,
          policyCoverageId: covId,
          coveredPercentage: pct,
          coverageCap: cap,
          nominalCoveredAmount: nominalCover,
          maxEligibleCover,
          claimableAmount,
          remainingLineBalance: newRemaining,
        });
      }

      grandTotalClaimed = roundToCent(grandTotalClaimed + policyTotal);

      policyPreviews.push({
        policyId: Number(pol.policy_id),
        policyNumber: pol.policy_number,
        providerId: Number(pol.provider_id),
        providerName: pol.provider_name,
        priority: priority + 1,
        totalClaimedAmount: policyTotal,
        lines: linePreviews,
      });
    }

    const estimatedPatientLiability = roundToCent(Math.max(0, invoiceSubtotal - grandTotalClaimed));

    return {
      invoiceId,
      appointmentId: Number(inv.appointment_id),
      serviceDate,
      patientId,
      patientFullName: inv.patient_full_name,
      invoiceSubtotal,
      totalEstimatedInsurance: grandTotalClaimed,
      estimatedPatientLiability,
      policies: policyPreviews,
    };
  }

  /**
   * Submit insurance claims for an invoice against one or more policies.
   * Invokes catms.submit_claim procedure inside transaction.
   */
  async submitClaim(input: SubmitClaimInput, user: JwtPayload): Promise<ClaimDetailDto[]> {
    return withTransaction(async (client: PoolClient) => {
      // Execute stored procedure
      const res = await client.query<{ claim_ids: string[] | number[] }>(
        `SELECT catms.submit_claim($1::BIGINT, $2::BIGINT[], $3::BIGINT) AS claim_ids`,
        [input.invoiceId, input.policyIds, user.userId],
      );

      const rawIds = res.rows[0]?.claim_ids;
      const claimIds: number[] = Array.isArray(rawIds) ? rawIds.map(Number) : [];

      const createdClaims: ClaimDetailDto[] = [];
      for (const id of claimIds) {
        const detail = await fetchClaimDetail(client, id);
        if (detail) {
          createdClaims.push(detail);
        }
      }

      return createdClaims;
    }, resolveDbRole(user));
  }

  /**
   * Resolve an insurance claim (Approved, PartiallyApproved, Rejected).
   * Restricted strictly to finance/admin accounts.
   * Updates claim and recalculates invoice liability atomically.
   */
  async resolveClaim(claimId: number, input: ResolveClaimInput, user: JwtPayload): Promise<ClaimResolutionResultDto> {
    // Application-layer RBAC check
    const userRole = (user.role || '').toLowerCase();
    const isFinanceAuthorized = ['admin', 'manager', 'branchmanager', 'adminfinance'].includes(userRole);

    if (!isFinanceAuthorized) {
      throw AppError.forbidden('Only finance and administrative officers possess authority to resolve claims.');
    }

    return withTransaction(async (client: PoolClient) => {
      // 1. Lock and check claim
      const claimRes = await client.query<{
        claim_id: number;
        claim_number: string;
        invoice_id: number;
        claim_status: string;
        claimed_amount: string | number;
      }>(
        `SELECT claim_id, claim_number, invoice_id, claim_status, claimed_amount
         FROM catms.insurance_claim
         WHERE claim_id = $1
         FOR UPDATE`,
        [claimId],
      );

      if (claimRes.rows.length === 0) {
        throw AppError.notFound('Insurance claim');
      }

      const claimRec = claimRes.rows[0]!;
      if (claimRec.claim_status !== 'Pending') {
        throw AppError.conflict(
          `Claim ${claimRec.claim_number} is already resolved in status ${claimRec.claim_status} and cannot be re-resolved.`,
        );
      }

      const claimedAmount = Number(claimRec.claimed_amount);
      let calculatedApprovedAmount = 0.00;

      // 2. Calculate approved amount server-side (reject or ignore client tampering)
      if (input.resolution === 'Approved') {
        // Full approval MUST equal claimed_amount
        calculatedApprovedAmount = claimedAmount;
      } else if (input.resolution === 'Rejected') {
        calculatedApprovedAmount = 0.00;
      } else if (input.resolution === 'PartiallyApproved') {
        if (input.lineApprovals && input.lineApprovals.length > 0) {
          calculatedApprovedAmount = roundToCent(
            input.lineApprovals.reduce((acc, curr) => acc + curr.approvedAmount, 0),
          );
        } else if (input.approvedAmount !== undefined) {
          calculatedApprovedAmount = roundToCent(input.approvedAmount);
        } else {
          throw AppError.validationError('PartiallyApproved claim resolution requires an approvedAmount or lineApprovals.');
        }

        if (calculatedApprovedAmount <= 0.00 || calculatedApprovedAmount >= claimedAmount) {
          throw AppError.validationError(
            `PartiallyApproved requires 0.00 < approved_amount (${calculatedApprovedAmount}) < claimed_amount (${claimedAmount}).`,
          );
        }
      }

      // Format line approvals JSON if provided
      const lineApprovalsJson =
        input.lineApprovals && input.lineApprovals.length > 0
          ? JSON.stringify(
              input.lineApprovals.map((la) => ({
                invoice_line_id: la.invoiceLineId,
                approved_amount: la.approvedAmount,
              })),
            )
          : null;

      // 3. Invoke catms.resolve_claim stored procedure
      await client.query(
        `SELECT catms.resolve_claim(
           $1::BIGINT,
           $2::VARCHAR,
           $3::NUMERIC,
           $4::BIGINT,
           $5::TEXT,
           $6::JSONB
         ) AS new_status`,
        [
          claimId,
          input.resolution,
          calculatedApprovedAmount,
          user.userId,
          input.rejectionReason ?? null,
          lineApprovalsJson,
        ],
      );

      // 4. Fetch updated claim and invoice liability
      const updatedClaim = await fetchClaimDetail(client, claimId);
      if (!updatedClaim) {
        throw AppError.notFound('Insurance claim');
      }

      const invRes = await client.query<{
        invoice_id: number;
        subtotal_amount: string | number;
        approved_insurance_amount: string | number;
        patient_liability_amount: string | number;
        patient_payment_status: string;
      }>(
        `SELECT invoice_id, subtotal_amount, approved_insurance_amount, patient_liability_amount, patient_payment_status
         FROM catms.invoice
         WHERE invoice_id = $1`,
        [claimRec.invoice_id],
      );

      const invRec = invRes.rows[0]!;

      return {
        claim: updatedClaim,
        invoiceLiability: {
          invoiceId: Number(invRec.invoice_id),
          subtotalAmount: Number(invRec.subtotal_amount),
          approvedInsuranceAmount: Number(invRec.approved_insurance_amount),
          patientLiabilityAmount: Number(invRec.patient_liability_amount),
          patientPaymentStatus: invRec.patient_payment_status,
        },
      };
    }, resolveDbRole(user));
  }

  /**
   * List claims with optional filtering and pagination.
   */
  async listClaims(filters: ClaimFilters): Promise<{
    claims: ClaimDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let pIdx = 1;

    if (filters.invoiceId) {
      conditions.push(`c.invoice_id = $${pIdx++}`);
      params.push(filters.invoiceId);
    }
    if (filters.policyId) {
      conditions.push(`c.policy_id = $${pIdx++}`);
      params.push(filters.policyId);
    }
    if (filters.patientId) {
      conditions.push(`pat.patient_id = $${pIdx++}`);
      params.push(filters.patientId);
    }
    if (filters.status) {
      conditions.push(`c.claim_status = $${pIdx++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM catms.insurance_claim c
       JOIN catms.invoice inv ON inv.invoice_id = c.invoice_id
       JOIN catms.appointment app ON app.appointment_id = inv.appointment_id
       JOIN catms.patient pat ON pat.patient_id = app.patient_id
       ${whereClause}`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;
    const offset = (page - 1) * limit;

    const listParams = [...params, limit, offset];

    const listRes = await pool.query<RawClaimRow>(
      `SELECT
         c.claim_id, c.claim_number, c.invoice_id, c.policy_id,
         c.claim_status, c.claimed_amount, c.approved_amount, c.rejection_reason,
         c.submitted_by_user_id, c.submitted_at, c.resolved_by_user_id, c.resolved_at,
         c.created_at, c.updated_at,
         p.policy_number,
         prov.provider_id, prov.name AS provider_name,
         pat.patient_id, (pat.first_name || ' ' || pat.last_name) AS patient_full_name,
         u_sub.username AS submitted_by_username,
         u_res.username AS resolved_by_username
       FROM catms.insurance_claim c
       JOIN catms.insurance_policy p ON p.policy_id = c.policy_id
       JOIN catms.insurance_provider prov ON prov.provider_id = p.provider_id
       JOIN catms.invoice inv ON inv.invoice_id = c.invoice_id
       JOIN catms.appointment app ON app.appointment_id = inv.appointment_id
       JOIN catms.patient pat ON pat.patient_id = app.patient_id
       JOIN catms.user_account u_sub ON u_sub.user_account_id = c.submitted_by_user_id
       LEFT JOIN catms.user_account u_res ON u_res.user_account_id = c.resolved_by_user_id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${pIdx++} OFFSET $${pIdx++}`,
      listParams,
    );

    return {
      claims: listRes.rows.map(mapClaimRow),
      total,
      page,
      limit,
    };
  }

  /**
   * Get single claim detail with snapshotted lines and append-only status log.
   */
  async getClaimById(claimId: number): Promise<ClaimDetailDto> {
    const claim = await fetchClaimDetail(pool, claimId);
    if (!claim) {
      throw AppError.notFound('Insurance claim');
    }
    return claim;
  }
}

export const claimsService = new ClaimsService();
