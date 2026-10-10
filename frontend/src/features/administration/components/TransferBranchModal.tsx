import { useState, type FormEvent } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import type { BranchDto, EmployeeDto, AssignEmployeeBranchInput } from '../../../api/staff.api';

interface TransferBranchModalProps {
  employee: EmployeeDto | null;
  open: boolean;
  onClose: () => void;
  branches: BranchDto[];
  onSubmit: (employeeId: number, data: AssignEmployeeBranchInput) => Promise<void>;
}

export function TransferBranchModal({
  employee,
  open,
  onClose,
  branches,
  onSubmit,
}: TransferBranchModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!employee) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const branchId = Number(form.get('branchId'));
    const assignmentType = (form.get('assignmentType') as 'PRIMARY' | 'SECONDARY') || 'PRIMARY';

    if (!branchId) {
      setError(new Error('Please select a target branch.'));
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit(employee.employeeId, {
        branchId,
        assignmentType,
        effectiveDate: new Date().toISOString().split('T')[0],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Branch transfer failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Transfer branch · ${employee.fullName}`}
      description={`Reassign home branch for ${employee.employeeNumber} (${employee.positionCode}).`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Current branch assignment: <strong className="text-slate-800">{employee.branchName || 'Unassigned'}</strong>.
        </div>

        <Field label="Target branch" required>
          <select name="branchId" className="input" required defaultValue="">
            <option value="">-- Choose destination branch --</option>
            {branches
              .filter((b) => b.isActive && b.branchId !== employee.branchId)
              .map((b) => (
                <option key={b.branchId} value={b.branchId}>
                  {b.name} ({b.city})
                </option>
              ))}
          </select>
        </Field>

        <Field label="Assignment type" required>
          <select name="assignmentType" className="input" defaultValue="PRIMARY">
            <option value="PRIMARY">PRIMARY (Main home branch)</option>
            <option value="SECONDARY">SECONDARY (Cross-facility coverage)</option>
          </select>
        </Field>

        <InfoNote title="Assignment invariant">
          Assigning a new PRIMARY branch closes the employee's existing primary assignment atomically in PostgreSQL (`valid_to = now()`), ensuring each staff member has exactly one active home branch.
        </InfoNote>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <ArrowRightLeft size={16} />
            {isSubmitting ? 'Transferring…' : 'Confirm transfer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
