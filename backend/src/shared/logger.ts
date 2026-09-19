/**
 * src/shared/logger.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Pino structured logger. All modules import this singleton.
 *
 * Rules (member_plan.md §3, CODEBASE_GUIDE.md):
 *   - Correlation ID is attached per-request via pino-http (see correlationId middleware).
 *   - Never log: passwords, tokens, NIC, clinical text, raw SQL errors, stack traces.
 *   - Use child loggers per module: logger.child({ module: 'appointments' })
 *   - LOG_LEVEL controls verbosity. Default: 'info'.
 */

import pino, { type LoggerOptions } from 'pino';
import { env } from './env';

const pinoOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  // Redact fields that must never appear in structured logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.password_hash',
      '*.token',
      '*.jwt',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'catms-api',
    env: env.NODE_ENV,
  },
  // Timestamps in ISO 8601 UTC
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Pretty-print in development only — production uses JSON for log aggregators
// Assigned separately to satisfy exactOptionalPropertyTypes
if (env.NODE_ENV === 'development') {
  pinoOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  };
}

export const logger = pino(pinoOptions);

export type Logger = typeof logger;
