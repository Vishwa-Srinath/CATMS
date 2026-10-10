/**
 * src/features/appointments/utils.ts
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Date, time, 15-minute grid, and DTO mapping utilities for Appointment Scheduling.
 */

import type { AppointmentDto } from '../../api/appointments.api';
import type { Appointment } from '../../types';

export const TIME_SLOTS_30MIN = Array.from({ length: 17 }, (_, index) => {
  const minutes = 8 * 60 + index * 30; // 08:00 to 16:00
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
});

export const TIME_SLOTS_15MIN = Array.from({ length: 33 }, (_, index) => {
  const minutes = 8 * 60 + index * 15; // 08:00 to 16:00
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
});

export function parseNumericId(id: string | number | undefined | null): number {
  if (typeof id === 'number') return id;
  if (!id) return 1;
  const match = String(id).match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

export function addMinutesToTime(time: string, minutesToAdd: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutesToAdd;
  const clamped = Math.max(0, total);
  const hh = String(Math.floor(clamped / 60)).padStart(2, '0');
  const mm = String(clamped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Combines date (YYYY-MM-DD) and time (HH:mm) into a strict UTC ISO 8601 string
 * aligned with database 15-minute grid requirements.
 */
export function formatTimeToIso(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Round minute to nearest 15-minute boundary if needed
  const normalizedMinute = Math.floor((minute ?? 0) / 15) * 15;

  const dateObj = new Date(Date.UTC(year!, month! - 1, day!, hour!, normalizedMinute, 0, 0));
  return dateObj.toISOString();
}

/**
 * Extracts YYYY-MM-DD from an ISO string.
 */
export function isoToDateString(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/**
 * Extracts HH:mm from an ISO string (UTC).
 */
export function isoToTimeString(iso: string): string {
  if (!iso || !iso.includes('T')) return '';
  return iso.slice(11, 16);
}

/**
 * Maps backend AppointmentDto into frontend Appointment model.
 */
export function mapDtoToAppointment(dto: AppointmentDto): Appointment {
  const dateStr = isoToDateString(dto.startAt);
  const startStr = isoToTimeString(dto.startAt);
  const endStr = isoToTimeString(dto.endAt);

  return {
    id: String(dto.appointmentId),
    reference: dto.appointmentNumber,
    patientId: String(dto.patientId),
    doctorId: String(dto.doctorId),
    branchId: String(dto.branchId),
    date: dateStr,
    start: startStr,
    end: endStr,
    status: dto.status,
    source: dto.bookingType === 'WalkIn' ? 'Walk-in' : 'Booked',
    reason: dto.notes ?? '',
    createdBy: String(dto.createdBy),
    updatedAt: dto.updatedAt,
  };
}

/**
 * Format audit history timestamp.
 */
export function formatAuditDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC';
}
