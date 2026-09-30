/**
 * src/db/transaction.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Transaction helper and SET LOCAL ROLE utility.
 *
 * Rules (CODEBASE_GUIDE.md §6, member_plan.md §3):
 *   - Every state-changing route MUST use withTransaction().
 *   - SET LOCAL ROLE applies only inside a transaction and only to the
 *     client checked out for that transaction. It NEVER touches the pool connection.
 *   - The service layer calls withTransaction(). Routes never manage clients directly.
 *   - On error, the transaction is rolled back and the client is released.
 *     The error is re-thrown for errorHandler to map to the response envelope.
 *
 * Usage:
 *   const result = await withTransaction(async (client) => {
 *     await setLocalRole(client, 'catms_app');
 *     const { rows } = await client.query('INSERT INTO catms.appointment ...', [...]);
 *     return rows[0];
 *   });
 */

import type { PoolClient } from 'pg';
import { pool } from './pool';
import { logger } from '../shared/logger';

// ── Application database roles ────────────────────────────────────────────────
// Defined in infra/docker/postgres/init/01_create_roles.sql
// Granted object privileges in migrations 001–089.
export type DbRole = 'catms_app' | 'catms_readonly';

/**
 * SET LOCAL ROLE — switches the database role for the current transaction only.
 *
 * Must be called after BEGIN and before any DML.
 * The role reverts automatically when the transaction commits or rolls back.
 *
 * @param client  The PoolClient already checked out inside a transaction.
 * @param role    The database role to assume for this transaction.
 */
export async function setLocalRole(client: PoolClient, role: DbRole): Promise<void> {
  // Use a fixed allow-list — never accept role from user input
  const allowedRoles: DbRole[] = ['catms_app', 'catms_readonly'];
  if (!allowedRoles.includes(role)) {
    throw new Error(`[setLocalRole] Attempted to SET LOCAL ROLE to unknown role: ${role}`);
  }
  await client.query(`SET LOCAL ROLE ${role}`);
}

/**
 * withTransaction — checks out a client, begins a transaction, runs the callback,
 * and commits on success or rolls back on error.
 *
 * @param fn  Async callback that receives the checked-out PoolClient.
 *            The callback must use only this client for all queries within the transaction.
 * @returns   The value returned by fn.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      // If ROLLBACK itself fails (e.g. connection dropped), log and continue.
      logger.error({ err: rollbackErr }, 'Transaction ROLLBACK failed');
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * withReadonlyTransaction — convenience wrapper for read-only service calls.
 * Uses catms_readonly role. Does not allow writes.
 */
export async function withReadonlyTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    await setLocalRole(client, 'catms_readonly');
    return fn(client);
  });
}
