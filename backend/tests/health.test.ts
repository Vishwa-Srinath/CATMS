/**
 * backend/tests/health.test.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Supertest integration test for the health and readiness endpoints.
 *
 * Acceptance criterion: API compiles and starts; health endpoint responds 200.
 *
 * Strategy: Mock env.ts and the DB pool before importing server.ts so that
 * no real database connection or .env file is needed in CI at CATMS-013 stage.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// ── Mock shared/env BEFORE any import that touches it ────────────────────────
// env.ts calls process.exit(1) at module init if vars are invalid.
// We bypass that entirely by mocking the module's export.
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

// ── Mock DB pool — no real PostgreSQL required ────────────────────────────────
vi.mock('../src/db/pool', () => ({
  pool: {},
  checkDatabaseConnectivity: vi.fn().mockResolvedValue({ ok: true, latencyMs: 1 }),
  closePool: vi.fn().mockResolvedValue(undefined),
}));

let app: Express;

beforeAll(async () => {
  const { createApp } = await import('../src/app/server');
  app = createApp();
});

// ── /api/v1/health ────────────────────────────────────────────────────────────
describe('GET /api/v1/health', () => {
  it('responds 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(typeof res.body.meta.correlationId).toBe('string');
  });

  it('echoes X-Correlation-Id header', async () => {
    const id = 'test-corr-id-12345';
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Correlation-Id', id);
    expect(res.headers['x-correlation-id']).toBe(id);
  });
});

// ── /api/v1/readiness ─────────────────────────────────────────────────────────
describe('GET /api/v1/readiness', () => {
  it('responds 200 when DB is healthy', async () => {
    const res = await request(app).get('/api/v1/readiness');
    expect(res.status).toBe(200);
    expect(res.body.data.ready).toBe(true);
    expect(res.body.data.checks.database.ok).toBe(true);
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
describe('Unknown routes', () => {
  it('returns 404 with NOT_FOUND code', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.meta.correlationId).toBe('string');
  });

  it('returns 404 for POST on unknown route', async () => {
    const res = await request(app).post('/api/v1/unknown');
    expect(res.status).toBe(404);
  });
});

// ── Security headers ──────────────────────────────────────────────────────────
describe('Security headers', () => {
  it('sets X-Content-Type-Options nosniff', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not expose X-Powered-By', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
