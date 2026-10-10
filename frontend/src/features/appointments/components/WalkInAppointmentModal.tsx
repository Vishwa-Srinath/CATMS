/**
 * src/features/appointments/components/WalkInAppointmentModal.tsx
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Dedicated walk-in modal for unbooked arrivals. Retains WalkIn source in database.
 */

import { useState, type FormEvent, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { Modal, Field, Button, RuleError, InfoNote } from '../../../components/ui';
import {
  TIME_SLOTS_30MIN,
  addMinutesToTime,
  formatTimeToIso,
  parseNumericId,
} from '../utils';
import type { WalkInAppointmentInput } from '../../../api/appointments.api';

export interface WalkInAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onWalkIn: (data: WalkInAppointmentInput) => Promise<void>;
  defaultBranchId?: string;
  defaultDoctorId?: string;
  defaultDate?: string;
  defaultStart?: string;
  branches: Array<{ id: string | number; name: string }>;
  doctors: Array<{ id: string | number; name: string; branchId?: string | number; specialties?: string[] }>;
  patients: Array<{ id: string | number; name: string; patientNo: string; nic?: string }>;
}

export function WalkInAppointmentModal({
  open,
  onClose,
  onWalkIn,
  defaultBranchId,
  defaultDoctorId,
  defaultDate,
  defaultStart = '10:00',
  branches,
  doctors,
  patients,
}: WalkInAppointmentModalProps) {
  const [selectedBranch, setSelectedBranch] = useState(defaultBranchId ?? '1');
  const [selectedDoctor, setSelectedDoctor] = useState(defaultDoctorId ?? '1');
  const [selectedDate, setSelectedDate] = useState(defaultDate ?? '2026-08-09');
  const [startTime, setStartTime] = useState(defaultStart);
  const [endTime, setEndTime] = useState(addMinutesToTime(defaultStart, 30));
  const [patientId, setPatientId] = useState('');
  const [reason, setReason] = useState('Walk-in consultation');
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

      await onWalkIn({
        patientId: numPatient,
        doctorId: numDoctor,
        branchId: numBranch,
        specialtyId: numSpecialty,
        startAt,
        endAt,
        notes: reason.trim() || 'Walk-in consultation',
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
      title="Create walk-in appointment"
      description="For a patient who has arrived without a prior booking. The same overlap rule still applies."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <RuleError error={error} />}

        <InfoNote title="Walk-in source is retained">
          This visit will be tagged as Walk-in in the schedule, audit trail, and management reports.
        </InfoNote>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Arrived patient" hint="Search from registered patients" required>
              <select
                className="input"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                required
                aria-label="Select patient"
              >
                <option value="" disabled>
                  Select patient
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

          <Field label="Attending doctor" required>
            <select
              className="input"
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              required
              aria-label="Attending doctor"
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

          <Field label="Date" required>
            <input
              type="date"
              className="input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              required
              aria-label="Date"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start slot" required>
              <select
                className="input"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                required
                aria-label="Start slot"
              >
                {TIME_SLOTS_30MIN.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="End slot" required>
              <input
                className="input bg-slate-50 text-slate-600"
                value={endTime}
                readOnly
                aria-label="End slot"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Reason / Symptoms" required>
              <textarea
                className="input min-h-20 resize-y"
                placeholder="Chief complaint or consultation reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                aria-label="Reason or symptoms"
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            <Zap size={16} />
            {isSubmitting ? 'Checking slot…' : 'Add walk-in'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
