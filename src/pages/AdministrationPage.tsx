import { useMemo, useState, type FormEvent } from 'react'
import { Building2, CheckCircle2, CircleOff, MapPin, Phone, Plus, ShieldCheck, Stethoscope, UserCog } from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import { ClinicRuleError, formatCurrency, formatDate } from '../lib/domain'
import type { StaffMember } from '../types'
import { Avatar, Badge, Button, Field, InfoNote, Modal, PageHeader, RuleError, SearchInput } from '../components/ui'
import receptionImage from '../assets/clinical/reception-corridor.webp'

type Tab = 'branches' | 'staff' | 'specialties'

export default function AdministrationPage() {
  const { data, addStaff, toggleStaff, addBranch, notify } = useClinic()
  const [tab, setTab] = useState<Tab>('branches')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [employeeRole, setEmployeeRole] = useState<StaffMember['role']>('Doctor')
  const [error, setError] = useState<Error | null>(null)

  const staff = useMemo(() => data.staff.filter((item) => {
    const needle = query.toLowerCase()
    return (!needle || [item.name, item.employeeNo, item.nic, item.role].some((value) => value.toLowerCase().includes(needle))) && (branchFilter === 'all' || item.branchId === branchFilter)
  }), [data.staff, query, branchFilter])

  const specialties = useMemo(() => {
    const map = new Map<string, StaffMember[]>()
    data.staff.filter((item) => item.role === 'Doctor').forEach((doctor) => doctor.specialties?.forEach((specialty) => map.set(specialty, [...(map.get(specialty) ?? []), doctor])))
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [data.staff])

  const handleError = (caught: unknown, title: string) => { setError(caught instanceof Error ? caught : new Error('The operation could not be completed.')); if (caught instanceof ClinicRuleError) notify({ type: 'error', title, message: caught.message, code: caught.code }) }

  const submitEmployee = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null)
    const form = new FormData(event.currentTarget)
    try {
      addStaff({ name: String(form.get('name')), role: employeeRole, branchId: String(form.get('branch')), email: String(form.get('email')), phone: String(form.get('phone')), nic: String(form.get('nic')), joined: String(form.get('joined')), license: employeeRole === 'Doctor' ? String(form.get('license')) : undefined, consultationFee: employeeRole === 'Doctor' ? Number(form.get('fee')) : undefined, specialties: employeeRole === 'Doctor' ? String(form.get('specialties')).split(',').map((item) => item.trim()).filter(Boolean) : undefined })
      setEmployeeOpen(false)
    } catch (caught) { handleError(caught, 'Employee registration rejected') }
  }

  const submitBranch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null)
    const form = new FormData(event.currentTarget)
    try { addBranch({ name: String(form.get('name')), city: String(form.get('city')), address: String(form.get('address')), phone: String(form.get('phone')), manager: String(form.get('manager')) }); setBranchOpen(false) } catch (caught) { handleError(caught, 'Branch creation rejected') }
  }

  return <>
    <PageHeader image={receptionImage} eyebrow="System administration" title="Branches & staff" description="Manage clinic locations, employee roles, doctors, and their specialty assignments without deleting historical records." actions={tab === 'branches' ? <Button onClick={() => { setError(null); setBranchOpen(true) }}><Plus size={16} />Add branch</Button> : tab === 'staff' ? <Button onClick={() => { setError(null); setEmployeeOpen(true) }}><Plus size={16} />Add employee</Button> : undefined} />

    <div className="mb-6 flex max-w-md tab-list"><button className={`tab-button flex-1 ${tab === 'branches' ? 'tab-button-active' : ''}`} onClick={() => setTab('branches')}>Branches</button><button className={`tab-button flex-1 ${tab === 'staff' ? 'tab-button-active' : ''}`} onClick={() => setTab('staff')}>Staff directory</button><button className={`tab-button flex-1 ${tab === 'specialties' ? 'tab-button-active' : ''}`} onClick={() => setTab('specialties')}>Specialties</button></div>

    {tab === 'branches' && <section className="grid gap-5 lg:grid-cols-3">{data.branches.map((branch) => {
      const members = data.staff.filter((item) => item.branchId === branch.id && item.isActive)
      const doctors = members.filter((item) => item.role === 'Doctor')
      const todayVisits = data.appointments.filter((item) => item.branchId === branch.id && item.date === '2026-08-09')
      return <article key={branch.id} className="card overflow-hidden"><div className="h-2 bg-clinic-600" /><div className="p-5"><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-clinic-50 text-clinic-700"><Building2 size={21} /></span><Badge>{branch.isActive ? 'Active' : 'Inactive'}</Badge></div><div className="mt-4"><p className="label-caps">{branch.code} · {branch.city}</p><h2 className="mt-1 section-title">{branch.name}</h2></div><div className="mt-4 space-y-2 text-xs text-slate-500"><p className="flex items-start gap-2"><MapPin className="mt-0.5 shrink-0" size={14} />{branch.address}</p><p className="flex items-center gap-2"><Phone size={14} />{branch.phone}</p></div><div className="mt-5 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-100 py-4 text-center"><div><p className="text-lg font-bold text-slate-900">{members.length}</p><p className="text-[10px] text-slate-400">Staff</p></div><div><p className="text-lg font-bold text-slate-900">{doctors.length}</p><p className="text-[10px] text-slate-400">Doctors</p></div><div><p className="text-lg font-bold text-slate-900">{todayVisits.length}</p><p className="text-[10px] text-slate-400">Today</p></div></div><div className="mt-4 flex items-center gap-3"><Avatar name={branch.manager} size="sm" /><div><p className="text-[10px] text-slate-400">Branch manager</p><p className="text-xs font-bold text-slate-700">{branch.manager}</p></div></div></div></article>
    })}</section>}

    {tab === 'staff' && <section><div className="mb-4 grid gap-3 sm:grid-cols-[1fr_14rem_auto]"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, role or NIC…" aria-label="Search staff" /><select className="input" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="all">All branches</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><p className="self-center text-xs font-semibold text-slate-500">{staff.length} employees</p></div><div className="table-shell overflow-x-auto"><table className="data-table min-w-[940px]"><thead><tr><th>Employee</th><th>Role</th><th>Home branch</th><th>Contact</th><th>Joined</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{staff.map((item) => <tr key={item.id}><td><button onClick={() => setSelectedStaff(item)} className="flex items-center gap-3 text-left"><Avatar name={item.name} /><div><p className="font-bold text-slate-800 hover:text-clinic-700">{item.name}</p><p className="text-[10px] text-slate-400">{item.employeeNo} · {item.nic}</p></div></button></td><td><p className="font-semibold text-slate-700">{item.role}</p>{item.specialties && <p className="mt-0.5 text-[10px] text-slate-400">{item.specialties.join(' · ')}</p>}</td><td>{data.branches.find((branch) => branch.id === item.branchId)?.name}</td><td><p>{item.phone}</p><p className="text-[10px] text-slate-400">{item.email}</p></td><td>{formatDate(item.joined)}</td><td><Badge>{item.isActive ? 'Active' : 'Inactive'}</Badge></td><td><Button variant="ghost" size="sm" onClick={() => toggleStaff(item.id)}>{item.isActive ? 'Deactivate' : 'Reactivate'}</Button></td></tr>)}</tbody></table></div><p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14} className="text-clinic-600" />Employee deactivation is a soft state change; appointments, invoices, and audit history remain intact.</p></section>}

    {tab === 'specialties' && <section><div className="mb-4"><h2 className="section-title">Doctor specialty assignments</h2><p className="mt-1 text-xs text-slate-500">Each doctor may serve in more than one specialty, but a specialty cannot be assigned twice.</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{specialties.map(([specialty, doctors]) => <article key={specialty} className="card p-5"><div className="flex items-center justify-between"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Stethoscope size={19} /></span><Badge tone="Active">{doctors.length} doctor{doctors.length === 1 ? '' : 's'}</Badge></div><h3 className="mt-4 text-base font-bold text-slate-800">{specialty}</h3><div className="mt-4 space-y-3 border-t border-slate-100 pt-4">{doctors.map((doctor) => <div key={doctor.id} className="flex items-center gap-3"><Avatar name={doctor.name} size="sm" /><div><p className="text-xs font-bold text-slate-700">{doctor.name}</p><p className="text-[10px] text-slate-400">{data.branches.find((branch) => branch.id === doctor.branchId)?.city} · {doctor.license}</p></div></div>)}</div></article>)}</div></section>}

    <Modal open={employeeOpen} onClose={() => setEmployeeOpen(false)} title="Add an employee" description="Create an active employee at exactly one home branch." size="lg">
      <form onSubmit={submitEmployee} className="space-y-5">{error && <RuleError error={error} />}<div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" required><input name="name" className="input" required /></Field><Field label="NIC" hint="Must be unique clinic-wide" required><input name="nic" className="input" required /></Field><Field label="Role" required><select name="role" className="input" value={employeeRole} onChange={(event) => setEmployeeRole(event.target.value as StaffMember['role'])}><option>Doctor</option><option>Manager</option><option>Nurse</option><option>Receptionist</option><option>Admin</option><option>Other</option></select></Field><Field label="Home branch" required><select name="branch" className="input">{data.branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></Field><Field label="Email" required><input name="email" type="email" className="input" required /></Field><Field label="Phone" required><input name="phone" type="tel" className="input" required /></Field><Field label="Hire date" required><input name="joined" type="date" className="input" max="2026-08-09" required /></Field></div>
        {employeeRole === 'Doctor' && <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4"><div className="flex items-center gap-2"><Stethoscope size={16} className="text-blue-700" /><h3 className="text-sm font-bold text-blue-900">Doctor credentials</h3></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Medical licence" required><input name="license" className="input" placeholder="SLMC-00000" required /></Field><Field label="Consultation fee (LKR)" required><input name="fee" type="number" min="0" className="input" required /></Field><div className="sm:col-span-2"><Field label="Specialties" hint="Comma-separated; at least one is required" required><input name="specialties" className="input" placeholder="General Medicine, Cardiology" required /></Field></div></div></div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEmployeeOpen(false)}>Cancel</Button><Button type="submit"><UserCog size={16} />Add employee</Button></div></form>
    </Modal>

    <Modal open={branchOpen} onClose={() => setBranchOpen(false)} title="Create a branch" description="The branch becomes selectable across patients, appointments, staff, and reports." size="sm">
      <form onSubmit={submitBranch} className="space-y-4">{error && <RuleError error={error} />}<Field label="Branch name" required><input name="name" className="input" placeholder="e.g. Negombo Coast" required /></Field><Field label="City" required><input name="city" className="input" required /></Field><Field label="Address" required><textarea name="address" className="input min-h-20" required /></Field><Field label="Contact phone" required><input name="phone" className="input" type="tel" required /></Field><Field label="Branch manager" hint="Must be an existing active Manager" required><select name="manager" className="input">{data.staff.filter((item) => item.role === 'Manager' && item.isActive).map((manager) => <option key={manager.id}>{manager.name}</option>)}</select></Field><InfoNote title="Manager integrity">A branch may briefly have no manager, but any assigned manager must reference an active employee with the Manager role.</InfoNote><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setBranchOpen(false)}>Cancel</Button><Button type="submit"><Building2 size={16} />Create branch</Button></div></form>
    </Modal>

    <Modal open={!!selectedStaff} onClose={() => setSelectedStaff(null)} title={selectedStaff?.name ?? 'Employee'} description={selectedStaff ? `${selectedStaff.employeeNo} · ${selectedStaff.role}` : undefined} size="sm">
      {selectedStaff && <div className="space-y-5"><div className="flex items-center gap-4 rounded-xl bg-clinic-900 p-4 text-white"><Avatar name={selectedStaff.name} size="lg" className="bg-white text-clinic-800 ring-0" /><div><p className="font-bold">{selectedStaff.name}</p><p className="mt-1 text-xs text-clinic-100/70">{data.branches.find((branch) => branch.id === selectedStaff.branchId)?.name}</p></div><div className="ml-auto"><Badge>{selectedStaff.isActive ? 'Active' : 'Inactive'}</Badge></div></div><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="label-caps">NIC</dt><dd className="mt-1 font-semibold text-slate-700">{selectedStaff.nic}</dd></div><div><dt className="label-caps">Joined</dt><dd className="mt-1 font-semibold text-slate-700">{formatDate(selectedStaff.joined)}</dd></div><div className="col-span-2"><dt className="label-caps">Contact</dt><dd className="mt-1 font-semibold text-slate-700">{selectedStaff.phone} · {selectedStaff.email}</dd></div>{selectedStaff.license && <><div><dt className="label-caps">Medical licence</dt><dd className="mt-1 font-semibold text-slate-700">{selectedStaff.license}</dd></div><div><dt className="label-caps">Default fee</dt><dd className="mt-1 font-semibold text-slate-700">{formatCurrency(selectedStaff.consultationFee ?? 0)}</dd></div></>}</dl>{selectedStaff.specialties && <div><p className="label-caps">Specialties</p><div className="mt-2 flex flex-wrap gap-2">{selectedStaff.specialties.map((specialty) => <Badge key={specialty} tone="Active">{specialty}</Badge>)}</div></div>}<Button variant="secondary" className="w-full" onClick={() => { toggleStaff(selectedStaff.id); setSelectedStaff(null) }}>{selectedStaff.isActive ? <CircleOff size={16} /> : <CheckCircle2 size={16} />}{selectedStaff.isActive ? 'Deactivate employee' : 'Reactivate employee'}</Button></div>}
    </Modal>
  </>
}
