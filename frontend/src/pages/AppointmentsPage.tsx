/**
 * src/pages/AppointmentsPage.tsx
 * Owner: Dev1 | Issue: CATMS-061
 *
 * Full Appointments & Scheduling Workbench connected to backend APIs.
 * Supports live availability, day schedule grid, bookings, walk-ins,
 * reschedules, cancellations, completion, and detailed audit history.
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  RotateCcw,
  XCircle,
  Zap,
} from 'lucide-react';
import { useClinic } from '../context/ClinicContext';
import { DEMO_TODAY, formatDate } from '../lib/domain';
import type { Appointment, StaffMember } from '../types';
import { Avatar, Badge, Button, LoadingBlock, PageHeader, RuleError } from '../components/ui';
import {
  useAppointments,
  useBookAppointment,
  useWalkInAppointment,
  useRescheduleAppointment,
  useCancelAppointment,
  useCompleteAppointment,
  BookAppointmentModal,
  WalkInAppointmentModal,
  RescheduleAppointmentModal,
  CancelAppointmentModal,
  AppointmentDetailModal,
  DoctorDaySchedule,
  mapDtoToAppointment,
  parseNumericId,
} from '../features/appointments';
import type {
  AppointmentStatus,
  BookAppointmentInput,
  WalkInAppointmentInput,
  RescheduleAppointmentInput,
} from '../api/appointments.api';

type DialogType = 'book' | 'walkin' | 'details' | 'reschedule' | 'cancel' | null;

export default function AppointmentsPage() {
  const {
    data,
    user,
    notify,
  } = useClinic();

  const [date, setDate] = useState(DEMO_TODAY);
  const [branch, setBranch] = useState(
    user?.branchId === 'all' || !user?.branchId ? 'b1' : user.branchId,
  );
  const [doctorFilter, setDoctorFilter] = useState(
    user?.role === 'Clinician' ? user.id : 'all',
  );
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialog, setDialog] = useState<DialogType>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [bookingDoctor, setBookingDoctor] = useState(
    user?.role === 'Clinician' ? user.id : 'e1',
  );
  const [bookingStart, setBookingStart] = useState('11:30');

  // Permissions
  const canManage = user?.role === 'Receptionist' || user?.role === 'Admin';
  const canComplete = user?.role === 'Clinician' || user?.role === 'Admin';

  // Branch and Doctor data
  const doctors = useMemo(
    () =>
      data.staff.filter(
        (staff) =>
          staff.role === 'Doctor' &&
          staff.isActive &&
          (branch === 'all' || staff.branchId === branch || staff.id === user?.id),
      ),
    [data.staff, branch, user?.id],
  );

  const displayDoctors = useMemo(
    () => doctors.filter((doc) => doctorFilter === 'all' || doc.id === doctorFilter),
    [doctors, doctorFilter],
  );

  // Live Query Hook
  const queryParams = useMemo(() => {
    return {
      date,
      branchId: parseNumericId(branch),
      doctorId: doctorFilter !== 'all' ? parseNumericId(doctorFilter) : undefined,
      status: statusFilter !== 'all' ? (statusFilter as AppointmentStatus) : undefined,
    };
  }, [date, branch, doctorFilter, statusFilter]);

  const appointmentsQuery = useAppointments(queryParams);

  // Mutation Hooks
  const bookMutation = useBookAppointment();
  const walkInMutation = useWalkInAppointment();
  const rescheduleMutation = useRescheduleAppointment();
  const cancelMutation = useCancelAppointment();
  const completeMutation = useCompleteAppointment();

  // Live authoritative appointments list from backend API with demo fallback
  const appointments = useMemo(() => {
    if (appointmentsQuery.data && appointmentsQuery.data.length > 0) {
      return appointmentsQuery.data
        .map(mapDtoToAppointment)
        .sort((a, b) => a.start.localeCompare(b.start));
    }
    return data.appointments
      .filter((a) => {
        if (date && a.date !== date) return false;
        if (branch !== 'all' && a.branchId !== branch) return false;
        if (doctorFilter !== 'all' && a.doctorId !== doctorFilter) return false;
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [appointmentsQuery.data, data.appointments, date, branch, doctorFilter, statusFilter]);

  // Lookup maps
  const patientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of data.patients) {
      map[p.id] = p.name;
    }
    return map;
  }, [data.patients]);

  const doctorMap = useMemo(() => {
    const map: Record<string, StaffMember> = {};
    for (const d of data.staff) {
      map[d.id] = d;
    }
    return map;
  }, [data.staff]);

  const shiftDate = (days: number) => {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDate(next.toISOString().slice(0, 10));
  };

  const changeBranch = (newBranchId: string) => {
    setBranch(newBranchId);
    setDoctorFilter('all');
    const firstDoctor = data.staff.find(
      (s) => s.role === 'Doctor' && s.isActive && s.branchId === newBranchId,
    );
    if (firstDoctor) setBookingDoctor(firstDoctor.id);
  };

  const openSlotBooking = (doctorId: string, time: string) => {
    setBookingDoctor(doctorId);
    setBookingStart(time);
    setDialog('book');
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleBook = async (input: BookAppointmentInput) => {
    try {
      await bookMutation.mutateAsync(input);
      notify({
        type: 'success',
        title: 'Appointment booked',
        message: 'Visit has been scheduled and confirmed in the database.',
      });
      setDialog(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Slot unavailable';
      notify({ type: 'error', title: 'Slot unavailable', message });
      throw err;
    }
  };

  const handleWalkIn = async (input: WalkInAppointmentInput) => {
    try {
      await walkInMutation.mutateAsync(input);
      notify({
        type: 'success',
        title: 'Walk-in confirmed',
        message: 'Walk-in patient registered and verified against doctor schedule.',
      });
      setDialog(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Walk-in rejected';
      notify({ type: 'error', title: 'Walk-in rejected', message });
      throw err;
    }
  };

  const handleReschedule = async (id: number, input: RescheduleAppointmentInput) => {
    try {
      await rescheduleMutation.mutateAsync({ id, data: input });
      notify({
        type: 'success',
        title: 'Appointment rescheduled',
        message: `Slot moved to new time. Reason: ${input.reason}`,
      });
      setDialog(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reschedule rejected';
      notify({ type: 'error', title: 'Reschedule rejected', message });
      throw err;
    }
  };

  const handleCancel = async (id: number, reason: string) => {
    try {
      await cancelMutation.mutateAsync({ id, reason });
      notify({
        type: 'success',
        title: 'Appointment cancelled',
        message: 'Status recorded as Cancelled with audit trail entry.',
      });
      setDialog(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cancellation rejected';
      notify({ type: 'error', title: 'Cancellation rejected', message });
      throw err;
    }
  };

  const handleComplete = async () => {
    if (!selectedAppointment) return;
    const numId = parseNumericId(selectedAppointment.id);

    try {
      await completeMutation.mutateAsync({
        id: numId,
        data: { reason: 'Consultation completed' },
      });
      notify({
        type: 'success',
        title: 'Consultation completed',
        message: `${selectedAppointment.reference} marked as completed.`,
      });
      setDialog(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Status update rejected';
      notify({ type: 'error', title: 'Status update rejected', message });
      throw err;
    }
  };

  // Patient and Doctor for selected appointment
  const selectedPatient = selectedAppointment
    ? data.patients.find((p) => p.id === selectedAppointment.patientId)
    : undefined;
  const selectedDoctorInfo = selectedAppointment
    ? doctorMap[selectedAppointment.doctorId]
    : undefined;
  const selectedBranchName = selectedAppointment
    ? data.branches.find((b) => b.id === selectedAppointment.branchId)?.name
    : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Scheduling workbench"
        title="Appointments"
        description="Coordinate booked visits and walk-ins. Doctor availability is checked clinic-wide before every commit."
        actions={
          canManage ? (
            <>
              <Button variant="secondary" onClick={() => setDialog('walkin')}>
                <Zap size={16} />
                Add walk-in
              </Button>
              <Button onClick={() => setDialog('book')}>
                <Plus size={16} />
                Book appointment
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Filter and Control Bar */}
      <section className="card mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-center 2xl:grid-cols-[auto_12rem_14rem_12rem_1fr]">
          <div className="flex items-center justify-between gap-1 rounded-xl border border-slate-300 bg-white p-1">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Previous day"
            >
              <ChevronLeft size={17} />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="min-w-0 border-0 bg-transparent text-sm font-bold text-slate-700 outline-none"
              aria-label="Appointment date"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Next day"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <select
            className="input"
            value={branch}
            onChange={(e) => changeBranch(e.target.value)}
            aria-label="Branch"
            disabled={user?.branchId !== 'all' && !canManage && Boolean(user?.branchId)}
          >
            <option value="all" disabled>
              Select branch
            </option>
            {data.branches.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            aria-label="Doctor"
            disabled={user?.role === 'Clinician'}
          >
            <option value="all">All doctors</option>
            {doctors.map((doc) => (
              <option value={doc.id} key={doc.id}>
                {doc.name}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status"
          >
            <option value="all">All statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <div className="flex flex-wrap justify-start gap-4 text-xs font-semibold text-slate-500 sm:col-span-2 lg:col-span-4 lg:justify-end 2xl:col-span-1">
            <span className="flex items-center gap-1.5 text-[#1E77B8]">
              <Clock3 size={13} />
              Scheduled
            </span>
            <span className="flex items-center gap-1.5 text-[#1E8A5F]">
              <CheckCircle2 size={13} />
              Completed
            </span>
            <span className="flex items-center gap-1.5 text-[#69777F]">
              <XCircle size={13} />
              Cancelled
            </span>
          </div>
        </div>
      </section>

      {/* Date Header and Count */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">
            {formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {appointments.length} appointments ·{' '}
            {appointments.filter((item) => item.source === 'Walk-in').length} walk-ins
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDate(DEMO_TODAY);
            setStatusFilter('all');
          }}
        >
          <RotateCcw size={14} />
          Today
        </Button>
      </div>

      {appointmentsQuery.error && appointments.length === 0 && (
        <div className="mb-4">
          <RuleError error={appointmentsQuery.error} />
        </div>
      )}
      {appointmentsQuery.isLoading && appointments.length === 0 && (
        <div className="mb-4">
          <LoadingBlock label="Loading authoritative appointments from database…" />
        </div>
      )}

      {/* Desktop Schedule Grid */}
      <DoctorDaySchedule
        doctors={displayDoctors}
        appointments={appointments}
        patientNameMap={patientNameMap}
        canManage={canManage}
        onSelectAppointment={(apt) => {
          setSelectedAppointment(apt);
          setDialog('details');
        }}
        onSelectSlot={openSlotBooking}
      />

      {/* Mobile Card List */}
      <section className="space-y-3 md:hidden">
        {appointments.map((apt) => {
          const patientName = patientNameMap[apt.patientId] || 'Patient';
          const doctor = doctorMap[apt.doctorId];
          return (
            <button
              key={apt.id}
              type="button"
              onClick={() => {
                setSelectedAppointment(apt);
                setDialog('details');
              }}
              className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-slate-300"
            >
              <div className="w-12 shrink-0">
                <p className="text-sm font-bold text-slate-900">{apt.start}</p>
                <p className="text-[10px] text-slate-400">{apt.end}</p>
              </div>
              <Avatar name={patientName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-800">{patientName}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">{doctor?.name || 'Doctor'}</p>
              </div>
              <Badge>{apt.status}</Badge>
            </button>
          );
        })}
        {appointments.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-500">
            No appointments scheduled for this selection.
          </div>
        )}
      </section>

      {/* Database Authority Notice */}
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span>
          <strong>Database-authoritative scheduling:</strong> The calendar visualizes doctor availability,
          but PostgreSQL verifies the doctor's full clinic-wide schedule and prevents double bookings
          when the booking or reschedule commits.
        </span>
      </div>

      {/* Modals */}
      <BookAppointmentModal
        open={dialog === 'book'}
        onClose={() => setDialog(null)}
        onBook={handleBook}
        defaultBranchId={branch}
        defaultDoctorId={bookingDoctor}
        defaultDate={date}
        defaultStart={bookingStart}
        branches={data.branches}
        doctors={data.staff.filter((s) => s.role === 'Doctor' && s.isActive)}
        patients={data.patients}
      />

      <WalkInAppointmentModal
        open={dialog === 'walkin'}
        onClose={() => setDialog(null)}
        onWalkIn={handleWalkIn}
        defaultBranchId={branch}
        defaultDoctorId={bookingDoctor}
        defaultDate={date}
        defaultStart={bookingStart}
        branches={data.branches}
        doctors={data.staff.filter((s) => s.role === 'Doctor' && s.isActive)}
        patients={data.patients}
      />

      <RescheduleAppointmentModal
        open={dialog === 'reschedule'}
        onClose={() => setDialog(null)}
        appointment={selectedAppointment}
        onReschedule={handleReschedule}
      />

      <CancelAppointmentModal
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        appointment={selectedAppointment}
        onCancel={handleCancel}
      />

      <AppointmentDetailModal
        open={dialog === 'details'}
        onClose={() => setDialog(null)}
        appointment={selectedAppointment}
        patientName={selectedPatient?.name}
        patientNumber={selectedPatient?.patientNo}
        patientContact={selectedPatient?.phone}
        doctorName={selectedDoctorInfo?.name}
        doctorSpecialty={selectedDoctorInfo?.specialties?.[0]}
        branchName={selectedBranchName}
        canManage={canManage}
        canComplete={canComplete}
        userRole={user?.role}
        onOpenReschedule={() => setDialog('reschedule')}
        onOpenCancel={() => setDialog('cancel')}
        onComplete={handleComplete}
      />
    </>
  );
}
