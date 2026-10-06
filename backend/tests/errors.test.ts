import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';

vi.mock('../src/shared/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  },
}));

vi.mock('../src/shared/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  AppError,
  ErrorCode,
  PG_ERROR_MAP,
  errorEnvelope,
  successEnvelope,
} from '../src/shared/errors';
import { errorHandler } from '../src/app/middleware/errorHandler';

describe('Error Envelope and Domain Mapping (CATMS-044)', () => {
  let req: Request;
  let res: Response;
  let next: NextFunction;
  let statusMock: ReturnType<typeof vi.fn>;
  let jsonMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    req = {} as Request;
    res = {
      locals: { correlationId: 'test-corr-uuid-777' },
      status: statusMock,
    } as unknown as Response;
    next = vi.fn();
  });

  describe('AppError Factory Methods', () => {
    it('creates notFound AppError with 404', () => {
      const err = AppError.notFound('Patient');
      expect(err.code).toBe(ErrorCode.NOT_FOUND);
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('Patient not found.');
    });

    it('creates forbidden AppError with 403', () => {
      const err = AppError.forbidden();
      expect(err.code).toBe(ErrorCode.FORBIDDEN);
      expect(err.statusCode).toBe(403);
    });

    it('creates unauthenticated AppError with 401', () => {
      const err = AppError.unauthenticated();
      expect(err.code).toBe(ErrorCode.UNAUTHENTICATED);
      expect(err.statusCode).toBe(401);
    });

    it('creates validationError AppError with 422 and fieldErrors', () => {
      const err = AppError.validationError('Invalid input', [{ field: 'email', message: 'Invalid email' }]);
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.statusCode).toBe(422);
      expect(err.fieldErrors).toEqual([{ field: 'email', message: 'Invalid email' }]);
    });

    it('creates conflict AppError with 409', () => {
      const err = AppError.conflict('Resource already exists');
      expect(err.code).toBe(ErrorCode.CONFLICT);
      expect(err.statusCode).toBe(409);
    });
  });

  describe('errorHandler Middleware', () => {
    it('handles AppError and renders structured envelope', () => {
      const appErr = AppError.notFound('Appointment');
      errorHandler(appErr, req, res, next);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Appointment not found.',
          fieldErrors: [],
        },
        meta: { correlationId: 'test-corr-uuid-777' },
      });
    });

    it('handles ZodError and renders 422 with field errors', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
      });

      let zodErr: ZodError | null = null;
      try {
        schema.parse({ email: 'bad-email', age: 10 });
      } catch (e) {
        zodErr = e as ZodError;
      }

      expect(zodErr).toBeInstanceOf(ZodError);
      errorHandler(zodErr!, req, res, next);

      expect(statusMock).toHaveBeenCalledWith(422);
      const payload = jsonMock.mock.calls[0][0];
      expect(payload.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(payload.error.fieldErrors).toHaveLength(2);
      expect(payload.meta.correlationId).toBe('test-corr-uuid-777');
    });

    it('handles mapped PostgreSQL error (23505 Unique Violation)', () => {
      const pgErr = Object.assign(new Error('duplicate key value'), {
        code: '23505',
        constraint: 'uq_patient_nic',
      });

      errorHandler(pgErr, req, res, next);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.CONFLICT,
          message: PG_ERROR_MAP['23505'].message,
          fieldErrors: [],
        },
        meta: { correlationId: 'test-corr-uuid-777' },
      });
    });

    it('handles Exclusion Constraint error (23P01 Appointment Overlap)', () => {
      const pgErr = Object.assign(new Error('conflicting key value violates exclusion constraint'), {
        code: '23P01',
        constraint: 'excl_appointment_overlap',
      });

      errorHandler(pgErr, req, res, next);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.APPOINTMENT_OVERLAP,
          message: PG_ERROR_MAP['23P01'].message,
          fieldErrors: [],
        },
        meta: { correlationId: 'test-corr-uuid-777' },
      });
    });

    it('handles Custom Stored Procedure error (P0001)', () => {
      const pgErr = Object.assign(new Error('Appointment overlap detected'), {
        code: 'P0001',
      });

      errorHandler(pgErr, req, res, next);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.APPOINTMENT_OVERLAP,
          message: PG_ERROR_MAP['P0001'].message,
          fieldErrors: [],
        },
        meta: { correlationId: 'test-corr-uuid-777' },
      });
    });

    it('sanitizes unknown errors, hiding internal details from client', () => {
      const secretInternalError = new Error('SELECT * FROM users WHERE secret_key = 12345: crashed');
      errorHandler(secretInternalError, req, res, next);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
          fieldErrors: [],
        },
        meta: { correlationId: 'test-corr-uuid-777' },
      });
    });
  });

  describe('Envelope Helpers', () => {
    it('builds successEnvelope correctly', () => {
      const payload = successEnvelope({ appointmentId: 'apt-01' }, 'corr-99');
      expect(payload).toEqual({
        data: { appointmentId: 'apt-01' },
        meta: { correlationId: 'corr-99' },
      });
    });

    it('builds errorEnvelope correctly', () => {
      const payload = errorEnvelope(ErrorCode.FORBIDDEN, 'Access Denied', 'corr-101');
      expect(payload).toEqual({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'Access Denied',
          fieldErrors: [],
        },
        meta: { correlationId: 'corr-101' },
      });
    });
  });
});
