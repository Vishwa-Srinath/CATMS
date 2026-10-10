/**
 * src/api/claims.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Claims management, preview and resolution API client.
 */

import { apiClient } from './client';

export interface ClaimPreviewItemDto {
  policyId: number;
  providerName: string;
  nominalCoveredAmount: number;
  approvedOrClaimableAmount: number;
}

export interface ClaimPreviewResponseDto {
  invoiceId: number;
  totalSubtotal: number;
  totalCovered: number;
  patientLiability: number;
  allocations: ClaimPreviewItemDto[];
}

export interface ClaimDto {
  claimId: number;
  claimNumber: string;
  invoiceId: number;
  policyId: number;
  providerName?: string;
  claimedAmount: number;
  approvedAmount?: number;
  claimStatus: 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected';
  submittedAt: string;
  resolvedAt?: string;
}

export interface ClaimListParams {
  invoiceId?: number;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SubmitClaimInput {
  invoiceId: number;
  policyIds: number[];
}

export interface ResolveClaimInput {
  claimStatus: 'Approved' | 'PartiallyApproved' | 'Rejected';
  approvedAmount?: number;
  rejectionReason?: string;
}

export const claimsApi = {
  previewEligibility: (invoiceId: number, policyIds: number[]) =>
    apiClient.post<ClaimPreviewResponseDto>('/claims/preview', { invoiceId, policyIds }),

  submit: (data: SubmitClaimInput) =>
    apiClient.post<ClaimDto[]>('/claims', data),

  list: (params?: ClaimListParams) =>
    apiClient.get<ClaimDto[]>('/claims', { params }),

  getById: (claimId: number) =>
    apiClient.get<ClaimDto>(`/claims/${claimId}`),

  resolve: (claimId: number, data: ResolveClaimInput) =>
    apiClient.patch<ClaimDto>(`/claims/${claimId}/resolve`, data),
};
