/**
 * src/modules/reports-import/reports.schema.ts
 * Owner: Dev5 | Issue: CATMS-055
 *
 * Zod validation schemas for Reports API.
 */

import { z } from 'zod';

export const reportFilterSchema = z.object({
  query: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    branchId: z.coerce.number().int().positive().optional(),
  })
});
