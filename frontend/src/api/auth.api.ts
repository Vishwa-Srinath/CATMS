/**
 * src/api/auth.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Authentication & session API client.
 */

import { apiClient } from './client';

export interface LoginRequest {
  username: string;
  password?: string;
  role?: string;
}

export interface SessionUserDto {
  userId: number;
  employeeId: number;
  username: string;
  role: string;
  roleDisplayName?: string;
  positionCode?: string;
  branchId: number | 'all';
  branchCode?: string | null;
  branchName?: string | null;
  fullName: string;
}

export interface LoginResponseDto {
  user: SessionUserDto;
}

export interface CsrfTokenResponseDto {
  csrfToken: string;
}

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<LoginResponseDto>('/auth/login', data),

  logout: () =>
    apiClient.post<{ message: string }>('/auth/logout'),

  getMe: () =>
    apiClient.get<SessionUserDto>('/auth/me'),

  getCsrf: () =>
    apiClient.get<CsrfTokenResponseDto>('/auth/csrf'),
};
