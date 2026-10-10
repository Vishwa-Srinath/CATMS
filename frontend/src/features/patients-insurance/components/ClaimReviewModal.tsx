/**
 * src/features/patients-insurance/components/ClaimReviewModal.tsx
 * Owner: Dev3 | Issues: CATMS-049, CATMS-057, CATMS-060
 *
 * Review insurance claim decision form modal with strict finance/admin role gating
 * and server-side liability recalculation.
 */

import { useState, type FormEvent } from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import type { Claim, Invoice, SessionUser } from '../../../types';
import { formatCurrency } from '../../../lib/domain';
import { Badge, Button, Field, Modal, RuleError, InfoNote } from '../../../components/ui';
import { useResolveClaim } from '../hooks/useClaims';
import type { ClaimResolutionType } from '../../../api/claims.api';
import { ApiError } from '../../../api/errors';

export interface ClaimReviewModalProps {
  claimReview: { invoice: Invoice; claim: Claim } | null;
  open: boolean;
  onClose: () => void;
  currentUser?: SessionUser | null;
  onSuccess?: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}

export function ClaimReviewModal({
  claimReview,
  open,
  onClose,
  currentUser,
  onSuccess,
}: ClaimReviewModalProps) {
  const [resolution, setResolution] = useState<ClaimResolutionType>('Approved');
  const [approvedAmount, setApprovedAmount] = useState<number>(0);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [error, setError] = useState<Error | null>(null);

  const { resolveClaim, isPending } = useResolveClaim();

  if (!claimReview) return null;

  const { claim, invoice } = claimReview;

  // Derive numeric claim ID
  const numClaimId = parseInt(String(claim.id).replace(/\D/g, ''), 10);
  const claimId = isNaN(numClaimId) ? 1001 : numClaimId;

  // Strict RBAC Gate: Only Admin and Manager (Finance roles) can resolve claims
  const isFinanceAuthorized = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isFinanceAuthorized) {
      setError(new Error('Permission Denied: Only Finance administrators and Managers may resolve claims.'));
      return;
    }

    if (resolution === 'Rejected' && !rejectionReason.trim()) {
      setError(new Error('A rejection reason is mandatory when rejecting a claim.'));
      return;
    }

    try {
      await resolveClaim({
        claimId,
        data: {
          resolution,
          approvedAmount: resolution === 'Approved' ? claim.claimedAmount : (resolution === 'PartiallyApproved' ? approvedAmount : 0),
          rejectionReason: resolution === 'Rejected' ? rejectionReason.trim() : null,
        },
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
      } else if (caught instanceof Error) {
        setError(caught);
      } else {
        setError(new Error('The claim could not be resolved.'));
      }
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review insurance claim"
      description={`${claim.provider} · ${invoice.invoiceNo}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <RuleError error={error} />}

        {!isFinanceAuthorized && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-2.5">
            <ShieldAlert size={18} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-900">Restricted Access (Finance Gate)</p>
              <p className="mt-0.5">
                Your current role ({currentUser?.role || 'Guest'}) is not permitted to resolve claims. Reception and Clinicians are blocked both client-side and server-side.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="label-caps">Claimed Amount</p>
            <p className="mt-1 font-bold text-slate-800">{formatCurrency(claim.claimedAmount)}</p>
          </div>
          <div>
            <p className="label-caps">Current Status</p>
            <div className="mt-1">
              <Badge>{claim.status}</Badge>
            </div>
          </div>
        </div>

        <Field label="Resolution Decision" required>
          <select
            name="resolution"
            className="input"
            value={resolution}
            onChange={(e) => {
              const res = e.target.value as ClaimResolutionType;
              setResolution(res);
              if (res === 'Approved') setApprovedAmount(claim.claimedAmount);
              if (res === 'Rejected') setApprovedAmount(0);
              if (res === 'PartiallyApproved' && approvedAmount === 0) setApprovedAmount(claim.claimedAmount * 0.75);
            }}
            disabled={!isFinanceAuthorized || isPending}
          >
            <option value="Approved">Approved (Full reimbursement)</option>
            <option value="PartiallyApproved">Partially approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </Field>

        {resolution === 'PartiallyApproved' && (
          <Field label="Approved Amount (LKR)" hint={`Must be between 0.01 and ${formatCurrency(claim.claimedAmount)}`} required>
            <input
              name="approvedAmount"
              type="number"
              className="input"
              min="0.01"
              max={claim.claimedAmount}
              step="0.01"
              value={approvedAmount || ''}
              onChange={(e) => setApprovedAmount(Number(e.target.value))}
              required
              disabled={!isFinanceAuthorized || isPending}
            />
          </Field>
        )}

        {resolution === 'Rejected' && (
          <Field label="Rejection Reason" hint="Mandatory justification for insurer denial" required>
            <textarea
              name="rejectionReason"
              className="input min-h-20"
              placeholder="e.g. Underwriting exclusion / treatment cap exhausted"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              required
              disabled={!isFinanceAuthorized || isPending}
            />
          </Field>
        )}

        <InfoNote title="Automated Liability Recalculation">
          Resolving this claim automatically updates the invoice patient liability on the server. No manual liability adjustment is required.
        </InfoNote>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isFinanceAuthorized || isPending}
          >
            <CheckCircle2 size={16} />
            {isPending ? 'Saving…' : 'Save decision'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
