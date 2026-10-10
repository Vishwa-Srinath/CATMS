/**
 * src/features/appointments/components/CancelAppointmentModal.tsx
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Cancellation modal requiring explicit reason. Retains audit trace without hard deletion.
 */

import { useState, type FormEvent, useEffect } from 'react';
import { XCircle } from 'lucide-react';
import { Modal, Field, Button, RuleError } from '../../../components/ui';
import { parseNumericId } from '../utils';
import type { Appointment } from '../../../types';

export interface CancelAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  onCancel: (id: number, reason: string) => Promise<void>;
}

export function CancelAppointmentModal({
  open,
  onClose,
  appointment,
  onCancel,
}: CancelAppointmentModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!appointment) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const numId = parseNumericId(appointment.id);
      await onCancel(numId, reason.trim());
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
      title={`Cancel ${appointment?.reference ?? 'appointment'}`}
      description="Cancellation updates appointment status. It is preserved in all audit logs and cannot be deleted."
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <RuleError error={error} />}

        <Field label="Cancellation reason" required>
          <textarea
            className="input min-h-24 resize-y"
            placeholder="Record reason why this visit is being cancelled"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            aria-label="Cancellation reason"
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Keep appointment
          </Button>
          <Button type="submit" variant="danger" disabled={isSubmitting}>
            <XCircle size={16} />
            {isSubmitting ? 'Cancelling…' : 'Cancel appointment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
