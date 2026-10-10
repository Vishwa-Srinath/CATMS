/**
 * src/api/insurance.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Insurance providers, policies and coverage API client.
 */

import { apiClient } from './client';

export interface InsuranceProviderDto {
  providerId: number;
  providerName: string;
  contactNumber?: string;
  email?: string;
  isActive: boolean;
}

export interface InsurancePolicyDto {
  policyId: number;
  patientId: number;
  providerId: number;
  providerName: string;
  policyNumber: string;
  startDate: string;
  endDate?: string;
  status: 'Active' | 'Expired' | 'Suspended';
}

export interface PolicyCoverageDto {
  coverageId: number;
  policyId: number;
  treatmentId: number;
  coveragePercentage: number;
  coverageCap?: number;
}

export const insuranceApi = {
  getProviders: () =>
    apiClient.get<InsuranceProviderDto[]>('/insurance/providers'),

  getPatientPolicies: (patientId: number) =>
    apiClient.get<InsurancePolicyDto[]>(`/insurance/patients/${patientId}/policies`),

  createPolicy: (patientId: number, data: {
    providerId: number;
    policyNumber: string;
    startDate: string;
    endDate?: string;
  }) => apiClient.post<InsurancePolicyDto>(`/insurance/patients/${patientId}/policies`, data),

  getEffectiveCoverage: (treatmentId: number, policyId: number) =>
    apiClient.get<PolicyCoverageDto>('/insurance/effective-coverage', {
      params: { treatmentId, policyId },
    }),
};
