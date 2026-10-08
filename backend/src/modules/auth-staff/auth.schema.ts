/**
 * src/modules/auth-staff/auth.schema.ts
 * Owner: Dev2 | Issue: CATMS-045
 *
 * Zod validation schemas for authentication endpoints.
 *
 * Rules (CODEBASE_GUIDE.md §6):
 *   - Validate all user inputs before querying the database.
 *   - Reject client-supplied IDs, status, or timestamps.
 */

import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ required_error: 'Username is required.' })
    .trim()
    .min(3, { message: 'Username must be at least 3 characters.' })
    .max(50, { message: 'Username must not exceed 50 characters.' }),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(1, { message: 'Password is required.' })
    .max(128, { message: 'Password must not exceed 128 characters.' }),
});

export type LoginInput = z.infer<typeof loginSchema>;
