/**
 * src/features/patients-insurance/components/ClaimReviewModal.tsx
 * Owner: Dev3 | Issue: CATMS-057
 *
 * Review insurance claim decision form modal.
 */

import type { FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Claim, Invoice } from '../../../types';
import { formatCurrency } from '../../../lib/domain';
import { Badge, Button, Field, Modal } from '../../../components/ui';

export interface ClaimReviewModalProps {
  claimReview: { invoice: Invoice; claim: Claim } | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ClaimReviewModal({
  claimReview,
  open,
  onClose,
  onSubmit,
}: ClaimReviewModalProps) {
  if (!claimReview) return null;

  const { claim, invoice } = claimReview;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Review insurance claim"
      description={`${claim.provider} · ${invoice.invoiceNo}`}
      size="sm"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4">
          <div>
            <p className="label-caps">Claimed</p>
            <p className="mt-1 font-bold text-slate-800">{formatCurrency(claim.claimedAmount)}</p>
          </div>
          <div>
            <p className="label-caps">Current status</p>
            <div className="mt-1">
              <Badge>{claim.status}</Badge>
            </div>
          </div>
        </div>

        <Field label="Decision" required>
          <select name="status" className="input" defaultValue={claim.status}>
            <option>Pending</option>
            <option>Approved</option>
            <option value="PartiallyApproved">Partially approved</option>
            <option>Rejected</option>
          </select>
        </Field>

        <Field label="Approved amount" hint="Enter 0 for a rejected or pending claim" required>
          <input
            name="approvedAmount"
            type="number"
            className="input"
            min="0"
            max={claim.claimedAmount}
            step="0.01"
            defaultValue={claim.approvedAmount}
            required
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <CheckCircle2 size={16} />Save decision
          </Button>
        </div>
      </form>
    </Modal>
  );
}
