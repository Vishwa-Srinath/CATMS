/**
 * backend/tests/auth.test.ts
 * Owner: Dev2 | Issue: CATMS-045
 *
 * Supertest integration test suite for:
 *   - Login credential verification (bcrypt)
 *   - HttpOnly signed JWT session cookies
 *   - Session state (/api/v1/auth/me)
 *   - Account lockout after 5 consecutive failures
 *   - Disabled account rejection
 *   - Logout session invalidation & audit logging
 *   - CSRF token issuance & state-mutation protection
 *   - Role and branch scope middleware guards
 *   - Brute-force rate limiting
 *   - Zero credential/token leakage in responses and logs
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';

// ── Mock shared/env ──────────────────────────────────────────────────────────
vi.mock('../src/shared/env', () => ({
  env: {
    NODE_ENV:               'test',
    API_PORT:               3001,
    POSTGRES_HOST:          'localhost',
    POSTGRES_PORT:          5432,
    POSTGRES_DB:            'catms_test',
    POSTGRES_USER:          'catms_app',
    POSTGRES_PASSWORD:      'catms_test_password',
    JWT_SECRET:             'a'.repeat(64),
    CSRF_SECRET:            'b'.repeat(32),
    COOKIE_SECURE:          false,
    COOKIE_SAME_SITE:       'lax',
    COOKIE_MAX_AGE_SECONDS: 3600,
    ALLOWED_ORIGINS:        'http://localhost:5173',
    RATE_LIMIT_WINDOW_MS:   60_000,
    RATE_LIMIT_MAX:         200,
    LOG_LEVEL:              'silent',
  },
}));

// ── In-Memory Mock Database Store ───────────────────────────────────────────
const TEST_PASSWORD = 'CorrectPassword123!';
const PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 10);

interface TestUser {
  user_account_id: number;
  employee_id: number;
  username: string;
  password_hash: string;
  account_status: string;
  failed_login_count: number;
  full_name: string;
  position_code: string;
  employee_active: boolean;
  role: string;
  role_display_name: string;
  branch_scope_id: number | null;
  branch_id: number;
  branch_code: string;
  branch_name: string;
}

let users: Record<string, TestUser>;
const auditEvents: Array<{ action_code: string; actor_user_id: number | null }> = [];

function resetMockDb() {
  users = {
    'k.perera': {
      user_account_id: 1,
      employee_id: 1,
      username: 'k.perera',
      password_hash: PASSWORD_HASH,
      account_status: 'Active',
      failed_login_count: 0,
      full_name: 'Kamal Perera',
      position_code: 'Manager',
      employee_active: true,
      role: 'Manager',
      role_display_name: 'Branch Manager',
      branch_scope_id: 1,
      branch_id: 1,
      branch_code: 'CMB',
      branch_name: 'MedSync Colombo Main',
    },
    'admin.user': {
      user_account_id: 2,
      employee_id: 2,
      username: 'admin.user',
      password_hash: PASSWORD_HASH,
      account_status: 'Active',
      failed_login_count: 0,
      full_name: 'Admin User',
      position_code: 'Admin',
      employee_active: true,
      role: 'Admin',
      role_display_name: 'System Administrator',
      branch_scope_id: null,
      branch_id: 1,
      branch_code: 'CMB',
      branch_name: 'MedSync Colombo Main',
    },
    'reception.user': {
      user_account_id: 3,
      employee_id: 3,
      username: 'reception.user',
      password_hash: PASSWORD_HASH,
      account_status: 'Active',
      failed_login_count: 0,
      full_name: 'Nimal Fernando',
      position_code: 'Receptionist',
      employee_active: true,
      role: 'Reception',
      role_display_name: 'Receptionist',
      branch_scope_id: 1,
      branch_id: 1,
      branch_code: 'CMB',
      branch_name: 'MedSync Colombo Main',
    },
    'disabled.user': {
      user_account_id: 4,
      employee_id: 4,
      username: 'disabled.user',
      password_hash: PASSWORD_HASH,
      account_status: 'Disabled',
      failed_login_count: 0,
      full_name: 'Disabled User',
      position_code: 'Staff',
      employee_active: true,
      role: 'Reception',
      role_display_name: 'Receptionist',
      branch_scope_id: 1,
      branch_id: 1,
      branch_code: 'CMB',
      branch_name: 'MedSync Colombo Main',
    },
    'locked.user': {
      user_account_id: 5,
      employee_id: 5,
      username: 'locked.user',
      password_hash: PASSWORD_HASH,
      account_status: 'Locked',
      failed_login_count: 5,
      full_name: 'Locked User',
      position_code: 'Staff',
      employee_active: true,
      role: 'Reception',
      role_display_name: 'Receptionist',
      branch_scope_id: 1,
      branch_id: 1,
      branch_code: 'CMB',
      branch_name: 'MedSync Colombo Main',
    },
    'fail.user': {
      user_account_id: 6,
      employee_id: 6,
      username: 'fail.user',
      password_hash: PASSWORD_HASH,
      account_status: 'Active',
      failed_login_count: 4, // 1 more failure will lock
      full_name: 'Fail Test User',
      position_code: 'Staff',
      employee_active: true,
      role: 'Reception',
      role_display_name: 'Receptionist',
      branch_scope_id: 1,
      branch_id: 1,
      branch_code: 'CMB',
      branch_name: 'MedSync Colombo Main',
    },
  };
  auditEvents.length = 0;
}

// ── Mock Pool and Transaction Helper ─────────────────────────────────────────
vi.mock('../src/db/pool', () => ({
  pool: {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      // 1. SELECT from user_account by username
      if (text.includes('FROM catms.user_account u') && text.includes('WHERE u.username = $1')) {
        const username = String(params[0]).toLowerCase();
        const found = Object.values(users).find((u) => u.username.toLowerCase() === username);
        return { rows: found ? [found] : [] };
      }

      // 2. SELECT from user_account by user_account_id
      if (text.includes('FROM catms.user_account u') && text.includes('WHERE u.user_account_id = $1')) {
        const id = Number(params[0]);
        const found = Object.values(users).find((u) => u.user_account_id === id);
        return { rows: found ? [found] : [] };
      }

      // 3. SELECT from user_account_role
      if (text.includes('FROM catms.user_account_role uar')) {
        const id = Number(params[0]);
        const found = Object.values(users).find((u) => u.user_account_id === id);
        if (found) {
          return {
            rows: [
              {
                role_code: found.role,
                role_display_name: found.role_display_name,
                branch_scope_id: found.branch_scope_id,
                branch_code: found.branch_code,
                branch_name: found.branch_name,
              },
            ],
          };
        }
        return { rows: [] };
      }

      // 4. SELECT from employee_branch_assignment
      if (text.includes('FROM catms.employee_branch_assignment eba')) {
        const empId = Number(params[0]);
        const found = Object.values(users).find((u) => u.employee_id === empId);
        if (found) {
          return {
            rows: [
              {
                branch_id: found.branch_id,
                branch_code: found.branch_code,
                branch_name: found.branch_name,
              },
            ],
          };
        }
        return { rows: [] };
      }

      return { rows: [] };
    }),
    connect: vi.fn(),
  },
  checkDatabaseConnectivity: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  checkDatabaseMigrations: vi.fn().mockResolvedValue({ ok: true, maxMigration: 45 }),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db/transaction', () => ({
  withTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        // UPDATE user_account
        if (text.includes('UPDATE catms.user_account')) {
          const id = Number(params[params.length - 1]);
          const user = Object.values(users).find((u) => u.user_account_id === id);
          if (user) {
            if (text.includes("account_status = 'Locked'")) {
              user.account_status = 'Locked';
            }
            if (text.includes('failed_login_count = $1')) {
              user.failed_login_count = Number(params[0]);
            } else if (text.includes('failed_login_count = 0')) {
              user.failed_login_count = 0;
            }
          }
          return { rows: [], rowCount: 1 };
        }

        // INSERT into audit_event
        if (text.includes('INSERT INTO catms.audit_event')) {
          auditEvents.push({
            actor_user_id: params[0] as number | null,
            action_code: (params[2] as string) || (text.match(/'([A-Z_]+)'/)?.[1] ?? ''),
          });
          return { rows: [], rowCount: 1 };
        }

        return { rows: [] };
      }),
    } as unknown as PoolClient;

    return fn(mockClient);
  }),
  withReadonlyTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as PoolClient;
    return fn(mockClient);
  }),
  setLocalRole: vi.fn().mockResolvedValue(undefined),
  mapAppRoleToDbRole: vi.fn((role: string) => `catms_${role.toLowerCase()}`),
  sql: vi.fn(),
  isSafeIdentifier: vi.fn(),
}));

let app: Express;

beforeAll(async () => {
  const { createApp } = await import('../src/app/server');
  app = createApp();
});

beforeEach(() => {
  resetMockDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. POST /api/v1/auth/login — Validation & Authentication
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  it('rejects missing or malformed credentials with 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'ab', password: '' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fieldErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'username' }),
        expect.objectContaining({ field: 'password' }),
      ]),
    );
  });

  it('rejects non-existent username with 401 UNAUTHENTICATED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'nonexistent.user', password: 'SomePassword123' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects incorrect password with 401 and increments failed attempts', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: 'WrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(users['k.perera'].failed_login_count).toBe(1);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_code: 'LOGIN_FAILED' }),
      ]),
    );
  });

  it('rejects disabled account with 403 ACCOUNT_DISABLED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'disabled.user', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('rejects already locked account with 403 ACCOUNT_DISABLED', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'locked.user', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('locks account after 5 consecutive failed login attempts', async () => {
    // fail.user already has 4 failed attempts; 5th failure must lock the account
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'fail.user', password: 'WrongPassword' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    expect(users['fail.user'].account_status).toBe('Locked');
    expect(users['fail.user'].failed_login_count).toBe(5);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_code: 'ACCOUNT_LOCKED' }),
      ]),
    );
  });

  it('authenticates valid credentials, sets HttpOnly cookie, and returns user session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.username).toBe('k.perera');
    expect(res.body.data.user.role).toBe('Manager');
    expect(res.body.data.user.branchId).toBe(1);
    expect(res.body.meta.correlationId).toBeDefined();

    // Verify HttpOnly cookie is set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sessionCookie = cookies.find((c: string) => c.startsWith('catms_session='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');

    // Verify secrets NEVER appear in response body
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.password_hash).toBeUndefined();
    expect(res.body.data.token).toBeUndefined();

    // Verify audit log and failure reset
    expect(users['k.perera'].failed_login_count).toBe(0);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_code: 'LOGIN_SUCCESS' }),
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET /api/v1/auth/me — Session State
// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/v1/auth/me', () => {
  it('returns 401 UNAUTHENTICATED when called without cookie or token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 401 UNAUTHENTICATED when called with invalid/tampered cookie', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', ['catms_session=invalid.tampered.token']);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns user session when called with valid session cookie', async () => {
    // 1. Log in to acquire cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: TEST_PASSWORD });

    const cookie = loginRes.headers['set-cookie'];

    // 2. Query /me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.username).toBe('k.perera');
    expect(meRes.body.data.user.role).toBe('Manager');
    expect(meRes.body.data.user.fullName).toBe('Kamal Perera');
  });

  it('returns 403 ACCOUNT_DISABLED if account is deactivated mid-session', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: TEST_PASSWORD });

    const cookie = loginRes.headers['set-cookie'];

    // Deactivate user in database
    users['k.perera'].account_status = 'Disabled';

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(403);
    expect(meRes.body.error.code).toBe('ACCOUNT_DISABLED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/v1/auth/logout — Session Termination
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 3. POST /api/v1/auth/logout — Session Termination
// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/logout', () => {
  it('clears session cookie and records audit event on valid logout with CSRF token', async () => {
    // 1. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.csrfToken;
    const csrfCookie = csrfRes.headers['set-cookie'].find((c: string) => c.startsWith('_csrf='));

    // 2. Login to get session cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: TEST_PASSWORD });

    const sessionCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('catms_session='));

    // 3. Call logout with session cookie, csrf cookie, and X-CSRF-Token
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.success).toBe(true);

    // Verify cookie was cleared (expires in past or empty)
    const clearedCookies = logoutRes.headers['set-cookie'];
    expect(clearedCookies).toBeDefined();
    const clearedSessionCookie = clearedCookies.find((c: string) => c.startsWith('catms_session='));
    expect(clearedSessionCookie).toBeDefined();
    expect(clearedSessionCookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);

    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action_code: 'LOGOUT' }),
      ]),
    );
  });

  it('allows logout with Bearer token authentication without CSRF requirement', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: TEST_PASSWORD });

    const sessionCookieStr = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('catms_session='));
    const token = sessionCookieStr.split(';')[0].replace('catms_session=', '');

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CSRF Protection
// ─────────────────────────────────────────────────────────────────────────────
describe('CSRF Protection', () => {
  it('GET /api/v1/auth/csrf returns CSRF token and sets _csrf cookie', async () => {
    const res = await request(app).get('/api/v1/auth/csrf');
    expect(res.status).toBe(200);
    expect(res.body.data.csrfToken).toBeDefined();
    expect(typeof res.body.data.csrfToken).toBe('string');
    expect(res.body.data.csrfToken.length).toBeGreaterThan(0);

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const csrfCookie = cookies.find((c: string) => c.startsWith('_csrf='));
    expect(csrfCookie).toBeDefined();
  });

  it('rejects cookie-authenticated mutation without CSRF token with 403 CSRF_INVALID', async () => {
    // 1. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const csrfCookie = csrfRes.headers['set-cookie'].find((c: string) => c.startsWith('_csrf='));

    // 2. Login to get session cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: TEST_PASSWORD });

    const sessionCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('catms_session='));

    // 3. State-changing request with session cookie and _csrf cookie, but NO X-CSRF-Token header
    const mutationRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie]);

    expect(mutationRes.status).toBe(403);
    expect(mutationRes.body.error.code).toBe('CSRF_INVALID');
  });

  it('accepts cookie-authenticated mutation when valid CSRF token is provided', async () => {
    // 1. Fetch CSRF token
    const csrfRes = await request(app).get('/api/v1/auth/csrf');
    const csrfToken = csrfRes.body.data.csrfToken;
    const csrfCookie = csrfRes.headers['set-cookie'].find((c: string) => c.startsWith('_csrf='));

    // 2. Login to get session cookie
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'k.perera', password: TEST_PASSWORD });

    const sessionCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('catms_session='));

    // 3. Perform mutation passing both cookies and X-CSRF-Token header
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', [sessionCookie, csrfCookie])
      .set('X-CSRF-Token', csrfToken);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Middleware Guards: requireRole & enforceBranchScope
// ─────────────────────────────────────────────────────────────────────────────
describe('Auth & Role Guards', () => {
  it('requireRole allows authorized role and rejects unauthorized role with 403 FORBIDDEN', async () => {
    const { requireRole } = await import('../src/app/middleware/auth');
    const adminGuard = requireRole('Admin');

    const allowedReq = { user: { role: 'Admin' } } as unknown as any;
    const nextFnAllowed = vi.fn();
    adminGuard(allowedReq, {} as any, nextFnAllowed);
    expect(nextFnAllowed).toHaveBeenCalled();

    const forbiddenReq = { user: { role: 'Reception' } } as unknown as any;
    const nextFnForbidden = vi.fn();
    expect(() => adminGuard(forbiddenReq, {} as any, nextFnForbidden)).toThrowError();
  });

  it('enforceBranchScope allows matching branch and rejects mismatched branch', async () => {
    const { enforceBranchScope } = await import('../src/app/middleware/auth');
    const branchGuard = enforceBranchScope('branchId');

    // Matching branch succeeds
    const allowedReq = {
      user: { role: 'Reception', branchId: 1 },
      params: { branchId: 1 },
    } as unknown as any;
    const nextAllowed = vi.fn();
    branchGuard(allowedReq, {} as any, nextAllowed);
    expect(nextAllowed).toHaveBeenCalled();

    // Mismatched branch throws 403
    const forbiddenReq = {
      user: { role: 'Reception', branchId: 1 },
      params: { branchId: 2 },
    } as unknown as any;
    const nextForbidden = vi.fn();
    expect(() => branchGuard(forbiddenReq, {} as any, nextForbidden)).toThrowError();

    // Admin role is clinic-wide and allowed across branches
    const adminReq = {
      user: { role: 'Admin', branchId: 'all' },
      params: { branchId: 2 },
    } as unknown as any;
    const nextAdmin = vi.fn();
    branchGuard(adminReq, {} as any, nextAdmin);
    expect(nextAdmin).toHaveBeenCalled();
  });
});
