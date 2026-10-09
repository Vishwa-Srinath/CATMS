/**
 * src/api/errors.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Domain and HTTP API Error abstraction with safe envelope extraction.
 */

import type { ApiFieldError } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: ApiFieldError[];
  readonly correlationId?: string;

  constructor(
    message: string,
    status = 500,
    code = 'INTERNAL_ERROR',
    fieldErrors: ApiFieldError[] = [],
    correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
    this.correlationId = correlationId;

    // Maintain prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }

  isUnauthenticated(): boolean {
    return this.status === 401 || this.code === 'UNAUTHENTICATED';
  }

  isForbidden(): boolean {
    return this.status === 403 || this.code === 'FORBIDDEN';
  }

  isNotFound(): boolean {
    return this.status === 404 || this.code === 'NOT_FOUND';
  }

  isConflict(): boolean {
    return this.status === 409 || this.code === 'CONFLICT' || this.code === 'APPOINTMENT_OVERLAP';
  }

  isValidationError(): boolean {
    return this.status === 422 || this.status === 400 || this.code === 'VALIDATION_ERROR';
  }
}

/**
 * Extracts a human-friendly display message from any caught error.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.fieldErrors.length > 0) {
      const first = error.fieldErrors[0];
      return `${first.field}: ${first.message}`;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
