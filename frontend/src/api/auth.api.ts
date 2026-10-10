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

  logout: async () => {
    try {
      return await apiClient.post<{ message: string }>('/auth/logout');
    } catch {
      return { message: 'Logged out' };
    }
  },

  getMe: async (options?: { skipSessionExpiry?: boolean }): Promise<SessionUserDto> => {
    const res = await apiClient.get<SessionUserDto | { user: SessionUserDto }>('/auth/me', {
      skipSessionExpiry: options?.skipSessionExpiry,
    });
    if (res && typeof res === 'object' && 'user' in res && (res as { user?: SessionUserDto }).user) {
      return (res as { user: SessionUserDto }).user;
    }
    return res as SessionUserDto;
  },

  getCsrf: () =>
    apiClient.get<CsrfTokenResponseDto>('/auth/csrf'),
};
