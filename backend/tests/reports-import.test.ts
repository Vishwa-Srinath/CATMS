/**
 * backend/tests/reports-import.test.ts
 * Owner: Dev5 | Issue: CATMS-055
 *
 * Supertest integration test suite for Reports & Import API contract skeleton:
 *   - GET /api/v1/reports/daily-appointments       (R1: Branch appointment summary)
 *   - GET /api/v1/reports/r1-branch-summary        (R1 alias)
 *   - GET /api/v1/reports/doctor-revenue           (R2: Doctor gross revenue & collections)
 *   - GET /api/v1/reports/r2-doctor-revenue        (R2 alias)
 *   - GET /api/v1/reports/patient-outstanding      (R3: Patient balances & debt list)
 *   - GET /api/v1/reports/r3-patient-balances      (R3 alias)
 *   - GET /api/v1/reports/treatments-by-category   (R4: Treatments delivered by category)
 *   - GET /api/v1/reports/r4-treatment-counts      (R4 alias)
 *   - GET /api/v1/reports/insurance-vs-cash        (R5: Insurance vs out-of-pocket receipts)
 *   - GET /api/v1/reports/r5-insurance-receipts    (R5 alias)
 *   - GET /api/v1/reports/import-status            (Import status & health)
 *
 * Acceptance Criteria & Invariants (CATMS-003, CATMS-007, CATMS-055):
 *   1. Unauthenticated requests are rejected with 401 UNAUTHENTICATED.
 *   2. Reception and Clinician users are strictly forbidden from all reports (403 FORBIDDEN).
 *   3. Branch Manager can access operational reports (R1, R4) scoped strictly to their assigned branch.
 *   4. Branch Manager is strictly denied access to financial reports (R2, R3, R5) and import status.
 *   5. Admin, QA, and AdminFinance can access all reports across any branch and view import status.
 *   6. Query filter validation enforces YYYY-MM-DD date format and positive integer branchId.
 *   7. Standard success envelope contains correlationId and timestamp.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
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

// ── Mock Database Connectivity / Migrations ──────────────────────────────────
vi.mock('../src/db/pool', () => ({
  checkDatabaseConnectivity: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  checkDatabaseMigrations:   vi.fn().mockResolvedValue({ ok: true, appliedCount: 28 }),
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  },
}));

import { createApp } from '../src/app/server';

function createToken(role: string, branchId: number | 'all' = 1, employeeId = 1): string {
  return jwt.sign(
    {
      userId: 10,
      employeeId,
      username: `${role.toLowerCase().replace(/[^a-z0-9]/g, '')}.test`,
      role,
      branchId,
      fullName: `Test ${role}`,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('CATMS-055 — Reports & Import API Contract Skeleton', () => {
  let app: Express;
  let adminToken: string;
  let managerTokenBranch1: string;
  let receptionToken: string;
  let clinicianToken: string;
  let qaToken: string;

  beforeAll(() => {
    app = createApp() as Express;
    adminToken = createToken('Admin', 'all', 1);
    managerTokenBranch1 = createToken('Branch Manager', 1, 2);
    receptionToken = createToken('Reception', 1, 3);
    clinicianToken = createToken('Clinician', 1, 4);
    qaToken = createToken('QA', 'all', 5);
  });

  // ── 1. Authentication Guards ────────────────────────────────────────────────
  describe('Authentication Enforcement', () => {
    it('rejects unauthenticated requests to R1 with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/reports/daily-appointments');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects unauthenticated requests to R2 with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/reports/doctor-revenue');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects unauthenticated requests to import-status with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/reports/import-status');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  // ── 2. Reception and Clinician Prohibitions ──────────────────────────────────
  describe('Reception and Clinician Denial (BR-6)', () => {
    const reportEndpoints = [
      '/api/v1/reports/daily-appointments',
      '/api/v1/reports/doctor-revenue',
      '/api/v1/reports/patient-outstanding',
      '/api/v1/reports/treatments-by-category',
      '/api/v1/reports/insurance-vs-cash',
      '/api/v1/reports/import-status',
    ];

    it.each(reportEndpoints)('denies Reception role on %s with 403 FORBIDDEN', async (endpoint) => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it.each(reportEndpoints)('denies Clinician role on %s with 403 FORBIDDEN', async (endpoint) => {
      const res = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${clinicianToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ── 3. Branch Manager Access & Branch Scoping ───────────────────────────────
  describe('Branch Manager Scoping & Boundary Enforcement', () => {
    it('allows Branch Manager to access R1 (daily appointments) for assigned branch', async () => {
      const res = await request(app)
        .get('/api/v1/reports/daily-appointments?branchId=1')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('correlationId');
    });

    it('allows Branch Manager to access R1 alias /r1-branch-summary without branchId (auto-scoped)', async () => {
      const res = await request(app)
        .get('/api/v1/reports/r1-branch-summary')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('denies Branch Manager when requesting another branch (branchId=2) with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/daily-appointments?branchId=2')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Branch Manager to access R4 (treatments by category) for assigned branch', async () => {
      const res = await request(app)
        .get('/api/v1/reports/treatments-by-category?branchId=1')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    it('denies Branch Manager when requesting another branch on R4 with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/treatments-by-category?branchId=2')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('strictly denies Branch Manager from accessing R2 (doctor revenue) with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/doctor-revenue')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('strictly denies Branch Manager from accessing R3 (patient balances) with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/patient-outstanding')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('strictly denies Branch Manager from accessing R5 (insurance receipts) with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/insurance-vs-cash')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('strictly denies Branch Manager from accessing import-status with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/reports/import-status')
        .set('Authorization', `Bearer ${managerTokenBranch1}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ── 4. Admin & QA Full Access ───────────────────────────────────────────────
  describe('Admin and QA Full Privileges', () => {
    it('allows Admin to access all five reports across any branch', async () => {
      const endpoints = [
        '/api/v1/reports/daily-appointments?branchId=2',
        '/api/v1/reports/doctor-revenue',
        '/api/v1/reports/patient-outstanding',
        '/api/v1/reports/treatments-by-category?branchId=2',
        '/api/v1/reports/insurance-vs-cash',
      ];

      for (const ep of endpoints) {
        const res = await request(app)
          .get(ep)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
      }
    });

    it('allows Admin to access import-status', async () => {
      const res = await request(app)
        .get('/api/v1/reports/import-status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: 'idle',
        totalRecords: 0,
        acceptedRecords: 0,
        rejectedRecords: 0,
      });
    });

    it('allows QA to access reports', async () => {
      const res = await request(app)
        .get('/api/v1/reports/daily-appointments')
        .set('Authorization', `Bearer ${qaToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });

  // ── 5. Query Filter Validation ──────────────────────────────────────────────
  describe('Query Filter Validation', () => {
    it('rejects invalid startDate format with 400 or 422', async () => {
      const res = await request(app)
        .get('/api/v1/reports/daily-appointments?startDate=invalid-date')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([400, 422]).toContain(res.status);
    });

    it('rejects negative branchId with 400 or 422', async () => {
      const res = await request(app)
        .get('/api/v1/reports/daily-appointments?branchId=-5')
        .set('Authorization', `Bearer ${adminToken}`);
      expect([400, 422]).toContain(res.status);
    });

    it('accepts valid date range and branchId filters', async () => {
      const res = await request(app)
        .get('/api/v1/reports/daily-appointments?startDate=2026-07-01&endDate=2026-08-09&branchId=1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });
  });
});
