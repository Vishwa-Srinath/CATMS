/**
 * src/contracts/auth.contract.ts
 * Owner: Dev2 | Issue: CATMS-045
 *
 * TypeScript DTOs for authentication, session, and CSRF endpoints.
 *
 * Rules (CODEBASE_GUIDE.md §6):
 *   - Passwords and password hashes must never appear in response payloads.
 *   - JWT tokens are issued via HttpOnly cookies, not response body.
 */

export interface SessionUserDto {
  userId: number;
  employeeId: number;
  username: string;
  fullName: string;
  role: string;
  roleDisplayName: string;
  positionCode: string;
  branchId: number | 'all';
  branchCode: string | null;
  branchName: string | null;
}

export interface LoginResponse {
  user: SessionUserDto;
  csrfToken?: string;
}

export interface LogoutResponse {
  success: boolean;
  message: string;
}

export interface CsrfTokenResponse {
  csrfToken: string;
}

export interface SessionResponse {
  user: SessionUserDto;
  csrfToken?: string;
}
