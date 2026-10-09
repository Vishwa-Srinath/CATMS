/**
 * src/modules/claims/claims.schema.ts
 * Owner: Dev3 | Issue: CATMS-049
 *
 * Zod validation schemas for Insurance Claims endpoints:
 *   - Preview eligibility
 *   - Submit claims
 *   - List and get claims
 *   - Resolve claims (Approved, PartiallyApproved, Rejected)
 *
 * Rules (CODEBASE_GUIDE.md §6, CATMS-003, CATMS-006, CATMS-008):
 *   - Strict mode rejects client-supplied totals, computed amounts, and actors.
 *   - Resolution requires mandatory rejectionReason for Rejected status.
 *   - Line approvals must contain positive invoiceLineId and non-negative approvedAmount.
 */

import { z } from 'zod';

// Prohibited client-supplied properties that attempt to override server calculations or actors
const PROHIBITED_KEYS = [
  'claimedAmount',
  'claimed_amount',
  'approvedAmount',
  'approved_amount',
  'total',
  'totals',
  'totalClaimed',
  'submittedByUserId',
  'submitted_by_user_id',
  'resolvedByUserId',
  'resolved_by_user_id',
  'actorId',
  'actor_id',
  'patientLiabilityAmount',
  'patient_liability_amount',
];

function checkDisallowedKeys(
  obj: Record<string, unknown>,
  allowedKeys: string[],
  ctx: z.RefinementCtx,
  contextName: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.includes(key)) {
      if (PROHIBITED_KEYS.includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Browser-supplied amount or actor field '${key}' is prohibited. Calculation and actor attribution are enforced server-side.`,
          path: [key],
        });
      } else {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unexpected field '${key}' in ${contextName}.`,
          path: [key],
        });
      }
    }
  }
}

// ── Submit Claim Schema ──────────────────────────────────────────────────────

export const submitClaimSchema = z
  .object({
    invoiceId: z.number({ required_error: 'invoiceId is required' }).int().positive('invoiceId must be a positive integer'),
    policyIds: z
      .array(z.number().int().positive('policyIds must contain positive integers'), {
        required_error: 'policyIds is required',
      })
      .min(1, 'At least one policyId must be provided'),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    checkDisallowedKeys(data as unknown as Record<string, unknown>, ['invoiceId', 'policyIds'], ctx, 'submit claim request');
  });

// ── Preview Claim Schema (Body) ──────────────────────────────────────────────

export const previewClaimSchema = z
  .object({
    invoiceId: z.number({ required_error: 'invoiceId is required' }).int().positive('invoiceId must be a positive integer'),
    policyIds: z
      .array(z.number().int().positive('policyIds must contain positive integers'), {
        required_error: 'policyIds is required',
      })
      .min(1, 'At least one policyId must be provided'),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    checkDisallowedKeys(data as unknown as Record<string, unknown>, ['invoiceId', 'policyIds'], ctx, 'preview claim request');
  });

// ── Preview Claim Query Schema (GET) ─────────────────────────────────────────

export const previewClaimQuerySchema = z.object({
  invoiceId: z.coerce.number().int().positive('invoiceId must be a positive integer'),
  policyIds: z.preprocess((val) => {
    if (Array.isArray(val)) return val.map((v) => Number(v));
    if (typeof val === 'string') {
      return val.split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    }
    return val;
  }, z.array(z.number().int().positive()).min(1, 'At least one policyId must be provided in policyIds')),
});

// ── Resolve Claim Line Approval Schema ───────────────────────────────────────

export const resolveClaimLineApprovalSchema = z
  .object({
    invoiceLineId: z.number().int().positive('invoiceLineId must be a positive integer'),
    approvedAmount: z.number().nonnegative('approvedAmount on line must be non-negative'),
  })
  .strict();

// ── Resolve Claim Schema ─────────────────────────────────────────────────────

export const resolveClaimSchema = z
  .object({
    resolution: z.enum(['Approved', 'PartiallyApproved', 'Rejected'], {
      required_error: 'resolution is required and must be one of Approved, PartiallyApproved, Rejected',
    }),
    approvedAmount: z.number().nonnegative('approvedAmount must be non-negative').optional(),
    rejectionReason: z.string().trim().max(1000, 'rejectionReason cannot exceed 1000 characters').optional(),
    lineApprovals: z.array(resolveClaimLineApprovalSchema).optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    checkDisallowedKeys(
      data as unknown as Record<string, unknown>,
      ['resolution', 'approvedAmount', 'rejectionReason', 'lineApprovals'],
      ctx,
      'resolve claim request',
    );

    if (data.resolution === 'Rejected') {
      if (!data.rejectionReason || data.rejectionReason.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'rejectionReason is mandatory when resolving a claim as Rejected.',
          path: ['rejectionReason'],
        });
      }
      if (data.approvedAmount !== undefined && data.approvedAmount !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'approvedAmount must be 0 for Rejected claims.',
          path: ['approvedAmount'],
        });
      }
    }

    if (data.resolution === 'PartiallyApproved') {
      const hasLineApprovals = data.lineApprovals && data.lineApprovals.length > 0;
      const hasApprovedAmount = data.approvedAmount !== undefined;

      if (!hasLineApprovals && !hasApprovedAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PartiallyApproved claim resolution requires either approvedAmount or lineApprovals.',
          path: ['approvedAmount'],
        });
      }

      if (hasApprovedAmount && data.approvedAmount! <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'approvedAmount must be greater than 0 for PartiallyApproved claims.',
          path: ['approvedAmount'],
        });
      }
    }
  });

// ── List Claims Query Schema ─────────────────────────────────────────────────

export const claimListQuerySchema = z.object({
  invoiceId: z.coerce.number().int().positive().optional(),
  policyId: z.coerce.number().int().positive().optional(),
  patientId: z.coerce.number().int().positive().optional(),
  status: z.enum(['Pending', 'Approved', 'PartiallyApproved', 'Rejected']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});
