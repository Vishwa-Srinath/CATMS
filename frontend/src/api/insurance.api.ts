/**
 * src/api/insurance.api.ts
 * Owner: Dev3 | Issues: CATMS-048, CATMS-056, CATMS-059
 *
 * Insurance providers, policies, coverage terms, and effective eligibility API client.
 */

import { apiClient } from './client';

export type InsuranceProviderStatus = 'ACTIVE' | 'INACTIVE';
export type InsurancePolicyStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';

// ── Insurance Provider DTOs ──────────────────────────────────────────────────

export interface InsuranceProviderDto {
  providerId: number;
  providerCode: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: InsuranceProviderStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Backward compatibility alias
  providerName?: string;
  contactNumber?: string;
  email?: string;
  isActive?: boolean;
}

export interface CreateInsuranceProviderInput {
  providerCode: string;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  status?: InsuranceProviderStatus;
  notes?: string | null;
}

// ── Insurance Policy DTOs ────────────────────────────────────────────────────

export interface InsurancePolicyDto {
  policyId: number;
  patientId: number;
  providerId: number;
  providerCode?: string;
  providerName?: string;
  policyNumber: string;
  policyStatus: InsurancePolicyStatus;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Compatibility aliases
  id?: string | number;
  policyNo?: string;
  provider?: string;
  startDate?: string;
  endDate?: string;
  status?: InsurancePolicyStatus | 'Active' | 'Expired' | 'Suspended';
  coverages?: PolicyCoverageDto[];
  coverage?: PolicyCoverageDto[];
}

export interface InsurancePolicyDetailDto extends InsurancePolicyDto {
  coverages: PolicyCoverageDto[];
}

export interface CreateInsurancePolicyInput {
  patientId: number;
  providerId: number;
  policyNumber: string;
  validFrom: string;
  validTo?: string | null;
  policyStatus?: InsurancePolicyStatus;
  notes?: string | null;
}

export interface UpdatePolicyStatusInput {
  policyStatus: InsurancePolicyStatus;
  notes?: string | null;
}

export interface PolicyListFilters {
  patientId?: number;
  providerId?: number;
  status?: InsurancePolicyStatus;
}

// ── Policy Coverage DTOs ─────────────────────────────────────────────────────

export interface PolicyCoverageDto {
  coverageId: number;
  policyId: number;
  treatmentId: number;
  treatmentName?: string | null;
  serviceCode?: string | null;
  coveragePercentage: number;
  coverageCap: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface AddPolicyCoverageInput {
  treatmentId: number;
  coveragePercentage: number;
  coverageCap?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface UpdatePolicyCoverageInput {
  treatmentId: number;
  coveragePercentage: number;
  coverageCap?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface EffectiveCoverageDto {
  coverageId: number | null;
  policyId: number;
  treatmentId: number;
  coveragePercentage: number;
  coverageCap: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isEligible: boolean;
  ineligibilityReason: string | null;
}

// ── API Operations ───────────────────────────────────────────────────────────

export const insuranceApi = {
  getProviders: (status?: InsuranceProviderStatus) =>
    apiClient.get<InsuranceProviderDto[]>('/insurance/providers', {
      params: status ? { status } : undefined,
    }),

  getProviderById: (id: number) =>
    apiClient.get<InsuranceProviderDto>(`/insurance/providers/${id}`),

  createProvider: (data: CreateInsuranceProviderInput) =>
    apiClient.post<InsuranceProviderDto>('/insurance/providers', data),

  getPolicies: (filters?: PolicyListFilters) =>
    apiClient.get<InsurancePolicyDto[]>('/insurance/policies', { params: filters }),

  getPatientPolicies: (patientId: number) =>
    apiClient.get<InsurancePolicyDto[]>('/insurance/policies', { params: { patientId } }),

  getPolicyById: (id: number) =>
    apiClient.get<InsurancePolicyDetailDto>(`/insurance/policies/${id}`),

  createPolicy: (data: CreateInsurancePolicyInput) =>
    apiClient.post<InsurancePolicyDto>('/insurance/policies', data),

  updatePolicyStatus: (id: number, data: UpdatePolicyStatusInput) =>
    apiClient.patch<InsurancePolicyDto>(`/insurance/policies/${id}/status`, data),

  getPolicyCoverages: (policyId: number) =>
    apiClient.get<PolicyCoverageDto[]>(`/insurance/policies/${policyId}/coverages`),

  addPolicyCoverage: (policyId: number, data: AddPolicyCoverageInput) =>
    apiClient.post<PolicyCoverageDto>(`/insurance/policies/${policyId}/coverages`, data),

  updatePolicyCoverage: (policyId: number, data: UpdatePolicyCoverageInput) =>
    apiClient.put<PolicyCoverageDto>(`/insurance/policies/${policyId}/coverages`, data),

  getEffectiveCoverage: (policyId: number, treatmentId: number, serviceDate: string) =>
    apiClient.get<EffectiveCoverageDto>(`/insurance/policies/${policyId}/effective-coverage`, {
      params: { treatmentId, serviceDate },
    }),
};
