/**
 * src/api/staff.api.ts
 * Owner: Dev2 | Issue: CATMS-058
 *
 * Staff, Branch, Doctor, User Accounts and Administration API client.
 */

import { apiClient } from './client';

// ── Branch Contracts ────────────────────────────────────────────────────────
export interface BranchDto {
  branchId: number;
  branchCode: string;
  name: string;
  branchName?: string; // compatibility alias
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  district: string | null;
  postalCode: string | null;
  contactPhone: string;
  phone?: string; // compatibility alias
  timeZone: string;
  isActive: boolean;
  manager: {
    employeeId: number;
    fullName: string;
  } | null;
}

export interface CreateBranchInput {
  branchCode: string;
  name: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  district?: string | null;
  postalCode?: string | null;
  contactPhone: string;
  timeZone?: string;
}

export interface UpdateBranchInput {
  name?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  city?: string;
  district?: string | null;
  postalCode?: string | null;
  contactPhone?: string;
  isActive?: boolean;
}

export interface AssignBranchManagerInput {
  employeeId: number;
  reason?: string;
  effectiveDate?: string;
}

// ── Employee Contracts ──────────────────────────────────────────────────────
export interface EmployeeDto {
  employeeId: number;
  employeeNumber: string;
  employeeNo?: string; // compatibility alias
  nic: string;
  fullName: string;
  genderCode: string;
  dateOfBirth: string;
  positionCode: string;
  role?: string; // compatibility alias
  employmentStatus: string;
  hireDate: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  branchId: number | null;
  branchName: string | null;
  userAccountId: number | null;
  username: string | null;
  roleCode: string | null;
  isDoctor: boolean;
}

export interface RegisterEmployeeInput {
  employeeNumber: string;
  nic: string;
  fullName: string;
  genderCode: string;
  dateOfBirth: string;
  positionCode: string;
  phone: string;
  branchId: number;
  email?: string | null;
  hireDate?: string;
  assignmentType?: 'PRIMARY' | 'SECONDARY';
  username?: string | null;
  password?: string | null;
  roleCode?: string | null;
}

export interface AssignEmployeeBranchInput {
  branchId: number;
  assignmentType?: 'PRIMARY' | 'SECONDARY';
  effectiveDate?: string;
}

export interface DeactivateEmployeeInput {
  reason?: string;
  effectiveDate?: string;
}

// ── Doctor & Specialty Contracts ────────────────────────────────────────────
export interface DoctorSpecialtyItem {
  specialtyId: number;
  name: string;
  isPrimary: boolean;
}

export interface DoctorProfileDto {
  doctorId: number;
  employeeNumber: string;
  fullName: string;
  medicalLicenseNo: string;
  practiceStartDate: string;
  defaultConsultationFee: number | null;
  isAcceptingAppointments: boolean;
  specialties: DoctorSpecialtyItem[];
}

export type DoctorDto = DoctorProfileDto;

export interface RegisterDoctorInput {
  employeeId: number;
  medicalLicenseNo: string;
  practiceStartDate?: string;
  defaultConsultationFee?: number | null;
  specialtyIds?: number[];
  primarySpecialtyId?: number | null;
}

export interface SpecialtyDto {
  specialtyId: number;
  specialtyCode: string;
  name: string;
  specialtyName?: string; // compatibility alias
  description: string | null;
  isActive: boolean;
}

// ── Admin User Contracts ────────────────────────────────────────────────────
export interface AdminUserRoleItem {
  roleCode: string;
  branchScopeId: number | null;
  branchCode: string | null;
}

export interface AdminUserDto {
  userAccountId: number;
  employeeId: number;
  employeeNumber: string;
  fullName: string;
  username: string;
  accountStatus: string;
  failedLoginCount: number;
  lastLoginAt: string | null;
  roles: AdminUserRoleItem[];
}

export interface CreateAdminUserInput {
  employeeId: number;
  username: string;
  password: string;
  roleCode: string;
  branchScopeId?: number | null;
}

export interface UpdateUserRoleInput {
  roleCode: string;
  branchScopeId?: number | null;
}

// ── Audit Log Contracts ─────────────────────────────────────────────────────
export interface AuditLogDto {
  auditEventId: number;
  actorUserId: number | null;
  actorUsername: string;
  actorName: string;
  entityType: string;
  entityId: string;
  actionCode: string;
  occurredAt: string;
  payload: unknown;
  clientIp: string | null;
}

