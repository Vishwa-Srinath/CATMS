import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../shared/env';
import { logger } from '../shared/logger';
import type { DatabaseHealthCheck, MigrationHealthCheck } from '../contracts/health.contract';

const poolConfig: PoolConfig = {
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  min: 2,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

export async function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  const start = Date.now();
  try {
    const result = await pool.query<R>(text, params);
    const duration = Date.now() - start;
    logger.debug({ text, duration, rowCount: result.rowCount }, 'Executed pool query');
    return result;
  } catch (err) {
    logger.error({ text, err }, 'Database pool query failed');
    throw err;
  }
}

export async function checkDatabaseConnectivity(): Promise<DatabaseHealthCheck> {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    logger.error({ err }, 'Database connectivity check failed');
    return { ok: false, latencyMs: Date.now() - start };
  }
}

export async function checkDatabaseMigrations(): Promise<MigrationHealthCheck> {
  try {
    const result = await pool.query<{ latest_version: number; applied_count: number }>(`
      SELECT
        COALESCE(MAX(version), 0)::int AS latest_version,
        COUNT(*)::int AS applied_count
      FROM catms.schema_migrations;
    `);

    const row = result.rows[0];
    return {
      ok: true,
      latestVersion: row ? row.latest_version : 0,
      appliedCount: row ? row.applied_count : 0,
    };
  } catch (err) {
    logger.warn({ err }, 'Migration level check failed or schema_migrations table missing');
    return {
      ok: false,
      latestVersion: 0,
      appliedCount: 0,
    };
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL pool closed');
}

