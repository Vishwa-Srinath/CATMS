/**
 * src/contracts/patients-insurance.contract.ts
 * Owner: Dev3 | Issue: CATMS-048
 *
 * TypeScript DTOs and request inputs for Patient Identity, Emergency Contacts,
 * Insurance Providers, Policies, and Treatment Coverage Terms.
 *
 * Rules (CODEBASE_GUIDE.md §6, CATMS-003, CATMS-006):
 *   - Client-supplied IDs, maintained timestamps, and registration actor fields
 *     MUST NOT be accepted from clients.
 *   - Patient identity search is clinic-wide across all branches.
 *   - Standard success envelope wraps all responses: { data: ..., meta: { correlationId } }.
 */

export type Gender = 'Male' | 'Female' | 'Other';

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export type IdentityType = 'NIC' | 'Passport';

export type InsuranceProviderStatus = 'ACTIVE' | 'INACTIVE';

export type InsurancePolicyStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';

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
  isPrimary?: boolean | undefined;
}

// ── Emergency Contact DTOs ───────────────────────────────────────────────────

export interface EmergencyContactDto {
  contactId: number;
  patientId: number;
  contactName: string;
  relationship: string;
  phoneNumber: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface CreateEmergencyContactInput {
  contactName: string;
  relationship: string;
  phoneNumber: string;
  isPrimary?: boolean | undefined;
}

export interface UpdateEmergencyContactInput {
  contactName?: string | undefined;
  relationship?: string | undefined;
  phoneNumber?: string | undefined;
  isPrimary?: boolean | undefined;
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
  registeredBranchName?: string | null | undefined;
  registeredBy: number | null;
  registeredAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  primaryIdentity?: PatientIdentityDto | null | undefined;
  primaryContact?: EmergencyContactDto | null | undefined;
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
  patientNumber?: string | undefined;
  bloodGroup?: BloodGroup | null | undefined;
  email?: string | null | undefined;
  address?: string | null | undefined;
  registeredBranchId?: number | undefined;
}

export interface UpdatePatientInput {
  firstName?: string | undefined;
  lastName?: string | undefined;
  dateOfBirth?: string | undefined;
  gender?: Gender | undefined;
  bloodGroup?: BloodGroup | null | undefined;
  contactNumber?: string | undefined;
  email?: string | null | undefined;
  address?: string | null | undefined;
  isActive?: boolean | undefined;
}

export interface PatientSearchFilters {
  q?: string | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  isActive?: 'true' | 'false' | 'all' | undefined;
}

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
}

export interface CreateInsuranceProviderInput {
  providerCode: string;
  name: string;
  contactName?: string | null | undefined;
  contactPhone?: string | null | undefined;
  contactEmail?: string | null | undefined;
  status?: InsuranceProviderStatus | undefined;
  notes?: string | null | undefined;
}

// ── Insurance Policy DTOs ────────────────────────────────────────────────────

export interface InsurancePolicyDto {
  policyId: number;
  patientId: number;
  providerId: number;
  providerCode?: string | undefined;
  providerName?: string | undefined;
  policyNumber: string;
  policyStatus: InsurancePolicyStatus;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InsurancePolicyDetailDto extends InsurancePolicyDto {
  coverages: PolicyCoverageDto[];
}

export interface CreateInsurancePolicyInput {
  patientId: number;
  providerId: number;
  policyNumber: string;
  validFrom: string;
  validTo?: string | null | undefined;
  policyStatus?: InsurancePolicyStatus | undefined;
  notes?: string | null | undefined;
}

export interface UpdatePolicyStatusInput {
  policyStatus: InsurancePolicyStatus;
  notes?: string | null | undefined;
}

export interface PolicyListFilters {
  patientId?: number | undefined;
  providerId?: number | undefined;
  status?: InsurancePolicyStatus | undefined;
}

// ── Policy Coverage DTOs ─────────────────────────────────────────────────────

export interface PolicyCoverageDto {
  coverageId: number;
  policyId: number;
  treatmentId: number;
  treatmentName?: string | null | undefined;
  serviceCode?: string | null | undefined;
  coveragePercentage: number;
  coverageCap: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
}

export interface AddPolicyCoverageInput {
  treatmentId: number;
  coveragePercentage: number;
  coverageCap?: number | null | undefined;
  effectiveFrom: string;
  effectiveTo?: string | null | undefined;
}

export interface UpdatePolicyCoverageInput {
  treatmentId: number;
  coveragePercentage: number;
  coverageCap?: number | null | undefined;
  effectiveFrom: string;
  effectiveTo?: string | null | undefined;
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
