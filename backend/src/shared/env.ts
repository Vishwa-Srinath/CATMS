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
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // ── PostgreSQL ────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().optional(),
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  POSTGRES_DB:   z.string().min(1),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_SSL:  z.string().optional().transform(v => v === 'true' || v === 'require' || v === '1').default('false'),

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

import fs from 'fs';
import path from 'path';

function tryLoadDotEnv(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {
        // ignore read error
      }
    }
  }
}

function loadEnv() {
  tryLoadDotEnv();

  // If running on Render or other PaaS where PORT is dynamically assigned
  if (process.env.PORT && !process.env.API_PORT) {
    process.env.API_PORT = process.env.PORT;
  }

  // If DATABASE_URL is provided (e.g., from Neon or Render PostgreSQL addon)
  if (process.env.DATABASE_URL) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (!process.env.POSTGRES_HOST && url.hostname) process.env.POSTGRES_HOST = url.hostname;
      if (!process.env.POSTGRES_PORT && url.port) process.env.POSTGRES_PORT = url.port;
      if (!process.env.POSTGRES_USER && url.username) process.env.POSTGRES_USER = decodeURIComponent(url.username);
      if (!process.env.POSTGRES_PASSWORD && url.password) process.env.POSTGRES_PASSWORD = decodeURIComponent(url.password);
      if (!process.env.POSTGRES_DB && url.pathname) process.env.POSTGRES_DB = url.pathname.replace(/^\//, '');
      if (!process.env.POSTGRES_SSL) {
        const sslmode = url.searchParams.get('sslmode');
        if (sslmode === 'require' || sslmode === 'verify-full' || sslmode === 'verify-ca' || url.searchParams.get('ssl') === 'true') {
          process.env.POSTGRES_SSL = 'true';
        }
      }
    } catch {
      // If DATABASE_URL fails to parse as URL, validation below will catch any missing variables
    }
  }

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
