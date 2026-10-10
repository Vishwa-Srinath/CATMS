/**
 * src/features/appointments/components/RescheduleAppointmentModal.tsx
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Reschedule appointment modal. Submits new ISO timestamps and mandatory audit reason
 * to the backend reschedule procedure.
 */

import { useState, type FormEvent, useEffect } from 'react';
import { CalendarClock } from 'lucide-react';
import { Modal, Field, Button, RuleError } from '../../../components/ui';
import {
  TIME_SLOTS_30MIN,
  addMinutesToTime,
  formatTimeToIso,
  parseNumericId,
} from '../utils';
import type { RescheduleAppointmentInput } from '../../../api/appointments.api';
import type { Appointment } from '../../../types';

export interface RescheduleAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  onReschedule: (id: number, data: RescheduleAppointmentInput) => Promise<void>;
}

export function RescheduleAppointmentModal({
  open,
  onClose,
  appointment,
  onReschedule,
}: RescheduleAppointmentModalProps) {
  const [newDate, setNewDate] = useState('');
  const [startTime, setStartTime] = useState('11:00');
  const [endTime, setEndTime] = useState('11:30');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && appointment) {
      setNewDate(appointment.date);
      setStartTime(appointment.start || '11:00');
      setEndTime(appointment.end || '11:30');
      setReason('');
      setError(null);
    }
  }, [open, appointment]);

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    setEndTime(addMinutesToTime(newStart, 30));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!appointment) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const numId = parseNumericId(appointment.id);
      const newStartAt = formatTimeToIso(newDate, startTime);
      const newEndAt = formatTimeToIso(newDate, endTime);

      await onReschedule(numId, {
        newStartAt,
        newEndAt,
        reason: reason.trim(),
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
      title={`Reschedule ${appointment?.reference ?? 'appointment'}`}
      description="The new time slot is checked clinic-wide against doctor availability and collisions before committing."
      size="md"
    >
      {appointment && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <RuleError error={error} />}

          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <strong className="text-slate-800">Current slot:</strong> {appointment.date} ·{' '}
            {appointment.start}–{appointment.end}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New date" required>
              <input
                type="date"
                className="input"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min="2026-08-01"
                required
                aria-label="New date"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Start" required>
                <select
                  className="input"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  required
                  aria-label="New start time"
                >
                  {TIME_SLOTS_30MIN.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="End" required>
                <input
                  className="input bg-slate-50 text-slate-600"
                  value={endTime}
                  readOnly
                  aria-label="New end time"
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field
                label="Reason for rescheduling"
                hint="Audit record is permanently attached to appointment history"
                required
              >
                <textarea
                  className="input min-h-20"
                  placeholder="Record why this appointment is being moved"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  aria-label="Reason for rescheduling"
                />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Keep original
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <CalendarClock size={16} />
              {isSubmitting ? 'Verifying conflict…' : 'Check & reschedule'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
