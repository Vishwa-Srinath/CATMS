import { useMemo, useState, type FormEvent } from 'react'
import { ClipboardCheck, ClipboardPlus, Clock3, FileText, LockKeyhole, Search, UserRound } from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import { ClinicRuleError, DEMO_TODAY, formatCurrency, formatDate } from '../lib/domain'
import type { Appointment } from '../types'
import { Avatar, Badge, Button, EmptyState, Field, InfoNote, Modal, PageHeader, RuleError, SearchInput } from '../components/ui'
import clinicianImage from '../assets/clinical/clinician-stethoscope.webp'

export default function ClinicalPage() {
  const { data, user, saveClinicalRecord, notify } = useClinic()
  const [tab, setTab] = useState<'worklist' | 'records'>('worklist')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>(['t1'])
  const [error, setError] = useState<Error | null>(null)

  const relevantAppointments = data.appointments.filter((appointment) => user?.role === 'Admin' || appointment.doctorId === user?.id)
  const pending = relevantAppointments.filter((appointment) => appointment.status === 'Completed' && !data.clinicalRecords.some((record) => record.appointmentId === appointment.id))
  const scheduled = relevantAppointments.filter((appointment) => appointment.status === 'Scheduled' && appointment.date === DEMO_TODAY)
  const records = useMemo(() => data.clinicalRecords.filter((record) => {
    const appointment = data.appointments.find((item) => item.id === record.appointmentId)
    const patient = data.patients.find((item) => item.id === appointment?.patientId)
    return (user?.role === 'Admin' || appointment?.doctorId === user?.id) && (!query || patient?.name.toLowerCase().includes(query.toLowerCase()) || record.diagnosis.toLowerCase().includes(query.toLowerCase()))
  }), [data, query, user])

  const patientFor = (appointment: Appointment) => data.patients.find((patient) => patient.id === appointment.patientId)!

  const submitRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selected) return; setError(null)
    const form = new FormData(event.currentTarget)
    try {
      saveClinicalRecord(selected.id, String(form.get('diagnosis')), String(form.get('notes')), selectedTreatments, String(form.get('vitals')))
      setSelected(null); setSelectedTreatments(['t1'])
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('The clinical record could not be saved.'))
      if (caught instanceof ClinicRuleError) notify({ type: 'error', title: 'Clinical record rejected', message: caught.message, code: caught.code })
    }
  }

  const total = selectedTreatments.reduce((sum, id) => sum + (data.treatments.find((item) => item.id === id)?.price ?? 0), 0)

  return <>
    <PageHeader image={clinicianImage} eyebrow="Clinician workspace" title="Clinical worklist" description="Record one consultation note and the treatments delivered after a visit has been completed." />

    <div className="mb-6 flex max-w-sm tab-list"><button onClick={() => setTab('worklist')} className={`tab-button flex-1 ${tab === 'worklist' ? 'tab-button-active' : ''}`}>Active worklist <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{pending.length}</span></button><button onClick={() => setTab('records')} className={`tab-button flex-1 ${tab === 'records' ? 'tab-button-active' : ''}`}>Recorded care</button></div>

    {tab === 'worklist' ? <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="section-title">Ready for documentation</h2><p className="mt-1 text-xs text-slate-500">Completed appointments without a consultation record</p></div><Badge tone={pending.length ? 'PartiallyPaid' : 'Completed'}>{pending.length} pending</Badge></div>
        <div className="space-y-3">{pending.length ? pending.map((appointment) => {
          const patient = patientFor(appointment)
          return <article key={appointment.id} className="card p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 items-center gap-3"><Avatar name={patient.name} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-bold text-slate-800">{patient.name}</h3><Badge>Completed</Badge></div><p className="mt-1 text-xs text-slate-500">{appointment.reference} · {formatDate(appointment.date)} · {appointment.start}</p><p className="mt-2 text-sm text-slate-600">{appointment.reason}</p></div></div><Button onClick={() => { setSelected(appointment); setError(null) }}><ClipboardPlus size={16} />Record care</Button></div></article>
        }) : <EmptyState icon={ClipboardCheck} title="Worklist complete" description="Every completed appointment has a consultation record and treatment entry." />}</div>
      </section>
      <aside className="space-y-4">
        <div className="card p-5"><p className="label-caps">Today’s progress</p><div className="mt-4 flex items-end gap-2"><p className="text-3xl font-bold text-slate-900">{data.clinicalRecords.filter((record) => record.recordedAt.startsWith(DEMO_TODAY) && relevantAppointments.some((appointment) => appointment.id === record.appointmentId)).length}</p><p className="pb-1 text-sm text-slate-500">records completed</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 rounded-full bg-clinic-600" /></div><p className="mt-2 text-[11px] text-slate-500">Complete outstanding notes before the end of shift.</p></div>
        <InfoNote title="Database-gated care entry">The UI only enables care entry for Completed visits. PostgreSQL applies the same rule again and returns <code>DB_TREATMENT_REQUIRES_COMPLETED</code> if bypassed.</InfoNote>
        <div className="card p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">Upcoming today</h3><Clock3 size={16} className="text-slate-400" /></div><div className="mt-3 divide-y divide-slate-100">{scheduled.slice(0, 4).map((appointment) => <div key={appointment.id} className="flex items-center gap-3 py-3"><span className="w-10 text-xs font-bold text-slate-700">{appointment.start}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{patientFor(appointment).name}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{appointment.reason}</p></div><span title="Care entry unavailable until Completed"><LockKeyhole size={14} className="text-slate-300" /></span></div>)}</div></div>
      </aside>
    </div> : <section>
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or diagnosis…" aria-label="Search clinical records" /><p className="self-center text-xs font-semibold text-slate-500">{records.length} consultation records</p></div>
      {records.length ? <div className="table-shell overflow-x-auto"><table className="data-table min-w-[820px]"><thead><tr><th>Patient</th><th>Appointment</th><th>Diagnosis</th><th>Treatments</th><th>Recorded</th></tr></thead><tbody>{records.map((record) => {
        const appointment = data.appointments.find((item) => item.id === record.appointmentId)!
        const patient = patientFor(appointment)
        return <tr key={record.appointmentId}><td><div className="flex items-center gap-3"><Avatar name={patient.name} size="sm" /><div><p className="font-bold text-slate-800">{patient.name}</p><p className="text-[11px] text-slate-400">{patient.patientNo}</p></div></div></td><td><p className="font-semibold text-slate-700">{appointment.reference}</p><p className="text-[11px] text-slate-400">{formatDate(appointment.date)}</p></td><td><p className="max-w-xs truncate font-medium text-slate-700">{record.diagnosis}</p><p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-400">{record.notes}</p></td><td><span className="font-semibold text-slate-700">{record.treatments.length}</span> services</td><td>{new Date(record.recordedAt).toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })}</td></tr>
      })}</tbody></table></div> : <EmptyState icon={Search} title="No matching clinical records" description="Try searching by patient name or diagnosis." />}
    </section>}

    <Modal open={!!selected} onClose={() => setSelected(null)} title="Record consultation" description={selected ? `${selected.reference} · ${patientFor(selected).name} · Completed ${selected.start}` : undefined} size="xl">
      {selected && <form onSubmit={submitRecord} className="space-y-6">
        {error && <RuleError error={error} />}
        <div className="grid gap-6 lg:grid-cols-[1fr_.85fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-[#DCE4E4] bg-[#EFF3F3] p-4"><UserRound size={19} className="text-[var(--portal-accent)]" /><div><p className="text-sm font-bold text-slate-900">{patientFor(selected).name}</p><p className="mt-0.5 text-xs text-slate-600">{patientFor(selected).gender} · Blood group {patientFor(selected).bloodGroup} · {patientFor(selected).policies.some((policy) => policy.status === 'Active') ? 'Active insurance policy' : 'Self-pay'}</p></div></div>
            <Field label="Diagnosis" required><input name="diagnosis" className="input" placeholder="Primary clinical assessment" maxLength={200} required /></Field>
            <Field label="Vitals" hint="Optional structured summary"><input name="vitals" className="input" placeholder="e.g. BP 120/80 · HR 72 · SpO₂ 98%" /></Field>
            <Field label="Consultation notes" hint="One note set is allowed per completed appointment" required><textarea name="notes" className="input min-h-40 resize-y" placeholder="Document findings, advice, and follow-up plan" required /></Field>
          </div>
          <div><div className="flex items-end justify-between"><div><p className="text-sm font-bold text-slate-900">Treatments delivered</p><p className="mt-1 text-xs text-slate-500">Prices are snapshotted when saved.</p></div><p className="text-sm font-bold text-clinic-700">{formatCurrency(total)}</p></div>
            <div className="mt-3 max-h-[25rem] space-y-2 overflow-y-auto pr-1">{data.treatments.filter((treatment) => treatment.isActive).map((treatment) => {
              const checked = selectedTreatments.includes(treatment.id)
              return <label key={treatment.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked ? 'border-clinic-500 bg-clinic-50' : 'border-slate-200 hover:border-slate-300'}`}><input type="checkbox" className="h-4 w-4 accent-clinic-700" checked={checked} onChange={() => setSelectedTreatments((current) => checked ? current.filter((id) => id !== treatment.id) : [...current, treatment.id])} /><span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">{treatment.name}</span><span className="mt-0.5 block text-[10px] text-slate-400">{treatment.serviceCode} · {treatment.category}</span></span><span className="text-xs font-semibold text-slate-600">{formatCurrency(treatment.price)}</span></label>
            })}</div>
            <div className="mt-3 flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-500"><FileText className="mt-0.5 shrink-0" size={14} /><span>The invoice is generated automatically. Financial totals are read-only and cannot be submitted from this form.</span></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setSelected(null)}>Save later</Button><Button type="submit" disabled={!selectedTreatments.length}><ClipboardCheck size={16} />Save care & generate invoice</Button></div>
      </form>}
    </Modal>
  </>
}
