/**
 * src/app/middleware/correlationId.ts
 * Owner: Dev1 | Issue: CATMS-013
 *
 * Assigns a unique correlation ID to every incoming request.
 * The ID is:
 *   1. Read from the 'X-Correlation-Id' header if provided by a trusted caller.
 *   2. Generated fresh as a UUID v4 if not present.
 *
 * The ID is:
 *   - Attached to res.locals.correlationId for use in route handlers.
 *   - Echoed back in the 'X-Correlation-Id' response header.
 *   - Included in every response envelope (error and success) via meta.correlationId.
 *   - Attached to pino-http request log so every log line is traceable.
 *
 * Rules:
 *   - Never trust a client-supplied correlation ID for security decisions.
 *     It is only for tracing — any value is accepted and sanitized.
 *   - Max 128 characters accepted; anything longer is replaced with a fresh UUID.
 */

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

const HEADER = 'x-correlation-id';
const MAX_LENGTH = 128;

export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[HEADER];
  let id: string;

  if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= MAX_LENGTH) {
    // Sanitize: keep only printable ASCII, no newlines/tabs (log injection protection)
    id = incoming.replace(/[^\x20-\x7E]/g, '').slice(0, MAX_LENGTH) || uuidv4();
  } else {
    id = uuidv4();
  }

  res.locals['correlationId'] = id;
  res.setHeader(HEADER, id);
  next();
}
