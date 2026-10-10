/**
 * backend/tests/staff.test.ts
 * Owner: Dev2 | Issue: CATMS-046
 *
 * Supertest integration test suite for Branch, Staff, Doctor, and Access APIs:
 *   - GET, POST, PUT /api/v1/branches
 *   - POST /api/v1/branches/:id/manager (assign_branch_manager)
 *   - GET, POST /api/v1/employees (register_employee)
 *   - POST /api/v1/employees/:id/assignments (assign_employee_branch)
 *   - DELETE /api/v1/employees/:id (deactivate_employee)
 *   - GET, POST /api/v1/doctors (register_doctor_profile)
 *   - GET /api/v1/specialties
 *   - GET, POST /api/v1/admin/users
 *   - Multi-layer RBAC enforcement (Admin vs Manager vs Reception)
 *   - Rejection of client-supplied maintained/audit fields
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PoolClient } from 'pg';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'a'.repeat(64);

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

// ── Mock Data Fixtures ───────────────────────────────────────────────────────
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
    manager_name: 'Kamal Perera',
  },
  {
    branch_id: 2,
    branch_code: 'KND',
    name: 'MedSync Kandy Central',
    address_line_1: '50 Dalada Veediya',
    address_line_2: null,
    city: 'Kandy',
    district: 'Kandy',
    postal_code: '20000',
    contact_phone: '+94 81 200 0002',
    time_zone: 'Asia/Colombo',
    is_active: true,
    manager_employee_id: null,
    manager_name: null,
  },
];

let employees = [
  {
    employee_id: 1,
    employee_number: 'EMP-001',
    nic: '198012345678',
    full_name: 'Kamal Perera',
    gender_code: 'Male',
    date_of_birth: '1980-05-12',
    position_code: 'Manager',
    employment_status: 'Active',
    hire_date: '2020-01-15',
    phone: '+94 77 123 4567',
    email: 'k.perera@medsync.lk',
    is_active: true,
    branch_id: 1,
    branch_name: 'MedSync Colombo Main',
    user_account_id: 1,
    username: 'k.perera',
    role_code: 'Manager',
    is_doctor: false,
  },
  {
    employee_id: 2,
    employee_number: 'EMP-002',
    nic: '198512345678',
    full_name: 'Dr. Sunil Silva',
    gender_code: 'Male',
    date_of_birth: '1985-08-20',
    position_code: 'Doctor',
    employment_status: 'Active',
    hire_date: '2021-03-01',
    phone: '+94 77 234 5678',
    email: 's.silva@medsync.lk',
    is_active: true,
    branch_id: 1,
    branch_name: 'MedSync Colombo Main',
    user_account_id: 2,
    username: 's.silva',
    role_code: 'Clinician',
    is_doctor: true,
  },
  {
    employee_id: 3,
    employee_number: 'EMP-003',
    nic: '199012345678',
    full_name: 'Nimal Fernando',
    gender_code: 'Male',
    date_of_birth: '1990-11-10',
    position_code: 'Receptionist',
    employment_status: 'Active',
    hire_date: '2022-06-01',
    phone: '+94 77 345 6789',
    email: 'n.fernando@medsync.lk',
    is_active: true,
    branch_id: 2,
    branch_name: 'MedSync Kandy Central',
    user_account_id: 3,
    username: 'n.fernando',
    role_code: 'Reception',
    is_doctor: false,
  },
];

let specialties = [
  { specialty_id: 1, specialty_code: 'GP', name: 'General Practice', description: 'Primary Care', is_active: true },
  { specialty_id: 2, specialty_code: 'CARD', name: 'Cardiology', description: 'Heart', is_active: true },
];

let doctors = [
  {
    doctor_id: 2,
    employee_number: 'EMP-002',
    full_name: 'Dr. Sunil Silva',
    medical_license_no: 'SLMC-98765',
    practice_start_date: '2015-01-01',
    default_consultation_fee: 2500,
    is_accepting_appointments: true,
    specialties: [{ specialtyId: 1, name: 'General Practice', isPrimary: true }],
  },
];

let adminUsers = [
  {
    user_account_id: 1,
    employee_id: 1,
    employee_number: 'EMP-001',
    full_name: 'Kamal Perera',
    username: 'k.perera',
    account_status: 'Active',
    failed_login_count: 0,
    last_login_at: '2026-09-01T08:00:00Z',
    roles: [{ roleCode: 'Manager', branchScopeId: 1, branchCode: 'CMB' }],
  },
];

const executedProcedures: Array<{ name: string; params: unknown[] }> = [];

// ── Mock Pool & Transactions ─────────────────────────────────────────────────
vi.mock('../src/db/pool', () => ({
  pool: {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      // 1. SELECT branches
      if (text.includes('FROM catms.branch b')) {
        if (text.includes('WHERE b.branch_id = $1')) {
          const id = Number(params[0]);
          const found = branches.find((b) => b.branch_id === id);
          return { rows: found ? [found] : [] };
        }
        return { rows: branches };
      }

      // 2. SELECT employees
      if (text.includes('FROM catms.employee e')) {
        if (text.includes('WHERE eba.branch_id = $1')) {
          const bId = Number(params[0]);
          return { rows: employees.filter((e) => e.branch_id === bId) };
        }
        return { rows: employees };
      }

      // 3. SELECT doctors
      if (text.includes('FROM catms.doctor_profile dp')) {
        return { rows: doctors };
      }

      // 4. SELECT specialties
      if (text.includes('FROM catms.specialty')) {
        return { rows: specialties };
      }

      // 5. SELECT admin users
      if (text.includes('FROM catms.user_account u')) {
        return { rows: adminUsers };
      }

      // 6. SELECT audit logs
      if (text.includes('FROM catms.audit_event a')) {
        return {
          rows: [
            {
              audit_event_id: 1,
              actor_user_id: 1,
              actor_username: 'admin.user',
              actor_name: 'Dr. Admin Leader',
              entity_type: 'USER_ACCOUNT',
              entity_id: '1',
              action_code: 'ACCOUNT_UNLOCKED',
              occurred_at: '2026-08-09T10:00:00Z',
              payload: { reason: 'manual unlock' },
              client_ip: '127.0.0.1',
            },
          ],
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

vi.mock('../src/db/transaction', () => ({
  withTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        // CALL catms.register_employee
        if (text.includes('CALL catms.register_employee')) {
          executedProcedures.push({ name: 'register_employee', params });
          const newEmpId = employees.length + 1;
          const newEmp = {
            employee_id: newEmpId,
            employee_number: String(params[0]),
            nic: String(params[1]),
            full_name: String(params[2]),
            gender_code: String(params[3]),
            date_of_birth: String(params[4]),
            position_code: String(params[5]),
            employment_status: 'Active',
            hire_date: '2026-09-15',
            phone: String(params[6]),
            email: params[8] ? String(params[8]) : null,
            is_active: true,
            branch_id: Number(params[7]),
            branch_name: 'MedSync Colombo Main',
            user_account_id: params[11] ? 100 : null,
            username: params[11] ? String(params[11]) : null,
            role_code: params[13] ? String(params[13]) : null,
            is_doctor: String(params[5]).toLowerCase() === 'doctor',
          };
          employees.push(newEmp);
          return {
            rows: [
              {
                p_employee_id: newEmpId,
                p_user_account_id: params[11] ? 100 : null,
                p_assignment_id: 50,
              },
            ],
          };
        }

        // CALL catms.assign_branch_manager
        if (text.includes('CALL catms.assign_branch_manager')) {
          executedProcedures.push({ name: 'assign_branch_manager', params });
          const branchId = Number(params[0]);
          const empId = Number(params[1]);
          const br = branches.find((b) => b.branch_id === branchId);
          const emp = employees.find((e) => e.employee_id === empId);
          if (br && emp) {
            br.manager_employee_id = emp.employee_id;
            br.manager_name = emp.full_name;
          }
          return { rows: [{ p_assignment_id: 77 }] };
        }

        // CALL catms.assign_employee_branch
        if (text.includes('CALL catms.assign_employee_branch')) {
          executedProcedures.push({ name: 'assign_employee_branch', params });
          return { rows: [{ p_assignment_id: 88 }] };
        }

        // CALL catms.deactivate_employee
        if (text.includes('CALL catms.deactivate_employee')) {
          executedProcedures.push({ name: 'deactivate_employee', params });
          const empId = Number(params[0]);
          const emp = employees.find((e) => e.employee_id === empId);
          if (emp) {
            emp.is_active = false;
            emp.employment_status = 'Inactive';
          }
          return { rows: [], rowCount: 1 };
        }

        // CALL catms.register_doctor_profile
        if (text.includes('CALL catms.register_doctor_profile')) {
          executedProcedures.push({ name: 'register_doctor_profile', params });
          return { rows: [{ p_doctor_id: params[0] }] };
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

        // SELECT branch_id FROM catms.branch WHERE branch_id = $1
        if (text.includes('SELECT branch_id FROM catms.branch WHERE branch_id = $1')) {
          const id = Number(params[0]);
          const found = branches.find((b) => b.branch_id === id);
          return { rows: found ? [found] : [] };
        }

        // INSERT into audit_event
        if (text.includes('INSERT INTO catms.audit_event')) {
          return { rows: [], rowCount: 1 };
        }

        // INSERT into user_account
        if (text.includes('INSERT INTO catms.user_account')) {
          return { rows: [{ user_account_id: 101 }] };
        }

        // SELECT employee_id FROM catms.employee
        if (text.includes('SELECT employee_id') && text.includes('FROM catms.employee')) {
          return { rows: [{ employee_id: params[0], employee_number: 'EMP-003', full_name: 'Nimal Fernando', is_active: true }] };
        }

        // SELECT branch_code FROM catms.branch
        if (text.includes('SELECT branch_code FROM catms.branch')) {
          return { rows: [{ branch_code: 'KND' }] };
        }

        // SELECT app_role_id FROM catms.app_role
        if (text.includes('SELECT app_role_id FROM catms.app_role')) {
          return { rows: [{ app_role_id: 3 }] };
        }

        // UPDATE catms.user_account (unlock)
        if (text.includes('UPDATE catms.user_account') && text.includes('failed_login_count = 0')) {
          const uId = Number(params[0]);
          const found = adminUsers.find((u) => u.user_account_id === uId);
          if (found) {
            found.account_status = 'Active';
            found.failed_login_count = 0;
          }
          return { rows: [], rowCount: 1 };
        }

        // SELECT user_account_id, username, account_status FROM catms.user_account
        if (text.includes('SELECT user_account_id, username, account_status FROM catms.user_account')) {
          const uId = Number(params[0]);
          const found = adminUsers.find((u) => u.user_account_id === uId);
          return { rows: found ? [{ user_account_id: found.user_account_id, username: found.username, account_status: found.account_status }] : [] };
        }

        // SELECT user_account_id, username FROM catms.user_account
        if (text.includes('SELECT user_account_id, username FROM catms.user_account')) {
          const uId = Number(params[0]);
          const found = adminUsers.find((u) => u.user_account_id === uId);
          return { rows: found ? [{ user_account_id: found.user_account_id, username: found.username }] : [] };
        }

        // UPDATE catms.user_account_role
        if (text.includes('UPDATE catms.user_account_role')) {
          return { rows: [], rowCount: 1 };
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
  withReadonlyTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as PoolClient;
    return fn(mockClient);
  }),
  setLocalRole: vi.fn().mockResolvedValue(undefined),
  mapAppRoleToDbRole: vi.fn((role: string) => `catms_${role.toLowerCase()}`),
  sql: vi.fn(),
  isSafeIdentifier: vi.fn(),
}));

// ── Auth Token Generator Helpers ─────────────────────────────────────────────
function createToken(role: string, branchId: number | 'all' = 'all') {
  return jwt.sign(
    {
      userId: 99,
      employeeId: 99,
      username: `${role.toLowerCase()}.user`,
      role,
      branchId,
      fullName: `${role} Test User`,
    },
    JWT_SECRET,
    { expiresIn: 3600 },
  );
}

const adminToken = createToken('Admin', 'all');
const managerToken = createToken('Manager', 1);
const receptionToken = createToken('Reception', 1);
const clinicianToken = createToken('Clinician', 1);

let app: Express;

beforeAll(async () => {
  const { createApp } = await import('../src/app/server');
  app = createApp();
});

beforeEach(() => {
  executedProcedures.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Branch API (/api/v1/branches)
// ─────────────────────────────────────────────────────────────────────────────
describe('Branch Endpoints (/api/v1/branches)', () => {
  it('GET /api/v1/branches returns list of branches for authenticated user', async () => {
    const res = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].branchCode).toBe('CMB');
    expect(res.body.data[0].manager).toBeDefined();
  });

  it('GET /api/v1/branches/:id returns branch detail', async () => {
    const res = await request(app)
      .get('/api/v1/branches/1')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.branchCode).toBe('CMB');
  });

  it('POST /api/v1/branches allows Admin to create a new branch with 201 Created', async () => {
    const payload = {
      branchCode: 'GAL',
      name: 'MedSync Galle South',
      addressLine1: '25 Matara Road',
      city: 'Galle',
      contactPhone: '+94 91 200 0003',
    };

    const res = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.branchCode).toBe('GAL');
    expect(res.body.data.name).toBe('MedSync Galle South');
  });

  it('POST /api/v1/branches rejects Non-Admin with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({
        branchCode: 'JAF',
        name: 'MedSync Jaffna North',
        addressLine1: '10 Hospital Road',
        city: 'Jaffna',
        contactPhone: '+94 21 200 0004',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/branches rejects client-supplied maintained fields with 422', async () => {
    const res = await request(app)
      .post('/api/v1/branches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        branchCode: 'KUR',
        name: 'MedSync Kurunegala',
        addressLine1: '12 Main Street',
        city: 'Kurunegala',
        contactPhone: '+94 37 200 0005',
        is_active: false, // Disallowed maintained field
        created_at: '2026-01-01', // Disallowed maintained timestamp
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PUT /api/v1/branches/:id updates branch for Admin', async () => {
    const res = await request(app)
      .put('/api/v1/branches/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'MedSync Colombo Flagship' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('POST /api/v1/branches/:id/manager assigns branch manager via stored procedure', async () => {
    const res = await request(app)
      .post('/api/v1/branches/2/manager')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: 1, reason: 'Promoted to manager' });

    expect(res.status).toBe(200);
    expect(res.body.data.assignmentId).toBe(77);
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'assign_branch_manager' }),
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Employee API (/api/v1/employees)
// ─────────────────────────────────────────────────────────────────────────────
describe('Employee Endpoints (/api/v1/employees)', () => {
  it('GET /api/v1/employees allows Admin to list all employees', async () => {
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('GET /api/v1/employees allows Manager to list their branch employees', async () => {
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Manager has branchId = 1
    expect(res.body.data.every((e: any) => e.branchId === 1)).toBe(true);
  });

  it('GET /api/v1/employees rejects Reception with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/employees allows Admin to register employee via register_employee procedure', async () => {
    const payload = {
      employeeNumber: 'EMP-010',
      nic: '199512345678',
      fullName: 'Saman Kumara',
      genderCode: 'Male',
      dateOfBirth: '1995-04-12',
      positionCode: 'Receptionist',
      phone: '+94 77 987 6543',
      branchId: 1,
      email: 'saman@medsync.lk',
      username: 'saman.k',
      password: 'Password123!',
      roleCode: 'Reception',
    };

    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.employeeId).toBeDefined();
    expect(res.body.data.assignmentId).toBe(50);
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'register_employee' }),
      ]),
    );
  });

  it('POST /api/v1/employees rejects Non-Admin with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        employeeNumber: 'EMP-011',
        nic: '199612345678',
        fullName: 'Test NonAdmin',
        genderCode: 'Female',
        dateOfBirth: '1996-01-01',
        positionCode: 'Nurse',
        phone: '+94 77 111 2233',
        branchId: 1,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/employees/:id/assignments calls assign_employee_branch procedure', async () => {
    const res = await request(app)
      .post('/api/v1/employees/1/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: 2, assignmentType: 'PRIMARY' });

    expect(res.status).toBe(200);
    expect(res.body.data.assignmentId).toBe(88);
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'assign_employee_branch' }),
      ]),
    );
  });

  it('DELETE /api/v1/employees/:id calls deactivate_employee procedure', async () => {
    const res = await request(app)
      .delete('/api/v1/employees/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Resigned' });

    expect(res.status).toBe(200);
    expect(res.body.data.success).toBe(true);
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'deactivate_employee' }),
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Doctors & Specialties API
// ─────────────────────────────────────────────────────────────────────────────
describe('Doctor & Specialty Endpoints', () => {
  it('GET /api/v1/doctors returns directory of doctors with specialties', async () => {
    const res = await request(app)
      .get('/api/v1/doctors')
      .set('Authorization', `Bearer ${receptionToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].medicalLicenseNo).toBe('SLMC-98765');
  });

  it('POST /api/v1/doctors registers doctor profile via register_doctor_profile', async () => {
    const payload = {
      employeeId: 2,
      medicalLicenseNo: 'SLMC-77777',
      practiceStartDate: '2020-01-01',
      defaultConsultationFee: 3000,
      specialtyIds: [1, 2],
      primarySpecialtyId: 1,
    };

    const res = await request(app)
      .post('/api/v1/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data.doctorId).toBe(2);
    expect(executedProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'register_doctor_profile' }),
      ]),
    );
  });

  it('GET /api/v1/specialties returns specialties catalogue', async () => {
    const res = await request(app)
      .get('/api/v1/specialties')
      .set('Authorization', `Bearer ${clinicianToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].specialtyCode).toBe('GP');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Admin Users API (/api/v1/admin/users)
// ─────────────────────────────────────────────────────────────────────────────
describe('Admin User Accounts (/api/v1/admin/users)', () => {
  it('GET /api/v1/admin/users allows Admin to list user accounts', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].username).toBe('k.perera');
  });

  it('GET /api/v1/admin/users rejects Non-Admin with 403 FORBIDDEN', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/v1/admin/users creates user account for employee', async () => {
    const payload = {
      employeeId: 3,
      username: 'nimal.fernando',
      password: 'SecurePassword123!',
      roleCode: 'Reception',
      branchScopeId: 2,
    };

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
  });

  it('PATCH /api/v1/admin/users/:id/unlock unlocks account (Admin only)', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/1/unlock')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.accountStatus).toBe('Active');
  });

  it('PUT /api/v1/admin/users/:id/role updates user role (Admin only)', async () => {
    const res = await request(app)
      .put('/api/v1/admin/users/1/role')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleCode: 'Admin', branchScopeId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it('GET /api/v1/admin/audit-logs returns audit log entries for Admin/QA', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
