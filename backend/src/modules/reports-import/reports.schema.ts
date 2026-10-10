/**
 * src/modules/reports-import/reports.schema.ts
 * Owner: Dev5 | Issue: CATMS-055
 *
 * Zod validation schemas for Reports API.
 */

import { z } from 'zod';

export const reportFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format').optional(),
  branchId: z.coerce.number().int().positive('branchId must be a positive integer').optional(),
});
