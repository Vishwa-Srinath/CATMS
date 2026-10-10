import { useState, type FormEvent } from 'react';
import { Stethoscope } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import type { EmployeeDto, SpecialtyDto, RegisterDoctorInput } from '../../../api/staff.api';

interface DoctorProfileModalProps {
  employee: EmployeeDto | null;
  open: boolean;
  onClose: () => void;
  specialties: SpecialtyDto[];
  onSubmit: (data: RegisterDoctorInput) => Promise<void>;
}

export function DoctorProfileModal({
  employee,
  open,
  onClose,
  specialties,
  onSubmit,
}: DoctorProfileModalProps) {
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSpecialties, setSelectedSpecialties] = useState<number[]>([1]);

  if (!employee) return null;

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
    const medicalLicenseNo = String(form.get('license')).trim();
    const defaultConsultationFee = form.get('fee') ? Number(form.get('fee')) : null;

    if (!medicalLicenseNo) {
      setError(new Error('Medical license number is required.'));
      setIsSubmitting(false);
      return;
    }

    if (selectedSpecialties.length === 0) {
      setError(new Error('At least one medical specialty must be selected.'));
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit({
        employeeId: employee.employeeId,
        medicalLicenseNo,
        practiceStartDate: new Date().toISOString().split('T')[0],
        defaultConsultationFee,
        specialtyIds: selectedSpecialties,
        primarySpecialtyId: selectedSpecialties[0],
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Doctor profile registration failed.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Doctor profile · ${employee.fullName}`}
      description={`Manage medical credentials and specialty assignments for ${employee.employeeNumber}.`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <RuleError error={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Medical licence number" hint="Unique SLMC registration number" required>
            <input name="license" className="input uppercase" placeholder="SLMC-49210" required />
          </Field>
          <Field label="Default consultation fee (LKR)">
            <input name="fee" type="number" min="0" step="100" defaultValue="3500" className="input" />
          </Field>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700">Specialty assignments</label>
          <p className="mt-1 text-xs text-slate-500">
            A doctor may practice under multiple specialties, but the same specialty cannot be assigned twice.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
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

        <InfoNote title="Procedure enforcement">
          Invokes `catms.register_doctor_profile()` in PostgreSQL. Verifies the employee position is Doctor and records specialties atomically.
        </InfoNote>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Stethoscope size={16} />
            {isSubmitting ? 'Saving…' : 'Save doctor credentials'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
