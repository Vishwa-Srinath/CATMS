/**
 * src/app/middleware/csrf.ts
 * Owner: Dev2 | Issue: CATMS-045
 *
 * CSRF protection middleware using csurf with HttpOnly cookie secrets.
 *
 * Rules (member_plan.md §9, CATMS-045 deliverables):
 *   - CSRF protection for cookie-authenticated state-changing requests.
 *   - CSRF token available via GET /api/v1/auth/csrf.
 *   - Missing or invalid CSRF token produces ErrorCode.CSRF_INVALID (403).
 */

import csurf from 'csurf';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../shared/env';
import { AUTH_COOKIE_NAME } from './auth';

/**
 * Low-level csurf protection middleware.
 */
export const csrfProtection = csurf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    sameSite: env.COOKIE_SAME_SITE,
    secure: env.COOKIE_SECURE,
  },
});

/**
 * cookieAuthCsrfProtection — enforces CSRF protection on state-changing requests
 * (POST, PUT, PATCH, DELETE) when authenticated via session cookie.
 */
export function cookieAuthCsrfProtection(req: Request, res: Response, next: NextFunction): void {
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const hasSessionCookie = Boolean(
    (req.cookies && req.cookies[AUTH_COOKIE_NAME]) ||
    (req.signedCookies && req.signedCookies[AUTH_COOKIE_NAME]),
  );

  if (isStateChanging && hasSessionCookie) {
    csrfProtection(req, res, next);
    return;
  }
  next();
}
