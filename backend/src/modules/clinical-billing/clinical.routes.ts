import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAuth, requireRole } from '../../app/middleware/auth';
import { AppError, successEnvelope } from '../../shared/errors';
import {
  amendConsultationBodySchema,
  appointmentParamsSchema,
  clinicalWorklistQuerySchema,
  createTreatmentBodySchema,
  databaseIdSchema,
  invoiceParamsSchema,
  recordClinicalBodySchema,
  treatmentListQuerySchema,
  updateTreatmentBodySchema,
} from './clinical.schemas';
import { clinicalService } from './clinical.service';

function correlationId(res: Response): string {
  return (res.locals['correlationId'] as string | undefined) ?? 'unknown';
}

function actorUserId(req: Request): number {
  if (!req.user) {
    throw new Error('Authenticated user was not attached to the request.');
  }
  return req.user.userId;
}

export const clinicalRouter = Router();
clinicalRouter.use(requireAuth);

clinicalRouter.get(
  '/worklist',
  requireRole('Clinician', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { branchId } = clinicalWorklistQuerySchema.parse(req.query);
      if (branchId !== undefined && req.user!.role.toLowerCase() !== 'admin') {
        throw AppError.forbidden('Only administrators can filter the clinical worklist by branch.');
      }
      const result = await clinicalService.listWorklist(
        req.user!.employeeId,
        req.user!.role,
        branchId,
      );
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

clinicalRouter.post(
  '/:appointment_id/record',
  requireRole('Clinician', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { appointment_id: appointmentId } = appointmentParamsSchema.parse(req.params);
      const input = recordClinicalBodySchema.parse(req.body);
      const result = await clinicalService.recordClinical(
        appointmentId,
        actorUserId(req),
        req.user!.employeeId,
        req.user!.role,
        input,
      );
      res.status(201).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

clinicalRouter.post(
  '/:appointment_id/revisions',
  requireRole('Clinician', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { appointment_id: appointmentId } = appointmentParamsSchema.parse(req.params);
      const input = amendConsultationBodySchema.parse(req.body);
      const result = await clinicalService.amendClinical(
        appointmentId,
        actorUserId(req),
        req.user!.employeeId,
        req.user!.role,
        input,
      );
      res.status(201).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

export const treatmentRouter = Router();
treatmentRouter.use(requireAuth);

treatmentRouter.get(
  '/categories',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await clinicalService.listTreatmentCategories(req.user!.role);
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

treatmentRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = treatmentListQuerySchema.parse(req.query);
      if (query.includeInactive === 'true' && req.user!.role.toLowerCase() !== 'admin') {
        throw AppError.forbidden('Only administrators can list inactive treatments.');
      }
      const result = await clinicalService.listTreatments(
        req.user!.role,
        query.categoryId,
        query.includeInactive === 'true',
      );
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

treatmentRouter.post(
  '/',
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createTreatmentBodySchema.parse(req.body);
      const result = await clinicalService.createTreatment(actorUserId(req), input);
      res.status(201).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

treatmentRouter.put(
  '/:treatment_id',
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const treatmentId = databaseIdSchema.parse(req.params['treatment_id']);
      const input = updateTreatmentBodySchema.parse(req.body);
      const result = await clinicalService.updateTreatment(
        treatmentId,
        actorUserId(req),
        input,
      );
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

treatmentRouter.delete(
  '/:treatment_id',
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const treatmentId = databaseIdSchema.parse(req.params['treatment_id']);
      await clinicalService.deactivateTreatment(treatmentId, actorUserId(req));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  },
);

export const invoiceRouter = Router();
invoiceRouter.use(requireAuth);
invoiceRouter.get(
  '/:invoice_id',
  requireRole('Clinician', 'Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { invoice_id: invoiceId } = invoiceParamsSchema.parse(req.params);
      const result = await clinicalService.getInvoice(
        invoiceId,
        req.user!.role,
        req.user!.employeeId,
      );
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);
