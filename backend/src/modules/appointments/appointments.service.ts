/**
 * src/modules/appointments/appointments.service.ts
 * Owner: Dev1 | Issues: CATMS-050, CATMS-051
 *
 * Core service operations for Appointment Scheduling:
 *   - List appointments with branch scoping and filters
 *   - Retrieve appointment details including schedule history and status logs
 *   - Query doctor availability and exceptions for a specific date
 *   - Book appointments via stored procedure catms.book_appointment
 *   - Reschedule appointments via stored procedure catms.reschedule_appointment
 *   - Cancel appointments via stored procedure catms.cancel_appointment
 *   - Complete appointments via stored procedure catms.update_appointment_status
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003, CATMS-029, CATMS-030):
 *   - All mutations execute inside withTransaction().
 *   - Stored procedures handle business rule verification and atomic state changes.
 *   - Parameterized SQL only — no ORM.
 *   - Single-branch roles (Reception, Clinician, Manager) are locked to their assigned branch.
 */

import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../shared/errors';
import type { JwtPayload } from '../../app/middleware/auth';
import type {
  AppointmentDto,
  AppointmentDetailDto,
  AppointmentScheduleHistoryDto,
  AppointmentStatusLogDto,
  DoctorAvailabilityDto,
  AppointmentListFilters,
  BookAppointmentInput,
  RescheduleAppointmentInput,
  CancelAppointmentInput,
  CompleteAppointmentInput,
} from '../../contracts/appointments.contract';

export class AppointmentsService {
  /**
   * Helper to format an appointment database row into an AppointmentDto.
   */
  private mapAppointmentRow(r: Record<string, unknown>): AppointmentDto {
    return {
      appointmentId: Number(r['appointment_id']),
      appointmentNumber: String(r['appointment_number']),
      patientId: Number(r['patient_id']),
      doctorId: Number(r['doctor_id']),
      branchId: Number(r['branch_id']),
      specialtyId: Number(r['specialty_id']),
      startAt: new Date(r['start_at'] as string | Date).toISOString(),
      endAt: new Date(r['end_at'] as string | Date).toISOString(),
      status: r['status'] as AppointmentDto['status'],
      bookingType: r['booking_type'] as AppointmentDto['bookingType'],
      notes: r['notes'] ? String(r['notes']) : null,
      createdBy: Number(r['created_by']),
      createdAt: new Date(r['created_at'] as string | Date).toISOString(),
      updatedAt: new Date(r['updated_at'] as string | Date).toISOString(),
      patient: {
        patientId: Number(r['patient_id']),
        patientNumber: String(r['patient_number']),
        fullName: String(r['patient_name']),
        contactNumber: String(r['patient_contact']),
      },
      doctor: {
        doctorId: Number(r['doctor_id']),
        fullName: String(r['doctor_name']),
        medicalLicenseNo: String(r['doctor_license']),
      },
      branch: {
        branchId: Number(r['branch_id']),
        branchCode: String(r['branch_code']),
        name: String(r['branch_name']),
      },
      specialty: {
        specialtyId: Number(r['specialty_id']),
        specialtyCode: String(r['specialty_code']),
        name: String(r['specialty_name']),
      },
    };
  }

  /**
   * Fetches an appointment by ID with all related entity joins.
   */
  private async fetchAppointmentById(
    clientOrPool: Pool | PoolClient,
    appointmentId: number,
  ): Promise<AppointmentDto> {
    const res = await clientOrPool.query(
      `SELECT
         a.appointment_id,
         a.appointment_number,
         a.patient_id,
         a.doctor_id,
         a.branch_id,
         a.specialty_id,
         a.start_at,
         a.end_at,
         a.status,
         a.booking_type,
         a.notes,
         a.created_by,
         a.created_at,
         a.updated_at,
         p.patient_number,
         TRIM(CONCAT(p.first_name, ' ', p.last_name)) AS patient_name,
         p.contact_number AS patient_contact,
         de.full_name AS doctor_name,
         dp.medical_license_no AS doctor_license,
         b.branch_code,
         b.name AS branch_name,
         s.specialty_code,
         s.name AS specialty_name
       FROM catms.appointment a
       JOIN catms.patient p ON a.patient_id = p.patient_id
       JOIN catms.doctor_profile dp ON a.doctor_id = dp.doctor_id
       JOIN catms.employee de ON dp.doctor_id = de.employee_id
       JOIN catms.branch b ON a.branch_id = b.branch_id
       JOIN catms.specialty s ON a.specialty_id = s.specialty_id
       WHERE a.appointment_id = $1`,
      [appointmentId],
    );

    if (res.rows.length === 0) {
      throw AppError.notFound('Appointment not found.');
    }

    return this.mapAppointmentRow(res.rows[0]);
  }

