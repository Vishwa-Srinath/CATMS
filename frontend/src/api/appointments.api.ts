/**
 * src/api/appointments.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Appointments & scheduling API client.
 */

import { apiClient } from './client';

export interface AppointmentDto {
  appointmentId: number;
  appointmentRef: string;
  patientId: number;
  patientName: string;
  patientNo: string;
  doctorId: number;
  doctorName: string;
  branchId: number;
  branchName: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  source: 'Booked' | 'WalkIn';
  reason?: string;
  cancellationReason?: string;
}

export interface AppointmentListParams {
  branchId?: number;
  doctorId?: number;
  date?: string;
  status?: string;
  patientId?: number;
}

export interface BookAppointmentInput {
  patientId: number;
  doctorId: number;
  branchId: number;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason?: string;
}

export interface WalkInAppointmentInput {
  patientId: number;
  doctorId: number;
  branchId: number;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason?: string;
}

export interface RescheduleAppointmentInput {
  appointmentDate: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export const appointmentsApi = {
  getAppointments: (params?: AppointmentListParams) =>
    apiClient.get<AppointmentDto[]>('/appointments', { params }),

  getDoctorAvailability: (doctorId: number, date: string) =>
    apiClient.get<{ availableSlots: Array<{ start: string; end: string }> }>(
      '/appointments/availability',
      { params: { doctorId, date } },
    ),

  book: (data: BookAppointmentInput) =>
    apiClient.post<AppointmentDto>('/appointments', data),

  walkIn: (data: WalkInAppointmentInput) =>
    apiClient.post<AppointmentDto>('/appointments/walk-in', data),

  reschedule: (appointmentId: number, data: RescheduleAppointmentInput) =>
    apiClient.patch<AppointmentDto>(`/appointments/${appointmentId}/reschedule`, data),

  cancel: (appointmentId: number, reason: string) =>
    apiClient.patch<AppointmentDto>(`/appointments/${appointmentId}/cancel`, { reason }),

  complete: (appointmentId: number) =>
    apiClient.patch<AppointmentDto>(`/appointments/${appointmentId}/complete`, {}),
};
