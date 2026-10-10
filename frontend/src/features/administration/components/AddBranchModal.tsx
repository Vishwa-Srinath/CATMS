import { useState, type FormEvent } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import type { CreateBranchInput } from '../../../api/staff.api';

interface AddBranchModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateBranchInput) => Promise<void>;
}

export function AddBranchModal({ open, onClose, onSubmit }: AddBranchModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      await onSubmit({
        branchCode: String(form.get('branchCode')).trim().toUpperCase(),
        name: String(form.get('name')).trim(),
        city: String(form.get('city')).trim(),
        addressLine1: String(form.get('addressLine1')).trim(),
        addressLine2: String(form.get('addressLine2') || '').trim() || null,
        district: String(form.get('district') || '').trim() || null,
        postalCode: String(form.get('postalCode') || '').trim() || null,
        contactPhone: String(form.get('contactPhone')).trim(),
        timeZone: 'Asia/Colombo',
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Branch creation failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create clinic branch"
      description="The new location will be registered in PostgreSQL and become selectable across appointments, patients, and staff."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Branch code" hint="2–10 uppercase letters (e.g. CMB, KND, NEG)" required>
            <input
              name="branchCode"
              className="input uppercase font-mono"
              placeholder="NEG"
              maxLength={10}
              required
            />
          </Field>
          <Field label="Branch name" required>
            <input name="name" className="input" placeholder="Negombo Coast Clinic" required />
          </Field>
          <Field label="City" required>
            <input name="city" className="input" placeholder="Negombo" required />
          </Field>
          <Field label="District">
            <input name="district" className="input" placeholder="Gampaha" />
          </Field>
          <Field label="Address line 1" required>
            <input name="addressLine1" className="input" placeholder="12 Beach Road" required />
          </Field>
          <Field label="Address line 2">
            <input name="addressLine2" className="input" placeholder="Suite 401" />
          </Field>
          <Field label="Postal code">
            <input name="postalCode" className="input" placeholder="11500" />
          </Field>
          <Field label="Contact phone" hint="Must be at least 7 digits" required>
            <input name="contactPhone" type="tel" className="input" placeholder="+94 31 223 4567" required />
          </Field>
        </div>

        <InfoNote title="Clinic-wide synchronization">
          Branches are persistent physical clinic facilities. Once created, historical appointments and staff assignments remain permanently linked to this branch.
        </InfoNote>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Building2 size={16} />
            {isSubmitting ? 'Creating branch…' : 'Create branch'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
