/**
 * src/api/claims.api.ts
 * Owner: Dev3 | Issues: CATMS-049, CATMS-056, CATMS-060
 *
 * Insurance claims management, eligibility preview, submission, and controlled resolution API client.
 */

import { apiClient } from './client';

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
  transitionedByUsername?: string | null;
  transitionedAt: string;
  transitionReason: string | null;
}

// ── Claim Header DTOs ────────────────────────────────────────────────────────

export interface ClaimDto {
  claimId: number;
  claimNumber: string;
  invoiceId: number;
  policyId: number;
  policyNumber?: string;
  providerId?: number;
  providerName?: string;
  patientId?: number;
  patientFullName?: string;
  claimStatus: ClaimStatus;
  claimedAmount: number;
  approvedAmount: number;
  rejectionReason: string | null;
  submittedByUserId: number;
  submittedByUsername?: string | null;
  submittedAt: string;
  resolvedByUserId: number | null;
  resolvedByUsername?: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Compatibility aliases
  id?: string | number;
  status?: ClaimStatus;
  provider?: string;
  policyNo?: string;
}

export interface ClaimDetailDto extends ClaimDto {
  lines: ClaimLineDto[];
  statusLogs: ClaimStatusLogDto[];
  invoiceSubtotal?: number;
  invoicePatientLiability?: number;
  invoiceApprovedInsurance?: number;
  patientPaymentStatus?: string;
}

// ── Eligibility Preview DTOs ─────────────────────────────────────────────────

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
  patientFullName?: string;
  invoiceSubtotal: number;
  totalEstimatedInsurance: number;
  estimatedPatientLiability: number;
  policies: ClaimPolicyPreviewDto[];
  // Compatibility alias
  totalSubtotal?: number;
  totalCovered?: number;
  patientLiability?: number;
}

// ── Request Inputs ───────────────────────────────────────────────────────────

export interface SubmitClaimInput {
  invoiceId: number;
  policyIds: number[];
}

export interface ResolveClaimLineApproval {
  invoiceLineId: number;
  approvedAmount: number;
}

export interface ResolveClaimInput {
  resolution: ClaimResolutionType;
  approvedAmount?: number;
  rejectionReason?: string | null;
  lineApprovals?: ResolveClaimLineApproval[];
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

export interface ClaimFilters {
  invoiceId?: number;
  policyId?: number;
  patientId?: number;
  status?: ClaimStatus;
  page?: number;
  limit?: number;
}

// ── API Operations ───────────────────────────────────────────────────────────

export const claimsApi = {
  previewEligibility: (data: { invoiceId: number; policyIds: number[] }) =>
    apiClient.post<ClaimPreviewResultDto>('/claims/preview', data),

  submit: (data: SubmitClaimInput) =>
    apiClient.post<ClaimDto[]>('/claims', data),

  list: (params?: ClaimFilters) =>
    apiClient.get<ClaimDto[]>('/claims', { params }),

  getById: (claimId: number) =>
    apiClient.get<ClaimDetailDto>(`/claims/${claimId}`),

  resolve: (claimId: number, data: ResolveClaimInput) =>
    apiClient.patch<ClaimResolutionResultDto>(`/claims/${claimId}/resolve`, data),
};
