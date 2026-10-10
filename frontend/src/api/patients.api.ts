/**
 * src/api/patients.api.ts
 * Owner: Dev3 | Issues: CATMS-048, CATMS-056, CATMS-059
 *
 * Patient registry, identities, emergency contacts, and attached policies API client.
 */

import { apiClient } from './client';
import type { InsurancePolicyDto, CreateInsurancePolicyInput } from './insurance.api';

export type Gender = 'Male' | 'Female' | 'Other';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type IdentityType = 'NIC' | 'Passport';

// ── Patient Identity DTOs ────────────────────────────────────────────────────

export interface PatientIdentityDto {
  identityId: number;
  patientId: number;
  identityType: IdentityType;
  identityNumber: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface CreatePatientIdentityInput {
  identityType: IdentityType;
  identityNumber: string;
  isPrimary?: boolean;
}

// ── Emergency Contact DTOs ───────────────────────────────────────────────────

export interface EmergencyContactDto {
  contactId: number;
  patientId: number;
  contactName: string;
  relationship: string;
  phoneNumber: string;
  isPrimary: boolean;
  createdAt?: string;
  // Compatibility aliases
  name?: string;
  phone?: string;
}

export interface CreateEmergencyContactInput {
  contactName: string;
  relationship: string;
  phoneNumber: string;
  isPrimary?: boolean;
}

export interface UpdateEmergencyContactInput {
  contactName?: string;
  relationship?: string;
  phoneNumber?: string;
  isPrimary?: boolean;
}

// ── Patient Master DTOs ──────────────────────────────────────────────────────

export interface PatientDto {
  patientId: number;
  patientNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string;
  gender: Gender;
  bloodGroup: BloodGroup | null;
  contactNumber: string;
  email: string | null;
  address: string | null;
  registeredBranchId: number | null;
  registeredBranchName?: string | null;
  registeredBy?: number | null;
  registeredAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  primaryIdentity?: PatientIdentityDto | null;
  primaryContact?: EmergencyContactDto | null;
  lastVisit?: string;
  emergencyContacts?: EmergencyContactDto[];
  policies?: InsurancePolicyDto[];
  // Backward compatibility alias properties
  patientNo?: string;
  phone?: string;
  nationalId?: string;
}

export interface PatientDetailDto extends PatientDto {
  identities: PatientIdentityDto[];
  emergencyContacts: EmergencyContactDto[];
  policies: InsurancePolicyDto[];
}

export interface RegisterPatientInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  contactNumber: string;
  identityType: IdentityType;
  identityNumber: string;
  contactName: string;
  relationship: string;
  emergencyPhone: string;
  patientNumber?: string;
  bloodGroup?: BloodGroup | null;
  email?: string | null;
  address?: string | null;
  registeredBranchId?: number;
}

export interface UpdatePatientInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: Gender;
  bloodGroup?: BloodGroup | null;
  contactNumber?: string;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface PatientSearchFilters {
  q?: string;
  page?: number;
  limit?: number;
  isActive?: 'true' | 'false' | 'all';
}

// ── API Operations ───────────────────────────────────────────────────────────

export const patientsApi = {
  search: (query?: string | PatientSearchFilters) => {
    const params = typeof query === 'string' ? { q: query } : query;
    return apiClient.get<PatientDto[]>('/patients/search', { params });
  },

  list: (filters?: PatientSearchFilters) =>
    apiClient.get<PatientDto[]>('/patients', { params: filters }),

  getById: (patientId: number) =>
    apiClient.get<PatientDetailDto>(`/patients/${patientId}`),

  register: (data: RegisterPatientInput) =>
    apiClient.post<PatientDto>('/patients', data),

  update: (patientId: number, data: UpdatePatientInput) =>
    apiClient.put<PatientDto>(`/patients/${patientId}`, data),

  getEmergencyContacts: (patientId: number) =>
    apiClient.get<EmergencyContactDto[]>(`/patients/${patientId}/contacts`),

  addEmergencyContact: (patientId: number, data: CreateEmergencyContactInput) =>
    apiClient.post<EmergencyContactDto>(`/patients/${patientId}/contacts`, data),

  updateEmergencyContact: (
    patientId: number,
    contactId: number,
    data: UpdateEmergencyContactInput,
  ) =>
    apiClient.put<EmergencyContactDto>(
      `/patients/${patientId}/contacts/${contactId}`,
      data,
    ),

  deleteEmergencyContact: (patientId: number, contactId: number) =>
    apiClient.delete<{ message: string; contactId: number }>(
      `/patients/${patientId}/contacts/${contactId}`,
    ),

  getIdentities: (patientId: number) =>
    apiClient.get<PatientIdentityDto[]>(`/patients/${patientId}/identities`),

  addIdentity: (patientId: number, data: CreatePatientIdentityInput) =>
    apiClient.post<PatientIdentityDto>(`/patients/${patientId}/identities`, data),

  getPolicies: (patientId: number) =>
    apiClient.get<InsurancePolicyDto[]>(`/patients/${patientId}/policies`),

  createPolicyForPatient: (
    patientId: number,
    data: Omit<CreateInsurancePolicyInput, 'patientId'>,
  ) =>
    apiClient.post<InsurancePolicyDto>(`/patients/${patientId}/policies`, data),
};
