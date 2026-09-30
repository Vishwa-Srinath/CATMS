/**
 * src/shared/errors.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Domain error types and stable error codes for the CATMS API.
 *
 * Rules (CODEBASE_GUIDE.md §6):
 *   - Every error response uses one of these codes as `error.code`.
 *   - Raw SQL errors, stack traces and patient data MUST NOT reach the client.
 *   - All codes are uppercase SCREAMING_SNAKE to allow frontend switch statements.
 *   - The errorHandler middleware (app/middleware/errorHandler.ts) maps
 *     AppError instances and PostgreSQL SQLSTATE codes to these domain codes.
 */

// ── Domain error codes ────────────────────────────────────────────────────────

export const ErrorCode = {
  // Validation
  VALIDATION_ERROR:        'VALIDATION_ERROR',
  INVALID_REQUEST:         'INVALID_REQUEST',

  // Authentication & authorization
  UNAUTHENTICATED:         'UNAUTHENTICATED',
  FORBIDDEN:               'FORBIDDEN',
  ACCOUNT_DISABLED:        'ACCOUNT_DISABLED',
  CSRF_INVALID:            'CSRF_INVALID',

  // Resource state
  NOT_FOUND:               'NOT_FOUND',
  CONFLICT:                'CONFLICT',

  // Scheduling (Dev1 — Module C)
  APPOINTMENT_OVERLAP:     'APPOINTMENT_OVERLAP',
  INVALID_TIME_RANGE:      'INVALID_TIME_RANGE',
  DOCTOR_UNAVAILABLE:      'DOCTOR_UNAVAILABLE',

  // Clinical & billing (Dev4 — Module D)
  APPOINTMENT_NOT_COMPLETED: 'APPOINTMENT_NOT_COMPLETED',
  INVOICE_FINALIZED:         'INVOICE_FINALIZED',

  // Payments (Dev4)
  PAYMENT_OVERAGE:         'PAYMENT_OVERAGE',
  PAYMENT_DUPLICATE:       'PAYMENT_DUPLICATE',
  REVERSAL_NOT_ALLOWED:    'REVERSAL_NOT_ALLOWED',

  // Claims (Dev3)
  CLAIM_ALLOCATION_EXCEEDED: 'CLAIM_ALLOCATION_EXCEEDED',
  POLICY_INACTIVE:           'POLICY_INACTIVE',

  // Platform
  INTERNAL_ERROR:          'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE:     'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ── Field error (Zod validation) ───────────────────────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

// ── AppError — thrown by service and route layers ─────────────────────────────

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly fieldErrors: FieldError[];

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 500,
    fieldErrors: FieldError[] = [],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static notFound(resource: string): AppError {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found.`, 404);
  }

  static forbidden(message = 'You do not have permission to perform this action.'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static unauthenticated(message = 'Authentication required.'): AppError {
    return new AppError(ErrorCode.UNAUTHENTICATED, message, 401);
  }

  static validationError(message: string, fieldErrors: FieldError[] = []): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 422, fieldErrors);
  }

  static conflict(message: string): AppError {
    return new AppError(ErrorCode.CONFLICT, message, 409);
  }

  static internal(message = 'An unexpected error occurred.'): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500);
  }
}

// ── PostgreSQL SQLSTATE → domain error mapping ────────────────────────────────
// Source: https://www.postgresql.org/docs/16/errcodes-appendix.html
// Custom SQLSTATE codes used by CATMS stored procedures are in the P0xxx range.

export const PG_ERROR_MAP: Record<string, { code: ErrorCode; statusCode: number; message: string }> = {
  // Standard PostgreSQL codes
  '23505': { code: ErrorCode.CONFLICT,              statusCode: 409, message: 'A record with these details already exists.' },
  '23503': { code: ErrorCode.CONFLICT,              statusCode: 409, message: 'This record is referenced by other data and cannot be changed.' },
  '23514': { code: ErrorCode.VALIDATION_ERROR,      statusCode: 422, message: 'The provided data violates a database constraint.' },
  '40001': { code: ErrorCode.CONFLICT,              statusCode: 409, message: 'Concurrent modification detected. Please retry.' },
  '40P01': { code: ErrorCode.CONFLICT,              statusCode: 409, message: 'Deadlock detected. Please retry.' },

  // CATMS custom SQLSTATE codes (defined in stored procedures)
  'P0001': { code: ErrorCode.APPOINTMENT_OVERLAP,   statusCode: 409, message: 'The doctor already has an appointment in that time range.' },
  'P0002': { code: ErrorCode.DOCTOR_UNAVAILABLE,    statusCode: 422, message: 'The doctor is not available in that time slot.' },
  'P0003': { code: ErrorCode.APPOINTMENT_NOT_COMPLETED, statusCode: 422, message: 'This action requires a Completed appointment.' },
  'P0004': { code: ErrorCode.PAYMENT_OVERAGE,       statusCode: 422, message: 'Payment amount exceeds the outstanding balance.' },
  'P0005': { code: ErrorCode.CLAIM_ALLOCATION_EXCEEDED, statusCode: 422, message: 'Claim allocation exceeds the invoice line total.' },
  'P0006': { code: ErrorCode.POLICY_INACTIVE,       statusCode: 422, message: 'The insurance policy is not active for this service date.' },
};

// ── Success/Error response envelope ───────────────────────────────────────────
// Matches the contract in CODEBASE_GUIDE.md §6 and member_plan.md §14

export interface SuccessEnvelope<T> {
  data: T;
  meta: { correlationId: string };
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors: FieldError[];
  };
  meta: { correlationId: string };
}

export function successEnvelope<T>(data: T, correlationId: string): SuccessEnvelope<T> {
  return { data, meta: { correlationId } };
}

export function errorEnvelope(
  code: ErrorCode,
  message: string,
  correlationId: string,
  fieldErrors: FieldError[] = [],
): ErrorEnvelope {
  return {
    error: { code, message, fieldErrors },
    meta: { correlationId },
  };
}
