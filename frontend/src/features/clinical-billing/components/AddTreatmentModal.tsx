/**
 * src/features/clinical-billing/components/AddTreatmentModal.tsx
 * Owner: Dev4 | Issue: CATMS-057
 *
 * Add treatment service modal form component.
 */

import type { FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button, Field, Modal, RuleError } from '../../../components/ui';

export interface AddTreatmentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: Error | null;
}

export function AddTreatmentModal({
  open,
  onClose,
  onSubmit,
  error,
}: AddTreatmentModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add catalogue service"
      description="New services and prices apply clinic-wide."
      size="sm"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <Field label="Service name" required>
          <input name="name" className="input" required />
        </Field>

        <Field label="Service code" hint="Must be unique" required>
          <input name="code" className="input uppercase" placeholder="e.g. LAB-LFT" required />
        </Field>

        <Field label="Category" required>
          <input name="category" className="input" placeholder="e.g. Laboratory" required />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (LKR)" required>
            <input name="price" className="input" type="number" min="0" step="0.01" required />
          </Field>
          <Field label="Duration" required>
            <select name="duration" className="input">
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <Plus size={16} />Add service
          </Button>
        </div>
      </form>
    </Modal>
  );
}
