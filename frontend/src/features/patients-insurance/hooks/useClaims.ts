/**
 * src/features/patients-insurance/hooks/useClaims.ts
 * Owner: Dev3 | Issues: CATMS-049, CATMS-057, CATMS-060
 *
 * TanStack React Query hooks for Insurance Claims lifecycle:
 * preview eligibility, submission, listing, detail, and controlled resolution.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  claimsApi,
  type ClaimDto,
  type ClaimDetailDto,
  type ClaimPreviewResultDto,
  type ClaimFilters,
  type SubmitClaimInput,
  type ResolveClaimInput,
  type ClaimResolutionResultDto,
} from '../../../api/claims.api';
import { ApiError } from '../../../api/errors';

export const CLAIMS_QUERY_KEYS = {
  all: ['claims'] as const,
  list: (filters?: ClaimFilters) => ['claims', 'list', filters] as const,
  detail: (id: number) => ['claims', 'detail', id] as const,
  preview: (invoiceId?: number, policyIds?: number[]) =>
    ['claims', 'preview', { invoiceId, policyIds }] as const,
};

// ── 1. Claims List Hook ──────────────────────────────────────────────────────

export function useClaims(filters?: ClaimFilters) {
  const query = useQuery<ClaimDto[], ApiError>({
    queryKey: CLAIMS_QUERY_KEYS.list(filters),
    queryFn: () => claimsApi.list(filters),
    staleTime: 20_000,
  });

  return {
    claims: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── 2. Claim Detail Hook ─────────────────────────────────────────────────────

export function useClaimDetail(claimId?: number | null) {
  const query = useQuery<ClaimDetailDto, ApiError>({
    queryKey: claimId ? CLAIMS_QUERY_KEYS.detail(claimId) : ['claims', 'detail', 'none'],
    queryFn: () => {
      if (!claimId) throw new Error('Claim ID is required');
      return claimsApi.getById(claimId);
    },
    enabled: typeof claimId === 'number' && claimId > 0,
    staleTime: 20_000,
  });

  return {
    claim: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── 3. Claim Eligibility Preview Hook ────────────────────────────────────────

export function useClaimPreview(invoiceId?: number | null, policyIds?: number[]) {
  const hasPolicies = Array.isArray(policyIds) && policyIds.length > 0;
  const isEnabled = typeof invoiceId === 'number' && invoiceId > 0 && hasPolicies;

  const query = useQuery<ClaimPreviewResultDto, ApiError>({
    queryKey: CLAIMS_QUERY_KEYS.preview(invoiceId ?? undefined, policyIds),
    queryFn: () => {
      if (!invoiceId || !policyIds) throw new Error('Invoice and policies are required');
      return claimsApi.previewEligibility({ invoiceId, policyIds });
    },
    enabled: isEnabled,
    staleTime: 10_000,
  });

  return {
    preview: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── 4. Submit Claim Mutation Hook ────────────────────────────────────────────

export function useSubmitClaim() {
  const queryClient = useQueryClient();

  const mutation = useMutation<ClaimDto[], ApiError, SubmitClaimInput>({
    mutationFn: (data) => claimsApi.submit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['clinical'] });
    },
  });

  return {
    submitClaim: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}

// ── 5. Resolve Claim Mutation Hook (Finance Role-gated) ──────────────────────

export function useResolveClaim() {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    ClaimResolutionResultDto,
    ApiError,
    { claimId: number; data: ResolveClaimInput }
  >({
    mutationFn: ({ claimId, data }) => claimsApi.resolve(claimId, data),
    onSuccess: (_, { claimId }) => {
      queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEYS.all });
      queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEYS.detail(claimId) });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['clinical'] });
    },
  });

  return {
    resolveClaim: mutation.mutateAsync,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}
