/**
 * src/modules/auth-staff/auth.routes.ts
 * Owner: Dev2 | Issue: CATMS-045
 *
 * Express router for authentication, session lifecycle, CSRF, and account logout.
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003):
 *   - POST /login: validates body with Zod, checks brute-force rate limit, issues HttpOnly cookie.
 *   - POST /logout: clears session cookie and logs audit event.
 *   - GET /me: returns current session payload.
 *   - GET /csrf: returns CSRF token for state-changing requests.
 *   - Passwords and tokens must NEVER appear in response body or logs.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { loginSchema } from './auth.schema';
import { authService } from './auth.service';
import {
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  extractToken,
  verifyToken,
} from '../../app/middleware/auth';
import { csrfProtection } from '../../app/middleware/csrf';
import { successEnvelope, errorEnvelope, ErrorCode } from '../../shared/errors';

export const authRouter = Router();

// ── Rate limiter for login endpoint (brute-force protection) ────────────────
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: process.env.NODE_ENV === 'test' ? 1000 : 10, // Max 10 attempts per minute per IP (relaxed in test)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: (_req, res) => {
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(429).json(
      errorEnvelope(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Too many login attempts. Please wait a minute and try again.',
        correlationId,
      ),
    );
  },
});

// ── GET /api/v1/auth/csrf — fetch CSRF token ────────────────────────────────
authRouter.get(
  '/csrf',
  csrfProtection,
  (req: Request, res: Response): void => {
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    const csrfToken = req.csrfToken ? req.csrfToken() : '';
    res.status(200).json(successEnvelope({ csrfToken }, correlationId));
  },
);

// ── POST /api/v1/auth/login — authenticate credentials & set JWT cookie ─────
authRouter.post(
  '/login',
  loginLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const validated = loginSchema.parse(req.body);

      const user = await authService.authenticate(
        validated.username,
        validated.password,
        correlationId,
        req.ip,
      );

      // Issue signed JWT token containing standard session claims
      const token = generateToken({
        userId: user.userId,
        employeeId: user.employeeId,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        fullName: user.fullName,
      });

      // Transmit token exclusively via HttpOnly cookie
      setAuthCookie(res, token);

      res.status(200).json(
        successEnvelope({ user }, correlationId),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/v1/auth/logout — clear session cookie and record audit ─────────
authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';

      // If user was logged in, log audit record
      const token = extractToken(req);
      if (token) {
        try {
          const decoded = verifyToken(token);
          await authService.logout(decoded.userId, correlationId, req.ip);
        } catch {
          // If token was expired/invalid, still proceed with clearing cookie
        }
      }

      clearAuthCookie(res);

      res.status(200).json(
        successEnvelope(
          { success: true, message: 'Logged out successfully.' },
          correlationId,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/v1/auth/me — return current authenticated session payload ───────
authRouter.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const currentUser = req.user!;

      // Verify account status remains active in the database
      const user = await authService.getMe(currentUser.userId);

      res.status(200).json(
        successEnvelope({ user }, correlationId),
      );
    } catch (err) {
      next(err);
    }
  },
);
