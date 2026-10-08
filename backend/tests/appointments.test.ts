/**
 * backend/tests/appointments.test.ts
 * Owner: Dev1 | Issues: CATMS-050, CATMS-051
 *
 * Supertest integration test suite for Appointment Scheduling APIs:
 *   - GET  /api/v1/appointments               (List / filter appointments)
 *   - GET  /api/v1/appointments/availability  (Doctor availability & exceptions)
 *   - GET  /api/v1/appointments/:id           (Appointment detail & audit logs)
 *   - POST /api/v1/appointments/book          (Book scheduled appointment)
 *   - POST /api/v1/appointments/walk-in       (Book walk-in appointment)
 *   - POST /api/v1/appointments/:id/reschedule(Reschedule appointment)
 *   - POST /api/v1/appointments/:id/cancel    (Cancel appointment)
 *   - POST /api/v1/appointments/:id/complete  (Mark appointment completed)
 *
 * Asserts:
 *   1. Full HTTP contracts, schemas, and 15-minute grid validation.
 *   2. Multi-layer role security (Reception/Admin vs Clinician vs Manager/QA).
 *   3. Strict branch scope isolation between clinic branches.
 *   4. Sanitized PostgreSQL error mapping (23P01 -> 409 APPOINTMENT_OVERLAP, DA001/DA002 -> 422 DOCTOR_UNAVAILABLE).
 *   5. Concurrent race-condition collision: one succeeds (201), competitor gets 409 APPOINTMENT_OVERLAP.
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
interface AppointmentRecord {
  appointment_id: number;
  appointment_number: string;
  patient_id: number;
  doctor_id: number;
  branch_id: number;
  specialty_id: number;
  start_at: string;
  end_at: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  booking_type: 'Booked' | 'WalkIn';
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

const initialAppointments: AppointmentRecord[] = [
  {
    appointment_id: 101,
    appointment_number: 'APT-20261012-0101',
    patient_id: 1,
    doctor_id: 2,
    branch_id: 1,
    specialty_id: 1,
    start_at: '2026-10-12T09:00:00.000Z',
    end_at: '2026-10-12T09:30:00.000Z',
    status: 'Scheduled',
    booking_type: 'Booked',
    notes: 'Regular general checkup',
    created_by: 1,
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-01T08:00:00.000Z',
  },
  {
    appointment_id: 102,
    appointment_number: 'APT-20261012-0102',
    patient_id: 1,
    doctor_id: 2,
    branch_id: 1,
    specialty_id: 1,
    start_at: '2026-10-12T10:00:00.000Z',
    end_at: '2026-10-12T10:30:00.000Z',
    status: 'Completed',
    booking_type: 'Booked',
    notes: 'Prior completed consultation',
    created_by: 1,
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-12T10:30:00.000Z',
  },
  {
    appointment_id: 103,
    appointment_number: 'APT-20261012-0103',
    patient_id: 2,
    doctor_id: 2,
    branch_id: 2,
    specialty_id: 1,
    start_at: '2026-10-12T14:00:00.000Z',
    end_at: '2026-10-12T14:30:00.000Z',
    status: 'Scheduled',
    booking_type: 'Booked',
    notes: 'Kandy branch appointment',
    created_by: 3,
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-01T08:00:00.000Z',
  },
];

let appointments: AppointmentRecord[] = [];

const patients = [
  {
    patient_id: 1,
    patient_number: 'PAT-001',
    patient_name: 'Anula Fernando',
    patient_contact: '+94 77 111 2222',
  },
  {
    patient_id: 2,
    patient_number: 'PAT-002',
    patient_name: 'Sunil Perera',
    patient_contact: '+94 77 333 4444',
  },
];

const doctors = [
  {
    doctor_id: 2,
    doctor_name: 'Dr. Sunil Silva',
    doctor_license: 'SLMC-98765',
  },
];

const branches = [
  {
    branch_id: 1,
    branch_code: 'CMB',
    branch_name: 'MedSync Colombo Main',
  },
  {
    branch_id: 2,
    branch_code: 'KND',
    branch_name: 'MedSync Kandy Central',
  },
];

const specialties = [
  {
    specialty_id: 1,
    specialty_code: 'GP',
    specialty_name: 'General Practice',
  },
];

let scheduleHistories: Array<{
  history_id: number;
  appointment_id: number;
  old_start_at: string;
  old_end_at: string;
  new_start_at: string;
  new_end_at: string;
  reason: string;
  changed_by_employee_id: number;
  changed_at: string;
}> = [];

let statusLogs: Array<{
  log_id: number;
  appointment_id: number;
  old_status: string;
  new_status: string;
  reason: string | null;
  changed_by_employee_id: number;
  changed_at: string;
}> = [];

const doctorAvailability = [
  {
    availability_id: 1,
    doctor_id: 2,
    branch_id: 1,
    day_of_week: 'Mon',
    start_time: '08:30:00',
    end_time: '12:30:00',
    valid_from: '2026-01-01',
    valid_to: null,
  },
];

const doctorExceptions = [
  {
    exception_id: 1,
    doctor_id: 2,
    branch_id: 1,
    exception_type: 'Unavailable',
    start_at: '2026-10-12T11:00:00.000Z',
    end_at: '2026-10-12T12:00:00.000Z',
    exception_date: '2026-10-12',
  },
];

// ── Mock Pool & Transactions ─────────────────────────────────────────────────
vi.mock('../src/db/pool', () => ({
  pool: {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      // 1. SELECT appointment details
      if (text.includes('FROM catms.appointment a')) {
        // Specific ID query
        if (text.includes('WHERE a.appointment_id = $1')) {
          const id = Number(params[0]);
          const apt = appointments.find((a) => a.appointment_id === id);
          if (!apt) return { rows: [] };
          const p = patients.find((pt) => pt.patient_id === apt.patient_id)!;
          const d = doctors.find((doc) => doc.doctor_id === apt.doctor_id)!;
          const b = branches.find((br) => br.branch_id === apt.branch_id)!;
          const s = specialties.find((sp) => sp.specialty_id === apt.specialty_id)!;
          return {
            rows: [
              {
                ...apt,
                patient_number: p.patient_number,
                patient_name: p.patient_name,
                patient_contact: p.patient_contact,
                doctor_name: d.doctor_name,
                doctor_license: d.doctor_license,
                branch_code: b.branch_code,
                branch_name: b.branch_name,
                specialty_code: s.specialty_code,
                specialty_name: s.specialty_name,
              },
            ],
          };
        }

        // List query with filters
        let filtered = [...appointments];

        // Check if branch_id filter present in query
        if (text.includes('a.branch_id = $')) {
          // Find parameter index for branch_id
          const branchParamIdx = text
            .split('WHERE')[1]
            ?.split('AND')
            .find((c) => c.includes('a.branch_id = $'))
            ?.match(/\$(\d+)/)?.[1];
          if (branchParamIdx) {
            const bId = Number(params[Number(branchParamIdx) - 1]);
            filtered = filtered.filter((a) => a.branch_id === bId);
          }
        }

        // Doctor filter
        if (text.includes('a.doctor_id = $')) {
          const docParamIdx = text
            .split('WHERE')[1]
            ?.split('AND')
            .find((c) => c.includes('a.doctor_id = $'))
            ?.match(/\$(\d+)/)?.[1];
          if (docParamIdx) {
            const dId = Number(params[Number(docParamIdx) - 1]);
            filtered = filtered.filter((a) => a.doctor_id === dId);
          }
        }

        // Status filter
        if (text.includes('a.status = $')) {
          const statusParamIdx = text
            .split('WHERE')[1]
            ?.split('AND')
            .find((c) => c.includes('a.status = $'))
            ?.match(/\$(\d+)/)?.[1];
          if (statusParamIdx) {
            const st = String(params[Number(statusParamIdx) - 1]);
            filtered = filtered.filter((a) => a.status === st);
          }
        }

        const rows = filtered.map((apt) => {
          const p = patients.find((pt) => pt.patient_id === apt.patient_id)!;
          const d = doctors.find((doc) => doc.doctor_id === apt.doctor_id)!;
          const b = branches.find((br) => br.branch_id === apt.branch_id)!;
          const s = specialties.find((sp) => sp.specialty_id === apt.specialty_id)!;
          return {
            ...apt,
            patient_number: p.patient_number,
            patient_name: p.patient_name,
            patient_contact: p.patient_contact,
            doctor_name: d.doctor_name,
            doctor_license: d.doctor_license,
            branch_code: b.branch_code,
            branch_name: b.branch_name,
            specialty_code: s.specialty_code,
            specialty_name: s.specialty_name,
          };
        });

        return { rows };
      }

      // 2. Schedule history
      if (text.includes('FROM catms.appointment_schedule_history')) {
        const aptId = Number(params[0]);
        return { rows: scheduleHistories.filter((h) => h.appointment_id === aptId) };
      }

      // 3. Status log
      if (text.includes('FROM catms.appointment_status_log')) {
        const aptId = Number(params[0]);
        return { rows: statusLogs.filter((l) => l.appointment_id === aptId) };
      }

      // 4. Doctor recurring availability
      if (text.includes('FROM catms.doctor_availability')) {
        const docId = Number(params[0]);
        const bId = Number(params[1]);
        const dow = String(params[2]);
        return {
          rows: doctorAvailability.filter(
            (da) => da.doctor_id === docId && da.branch_id === bId && da.day_of_week === dow,
          ),
        };
      }

      // 5. Doctor exceptions
      if (text.includes('FROM catms.doctor_availability_exception')) {
        const docId = Number(params[0]);
        const bId = Number(params[1]);
        const dStr = String(params[2]);
        return {
          rows: doctorExceptions.filter(
            (de) => de.doctor_id === docId && de.branch_id === bId && de.exception_date === dStr,
          ),
        };
      }

      // 6. Branch check by appointment_id
      if (text.includes('SELECT branch_id FROM catms.appointment WHERE appointment_id = $1')) {
        const id = Number(params[0]);
        const found = appointments.find((a) => a.appointment_id === id);
        return { rows: found ? [{ branch_id: found.branch_id }] : [] };
      }

      return { rows: [] };
    }),
    connect: vi.fn(),
  },
  checkDatabaseConnectivity: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  checkDatabaseMigrations: vi.fn().mockResolvedValue({ ok: true, maxMigration: 62 }),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

// Concurrency lock simulation for test
let isConcurrentBookingActive = false;

vi.mock('../src/db/transaction', () => ({
  withTransaction: vi.fn(async (fn: (client: PoolClient) => Promise<unknown>) => {
    const mockClient = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        // 1. CALL catms.book_appointment
        if (text.includes('CALL catms.book_appointment')) {
          const [
            patientId,
            doctorId,
            branchId,
            specialtyId,
            startAt,
            endAt,
            bookingType,
            createdBy,
            notes,
          ] = params as [
            number,
            number,
            number,
            number,
            string,
            string,
            'Booked' | 'WalkIn',
            number,
            string | null,
          ];

          // Check doctor unavailable exception (DA001 / DA002)
          if (startAt.includes('11:00:00') || startAt.includes('11:30:00')) {
            const err = new Error('Doctor is unavailable at this time.');
            (err as unknown as { code: string }).code = 'DA001';
            throw err;
          }
          if (startAt.includes('23:00:00')) {
            const err = new Error('Requested slot is outside of scheduled doctor availability.');
            (err as unknown as { code: string }).code = 'DA002';
            throw err;
          }

          // Check overlap with active appointments (ex_appointment_doctor_time_no_overlap / 23P01)
          const overlap = appointments.find(
            (a) =>
              a.doctor_id === doctorId &&
              a.status !== 'Cancelled' &&
              new Date(a.start_at) < new Date(endAt) &&
              new Date(a.end_at) > new Date(startAt),
          );

          if (overlap) {
            const err = new Error('The requested slot overlaps with an existing appointment.');
            (err as unknown as { code: string }).code = '23P01';
            throw err;
          }

          // Check concurrent collision simulation
          if (isConcurrentBookingActive) {
            const err = new Error('The requested slot overlaps with an existing appointment.');
            (err as unknown as { code: string }).code = '23P01';
            throw err;
          }

          // Create appointment
          const newId = appointments.length > 0 ? Math.max(...appointments.map((a) => a.appointment_id)) + 1 : 1;
          const aptNumber = `APT-20261012-${String(newId).padStart(4, '0')}`;
          const newApt: AppointmentRecord = {
            appointment_id: newId,
            appointment_number: aptNumber,
            patient_id: Number(patientId),
            doctor_id: Number(doctorId),
            branch_id: Number(branchId),
            specialty_id: Number(specialtyId),
            start_at: String(startAt),
            end_at: String(endAt),
            status: 'Scheduled',
            booking_type: bookingType,
            notes: notes ? String(notes) : null,
            created_by: Number(createdBy),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          appointments.push(newApt);

          return {
            rows: [
              {
                p_appointment_id: newId,
                p_appointment_number: aptNumber,
              },
            ],
          };
        }

        // 2. CALL catms.reschedule_appointment
        if (text.includes('CALL catms.reschedule_appointment')) {
          const [aptId, newStartAt, newEndAt, reason, employeeId] = params as [
            number,
            string,
            string,
            string,
            number,
          ];

          const apt = appointments.find((a) => a.appointment_id === Number(aptId));
          if (!apt) {
            const err = new Error('Appointment not found.');
            (err as unknown as { code: string }).code = 'A0001';
            throw err;
          }

          if (apt.status === 'Completed' || apt.status === 'Cancelled') {
            const err = new Error(`Cannot reschedule appointment because it is ${apt.status}`);
            (err as unknown as { code: string }).code = 'A0002';
            throw err;
          }

          // Overlap check
          const overlap = appointments.find(
            (a) =>
              a.appointment_id !== apt.appointment_id &&
              a.doctor_id === apt.doctor_id &&
              a.status !== 'Cancelled' &&
              new Date(a.start_at) < new Date(newEndAt) &&
              new Date(a.end_at) > new Date(newStartAt),
          );
          if (overlap) {
            const err = new Error('The requested slot overlaps with an existing appointment.');
            (err as unknown as { code: string }).code = '23P01';
            throw err;
          }

          scheduleHistories.push({
            history_id: scheduleHistories.length + 1,
            appointment_id: apt.appointment_id,
            old_start_at: apt.start_at,
            old_end_at: apt.end_at,
            new_start_at: String(newStartAt),
            new_end_at: String(newEndAt),
            reason: String(reason),
            changed_by_employee_id: Number(employeeId),
            changed_at: new Date().toISOString(),
          });

          apt.start_at = String(newStartAt);
          apt.end_at = String(newEndAt);
          apt.updated_at = new Date().toISOString();

          return { rows: [] };
        }

        // 3. CALL catms.cancel_appointment
        if (text.includes('CALL catms.cancel_appointment')) {
          const [aptId, reason, employeeId] = params as [number, string, number];
          const apt = appointments.find((a) => a.appointment_id === Number(aptId));
          if (!apt) {
            const err = new Error('Appointment not found.');
            (err as unknown as { code: string }).code = 'A0001';
            throw err;
          }
          if (apt.status === 'Completed' || apt.status === 'Cancelled') {
            const err = new Error(`Cannot change status because it is already ${apt.status}`);
            (err as unknown as { code: string }).code = 'A0003';
            throw err;
          }

          statusLogs.push({
            log_id: statusLogs.length + 1,
            appointment_id: apt.appointment_id,
            old_status: apt.status,
            new_status: 'Cancelled',
            reason: String(reason),
            changed_by_employee_id: Number(employeeId),
            changed_at: new Date().toISOString(),
          });

          apt.status = 'Cancelled';
          apt.updated_at = new Date().toISOString();

          return { rows: [] };
        }

        // 4. CALL catms.update_appointment_status
        if (text.includes('CALL catms.update_appointment_status')) {
          const [aptId, newStatus, reason, employeeId] = params as [
            number,
            'Completed' | 'Cancelled',
            string,
            number,
          ];
          const apt = appointments.find((a) => a.appointment_id === Number(aptId));
          if (!apt) {
            const err = new Error('Appointment not found.');
            (err as unknown as { code: string }).code = 'A0001';
            throw err;
          }
          if (apt.status === 'Completed' || apt.status === 'Cancelled') {
            const err = new Error(`Cannot change status because it is already ${apt.status}`);
            (err as unknown as { code: string }).code = 'A0003';
            throw err;
          }

          statusLogs.push({
            log_id: statusLogs.length + 1,
            appointment_id: apt.appointment_id,
            old_status: apt.status,
            new_status: newStatus,
            reason: String(reason),
            changed_by_employee_id: Number(employeeId),
            changed_at: new Date().toISOString(),
          });

          apt.status = newStatus;
          apt.updated_at = new Date().toISOString();

          return { rows: [] };
        }

        // 5. Select inside transaction (fetchAppointmentById)
        if (text.includes('FROM catms.appointment a') && text.includes('WHERE a.appointment_id = $1')) {
          const id = Number(params[0]);
          const apt = appointments.find((a) => a.appointment_id === id);
          if (!apt) return { rows: [] };
          const p = patients.find((pt) => pt.patient_id === apt.patient_id)!;
          const d = doctors.find((doc) => doc.doctor_id === apt.doctor_id)!;
          const b = branches.find((br) => br.branch_id === apt.branch_id)!;
          const s = specialties.find((sp) => sp.specialty_id === apt.specialty_id)!;
          return {
            rows: [
              {
                ...apt,
                patient_number: p.patient_number,
                patient_name: p.patient_name,
                patient_contact: p.patient_contact,
                doctor_name: d.doctor_name,
                doctor_license: d.doctor_license,
                branch_code: b.branch_code,
                branch_name: b.branch_name,
                specialty_code: s.specialty_code,
                specialty_name: s.specialty_name,
              },
            ],
          };
        }

        return { rows: [] };
      }),
    } as unknown as PoolClient;

    return fn(mockClient);
  }),
  withReadonlyTransaction: vi.fn(),
  setLocalRole: vi.fn(),
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
const receptionBranch2Token = createToken('Reception', 2);
const clinicianToken = createToken('Clinician', 1);
const qaToken = createToken('QA', 'all');

let app: Express;

beforeAll(async () => {
  const { createApp } = await import('../src/app/server');
  app = createApp();
});

beforeEach(() => {
  appointments = JSON.parse(JSON.stringify(initialAppointments));
  scheduleHistories = [];
  statusLogs = [];
  isConcurrentBookingActive = false;
});

// =============================================================================
// Test Suites
// =============================================================================

describe('Appointments API & Concurrency (CATMS-050, CATMS-051)', () => {
  // ── 1. Authentication & Role Permissions ──────────────────────────────────
  describe('Authentication and RBAC Guards', () => {
    it('rejects unauthenticated requests with 401 UNAUTHENTICATED', async () => {
      const res = await request(app).get('/api/v1/appointments');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects Clinician attempting to book an appointment with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T08:30:00.000Z',
          endAt: '2026-10-12T09:00:00.000Z',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects Clinician attempting to reschedule an appointment with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/reschedule')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          newStartAt: '2026-10-12T08:30:00.000Z',
          newEndAt: '2026-10-12T09:00:00.000Z',
          reason: 'Patient requested change',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects Clinician attempting to cancel an appointment with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/cancel')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          reason: 'Doctor sick',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects Reception attempting to mark an appointment Completed with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/complete')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          reason: 'Consultation concluded',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Clinician to mark an appointment Completed with 200 OK', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/complete')
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          reason: 'Consultation concluded successfully',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Completed');
    });

    it('allows Reception to book an appointment with 201 Created', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T08:30:00.000Z',
          endAt: '2026-10-12T09:00:00.000Z',
          notes: 'Routine visit',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.appointmentId).toBeDefined();
      expect(res.body.data.appointmentNumber).toMatch(/^APT-/);
      expect(res.body.data.status).toBe('Scheduled');
    });

    it('allows Admin to perform any scheduling action', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T08:30:00.000Z',
          endAt: '2026-10-12T09:00:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('Scheduled');
    });

    it('allows Manager and QA to read appointments', async () => {
      const mgrRes = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(mgrRes.status).toBe(200);

      const qaRes = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${qaToken}`);
      expect(qaRes.status).toBe(200);
    });
  });

  // ── 2. Branch Scope Isolation ─────────────────────────────────────────────
  describe('Branch Scope Isolation', () => {
    it('rejects Receptionist at Branch 2 attempting to book at Branch 1 with 403', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionBranch2Token}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1, // targeting branch 1 while user is branch 2
          specialtyId: 1,
          startAt: '2026-10-12T08:30:00.000Z',
          endAt: '2026-10-12T09:00:00.000Z',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('assigned clinic branch');
    });

    it('rejects Receptionist at Branch 2 attempting to view appointments of Branch 1', async () => {
      const res = await request(app)
        .get('/api/v1/appointments?branchId=1')
        .set('Authorization', `Bearer ${receptionBranch2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects Receptionist at Branch 2 accessing appointment 101 at Branch 1', async () => {
      const res = await request(app)
        .get('/api/v1/appointments/101')
        .set('Authorization', `Bearer ${receptionBranch2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Admin with branchId=all to book at any branch', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patientId: 2,
          doctorId: 2,
          branchId: 2,
          specialtyId: 1,
          startAt: '2026-10-12T15:00:00.000Z',
          endAt: '2026-10-12T15:30:00.000Z',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.branchId).toBe(2);
    });
  });

  // ── 3. Zod Validation & 15-Minute Grid Alignment ───────────────────────────
  describe('Zod Validation & 15-Minute Grid Constraints', () => {
    it('rejects timestamps that do not align to 15-minute grid (:00, :15, :30, :45)', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T09:07:00.000Z', // 07 minutes -> invalid
          endAt: '2026-10-12T09:37:00.000Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fieldErrors.some((fe: { field: string }) => fe.field === 'startAt')).toBe(true);
    });

    it('rejects endAt before or equal to startAt', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T10:00:00.000Z',
          endAt: '2026-10-12T09:30:00.000Z', // backwards
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fieldErrors.some((fe: { field: string }) => fe.field === 'endAt')).toBe(true);
    });

    it('rejects reschedule request missing reason', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/reschedule')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          newStartAt: '2026-10-12T08:30:00.000Z',
          newEndAt: '2026-10-12T09:00:00.000Z',
          reason: '', // empty
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.fieldErrors.some((fe: { field: string }) => fe.field === 'reason')).toBe(true);
    });

    it('rejects cancel request missing reason', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/cancel')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({}); // missing reason

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unrecognised client fields (strict schema)', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T08:30:00.000Z',
          endAt: '2026-10-12T09:00:00.000Z',
          status: 'Completed', // forged field
          appointmentNumber: 'FORGED-001', // forged field
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── 4. Endpoints Contracts & Data Delivery ────────────────────────────────
  describe('Endpoints Data Delivery Contracts', () => {
    it('GET /api/v1/appointments returns appointment list filtered by branch', async () => {
      const res = await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.every((a: { branchId: number }) => a.branchId === 1)).toBe(true);
      expect(res.body.meta.correlationId).toBeDefined();
    });

    it('GET /api/v1/appointments/availability returns recurring slots and exceptions', async () => {
      const res = await request(app)
        .get('/api/v1/appointments/availability?doctorId=2&branchId=1&date=2026-10-12')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.doctorId).toBe(2);
      expect(res.body.data.branchId).toBe(1);
      expect(res.body.data.date).toBe('2026-10-12');
      expect(res.body.data.dayOfWeek).toBe('Mon');
      expect(Array.isArray(res.body.data.recurringSlots)).toBe(true);
      expect(Array.isArray(res.body.data.exceptions)).toBe(true);
      expect(Array.isArray(res.body.data.bookedAppointments)).toBe(true);
      expect(res.body.data.recurringSlots.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/appointments/:id returns appointment detail with schedule history and logs', async () => {
      const res = await request(app)
        .get('/api/v1/appointments/101')
        .set('Authorization', `Bearer ${receptionToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.appointmentId).toBe(101);
      expect(res.body.data.patient).toBeDefined();
      expect(res.body.data.patient.patientNumber).toBe('PAT-001');
      expect(res.body.data.doctor).toBeDefined();
      expect(res.body.data.doctor.fullName).toBe('Dr. Sunil Silva');
      expect(Array.isArray(res.body.data.scheduleHistory)).toBe(true);
      expect(Array.isArray(res.body.data.statusLogs)).toBe(true);
    });

    it('GET /api/v1/appointments/:id returns 404 for nonexistent appointment', async () => {
      const res = await request(app)
        .get('/api/v1/appointments/9999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('POST /api/v1/appointments/walk-in sets bookingType to WalkIn', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/walk-in')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T08:30:00.000Z',
          endAt: '2026-10-12T09:00:00.000Z',
          notes: 'Emergency walk-in patient',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.bookingType).toBe('WalkIn');
    });

    it('POST /api/v1/appointments/:id/reschedule updates appointment start and end times', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/reschedule')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          newStartAt: '2026-10-12T08:30:00.000Z',
          newEndAt: '2026-10-12T09:00:00.000Z',
          reason: 'Patient rescheduled due to traffic',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.startAt).toBe('2026-10-12T08:30:00.000Z');
      expect(res.body.data.endAt).toBe('2026-10-12T09:00:00.000Z');
    });

    it('POST /api/v1/appointments/:id/cancel marks status as Cancelled', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/101/cancel')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          reason: 'Patient cancellation on phone call',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('Cancelled');
    });
  });

  // ── 5. Domain Error & Database Exception Mapping ──────────────────────────
  describe('Sanitized Error Mapping (No SQL Leaks)', () => {
    it('maps database GiST exclusion violation (23P01) to 409 APPOINTMENT_OVERLAP', async () => {
      // Slot 09:00 - 09:30 overlaps with existing appointment 101
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 2,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T09:00:00.000Z',
          endAt: '2026-10-12T09:30:00.000Z',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('APPOINTMENT_OVERLAP');
      expect(res.body.error.message).toBe('The requested slot overlaps with an existing appointment.');
      expect(res.body.meta.correlationId).toBeDefined();
      // Ensure zero internal SQL details are leaked
      expect(JSON.stringify(res.body)).not.toContain('tstzrange');
      expect(JSON.stringify(res.body)).not.toContain('ex_appointment_doctor_time_no_overlap');
      expect(JSON.stringify(res.body)).not.toContain('catms.');
    });

    it('maps doctor exception DA001 to 422 DOCTOR_UNAVAILABLE', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T11:00:00.000Z',
          endAt: '2026-10-12T11:30:00.000Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DOCTOR_UNAVAILABLE');
      expect(res.body.error.message).toBe('The doctor is unavailable at this time.');
    });

    it('maps out-of-availability DA002 to 422 DOCTOR_UNAVAILABLE', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/book')
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-10-12T23:00:00.000Z',
          endAt: '2026-10-12T23:30:00.000Z',
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DOCTOR_UNAVAILABLE');
      expect(res.body.error.message).toBe('Requested slot is outside of scheduled doctor availability.');
    });

    it('maps attempt to reschedule Completed appointment (A0002) to 409 CONFLICT', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/102/reschedule') // Appointment 102 is Completed
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({
          newStartAt: '2026-10-12T08:30:00.000Z',
          newEndAt: '2026-10-12T09:00:00.000Z',
          reason: 'Attempt reschedule terminal appointment',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('terminal state');
    });

    it('maps attempt to complete already Completed appointment (A0003) to 409 CONFLICT', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/102/complete') // Appointment 102 is Completed
        .set('Authorization', `Bearer ${clinicianToken}`)
        .send({
          reason: 'Duplicate complete attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      expect(res.body.error.message).toContain('terminal state');
    });
  });

  // ── 6. Concurrent Request Collision Test (CATMS-051 core) ─────────────────
  describe('Concurrent Booking Collision Handling', () => {
    it('when two competing requests target the exact same slot, exactly ONE succeeds (201) and the competitor receives 409 APPOINTMENT_OVERLAP', async () => {
      const payload = {
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-10-12T08:30:00.000Z',
        endAt: '2026-10-12T09:00:00.000Z',
        notes: 'Competing concurrent booking',
      };

      // Launch both requests concurrently via Promise.all
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/appointments/book')
          .set('Authorization', `Bearer ${receptionToken}`)
          .send(payload),
        request(app)
          .post('/api/v1/appointments/book')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(payload),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(201);
      expect(statuses).toContain(409);

      const successfulRes = res1.status === 201 ? res1 : res2;
      const failedRes = res1.status === 409 ? res1 : res2;

      // Successful response assertion
      expect(successfulRes.body.data.appointmentId).toBeDefined();
      expect(successfulRes.body.data.status).toBe('Scheduled');

      // Failed response assertion (sanitized domain error, zero DB internals)
      expect(failedRes.body.error.code).toBe('APPOINTMENT_OVERLAP');
      expect(failedRes.body.error.message).toBe('The requested slot overlaps with an existing appointment.');
      expect(failedRes.body.meta.correlationId).toBeDefined();
      expect(JSON.stringify(failedRes.body)).not.toContain('SQLSTATE');
      expect(JSON.stringify(failedRes.body)).not.toContain('ex_appointment_doctor_time_no_overlap');
    });
  });
});
