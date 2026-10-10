/**
 * src/features/appointments/appointments.test.ts
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Unit and integration test suite for Appointment Scheduling APIs,
 * 15-minute grid validation, conflict detection, and audit trail retrieval.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { appointmentsApi, type AppointmentDto, type AppointmentDetailDto } from '../../api/appointments.api';
import { ApiError } from '../../api/errors';
import {
  APPOINTMENTS_QUERY_KEYS,
  formatTimeToIso,
  addMinutesToTime,
  parseNumericId,
  mapDtoToAppointment,
  TIME_SLOTS_30MIN,
} from './';

describe('CATMS-061 — Appointments and Scheduling Frontend Integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { document?: { cookie: string } }).document = {
      cookie: 'catms_csrf=test-csrf-token;',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  describe('1. Appointments API Client & Contract Unwrapping', () => {
    it('fetches appointments list unwrapped from API envelope with filters', async () => {
      const mockAppointments: AppointmentDto[] = [
        {
          appointmentId: 101,
          appointmentNumber: 'APT-20260809-0101',
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-08-09T09:00:00.000Z',
          endAt: '2026-08-09T09:30:00.000Z',
          status: 'Scheduled',
          bookingType: 'Booked',
          notes: 'Regular general checkup',
          createdBy: 1,
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-01T08:00:00.000Z',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockAppointments }),
      });

      const result = await appointmentsApi.getAppointments({
        branchId: 1,
        date: '2026-08-09',
        status: 'Scheduled',
      });

      expect(result).toHaveLength(1);
      expect(result[0].appointmentNumber).toBe('APT-20260809-0101');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/appointments?branchId=1&date=2026-08-09&status=Scheduled'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('retrieves single appointment with audit history and status logs', async () => {
      const mockDetail: AppointmentDetailDto = {
        appointmentId: 101,
        appointmentNumber: 'APT-20260809-0101',
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T10:00:00.000Z',
        endAt: '2026-08-09T10:30:00.000Z',
        status: 'Scheduled',
        bookingType: 'Booked',
        notes: 'Follow-up',
        createdBy: 1,
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-05T08:00:00.000Z',
        scheduleHistory: [
          {
            historyId: 1,
            appointmentId: 101,
            oldStartAt: '2026-08-09T09:00:00.000Z',
            oldEndAt: '2026-08-09T09:30:00.000Z',
            newStartAt: '2026-08-09T10:00:00.000Z',
            newEndAt: '2026-08-09T10:30:00.000Z',
            reason: 'Patient requested later time',
            changedByEmployeeId: 1,
            changedAt: '2026-08-05T08:00:00.000Z',
          },
        ],
        statusLogs: [
          {
            logId: 1,
            appointmentId: 101,
            oldStatus: 'Scheduled',
            newStatus: 'Scheduled',
            reason: 'Booking created',
            changedByEmployeeId: 1,
            changedAt: '2026-08-01T08:00:00.000Z',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockDetail }),
      });

      const detail = await appointmentsApi.getAppointmentById(101);
      expect(detail.appointmentId).toBe(101);
      expect(detail.scheduleHistory).toHaveLength(1);
      expect(detail.scheduleHistory[0].reason).toBe('Patient requested later time');
      expect(detail.statusLogs).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/appointments/101',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('fetches doctor availability slots and exceptions', async () => {
      const mockAvailability = {
        doctorId: 2,
        branchId: 1,
        date: '2026-08-09',
        dayOfWeek: 'Sun',
        recurringSlots: [{ startTime: '09:00:00', endTime: '13:00:00' }],
        exceptions: [],
        bookedAppointments: [
          {
            appointmentId: 101,
            startAt: '2026-08-09T09:00:00.000Z',
            endAt: '2026-08-09T09:30:00.000Z',
            status: 'Scheduled' as const,
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockAvailability }),
      });

      const avail = await appointmentsApi.getDoctorAvailability(2, 1, '2026-08-09');
      expect(avail.doctorId).toBe(2);
      expect(avail.recurringSlots).toHaveLength(1);
      expect(avail.bookedAppointments).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/appointments/availability?doctorId=2&branchId=1&date=2026-08-09'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('books appointment via POST /api/v1/appointments/book', async () => {
      const createdDto: AppointmentDto = {
        appointmentId: 201,
        appointmentNumber: 'APT-20260809-0201',
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T14:00:00.000Z',
        endAt: '2026-08-09T14:30:00.000Z',
        status: 'Scheduled',
        bookingType: 'Booked',
        notes: 'Hypertension checkup',
        createdBy: 1,
        createdAt: '2026-08-09T07:00:00.000Z',
        updatedAt: '2026-08-09T07:00:00.000Z',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: createdDto }),
      });

      const res = await appointmentsApi.book({
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T14:00:00.000Z',
        endAt: '2026-08-09T14:30:00.000Z',
        notes: 'Hypertension checkup',
      });

      expect(res.appointmentId).toBe(201);
      expect(res.status).toBe('Scheduled');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/appointments/book',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-CSRF-Token': 'test-csrf-token',
          }),
        }),
      );
    });

    it('creates walk-in appointment via POST /api/v1/appointments/walk-in', async () => {
      const walkInDto: AppointmentDto = {
        appointmentId: 202,
        appointmentNumber: 'APT-20260809-0202',
        patientId: 3,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T15:00:00.000Z',
        endAt: '2026-08-09T15:30:00.000Z',
        status: 'Scheduled',
        bookingType: 'WalkIn',
        notes: 'Urgent headache',
        createdBy: 1,
        createdAt: '2026-08-09T07:00:00.000Z',
        updatedAt: '2026-08-09T07:00:00.000Z',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: walkInDto }),
      });

      const res = await appointmentsApi.walkIn({
        patientId: 3,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T15:00:00.000Z',
        endAt: '2026-08-09T15:30:00.000Z',
        notes: 'Urgent headache',
      });

      expect(res.bookingType).toBe('WalkIn');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/appointments/walk-in',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('reschedules appointment via POST /api/v1/appointments/:id/reschedule', async () => {
      const updatedDto: AppointmentDto = {
        appointmentId: 101,
        appointmentNumber: 'APT-20260809-0101',
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T16:00:00.000Z',
        endAt: '2026-08-09T16:30:00.000Z',
        status: 'Scheduled',
        bookingType: 'Booked',
        notes: 'Rescheduled',
        createdBy: 1,
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-09T07:00:00.000Z',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: updatedDto }),
      });

      const res = await appointmentsApi.reschedule(101, {
        newStartAt: '2026-08-09T16:00:00.000Z',
        newEndAt: '2026-08-09T16:30:00.000Z',
        reason: 'Doctor emergency delay',
      });

      expect(res.startAt).toBe('2026-08-09T16:00:00.000Z');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/appointments/101/reschedule',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('cancels appointment via POST /api/v1/appointments/:id/cancel', async () => {
      const cancelledDto: AppointmentDto = {
        appointmentId: 101,
        appointmentNumber: 'APT-20260809-0101',
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T09:00:00.000Z',
        endAt: '2026-08-09T09:30:00.000Z',
        status: 'Cancelled',
        bookingType: 'Booked',
        notes: null,
        createdBy: 1,
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-09T07:00:00.000Z',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: cancelledDto }),
      });

      const res = await appointmentsApi.cancel(101, 'Patient cannot attend');
      expect(res.status).toBe('Cancelled');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/appointments/101/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'Patient cannot attend' }),
        }),
      );
    });

    it('completes appointment via POST /api/v1/appointments/:id/complete', async () => {
      const completedDto: AppointmentDto = {
        appointmentId: 101,
        appointmentNumber: 'APT-20260809-0101',
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T09:00:00.000Z',
        endAt: '2026-08-09T09:30:00.000Z',
        status: 'Completed',
        bookingType: 'Booked',
        notes: null,
        createdBy: 1,
        createdAt: '2026-08-01T08:00:00.000Z',
        updatedAt: '2026-08-09T09:30:00.000Z',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: completedDto }),
      });

      const res = await appointmentsApi.complete(101);
      expect(res.status).toBe('Completed');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/appointments/101/complete',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('2. Conflict & Overlap Error Handling', () => {
    it('throws ApiError with APPOINTMENT_OVERLAP on 409 conflict', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'APPOINTMENT_OVERLAP',
            message: 'The doctor already has an appointment in that time range.',
            fieldErrors: [],
          },
          meta: { correlationId: 'corr-409' },
        }),
      });

      await expect(
        appointmentsApi.book({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-08-09T09:00:00.000Z',
          endAt: '2026-08-09T09:30:00.000Z',
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe('APPOINTMENT_OVERLAP');
        expect(apiErr.isConflict()).toBe(true);
        expect(apiErr.message).toBe('The doctor already has an appointment in that time range.');
        return true;
      });
    });

    it('throws ApiError with DOCTOR_UNAVAILABLE on 422 schedule violation', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: 'DOCTOR_UNAVAILABLE',
            message: 'Requested slot is outside of scheduled doctor availability.',
            fieldErrors: [],
          },
          meta: { correlationId: 'corr-422' },
        }),
      });

      await expect(
        appointmentsApi.book({
          patientId: 1,
          doctorId: 2,
          branchId: 1,
          specialtyId: 1,
          startAt: '2026-08-09T06:00:00.000Z',
          endAt: '2026-08-09T06:30:00.000Z',
        }),
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.code).toBe('DOCTOR_UNAVAILABLE');
        return true;
      });
    });
  });

  describe('3. Utilities & 15-Minute Grid Calculations', () => {
    it('generates 30-minute time slots starting from 08:00', () => {
      expect(TIME_SLOTS_30MIN).toContain('08:00');
      expect(TIME_SLOTS_30MIN).toContain('11:30');
      expect(TIME_SLOTS_30MIN).toContain('16:00');
      expect(TIME_SLOTS_30MIN.length).toBe(17);
    });

    it('adds minutes to time string correctly', () => {
      expect(addMinutesToTime('08:00', 30)).toBe('08:30');
      expect(addMinutesToTime('09:45', 30)).toBe('10:15');
      expect(addMinutesToTime('11:30', 45)).toBe('12:15');
    });

    it('formats date and time into UTC ISO 8601 aligned on 15-minute grid', () => {
      const iso = formatTimeToIso('2026-08-09', '09:30');
      expect(iso).toBe('2026-08-09T09:30:00.000Z');
      const d = new Date(iso);
      expect(d.getUTCMinutes() % 15).toBe(0);
      expect(d.getUTCSeconds()).toBe(0);
      expect(d.getUTCMilliseconds()).toBe(0);
    });

    it('parses numeric IDs from string keys', () => {
      expect(parseNumericId('b1')).toBe(1);
      expect(parseNumericId('e3')).toBe(3);
      expect(parseNumericId('p12')).toBe(12);
      expect(parseNumericId(42)).toBe(42);
      expect(parseNumericId('101')).toBe(101);
    });

    it('maps backend AppointmentDto to frontend Appointment model', () => {
      const dto: AppointmentDto = {
        appointmentId: 101,
        appointmentNumber: 'APT-20260809-0101',
        patientId: 1,
        doctorId: 2,
        branchId: 1,
        specialtyId: 1,
        startAt: '2026-08-09T09:00:00.000Z',
        endAt: '2026-08-09T09:30:00.000Z',
        status: 'Scheduled',
        bookingType: 'WalkIn',
        notes: 'Walk-in emergency',
        createdBy: 1,
        createdAt: '2026-08-09T08:00:00.000Z',
        updatedAt: '2026-08-09T08:00:00.000Z',
      };

      const apt = mapDtoToAppointment(dto);
      expect(apt.id).toBe('101');
      expect(apt.reference).toBe('APT-20260809-0101');
      expect(apt.patientId).toBe('1');
      expect(apt.doctorId).toBe('2');
      expect(apt.branchId).toBe('1');
      expect(apt.date).toBe('2026-08-09');
      expect(apt.start).toBe('09:00');
      expect(apt.end).toBe('09:30');
      expect(apt.status).toBe('Scheduled');
      expect(apt.source).toBe('Walk-in');
      expect(apt.reason).toBe('Walk-in emergency');
    });

    it('maintains structured APPOINTMENTS_QUERY_KEYS', () => {
      expect(APPOINTMENTS_QUERY_KEYS.all).toEqual(['appointments']);
      expect(APPOINTMENTS_QUERY_KEYS.list({ date: '2026-08-09' })).toEqual([
        'appointments',
        'list',
        { date: '2026-08-09' },
      ]);
      expect(APPOINTMENTS_QUERY_KEYS.detail(101)).toEqual([
        'appointments',
        'detail',
        101,
      ]);
      expect(APPOINTMENTS_QUERY_KEYS.availability(2, 1, '2026-08-09')).toEqual([
        'appointments',
        'availability',
        { doctorId: 2, branchId: 1, date: '2026-08-09' },
      ]);
    });
  });
});
