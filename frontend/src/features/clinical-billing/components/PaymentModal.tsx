/**
 * src/features/clinical-billing/components/PaymentModal.tsx
 * Owner: Dev4 | Issue: CATMS-057
 *
 * Post payment modal form component.
 */

import type { FormEvent } from 'react';
import { CreditCard } from 'lucide-react';
import type { Invoice, Patient } from '../../../types';
import { formatCurrency, outstanding } from '../../../lib/domain';
import { Button, Field, Modal, RuleError } from '../../../components/ui';

export interface PaymentModalProps {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: Error | null;
  getPatient: (invoice: Invoice) => Patient;
}

export function PaymentModal({
  invoice,
  open,
  onClose,
  onSubmit,
  error,
  getPatient,
}: PaymentModalProps) {
  if (!invoice) return null;

  const balance = outstanding(invoice);
  const patient = getPatient(invoice);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post a payment"
      description={`${invoice.invoiceNo} · ${patient.name}`}
      size="sm"
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {error && <RuleError error={error} />}

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="label-caps">Outstanding balance</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(balance)}</p>
          <p className="mt-1 text-xs text-slate-500">Partial payments are accepted.</p>
        </div>

        <Field label="Payment amount" hint={`Maximum ${formatCurrency(balance)}`} required>
          <input
            name="amount"
            type="number"
            className="input"
            min="1"
            step="0.01"
            defaultValue={balance}
            required
          />
        </Field>

        <Field label="Payment method" required>
          <select name="method" className="input">
            <option>Cash</option>
            <option>Card</option>
            <option>Online</option>
            <option>Insurance</option>
          </select>
        </Field>

        <Field label="Reference" required>
          <input
            name="reference"
            className="input"
            placeholder="Receipt, POS or transfer reference"
            required
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <CreditCard size={16} />Commit payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
