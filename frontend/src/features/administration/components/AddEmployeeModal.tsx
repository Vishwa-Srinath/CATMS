import { useState, type FormEvent } from 'react';
import { Stethoscope, UserPlus } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import type { BranchDto, SpecialtyDto, RegisterEmployeeInput } from '../../../api/staff.api';

interface AddEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  branches: BranchDto[];
  specialties: SpecialtyDto[];
  onSubmit: (data: RegisterEmployeeInput, doctorData?: { license: string; fee?: number; specialtyIds: number[] }) => Promise<void>;
}

export function AddEmployeeModal({
  open,
  onClose,
  branches,
  specialties,
  onSubmit,
}: AddEmployeeModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [position, setPosition] = useState('Doctor');
  const [selectedSpecialties, setSelectedSpecialties] = useState<number[]>([]);
  const [createAccount, setCreateAccount] = useState(true);

  const toggleSpecialty = (id: number) => {
    setSelectedSpecialties((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);

    const branchId = Number(form.get('branchId'));
    if (!branchId) {
      setError(new Error('Please select a home branch.'));
      setIsSubmitting(false);
      return;
    }

    const employeeNumber = String(form.get('employeeNumber') || `EMP-${Date.now().toString().slice(-4)}`).trim();
    const nic = String(form.get('nic')).trim();
    const fullName = String(form.get('fullName')).trim();
    const genderCode = String(form.get('genderCode') || 'Other');
    const dateOfBirth = String(form.get('dateOfBirth'));
    const phone = String(form.get('phone')).trim();
    const email = String(form.get('email') || '').trim() || null;
    const hireDate = String(form.get('hireDate') || new Date().toISOString().split('T')[0]);

    const username = createAccount ? String(form.get('username') || '').trim() || null : null;
    const password = createAccount ? String(form.get('password') || '').trim() || null : null;
    const roleCode = createAccount ? String(form.get('roleCode') || position) : null;

    const isDoctor = position.toLowerCase() === 'doctor';
    const license = String(form.get('license') || '').trim();
    const fee = form.get('fee') ? Number(form.get('fee')) : undefined;

    if (isDoctor && !license) {
      setError(new Error('Medical license number is required for doctors.'));
      setIsSubmitting(false);
      return;
    }

    try {
      const employeePayload: RegisterEmployeeInput = {
        employeeNumber,
        nic,
        fullName,
        genderCode,
        dateOfBirth,
        positionCode: position,
        phone,
        branchId,
        email,
        hireDate,
        assignmentType: 'PRIMARY',
        username,
        password,
        roleCode,
      };

      await onSubmit(
        employeePayload,
        isDoctor
          ? {
              license,
              fee,
              specialtyIds: selectedSpecialties.length > 0 ? selectedSpecialties : [specialties[0]?.specialtyId || 1],
            }
          : undefined,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Staff registration failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an employee"
      description="Register an active clinic employee, attach their primary branch assignment, and optionally issue user credentials."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required>
            <input name="fullName" className="input" placeholder="e.g. Dr. Priyantha Jayasuriya" required />
          </Field>
          <Field label="NIC number" hint="Unique National Identity Card or Passport" required>
            <input name="nic" className="input uppercase" placeholder="198512345678 or 851234567V" required />
          </Field>
          <Field label="Employee number" hint="Leave blank to auto-generate">
            <input name="employeeNumber" className="input" placeholder="EMP-0042" />
          </Field>
          <Field label="Position / Primary role" required>
            <select
              name="position"
              className="input"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              required
            >
              <option value="Doctor">Doctor</option>
              <option value="Manager">Manager</option>
              <option value="Receptionist">Receptionist</option>
              <option value="Nurse">Nurse</option>
              <option value="Admin">Admin</option>
              <option value="Other">Other staff</option>
            </select>
          </Field>
          <Field label="Home branch" hint="Employee assigned exclusively to one primary branch" required>
            <select name="branchId" className="input" required defaultValue={branches[0]?.branchId || ''}>
              {branches.map((b) => (
                <option key={b.branchId} value={b.branchId}>
                  {b.name} ({b.city})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Gender" required>
            <select name="genderCode" className="input" defaultValue="Female" required>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <Field label="Date of birth" required>
            <input name="dateOfBirth" type="date" className="input" defaultValue="1990-01-01" required />
          </Field>
          <Field label="Hire date" required>
            <input
              name="hireDate"
              type="date"
              className="input"
              defaultValue={new Date().toISOString().split('T')[0]}
              required
            />
          </Field>
          <Field label="Phone number" hint="Direct mobile or contact phone" required>
            <input name="phone" type="tel" className="input" placeholder="+94 77 123 4567" required />
          </Field>
          <Field label="Work email">
            <input name="email" type="email" className="input" placeholder="p.jayasuriya@medsync.lk" />
          </Field>
        </div>

        {/* Doctor specific fields */}
        {position === 'Doctor' && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-center gap-2 text-blue-900">
              <Stethoscope size={18} />
              <h3 className="text-sm font-bold">Doctor medical profile & specialties</h3>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Medical licence number (SLMC)" hint="Must be unique across clinic network" required>
                <input name="license" className="input bg-white" placeholder="SLMC-34567" required />
              </Field>
              <Field label="Standard consultation fee (LKR)">
                <input name="fee" type="number" min="0" step="100" defaultValue="3500" className="input bg-white" />
              </Field>
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold text-slate-700">Specialty assignments:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {specialties.map((s) => {
                    const active = selectedSpecialties.includes(s.specialtyId);
                    return (
                      <button
                        key={s.specialtyId}
                        type="button"
                        onClick={() => toggleSpecialty(s.specialtyId)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                          active
                            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* User Account Provisioning */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={createAccount}
              onChange={(e) => setCreateAccount(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-clinic-600"
            />
            Create login user account for this employee
          </label>

          {createAccount && (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Username" required>
                <input
                  name="username"
                  className="input bg-white"
                  placeholder="p.jayasuriya"
                  minLength={3}
                  required={createAccount}
                />
              </Field>
              <Field label="Initial password" hint="Min 8 characters" required>
                <input
                  name="password"
                  type="password"
                  className="input bg-white"
                  defaultValue="SecurePass123!"
                  minLength={8}
                  required={createAccount}
                />
              </Field>
              <Field label="Application role" required>
                <select name="roleCode" className="input bg-white" defaultValue={position === 'Doctor' ? 'Clinician' : position}>
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Clinician">Clinician</option>
                  <option value="Reception">Reception</option>
                  <option value="QA">QA Auditor</option>
                </select>
              </Field>
            </div>
          )}
        </div>

        <InfoNote title="Transactional integrity">
          Employee registration executes atomically inside PostgreSQL: the employee master record, the primary home branch assignment, and optional user credentials are created in one transaction.
        </InfoNote>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <UserPlus size={16} />
            {isSubmitting ? 'Registering employee…' : 'Register employee'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
