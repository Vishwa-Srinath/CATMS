/**
 * src/contracts/appointments.contract.ts
 * Owner: Dev1 | Issues: CATMS-050, CATMS-051
 *
 * Data Transfer Objects (DTOs) and request inputs for Appointment Scheduling API.
 */

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled';
export type BookingType = 'Booked' | 'WalkIn';

export interface AppointmentDto {
  appointmentId: number;
  appointmentNumber: string;
  patientId: number;
  doctorId: number;
  branchId: number;
  specialtyId: number;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  bookingType: BookingType;
  notes: string | null;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  patient?: {
    patientId: number;
    patientNumber: string;
    fullName: string;
    contactNumber: string;
  };
  doctor?: {
    doctorId: number;
    fullName: string;
    medicalLicenseNo: string;
  };
  branch?: {
    branchId: number;
    branchCode: string;
    name: string;
  };
  specialty?: {
    specialtyId: number;
    specialtyCode: string;
    name: string;
  };
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

export interface BookAppointmentInput {
  patientId: number;
  doctorId: number;
  branchId: number;
  specialtyId: number;
  startAt: string;
  endAt: string;
  bookingType?: BookingType | undefined;
  notes?: string | undefined;
}

export interface RescheduleAppointmentInput {
  newStartAt: string;
  newEndAt: string;
  reason: string;
}

export interface CancelAppointmentInput {
  reason: string;
}

export interface CompleteAppointmentInput {
  reason?: string | undefined;
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
  branchId?: number | undefined;
  doctorId?: number | undefined;
  patientId?: number | undefined;
  date?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  status?: AppointmentStatus | undefined;
  bookingType?: BookingType | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}
