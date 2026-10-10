/**
 * src/features/appointments/hooks/useAppointments.ts
 * Owner: Dev1 | Issue: CATMS-061
 *
 * TanStack Query hooks for Appointment Scheduling, Availability, and Lifecycle Management.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  appointmentsApi,
  type AppointmentDto,
  type AppointmentDetailDto,
  type DoctorAvailabilityDto,
  type AppointmentListFilters,
  type BookAppointmentInput,
  type WalkInAppointmentInput,
  type RescheduleAppointmentInput,
  type CompleteAppointmentInput,
} from '../../../api/appointments.api';
import { ApiError } from '../../../api/errors';

export const APPOINTMENTS_QUERY_KEYS = {
  all: ['appointments'] as const,
  lists: () => ['appointments', 'list'] as const,
  list: (filters?: AppointmentListFilters) => ['appointments', 'list', filters] as const,
  details: () => ['appointments', 'detail'] as const,
  detail: (id: number) => ['appointments', 'detail', id] as const,
  availability: (doctorId?: number, branchId?: number, date?: string) =>
    ['appointments', 'availability', { doctorId, branchId, date }] as const,
};

// ── Hook: List Appointments ──────────────────────────────────────────────────
export function useAppointments(
  filters?: AppointmentListFilters,
  options?: { enabled?: boolean },
) {
  return useQuery<AppointmentDto[], ApiError>({
    queryKey: APPOINTMENTS_QUERY_KEYS.list(filters),
    queryFn: () => appointmentsApi.getAppointments(filters),
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
    retry: 1,
  });
}

// ── Hook: Single Appointment Detail with Audit Trail ──────────────────────────
export function useAppointmentDetail(
  appointmentId: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery<AppointmentDetailDto, ApiError>({
    queryKey: APPOINTMENTS_QUERY_KEYS.detail(appointmentId ?? 0),
    queryFn: () => appointmentsApi.getAppointmentById(appointmentId!),
    enabled: Boolean(appointmentId) && (options?.enabled ?? true),
    staleTime: 10_000,
  });
}

// ── Hook: Doctor Availability & Schedule Exceptions ──────────────────────────
export function useDoctorAvailability(
  doctorId?: number,
  branchId?: number,
  date?: string,
  options?: { enabled?: boolean },
) {
  const isEnabled = Boolean(doctorId && branchId) && (options?.enabled ?? true);

  return useQuery<DoctorAvailabilityDto, ApiError>({
    queryKey: APPOINTMENTS_QUERY_KEYS.availability(doctorId, branchId, date),
    queryFn: () => appointmentsApi.getDoctorAvailability(doctorId!, branchId!, date),
    enabled: isEnabled,
    staleTime: 30_000,
  });
}

// ── Mutation: Book Appointment ───────────────────────────────────────────────
export function useBookAppointment() {
  const queryClient = useQueryClient();

  return useMutation<AppointmentDto, ApiError, BookAppointmentInput>({
    mutationFn: (data) => appointmentsApi.book(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.all });
    },
  });
}

// ── Mutation: Walk-in Appointment ─────────────────────────────────────────────
export function useWalkInAppointment() {
  const queryClient = useQueryClient();

  return useMutation<AppointmentDto, ApiError, WalkInAppointmentInput>({
    mutationFn: (data) => appointmentsApi.walkIn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.all });
    },
  });
}

// ── Mutation: Reschedule Appointment ──────────────────────────────────────────
export function useRescheduleAppointment() {
  const queryClient = useQueryClient();

  return useMutation<
    AppointmentDto,
    ApiError,
    { id: number; data: RescheduleAppointmentInput }
  >({
    mutationFn: ({ id, data }) => appointmentsApi.reschedule(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.detail(variables.id) });
    },
  });
}

// ── Mutation: Cancel Appointment ──────────────────────────────────────────────
export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation<AppointmentDto, ApiError, { id: number; reason: string }>({
    mutationFn: ({ id, reason }) => appointmentsApi.cancel(id, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.detail(variables.id) });
    },
  });
}

// ── Mutation: Complete Appointment ────────────────────────────────────────────
export function useCompleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation<
    AppointmentDto,
    ApiError,
    { id: number; data?: CompleteAppointmentInput }
  >({
    mutationFn: ({ id, data }) => appointmentsApi.complete(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: APPOINTMENTS_QUERY_KEYS.detail(variables.id) });
    },
  });
}
