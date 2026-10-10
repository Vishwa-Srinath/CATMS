/**
 * src/features/patients-insurance/components/RegisterPatientModal.tsx
 * Owner: Dev3 | Issues: CATMS-048, CATMS-059
 *
 * Modal for registering a new clinic-wide patient with identity verification
 * and primary emergency contact.
 */

import { useState, type FormEvent } from 'react';
import { UserPlus, Plus, ShieldCheck } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import { useRegisterPatient, useClinicBranches } from '../hooks/usePatientsInsurance';
import type { Gender, BloodGroup, IdentityType, PatientDto } from '../../../api/patients.api';
import { ApiError } from '../../../api/errors';

export interface RegisterPatientModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (patient: PatientDto) => void;
  defaultBranchId?: string | number;
}

export function RegisterPatientModal({
  open,
  onClose,
  onSuccess,
  defaultBranchId,
}: RegisterPatientModalProps) {
  const { registerPatient, isPending } = useRegisterPatient();
  const { branches } = useClinicBranches();
  const [error, setError] = useState<Error | null>(null);
  const [identityType, setIdentityType] = useState<IdentityType>('NIC');
  const [emergencyCount, setEmergencyCount] = useState(1);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);

    const rawBranch = String(form.get('registeredBranchId') || '');
    const registeredBranchId = rawBranch ? Number(rawBranch) : undefined;

    const rawBlood = String(form.get('bloodGroup') || '');
    const bloodGroup = (rawBlood && rawBlood !== 'Unknown' ? rawBlood : null) as BloodGroup | null;

    try {
      const result = await registerPatient({
        firstName: String(form.get('firstName') || '').trim(),
        lastName: String(form.get('lastName') || '').trim(),
        dateOfBirth: String(form.get('dateOfBirth') || '').trim(),
        gender: String(form.get('gender') || '') as Gender,
        contactNumber: String(form.get('contactNumber') || '').trim(),
        identityType: String(form.get('identityType') || 'NIC') as IdentityType,
        identityNumber: String(form.get('identityNumber') || '').trim(),
        contactName: String(form.get('contactName') || '').trim(),
        relationship: String(form.get('relationship') || '').trim(),
        emergencyPhone: String(form.get('emergencyPhone') || '').trim(),
        bloodGroup,
        email: String(form.get('email') || '').trim() || null,
        address: String(form.get('address') || '').trim() || null,
        registeredBranchId: !isNaN(registeredBranchId as number) ? registeredBranchId : undefined,
      });

      onSuccess(result);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
      } else if (caught instanceof Error) {
        setError(caught);
      } else {
        setError(new Error('Patient could not be registered.'));
      }
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Register a new patient"
      description="Create one clinic-wide identity. Required details are marked with an asterisk."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <RuleError error={error} />}

        <div>
          <h3 className="text-sm font-bold text-slate-900">Personal details</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="First name" required>
              <input
                name="firstName"
                className="input"
                placeholder="e.g. Kasun"
                required
                disabled={isPending}
              />
            </Field>

            <Field label="Last name" required>
              <input
                name="lastName"
                className="input"
                placeholder="e.g. Bandara"
                required
                disabled={isPending}
              />
            </Field>

            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <Field label="ID Type" required>
                <select
                  name="identityType"
                  className="input"
                  value={identityType}
                  onChange={(e) => setIdentityType(e.target.value as IdentityType)}
                  disabled={isPending}
                >
                  <option value="NIC">NIC</option>
                  <option value="Passport">Passport</option>
                </select>
              </Field>

              <Field
                label={identityType === 'NIC' ? 'NIC Number' : 'Passport Number'}
                hint="Checked for clinic-wide uniqueness"
                required
              >
                <input
                  name="identityNumber"
                  className="input"
                  placeholder={identityType === 'NIC' ? 'e.g. 199516600011 or 927541286V' : 'e.g. N1234567'}
                  required
                  disabled={isPending}
                />
              </Field>
            </div>

            <Field label="Date of birth" required>
              <input
                name="dateOfBirth"
                type="date"
                className="input"
                max={todayStr}
                required
                disabled={isPending}
              />
            </Field>

            <Field label="Gender" required>
              <select name="gender" className="input" required defaultValue="" disabled={isPending}>
                <option value="" disabled>Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </Field>

            <Field label="Blood group">
              <select name="bloodGroup" className="input" defaultValue="Unknown" disabled={isPending}>
                <option value="Unknown">Unknown</option>
                {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const).map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </Field>

            <Field
              label="Registration branch"
              hint="The record remains accessible at every branch"
              required
            >
              <select
                name="registeredBranchId"
                className="input"
                required
                defaultValue={defaultBranchId ? String(defaultBranchId).replace(/\D/g, '') : (branches[0]?.branchId ? String(branches[0].branchId) : '1')}
                disabled={isPending}
              >
                {branches.length > 0 ? (
                  branches.map((b) => (
                    <option key={b.branchId} value={b.branchId}>
                      {b.name} ({b.city})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="1">MedSync Colombo Main (Colombo)</option>
                    <option value="2">MedSync Kandy Central (Kandy)</option>
                    <option value="3">MedSync Galle Fort (Galle)</option>
                  </>
                )}
              </select>
            </Field>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-sm font-bold text-slate-900">Contact details</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Phone number" required>
              <input
                name="contactNumber"
                type="tel"
                className="input"
                placeholder="077 123 4567"
                required
                disabled={isPending}
              />
            </Field>

            <Field label="Email">
              <input
                name="email"
                type="email"
                className="input"
                placeholder="patient@example.lk"
                disabled={isPending}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Home address">
                <textarea
                  name="address"
                  className="input min-h-20 resize-y"
                  placeholder="Street, city"
                  disabled={isPending}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Primary Emergency Contact</h3>
              <p className="mt-1 text-xs text-slate-500">Required for patient safety and record integrity.</p>
            </div>
            {emergencyCount < 2 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEmergencyCount(2)}>
                <Plus size={14} />Add secondary contact info
              </Button>
            )}
          </div>

          <div className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
            <Field label="Contact name" required>
              <input
                name="contactName"
                className="input"
                placeholder="e.g. Nalini Bandara"
                required
                disabled={isPending}
              />
            </Field>

            <Field label="Relationship" required>
              <input
                name="relationship"
                className="input"
                placeholder="e.g. Spouse / Mother"
                required
                disabled={isPending}
              />
            </Field>

            <Field label="Emergency phone" required>
              <input
                name="emergencyPhone"
                type="tel"
                className="input"
                placeholder="071 999 8888"
                required
                disabled={isPending}
              />
            </Field>
          </div>
        </div>

        <InfoNote title="Clinic-wide Identity Verification">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-clinic-600" />
            Patient identity is unique clinic-wide across all branches. Duplicate NIC or Passport numbers will be rejected by the database.
          </span>
        </InfoNote>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            <UserPlus size={16} />
            {isPending ? 'Registering…' : 'Register patient'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
