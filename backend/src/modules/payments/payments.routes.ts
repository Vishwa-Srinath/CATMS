import { Router, type NextFunction, type Request, type Response } from 'express';
import { requireAuth, requireRole } from '../../app/middleware/auth';
import { successEnvelope } from '../../shared/errors';
import {
  createPaymentBodySchema,
  listPaymentsQuerySchema,
  paymentPreviewBodySchema,
  reversePaymentBodySchema,
  reversePaymentParamsSchema,
} from '../clinical-billing/clinical.schemas';
import { paymentsService } from './payments.service';

function correlationId(res: Response): string {
  return (res.locals['correlationId'] as string | undefined) ?? 'unknown';
}

function actorUserId(req: Request): number {
  if (!req.user) {
    throw new Error('Authenticated user was not attached to the request.');
  }
  return req.user.userId;
}

export const paymentRouter = Router();
paymentRouter.use(requireAuth);
paymentRouter.use(requireRole('Admin'));

paymentRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { invoiceId } = listPaymentsQuerySchema.parse(req.query);
      const result = await paymentsService.list(invoiceId);
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

paymentRouter.post(
  '/preview',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = paymentPreviewBodySchema.parse(req.body);
      const result = await paymentsService.preview(
        input.invoiceId,
        input.payerType,
        input.insuranceClaimId,
      );
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

paymentRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = createPaymentBodySchema.parse(req.body);
      const result = await paymentsService.post(actorUserId(req), input);
      res.status(200).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);

paymentRouter.post(
  '/:payment_id/reverse',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { payment_id: paymentId } = reversePaymentParamsSchema.parse(req.params);
      const input = reversePaymentBodySchema.parse(req.body);
      const result = await paymentsService.reverse(
        paymentId,
        actorUserId(req),
        input.amount,
        input.reason,
      );
      res.status(201).json(successEnvelope(result, correlationId(res)));
    } catch (error) {
      next(error);
    }
  },
);
