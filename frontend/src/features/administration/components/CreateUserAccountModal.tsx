import { useState, type FormEvent } from 'react';
import { UserCheck } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import type { EmployeeDto, BranchDto, CreateAdminUserInput } from '../../../api/staff.api';

interface CreateUserAccountModalProps {
  open: boolean;
  onClose: () => void;
  employees: EmployeeDto[];
  branches: BranchDto[];
  onSubmit: (data: CreateAdminUserInput) => Promise<void>;
}

export function CreateUserAccountModal({
  open,
  onClose,
  employees,
  branches,
  onSubmit,
}: CreateUserAccountModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>('');
  const [roleCode, setRoleCode] = useState('Reception');

  const selectedEmployee = employees.find((e) => e.employeeId === selectedEmpId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const employeeId = Number(form.get('employeeId'));
    const username = String(form.get('username')).trim();
    const password = String(form.get('password')).trim();
    const branchScopeId = form.get('branchScopeId') ? Number(form.get('branchScopeId')) : null;

    if (!employeeId || !username || !password) {
      setError(new Error('All fields are required.'));
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit({
        employeeId,
        username,
        password,
        roleCode,
        branchScopeId,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Account creation failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create user account"
      description="Issue system credentials and attach a canonical application security role to an active employee."
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <Field label="Select employee" hint="Active employees who need system access" required>
          <select
            name="employeeId"
            className="input"
            value={selectedEmpId}
            onChange={(e) => {
              const id = Number(e.target.value);
              setSelectedEmpId(id);
              const emp = employees.find((x) => x.employeeId === id);
              if (emp) {
                const pos = emp.positionCode.toLowerCase();
                if (pos.includes('doctor')) setRoleCode('Clinician');
                else if (pos.includes('manager')) setRoleCode('Manager');
                else if (pos.includes('admin')) setRoleCode('Admin');
                else setRoleCode('Reception');
              }
            }}
            required
          >
            <option value="">-- Choose employee --</option>
            {employees
              .filter((e) => e.isActive)
              .map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.fullName} ({e.employeeNumber}) · {e.positionCode} · {e.branchName || 'Unassigned'}
                </option>
              ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" hint="Unique login handle (min 3 chars)" required>
            <input
              name="username"
              className="input"
              placeholder="e.g. j.perera"
              minLength={3}
              defaultValue={
                selectedEmployee
                  ? selectedEmployee.fullName.toLowerCase().replace('dr. ', '').split(' ').join('.')
                  : ''
              }
              required
            />
          </Field>
          <Field label="Temporary password" hint="Min 8 characters (hashed with bcrypt)" required>
            <input
              name="password"
              type="password"
              className="input"
              defaultValue="TemporaryPassword123!"
              minLength={8}
              required
            />
          </Field>
          <Field label="Application role" required>
            <select
              name="roleCode"
              className="input"
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value)}
              required
            >
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="Clinician">Clinician</option>
              <option value="Reception">Reception</option>
              <option value="QA">QA Auditor</option>
            </select>
          </Field>
          <Field label="Branch scope" hint="Restricts operations to this branch">
            <select name="branchScopeId" className="input" defaultValue={selectedEmployee?.branchId || ''}>
              <option value="">-- Clinic-wide or default --</option>
              {branches.map((b) => (
                <option key={b.branchId} value={b.branchId}>
                  {b.name} ({b.city})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <InfoNote title="Password policy & security">
          Passwords are salted and hashed with bcrypt (cost factor 10) inside PostgreSQL transactions. Plaintext passwords never appear in database tables or logs.
        </InfoNote>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <UserCheck size={16} />
            {isSubmitting ? 'Creating…' : 'Create user account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
