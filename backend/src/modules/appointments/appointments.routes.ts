/**
 * src/modules/appointments/appointments.routes.ts
 * Owner: Dev1 | Issues: CATMS-050, CATMS-051
 *
 * Express router for Appointment Scheduling endpoints:
 *   - GET  /api/v1/appointments               (List / filter appointments)
 *   - GET  /api/v1/appointments/availability  (Doctor availability & exceptions)
 *   - GET  /api/v1/appointments/:id           (Appointment detail & audit logs)
 *   - POST /api/v1/appointments/book          (Book scheduled appointment)
 *   - POST /api/v1/appointments/walk-in       (Book walk-in appointment)
 *   - POST /api/v1/appointments/:id/reschedule(Reschedule appointment)
 *   - POST /api/v1/appointments/:id/cancel    (Cancel appointment)
 *   - POST /api/v1/appointments/:id/complete  (Mark appointment completed)
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003):
 *   - Reception and Admin can book, walk-in, reschedule, and cancel.
 *   - Clinician and Admin can mark appointments Completed.
 *   - Reception, Clinician, Manager, Admin, and QA can read appointments.
 *   - Branch scoping enforced for single-branch roles.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireRole, enforceBranchScope } from '../../app/middleware/auth';
import { appointmentsService } from './appointments.service';
import {
  bookAppointmentSchema,
  walkInAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
  completeAppointmentSchema,
  appointmentListQuerySchema,
  doctorAvailabilityQuerySchema,
} from './appointments.schema';
import { successEnvelope } from '../../shared/errors';

export const appointmentRouter = Router();

// GET /api/v1/appointments — List appointments with filters
appointmentRouter.get(
  '/',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  enforceBranchScope('branchId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const filters = appointmentListQuerySchema.parse(req.query);
      const appointments = await appointmentsService.listAppointments(filters, req.user!);
      res.status(200).json(successEnvelope(appointments, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/appointments/availability — View doctor recurring schedule & exceptions
appointmentRouter.get(
  '/availability',
  requireAuth,
  enforceBranchScope('branchId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const query = doctorAvailabilityQuerySchema.parse(req.query);
      const availability = await appointmentsService.getDoctorAvailability(
        query.doctorId,
        query.branchId,
        query.date,
        req.user,
      );
      res.status(200).json(successEnvelope(availability, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/appointments/:id — View single appointment with history
appointmentRouter.get(
  '/:id',
  requireAuth,
  requireRole('Reception', 'Clinician', 'Manager', 'Admin', 'QA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const appointment = await appointmentsService.getAppointmentById(
        Number(req.params.id),
        req.user!,
      );
      res.status(200).json(successEnvelope(appointment, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/appointments/book — Book a scheduled slot (Reception / Admin)
appointmentRouter.post(
  '/book',
  requireAuth,
  requireRole('Reception', 'Admin'),
  enforceBranchScope('branchId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = bookAppointmentSchema.parse(req.body);
      const appointment = await appointmentsService.bookAppointment(input, req.user!);
      res.status(201).json(successEnvelope(appointment, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/appointments/walk-in — Create walk-in appointment (Reception / Admin)
appointmentRouter.post(
  '/walk-in',
  requireAuth,
  requireRole('Reception', 'Admin'),
  enforceBranchScope('branchId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = walkInAppointmentSchema.parse(req.body);
      const appointment = await appointmentsService.bookAppointment(
        { ...input, bookingType: 'WalkIn' },
        req.user!,
      );
      res.status(201).json(successEnvelope(appointment, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/appointments/:id/reschedule — Reschedule slot (Reception / Admin)
appointmentRouter.post(
  '/:id/reschedule',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = rescheduleAppointmentSchema.parse(req.body);
      const appointment = await appointmentsService.rescheduleAppointment(
        Number(req.params.id),
        input,
        req.user!,
      );
      res.status(200).json(successEnvelope(appointment, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/appointments/:id/cancel — Cancel appointment (Reception / Admin)
appointmentRouter.post(
  '/:id/cancel',
  requireAuth,
  requireRole('Reception', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = cancelAppointmentSchema.parse(req.body);
      const appointment = await appointmentsService.cancelAppointment(
        Number(req.params.id),
        input,
        req.user!,
      );
      res.status(200).json(successEnvelope(appointment, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/appointments/:id/complete — Mark completed (Clinician / Admin)
appointmentRouter.post(
  '/:id/complete',
  requireAuth,
  requireRole('Clinician', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const input = completeAppointmentSchema.parse(req.body);
      const appointment = await appointmentsService.completeAppointment(
        Number(req.params.id),
        input,
        req.user!,
      );
      res.status(200).json(successEnvelope(appointment, correlationId));
    } catch (err) {
      next(err);
    }
  },
);
