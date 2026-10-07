import type { PoolClient } from 'pg';
import { pool } from './pool';
import { logger } from '../shared/logger';

export type DbRole = 'catms_app' | 'catms_readonly';

const ALLOWED_ROLES: readonly DbRole[] = ['catms_app', 'catms_readonly'] as const;

export interface ParameterizedQuery {
  text: string;
  values: unknown[];
}

export function sql(strings: TemplateStringsArray, ...values: unknown[]): ParameterizedQuery {
  let text = strings[0] ?? '';
  const params: unknown[] = [];

  for (let i = 0; i < values.length; i++) {
    params.push(values[i]);
    text += `$${params.length}${strings[i + 1] ?? ''}`;
  }

  return { text, values: params };
}

export function isSafeIdentifier(identifier: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier);
}

export async function setLocalRole(client: PoolClient, role: DbRole): Promise<void> {
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error(`[setLocalRole] Attempted to SET LOCAL ROLE to unauthorized role: ${role}`);
  }
  await client.query(`SET LOCAL ROLE ${role}`);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  role?: DbRole,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    if (role) {
      await setLocalRole(client, role);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      logger.error({ err: rollbackErr }, 'Transaction ROLLBACK failed');
    });
    throw err;
  } finally {
    client.release();
  }
}

export async function withReadonlyTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    return fn(client);
  }, 'catms_readonly');
}

