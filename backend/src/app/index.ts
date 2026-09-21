/**
 * src/app/index.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Entry point — creates the HTTP server, binds to port, handles graceful shutdown.
 *
 * Startup sequence:
 *   1. Validate environment (env.ts — exits if invalid)
 *   2. Check database connectivity (warn if unavailable at startup — retry handled by pool)
 *   3. Create Express app
 *   4. Start HTTP server on API_PORT
 *   5. Register graceful shutdown on SIGTERM / SIGINT
 */

import { createApp } from './server';
import { env } from '../shared/env';
import { logger } from '../shared/logger';
import { checkDatabaseConnectivity, closePool } from '../db/pool';

async function main(): Promise<void> {
  // ── 1. Environment is already validated by env.ts import ──────────────────

  // ── 2. Pre-flight DB connectivity check ───────────────────────────────────
  const dbCheck = await checkDatabaseConnectivity();
  if (dbCheck.ok) {
    logger.info({ latencyMs: dbCheck.latencyMs }, 'PostgreSQL connectivity OK');
  } else {
    // Warn but do not exit — Docker Compose starts API after postgres is healthy,
    // but in local development the DB might still be starting.
    logger.warn('PostgreSQL connectivity check failed — retries will happen on first query');
  }

  // ── 3. Create Express app ──────────────────────────────────────────────────
  const app = createApp();

  // ── 4. Start HTTP server ───────────────────────────────────────────────────
  const server = app.listen(env.API_PORT, '0.0.0.0', () => {
    logger.info(
      {
        port:    env.API_PORT,
        env:     env.NODE_ENV,
        health:  `http://localhost:${env.API_PORT}/api/v1/health`,
        readiness: `http://localhost:${env.API_PORT}/api/v1/readiness`,
      },
      'CATMS API server started',
    );
  });

  // ── 5. Graceful shutdown ───────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received — draining...');

    // Stop accepting new connections
    server.close(async () => {
      try {
        await closePool();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });

    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
      logger.error('Graceful shutdown timeout — forcing exit');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Catch uncaught exceptions — log and exit so the container restarts cleanly
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection — exiting');
    process.exit(1);
  });
}

main().catch((err) => {
  // env.ts may not be initialised yet — use console.error as fallback
  console.error('[CATMS] Fatal startup error:', err);
  process.exit(1);
});