// ── Staff API Client ────────────────────────────────────────────────────────
export const staffApi = {
  // Branches
  getBranches: () =>
    apiClient.get<BranchDto[]>('/branches'),

  getBranchById: (id: number) =>
    apiClient.get<BranchDto>(`/branches/${id}`),

  createBranch: (data: CreateBranchInput | { branchCode: string; branchName?: string; name?: string; city: string; phone?: string; addressLine1?: string; contactPhone?: string }) => {
    const payload: CreateBranchInput = {
      branchCode: data.branchCode,
      name: ('name' in data && data.name) ? data.name : (('branchName' in data && data.branchName) ? data.branchName : data.branchCode),
      addressLine1: ('addressLine1' in data && data.addressLine1) ? data.addressLine1 : `${data.city} Clinic Centre`,
      city: data.city,
      contactPhone: ('contactPhone' in data && data.contactPhone) ? data.contactPhone : (('phone' in data && data.phone) ? data.phone : '+94 11 000 0000'),
    };
    return apiClient.post<BranchDto>('/branches', payload);
  },

  updateBranch: (id: number, data: UpdateBranchInput) =>
    apiClient.put<BranchDto>(`/branches/${id}`, data),

  assignBranchManager: (branchId: number, data: AssignBranchManagerInput) =>
    apiClient.post<{ assignmentId: number; branchId: number; employeeId: number }>(`/branches/${branchId}/manager`, data),

  // Employees
  getEmployees: (params?: { branchId?: number }) =>
    apiClient.get<EmployeeDto[]>('/employees', { params }),

  getEmployeeById: (id: number) =>
    apiClient.get<EmployeeDto>(`/employees/${id}`),

  createEmployee: (data: RegisterEmployeeInput | {
    firstName: string;
    lastName: string;
    role: string;
    branchId: number;
    email?: string;
    phone?: string;
  }) => {
    let payload: RegisterEmployeeInput;
    if ('fullName' in data) {
      payload = data;
    } else {
      payload = {
        employeeNumber: `EMP-${Date.now().toString().slice(-4)}`,
        nic: `NIC-${Date.now().toString().slice(-9)}`,
        fullName: `${data.firstName} ${data.lastName}`.trim(),
        genderCode: 'Other',
        dateOfBirth: '1990-01-01',
        positionCode: data.role,
        phone: data.phone || '+94 77 000 0000',
        branchId: data.branchId,
        email: data.email || null,
      };
    }
    return apiClient.post<{ employeeId: number; userAccountId: number | null; assignmentId: number }>('/employees', payload);
  },

  registerEmployee: (data: RegisterEmployeeInput) =>
    staffApi.createEmployee(data),

  assignEmployeeBranch: (employeeId: number, data: AssignEmployeeBranchInput) =>
    apiClient.post<{ assignmentId: number; employeeId: number; branchId: number }>(`/employees/${employeeId}/assignments`, data),

  deactivateEmployee: (employeeId: number, data?: DeactivateEmployeeInput) =>
    apiClient.delete<{ success: boolean; employeeId: number }>(`/employees/${employeeId}`, data || {}),

  toggleEmployeeStatus: (employeeId: number) =>
    apiClient.delete<{ success: boolean; employeeId: number }>(`/employees/${employeeId}`, { reason: 'Status toggle' }),

  // Doctors & Specialties
  getDoctors: () =>
    apiClient.get<DoctorProfileDto[]>('/doctors'),

  registerDoctor: (data: RegisterDoctorInput) =>
    apiClient.post<{ doctorId: number }>('/doctors', data),

  getSpecialties: () =>
    apiClient.get<SpecialtyDto[]>('/specialties'),

  // Admin User Accounts
  getAdminUsers: () =>
    apiClient.get<AdminUserDto[]>('/admin/users'),

  createAdminUser: (data: CreateAdminUserInput) =>
    apiClient.post<AdminUserDto>('/admin/users', data),

  unlockAdminUser: (userAccountId: number) =>
    apiClient.patch<AdminUserDto>(`/admin/users/${userAccountId}/unlock`),

  updateAdminUserRole: (userAccountId: number, data: UpdateUserRoleInput) =>
    apiClient.put<AdminUserDto>(`/admin/users/${userAccountId}/role`, data),

  // Audit Logs
  getAuditLogs: (params?: { limit?: number }) =>
    apiClient.get<AuditLogDto[]>('/admin/audit-logs', { params }),
};
