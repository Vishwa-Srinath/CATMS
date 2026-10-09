/**
 * src/modules/claims/claims.routes.ts
 * Owner: Dev3 | Issue: CATMS-049
 *
 * Express router for Insurance Claims:
 *   - POST /preview              (Preview eligibility & coordination of benefits)
 *   - GET  /preview              (Query-based preview support)
 *   - POST / & POST /submit      (Submit claims via catms.submit_claim)
 *   - GET  /                     (List claims with filters & pagination)
 *   - GET  /:id                  (Get claim detail with snapshotted lines & status log)
 *   - PATCH /:id/resolve         (Resolve claim — finance/admin role-gated)
 *   - POST  /:id/resolve         (Alternative POST resolve endpoint)
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003, CATMS-006, CATMS-008):
 *   - Thin transport routes only — Zod validation and service delegation.
 *   - Resolution is strictly gated to finance roles (Admin, Manager).
 *   - Reception and Clinician users are forbidden (403) from resolving claims.
 *   - Browser-supplied totals, amounts, and actor IDs are strictly rejected.
 *   - Standard success envelope wraps all responses: { data: ..., meta: { correlationId } }.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireRole } from '../../app/middleware/auth';
import { claimsService } from './claims.service';
import {
  submitClaimSchema,
  previewClaimSchema,
  previewClaimQuerySchema,
  resolveClaimSchema,
  claimListQuerySchema,
} from './claims.schema';
import { AppError, successEnvelope } from '../../shared/errors';

export const claimRouter = Router();

function parseIdParam(req: Request, paramName = 'id'): number {
  const raw = req.params[paramName];
  const id = Number(raw);
  if (!raw || Number.isNaN(id) || id <= 0 || !Number.isInteger(id)) {
    throw AppError.validationError(`Invalid ${paramName} parameter: must be a positive integer.`);
  }
  return id;
}

// ── 1. Eligibility Preview (POST /preview & GET /preview) ─────────────────────

claimRouter.post(
  '/preview',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance', 'Reception', 'Clinician'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = previewClaimSchema.parse(req.body);
      const result = await claimsService.previewClaimEligibility(input.invoiceId, input.policyIds);
      const correlationId = res.locals['correlationId'] as string;
      res.status(200).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

claimRouter.get(
  '/preview',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance', 'Reception', 'Clinician'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = previewClaimQuerySchema.parse(req.query);
      const result = await claimsService.previewClaimEligibility(query.invoiceId, query.policyIds);
      const correlationId = res.locals['correlationId'] as string;
      res.status(200).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── 2. Claim Submission (POST / & POST /submit) ───────────────────────────────

const submitHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = submitClaimSchema.parse(req.body);
    const createdClaims = await claimsService.submitClaim(input, req.user!);
    const correlationId = res.locals['correlationId'] as string;
    res.status(201).json(successEnvelope(createdClaims, correlationId));
  } catch (err) {
    next(err);
  }
};

claimRouter.post(
  '/',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance', 'Reception'),
  submitHandler,
);

claimRouter.post(
  '/submit',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance', 'Reception'),
  submitHandler,
);

// ── 3. Claim Listing (GET /) ─────────────────────────────────────────────────

claimRouter.get(
  '/',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance', 'Reception', 'Clinician', 'QA'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = claimListQuerySchema.parse(req.query);
      const result = await claimsService.listClaims(query);
      const correlationId = res.locals['correlationId'] as string;
      res.status(200).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── 4. Claim Detail (GET /:id) ───────────────────────────────────────────────

claimRouter.get(
  '/:id',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance', 'Reception', 'Clinician', 'QA'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const claimId = parseIdParam(req, 'id');
      const claim = await claimsService.getClaimById(claimId);
      const correlationId = res.locals['correlationId'] as string;
      res.status(200).json(successEnvelope(claim, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// ── 5. Controlled Claim Resolution (PATCH /:id/resolve & POST /:id/resolve) ───

const resolveHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claimId = parseIdParam(req, 'id');
    const input = resolveClaimSchema.parse(req.body);
    const result = await claimsService.resolveClaim(claimId, input, req.user!);
    const correlationId = res.locals['correlationId'] as string;
    res.status(200).json(successEnvelope(result, correlationId));
  } catch (err) {
    next(err);
  }
};

// Restricted strictly to Finance & Administrative roles
claimRouter.patch(
  '/:id/resolve',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance'),
  resolveHandler,
);

claimRouter.post(
  '/:id/resolve',
  requireAuth,
  requireRole('Admin', 'Manager', 'BranchManager', 'AdminFinance'),
  resolveHandler,
);
