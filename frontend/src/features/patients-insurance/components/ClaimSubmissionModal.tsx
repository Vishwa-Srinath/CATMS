/**
 * src/features/patients-insurance/components/ClaimSubmissionModal.tsx
 * Owner: Dev3 | Issue: CATMS-057
 *
 * Submit insurance claim form modal.
 */

import type { FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Invoice, Patient } from '../../../types';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';

export interface ClaimSubmissionModalProps {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: Error | null;
  getPatient: (invoice: Invoice) => Patient;
}

export function ClaimSubmissionModal({
  invoice,
  open,
  onClose,
  onSubmit,
  error,
  getPatient,
}: ClaimSubmissionModalProps) {
  if (!invoice) return null;

  const patient = getPatient(invoice);
  const activePolicies = patient.policies.filter((p) => p.status === 'Active');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit insurance claim"
      description={`${invoice.invoiceNo} · internal tracking`}
      size="sm"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <RuleError error={error} />}

        <InfoNote title="No external transmission">
          Phase 1 stores and tracks this claim internally. It does not send data to the insurer.
        </InfoNote>

        <Field label="Insurance policy" required>
          <select name="policy" className="input">
            {activePolicies.map((policy) => (
              <option value={policy.policyNo} key={policy.id}>
                {policy.provider} · {policy.policyNo}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Claimed amount" required>
          <input
            name="amount"
            type="number"
            className="input"
            min="1"
            step="0.01"
            defaultValue={invoice.insuranceCovered}
            required
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <ShieldCheck size={16} />Submit claim
          </Button>
        </div>
      </form>
    </Modal>
  );
}
