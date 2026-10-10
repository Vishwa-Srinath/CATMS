import { useState, type FormEvent } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Field, Modal, RuleError } from '../../../components/ui';
import type { BranchDto, UpdateBranchInput } from '../../../api/staff.api';

interface EditBranchModalProps {
  branch: BranchDto | null;
  open: boolean;
  onClose: () => void;
  onSubmit: (id: number, data: UpdateBranchInput) => Promise<void>;
}

export function EditBranchModal({ branch, open, onClose, onSubmit }: EditBranchModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!branch) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      await onSubmit(branch.branchId, {
        name: String(form.get('name')).trim(),
        city: String(form.get('city')).trim(),
        addressLine1: String(form.get('addressLine1')).trim(),
        addressLine2: String(form.get('addressLine2') || '').trim() || null,
        district: String(form.get('district') || '').trim() || null,
        postalCode: String(form.get('postalCode') || '').trim() || null,
        contactPhone: String(form.get('contactPhone')).trim(),
        isActive: form.get('isActive') === 'true',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Branch update failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${branch.name}`}
      description={`Update operating details for branch ${branch.branchCode}.`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch name" required>
            <input name="name" className="input" defaultValue={branch.name} required />
          </Field>
          <Field label="City" required>
            <input name="city" className="input" defaultValue={branch.city} required />
          </Field>
          <Field label="Address line 1" required>
            <input
              name="addressLine1"
              className="input"
              defaultValue={branch.addressLine1}
              required
            />
          </Field>
          <Field label="Address line 2">
            <input
              name="addressLine2"
              className="input"
              defaultValue={branch.addressLine2 || ''}
            />
          </Field>
          <Field label="District">
            <input
              name="district"
              className="input"
              defaultValue={branch.district || ''}
            />
          </Field>
          <Field label="Postal code">
            <input
              name="postalCode"
              className="input"
              defaultValue={branch.postalCode || ''}
            />
          </Field>
          <Field label="Contact phone" required>
            <input
              name="contactPhone"
              type="tel"
              className="input"
              defaultValue={branch.contactPhone}
              required
            />
          </Field>
          <Field label="Operational status">
            <select name="isActive" className="input" defaultValue={branch.isActive ? 'true' : 'false'}>
              <option value="true">Active (Open for appointments)</option>
              <option value="false">Inactive (Temporarily suspended)</option>
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Building2 size={16} />
            {isSubmitting ? 'Saving changes…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
