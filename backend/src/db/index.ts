/**
 * src/db/index.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Barrel re-export for the db layer.
 * Modules import from 'db' not from individual files.
 */

export { pool, checkDatabaseConnectivity, closePool } from './pool';
export { withTransaction, withReadonlyTransaction, setLocalRole } from './transaction';
export type { DbRole } from './transaction';
