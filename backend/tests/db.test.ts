import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';

vi.mock('../src/shared/env', () => ({
  env: {
    NODE_ENV:                'test',
    API_PORT:                3001,
    POSTGRES_HOST:           'localhost',
    POSTGRES_PORT:           5433,
    POSTGRES_DB:             'catms_test',
    POSTGRES_USER:           'catms_app',
    POSTGRES_PASSWORD:       'catms_test_password',
    JWT_SECRET:              'a'.repeat(64),
    CSRF_SECRET:             'b'.repeat(32),
    COOKIE_SECURE:           false,
    COOKIE_SAME_SITE:        'lax',
    COOKIE_MAX_AGE_SECONDS:  3600,
    ALLOWED_ORIGINS:         'http://localhost:5173',
    RATE_LIMIT_WINDOW_MS:    60_000,
    RATE_LIMIT_MAX:          200,
    LOG_LEVEL:               'silent',
  },
}));

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock('../src/db/pool', () => ({
  pool: {
    connect: () => mockConnect(),
    query: (...args: unknown[]) => mockQuery(...args),
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  withTransaction,
  withReadonlyTransaction,
  setLocalRole,
  sql,
  isSafeIdentifier,
} from '../src/db/transaction';

describe('Database Transaction and Role Utilities (CATMS-043)', () => {
  let mockClient: PoolClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: mockRelease,
    } as unknown as PoolClient;
    mockConnect.mockResolvedValue(mockClient);
  });

  describe('withTransaction', () => {
    it('executes BEGIN, runs callback, and COMMIT on success, then releases client', async () => {
      const result = await withTransaction(async (client) => {
        await client.query('INSERT INTO catms.patient (first_name) VALUES ($1)', ['Alice']);
        return 'success_payload';
      });

      expect(result).toBe('success_payload');
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'INSERT INTO catms.patient (first_name) VALUES ($1)', ['Alice']);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('sets local role if role is provided', async () => {
      await withTransaction(async (client) => {
        return client.query('SELECT 1');
      }, 'catms_app');

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'SET LOCAL ROLE catms_app');
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'SELECT 1');
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });

    it('executes ROLLBACK and releases client when callback throws', async () => {
      const dbError = new Error('Database constraint error');

      await expect(
        withTransaction(async (client) => {
          await client.query('INSERT INTO bad_table');
          throw dbError;
        }),
      ).rejects.toThrow('Database constraint error');

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'INSERT INTO bad_table');
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('withReadonlyTransaction', () => {
    it('executes transaction scoped to catms_readonly role', async () => {
      await withReadonlyTransaction(async (client) => {
        return client.query('SELECT count(*) FROM catms.appointment');
      });

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'SET LOCAL ROLE catms_readonly');
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'SELECT count(*) FROM catms.appointment');
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(mockRelease).toHaveBeenCalledTimes(1);
    });
  });

  describe('setLocalRole', () => {
    it('permits authorized roles in allowlist', async () => {
      await setLocalRole(mockClient, 'catms_app');
      expect(mockClient.query).toHaveBeenCalledWith('SET LOCAL ROLE catms_app');

      await setLocalRole(mockClient, 'catms_readonly');
      expect(mockClient.query).toHaveBeenCalledWith('SET LOCAL ROLE catms_readonly');
    });

    it('rejects unauthorized role strings', async () => {
      // @ts-expect-error Testing runtime rejection of illegal role
      await expect(setLocalRole(mockClient, 'postgres')).rejects.toThrow('unauthorized role');
    });
  });

  describe('sql parameterization helper', () => {
    it('creates parameterized queries and prevents raw string concatenation', () => {
      const patientId = 'p-123';
      const status = 'Active';

      const queryObj = sql`SELECT * FROM catms.patient WHERE patient_id = ${patientId} AND status = ${status}`;

      expect(queryObj.text).toBe('SELECT * FROM catms.patient WHERE patient_id = $1 AND status = $2');
      expect(queryObj.values).toEqual(['p-123', 'Active']);
    });

    it('handles zero parameters cleanly', () => {
      const queryObj = sql`SELECT count(*) FROM catms.branch`;
      expect(queryObj.text).toBe('SELECT count(*) FROM catms.branch');
      expect(queryObj.values).toEqual([]);
    });
  });

  describe('isSafeIdentifier', () => {
    it('accepts valid SQL identifiers', () => {
      expect(isSafeIdentifier('patient_id')).toBe(true);
      expect(isSafeIdentifier('catms')).toBe(true);
      expect(isSafeIdentifier('appointment_status_log')).toBe(true);
      expect(isSafeIdentifier('_internal_id')).toBe(true);
    });

    it('rejects malicious injection attempts in identifiers', () => {
      expect(isSafeIdentifier('patients; DROP TABLE users;--')).toBe(false);
      expect(isSafeIdentifier('patient id')).toBe(false);
      expect(isSafeIdentifier('patient-id')).toBe(false);
      expect(isSafeIdentifier('patient"id')).toBe(false);
      expect(isSafeIdentifier('123patient')).toBe(false);
    });
  });
});
