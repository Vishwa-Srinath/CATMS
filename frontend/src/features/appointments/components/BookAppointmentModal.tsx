/**
 * src/features/appointments/components/BookAppointmentModal.tsx
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Booking modal with patient selection, doctor schedule checking,
 * 15-minute grid validation, and database-authoritative conflict handling.
 */

import { useState, type FormEvent, useEffect } from 'react';
import { CalendarCheck2 } from 'lucide-react';
import { Modal, Field, Button, RuleError } from '../../../components/ui';
import {
  TIME_SLOTS_30MIN,
  addMinutesToTime,
  formatTimeToIso,
  parseNumericId,
} from '../utils';
import type { BookAppointmentInput } from '../../../api/appointments.api';

export interface BookAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onBook: (data: BookAppointmentInput) => Promise<void>;
  defaultBranchId?: string;
  defaultDoctorId?: string;
  defaultDate?: string;
  defaultStart?: string;
  branches: Array<{ id: string | number; name: string }>;
  doctors: Array<{ id: string | number; name: string; branchId?: string | number; specialties?: string[] }>;
  patients: Array<{ id: string | number; name: string; patientNo: string; nic?: string }>;
}

export function BookAppointmentModal({
  open,
  onClose,
  onBook,
  defaultBranchId,
  defaultDoctorId,
  defaultDate,
  defaultStart = '10:00',
  branches,
  doctors,
  patients,
}: BookAppointmentModalProps) {
  const [selectedBranch, setSelectedBranch] = useState(defaultBranchId ?? '1');
  const [selectedDoctor, setSelectedDoctor] = useState(defaultDoctorId ?? '1');
  const [selectedDate, setSelectedDate] = useState(defaultDate ?? '2026-08-09');
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(addMinutesToTime(defaultStart, 30));
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (defaultBranchId) setSelectedBranch(defaultBranchId);
      if (defaultDoctorId) setSelectedDoctor(defaultDoctorId);
      if (defaultDate) setSelectedDate(defaultDate);
      if (defaultStart) {
        setStartTime(defaultStart);
        setEndTime(addMinutesToTime(defaultStart, 30));
      }
      setError(null);
    }
  }, [open, defaultBranchId, defaultDoctorId, defaultDate, defaultStart]);

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    setEndTime(addMinutesToTime(newStart, 30));
  };

  const branchDoctors = doctors.filter(
    (doc) => !doc.branchId || String(doc.branchId) === String(selectedBranch) || String(doc.id) === String(selectedDoctor),
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const numPatient = parseNumericId(patientId);
      const numDoctor = parseNumericId(selectedDoctor);
      const numBranch = parseNumericId(selectedBranch);
      const numSpecialty = 1; // General / default specialty ID

      const startAt = formatTimeToIso(selectedDate, startTime);
      const endAt = formatTimeToIso(selectedDate, endTime);

      await onBook({
        patientId: numPatient,
        doctorId: numDoctor,
        branchId: numBranch,
        specialtyId: numSpecialty,
        startAt,
        endAt,
        bookingType: 'Booked',
        notes: reason.trim() || undefined,
      });

      onClose();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book an appointment"
      description="Select patient, doctor, and date. Time slots are verified clinic-wide by the PostgreSQL database."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <RuleError error={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Patient" hint="Clinic-wide patient registry" required>
              <select
                className="input"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                aria-label="Select patient"
              >
                <option value="" disabled>
                  Select a patient
                </option>
                {patients.map((p) => (
                  <option value={String(p.id)} key={String(p.id)}>
                    {p.name} · {p.patientNo} {p.nic ? `· ${p.nic}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Branch location" required>
            <select
              className="input"
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                const first = doctors.find((d) => String(d.branchId) === e.target.value);
                if (first) setSelectedDoctor(String(first.id));
              }}
              required
              aria-label="Branch location"
            >
              {branches.map((b) => (
                <option value={String(b.id)} key={String(b.id)}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Doctor" required>
            <select
              className="input"
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              required
              aria-label="Select doctor"
            >
              {branchDoctors.length > 0 ? (
                branchDoctors.map((d) => (
                  <option value={String(d.id)} key={String(d.id)}>
                    {d.name} {d.specialties?.[0] ? `· ${d.specialties[0]}` : ''}
                  </option>
                ))
              ) : (
                doctors.map((d) => (
                  <option value={String(d.id)} key={String(d.id)}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Appointment date" required>
            <input
              type="date"
              className="input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min="2026-08-01"
              required
              aria-label="Appointment date"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" required>
              <select
                className="input"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                required
                aria-label="Start time"
              >
                {TIME_SLOTS_30MIN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="End time" required>
              <input
                className="input bg-slate-50 text-slate-600"
                value={endTime}
                readOnly
                aria-label="End time"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Reason for visit" required>
              <textarea
                className="input min-h-20 resize-y"
                placeholder="Reason visible to the care team"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                aria-label="Reason for visit"
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <CalendarCheck2 size={16} />
            {isSubmitting ? 'Verifying slot…' : 'Confirm booking'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
