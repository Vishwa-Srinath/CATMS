/**
 * src/api/client.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Base typed HTTP client for CATMS frontend.
 * Features:
 *   - Automatic credentials: 'include' for HttpOnly session cookie
 *   - Automatic CSRF extraction and injection on state-mutating requests
 *   - Auto-generated or custom X-Correlation-Id
 *   - Error envelope unwrap and typed ApiError throwing
 *   - Centralized session expiry callback
 */

import { ApiError } from './errors';
import type { ApiResponse, ApiErrorEnvelope, HttpMethod, RequestOptions } from './types';

const API_BASE = '/api/v1';

type SessionExpiredHandler = () => void;
const sessionExpiredHandlers = new Set<SessionExpiredHandler>();

export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandlers.add(handler);
  return () => sessionExpiredHandlers.delete(handler);
}

function notifySessionExpired(): void {
  sessionExpiredHandlers.forEach((handler) => {
    try {
      handler();
    } catch {
      // Ignore handler errors
    }
  });
}

/**
 * Extracts a cookie value by name from document.cookie safely.
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Helper to build query parameter strings safely.
 */
function buildQueryString(params?: object): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

let inMemoryCsrfToken: string | null = null;

export async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: { csrfToken?: string } };
      inMemoryCsrfToken = json?.data?.csrfToken || null;
      return inMemoryCsrfToken || '';
    }
  } catch {
    // Ignore CSRF fetch errors
  }
  return '';
}

/**
 * Base request dispatcher.
 */
async function request<T>(
  method: HttpMethod,
  endpoint: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const { params, headers = {}, skipCsrf = false, skipSessionExpiry = false, ...fetchOptions } = options;

  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}${buildQueryString(params)}`;

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  // Add correlation ID if not already supplied
  if (!requestHeaders['X-Correlation-Id'] && typeof crypto !== 'undefined' && crypto.randomUUID) {
    requestHeaders['X-Correlation-Id'] = crypto.randomUUID();
  }

  // Include body and Content-Type for mutating methods
  let requestBody: string | undefined = undefined;
  if (body !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    if (body instanceof FormData) {
      // Let browser set multipart boundary
      delete requestHeaders['Content-Type'];
    } else {
      requestHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
  }

  // Inject CSRF token on mutating methods unless explicitly skipped
  if (!skipCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    let csrfToken = getCookie('catms_csrf') || getCookie('csrf_token') || inMemoryCsrfToken;
    if (!csrfToken && typeof window !== 'undefined') {
      csrfToken = await fetchCsrfToken();
    }
    if (csrfToken && !requestHeaders['X-CSRF-Token']) {
      requestHeaders['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: requestBody,
    credentials: 'include', // Always send cookies for session
    ...fetchOptions,
  });

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorPayload = json as ApiErrorEnvelope | null;
    const errorDetails = errorPayload?.error;
    const correlationId = errorPayload?.meta?.correlationId || requestHeaders['X-Correlation-Id'];

    if (response.status === 401 && !skipSessionExpiry && !endpoint.includes('/auth/login')) {
      notifySessionExpired();
    }

    throw new ApiError(
      errorDetails?.message || response.statusText || 'Request failed',
      response.status,
      errorDetails?.code || 'HTTP_ERROR',
      errorDetails?.fieldErrors || [],
      correlationId,
    );
  }

  // Unwrap standard { data: ... } envelope if present
  if (json && typeof json === 'object' && 'data' in json) {
    return (json as ApiResponse<T>).data;
  }

  return json as T;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    request<T>('GET', endpoint, undefined, options),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', endpoint, body, options),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', endpoint, body, options),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', endpoint, body, options),

  delete: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>('DELETE', endpoint, body, options),
};
