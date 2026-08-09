import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, CalendarCheck2, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, RotateCcw, UserRound, UserRoundCheck, XCircle, Zap } from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import { ClinicRuleError, DEMO_TODAY, formatDate, timeToMinutes } from '../lib/domain'
import type { Appointment } from '../types'
import { Avatar, Badge, Button, Field, InfoNote, Modal, PageHeader, RuleError } from '../components/ui'
import appointmentCareImage from '../assets/clinical/appointment-care.webp'

type Dialog = 'book' | 'walkin' | 'details' | 'reschedule' | 'cancel' | null

const timeSlots = Array.from({ length: 17 }, (_, index) => {
  const minutes = 8 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
})

const addMinutes = (time: string, minutesToAdd: number) => {
  const value = timeToMinutes(time) + minutesToAdd
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export default function AppointmentsPage() {
  const { data, user, addAppointment, rescheduleAppointment, updateAppointmentStatus, notify } = useClinic()
  const [date, setDate] = useState(DEMO_TODAY)
  const [branch, setBranch] = useState(user?.branchId === 'all' ? 'b1' : user?.branchId ?? 'b1')
  const [doctorFilter, setDoctorFilter] = useState(user?.role === 'Clinician' ? user.id : 'all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [bookingDoctor, setBookingDoctor] = useState(user?.role === 'Clinician' ? user.id : 'e1')
  const [bookingStart, setBookingStart] = useState('11:30')

  const doctors = data.staff.filter((staff) => staff.role === 'Doctor' && staff.isActive && (staff.branchId === branch || staff.id === user?.id))
  const displayDoctors = doctors.filter((doctor) => doctorFilter === 'all' || doctor.id === doctorFilter)
  const appointments = useMemo(() => data.appointments.filter((appointment) => appointment.date === date && appointment.branchId === branch && (doctorFilter === 'all' || appointment.doctorId === doctorFilter) && (statusFilter === 'all' || appointment.status === statusFilter)).sort((a, b) => a.start.localeCompare(b.start)), [data.appointments, date, branch, doctorFilter, statusFilter])
  const canManage = user?.role === 'Receptionist' || user?.role === 'Admin'

  const shiftDate = (days: number) => {
    const next = new Date(`${date}T12:00:00`)
    next.setDate(next.getDate() + days)
    setDate(next.toISOString().slice(0, 10))
  }

  const changeBranch = (branchId: string) => {
    setBranch(branchId); setDoctorFilter('all')
    const firstDoctor = data.staff.find((staff) => staff.role === 'Doctor' && staff.isActive && staff.branchId === branchId)
    if (firstDoctor) setBookingDoctor(firstDoctor.id)
  }

  const openDialog = (type: Dialog, appointment?: Appointment) => { setSelected(appointment ?? null); setError(null); setDialog(type) }
  const handleRuleError = (caught: unknown, title: string) => { setError(caught instanceof Error ? caught : new Error('The operation could not be completed.')); if (caught instanceof ClinicRuleError) notify({ type: 'error', title, message: caught.message, code: caught.code }) }

  const submitBooking = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null)
    const form = new FormData(event.currentTarget)
    try {
      addAppointment({ patientId: String(form.get('patient')), doctorId: String(form.get('doctor')), branchId: String(form.get('branch')), date: String(form.get('date')), start: String(form.get('start')), end: String(form.get('end')), source: dialog === 'walkin' ? 'Walk-in' : 'Booked', reason: String(form.get('reason')) })
      setDialog(null)
    } catch (caught) { handleRuleError(caught, 'Slot unavailable') }
  }

  const submitReschedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return
    const form = new FormData(event.currentTarget)
    try { rescheduleAppointment(selected.id, String(form.get('date')), String(form.get('start')), String(form.get('end')), String(form.get('reason'))); setDialog(null) } catch (caught) { handleRuleError(caught, 'Reschedule rejected') }
  }

  const submitCancellation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return
    const form = new FormData(event.currentTarget)
    try { updateAppointmentStatus(selected.id, 'Cancelled', String(form.get('reason'))); setDialog(null) } catch (caught) { handleRuleError(caught, 'Cancellation rejected') }
  }

  const completeAppointment = () => {
    if (!selected) return
    try { updateAppointmentStatus(selected.id, 'Completed'); setDialog(null) } catch (caught) { handleRuleError(caught, 'Status change rejected') }
  }

  const patientFor = (appointment: Appointment) => data.patients.find((patient) => patient.id === appointment.patientId)!
  const doctorFor = (appointment: Appointment) => data.staff.find((staff) => staff.id === appointment.doctorId)!

  return <>
    <PageHeader image={appointmentCareImage} eyebrow="Scheduling workbench" title="Appointments" description="Coordinate booked visits and walk-ins. Doctor availability is checked clinic-wide before every commit." actions={canManage ? <><Button variant="secondary" onClick={() => openDialog('walkin')}><Zap size={16} />Add walk-in</Button><Button onClick={() => openDialog('book')}><Plus size={16} />Book appointment</Button></> : undefined} />

    <section className="card mb-5 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-center 2xl:grid-cols-[auto_12rem_14rem_12rem_1fr]">
        <div className="flex items-center justify-between gap-1 rounded-xl border border-slate-300 bg-white p-1"><button type="button" onClick={() => shiftDate(-1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Previous day"><ChevronLeft size={17} /></button><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-w-0 border-0 bg-transparent text-sm font-bold text-slate-700 outline-none" aria-label="Appointment date" /><button type="button" onClick={() => shiftDate(1)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Next day"><ChevronRight size={17} /></button></div>
        <select className="input" value={branch} onChange={(event) => changeBranch(event.target.value)} aria-label="Branch"><option value="all" disabled>Select branch</option>{data.branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <select className="input" value={doctorFilter} onChange={(event) => setDoctorFilter(event.target.value)} aria-label="Doctor"><option value="all">All doctors</option>{doctors.map((doctor) => <option value={doctor.id} key={doctor.id}>{doctor.name}</option>)}</select>
        <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status"><option value="all">All statuses</option><option>Scheduled</option><option>Completed</option><option>Cancelled</option></select>
        <div className="flex flex-wrap justify-start gap-4 text-xs font-semibold text-slate-500 sm:col-span-2 lg:col-span-4 lg:justify-end 2xl:col-span-1"><span className="flex items-center gap-1.5 text-[#1E77B8]"><Clock3 size={13} />Scheduled</span><span className="flex items-center gap-1.5 text-[#1E8A5F]"><CheckCircle2 size={13} />Completed</span><span className="flex items-center gap-1.5 text-[#69777F]"><XCircle size={13} />Cancelled</span></div>
      </div>
    </section>

    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-bold text-slate-800">{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><p className="mt-1 text-xs text-slate-500">{appointments.length} appointments · {appointments.filter((item) => item.source === 'Walk-in').length} walk-ins</p></div><Button variant="ghost" size="sm" onClick={() => { setDate(DEMO_TODAY); setStatusFilter('all') }}><RotateCcw size={14} />Today</Button></div>

    <section className="table-shell hidden overflow-x-auto md:block" aria-label="Doctor day schedule">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `5.5rem repeat(${Math.max(displayDoctors.length, 1)}, minmax(15rem, 1fr))` }}>
        <div className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 p-4"><Clock3 size={16} className="text-slate-400" /></div>
        {displayDoctors.map((doctor) => <div key={doctor.id} className="border-b border-r border-slate-200 bg-slate-50 p-3 last:border-r-0"><div className="flex items-center gap-2"><Avatar name={doctor.name} size="sm" /><div><p className="text-xs font-bold text-slate-800">{doctor.name}</p><p className="text-[10px] text-slate-400">{doctor.specialties?.[0]}</p></div></div></div>)}
        {displayDoctors.length === 0 && <div className="border-b border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">No doctors at this branch</div>}
        {timeSlots.map((time) => <div key={time} className="contents">
          <div className="sticky left-0 z-10 h-[4.25rem] border-r border-t border-slate-100 bg-white px-3 py-2 text-[11px] font-semibold text-slate-400">{time}</div>
          {displayDoctors.map((doctor) => {
            const item = appointments.find((appointment) => appointment.doctorId === doctor.id && appointment.start === time)
            return <div key={doctor.id} className="relative h-[4.25rem] border-r border-t border-slate-100 p-1.5 last:border-r-0">
              {item ? <button onClick={() => openDialog('details', item)} className={`h-full w-full rounded-lg border-l-4 px-3 py-2 text-left transition hover:brightness-[.98] ${item.status === 'Completed' ? 'border-[#1E8A5F] bg-[#E7F5EE]' : item.status === 'Cancelled' ? 'border-[#8A97A0] bg-[#EFF3F3] opacity-75' : 'border-[#1E77B8] bg-[#EAF4FB]'}`}><span className="block truncate text-xs font-bold text-slate-800">{patientFor(item).name}</span><span className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-slate-500">{item.start}–{item.end}{item.source === 'Walk-in' && <> · <Zap size={9} /> Walk-in</>}</span></button> : canManage && <button onClick={() => { setBookingDoctor(doctor.id); setBookingStart(time); openDialog('book') }} className="group h-full w-full rounded-lg p-1.5" aria-label={`Preview and book ${doctor.name} at ${time}`}><span className="slot-ghost flex h-full w-full items-center justify-center gap-1.5 rounded-md px-2 text-[10px] font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"><span className="live-pulse" />Free · preview</span></button>}
            </div>
          })}
        </div>)}
      </div>
    </section>

    <section className="space-y-3 md:hidden">
      {appointments.map((appointment) => <button key={appointment.id} onClick={() => openDialog('details', appointment)} className="card flex w-full items-center gap-3 p-4 text-left"><div className="w-12 shrink-0"><p className="text-sm font-bold text-slate-900">{appointment.start}</p><p className="text-[10px] text-slate-400">{appointment.end}</p></div><Avatar name={patientFor(appointment).name} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{patientFor(appointment).name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{doctorFor(appointment).name}</p></div><Badge>{appointment.status}</Badge></button>)}
    </section>

    <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><strong>Database-authoritative scheduling:</strong> the calendar helps staff choose a time, but PostgreSQL checks the doctor’s full clinic-wide schedule again when the booking or reschedule commits.</span></div>

    <Modal open={dialog === 'book' || dialog === 'walkin'} onClose={() => setDialog(null)} title={dialog === 'walkin' ? 'Create walk-in appointment' : 'Book an appointment'} description={dialog === 'walkin' ? 'For a patient who has arrived without a prior booking. The same overlap rule still applies.' : 'Select the patient, care location, doctor, and an available time.'} size="lg">
      <form onSubmit={submitBooking} className="space-y-5">
        {error && <RuleError error={error} />}
        {dialog === 'walkin' && <InfoNote title="Walk-in source is retained">This visit will be tagged as Walk-in in the schedule, audit trail, and management reports.</InfoNote>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Patient" hint="Search uses the clinic-wide patient registry" required><select name="patient" className="input" required defaultValue=""><option value="" disabled>Select a patient</option>{data.patients.map((patient) => <option value={patient.id} key={patient.id}>{patient.name} · {patient.patientNo} · {patient.nic}</option>)}</select></Field></div>
          <Field label="Branch" required><select name="branch" className="input" value={branch} onChange={(event) => changeBranch(event.target.value)}>{data.branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Doctor" required><select name="doctor" className="input" value={bookingDoctor} onChange={(event) => setBookingDoctor(event.target.value)}>{doctors.map((doctor) => <option value={doctor.id} key={doctor.id}>{doctor.name} · {doctor.specialties?.[0]}</option>)}</select></Field>
          <Field label="Date" required><input name="date" type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} min="2026-08-09" required /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Start" required><select name="start" className="input" value={bookingStart} onChange={(event) => setBookingStart(event.target.value)}>{timeSlots.map((time) => <option key={time}>{time}</option>)}</select></Field><Field label="End" required><input name="end" className="input" value={addMinutes(bookingStart, 30)} readOnly /></Field></div>
          <div className="sm:col-span-2"><Field label="Reason for visit" required><textarea name="reason" className="input min-h-20 resize-y" placeholder="Brief reason visible to the care team" required /></Field></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit">{dialog === 'walkin' ? <Zap size={16} /> : <CalendarCheck2 size={16} />}{dialog === 'walkin' ? 'Add walk-in' : 'Confirm booking'}</Button></div>
      </form>
    </Modal>

    <Modal open={dialog === 'details'} onClose={() => setDialog(null)} title={selected?.reference ?? 'Appointment'} description={selected ? `${formatDate(selected.date)} · ${selected.start}–${selected.end}` : undefined}>
      {selected && <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4"><Avatar name={patientFor(selected).name} size="lg" /><div className="min-w-0 flex-1"><p className="text-base font-bold text-slate-800">{patientFor(selected).name}</p><p className="mt-1 text-xs text-slate-500">{patientFor(selected).patientNo} · {patientFor(selected).phone}</p></div><div className="space-y-1 text-right"><Badge>{selected.status}</Badge><div><Badge>{selected.source}</Badge></div></div></div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3"><UserRoundCheck size={17} className="mt-0.5 text-[var(--portal-accent)]" /><div><dt className="label-caps">Doctor</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{doctorFor(selected).name}</dd></div></div>
          <div className="flex gap-3"><MapPin size={17} className="mt-0.5 text-clinic-600" /><div><dt className="label-caps">Branch</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{data.branches.find((item) => item.id === selected.branchId)?.name}</dd></div></div>
          <div className="flex gap-3 sm:col-span-2"><UserRound size={17} className="mt-0.5 text-clinic-600" /><div><dt className="label-caps">Reason for visit</dt><dd className="mt-1 text-sm leading-6 text-slate-700">{selected.reason}</dd></div></div>
        </dl>
        {selected.cancellationReason && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-800">Cancellation reason:</strong> {selected.cancellationReason}</div>}
        {selected.status === 'Scheduled' && <div className="border-t border-slate-100 pt-5"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Available actions</p><div className="flex flex-wrap gap-2">{canManage && <><Button variant="secondary" onClick={() => setDialog('reschedule')}><CalendarClock size={16} />Reschedule</Button><Button variant="danger" onClick={() => setDialog('cancel')}><XCircle size={16} />Cancel</Button></>}{(user?.role === 'Clinician' || user?.role === 'Admin') && <Button onClick={completeAppointment}><CheckCircle2 size={16} />Mark completed</Button>}</div>{user?.role === 'Receptionist' && <p className="mt-3 text-xs text-slate-500">Only the clinician or an administrator can mark clinical work as completed.</p>}</div>}
        {selected.status !== 'Scheduled' && <InfoNote title="Immutable appointment history">This {selected.status.toLowerCase()} appointment remains in reports. Its status and schedule events cannot be deleted.</InfoNote>}
      </div>}
    </Modal>

    <Modal open={dialog === 'reschedule'} onClose={() => setDialog(null)} title={`Reschedule ${selected?.reference ?? 'appointment'}`} description="The new time is checked clinic-wide before the original booking changes.">
      {selected && <form onSubmit={submitReschedule} className="space-y-5">{error && <RuleError error={error} />}<div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><strong className="text-slate-800">Current slot:</strong> {formatDate(selected.date)} · {selected.start}–{selected.end}</div><div className="grid gap-4 sm:grid-cols-2"><Field label="New date" required><input name="date" type="date" className="input" defaultValue={selected.date} min="2026-08-09" required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Start" required><select name="start" className="input" defaultValue={selected.start}>{timeSlots.map((time) => <option key={time}>{time}</option>)}</select></Field><Field label="End" required><select name="end" className="input" defaultValue={selected.end}>{timeSlots.map((time) => <option key={time}>{time}</option>)}</select></Field></div><div className="sm:col-span-2"><Field label="Reason for rescheduling" hint="Required for the appointment history" required><textarea name="reason" className="input min-h-20" required /></Field></div></div><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>Keep original</Button><Button type="submit"><CalendarClock size={16} />Check & reschedule</Button></div></form>}
    </Modal>

    <Modal open={dialog === 'cancel'} onClose={() => setDialog(null)} title={`Cancel ${selected?.reference ?? 'appointment'}`} description="Cancellation is a status change, not a deletion. The appointment remains in the audit trail." size="sm">
      <form onSubmit={submitCancellation} className="space-y-5">{error && <RuleError error={error} />}<Field label="Cancellation reason" required><textarea name="reason" className="input min-h-24" placeholder="Record why this appointment is being cancelled" required /></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>Keep appointment</Button><Button type="submit" variant="danger"><XCircle size={16} />Cancel appointment</Button></div></form>
    </Modal>
  </>
}
