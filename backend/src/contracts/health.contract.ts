export interface HealthResponse {
  status: 'ok';
  version: string;
  timestamp: string;
  uptime: number;
}

export interface DatabaseHealthCheck {
  ok: boolean;
  latencyMs: number;
}

export interface MigrationHealthCheck {
  ok: boolean;
  latestVersion: number;
  appliedCount: number;
}

export interface ReadinessResponse {
  ready: boolean;
  checks: {
    database: DatabaseHealthCheck;
    migrations?: MigrationHealthCheck;
  };
}

