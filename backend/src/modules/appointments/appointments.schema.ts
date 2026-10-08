/**
 * src/modules/appointments/appointments.schema.ts
 * Owner: Dev1 | Issues: CATMS-050, CATMS-051
 *
 * Zod validation schemas for Appointment Scheduling endpoints.
 */

import { z } from 'zod';

function isValid15MinuteGrid(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d.getUTCMinutes() % 15 === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
}

export const bookAppointmentSchema = z
  .object({
    patientId: z.coerce.number().int().positive('patientId must be a positive integer'),
    doctorId: z.coerce.number().int().positive('doctorId must be a positive integer'),
    branchId: z.coerce.number().int().positive('branchId must be a positive integer'),
    specialtyId: z.coerce.number().int().positive('specialtyId must be a positive integer'),
    startAt: z.string().datetime({ message: 'startAt must be a valid ISO 8601 datetime' }),
    endAt: z.string().datetime({ message: 'endAt must be a valid ISO 8601 datetime' }),
    bookingType: z.enum(['Booked', 'WalkIn']).default('Booked'),
    notes: z.string().max(500).optional(),
  })
  .strict()
  .refine(
    (data) => new Date(data.endAt) > new Date(data.startAt),
    { message: 'endAt must be after startAt', path: ['endAt'] },
  )
  .refine(
    (data) => isValid15MinuteGrid(data.startAt),
    { message: 'startAt must align to a 15-minute boundary (:00, :15, :30, :45)', path: ['startAt'] },
  )
  .refine(
    (data) => isValid15MinuteGrid(data.endAt),
    { message: 'endAt must align to a 15-minute boundary (:00, :15, :30, :45)', path: ['endAt'] },
  );

export const walkInAppointmentSchema = z
  .object({
    patientId: z.coerce.number().int().positive('patientId must be a positive integer'),
    doctorId: z.coerce.number().int().positive('doctorId must be a positive integer'),
    branchId: z.coerce.number().int().positive('branchId must be a positive integer'),
    specialtyId: z.coerce.number().int().positive('specialtyId must be a positive integer'),
    startAt: z.string().datetime({ message: 'startAt must be a valid ISO 8601 datetime' }),
    endAt: z.string().datetime({ message: 'endAt must be a valid ISO 8601 datetime' }),
    notes: z.string().max(500).optional(),
  })
  .strict()
  .refine(
    (data) => new Date(data.endAt) > new Date(data.startAt),
    { message: 'endAt must be after startAt', path: ['endAt'] },
  )
  .refine(
    (data) => isValid15MinuteGrid(data.startAt),
    { message: 'startAt must align to a 15-minute boundary (:00, :15, :30, :45)', path: ['startAt'] },
  )
  .refine(
    (data) => isValid15MinuteGrid(data.endAt),
    { message: 'endAt must align to a 15-minute boundary (:00, :15, :30, :45)', path: ['endAt'] },
  );

export const rescheduleAppointmentSchema = z
  .object({
    newStartAt: z.string().datetime({ message: 'newStartAt must be a valid ISO 8601 datetime' }),
    newEndAt: z.string().datetime({ message: 'newEndAt must be a valid ISO 8601 datetime' }),
    reason: z.string().min(1, 'Reason for rescheduling is required').max(500),
  })
  .strict()
  .refine(
    (data) => new Date(data.newEndAt) > new Date(data.newStartAt),
    { message: 'newEndAt must be after newStartAt', path: ['newEndAt'] },
  )
  .refine(
    (data) => isValid15MinuteGrid(data.newStartAt),
    { message: 'newStartAt must align to a 15-minute boundary (:00, :15, :30, :45)', path: ['newStartAt'] },
  )
  .refine(
    (data) => isValid15MinuteGrid(data.newEndAt),
    { message: 'newEndAt must align to a 15-minute boundary (:00, :15, :30, :45)', path: ['newEndAt'] },
  );

export const cancelAppointmentSchema = z
  .object({
    reason: z.string().min(1, 'Reason for cancellation is required').max(500),
  })
  .strict();

export const completeAppointmentSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

export const appointmentListQuerySchema = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  doctorId: z.coerce.number().int().positive().optional(),
  patientId: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format').optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['Scheduled', 'Completed', 'Cancelled']).optional(),
  bookingType: z.enum(['Booked', 'WalkIn']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const doctorAvailabilityQuerySchema = z.object({
  doctorId: z.coerce.number().int().positive('doctorId must be a positive integer'),
  branchId: z.coerce.number().int().positive('branchId must be a positive integer'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format').optional(),
});
