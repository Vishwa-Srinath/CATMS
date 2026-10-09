/**
 * src/api/client.test.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Tests for the base typed API client, error mapping, CSRF handling, and session expiry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, onSessionExpired } from './client';
import { ApiError, getErrorMessage } from './errors';

describe('CATMS-056 — Frontend Typed API Client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { document?: { cookie: string } }).document = {
      cookie: '',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it('unwraps success envelope { data: ... } on 200 responses', async () => {
    const mockData = { id: 1, name: 'Main Branch' };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: mockData,
        meta: { correlationId: 'test-corr-id' },
      }),
    });

    const result = await apiClient.get<typeof mockData>('/branches');
    expect(result).toEqual(mockData);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/branches',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'X-Correlation-Id': expect.any(String),
        }),
      }),
    );
  });

  it('attaches CSRF token on POST mutations when catms_csrf cookie is present', async () => {
    document.cookie = 'catms_csrf=test-token-123; path=/;';

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { success: true } }),
    });

    await apiClient.post('/appointments', { patientId: 10 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/appointments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'test-token-123',
        }),
        body: JSON.stringify({ patientId: 10 }),
      }),
    );
  });

  it('throws typed ApiError with status, code, and message on 400/409 errors', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      json: async () => ({
        error: {
          code: 'APPOINTMENT_OVERLAP',
          message: 'The selected slot conflicts with an existing booking.',
          fieldErrors: [{ field: 'startTime', message: 'Slot already taken' }],
        },
        meta: { correlationId: 'err-corr-id' },
      }),
    });

    await expect(apiClient.post('/appointments', {})).rejects.toThrow(ApiError);

    try {
      await apiClient.post('/appointments', {});
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.code).toBe('APPOINTMENT_OVERLAP');
      expect(apiErr.isConflict()).toBe(true);
      expect(apiErr.fieldErrors).toHaveLength(1);
      expect(apiErr.correlationId).toBe('err-corr-id');
      expect(getErrorMessage(apiErr)).toBe('startTime: Slot already taken');
    }
  });

  it('notifies onSessionExpired listeners on 401 response', async () => {
    const expiredSpy = vi.fn();
    const unsubscribe = onSessionExpired(expiredSpy);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Session has expired.',
        },
      }),
    });

    await expect(apiClient.get('/auth/me')).rejects.toThrow(ApiError);
    expect(expiredSpy).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});
