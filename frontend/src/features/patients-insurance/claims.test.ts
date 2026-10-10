/**
 * src/features/patients-insurance/claims.test.ts
 * Owner: Dev3 | Issue: CATMS-060
 *
 * Unit and integration tests for Claims API client, eligibility preview,
 * multi-policy submission, server-calculated allocations, and RBAC finance gating.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { claimsApi, type SubmitClaimInput, type ResolveClaimInput } from '../../api/claims.api';
import { ApiError } from '../../api/errors';

describe('CATMS-060 — Claims Submission and Review Frontend API & RBAC Integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { document?: { cookie: string } }).document = {
      cookie: 'catms_csrf=claims-csrf-token;',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  // ── 1. Eligibility Preview ──────────────────────────────────────────────────

  describe('1. Server-Calculated Eligibility Preview', () => {
    it('calls /claims/preview and unwraps server-calculated coordination of benefits', async () => {
      const mockPreviewResult = {
        invoiceId: 701,
        appointmentId: 101,
        serviceDate: '2026-09-10',
        patientId: 1,
        patientFullName: 'Anura Perera',
        invoiceSubtotal: 10000.0,
        totalEstimatedInsurance: 8050.0,
        estimatedPatientLiability: 1950.0,
        policies: [
          {
            policyId: 11,
            policyNumber: 'POL-CEY-001',
            providerId: 1,
            providerName: 'Ceylinco General Insurance',
            priority: 1,
            totalClaimedAmount: 6550.0,
            lines: [
              {
                invoiceLineId: 1,
                lineNumber: 1,
                serviceCode: 'TREAT-001',
                description: 'General Consultation',
                unitPrice: 3500.0,
                quantity: 1,
                lineTotal: 3500.0,
                policyCoverageId: 10,
                coveredPercentage: 80.0,
                coverageCap: 2000.0,
                nominalCoveredAmount: 2800.0,
                maxEligibleCover: 2000.0,
                claimableAmount: 2000.0,
                remainingLineBalance: 1500.0,
              },
              {
                invoiceLineId: 2,
                lineNumber: 2,
                serviceCode: 'TREAT-002',
                description: 'Dental Cleaning',
                unitPrice: 6500.0,
                quantity: 1,
                lineTotal: 6500.0,
                policyCoverageId: 11,
                coveredPercentage: 70.0,
                coverageCap: 5000.0,
                nominalCoveredAmount: 4550.0,
                maxEligibleCover: 4550.0,
                claimableAmount: 4550.0,
                remainingLineBalance: 1950.0,
              },
            ],
          },
          {
            policyId: 12,
            policyNumber: 'SLIC-POL-99001',
            providerId: 2,
            providerName: 'Sri Lanka Insurance',
            priority: 2,
            totalClaimedAmount: 1500.0,
            lines: [
              {
                invoiceLineId: 1,
                lineNumber: 1,
                serviceCode: 'TREAT-001',
                description: 'General Consultation',
                unitPrice: 3500.0,
                quantity: 1,
                lineTotal: 3500.0,
                policyCoverageId: 20,
                coveredPercentage: 100.0,
                coverageCap: 1500.0,
                nominalCoveredAmount: 1500.0,
                maxEligibleCover: 1500.0,
                claimableAmount: 1500.0,
                remainingLineBalance: 0.0,
              },
            ],
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockPreviewResult }),
      });

      const preview = await claimsApi.previewEligibility({
        invoiceId: 701,
        policyIds: [11, 12],
      });

      expect(preview.invoiceId).toBe(701);
      expect(preview.invoiceSubtotal).toBe(10000.0);
      expect(preview.totalEstimatedInsurance).toBe(8050.0);
      expect(preview.estimatedPatientLiability).toBe(1950.0);
      expect(preview.policies).toHaveLength(2);
      expect(preview.policies[0].totalClaimedAmount).toBe(6550.0);
      expect(preview.policies[1].totalClaimedAmount).toBe(1500.0);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/claims/preview',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ invoiceId: 701, policyIds: [11, 12] }),
        }),
      );
    });

    it('surfaces database rejection when policy is outside validity window', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Service date is outside policy validity window',
          },
        }),
      });

      try {
        await claimsApi.previewEligibility({
          invoiceId: 701,
          policyIds: [16],
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.message).toContain('outside policy validity window');
      }
    });
  });

  // ── 2. Claim Submission & Invariants ────────────────────────────────────────

  describe('2. Multi-Policy Claim Submission & Invariant Integrity', () => {
    it('submits claims to database and receives server-created Pending records', async () => {
      const mockCreatedClaims = [
        {
          claimId: 1001,
          claimNumber: 'CLM-1001',
          invoiceId: 701,
          policyId: 11,
          policyNumber: 'POL-CEY-001',
          providerName: 'Ceylinco General Insurance',
          claimStatus: 'Pending',
          claimedAmount: 6550.0,
          approvedAmount: 0.0,
          rejectionReason: null,
          submittedByUserId: 3,
          submittedAt: '2026-10-10T11:00:00.000Z',
          resolvedByUserId: null,
          resolvedAt: null,
          createdAt: '2026-10-10T11:00:00.000Z',
          updatedAt: '2026-10-10T11:00:00.000Z',
        },
        {
          claimId: 1002,
          claimNumber: 'CLM-1002',
          invoiceId: 701,
          policyId: 12,
          policyNumber: 'SLIC-POL-99001',
          providerName: 'Sri Lanka Insurance',
          claimStatus: 'Pending',
          claimedAmount: 1500.0,
          approvedAmount: 0.0,
          rejectionReason: null,
          submittedByUserId: 3,
          submittedAt: '2026-10-10T11:00:00.000Z',
          resolvedByUserId: null,
          resolvedAt: null,
          createdAt: '2026-10-10T11:00:00.000Z',
          updatedAt: '2026-10-10T11:00:00.000Z',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: mockCreatedClaims }),
      });

      const payload: SubmitClaimInput = {
        invoiceId: 701,
        policyIds: [11, 12],
      };

      const result = await claimsApi.submit(payload);
      expect(result).toHaveLength(2);
      expect(result[0].claimStatus).toBe('Pending');
      expect(result[0].claimedAmount).toBe(6550.0);
      expect(result[0].approvedAmount).toBe(0.0); // Pending invariant: approved is 0
      expect(result[1].claimNumber).toBe('CLM-1002');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/claims',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'claims-csrf-token',
          }),
        }),
      );
    });

    it('rejects client-supplied amounts or totals in submission request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Browser-supplied totals or claimed amounts are strictly prohibited.',
          },
        }),
      });

      try {
        await claimsApi.submit({
          invoiceId: 701,
          policyIds: [11],
          // @ts-expect-error - testing client injection rejection
          claimedAmount: 5000,
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.message).toContain('prohibited');
      }
    });
  });

  // ── 3. Controlled Claim Resolution & Finance Gate ───────────────────────────

  describe('3. Claim Resolution & Finance RBAC Gate', () => {
    it('approves claim and updates invoice liability via /claims/:id/resolve', async () => {
      const mockResolutionResult = {
        claim: {
          claimId: 1001,
          claimNumber: 'CLM-1001',
          invoiceId: 701,
          policyId: 11,
          claimStatus: 'Approved',
          claimedAmount: 6550.0,
          approvedAmount: 6550.0,
          rejectionReason: null,
          submittedByUserId: 3,
          submittedAt: '2026-10-10T11:00:00.000Z',
          resolvedByUserId: 1,
          resolvedAt: '2026-10-10T11:15:00.000Z',
          createdAt: '2026-10-10T11:00:00.000Z',
          updatedAt: '2026-10-10T11:15:00.000Z',
          lines: [],
          statusLogs: [],
        },
        invoiceLiability: {
          invoiceId: 701,
          subtotalAmount: 10000.0,
          approvedInsuranceAmount: 6550.0,
          patientLiabilityAmount: 3450.0,
          patientPaymentStatus: 'Unpaid',
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockResolutionResult }),
      });

      const resolutionPayload: ResolveClaimInput = {
        resolution: 'Approved',
        approvedAmount: 6550.0,
      };

      const result = await claimsApi.resolve(1001, resolutionPayload);
      expect(result.claim.claimStatus).toBe('Approved');
      expect(result.claim.approvedAmount).toBe(6550.0);
      expect(result.invoiceLiability.approvedInsuranceAmount).toBe(6550.0);
      expect(result.invoiceLiability.patientLiabilityAmount).toBe(3450.0);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/claims/1001/resolve',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'claims-csrf-token',
          }),
        }),
      );
    });

    it('rejects claim with mandatory rejectionReason', async () => {
      const mockRejectResult = {
        claim: {
          claimId: 1002,
          claimNumber: 'CLM-1002',
          invoiceId: 701,
          policyId: 12,
          claimStatus: 'Rejected',
          claimedAmount: 1500.0,
          approvedAmount: 0.0,
          rejectionReason: 'Underwriting exclusion',
          submittedByUserId: 3,
          submittedAt: '2026-10-10T11:00:00.000Z',
          resolvedByUserId: 1,
          resolvedAt: '2026-10-10T11:20:00.000Z',
          createdAt: '2026-10-10T11:00:00.000Z',
          updatedAt: '2026-10-10T11:20:00.000Z',
          lines: [],
          statusLogs: [],
        },
        invoiceLiability: {
          invoiceId: 701,
          subtotalAmount: 10000.0,
          approvedInsuranceAmount: 6550.0,
          patientLiabilityAmount: 3450.0,
          patientPaymentStatus: 'Unpaid',
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockRejectResult }),
      });

      const result = await claimsApi.resolve(1002, {
        resolution: 'Rejected',
        rejectionReason: 'Underwriting exclusion',
        approvedAmount: 0,
      });

      expect(result.claim.claimStatus).toBe('Rejected');
      expect(result.claim.approvedAmount).toBe(0.0);
      expect(result.claim.rejectionReason).toBe('Underwriting exclusion');
    });

    it('surfaces 403 FORBIDDEN when unauthorized role attempts resolution', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 'FORBIDDEN',
            message: 'Permission denied: Claim resolution is restricted to Finance administrators.',
          },
        }),
      });

      try {
        await claimsApi.resolve(1001, { resolution: 'Approved' });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(403);
        expect(apiErr.isForbidden()).toBe(true);
        expect(apiErr.message).toContain('restricted to Finance administrators');
      }
    });

    it('surfaces 409 CONFLICT when attempting to re-resolve an already resolved claim', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'Claim CLM-1001 is already resolved and cannot be re-evaluated.',
          },
        }),
      });

      try {
        await claimsApi.resolve(1001, { resolution: 'Approved' });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.isConflict()).toBe(true);
      }
    });
  });

  // ── 4. Claims Listing & Detail ──────────────────────────────────────────────

  describe('4. Claims Listing and Detailed Timeline Inspection', () => {
    it('lists claims filtered by invoiceId', async () => {
      const mockClaims = [
        {
          claimId: 1001,
          claimNumber: 'CLM-1001',
          invoiceId: 701,
          policyId: 11,
          providerName: 'Ceylinco General Insurance',
          claimStatus: 'Pending',
          claimedAmount: 6550.0,
          approvedAmount: 0.0,
          submittedAt: '2026-10-10T11:00:00.000Z',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockClaims }),
      });

      const claims = await claimsApi.list({ invoiceId: 701 });
      expect(claims).toHaveLength(1);
      expect(claims[0].claimNumber).toBe('CLM-1001');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/claims?invoiceId=701'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('retrieves detailed claim with snapshotted lines and transition history', async () => {
      const mockDetail = {
        claimId: 1001,
        claimNumber: 'CLM-1001',
        invoiceId: 701,
        policyId: 11,
        claimStatus: 'Pending',
        claimedAmount: 6550.0,
        approvedAmount: 0.0,
        rejectionReason: null,
        submittedByUserId: 3,
        submittedAt: '2026-10-10T11:00:00.000Z',
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: '2026-10-10T11:00:00.000Z',
        updatedAt: '2026-10-10T11:00:00.000Z',
        lines: [
          {
            claimLineId: 1,
            claimId: 1001,
            invoiceLineId: 1,
            policyCoverageId: 10,
            lineNumber: 1,
            serviceCode: 'TREAT-001',
            description: 'General Consultation',
            coveredPercentage: 80.0,
            coverageCap: 2000.0,
            unitPrice: 3500.0,
            quantity: 1,
            lineTotal: 3500.0,
            nominalCoveredAmount: 2800.0,
            claimedAmount: 2000.0,
            approvedAmount: 0.0,
            createdAt: '2026-10-10T11:00:00.000Z',
          },
        ],
        statusLogs: [
          {
            statusLogId: 1,
            claimId: 1001,
            fromStatus: null,
            toStatus: 'Pending',
            transitionedByUserId: 3,
            transitionedAt: '2026-10-10T11:00:00.000Z',
            transitionReason: 'Initial claim submission',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockDetail }),
      });

      const detail = await claimsApi.getById(1001);
      expect(detail.claimId).toBe(1001);
      expect(detail.lines).toHaveLength(1);
      expect(detail.statusLogs).toHaveLength(1);
      expect(detail.statusLogs[0].toStatus).toBe('Pending');
      expect(detail.lines[0].claimedAmount).toBe(2000.0);
    });
  });
});