  /**
   * Enforces branch scope for individual resource operations.
   */
  private verifyBranchAccess(appointmentBranchId: number, user: JwtPayload): void {
    const role = (user.role || '').toLowerCase().trim();
    if (role === 'admin' || role === 'qa') {
      return;
    }
    if (user.branchId !== 'all' && Number(user.branchId) !== appointmentBranchId) {
      throw AppError.forbidden('Forbidden: You can only access data for your assigned clinic branch.');
    }
  }

  /**
   * Lists appointments with multi-field filtering and mandatory branch scoping.
   */
  async listAppointments(
    filters: AppointmentListFilters,
    user: JwtPayload,
  ): Promise<AppointmentDto[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    const role = (user.role || '').toLowerCase().trim();
    const isGlobalRole = role === 'admin' || role === 'qa';

    // 1. Branch scoping
    if (!isGlobalRole && user.branchId !== 'all') {
      values.push(Number(user.branchId));
      conditions.push(`a.branch_id = $${values.length}`);
    } else if (filters.branchId !== undefined) {
      values.push(filters.branchId);
      conditions.push(`a.branch_id = $${values.length}`);
    }

    // 2. Doctor filter
    if (filters.doctorId !== undefined) {
      values.push(filters.doctorId);
      conditions.push(`a.doctor_id = $${values.length}`);
    }

    // 3. Patient filter
    if (filters.patientId !== undefined) {
      values.push(filters.patientId);
      conditions.push(`a.patient_id = $${values.length}`);
    }

    // 4. Exact Date filter (YYYY-MM-DD)
    if (filters.date) {
      values.push(filters.date);
      conditions.push(`a.start_at::date = $${values.length}::date`);
    }

    // 5. Date Range filter
    if (filters.startDate) {
      values.push(filters.startDate);
      conditions.push(`a.start_at >= $${values.length}`);
    }
    if (filters.endDate) {
      values.push(filters.endDate);
      conditions.push(`a.end_at <= $${values.length}`);
    }

    // 6. Status filter
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`a.status = $${values.length}`);
    }

    // 7. Booking Type filter
    if (filters.bookingType) {
      values.push(filters.bookingType);
      conditions.push(`a.booking_type = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    values.push(limit);
    const limitPlaceholder = `$${values.length}`;
    values.push(offset);
    const offsetPlaceholder = `$${values.length}`;

    const sql = `
      SELECT
        a.appointment_id,
        a.appointment_number,
        a.patient_id,
        a.doctor_id,
        a.branch_id,
        a.specialty_id,
        a.start_at,
        a.end_at,
        a.status,
        a.booking_type,
        a.notes,
        a.created_by,
        a.created_at,
        a.updated_at,
        p.patient_number,
        TRIM(CONCAT(p.first_name, ' ', p.last_name)) AS patient_name,
        p.contact_number AS patient_contact,
        de.full_name AS doctor_name,
        dp.medical_license_no AS doctor_license,
        b.branch_code,
        b.name AS branch_name,
        s.specialty_code,
        s.name AS specialty_name
      FROM catms.appointment a
      JOIN catms.patient p ON a.patient_id = p.patient_id
      JOIN catms.doctor_profile dp ON a.doctor_id = dp.doctor_id
      JOIN catms.employee de ON dp.doctor_id = de.employee_id
      JOIN catms.branch b ON a.branch_id = b.branch_id
      JOIN catms.specialty s ON a.specialty_id = s.specialty_id
      ${whereClause}
      ORDER BY a.start_at ASC, a.appointment_id ASC
      LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
    `;

    const res = await pool.query(sql, values);
    return res.rows.map((r) => this.mapAppointmentRow(r));
  }

  /**
   * Retrieves single appointment details, schedule history, and status audit logs.
   */
  async getAppointmentById(
    appointmentId: number,
    user: JwtPayload,
  ): Promise<AppointmentDetailDto> {
    const appointment = await this.fetchAppointmentById(pool, appointmentId);
    this.verifyBranchAccess(appointment.branchId, user);

    // Fetch schedule history
    const historyRes = await pool.query(
      `SELECT
         history_id,
         appointment_id,
         old_start_at,
         old_end_at,
         new_start_at,
         new_end_at,
         reason,
         changed_by_employee_id,
         changed_at
       FROM catms.appointment_schedule_history
       WHERE appointment_id = $1
       ORDER BY changed_at ASC, history_id ASC`,
      [appointmentId],
    );

    const scheduleHistory: AppointmentScheduleHistoryDto[] = historyRes.rows.map((r) => ({
      historyId: Number(r.history_id),
      appointmentId: Number(r.appointment_id),
      oldStartAt: new Date(r.old_start_at).toISOString(),
      oldEndAt: new Date(r.old_end_at).toISOString(),
      newStartAt: new Date(r.new_start_at).toISOString(),
      newEndAt: new Date(r.new_end_at).toISOString(),
      reason: String(r.reason),
      changedByEmployeeId: Number(r.changed_by_employee_id),
      changedAt: new Date(r.changed_at).toISOString(),
    }));

    // Fetch status log
    const statusRes = await pool.query(
      `SELECT
         log_id,
         appointment_id,
         old_status,
         new_status,
         reason,
         changed_by_employee_id,
         changed_at
       FROM catms.appointment_status_log
       WHERE appointment_id = $1
       ORDER BY changed_at ASC, log_id ASC`,
      [appointmentId],
    );

    const statusLogs: AppointmentStatusLogDto[] = statusRes.rows.map((r) => ({
      logId: Number(r.log_id),
      appointmentId: Number(r.appointment_id),
      oldStatus: r.old_status,
      newStatus: r.new_status,
      reason: r.reason ? String(r.reason) : null,
      changedByEmployeeId: Number(r.changed_by_employee_id),
      changedAt: new Date(r.changed_at).toISOString(),
    }));

    return {
      ...appointment,
      scheduleHistory,
      statusLogs,
    };
  }

  /**
   * Retrieves doctor recurring availability, exception days, and existing appointments.
   */
  async getDoctorAvailability(
    doctorId: number,
    branchId: number,
    dateStr?: string,
    user?: JwtPayload,
  ): Promise<DoctorAvailabilityDto> {
    if (user) {
      this.verifyBranchAccess(branchId, user);
    }

    const targetDate = dateStr ?? new Date().toISOString().slice(0, 10);
    const [year, month, day] = targetDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year!, month! - 1, day!));
    const dayNames: Array<'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'> = [
      'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
    ];
    const dayOfWeek = dayNames[dateObj.getUTCDay()]!;

    // 1. Recurring weekly schedule
    const recurringRes = await pool.query(
      `SELECT start_time, end_time
       FROM catms.doctor_availability
       WHERE doctor_id = $1
         AND branch_id = $2
         AND day_of_week = $3
         AND valid_from <= $4::date
         AND (valid_to IS NULL OR valid_to >= $4::date)
       ORDER BY start_time ASC`,
      [doctorId, branchId, dayOfWeek, targetDate],
    );

    // 2. Availability exceptions
    const exceptionRes = await pool.query(
      `SELECT exception_type, start_at, end_at
       FROM catms.doctor_availability_exception
       WHERE doctor_id = $1
         AND branch_id = $2
         AND exception_date = $3::date
       ORDER BY start_at ASC`,
      [doctorId, branchId, targetDate],
    );

    // 3. Booked appointments
    const bookedRes = await pool.query(
      `SELECT appointment_id, start_at, end_at, status
       FROM catms.appointment
       WHERE doctor_id = $1
         AND branch_id = $2
         AND start_at::date = $3::date
         AND status != 'Cancelled'
       ORDER BY start_at ASC`,
      [doctorId, branchId, targetDate],
    );

    return {
      doctorId,
      branchId,
      date: targetDate,
      dayOfWeek,
      recurringSlots: recurringRes.rows.map((r) => ({
        startTime: String(r.start_time),
        endTime: String(r.end_time),
      })),
      exceptions: exceptionRes.rows.map((r) => ({
        exceptionType: r.exception_type,
        startAt: new Date(r.start_at).toISOString(),
        endAt: new Date(r.end_at).toISOString(),
      })),
      bookedAppointments: bookedRes.rows.map((r) => ({
        appointmentId: Number(r.appointment_id),
        startAt: new Date(r.start_at).toISOString(),
        endAt: new Date(r.end_at).toISOString(),
        status: r.status,
      })),
    };
  }

  /**
   * Books an appointment using the database procedure catms.book_appointment.
   */
  async bookAppointment(
    input: BookAppointmentInput,
    user: JwtPayload,
  ): Promise<AppointmentDto> {
    this.verifyBranchAccess(input.branchId, user);

    const dbRole = user.role.toLowerCase() === 'admin' ? 'catms_admin' : 'catms_app';

    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.book_appointment(
           $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL
         )`,
        [
          input.patientId,
          input.doctorId,
          input.branchId,
          input.specialtyId,
          input.startAt,
          input.endAt,
          input.bookingType ?? 'Booked',
          user.userId,
          input.notes ?? null,
        ],
      );

      const appointmentId = Number(res.rows[0]?.p_appointment_id);
      return this.fetchAppointmentById(client, appointmentId);
    }, dbRole);
  }

  /**
   * Reschedules an appointment via procedure catms.reschedule_appointment.
   */
  async rescheduleAppointment(
    appointmentId: number,
    input: RescheduleAppointmentInput,
    user: JwtPayload,
  ): Promise<AppointmentDto> {
    const existing = await this.fetchAppointmentById(pool, appointmentId);
    this.verifyBranchAccess(existing.branchId, user);

    const dbRole = user.role.toLowerCase() === 'admin' ? 'catms_admin' : 'catms_app';

    return withTransaction(async (client) => {
      await client.query(
        `CALL catms.reschedule_appointment($1, $2, $3, $4, $5)`,
        [
          appointmentId,
          input.newStartAt,
          input.newEndAt,
          input.reason,
          user.employeeId,
        ],
      );

      return this.fetchAppointmentById(client, appointmentId);
    }, dbRole);
  }

  /**
   * Cancels an appointment via procedure catms.cancel_appointment.
   */
  async cancelAppointment(
    appointmentId: number,
    input: CancelAppointmentInput,
    user: JwtPayload,
  ): Promise<AppointmentDto> {
    const existing = await this.fetchAppointmentById(pool, appointmentId);
    this.verifyBranchAccess(existing.branchId, user);

    const dbRole = user.role.toLowerCase() === 'admin' ? 'catms_admin' : 'catms_app';

    return withTransaction(async (client) => {
      await client.query(
        `CALL catms.cancel_appointment($1, $2, $3)`,
        [
          appointmentId,
          input.reason,
          user.employeeId,
        ],
      );

      return this.fetchAppointmentById(client, appointmentId);
    }, dbRole);
  }

  /**
   * Marks an appointment Completed via procedure catms.update_appointment_status.
   */
  async completeAppointment(
    appointmentId: number,
    input: CompleteAppointmentInput,
    user: JwtPayload,
  ): Promise<AppointmentDto> {
    const existing = await this.fetchAppointmentById(pool, appointmentId);
    this.verifyBranchAccess(existing.branchId, user);

    const dbRole = user.role.toLowerCase() === 'admin' ? 'catms_admin' : 'catms_app';

    return withTransaction(async (client) => {
      await client.query(
        `CALL catms.update_appointment_status($1, $2, $3, $4)`,
        [
          appointmentId,
          'Completed',
          input.reason ?? 'Consultation completed',
          user.employeeId,
        ],
      );

      return this.fetchAppointmentById(client, appointmentId);
    }, dbRole);
  }
}

export const appointmentsService = new AppointmentsService();
