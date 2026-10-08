/**
 * src/app/middleware/auth.ts
 * Owner: Dev2 | Issue: CATMS-045
 *
 * Authentication, JWT session token management, and RBAC / branch guards.
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003):
 *   - JWT is transmitted primarily via signed/HttpOnly SameSite=Lax cookie.
 *   - Bearer authorization header supported as secondary fallback for API clients/tests.
 *   - requireAuth attaches req.user with role, employeeId, branchId.
 *   - requireRole rejects unauthorized roles with 403 Forbidden.
 *   - enforceBranchScope prevents cross-branch access for non-Admin/non-QA roles.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../shared/env';
import { AppError } from '../../shared/errors';

export const AUTH_COOKIE_NAME = 'catms_session';

export interface JwtPayload {
  userId: number;
  employeeId: number;
  username: string;
  role: string;
  branchId: number | 'all';
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Signs a JWT session token with standard lifetime.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * Verifies a JWT session token and returns decoded payload.
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

/**
 * Sets the HttpOnly JWT session cookie on an Express response.
 */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    maxAge: env.COOKIE_MAX_AGE_SECONDS * 1000,
    path: '/',
  });
}

/**
 * Clears the HttpOnly JWT session cookie.
 */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/',
  });
}

/**
 * Extracts the JWT token from either the session cookie or Authorization header.
 */
export function extractToken(req: Request): string | null {
  if (req.cookies && req.cookies[AUTH_COOKIE_NAME]) {
    return req.cookies[AUTH_COOKIE_NAME] as string;
  }
  if (req.signedCookies && req.signedCookies[AUTH_COOKIE_NAME]) {
    return req.signedCookies[AUTH_COOKIE_NAME] as string;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * requireAuth — verifies the user has a valid active JWT session.
 * Attaches decoded user claims to req.user.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    throw AppError.unauthenticated('Authentication required.');
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    throw AppError.unauthenticated('Invalid or expired session. Please log in again.');
  }
}

/**
 * requireRole — verifies that the authenticated user possesses one of the allowed roles.
 */
export function requireRole(...allowedRoles: string[]) {
  const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase().trim());

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw AppError.unauthenticated('Authentication required.');
    }

    const userRole = (req.user.role || '').toLowerCase().trim();
    if (!normalizedAllowed.includes(userRole)) {
      throw AppError.forbidden('Forbidden: You do not have permission to perform this action.');
    }

    next();
  };
}

/**
 * enforceBranchScope — enforces that single-branch roles can only access their assigned branch.
 * Admin and QA roles are clinic-wide and exempt from this restriction.
 */
export function enforceBranchScope(paramName = 'branchId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw AppError.unauthenticated('Authentication required.');
    }

    const role = (req.user.role || '').toLowerCase().trim();
    if (role === 'admin' || role === 'qa') {
      return next();
    }

    const targetBranch =
      req.params[paramName] ??
      req.query[paramName] ??
      (req.body && typeof req.body === 'object' ? req.body[paramName] : undefined);

    if (targetBranch !== undefined && targetBranch !== null && targetBranch !== '') {
      const userBranch = String(req.user.branchId);
      if (String(targetBranch) !== userBranch) {
        throw AppError.forbidden('Forbidden: You can only access data for your assigned clinic branch.');
      }
    }

    next();
  };
}
