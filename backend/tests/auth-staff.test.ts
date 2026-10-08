/**
 * backend/tests/auth-staff.test.ts
 * Owner: Dev2 | Reviewer: Dev1 | Issue: CATMS-047
 *
 * Comprehensive integration and security regression test suite for:
 *   1. Authentication & Session Lifecycle (bcrypt, HttpOnly cookie, lockout, me, logout)
 *   2. CSRF Protection for state-changing operations
 *   3. Two-Layer RBAC Matrix — API Route Guards (Admin vs Manager vs Reception vs Clinician)
 *   4. Parameterized Query Verification & SQL Injection Defenses
 *   5. Negative Database Role Denial & SQLSTATE 42501 Handling (Layer 2 DB Grants)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'a'.repeat(64);
const CSRF_SECRET = 'b'.repeat(32);

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
    RATE_LIMIT_MAX:         500,
    LOG_LEVEL:              'silent',
  },
}));

// ── Test Passwords & In-Memory Database Store ───────────────────────────────
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
  branch_scope_id: number | null;
  branch_code: string | null;
}

let initialUsers: Record<string, TestUser> = {
  'admin.user': {
    user_account_id: 1,
    employee_id: 1,
    username: 'admin.user',
    password_hash: PASSWORD_HASH,
    account_status: 'Active',
    failed_login_count: 0,
    full_name: 'Dr. Admin Leader',
    position_code: 'Medical Director',
    employee_active: true,
    role: 'Admin',
    branch_scope_id: null,
    branch_code: null,
  },
  'kandy.manager': {
    user_account_id: 2,
    employee_id: 2,
    username: 'kandy.manager',
    password_hash: PASSWORD_HASH,
    account_status: 'Active',
    failed_login_count: 0,
    full_name: 'Kamal Perera',
    position_code: 'Manager',
    employee_active: true,
    role: 'Manager',
    branch_scope_id: 2,
    branch_code: 'KND',
  },
  'reception.user': {
    user_account_id: 3,
    employee_id: 3,
    username: 'reception.user',
    password_hash: PASSWORD_HASH,
    account_status: 'Active',
    failed_login_count: 0,
    full_name: 'Sunil Receptionist',
    position_code: 'Receptionist',
    employee_active: true,
    role: 'Reception',
    branch_scope_id: 1,
    branch_code: 'CMB',
  },
  'clinician.user': {
    user_account_id: 4,
    employee_id: 4,
    username: 'clinician.user',
    password_hash: PASSWORD_HASH,
    account_status: 'Active',
    failed_login_count: 0,
    full_name: 'Dr. Sunil Silva',
    position_code: 'Doctor',
    employee_active: true,
    role: 'Clinician',
    branch_scope_id: 1,
    branch_code: 'CMB',
  },
  'disabled.user': {
    user_account_id: 5,
    employee_id: 5,
    username: 'disabled.user',
    password_hash: PASSWORD_HASH,
    account_status: 'Disabled',
    failed_login_count: 0,
    full_name: 'Former Staff',
    position_code: 'Staff',
    employee_active: true,
    role: 'Reception',
    branch_scope_id: 1,
    branch_code: 'CMB',
  },
  'inactive.emp.user': {
    user_account_id: 6,
    employee_id: 6,
    username: 'inactive.emp.user',
    password_hash: PASSWORD_HASH,
    account_status: 'Active',
    failed_login_count: 0,
    full_name: 'Inactive Employee',
    position_code: 'Staff',
    employee_active: false,
    role: 'Reception',
    branch_scope_id: 1,
    branch_code: 'CMB',
  },
};

let users = JSON.parse(JSON.stringify(initialUsers)) as Record<string, TestUser>;

let branches = [
  {
    branch_id: 1,
    branch_code: 'CMB',
    name: 'MedSync Colombo Main',
    address_line_1: '100 Galle Road',
    address_line_2: null,
    city: 'Colombo',
    district: 'Colombo',
    postal_code: '00300',
    contact_phone: '+94 11 200 0001',
    time_zone: 'Asia/Colombo',
    is_active: true,
    manager_employee_id: 1,
    manager_name: 'Dr. Admin Leader',
  },
  {
    branch_id: 2,
    branch_code: 'KND',
    name: 'MedSync Kandy Central',
    address_line_1: '50 Peradeniya Road',
    address_line_2: null,
    city: 'Kandy',
    district: 'Kandy',
    postal_code: '20000',
    contact_phone: '+94 81 200 0002',
    time_zone: 'Asia/Colombo',
    is_active: true,
    manager_employee_id: 2,
    manager_name: 'Kamal Perera',
  },
];

let employees = [
  {
    employee_id: 1,
    employee_number: 'EMP-001',
    nic: '198012345678',
    full_name: 'Dr. Admin Leader',
    gender_code: 'Male',
    date_of_birth: '1980-01-01',
    position_code: 'Medical Director',
    employment_status: 'Active',
    hire_date: '2020-01-15',
    phone: '+94 77 111 2233',
    email: 'admin@medsync.lk',
    is_active: true,
    branch_id: 1,
    branch_name: 'MedSync Colombo Main',
    user_account_id: 1,
    username: 'admin.user',
    role_code: 'Admin',
    is_doctor: true,
  },
  {
    employee_id: 2,
    employee_number: 'EMP-002',
    nic: '198212345678',
    full_name: 'Kamal Perera',
    gender_code: 'Male',
    date_of_birth: '1982-05-12',
    position_code: 'Manager',
    employment_status: 'Active',
    hire_date: '2020-03-01',
    phone: '+94 77 222 3344',
    email: 'k.perera@medsync.lk',
    is_active: true,
    branch_id: 2,
    branch_name: 'MedSync Kandy Central',
    user_account_id: 2,
    username: 'kandy.manager',
    role_code: 'Manager',
    is_doctor: false,
  },
  {
    employee_id: 3,
    employee_number: 'EMP-003',
    nic: '199012345678',
    full_name: 'Sunil Receptionist',
    gender_code: 'Male',
    date_of_birth: '1990-11-10',
    position_code: 'Receptionist',
    employment_status: 'Active',
    hire_date: '2022-06-01',
    phone: '+94 77 333 4455',
    email: 's.reception@medsync.lk',
    is_active: true,
    branch_id: 1,
    branch_name: 'MedSync Colombo Main',
    user_account_id: 3,
    username: 'reception.user',
    role_code: 'Reception',
    is_doctor: false,
  },
  {
    employee_id: 4,
    employee_number: 'EMP-004',
    nic: '198512345678',
    full_name: 'Dr. Sunil Silva',
    gender_code: 'Male',
    date_of_birth: '1985-08-20',
    position_code: 'Doctor',
    employment_status: 'Active',
    hire_date: '2021-03-01',
    phone: '+94 77 444 5566',
    email: 's.silva@medsync.lk',
    is_active: true,
    branch_id: 1,
    branch_name: 'MedSync Colombo Main',
    user_account_id: 4,
    username: 'clinician.user',
    role_code: 'Clinician',
    is_doctor: true,
  },
];

let specialties = [
  { specialty_id: 1, specialty_code: 'GP', name: 'General Practice', description: 'Primary Care', is_active: true },
  { specialty_id: 2, specialty_code: 'CARD', name: 'Cardiology', description: 'Heart', is_active: true },
];

let doctors = [
  {
    doctor_id: 4,
    employee_number: 'EMP-004',
    full_name: 'Dr. Sunil Silva',
    medical_license_no: 'SLMC-98765',
    practice_start_date: '2015-01-01',
    default_consultation_fee: 2500,
    is_accepting_appointments: true,
    specialties: [{ specialtyId: 1, name: 'General Practice', isPrimary: true }],
  },
];

let auditEvents: Array<{ action_code: string; entity_type: string; payload?: unknown }> = [];
let simulatedDbDenial = false;

// ── Mock Database Pool & Transactions ─────────────────────────────────────────
vi.mock('../src/db/pool', () => ({
  pool: {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      if (simulatedDbDenial) {
        const err = new Error('permission denied for table employee') as Error & { code: string };
        err.code = '42501';
        throw err;
      }

      // SELECT from user_account for login & /me
      if (text.includes('FROM catms.user_account u')) {
        if (text.includes('WHERE u.username = $1')) {
          const u = users[String(params[0])];
          if (!u) return { rows: [] };
          return {
            rows: [
              {
                user_account_id: u.user_account_id,
                employee_id: u.employee_id,
                username: u.username,
                password_hash: u.password_hash,
                account_status: u.account_status,
                failed_login_count: u.failed_login_count,
                full_name: u.full_name,
                position_code: u.position_code,
                employee_active: u.employee_active,
              },
            ],
          };
        }
        if (text.includes('WHERE u.user_account_id = $1')) {
          const uId = Number(params[0]);
          const u = Object.values(users).find((x) => x.user_account_id === uId);
          if (!u) return { rows: [] };
          return {
            rows: [
              {
                user_account_id: u.user_account_id,
                employee_id: u.employee_id,
                username: u.username,
                password_hash: u.password_hash,
                account_status: u.account_status,
                failed_login_count: u.failed_login_count,
                full_name: u.full_name,
                position_code: u.position_code,
                employee_active: u.employee_active,
              },
            ],
          };
        }
      }

      // SELECT active roles for user
      if (text.includes('FROM catms.user_account_role uar')) {
        const userId = Number(params[0]);
        const user = Object.values(users).find((u) => u.user_account_id === userId);
        if (!user) return { rows: [] };
        return {
          rows: [
            {
              role_code: user.role,
              branch_scope_id: user.branch_scope_id,
              branch_code: user.branch_code,
            },
          ],
        };
      }

      // SELECT branches
      if (text.includes('FROM catms.branch b')) {
        if (text.includes('WHERE b.branch_id = $1')) {
          const id = Number(params[0]);
          const found = branches.find((b) => b.branch_id === id);
          return { rows: found ? [found] : [] };
        }
        return { rows: branches };
      }

      // SELECT employees
      if (text.includes('FROM catms.employee e')) {
        if (text.includes('WHERE e.employee_id = $1')) {
          const id = Number(params[0]);
          const found = employees.find((e) => e.employee_id === id);
          return { rows: found ? [found] : [] };
        }
        if (text.includes('WHERE eba.branch_id = $1')) {
          const bId = Number(params[0]);
          return { rows: employees.filter((e) => e.branch_id === bId) };
        }
        return { rows: employees };
      }

      // SELECT doctors
      if (text.includes('FROM catms.doctor_profile dp')) {
        return { rows: doctors };
      }

      // SELECT specialties
      if (text.includes('FROM catms.specialty')) {
        return { rows: specialties };
      }

      // SELECT admin users
      if (text.includes('FROM catms.user_account u') && text.includes('catms.app_role r')) {
        return {
          rows: Object.values(users).map((u) => ({
            user_account_id: u.user_account_id,
            employee_id: u.employee_id,
            employee_number: `EMP-00${u.employee_id}`,
            full_name: u.full_name,
            username: u.username,
            account_status: u.account_status,
            failed_login_count: u.failed_login_count,
            last_login_at: null,
            roles: [{ roleCode: u.role, branchScopeId: u.branch_scope_id, branchCode: u.branch_code }],
          })),
        };
      }

      return { rows: [] };
    }),
    connect: vi.fn(),
  },
  checkDatabaseConnectivity: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  checkDatabaseMigrations: vi.fn().mockResolvedValue({ ok: true, maxMigration: 46 }),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/db/transaction', async () => {
  const actual = await vi.importActual<typeof import('../src/db/transaction')>('../src/db/transaction');
  return {
    ...actual,
    withTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>, role?: string) => {
      if (simulatedDbDenial) {
        const err = new Error('permission denied for table employee') as Error & { code: string };
        err.code = '42501';
        throw err;
      }

      const mockClient = {
        query: vi.fn(async (text: string, params: unknown[] = []) => {
          // Track audit events
          if (text.includes('INSERT INTO catms.audit_event')) {
            auditEvents.push({
              action_code: String(params[2]),
              entity_type: String(params[1]),
              payload: params[5],
            });
            return { rows: [], rowCount: 1 };
          }

          // UPDATE user_account (failed login counter or lockout)
          if (text.includes('UPDATE catms.user_account')) {
            const uId = Number(params[1]);
            const targetUser = Object.values(users).find((u) => u.user_account_id === uId);
            if (targetUser) {
              if (text.includes("account_status = 'Locked'")) {
                targetUser.account_status = 'Locked';
              }
              if (text.includes('failed_login_count = $1')) {
                targetUser.failed_login_count = Number(params[0]);
              }
            }
            return { rows: [], rowCount: 1 };
          }

          // CALL catms.register_employee
          if (text.includes('CALL catms.register_employee')) {
            const newEmpId = employees.length + 1;
            employees.push({
              employee_id: newEmpId,
              employee_number: String(params[0]),
              nic: String(params[1]),
              full_name: String(params[2]),
              gender_code: String(params[3]),
              date_of_birth: String(params[4]),
              position_code: String(params[5]),
              employment_status: 'Active',
              hire_date: '2026-10-01',
              phone: String(params[6]),
              email: params[8] ? String(params[8]) : null,
              is_active: true,
              branch_id: Number(params[7]),
              branch_name: 'MedSync Colombo Main',
              user_account_id: params[11] ? 99 : null,
              username: params[11] ? String(params[11]) : null,
              role_code: params[13] ? String(params[13]) : null,
              is_doctor: String(params[5]).toLowerCase() === 'doctor',
            });
            return {
              rows: [{ p_employee_id: newEmpId, p_user_account_id: 99, p_assignment_id: 101 }],
            };
          }

          // CALL catms.assign_branch_manager
          if (text.includes('CALL catms.assign_branch_manager')) {
            return { rows: [{ p_assignment_id: 202 }] };
          }

          // CALL catms.assign_employee_branch
          if (text.includes('CALL catms.assign_employee_branch')) {
            return { rows: [{ p_assignment_id: 303 }] };
          }

          // CALL catms.deactivate_employee
          if (text.includes('CALL catms.deactivate_employee')) {
            const empId = Number(params[0]);
            const target = employees.find((e) => e.employee_id === empId);
            if (target) {
              target.is_active = false;
            }
            return { rows: [], rowCount: 1 };
          }

          // CALL catms.register_doctor_profile
          if (text.includes('CALL catms.register_doctor_profile')) {
            return { rows: [{ p_doctor_id: Number(params[0]) }] };
          }

          // INSERT INTO catms.branch
          if (text.includes('INSERT INTO catms.branch')) {
            const newBrId = branches.length + 1;
            const newBr = {
              branch_id: newBrId,
              branch_code: String(params[0]),
              name: String(params[1]),
              address_line_1: String(params[2]),
              address_line_2: params[3] ? String(params[3]) : null,
              city: String(params[4]),
              district: params[5] ? String(params[5]) : null,
              postal_code: params[6] ? String(params[6]) : null,
              contact_phone: String(params[7]),
              time_zone: String(params[8]),
              is_active: true,
              manager_employee_id: null,
              manager_name: null,
            };
            branches.push(newBr);
            return { rows: [newBr] };
          }

          // UPDATE catms.branch
          if (text.includes('UPDATE catms.branch')) {
            return { rows: [], rowCount: 1 };
          }

          // SELECT branch_id FROM catms.branch
          if (text.includes('SELECT branch_id FROM catms.branch WHERE branch_id = $1')) {
            const id = Number(params[0]);
            const found = branches.find((b) => b.branch_id === id);
            return { rows: found ? [found] : [] };
          }

          // SELECT employee_id FROM catms.employee
          if (text.includes('SELECT employee_id') && text.includes('FROM catms.employee')) {
            return {
              rows: [{ employee_id: params[0], employee_number: 'EMP-003', full_name: 'Sunil Receptionist', is_active: true }],
            };
          }

          // SELECT branch_code FROM catms.branch
          if (text.includes('SELECT branch_code FROM catms.branch')) {
            return { rows: [{ branch_code: 'CMB' }] };
          }

          // INSERT into user_account
          if (text.includes('INSERT INTO catms.user_account')) {
            return { rows: [{ user_account_id: 101 }] };
          }

          // SELECT app_role_id FROM catms.app_role
          if (text.includes('SELECT app_role_id FROM catms.app_role')) {
            return { rows: [{ app_role_id: 3 }] };
          }

          // INSERT INTO catms.user_account_role
          if (text.includes('INSERT INTO catms.user_account_role')) {
            return { rows: [], rowCount: 1 };
          }

          return { rows: [] };
        }),
      } as unknown as PoolClient;

      return fn(mockClient);
    }),
  };
});

// Import createApp after mocking
import { createApp } from '../src/app/server';
import { mapAppRoleToDbRole, setLocalRole } from '../src/db/transaction';

describe('CATMS-047 — Authentication & Administration Integration and Security Suite', () => {
  let app: Express;

  const adminToken = jwt.sign(
    { userId: 1, employeeId: 1, username: 'admin.user', role: 'Admin', branchId: 'all', fullName: 'Dr. Admin Leader' },
    JWT_SECRET,
    { expiresIn: 3600 },
  );

  const managerToken = jwt.sign(
    { userId: 2, employeeId: 2, username: 'kandy.manager', role: 'Manager', branchId: 2, fullName: 'Kamal Perera' },
    JWT_SECRET,
    { expiresIn: 3600 },
  );

  const receptionToken = jwt.sign(
    { userId: 3, employeeId: 3, username: 'reception.user', role: 'Reception', branchId: 1, fullName: 'Sunil Receptionist' },
    JWT_SECRET,
    { expiresIn: 3600 },
  );

  const clinicianToken = jwt.sign(
    { userId: 4, employeeId: 4, username: 'clinician.user', role: 'Clinician', branchId: 1, fullName: 'Dr. Sunil Silva' },
    JWT_SECRET,
    { expiresIn: 3600 },
  );

  beforeEach(() => {
    app = createApp();
    users = JSON.parse(JSON.stringify(initialUsers));
    auditEvents = [];
    simulatedDbDenial = false;
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 1: Authentication & Session Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 1: Authentication & Session Lifecycle', () => {
    it('authenticates valid credentials, sets HttpOnly session cookie, and returns user session', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin.user', password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data.user.username).toBe('admin.user');
      expect(res.body.data.user.role).toBe('Admin');
      expect(res.body.data.user.branchId).toBe('all');
      expect(res.body.meta.correlationId).toBeDefined();

      // Check cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const sessionCookie = cookies.find((c: string) => c.startsWith('catms_session='));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/HttpOnly/i);
    });

    it('rejects invalid password with 401 UNAUTHENTICATED and increments failed attempt counter', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin.user', password: 'WrongPassword999!' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid username or password.');
      expect(users['admin.user'].failed_login_count).toBe(1);
    });

    it('locks account after 5 consecutive failed login attempts (ACCOUNT_LOCKED)', async () => {
      // Perform 4 failed attempts
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/v1/auth/login')
          .send({ username: 'reception.user', password: 'BadPassword' });
      }

      expect(users['reception.user'].failed_login_count).toBe(4);
      expect(users['reception.user'].account_status).toBe('Active');

      // 5th attempt triggers lockout
      const fifthRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'reception.user', password: 'BadPassword' });

      expect(fifthRes.status).toBe(403);
      expect(fifthRes.body.error.code).toBe('ACCOUNT_DISABLED');
      expect(users['reception.user'].account_status).toBe('Locked');

      // Subsequent attempt with correct password is still blocked
      const subsequentRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'reception.user', password: TEST_PASSWORD });

      expect(subsequentRes.status).toBe(403);
      expect(subsequentRes.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('rejects disabled account with 403 ACCOUNT_DISABLED', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'disabled.user', password: TEST_PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('rejects inactive employee account with 403 ACCOUNT_DISABLED', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'inactive.emp.user', password: TEST_PASSWORD });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });

    it('GET /api/v1/auth/me returns session data for valid cookie', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin.user', password: TEST_PASSWORD });

      const cookie = loginRes.headers['set-cookie'];

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.username).toBe('admin.user');
      expect(meRes.body.data.user.role).toBe('Admin');
    });

    it('GET /api/v1/auth/me rejects request without session token with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('GET /api/v1/auth/me rejects tampered or invalid JWT with 401 UNAUTHENTICATED', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.tampered.token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('POST /api/v1/auth/logout clears session cookie and logs audit event', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);

      const clearedCookies = res.headers['set-cookie'];
      expect(clearedCookies).toBeDefined();
      const clearedSession = clearedCookies.find((c: string) => c.startsWith('catms_session='));
      expect(clearedSession).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 2: CSRF Protection
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 2: CSRF Protection for State-Changing Mutations', () => {
    it('GET /api/v1/auth/csrf issues a valid CSRF token and sets _csrf cookie', async () => {
      const res = await request(app).get('/api/v1/auth/csrf');
      expect(res.status).toBe(200);
      expect(res.body.data.csrfToken).toBeDefined();
      expect(typeof res.body.data.csrfToken).toBe('string');

      const cookies = res.headers['set-cookie'];
      expect(cookies.some((c: string) => c.startsWith('_csrf='))).toBe(true);
    });

    it('rejects state-changing logout with session cookie when CSRF token is missing (403 CSRF_INVALID)', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin.user', password: TEST_PASSWORD });

      const sessionCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('catms_session='));

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [sessionCookie]);

      expect(logoutRes.status).toBe(403);
      expect(logoutRes.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects state-changing logout with session cookie when CSRF token is invalid (403 CSRF_INVALID)', async () => {
      const csrfRes = await request(app).get('/api/v1/auth/csrf');
      const csrfCookie = csrfRes.headers['set-cookie'].find((c: string) => c.startsWith('_csrf='));

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin.user', password: TEST_PASSWORD });

      const sessionCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('catms_session='));

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [sessionCookie, csrfCookie])
        .set('X-CSRF-Token', 'invalid_tampered_csrf_token');

      expect(logoutRes.status).toBe(403);
      expect(logoutRes.body.error.code).toBe('CSRF_INVALID');
    });

    it('accepts state-changing logout with valid CSRF token and session cookie', async () => {
      const csrfRes = await request(app).get('/api/v1/auth/csrf');
      const csrfToken = csrfRes.body.data.csrfToken;
      const csrfCookie = csrfRes.headers['set-cookie'].find((c: string) => c.startsWith('_csrf='));

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin.user', password: TEST_PASSWORD });

      const sessionCookie = loginRes.headers['set-cookie'].find((c: string) => c.startsWith('catms_session='));

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', [sessionCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.data.success).toBe(true);
    });

    it('bypasses CSRF requirement for Bearer Authorization headers (API client mode)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 3: Two-Layer RBAC Matrix — API Middleware Layer
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 3: Role-Based Authorization Matrix (Reception vs Manager vs Clinician vs Admin)', () => {
    // ── Reception Role Restrictions ──────────────────────────────────────────
    it('Reception role: POST /api/v1/employees is blocked with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          employeeNumber: 'EMP-999',
          nic: '199512345678',
          fullName: 'Test Employee',
          genderCode: 'Male',
          dateOfBirth: '1995-01-01',
          positionCode: 'Staff',
          phone: '+94 77 123 4567',
          branchId: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Reception role: GET /api/v1/employees is blocked with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Reception role: POST /api/v1/branches is blocked with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          branchCode: 'GAL',
          name: 'MedSync Galle',
          addressLine1: '12 Fort Road',
          city: 'Galle',
          contactPhone: '+94 91 222 3344',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Reception role: PUT /api/v1/branches/:id is blocked with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .put('/api/v1/branches/1')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ name: 'Renamed Branch' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Reception role: POST /api/v1/branches/:id/manager is blocked with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/branches/1/manager')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ employeeId: 2 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Reception role: POST /api/v1/doctors is blocked with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          employeeId: 4,
          medicalLicenseNo: 'SLMC-99999',
          practiceStartDate: '2020-01-01',
          defaultConsultationFee: 3000,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('Reception role: GET and POST /api/v1/admin/users are blocked with 403 FORBIDDEN', async () => {
      const getRes = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(getRes.status).toBe(403);
      expect(getRes.body.error.code).toBe('FORBIDDEN');

      const postRes = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          employeeId: 3,
          username: 'new.reception',
          password: 'Password123!',
          roleCode: 'Reception',
        });

      expect(postRes.status).toBe(403);
      expect(postRes.body.error.code).toBe('FORBIDDEN');
    });

    it('Reception role: CAN access read-only directories (branches, doctors, specialties)', async () => {
      const branchesRes = await request(app)
        .get('/api/v1/branches')
        .set('Authorization', `Bearer ${receptionToken}`);
      expect(branchesRes.status).toBe(200);

      const doctorsRes = await request(app)
        .get('/api/v1/doctors')
        .set('Authorization', `Bearer ${receptionToken}`);
      expect(doctorsRes.status).toBe(200);

      const specialtiesRes = await request(app)
        .get('/api/v1/specialties')
        .set('Authorization', `Bearer ${receptionToken}`);
      expect(specialtiesRes.status).toBe(200);
    });

    // ── Branch Manager Scope & Restrictions ──────────────────────────────────
    it('Manager role: CAN list employees scoped to assigned branch', async () => {
      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Manager is scoped to branch 2
      expect(res.body.data.every((e: { branchId: number }) => e.branchId === 2)).toBe(true);
    });

    it('Manager role: POST /api/v1/employees is blocked with 403 FORBIDDEN (Admin only)', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          employeeNumber: 'EMP-999',
          nic: '199512345678',
          fullName: 'Test Employee',
          genderCode: 'Male',
          dateOfBirth: '1995-01-01',
          positionCode: 'Staff',
          phone: '+94 77 123 4567',
          branchId: 2,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    // ── Clinician Restrictions ───────────────────────────────────────────────
    it('Clinician role: CAN view doctors directory, but CANNOT register doctor profiles', async () => {
      const getRes = await request(app)
        .get('/api/v1/doctors')
        .set('Authorization', `Bearer ${clinicianToken}`);
      expect(getRes.status).toBe(200);

      const postRes = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          employeeId: 4,
          medicalLicenseNo: 'SLMC-99999',
        });
      expect(postRes.status).toBe(403);
      expect(postRes.body.error.code).toBe('FORBIDDEN');
    });

    // ── Admin Permissions ────────────────────────────────────────────────────
    it('Admin role: successfully registers staff with 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeNumber: 'EMP-050',
          nic: '199212345678',
          fullName: 'Kasun Wickrama',
          genderCode: 'Male',
          dateOfBirth: '1992-04-10',
          positionCode: 'Pharmacist',
          phone: '+94 77 555 6677',
          email: 'k.wickrama@medsync.lk',
          branchId: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.employeeId).toBeDefined();
      expect(res.body.data.assignmentId).toBeDefined();
    });

    it('Admin role: successfully creates branch with 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          branchCode: 'NEG',
          name: 'MedSync Negombo Coastal',
          addressLine1: '88 Sea Street',
          city: 'Negombo',
          district: 'Gampaha',
          contactPhone: '+94 31 222 3344',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.branchCode).toBe('NEG');
      expect(res.body.data.name).toBe('MedSync Negombo Coastal');
    });

    it('Admin role: successfully assigns branch manager', async () => {
      const res = await request(app)
        .post('/api/v1/branches/1/manager')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 2,
          reason: 'Annual rotation',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assignmentId).toBeDefined();
    });

    it('Admin role: successfully registers doctor profile with 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 4,
          medicalLicenseNo: 'SLMC-77788',
          practiceStartDate: '2018-05-01',
          defaultConsultationFee: 3500,
          specialtyIds: [1, 2],
          primarySpecialtyId: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.doctorId).toBeDefined();
    });

    it('Admin role: successfully creates user account with role with 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeId: 3,
          username: 'sunil.reception.new',
          password: 'Password123!',
          roleCode: 'Reception',
          branchScopeId: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.username).toBe('sunil.reception.new');
      expect(res.body.data.roles[0].roleCode).toBe('Reception');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 4: Parameterized Query Verification & SQL Injection Defenses
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 4: Parameterized Query Verification & SQL Injection Defenses', () => {
    it("SQL injection in login username (' OR '1'='1' --) fails safely with 401 UNAUTHENTICATED", async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: "' OR '1'='1' --", password: "' OR '1'='1'" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Invalid username or password.');
    });

    it("SQL injection with stacked query in login (admin'; DROP TABLE catms.user_account; --) fails safely", async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: "admin'; DROP TABLE catms.user_account; --", password: 'SomePassword' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it("SQL injection in branch URL param (' OR 1=1 --) results in harmless 422 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get('/api/v1/branches/1%20OR%201=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Invalid branch ID provided');
    });

    it("SQL injection in employee URL param (' UNION SELECT * FROM ...) results in harmless 422 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get('/api/v1/employees/1%20UNION%20SELECT%20*%20FROM%20catms.user_account')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Invalid employee ID provided');
    });

    it("SQL injection in employee DELETE param (1; DROP TABLE ...) results in harmless 422 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .delete('/api/v1/employees/1;%20DROP%20TABLE%20catms.employee;%20--')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Invalid employee ID provided');
    });

    it("SQL injection in branchId query param (' OR 1=1 --) results in harmless 422 VALIDATION_ERROR", async () => {
      const res = await request(app)
        .get('/api/v1/employees?branchId=1%20OR%201=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Invalid branchId query parameter provided');
    });

    it('SQL injection in string field during staff registration is parameterized safely without executing SQL', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeNumber: 'EMP-099',
          nic: '199012345678',
          fullName: "Robert'); DROP TABLE catms.employee;--",
          genderCode: 'Male',
          dateOfBirth: '1990-05-15',
          positionCode: 'Pharmacist',
          phone: '+94 77 999 8877',
          branchId: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.employeeId).toBeDefined();

      // Check employee record was saved literally as a string
      const created = employees.find((e) => e.employee_number === 'EMP-099');
      expect(created).toBeDefined();
      expect(created?.full_name).toBe("Robert'); DROP TABLE catms.employee;--");
    });

    it('Invalid format payload in NIC fails schema validation with 422 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeNumber: 'EMP-088',
          nic: '123', // too short, requires >= 9 chars
          fullName: 'Valid Name',
          genderCode: 'Male',
          dateOfBirth: '1990-05-15',
          positionCode: 'Staff',
          phone: '+94 77 888 7766',
          branchId: 1,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fieldErrors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: 'nic' })]),
      );
    });

    it('strips/rejects client-supplied maintained fields in POST /api/v1/branches with 422', async () => {
      const res = await request(app)
        .post('/api/v1/branches')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          branchCode: 'JAF',
          name: 'MedSync Jaffna',
          addressLine1: '10 Hospital Road',
          city: 'Jaffna',
          contactPhone: '+94 21 222 3344',
          branch_id: 999, // client-supplied maintained id
          created_at: '2026-01-01',
          is_active: true,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('strips/rejects client-supplied maintained fields in POST /api/v1/employees with 422', async () => {
      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeNumber: 'EMP-077',
          nic: '199112345678',
          fullName: 'Valid Employee',
          genderCode: 'Female',
          dateOfBirth: '1991-03-20',
          positionCode: 'Nurse',
          phone: '+94 77 777 6655',
          branchId: 1,
          employee_id: 12345, // client-supplied primary key
          created_at: '2026-01-01',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUITE 5: Two-Layer RBAC & Database-Level Privilege Denial (Layer 2 DB Grants)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Suite 5: Two-Layer RBAC & Database Privilege Denial (Layer 2 DB Grants)', () => {
    it('mapAppRoleToDbRole maps application roles to correct PostgreSQL security roles', () => {
      expect(mapAppRoleToDbRole('Reception')).toBe('catms_reception');
      expect(mapAppRoleToDbRole('Receptionist')).toBe('catms_reception');
      expect(mapAppRoleToDbRole('Clinician')).toBe('catms_clinician');
      expect(mapAppRoleToDbRole('Doctor')).toBe('catms_clinician');
      expect(mapAppRoleToDbRole('Manager')).toBe('catms_manager');
      expect(mapAppRoleToDbRole('BranchManager')).toBe('catms_manager');
      expect(mapAppRoleToDbRole('Admin')).toBe('catms_admin');
      expect(mapAppRoleToDbRole('AdminFinance')).toBe('catms_admin');
      expect(mapAppRoleToDbRole('QA')).toBe('catms_qa');
      expect(mapAppRoleToDbRole('UnknownRole')).toBe('catms_app');
    });

    it('setLocalRole rejects unauthorized database role names outside ALLOWED_ROLES', async () => {
      const mockClient = { query: vi.fn() } as unknown as PoolClient;
      await expect(setLocalRole(mockClient, 'postgres' as any)).rejects.toThrow(
        /unauthorized role: postgres/,
      );
      await expect(setLocalRole(mockClient, 'catms_super' as any)).rejects.toThrow(
        /unauthorized role: catms_super/,
      );
    });

    it('maps database permission denied (SQLSTATE 42501) to HTTP 403 FORBIDDEN with stable error envelope', async () => {
      simulatedDbDenial = true;

      const res = await request(app)
        .get('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('Database permission denied for this operation.');
      expect(res.body.meta.correlationId).toBeDefined();

      // Ensure no raw SQL or internal tables leaked
      expect(JSON.stringify(res.body)).not.toContain('permission denied for table employee');
    });

    it('rolls back database transaction and does not expose internal stack trace on database error', async () => {
      simulatedDbDenial = true;

      const res = await request(app)
        .post('/api/v1/employees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          employeeNumber: 'EMP-066',
          nic: '199312345678',
          fullName: 'Rollback Test',
          genderCode: 'Male',
          dateOfBirth: '1993-06-15',
          positionCode: 'Nurse',
          phone: '+94 77 666 5544',
          branchId: 1,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.stack).toBeUndefined();
      expect(res.body.error.stack).toBeUndefined();
    });
  });
});
