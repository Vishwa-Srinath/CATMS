/**
 * src/api/staff.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Staff, Branch and Administration API client.
 */

import { apiClient } from './client';

export interface BranchDto {
  branchId: number;
  branchCode: string;
  branchName: string;
  city: string;
  isActive: boolean;
  phone?: string;
}

export interface EmployeeDto {
  employeeId: number;
  employeeNo: string;
  firstName: string;
  lastName: string;
  role: string;
  branchId: number;
  isActive: boolean;
  email?: string;
  phone?: string;
}

export interface DoctorDto {
  doctorId: number;
  doctorNo: string;
  fullName: string;
  specialties: string[];
  isActive: boolean;
}

export interface SpecialtyDto {
  specialtyId: number;
  specialtyName: string;
}

export const staffApi = {
  getBranches: () =>
    apiClient.get<BranchDto[]>('/branches'),

  createBranch: (data: { branchCode: string; branchName: string; city: string; phone?: string }) =>
    apiClient.post<BranchDto>('/branches', data),

  getEmployees: (params?: { branchId?: number; role?: string; isActive?: boolean }) =>
    apiClient.get<EmployeeDto[]>('/employees', { params }),

  createEmployee: (data: {
    firstName: string;
    lastName: string;
    role: string;
    branchId: number;
    email?: string;
    phone?: string;
  }) => apiClient.post<EmployeeDto>('/employees', data),

  toggleEmployeeStatus: (employeeId: number, isActive: boolean) =>
    apiClient.patch<EmployeeDto>(`/employees/${employeeId}`, { isActive }),

  getDoctors: (params?: { branchId?: number; specialty?: string }) =>
    apiClient.get<DoctorDto[]>('/doctors', { params }),

  getSpecialties: () =>
    apiClient.get<SpecialtyDto[]>('/specialties'),

  createAdminUser: (data: { employeeId: number; username: string; password?: string }) =>
    apiClient.post<{ userId: number; username: string }>('/admin/users', data),
};
