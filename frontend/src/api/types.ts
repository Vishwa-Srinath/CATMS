/**
 * src/api/types.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Core TypeScript types and envelopes for the CATMS API client.
 * Follows CODEBASE_GUIDE.md §6 and backend error envelope conventions.
 */

export interface ApiResponse<T> {
  data: T;
  meta?: {
    correlationId?: string;
    timestamp?: string;
  };
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    fieldErrors?: ApiFieldError[];
  };
  meta?: {
    correlationId?: string;
    timestamp?: string;
  };
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  params?: object;
  headers?: Record<string, string>;
  skipCsrf?: boolean;
}
