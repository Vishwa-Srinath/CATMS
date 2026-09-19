/**
 * src/db/pool.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * PostgreSQL connection pool — singleton shared across all modules.
 *
 * Rules (member_plan.md §3, CODEBASE_GUIDE.md):
 *   - All modules import `pool` from this file; never create their own Pool.
 *   - All SQL uses parameterized queries ($1, $2, …) — never string interpolation.
 *   - SET LOCAL ROLE is called inside withTransaction(), never on the pool connection.
 *   - The pool uses POSTGRES_USER (catms_app), not the superuser.
 *     The superuser is only used by scripts/migrate.sh and scripts/reset.sh.
 */

import { Pool, type PoolConfig } from 'pg';
import { env } from '../shared/env';
import { logger } from '../shared/logger';

const poolConfig: PoolConfig = {
  host:     env.POSTGRES_HOST,
  port:     env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user:     env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,

  // Connection pool sizing — tuned for a clinic demo environment
  min: 2,
  max: 10,
  idleTimeoutMillis:    30_000,
  connectionTimeoutMillis: 5_000,

  // Tell pg to parse numeric types as JS numbers (not strings)
  // Override at query level for NUMERIC(12,2) money columns to avoid float imprecision.
  // Money is returned as strings and parsed in the service layer.
};

export const pool = new Pool(poolConfig);

// Log pool errors — these are connection-level errors, not query errors
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

// Health check query — used by readiness endpoint and verify script
export async function checkDatabaseConnectivity(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    logger.error({ err }, 'Database connectivity check failed');
    return { ok: false, latencyMs: Date.now() - start };
  }
}

// Graceful shutdown — drain the pool when the server exits
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL pool closed');
}
