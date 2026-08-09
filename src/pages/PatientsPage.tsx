import { useMemo, useState, type FormEvent } from 'react'
import { CalendarPlus, ChevronRight, ContactRound, FileHeart, MapPin, Phone, Plus, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useClinic } from '../context/ClinicContext'
import { ClinicRuleError, formatDate } from '../lib/domain'
import type { Patient } from '../types'
import { Avatar, Badge, Button, EmptyState, Field, InfoNote, Modal, PageHeader, RuleError, SearchInput } from '../components/ui'
import patientConsultationImage from '../assets/clinical/patient-consultation.webp'

export default function PatientsPage() {
  const { data, user, addPatient, addPolicy, notify } = useClinic()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [branch, setBranch] = useState('all')
  const [registrationOpen, setRegistrationOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [policyOpen, setPolicyOpen] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [emergencyCount, setEmergencyCount] = useState(1)
  const [coverageCount, setCoverageCount] = useState(1)

  const filtered = useMemo(() => data.patients.filter((patient) => {
    const needle = query.trim().toLowerCase()
    const matchesQuery = !needle || [patient.name, patient.nic, patient.phone, patient.patientNo].some((value) => value.toLowerCase().includes(needle))
    return matchesQuery && (branch === 'all' || patient.registeredBranchId === branch)
  }), [data.patients, query, branch])

  const submitPatient = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    const form = new FormData(event.currentTarget)
    try {
      const patient = addPatient({
        name: String(form.get('name')), nic: String(form.get('nic')), dob: String(form.get('dob')),
        gender: String(form.get('gender')), bloodGroup: String(form.get('bloodGroup')), phone: String(form.get('phone')),
        email: String(form.get('email')), address: String(form.get('address')), registeredBranchId: String(form.get('branch')),
        emergencyContacts: Array.from({ length: emergencyCount }, (_, index) => ({ name: String(form.get(`contactName${index}`)), relationship: String(form.get(`relationship${index}`)), phone: String(form.get(`contactPhone${index}`)) })).filter((contact) => contact.name && contact.phone),
      })
      setRegistrationOpen(false)
      setSelectedPatient(patient)
    } catch (caught) { setError(caught instanceof Error ? caught : new Error('The patient could not be registered.')); if (caught instanceof ClinicRuleError) notify({ type: 'error', title: 'Registration rejected', message: caught.message, code: caught.code }) }
  }

  const submitPolicy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedPatient) return; setError(null)
    const form = new FormData(event.currentTarget)
    try {
      addPolicy(selectedPatient.id, {
        provider: String(form.get('provider')), policyNo: String(form.get('policyNo')),
        validFrom: String(form.get('validFrom')), validTo: String(form.get('validTo')),
        status: String(form.get('status')) as 'Active' | 'Expired' | 'Suspended',
        coverage: Array.from({ length: coverageCount }, (_, index) => ({ treatmentId: String(form.get(`treatment${index}`)), percentage: Number(form.get(`percentage${index}`)), maximum: form.get(`maximum${index}`) ? Number(form.get(`maximum${index}`)) : undefined })),
      })
      setPolicyOpen(false); setSelectedPatient(null); setCoverageCount(1)
    } catch (caught) { setError(caught instanceof Error ? caught : new Error('The insurance policy could not be saved.')); if (caught instanceof ClinicRuleError) notify({ type: 'error', title: 'Policy rejected', message: caught.message, code: caught.code }) }
  }

  return <>
    <PageHeader image={patientConsultationImage} eyebrow="Clinic-wide directory" title="Patients" description="Find a single patient record from any branch using a name, NIC or passport number, phone, or patient ID." actions={user?.role !== 'Clinician' ? <Button onClick={() => { setError(null); setRegistrationOpen(true) }}><UserPlus size={16} />Register patient</Button> : undefined} />

    <section className="card mb-5 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_14rem_auto] md:items-center">
        <SearchInput placeholder="Search by name, NIC, phone or patient ID…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search patients" />
        <select className="input" value={branch} onChange={(event) => setBranch(event.target.value)} aria-label="Filter by registration branch"><option value="all">All registration branches</option>{data.branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>
        <p className="whitespace-nowrap text-right text-xs font-semibold text-slate-500">{filtered.length} patient{filtered.length === 1 ? '' : 's'}</p>
      </div>
    </section>

    {filtered.length ? <div className="table-shell overflow-x-auto">
      <table className="data-table min-w-[880px]">
        <thead><tr><th>Patient</th><th>Contact</th><th>Registered at</th><th>Last visit</th><th>Insurance</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{filtered.map((patient) => {
          const registeredBranch = data.branches.find((item) => item.id === patient.registeredBranchId)
          const activePolicies = patient.policies.filter((policy) => policy.status === 'Active')
          return <tr key={patient.id} className="cursor-pointer" onClick={() => setSelectedPatient(patient)}>
            <td><div className="flex items-center gap-3"><Avatar name={patient.name} /><div><p className="font-bold text-slate-800">{patient.name}</p><p className="mt-0.5 text-[11px] text-slate-400">{patient.patientNo} · {patient.nic}</p></div></div></td>
            <td><p className="font-medium text-slate-700">{patient.phone}</p><p className="mt-0.5 text-[11px] text-slate-400">{patient.email}</p></td>
            <td><p className="font-medium text-slate-700">{registeredBranch?.city}</p><p className="mt-0.5 text-[11px] text-slate-400">{formatDate(patient.registeredAt)}</p></td>
            <td>{patient.lastVisit === 'No visits yet' ? <span className="text-slate-400">No visits yet</span> : formatDate(patient.lastVisit)}</td>
            <td>{activePolicies.length ? <Badge tone="Active">{activePolicies.length} active</Badge> : <span className="text-xs text-slate-400">Self-pay</span>}</td>
            <td><button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-clinic-700" aria-label={`Open ${patient.name}'s record`}><ChevronRight size={17} /></button></td>
          </tr>
        })}</tbody>
      </table>
    </div> : <EmptyState icon={UsersRound} title="No matching patients" description="Try a different name, phone, identity number, or registration branch." action={<Button variant="secondary" onClick={() => { setQuery(''); setBranch('all') }}>Clear filters</Button>} />}

    <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} className="text-clinic-600" />Patient records are clinic-wide. Registration branch never restricts care at another branch.</p>

    <Modal open={registrationOpen} onClose={() => setRegistrationOpen(false)} title="Register a new patient" description="Create one clinic-wide identity. Required details are marked with an asterisk." size="lg">
      <form onSubmit={submitPatient} className="space-y-6">
        {error && <RuleError error={error} />}
        <div><h3 className="text-sm font-bold text-slate-900">Personal details</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required><input name="name" className="input" placeholder="As shown on identity document" required /></Field>
          <Field label="NIC or passport" hint="Checked for clinic-wide duplicates" required><input name="nic" className="input" placeholder="e.g. 927541286V" required /></Field>
          <Field label="Date of birth" required><input name="dob" className="input" type="date" max="2026-08-09" required /></Field>
          <Field label="Gender" required><select name="gender" className="input" required defaultValue=""><option value="" disabled>Select gender</option><option>Female</option><option>Male</option><option>Other</option><option>Prefer not to say</option></select></Field>
          <Field label="Blood group"><select name="bloodGroup" className="input" defaultValue="Unknown"><option>Unknown</option>{['A+','A-','B+','B-','AB+','AB-','O+','O-'].map((group) => <option key={group}>{group}</option>)}</select></Field>
          <Field label="Registration branch" hint="The record remains accessible at every branch" required><select name="branch" className="input" required defaultValue={user?.branchId === 'all' ? 'b1' : user?.branchId}>{data.branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        </div></div>
        <div className="border-t border-slate-100 pt-5"><h3 className="text-sm font-bold text-slate-900">Contact details</h3><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Phone" required><input name="phone" className="input" type="tel" placeholder="077 123 4567" required /></Field>
          <Field label="Email"><input name="email" className="input" type="email" placeholder="patient@example.lk" /></Field>
          <div className="sm:col-span-2"><Field label="Home address" required><textarea name="address" className="input min-h-20 resize-y" placeholder="Street, city" required /></Field></div>
        </div></div>
        <div className="border-t border-slate-100 pt-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900">Emergency contact</h3><p className="mt-1 text-xs text-slate-500">At least one contact is recommended.</p></div>{emergencyCount < 2 && <Button type="button" variant="ghost" size="sm" onClick={() => setEmergencyCount(2)}><Plus size={14} />Add another</Button>}</div>
          {Array.from({ length: emergencyCount }, (_, index) => <div key={index} className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3"><Field label="Contact name"><input name={`contactName${index}`} className="input" required={index === 0} /></Field><Field label="Relationship"><input name={`relationship${index}`} className="input" placeholder="e.g. Spouse" required={index === 0} /></Field><Field label="Phone"><input name={`contactPhone${index}`} className="input" type="tel" required={index === 0} /></Field></div>)}
        </div>
        <InfoNote title="Privacy and identity check">Confirm the identity document directly with the patient. Only fictional patient data should be entered in this demonstration environment.</InfoNote>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5"><Button type="button" variant="secondary" onClick={() => setRegistrationOpen(false)}>Cancel</Button><Button type="submit"><UserPlus size={16} />Register patient</Button></div>
      </form>
    </Modal>

    <Modal open={!!selectedPatient} onClose={() => setSelectedPatient(null)} title={selectedPatient?.name ?? 'Patient record'} description={selectedPatient ? `${selectedPatient.patientNo} · Clinic-wide patient record` : undefined} size="lg">
      {selectedPatient && <div className="space-y-6">
        <div className="flex flex-col gap-5 rounded-2xl bg-clinic-900 p-5 text-white sm:flex-row sm:items-center"><Avatar name={selectedPatient.name} size="lg" className="bg-white text-clinic-800 ring-0" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{selectedPatient.name}</h3><Badge>{selectedPatient.bloodGroup}</Badge></div><p className="mt-1 text-sm text-clinic-100/75">{selectedPatient.gender} · Born {formatDate(selectedPatient.dob)} · {selectedPatient.nic}</p></div>{user?.role !== 'Clinician' && <Button className="bg-white text-clinic-900 hover:bg-clinic-50" onClick={() => navigate('/appointments')}><CalendarPlus size={16} />Book visit</Button>}</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4"><Phone size={16} className="text-clinic-600" /><p className="mt-3 label-caps">Contact</p><p className="mt-1 text-sm font-semibold text-slate-800">{selectedPatient.phone}</p><p className="mt-1 truncate text-xs text-slate-500">{selectedPatient.email}</p></div>
          <div className="rounded-xl border border-slate-200 p-4"><MapPin size={16} className="text-clinic-600" /><p className="mt-3 label-caps">Address</p><p className="mt-1 text-sm leading-5 text-slate-700">{selectedPatient.address}</p></div>
          <div className="rounded-xl border border-slate-200 p-4"><ContactRound size={16} className="text-clinic-600" /><p className="mt-3 label-caps">Emergency</p><p className="mt-1 text-sm font-semibold text-slate-800">{selectedPatient.emergencyContacts[0]?.name ?? 'Not provided'}</p><p className="mt-1 text-xs text-slate-500">{selectedPatient.emergencyContacts[0]?.relationship} · {selectedPatient.emergencyContacts[0]?.phone}</p></div>
        </div>
        <section><div className="flex items-center justify-between"><h3 className="section-title">Insurance policies</h3>{user?.role !== 'Clinician' && <Button variant="secondary" size="sm" onClick={() => { setError(null); setPolicyOpen(true) }}><Plus size={14} />Add policy</Button>}</div>
          <div className="mt-3 space-y-3">{selectedPatient.policies.length ? selectedPatient.policies.map((policy) => <div key={policy.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><FileHeart size={19} /></span><div><p className="text-sm font-bold text-slate-800">{policy.provider}</p><p className="mt-0.5 text-xs text-slate-500">{policy.policyNo}</p></div></div><Badge>{policy.status}</Badge></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs"><div><p className="text-slate-400">Valid from</p><p className="mt-1 font-semibold text-slate-700">{formatDate(policy.validFrom)}</p></div><div><p className="text-slate-400">Valid until</p><p className="mt-1 font-semibold text-slate-700">{formatDate(policy.validTo)}</p></div></div><p className="mt-3 text-[11px] text-slate-500">{policy.coverage.length} treatment-specific coverage rule{policy.coverage.length === 1 ? '' : 's'} configured</p></div>) : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center"><ShieldCheck className="mx-auto text-slate-400" size={22} /><p className="mt-2 text-sm font-semibold text-slate-700">No insurance policy recorded</p><p className="mt-1 text-xs text-slate-500">This patient currently uses self-pay.</p></div>}</div>
        </section>
      </div>}
    </Modal>

    <Modal open={policyOpen} onClose={() => setPolicyOpen(false)} title="Add insurance policy" description={selectedPatient ? `${selectedPatient.name} · treatment-specific coverage` : undefined} size="lg">
      {selectedPatient && <form onSubmit={submitPolicy} className="space-y-6">
        {error && <RuleError error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Insurance provider" required><select name="provider" className="input"><option>Ceylinco Health</option><option>Allianz Lanka</option><option>Sri Lanka Insurance</option><option>Union Assurance</option></select></Field>
          <Field label="Policy number" hint="Must be unique" required><input name="policyNo" className="input" placeholder="e.g. CH-882104" required /></Field>
          <Field label="Valid from" required><input name="validFrom" type="date" className="input" required /></Field>
          <Field label="Valid until" required><input name="validTo" type="date" className="input" required /></Field>
          <Field label="Policy status" required><select name="status" className="input"><option>Active</option><option>Suspended</option><option>Expired</option></select></Field>
        </div>
        <div className="border-t border-slate-100 pt-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900">Treatment coverage</h3><p className="mt-1 text-xs text-slate-500">Set a percentage and an optional per-treatment cap.</p></div>{coverageCount < 3 && <Button type="button" variant="ghost" size="sm" onClick={() => setCoverageCount((count) => count + 1)}><Plus size={14} />Add treatment</Button>}</div>
          <div className="mt-4 space-y-3">{Array.from({ length: coverageCount }, (_, index) => <div key={index} className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1.3fr_.7fr_.8fr]"><Field label="Treatment" required><select name={`treatment${index}`} className="input">{data.treatments.filter((item) => item.isActive).map((treatment) => <option value={treatment.id} key={treatment.id}>{treatment.name}</option>)}</select></Field><Field label="Coverage %" required><input name={`percentage${index}`} type="number" className="input" min="0" max="100" defaultValue="80" required /></Field><Field label="Maximum (LKR)"><input name={`maximum${index}`} type="number" className="input" min="0" step="0.01" placeholder="No cap" /></Field></div>)}</div>
        </div>
        <InfoNote title="Multiple active policies are supported">The patient may hold active policies from more than one provider. Eligibility is calculated per treatment from these recorded terms.</InfoNote>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setPolicyOpen(false)}>Cancel</Button><Button type="submit"><ShieldCheck size={16} />Save policy</Button></div>
      </form>}
    </Modal>
  </>
}
