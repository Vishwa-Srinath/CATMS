/**
 * src/shared/env.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Validates and exports all environment variables required by the API.
 * The process exits immediately if any required variable is missing or invalid.
 *
 * Rule: No module may import process.env directly. Always import from this file.
 * This ensures startup fails loudly rather than dying at the first DB call.
 */

import { z } from 'zod';

const envSchema = z.object({
  // ── Server ────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3000),

  // ── PostgreSQL ────────────────────────────────────────────────────────────
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_DB:   z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),

  // ── Authentication ────────────────────────────────────────────────────────
  JWT_SECRET: z.string().min(64, {
    message: 'JWT_SECRET must be at least 64 characters. Generate with: node -e "require(\'crypto\').randomBytes(64).toString(\'hex\')" | pbcopy',
  }),
  COOKIE_SECURE:          z.string().transform(v => v === 'true').default('false'),
  COOKIE_SAME_SITE:       z.enum(['strict', 'lax', 'none']).default('lax'),
  COOKIE_MAX_AGE_SECONDS: z.coerce.number().int().positive().default(3600),
  CSRF_SECRET:            z.string().min(32, {
    message: 'CSRF_SECRET must be at least 32 characters.',
  }),

  // ── CORS ──────────────────────────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:5173'),

  // ── Rate limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX:       z.coerce.number().int().positive().default(200),

  // ── Logging ───────────────────────────────────────────────────────────────
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
});

function loadEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    // Format validation errors clearly — show every missing/invalid variable
    const errors = result.error.errors
      .map(e => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    console.error('\n[CATMS] ❌  Environment validation failed:\n');
    console.error(errors);
    console.error('\nCopy infra/.env.example to .env and fill all required values.\n');
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
