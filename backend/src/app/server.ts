/**
 * src/app/server.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Express application factory — builds and configures the app without starting it.
 * The HTTP server is created and started in index.ts.
 * Separating factory from startup makes the app importable in Supertest tests.
 *
 * Middleware stack (in order):
 *   1. correlationId    — assigns/reads X-Correlation-Id, sets res.locals
 *   2. pino-http        — structured request logging with correlationId
 *   3. helmet           — security headers (CSP, HSTS, no-sniff, etc.)
 *   4. cors             — allow configured origins only
 *   5. express.json     — parse JSON bodies (max 256kb)
 *   6. cookieParser     — parse HttpOnly cookies for JWT session
 *   7. rateLimit        — per-IP rate limiting on all /api routes
 *   [module routers]    — /api/v1/* (added here as modules are implemented)
 *   8. 404 handler      — catches unknown routes
 *   9. errorHandler     — global error → envelope mapper (MUST be last)
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { env } from '../shared/env';
import { logger } from '../shared/logger';
import { correlationId } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import { AppError, ErrorCode, errorEnvelope, successEnvelope } from '../shared/errors';
import { checkDatabaseConnectivity } from '../db/pool';

import type { HealthResponse, ReadinessResponse } from '../contracts/health.contract';

const START_TIME = Date.now();

export function createApp(): express.Application {
  const app = express();

  // ── 1. Correlation ID ───────────────────────────────────────────────────────
  app.use(correlationId);

  // ── 2. Structured HTTP request logging ────────────────────────────────────
  app.use(
    pinoHttp({
      logger,
      // Attach the correlation ID that correlationId middleware already set
      genReqId: (_req, res) => res.locals['correlationId'] as string,
      // Do not log health-check requests — they are too noisy in CI
      autoLogging: {
        ignore: (req) => req.url === '/api/v1/health',
      },
      // Sanitize request/response body fields to never log sensitive values
      serializers: {
        req: (req) => ({
          method: req.method,
          url:    req.url,
          // Omit headers, body — pino redact config handles the rest
        }),
        res: (res) => ({
          statusCode: res.statusCode,
        }),
      },
    }),
  );

  // ── 3. Helmet — security headers ──────────────────────────────────────────
  app.use(
    helmet({
      // Content Security Policy: allow API responses (JSON) — no HTML served here
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc:  ["'none'"],
          objectSrc:  ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // Not needed for a pure API
    }),
  );

  // ── 4. CORS ───────────────────────────────────────────────────────────────
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. curl, Supertest) in dev/test
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new AppError(ErrorCode.FORBIDDEN, 'CORS: origin not allowed.', 403));
        }
      },
      credentials: true,       // Allow cookies (JWT session)
      allowedHeaders: ['Content-Type', 'X-Correlation-Id', 'X-CSRF-Token'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    }),
  );

  // ── 5. Body parsers ───────────────────────────────────────────────────────
  app.use(express.json({ limit: '256kb' }));

  // ── 6. Cookie parser ──────────────────────────────────────────────────────
  app.use(cookieParser(env.CSRF_SECRET));

  // ── 7. Rate limiting ──────────────────────────────────────────────────────
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max:      env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator: (req) => req.ip ?? 'unknown',
    handler: (_req, res) => {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      res.status(429).json(
        errorEnvelope(
          ErrorCode.SERVICE_UNAVAILABLE,
          'Too many requests. Please slow down and retry.',
          correlationId,
        ),
      );
    },
  });
  app.use('/api', limiter);

  // ── Module routers ─────────────────────────────────────────────────────────
  // Routers are mounted here as each module is implemented.
  // Format:  app.use('/api/v1/<resource>', <module>Router);
  //
  // CATMS-013 scope: health and readiness only.
  // All other routers are added by their respective owner's issue.

  // ── Health endpoint — always responds 200 (liveness probe) ────────────────
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    const correlationId = res.locals['correlationId'] as string;
    const body: HealthResponse = {
      status:    'ok',
      version:   process.env['npm_package_version'] ?? '0.0.0',
      timestamp: new Date().toISOString(),
      uptime:    Math.floor((Date.now() - START_TIME) / 1000),
    };
    res.status(200).json(successEnvelope(body, correlationId));
  });

  // ── Readiness endpoint — checks DB connectivity (used by Compose healthcheck) ─
  app.get('/api/v1/readiness', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const correlationId = res.locals['correlationId'] as string;
      const db = await checkDatabaseConnectivity();
      const body: ReadinessResponse = {
        ready:  db.ok,
        checks: { database: db },
      };
      res.status(db.ok ? 200 : 503).json(successEnvelope(body, correlationId));
    } catch (err) {
      next(err);
    }
  });

  // ── 404 handler — catches routes not matched above ─────────────────────────
  app.use((req: Request, res: Response) => {
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(404).json(
      errorEnvelope(
        ErrorCode.NOT_FOUND,
        `Cannot ${req.method} ${req.path}`,
        correlationId,
      ),
    );
  });

  // ── 9. Global error handler — MUST be last ────────────────────────────────
  app.use(errorHandler);

  return app;
}
