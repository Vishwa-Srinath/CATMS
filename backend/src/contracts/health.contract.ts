/**
 * src/contracts/health.contract.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * TypeScript DTOs for the /api/v1/health and /api/v1/readiness endpoints.
 * Consumed by: routes/health.routes.ts and frontend/src/api/health.api.ts (when implemented).
 */

export interface HealthResponse {
  status: 'ok';
  version: string;
  timestamp: string;   // ISO 8601 UTC
  uptime: number;      // seconds
}

export interface ReadinessResponse {
  ready: boolean;
  checks: {
    database: {
      ok: boolean;
      latencyMs: number;
    };
  };
}
