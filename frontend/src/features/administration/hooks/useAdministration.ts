/**
 * src/features/administration/hooks/useAdministration.ts
 * Owner: Dev2 | Issue: CATMS-058
 *
 * TanStack Query hooks for Branch, Staff, Doctor, User Accounts, and Audit Trail administration.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  staffApi,
  type BranchDto,
  type CreateBranchInput,
  type UpdateBranchInput,
  type AssignBranchManagerInput,
  type EmployeeDto,
  type RegisterEmployeeInput,
  type AssignEmployeeBranchInput,
  type DeactivateEmployeeInput,
  type DoctorProfileDto,
  type RegisterDoctorInput,
  type SpecialtyDto,
  type AdminUserDto,
  type CreateAdminUserInput,
  type UpdateUserRoleInput,
  type AuditLogDto,
} from '../../../api/staff.api';
import { ApiError } from '../../../api/errors';

export const ADMIN_QUERY_KEYS = {
  branches: ['admin', 'branches'] as const,
  branch: (id: number) => ['admin', 'branches', id] as const,
  employees: (branchId?: number) => ['admin', 'employees', { branchId }] as const,
  employee: (id: number) => ['admin', 'employees', id] as const,
  doctors: ['admin', 'doctors'] as const,
  specialties: ['admin', 'specialties'] as const,
  users: ['admin', 'users'] as const,
  auditLogs: (limit?: number) => ['admin', 'audit-logs', { limit }] as const,
};

// ── Branches Hook ────────────────────────────────────────────────────────────
export function useBranches() {
  const queryClient = useQueryClient();

  const query = useQuery<BranchDto[], ApiError>({
    queryKey: ADMIN_QUERY_KEYS.branches,
    queryFn: () => staffApi.getBranches(),
    staleTime: 30_000,
  });

  const createMutation = useMutation<BranchDto, ApiError, CreateBranchInput>({
    mutationFn: (data) => staffApi.createBranch(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.branches });
    },
  });

  const updateMutation = useMutation<BranchDto, ApiError, { id: number; data: UpdateBranchInput }>({
    mutationFn: ({ id, data }) => staffApi.updateBranch(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.branches });
    },
  });

  const assignManagerMutation = useMutation<
    { assignmentId: number; branchId: number; employeeId: number },
    ApiError,
    { branchId: number; data: AssignBranchManagerInput }
  >({
    mutationFn: ({ branchId, data }) => staffApi.assignBranchManager(branchId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.branches });
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
    },
  });

  return {
    branches: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    createBranch: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    updateBranch: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,

    assignManager: assignManagerMutation.mutateAsync,
    isAssigningManager: assignManagerMutation.isPending,
    assignManagerError: assignManagerMutation.error,
  };
}

// ── Employees Hook ───────────────────────────────────────────────────────────
export function useEmployees(branchId?: number) {
  const queryClient = useQueryClient();

  const query = useQuery<EmployeeDto[], ApiError>({
    queryKey: ADMIN_QUERY_KEYS.employees(branchId),
    queryFn: () => staffApi.getEmployees(branchId !== undefined ? { branchId } : undefined),
    staleTime: 30_000,
  });

  const registerMutation = useMutation<
    { employeeId: number; userAccountId: number | null; assignmentId: number },
    ApiError,
    RegisterEmployeeInput
  >({
    mutationFn: (data) => staffApi.createEmployee(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.users });
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.doctors });
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.branches });
    },
  });

  const assignBranchMutation = useMutation<
    { assignmentId: number; employeeId: number; branchId: number },
    ApiError,
    { employeeId: number; data: AssignEmployeeBranchInput }
  >({
    mutationFn: ({ employeeId, data }) => staffApi.assignEmployeeBranch(employeeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.branches });
    },
  });

  const deactivateMutation = useMutation<
    { success: boolean; employeeId: number },
    ApiError,
    { employeeId: number; data?: DeactivateEmployeeInput }
  >({
    mutationFn: ({ employeeId, data }) => staffApi.deactivateEmployee(employeeId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.users });
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.doctors });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });

  return {
    employees: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    registerEmployee: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,

    assignBranch: assignBranchMutation.mutateAsync,
    isAssigningBranch: assignBranchMutation.isPending,
    assignBranchError: assignBranchMutation.error,

    deactivateEmployee: deactivateMutation.mutateAsync,
    isDeactivating: deactivateMutation.isPending,
    deactivateError: deactivateMutation.error,
  };
}

// ── Doctors Hook ─────────────────────────────────────────────────────────────
export function useDoctors() {
  const queryClient = useQueryClient();

  const query = useQuery<DoctorProfileDto[], ApiError>({
    queryKey: ADMIN_QUERY_KEYS.doctors,
    queryFn: () => staffApi.getDoctors(),
    staleTime: 30_000,
  });

  const registerMutation = useMutation<{ doctorId: number }, ApiError, RegisterDoctorInput>({
    mutationFn: (data) => staffApi.registerDoctor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.doctors });
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
    },
  });

  return {
    doctors: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    registerDoctor: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,
  };
}

// ── Specialties Hook ─────────────────────────────────────────────────────────
export function useSpecialties() {
  const query = useQuery<SpecialtyDto[], ApiError>({
    queryKey: ADMIN_QUERY_KEYS.specialties,
    queryFn: () => staffApi.getSpecialties(),
    staleTime: 60_000,
  });

  return {
    specialties: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── Admin User Accounts Hook ─────────────────────────────────────────────────
export function useAdminUsers() {
  const queryClient = useQueryClient();

  const query = useQuery<AdminUserDto[], ApiError>({
    queryKey: ADMIN_QUERY_KEYS.users,
    queryFn: () => staffApi.getAdminUsers(),
    staleTime: 30_000,
  });

  const createMutation = useMutation<AdminUserDto, ApiError, CreateAdminUserInput>({
    mutationFn: (data) => staffApi.createAdminUser(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.users });
      queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });

  const unlockMutation = useMutation<AdminUserDto, ApiError, number>({
    mutationFn: (userAccountId) => staffApi.unlockAdminUser(userAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.users });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });

  const updateRoleMutation = useMutation<
    AdminUserDto,
    ApiError,
    { userAccountId: number; data: UpdateUserRoleInput }
  >({
    mutationFn: ({ userAccountId, data }) => staffApi.updateAdminUserRole(userAccountId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_QUERY_KEYS.users });
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    },
  });

  return {
    users: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,

    createAdminUser: createMutation.mutateAsync,
    createUser: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    unlockUser: unlockMutation.mutateAsync,
    isUnlocking: unlockMutation.isPending,
    unlockError: unlockMutation.error,

    updateRole: updateRoleMutation.mutateAsync,
    isUpdatingRole: updateRoleMutation.isPending,
    updateRoleError: updateRoleMutation.error,
  };
}

// ── Audit Logs Hook ──────────────────────────────────────────────────────────
export function useAuditLogs(limit = 100) {
  const query = useQuery<AuditLogDto[], ApiError>({
    queryKey: ADMIN_QUERY_KEYS.auditLogs(limit),
    queryFn: () => staffApi.getAuditLogs({ limit }),
    staleTime: 15_000,
  });

  return {
    auditLogs: query.data ?? [],
    logs: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
