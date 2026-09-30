/**
 * src/app/middleware/errorHandler.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Global Express error handler — MUST be registered last with app.use().
 *
 * Responsibilities:
 *   1. Map AppError instances → structured error envelope.
 *   2. Map PostgreSQL errors (by SQLSTATE code) → domain error codes.
 *   3. Map Zod validation errors → VALIDATION_ERROR with fieldErrors.
 *   4. Map all other errors → generic INTERNAL_ERROR (never expose details).
 *
 * Rules (CODEBASE_GUIDE.md §6):
 *   - Raw SQL errors, stack traces, patient data and tokens MUST NOT reach the client.
 *   - Every error response includes meta.correlationId for tracing.
 *   - HTTP status codes are set correctly (4xx for client, 5xx for server).
 *   - Unrecognised errors are logged at ERROR level with the full error object
 *     (server-side only) and the client receives only a generic message.
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  AppError,
  ErrorCode,
  PG_ERROR_MAP,
  errorEnvelope,
  type FieldError,
} from '../../shared/errors';
import { logger } from '../../shared/logger';

// ── pg error shape (minimal) ──────────────────────────────────────────────────
interface PgError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
}

function isPgError(err: unknown): err is PgError {
  return err instanceof Error && 'code' in err && typeof (err as PgError).code === 'string';
}

// ── Main error handler ────────────────────────────────────────────────────────

// Express error handlers require exactly 4 arguments; req is part of the signature
// even when unused. Prefixed with _ to satisfy noUnusedParameters.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';

  // ── 1. AppError (thrown explicitly by service/route layers) ───────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json(
      errorEnvelope(err.code, err.message, correlationId, err.fieldErrors),
    );
    return;
  }

  // ── 2. Zod validation error ───────────────────────────────────────────────
  if (err instanceof ZodError) {
    const fieldErrors: FieldError[] = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(422).json(
      errorEnvelope(
        ErrorCode.VALIDATION_ERROR,
        'Request validation failed.',
        correlationId,
        fieldErrors,
      ),
    );
    return;
  }

  // ── 3. PostgreSQL error (SQLSTATE code) ────────────────────────────────────
  if (isPgError(err) && err.code !== undefined) {
    const mapped = PG_ERROR_MAP[err.code];
    if (mapped !== undefined) {
      // Log at warn level — it is a known domain error, not a system fault
      logger.warn(
        { correlationId, sqlstate: err.code, constraint: err.constraint },
        'Domain database error',
      );
      res.status(mapped.statusCode).json(
        errorEnvelope(mapped.code, mapped.message, correlationId),
      );
      return;
    }

    // Unknown PG error — log full details server-side, generic message to client
    logger.error(
      { correlationId, err, sqlstate: err.code },
      'Unhandled PostgreSQL error',
    );
    res.status(500).json(
      errorEnvelope(ErrorCode.INTERNAL_ERROR, 'An unexpected database error occurred.', correlationId),
    );
    return;
  }

  // ── 4. All other errors ────────────────────────────────────────────────────
  // Log the full error server-side. Never expose stack traces or internals to client.
  logger.error({ correlationId, err }, 'Unhandled error');

  res.status(500).json(
    errorEnvelope(ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred.', correlationId),
  );
}
