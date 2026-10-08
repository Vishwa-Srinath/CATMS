/**
 * src/contracts/staff.contract.ts
 * Owner: Dev2 | Issue: CATMS-046
 *
 * TypeScript DTOs for branches, employees, doctor profiles, specialties, and access administration.
 *
 * Rules (CODEBASE_GUIDE.md §6):
 *   - Maintained timestamps and server-controlled status must not be accepted from clients.
 *   - Standard success envelope wraps all responses: { data: ..., meta: { correlationId } }.
 */

export interface BranchDto {
  branchId: number;
  branchCode: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  district: string | null;
  postalCode: string | null;
  contactPhone: string;
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
  addressLine2?: string | null | undefined;
  city: string;
  district?: string | null | undefined;
  postalCode?: string | null | undefined;
  contactPhone: string;
  timeZone?: string | undefined;
}

export interface UpdateBranchInput {
  name?: string | undefined;
  addressLine1?: string | undefined;
  addressLine2?: string | null | undefined;
  city?: string | undefined;
  district?: string | null | undefined;
  postalCode?: string | null | undefined;
  contactPhone?: string | undefined;
  isActive?: boolean | undefined;
}

export interface AssignBranchManagerInput {
  employeeId: number;
  reason?: string | undefined;
  effectiveDate?: string | undefined;
}

export interface EmployeeDto {
  employeeId: number;
  employeeNumber: string;
  nic: string;
  fullName: string;
  genderCode: string;
  dateOfBirth: string;
  positionCode: string;
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
  email?: string | null | undefined;
  hireDate?: string | undefined;
  assignmentType?: 'PRIMARY' | 'SECONDARY' | undefined;
  username?: string | null | undefined;
  password?: string | null | undefined;
  roleCode?: string | null | undefined;
}

export interface AssignEmployeeBranchInput {
  branchId: number;
  assignmentType?: 'PRIMARY' | 'SECONDARY' | undefined;
  effectiveDate?: string | undefined;
}

export interface DeactivateEmployeeInput {
  reason?: string | undefined;
  effectiveDate?: string | undefined;
}

export interface RegisterDoctorInput {
  employeeId: number;
  medicalLicenseNo: string;
  practiceStartDate?: string | undefined;
  defaultConsultationFee?: number | null | undefined;
  specialtyIds?: number[] | undefined;
  primarySpecialtyId?: number | null | undefined;
}

export interface DoctorProfileDto {
  doctorId: number;
  employeeNumber: string;
  fullName: string;
  medicalLicenseNo: string;
  practiceStartDate: string;
  defaultConsultationFee: number | null;
  isAcceptingAppointments: boolean;
  specialties: Array<{
    specialtyId: number;
    name: string;
    isPrimary: boolean;
  }>;
}

export interface SpecialtyDto {
  specialtyId: number;
  specialtyCode: string;
  name: string;
  description: string | null;
  isActive: boolean;
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
  roles: Array<{
    roleCode: string;
    branchScopeId: number | null;
    branchCode: string | null;
  }>;
}

export interface CreateAdminUserInput {
  employeeId: number;
  username: string;
  password: string;
  roleCode: string;
  branchScopeId?: number | null | undefined;
}
