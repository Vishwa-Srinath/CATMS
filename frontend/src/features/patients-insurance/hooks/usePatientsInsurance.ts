/**
 * src/features/patients-insurance/hooks/usePatientsInsurance.ts
 * Owner: Dev3 | Issues: CATMS-048, CATMS-056, CATMS-059
 *
 * TanStack React Query hooks for Patient registry, identities, emergency contacts,
 * and Insurance providers, policies, and treatment coverage rules.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  patientsApi,
  type PatientDto,
  type PatientDetailDto,
  type RegisterPatientInput,
  type UpdatePatientInput,
  type PatientSearchFilters,
  type EmergencyContactDto,
  type CreateEmergencyContactInput,
  type UpdateEmergencyContactInput,
  type PatientIdentityDto,
  type CreatePatientIdentityInput,
} from '../../../api/patients.api';
import {
  insuranceApi,
  type InsuranceProviderDto,
  type InsurancePolicyDto,
  type CreateInsurancePolicyInput,
  type UpdatePolicyStatusInput,
  type PolicyListFilters,
  type PolicyCoverageDto,
  type AddPolicyCoverageInput,
  type UpdatePolicyCoverageInput,
  type InsuranceProviderStatus,
} from '../../../api/insurance.api';
import { clinicalApi, type TreatmentCatalogueItemDto } from '../../../api/clinical.api';
import { staffApi, type BranchDto } from '../../../api/staff.api';
import { ApiError } from '../../../api/errors';

export const PATIENT_INSURANCE_QUERY_KEYS = {
  patients: (filters?: PatientSearchFilters) => ['patients', filters] as const,
  patient: (id: number) => ['patients', id] as const,
  patientContacts: (patientId: number) => ['patients', patientId, 'contacts'] as const,
  patientIdentities: (patientId: number) => ['patients', patientId, 'identities'] as const,
  patientPolicies: (patientId: number) => ['patients', patientId, 'policies'] as const,
  providers: (status?: InsuranceProviderStatus) => ['insurance', 'providers', { status }] as const,
  provider: (id: number) => ['insurance', 'providers', id] as const,
  policies: (filters?: PolicyListFilters) => ['insurance', 'policies', filters] as const,
  policy: (id: number) => ['insurance', 'policies', id] as const,
  policyCoverages: (policyId: number) => ['insurance', 'policies', policyId, 'coverages'] as const,
  treatments: () => ['clinical', 'treatments'] as const,
  branches: () => ['admin', 'branches'] as const,
};

// ── Patients List & Clinic-wide Search Hook ──────────────────────────────────

export interface UsePatientsOptions {
  query?: string;
  branchId?: string | number;
  isActive?: 'true' | 'false' | 'all';
}

export function usePatients(options: UsePatientsOptions = {}) {
  const { query = '', branchId = 'all', isActive = 'all' } = options;
  const trimmedQuery = query.trim();

  const queryFilters: PatientSearchFilters = {
    q: trimmedQuery || undefined,
    isActive: isActive === 'all' ? undefined : isActive,
  };

  const patientQuery = useQuery<PatientDto[], ApiError>({
    queryKey: PATIENT_INSURANCE_QUERY_KEYS.patients(queryFilters),
    queryFn: () => {
      // Clinic-wide search when query is provided, or clinic-wide list
      if (trimmedQuery) {
        return patientsApi.search({ q: trimmedQuery });
      }
      return patientsApi.list({ isActive: queryFilters.isActive });
    },
    staleTime: 30_000,
  });

  const rawPatients = patientQuery.data ?? [];

  // Branch filtering:
  // When a search query is typed, results are clinic-wide across all branches.
  // Branch filter narrows local view when selected, but never hides clinic-wide matches when searching.
  const patients = rawPatients.filter((p) => {
    if (branchId === 'all') return true;
    const targetBranchId = typeof branchId === 'string' ? parseInt(branchId.replace(/\D/g, ''), 10) : branchId;
    if (isNaN(targetBranchId)) return true;
    return p.registeredBranchId === targetBranchId;
  });

  return {
    patients,
    allPatients: rawPatients,
    isLoading: patientQuery.isLoading,
    isFetching: patientQuery.isFetching,
    isError: patientQuery.isError,
    error: patientQuery.error,
    refetch: patientQuery.refetch,
  };
}

// ── Patient Detail Hook ──────────────────────────────────────────────────────

export function usePatientDetail(patientId?: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery<PatientDetailDto, ApiError>({
    queryKey: patientId ? PATIENT_INSURANCE_QUERY_KEYS.patient(patientId) : ['patients', 'none'],
    queryFn: () => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.getById(patientId);
    },
    enabled: typeof patientId === 'number' && patientId > 0,
    staleTime: 30_000,
  });

  const updateMutation = useMutation<PatientDto, ApiError, UpdatePatientInput>({
    mutationFn: (data) => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.update(patientId, data);
    },
    onSuccess: () => {
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patient(patientId) });
      }
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });

  return {
    patient: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    updatePatient: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
}

// ── Register Patient Hook ────────────────────────────────────────────────────

export function useRegisterPatient() {
  const queryClient = useQueryClient();

  const mutation = useMutation<PatientDto, ApiError, RegisterPatientInput>({
    mutationFn: (data) => patientsApi.register(data),
    onSuccess: (newPatient) => {
      // Invalidate queries so clinic-wide listing refreshes with real DB persistence
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      if (newPatient.patientId) {
        queryClient.setQueryData(
          PATIENT_INSURANCE_QUERY_KEYS.patient(newPatient.patientId),
          newPatient,
        );
      }
    },
  });

  return {
    registerPatient: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// ── Emergency Contacts Hook ──────────────────────────────────────────────────

export function useEmergencyContacts(patientId?: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery<EmergencyContactDto[], ApiError>({
    queryKey: patientId ? PATIENT_INSURANCE_QUERY_KEYS.patientContacts(patientId) : ['patients', 'contacts', 'none'],
    queryFn: () => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.getEmergencyContacts(patientId);
    },
    enabled: typeof patientId === 'number' && patientId > 0,
  });

  const addContactMutation = useMutation<EmergencyContactDto, ApiError, CreateEmergencyContactInput>({
    mutationFn: (data) => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.addEmergencyContact(patientId, data);
    },
    onSuccess: () => {
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patientContacts(patientId) });
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patient(patientId) });
      }
    },
  });

  const updateContactMutation = useMutation<
    EmergencyContactDto,
    ApiError,
    { contactId: number; data: UpdateEmergencyContactInput }
  >({
    mutationFn: ({ contactId, data }) => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.updateEmergencyContact(patientId, contactId, data);
    },
    onSuccess: () => {
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patientContacts(patientId) });
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patient(patientId) });
      }
    },
  });

  const deleteContactMutation = useMutation<
    { message: string; contactId: number },
    ApiError,
    number
  >({
    mutationFn: (contactId) => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.deleteEmergencyContact(patientId, contactId);
    },
    onSuccess: () => {
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patientContacts(patientId) });
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patient(patientId) });
      }
    },
  });

  return {
    contacts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addContact: addContactMutation.mutateAsync,
    isAdding: addContactMutation.isPending,
    updateContact: updateContactMutation.mutateAsync,
    isUpdating: updateContactMutation.isPending,
    deleteContact: deleteContactMutation.mutateAsync,
    isDeleting: deleteContactMutation.isPending,
  };
}

// ── Patient Identities Hook ──────────────────────────────────────────────────

export function usePatientIdentities(patientId?: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery<PatientIdentityDto[], ApiError>({
    queryKey: patientId ? PATIENT_INSURANCE_QUERY_KEYS.patientIdentities(patientId) : ['patients', 'identities', 'none'],
    queryFn: () => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.getIdentities(patientId);
    },
    enabled: typeof patientId === 'number' && patientId > 0,
  });

  const addIdentityMutation = useMutation<PatientIdentityDto, ApiError, CreatePatientIdentityInput>({
    mutationFn: (data) => {
      if (!patientId) throw new Error('Patient ID is required');
      return patientsApi.addIdentity(patientId, data);
    },
    onSuccess: () => {
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patientIdentities(patientId) });
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patient(patientId) });
      }
    },
  });

  return {
    identities: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addIdentity: addIdentityMutation.mutateAsync,
    isAdding: addIdentityMutation.isPending,
  };
}

// ── Insurance Providers Hook ─────────────────────────────────────────────────

export function useInsuranceProviders(status?: InsuranceProviderStatus) {
  const query = useQuery<InsuranceProviderDto[], ApiError>({
    queryKey: PATIENT_INSURANCE_QUERY_KEYS.providers(status),
    queryFn: () => insuranceApi.getProviders(status),
    staleTime: 60_000,
  });

  return {
    providers: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── Insurance Policies Hook ──────────────────────────────────────────────────

export function usePatientPolicies(patientId?: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery<InsurancePolicyDto[], ApiError>({
    queryKey: patientId ? PATIENT_INSURANCE_QUERY_KEYS.patientPolicies(patientId) : ['insurance', 'policies', 'none'],
    queryFn: () => {
      if (!patientId) throw new Error('Patient ID is required');
      return insuranceApi.getPatientPolicies(patientId);
    },
    enabled: typeof patientId === 'number' && patientId > 0,
  });

  const createPolicyMutation = useMutation<InsurancePolicyDto, ApiError, CreateInsurancePolicyInput>({
    mutationFn: (data) => insuranceApi.createPolicy(data),
    onSuccess: () => {
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patientPolicies(patientId) });
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patient(patientId) });
      }
      queryClient.invalidateQueries({ queryKey: ['insurance', 'policies'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });

  const updateStatusMutation = useMutation<
    InsurancePolicyDto,
    ApiError,
    { policyId: number; data: UpdatePolicyStatusInput }
  >({
    mutationFn: ({ policyId, data }) => insuranceApi.updatePolicyStatus(policyId, data),
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.policy(policyId) });
      if (patientId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.patientPolicies(patientId) });
      }
      queryClient.invalidateQueries({ queryKey: ['insurance', 'policies'] });
    },
  });

  return {
    policies: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createPolicy: createPolicyMutation.mutateAsync,
    isCreating: createPolicyMutation.isPending,
    createError: createPolicyMutation.error,
    updateStatus: updateStatusMutation.mutateAsync,
    isUpdatingStatus: updateStatusMutation.isPending,
  };
}

// ── Policy Coverages Hook ────────────────────────────────────────────────────

export function usePolicyCoverages(policyId?: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery<PolicyCoverageDto[], ApiError>({
    queryKey: policyId ? PATIENT_INSURANCE_QUERY_KEYS.policyCoverages(policyId) : ['insurance', 'coverages', 'none'],
    queryFn: () => {
      if (!policyId) throw new Error('Policy ID is required');
      return insuranceApi.getPolicyCoverages(policyId);
    },
    enabled: typeof policyId === 'number' && policyId > 0,
  });

  const addCoverageMutation = useMutation<
    PolicyCoverageDto,
    ApiError,
    AddPolicyCoverageInput
  >({
    mutationFn: (data) => {
      if (!policyId) throw new Error('Policy ID is required');
      return insuranceApi.addPolicyCoverage(policyId, data);
    },
    onSuccess: () => {
      if (policyId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.policyCoverages(policyId) });
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.policy(policyId) });
      }
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });

  const updateCoverageMutation = useMutation<
    PolicyCoverageDto,
    ApiError,
    UpdatePolicyCoverageInput
  >({
    mutationFn: (data) => {
      if (!policyId) throw new Error('Policy ID is required');
      return insuranceApi.updatePolicyCoverage(policyId, data);
    },
    onSuccess: () => {
      if (policyId) {
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.policyCoverages(policyId) });
        queryClient.invalidateQueries({ queryKey: PATIENT_INSURANCE_QUERY_KEYS.policy(policyId) });
      }
    },
  });

  return {
    coverages: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    addCoverage: addCoverageMutation.mutateAsync,
    isAdding: addCoverageMutation.isPending,
    updateCoverage: updateCoverageMutation.mutateAsync,
    isUpdating: updateCoverageMutation.isPending,
  };
}

// ── Treatment Catalogue Helper Hook ──────────────────────────────────────────

export function useTreatmentsCatalogue() {
  const query = useQuery<TreatmentCatalogueItemDto[], ApiError>({
    queryKey: PATIENT_INSURANCE_QUERY_KEYS.treatments(),
    queryFn: () => clinicalApi.getCatalogue({ isActive: true }),
    staleTime: 60_000,
  });

  return {
    treatments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

// ── Clinic Branches Helper Hook ──────────────────────────────────────────────

export function useClinicBranches() {
  const query = useQuery<BranchDto[], ApiError>({
    queryKey: PATIENT_INSURANCE_QUERY_KEYS.branches(),
    queryFn: () => staffApi.getBranches(),
    staleTime: 60_000,
  });

  return {
    branches: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}
