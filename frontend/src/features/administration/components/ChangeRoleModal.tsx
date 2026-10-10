import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import type { AdminUserDto, BranchDto, UpdateUserRoleInput } from '../../../api/staff.api';

interface ChangeRoleModalProps {
  user: AdminUserDto | null;
  open: boolean;
  onClose: () => void;
  branches: BranchDto[];
  onSubmit: (userAccountId: number, data: UpdateUserRoleInput) => Promise<void>;
}

export function ChangeRoleModal({
  user,
  open,
  onClose,
  branches,
  onSubmit,
}: ChangeRoleModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState(user?.roles[0]?.roleCode || 'Reception');

  if (!user) return null;

  const currentRole = user.roles[0]?.roleCode || 'Unassigned';
  const isManagerRole = selectedRole.toLowerCase() === 'manager';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const roleCode = String(form.get('roleCode')).trim();
    const branchScopeId = form.get('branchScopeId') ? Number(form.get('branchScopeId')) : null;

    try {
      await onSubmit(user.userAccountId, {
        roleCode,
        branchScopeId: roleCode.toLowerCase() === 'admin' ? null : branchScopeId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Role change rejected.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Change application role · ${user.username}`}
      description={`Reassign security role and scope for ${user.fullName} (${user.employeeNumber}).`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Current active role: <strong className="text-slate-800">{currentRole}</strong>.
        </div>

        <Field label="New application role" required>
          <select
            name="roleCode"
            className="input"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            required
          >
            <option value="Admin">Admin (Full clinic-wide management)</option>
            <option value="Manager">Manager (Branch operations & R1/R4 reports)</option>
            <option value="Clinician">Clinician (Doctor consultations & notes)</option>
            <option value="Reception">Reception (Check-in & appointments)</option>
            <option value="QA">QA Auditor (Read-only verification)</option>
          </select>
        </Field>

        {selectedRole.toLowerCase() !== 'admin' && (
          <Field label="Branch authorization scope" hint={isManagerRole ? 'Managers must be scoped to exactly one branch' : 'Leave empty for default branch'}>
            <select name="branchScopeId" className="input" defaultValue={user.roles[0]?.branchScopeId || ''} required={isManagerRole}>
              <option value="">-- Clinic-wide or default --</option>
              {branches.map((b) => (
                <option key={b.branchId} value={b.branchId}>
                  {b.name} ({b.city})
                </option>
              ))}
            </select>
          </Field>
        )}

        <InfoNote title="Audit logged">
          Role assignments are versioned with effective timestamps (`valid_to = now()`) and logged into `catms.audit_event` for regulatory audit trails.
        </InfoNote>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <ShieldCheck size={16} />
            {isSubmitting ? 'Updating role…' : 'Save role mapping'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
