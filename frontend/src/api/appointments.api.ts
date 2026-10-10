/**
 * src/api/appointments.api.ts
 * Owner: Dev1 | Issues: CATMS-050, CATMS-051, CATMS-056, CATMS-061
 *
 * Appointments & scheduling API client aligned with backend contracts and Zod schemas.
 */

import { apiClient } from './client';

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled';
export type BookingType = 'Booked' | 'WalkIn';

export interface AppointmentPatientDto {
  patientId: number;
  patientNumber: string;
  fullName: string;
  contactNumber: string;
}

export interface AppointmentDoctorDto {
  doctorId: number;
  fullName: string;
  medicalLicenseNo: string;
}

export interface AppointmentBranchDto {
  branchId: number;
  branchCode: string;
  name: string;
}

export interface AppointmentSpecialtyDto {
  specialtyId: number;
  specialtyCode: string;
  name: string;
}

export interface AppointmentDto {
  appointmentId: number;
  appointmentNumber: string;
  patientId: number;
  doctorId: number;
  branchId: number;
  specialtyId: number;
  startAt: string; // ISO 8601 e.g. 2026-08-09T08:30:00.000Z
  endAt: string;   // ISO 8601
  status: AppointmentStatus;
  bookingType: BookingType;
  notes: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  patient?: AppointmentPatientDto;
  doctor?: AppointmentDoctorDto;
  branch?: AppointmentBranchDto;
  specialty?: AppointmentSpecialtyDto;
}

export interface AppointmentScheduleHistoryDto {
  historyId: number;
  appointmentId: number;
  oldStartAt: string;
  oldEndAt: string;
  newStartAt: string;
  newEndAt: string;
  reason: string;
  changedByEmployeeId: number;
  changedAt: string;
}

export interface AppointmentStatusLogDto {
  logId: number;
  appointmentId: number;
  oldStatus: AppointmentStatus;
  newStatus: AppointmentStatus;
  reason: string | null;
  changedByEmployeeId: number;
  changedAt: string;
}

export interface AppointmentDetailDto extends AppointmentDto {
  scheduleHistory: AppointmentScheduleHistoryDto[];
  statusLogs: AppointmentStatusLogDto[];
}

export interface DoctorAvailabilityDto {
  doctorId: number;
  branchId: number;
  date: string;
  dayOfWeek: string;
  recurringSlots: Array<{
    startTime: string;
    endTime: string;
  }>;
  exceptions: Array<{
    exceptionType: 'ExtraHours' | 'Unavailable';
    startAt: string;
    endAt: string;
  }>;
  bookedAppointments: Array<{
    appointmentId: number;
    startAt: string;
    endAt: string;
    status: AppointmentStatus;
  }>;
}

export interface AppointmentListFilters {
  branchId?: number;
  doctorId?: number;
  patientId?: number;
  date?: string; // YYYY-MM-DD
  startDate?: string;
  endDate?: string;
  status?: AppointmentStatus;
  bookingType?: BookingType;
  limit?: number;
  offset?: number;
}

// Legacy alias for backwards compatibility
export type AppointmentListParams = AppointmentListFilters;

export interface BookAppointmentInput {
  patientId: number;
  doctorId: number;
  branchId: number;
  specialtyId: number;
  startAt: string; // ISO 8601, 15-minute grid
  endAt: string;   // ISO 8601, 15-minute grid
  bookingType?: BookingType;
  notes?: string;
}

export interface WalkInAppointmentInput {
  patientId: number;
  doctorId: number;
  branchId: number;
  specialtyId: number;
  startAt: string; // ISO 8601, 15-minute grid
  endAt: string;   // ISO 8601, 15-minute grid
  notes?: string;
}

export interface RescheduleAppointmentInput {
  newStartAt: string; // ISO 8601, 15-minute grid
  newEndAt: string;   // ISO 8601, 15-minute grid
  reason: string;
}

export interface CancelAppointmentInput {
  reason: string;
}

export interface CompleteAppointmentInput {
  reason?: string;
}

export const appointmentsApi = {
  getAppointments: (params?: AppointmentListFilters) =>
    apiClient.get<AppointmentDto[]>('/appointments', { params }),

  getAppointmentById: (appointmentId: number) =>
    apiClient.get<AppointmentDetailDto>(`/appointments/${appointmentId}`),

  getDoctorAvailability: (doctorId: number, branchId: number, date?: string) =>
    apiClient.get<DoctorAvailabilityDto>('/appointments/availability', {
      params: { doctorId, branchId, date },
    }),

  book: (data: BookAppointmentInput) =>
    apiClient.post<AppointmentDto>('/appointments/book', data),

  walkIn: (data: WalkInAppointmentInput) =>
    apiClient.post<AppointmentDto>('/appointments/walk-in', data),

  reschedule: (appointmentId: number, data: RescheduleAppointmentInput) =>
    apiClient.post<AppointmentDto>(`/appointments/${appointmentId}/reschedule`, data),

  cancel: (appointmentId: number, data: CancelAppointmentInput | string) => {
    const payload: CancelAppointmentInput =
      typeof data === 'string' ? { reason: data } : data;
    return apiClient.post<AppointmentDto>(`/appointments/${appointmentId}/cancel`, payload);
  },

  complete: (appointmentId: number, data?: CompleteAppointmentInput) =>
    apiClient.post<AppointmentDto>(`/appointments/${appointmentId}/complete`, data ?? {}),
};
