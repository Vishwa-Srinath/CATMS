/**
 * src/contracts/claims.contract.ts
 * Owner: Dev3 | Issue: CATMS-049
 *
 * TypeScript DTOs, request contracts, and preview structures for Insurance Claims.
 *
 * Rules (CODEBASE_GUIDE.md §6, CATMS-003, CATMS-006, CATMS-008):
 *   - Client-supplied totals, claimed amounts, and actor IDs MUST NOT be accepted.
 *   - Coverage terms are calculated and snapshotted strictly server-side.
 *   - Claim resolution is restricted to finance/admin roles.
 *   - Standard success envelope wraps all responses: { data: ..., meta: { correlationId } }.
 */

export type ClaimStatus = 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected';

export type ClaimResolutionType = 'Approved' | 'PartiallyApproved' | 'Rejected';

// ── Claim Line Snapshot DTO ──────────────────────────────────────────────────

export interface ClaimLineDto {
  claimLineId: number;
  claimId: number;
  invoiceLineId: number;
  policyCoverageId: number | null;
  lineNumber: number;
  serviceCode: string;
  description: string;
  coveredPercentage: number;
  coverageCap: number | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  nominalCoveredAmount: number;
  claimedAmount: number;
  approvedAmount: number;
  createdAt: string;
}

// ── Claim Status Transition Log DTO ──────────────────────────────────────────

export interface ClaimStatusLogDto {
  statusLogId: number;
  claimId: number;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  transitionedByUserId: number;
  transitionedByUsername?: string | null | undefined;
  transitionedAt: string;
  transitionReason: string | null;
}

// ── Claim Header DTOs ────────────────────────────────────────────────────────

export interface ClaimDto {
  claimId: number;
  claimNumber: string;
  invoiceId: number;
  policyId: number;
  policyNumber?: string | undefined;
  providerId?: number | undefined;
  providerName?: string | undefined;
  patientId?: number | undefined;
  patientFullName?: string | undefined;
  claimStatus: ClaimStatus;
  claimedAmount: number;
  approvedAmount: number;
  rejectionReason: string | null;
  submittedByUserId: number;
  submittedByUsername?: string | null | undefined;
  submittedAt: string;
  resolvedByUserId: number | null;
  resolvedByUsername?: string | null | undefined;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimDetailDto extends ClaimDto {
  lines: ClaimLineDto[];
  statusLogs: ClaimStatusLogDto[];
  invoiceSubtotal?: number | undefined;
  invoicePatientLiability?: number | undefined;
  invoiceApprovedInsurance?: number | undefined;
  patientPaymentStatus?: string | undefined;
}

// ── Claim Submission Request ─────────────────────────────────────────────────

export interface SubmitClaimInput {
  invoiceId: number;
  policyIds: number[];
}

// ── Claim Resolution Request & Response ──────────────────────────────────────

export interface ResolveClaimLineApproval {
  invoiceLineId: number;
  approvedAmount: number;
}

export interface ResolveClaimInput {
  resolution: ClaimResolutionType;
  approvedAmount?: number | undefined;
  rejectionReason?: string | null | undefined;
  lineApprovals?: ResolveClaimLineApproval[] | undefined;
}

export interface ClaimResolutionResultDto {
  claim: ClaimDetailDto;
  invoiceLiability: {
    invoiceId: number;
    subtotalAmount: number;
    approvedInsuranceAmount: number;
    patientLiabilityAmount: number;
    patientPaymentStatus: string;
  };
}

// ── Claim Eligibility Preview DTOs ───────────────────────────────────────────

export interface PreviewClaimInput {
  invoiceId: number;
  policyIds: number[];
}

export interface ClaimLinePreviewDto {
  invoiceLineId: number;
  lineNumber: number;
  serviceCode: string;
  description: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  policyCoverageId: number | null;
  coveredPercentage: number;
  coverageCap: number | null;
  nominalCoveredAmount: number;
  maxEligibleCover: number;
  claimableAmount: number;
  remainingLineBalance: number;
}

export interface ClaimPolicyPreviewDto {
  policyId: number;
  policyNumber: string;
  providerId: number;
  providerName: string;
  priority: number;
  totalClaimedAmount: number;
  lines: ClaimLinePreviewDto[];
}

export interface ClaimPreviewResultDto {
  invoiceId: number;
  appointmentId: number;
  serviceDate: string;
  patientId: number;
  patientFullName?: string | undefined;
  invoiceSubtotal: number;
  totalEstimatedInsurance: number;
  estimatedPatientLiability: number;
  policies: ClaimPolicyPreviewDto[];
}

// ── Filters & Queries ────────────────────────────────────────────────────────

export interface ClaimFilters {
  invoiceId?: number | undefined;
  policyId?: number | undefined;
  patientId?: number | undefined;
  status?: ClaimStatus | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}
