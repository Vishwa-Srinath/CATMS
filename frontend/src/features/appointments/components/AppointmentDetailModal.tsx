/**
 * src/features/appointments/components/AppointmentDetailModal.tsx
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Detailed appointment modal featuring full audit trail display:
 * schedule modification history and status transition logs directly from the backend.
 */

import { useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  History,
  MapPin,
  UserRound,
  UserRoundCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  InfoNote,
  Modal,
  RuleError,
} from '../../../components/ui';
import { useAppointmentDetail } from '../hooks/useAppointments';
import { formatAuditDateTime, parseNumericId } from '../utils';
import type { Appointment } from '../../../types';

export interface AppointmentDetailModalProps {
  open: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  patientName?: string;
  patientNumber?: string;
  patientContact?: string;
  doctorName?: string;
  doctorSpecialty?: string;
  branchName?: string;
  canManage: boolean;
  canComplete: boolean;
  userRole?: string;
  onOpenReschedule: () => void;
  onOpenCancel: () => void;
  onComplete: () => Promise<void>;
}

export function AppointmentDetailModal({
  open,
  onClose,
  appointment,
  patientName = 'Patient',
  patientNumber,
  patientContact,
  doctorName = 'Doctor',
  doctorSpecialty,
  branchName = 'Clinic Branch',
  canManage,
  canComplete,
  userRole,
  onOpenReschedule,
  onOpenCancel,
  onComplete,
}: AppointmentDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'audit'>('info');
  const [actionError, setActionError] = useState<Error | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const appointmentId = appointment ? parseNumericId(appointment.id) : null;
  const detailQuery = useAppointmentDetail(appointmentId, { enabled: open });

  const detail = detailQuery.data;

  const handleMarkComplete = async () => {
    setActionError(null);
    setIsCompleting(true);
    try {
      await onComplete();
      onClose();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsCompleting(false);
    }
  };

  const scheduleHistory = detail?.scheduleHistory ?? [];
  const statusLogs = detail?.statusLogs ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={appointment?.reference ?? 'Appointment Details'}
      description={
        appointment
          ? `${appointment.date} · ${appointment.start}–${appointment.end}`
          : undefined
      }
      size="lg"
    >
      {appointment && (
        <div className="space-y-5">
          {actionError && <RuleError error={actionError} />}

          {/* Header Summary */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <Avatar name={patientName} size="lg" />
              <div>
                <p className="text-base font-bold text-slate-800">{patientName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {patientNumber ? `${patientNumber} ` : ''}
                  {patientContact ? `· ${patientContact}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge>{appointment.status}</Badge>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                {appointment.source === 'Walk-in' ? <Zap size={12} className="text-amber-500" /> : null}
                {appointment.source}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 text-sm font-semibold text-slate-600">
            <button
              type="button"
              className={`border-b-2 px-4 py-2.5 transition ${
                activeTab === 'info'
                  ? 'border-clinic-600 text-clinic-700'
                  : 'border-transparent hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('info')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 transition ${
                activeTab === 'audit'
                  ? 'border-clinic-600 text-clinic-700'
                  : 'border-transparent hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('audit')}
            >
              <History size={15} />
              Audit Trail ({scheduleHistory.length + statusLogs.length})
            </button>
          </div>

          {/* Tab 1: Overview Info */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="flex gap-3">
                  <UserRoundCheck size={18} className="mt-0.5 text-clinic-600" />
                  <div>
                    <dt className="label-caps">Attending Doctor</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-700">
                      {doctorName}
                      {doctorSpecialty && (
                        <span className="block text-xs font-normal text-slate-400">
                          {doctorSpecialty}
                        </span>
                      )}
                    </dd>
                  </div>
                </div>

                <div className="flex gap-3">
                  <MapPin size={18} className="mt-0.5 text-clinic-600" />
                  <div>
                    <dt className="label-caps">Branch Location</dt>
                    <dd className="mt-1 text-sm font-semibold text-slate-700">{branchName}</dd>
                  </div>
                </div>

                <div className="flex gap-3 sm:col-span-2">
                  <UserRound size={18} className="mt-0.5 text-clinic-600" />
                  <div>
                    <dt className="label-caps">Reason for visit</dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-700">
                      {appointment.reason || 'General consultation'}
                    </dd>
                  </div>
                </div>
              </dl>

              {appointment.cancellationReason && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <strong className="text-red-900">Cancellation reason:</strong>{' '}
                  {appointment.cancellationReason}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Audit Trail Display */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Immutable Scheduling Audit History
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Every reschedule event and status transition is recorded with timestamp and reason.
                </p>
              </div>

              {detailQuery.isLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Loading audit logs from database…
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Status Transition History */}
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      Status Transitions ({statusLogs.length})
                    </h4>
                    {statusLogs.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                        Initial Scheduled status (no further transitions recorded).
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {statusLogs.map((log) => (
                          <div
                            key={log.logId}
                            className="flex items-start justify-between rounded-lg border border-slate-200 bg-white p-3 text-xs"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">
                                  {log.oldStatus} &rarr; {log.newStatus}
                                </span>
                              </div>
                              {log.reason && (
                                <p className="mt-1 text-slate-600">
                                  <strong>Reason:</strong> {log.reason}
                                </p>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {formatAuditDateTime(log.changedAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reschedule Modifications History */}
                  <div>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                      Reschedule Records ({scheduleHistory.length})
                    </h4>
                    {scheduleHistory.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                        Appointment has remained in its originally booked time slot.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {scheduleHistory.map((hist) => (
                          <div
                            key={hist.historyId}
                            className="rounded-lg border border-slate-200 bg-white p-3 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-clinic-700">
                                Slot Moved
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {formatAuditDateTime(hist.changedAt)}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-slate-600">
                              <span className="line-through text-slate-400">
                                {hist.oldStartAt.slice(11, 16)}–{hist.oldEndAt.slice(11, 16)}
                              </span>
                              <span>&rarr;</span>
                              <span className="font-medium text-slate-800">
                                {hist.newStartAt.slice(11, 16)}–{hist.newEndAt.slice(11, 16)}
                              </span>
                            </div>
                            {hist.reason && (
                              <p className="mt-1 text-slate-600">
                                <strong>Reason:</strong> {hist.reason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="border-t border-slate-100 pt-4">
            {appointment.status === 'Scheduled' ? (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Available Operations
                </p>
                <div className="flex flex-wrap gap-2">
                  {canManage && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          onClose();
                          onOpenReschedule();
                        }}
                      >
                        <CalendarClock size={16} />
                        Reschedule
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => {
                          onClose();
                          onOpenCancel();
                        }}
                      >
                        <XCircle size={16} />
                        Cancel
                      </Button>
                    </>
                  )}
                  {canComplete && (
                    <Button onClick={handleMarkComplete} disabled={isCompleting}>
                      <CheckCircle2 size={16} />
                      {isCompleting ? 'Completing…' : 'Mark Completed'}
                    </Button>
                  )}
                </div>
                {userRole === 'Receptionist' && !canComplete && (
                  <p className="text-xs text-slate-500">
                    Only clinicians or administrators may complete a medical consultation.
                  </p>
                )}
              </div>
            ) : (
              <InfoNote title="Immutable Record">
                This {appointment.status.toLowerCase()} appointment is permanently archived in reports
                and audit trails.
              </InfoNote>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
