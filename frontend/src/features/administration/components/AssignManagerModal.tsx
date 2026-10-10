import { useState, type FormEvent } from 'react';
import { UserCog } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import type { BranchDto, EmployeeDto, AssignBranchManagerInput } from '../../../api/staff.api';

interface AssignManagerModalProps {
  branch: BranchDto | null;
  open: boolean;
  onClose: () => void;
  eligibleManagers: EmployeeDto[];
  onSubmit: (branchId: number, data: AssignBranchManagerInput) => Promise<void>;
}

export function AssignManagerModal({
  branch,
  open,
  onClose,
  eligibleManagers,
  onSubmit,
}: AssignManagerModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!branch) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const employeeId = Number(form.get('employeeId'));

    if (!employeeId) {
      setError(new Error('Please select an active manager.'));
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit(branch.branchId, {
        employeeId,
        reason: String(form.get('reason') || 'Branch manager appointment').trim(),
        effectiveDate: new Date().toISOString().split('T')[0],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Manager assignment rejected.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign Manager · ${branch.name}`}
      description="Appoint an active employee holding the Manager position to head this clinic location."
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        {branch.manager && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Current branch manager: <strong className="text-slate-800">{branch.manager.fullName}</strong>.
            Assigning a new manager will close the current active appointment atomically.
          </div>
        )}

        <Field label="Select manager" hint="Must be an active employee with the Manager role" required>
          <select name="employeeId" className="input" required defaultValue={branch.manager?.employeeId || ''}>
            <option value="">-- Choose active manager --</option>
            {eligibleManagers
              .filter((e) => e.isActive)
              .map((m) => (
                <option key={m.employeeId} value={m.employeeId}>
                  {m.fullName} ({m.employeeNumber}) · {m.branchName || 'Unassigned'}
                </option>
              ))}
          </select>
        </Field>

        <Field label="Appointment reason">
          <input
            name="reason"
            className="input"
            defaultValue="Branch manager appointment"
            placeholder="Reason for appointment"
          />
        </Field>

        <InfoNote title="Manager invariant">
          A clinic location can have at most one active branch manager. Any previous active manager assignment will be concluded as of today.
        </InfoNote>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || eligibleManagers.length === 0}>
            <UserCog size={16} />
            {isSubmitting ? 'Assigning…' : 'Confirm appointment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
