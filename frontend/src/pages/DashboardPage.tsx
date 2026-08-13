import { Link } from 'react-router-dom'
import {
  ArrowUpRight, BarChart3, CalendarClock, CalendarDays, CheckCircle2, CircleDollarSign,
  ClipboardPlus, Clock3, CreditCard, HeartPulse, MapPin, Plus, ReceiptText,
  Sparkles, Stethoscope, TrendingUp, UserPlus, UsersRound, WalletCards,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useClinic } from '../context/ClinicContext'
import { DEMO_TODAY, formatCurrency } from '../lib/domain'
import { Avatar, Badge, Button, StatCard } from '../components/ui'
import receptionCareImage from '../assets/clinical/appointment-care.webp'
import clinicianCareImage from '../assets/clinical/patient-consultation.webp'
import managerCareImage from '../assets/clinical/reception-corridor.webp'
import financeCareImage from '../assets/clinical/finance-calculator.webp'

const weeklyData = [
  { day: 'Mon', visits: 31 }, { day: 'Tue', visits: 38 }, { day: 'Wed', visits: 29 },
  { day: 'Thu', visits: 42 }, { day: 'Fri', visits: 36 }, { day: 'Sat', visits: 46 }, { day: 'Sun', visits: 18 },
]

const roleCopy = {
  Receptionist: {
    eyebrow: 'Reception operations',
    title: 'Reception dashboard',
    description: 'Manage today’s arrivals, appointments, walk-ins, and patient registration from this work area.',
  },
  Clinician: {
    eyebrow: 'Clinical operations',
    title: 'Clinical dashboard',
    description: 'Review assigned patients, today’s consultation sequence, and clinical records awaiting completion.',
  },
  Manager: {
    eyebrow: 'Branch operations',
    title: 'Branch management dashboard',
    description: 'Review branch activity, appointment completion, service demand, and operational exceptions.',
  },
  Admin: {
    eyebrow: 'Administration and finance',
    title: 'Finance administration dashboard',
    description: 'Review clinic-wide collections, outstanding balances, insurance claims, and administrative actions.',
  },
} as const

const roleShowcaseImages = {
  Receptionist: receptionCareImage,
  Clinician: clinicianCareImage,
  Manager: managerCareImage,
  Admin: financeCareImage,
} as const

export default function DashboardPage() {
  const { data, user } = useClinic()
  if (!user) return null

  const visibleAppointments = data.appointments.filter((appointment) => appointment.date === DEMO_TODAY && (user.role !== 'Clinician' || appointment.doctorId === user.id) && (user.branchId === 'all' || user.role === 'Clinician' || appointment.branchId === user.branchId))
  const todayScheduled = visibleAppointments.filter((item) => item.status === 'Scheduled').length
  const todayCompleted = visibleAppointments.filter((item) => item.status === 'Completed').length
  const walkIns = visibleAppointments.filter((item) => item.source === 'Walk-in').length
  const outstandingTotal = data.invoices.reduce((sum, invoice) => sum + invoice.patientPayable - invoice.amountPaid, 0)
  const pendingClaims = data.invoices.flatMap((invoice) => invoice.claims).filter((claim) => claim.status === 'Pending').length
  const clinicalAwaiting = data.appointments.filter((appointment) => appointment.status === 'Completed' && !data.clinicalRecords.some((record) => record.appointmentId === appointment.id) && (user.role !== 'Clinician' || appointment.doctorId === user.id)).length
  const firstName = user.name.replace('Dr. ', '').split(' ')[0]
  const branchName = user.branchId === 'all' ? 'All branches' : data.branches.find((branch) => branch.id === user.branchId)?.name ?? 'MedSync Clinics'
  const copy = roleCopy[user.role]

  const quickActions = user.role === 'Receptionist'
    ? [{ label: 'Book appointment', to: '/appointments', icon: CalendarDays }, { label: 'Register patient', to: '/patients', icon: UserPlus }]
    : user.role === 'Clinician'
      ? [{ label: 'Open worklist', to: '/clinical', icon: ClipboardPlus }, { label: 'View schedule', to: '/appointments', icon: CalendarDays }]
      : user.role === 'Manager'
        ? [{ label: 'View branch report', to: '/reports', icon: BarChart3 }]
        : [{ label: 'Review invoices', to: '/finance', icon: CreditCard }, { label: 'Open reports', to: '/reports', icon: BarChart3 }]

  return <>
    <section className={`role-home-hero role-home-${user.role.toLowerCase()}`}>
      <span className="hero-orbit hero-orbit-one" aria-hidden="true" />
      <span className="hero-orbit hero-orbit-two" aria-hidden="true" />
      <div className="role-home-copy">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.13em] text-[var(--portal-accent)]">
          <span className="live-pulse" />{copy.eyebrow} · Sunday, 9 August
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-500">Good morning, {firstName}</p>
        <h1 className="mt-1 max-w-[680px] font-display text-[38px] font-semibold leading-[1.04] tracking-[-.035em] text-slate-900 sm:text-[48px]">{copy.title}</h1>
        <p className="mt-4 max-w-[590px] text-[14px] leading-6 text-slate-600 sm:text-[15px]">{copy.description}</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {quickActions.map(({ label, to, icon: Icon }, index) => <Link key={to + label} to={to}><Button variant={index === 0 ? 'primary' : 'secondary'}><Icon size={16} />{label}{index === 0 && <ArrowUpRight size={15} />}</Button></Link>)}
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5"><MapPin size={13} className="text-[var(--portal-accent)]" />{branchName}</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-600" />Systems operating normally</span>
        </div>
      </div>

      <div className="role-showcase" aria-label={`${user.role} live overview`}>
        <img className="role-showcase-photo" src={roleShowcaseImages[user.role]} alt="" aria-hidden="true" loading="eager" />
        {user.role === 'Receptionist' && <>
          <div className="showcase-heading"><span><Sparkles size={14} />Front desk now</span><strong>{visibleAppointments.length} visits</strong></div>
          <div className="schedule-thread" aria-hidden="true" />
          {visibleAppointments.slice(0, 3).map((appointment, index) => {
            const patient = data.patients.find((item) => item.id === appointment.patientId)
            return <div className={`floating-appointment appointment-${index + 1}`} key={appointment.id}>
              <div className="appointment-time"><strong>{appointment.start}</strong><span>{appointment.end}</span></div>
              <Avatar name={patient?.name ?? 'Patient'} size="sm" />
              <div className="min-w-0 flex-1"><p>{patient?.name}</p><span>{appointment.reason}</span></div>
              <Badge>{appointment.status}</Badge>
            </div>
          })}
          <div className="showcase-foot"><span><span className="live-pulse" /> Arrival board synced</span><strong>Next gap 11:30</strong></div>
        </>}

        {user.role === 'Clinician' && <>
          <div className="showcase-heading"><span><Stethoscope size={14} />Today’s care path</span><strong>Live</strong></div>
          <div className="clinical-focus">
            <div className="clinical-ring"><HeartPulse size={29} /><span>4 of 5</span><small>prepared</small></div>
            <div className="clinical-wave" aria-hidden="true"><svg viewBox="0 0 270 70" role="img" aria-label="Clinical activity line"><path d="M2 43h45l12-2 11-28 18 49 13-31 15 12h38l10-8 9 8h95" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          </div>
          <div className="next-patient-note"><span>Next patient · 09:15</span><strong>Suresh Balasubramaniam</strong><small>Walk-in · Dizziness and fatigue</small></div>
          <div className="showcase-foot"><span><CheckCircle2 size={13} /> 3 notes signed</span><strong>{clinicalAwaiting} to complete</strong></div>
        </>}

        {user.role === 'Manager' && <>
          <div className="showcase-heading"><span><TrendingUp size={14} />Colombo Central</span><strong>This week</strong></div>
          <div className="manager-insight">
            <div className="completion-dial"><div><strong>78%</strong><span>visit completion</span></div></div>
            <div className="flow-bars">{weeklyData.slice(0, 6).map((day) => <div key={day.day}><span>{day.day}</span><i style={{ height: `${Math.max(22, day.visits * 1.45)}px` }} /><strong>{day.visits}</strong></div>)}</div>
          </div>
          <div className="showcase-foot"><span><UsersRound size={13} /> 240 weekly visits</span><strong>+8.4% trend</strong></div>
        </>}

        {user.role === 'Admin' && <>
          <div className="showcase-heading"><span><CircleDollarSign size={14} />Clinic-wide collections</span><strong>August</strong></div>
          <div className="finance-figure"><span>Collected this month</span><strong>{formatCurrency(168400)}</strong><small><TrendingUp size={12} /> 8.4% above last month</small></div>
          <svg className="finance-spark" viewBox="0 0 420 105" role="img" aria-label="Monthly collections trend"><defs><linearGradient id="financeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".25" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs><path d="M0 82 C36 76,51 65,83 70 S132 91,162 65 S207 39,240 48 S289 75,323 37 S376 29,420 11 L420 105 L0 105Z" fill="url(#financeFill)" /><path d="M0 82 C36 76,51 65,83 70 S132 91,162 65 S207 39,240 48 S289 75,323 37 S376 29,420 11" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" /></svg>
          <div className="finance-notes"><span><strong>{pendingClaims || 1}</strong> claim needs review</span><span><strong>{formatCurrency(outstandingTotal)}</strong> open balance</span></div>
        </>}
      </div>
    </section>

    {user.role === 'Admin' ? <div className="metric-grid mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Outstanding balance" value={formatCurrency(outstandingTotal)} detail="Across 3 open patient invoices" icon={WalletCards} accent="coral" />
      <StatCard label="Pending claims" value={pendingClaims || 1} detail="LKR 3,000 awaiting review" icon={ReceiptText} accent="blue" />
      <StatCard label="Collected this month" value={formatCurrency(168400)} detail="8.4% above last month" icon={TrendingUp} accent="teal" />
      <StatCard label="Visits today" value={data.appointments.filter((item) => item.date === DEMO_TODAY).length} detail={`${data.appointments.filter((item) => item.date === DEMO_TODAY && item.status === 'Completed').length} completed clinic-wide`} icon={UsersRound} accent="amber" />
    </div> : <div className="metric-grid mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Today's appointments" value={visibleAppointments.length} detail={`${todayScheduled} still scheduled`} icon={CalendarDays} accent="blue" />
      <StatCard label="Completed" value={todayCompleted} detail={user.role === 'Clinician' ? 'Consultations finished today' : 'Patients seen at your branch'} icon={CheckCircle2} accent="teal" />
      <StatCard label={user.role === 'Clinician' ? 'Records to finish' : 'Walk-ins'} value={user.role === 'Clinician' ? clinicalAwaiting : walkIns} detail={user.role === 'Clinician' ? 'Completed visits awaiting care notes' : 'Included in the live schedule'} icon={user.role === 'Clinician' ? ClipboardPlus : CalendarClock} accent="amber" />
      <StatCard label={user.role === 'Manager' ? 'Completion rate' : 'Next available'} value={user.role === 'Manager' ? '78%' : '11:30'} detail={user.role === 'Manager' ? 'For this week at Colombo Central' : 'Earliest 30-minute doctor slot'} icon={user.role === 'Manager' ? TrendingUp : Clock3} accent="coral" />
    </div>}

    <div className="mt-7 grid gap-6 xl:grid-cols-[1.55fr_.85fr]">
      <section className="flow-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 pb-3 pt-5 sm:px-6 sm:pt-6"><div><p className="label-caps text-[var(--portal-accent)]">Live patient flow</p><h2 className="mt-1 section-title">{user.role === 'Clinician' ? 'My appointments' : 'Today’s appointment flow'}</h2><p className="mt-1 text-xs text-slate-500">Sunday schedule · {branchName}</p></div><Link to="/appointments" className="inline-flex items-center gap-1 text-xs font-bold text-[var(--portal-accent)] hover:underline">Full schedule <ArrowUpRight size={13} /></Link></div>
        <div className="appointment-flow-list px-3 pb-3 sm:px-4 sm:pb-4">
          {visibleAppointments.slice(0, 5).map((appointment, index) => {
            const patient = data.patients.find((item) => item.id === appointment.patientId)!
            const doctor = data.staff.find((item) => item.id === appointment.doctorId)!
            return <div key={appointment.id} className="appointment-flow-row">
              <div className="flow-time"><span className={index === 0 ? 'is-current' : ''} /><div><p>{appointment.start}</p><small>{appointment.end}</small></div></div>
              <Avatar name={patient.name} />
              <div className="min-w-[10rem] flex-1"><p className="truncate text-sm font-bold text-slate-800">{patient.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{appointment.reason}</p></div>
              <div className="hidden min-w-40 xl:block"><p className="text-xs font-semibold text-slate-700">{doctor.name}</p><p className="text-[10px] text-slate-400">{doctor.specialties?.[0]}</p></div>
              <div className="ml-auto flex items-center gap-2"><Badge>{appointment.source}</Badge><Badge>{appointment.status}</Badge></div>
            </div>
          })}
        </div>
        {visibleAppointments.length === 0 && <p className="px-6 py-14 text-center text-sm text-slate-500">No appointments match this workspace today.</p>}
      </section>

      <div className="insight-column space-y-6">
        <section className="activity-surface">
          <div className="flex items-start justify-between"><div><p className="label-caps text-[var(--portal-accent)]">Weekly activity</p><h2 className="mt-1 section-title">Patient visits</h2></div><span className="activity-total">240 <small>total</small></span></div>
          <div className="mt-5 h-44" aria-label="Bar chart of patient visits this week">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={weeklyData} margin={{ top: 5, right: 0, bottom: 0, left: -28 }}><CartesianGrid vertical={false} stroke="#EAEFEF" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#4B5D66', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#7C8B92', fontSize: 10 }} /><Tooltip cursor={{ fill: '#EFF3F3' }} contentStyle={{ borderRadius: 12, border: '1px solid #DCE4E4', boxShadow: '0 8px 24px rgba(18,35,43,.08)', fontSize: 12 }} /><Bar dataKey="visits" fill="var(--portal-accent)" radius={[7, 7, 2, 2]} maxBarSize={22} /></BarChart></ResponsiveContainer>
          </div>
        </section>
        <section className="attention-surface">
          <div className="flex items-center justify-between"><div><p className="label-caps text-[var(--portal-accent)]">Needs attention</p><h2 className="mt-1 text-base font-bold text-slate-800">Before your next break</h2></div><Clock3 size={19} className="text-[var(--portal-accent)]" /></div>
          <div className="mt-4 space-y-1">
            {(user.role === 'Admin' ? [
              { title: '3 invoices have open balances', detail: formatCurrency(outstandingTotal), to: '/finance', tone: 'bg-red-50 text-red-700' },
              { title: '1 insurance claim needs review', detail: 'Submitted today', to: '/finance', tone: 'bg-blue-50 text-blue-700' },
            ] : user.role === 'Clinician' ? [
              { title: `${clinicalAwaiting} consultation record pending`, detail: 'Complete before end of shift', to: '/clinical', tone: 'bg-amber-50 text-amber-800' },
              { title: 'Next patient at 09:15', detail: 'Walk-in · Dizziness and fatigue', to: '/appointments', tone: 'bg-violet-50 text-violet-700' },
            ] : [
              { title: 'Walk-in waiting since 08:55', detail: 'Suresh Balasubramaniam', to: '/appointments', tone: 'bg-violet-50 text-violet-700' },
              { title: '2 appointments need confirmation', detail: 'Before 11:00', to: '/appointments', tone: 'bg-amber-50 text-amber-800' },
            ]).map((item) => <Link key={item.title} to={item.to} className="attention-row"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${item.tone}`}><Clock3 size={15} /></span><span className="min-w-0"><span className="block text-xs font-bold text-slate-800">{item.title}</span><span className="mt-0.5 block text-[11px] text-slate-500">{item.detail}</span></span><ArrowUpRight size={14} className="ml-auto text-slate-300" /></Link>)}
          </div>
        </section>
      </div>
    </div>

    {user.role === 'Receptionist' && <div className="walkin-callout mt-7"><span className="walkin-orbit" aria-hidden="true" /><div className="relative z-[1]"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-white/60">Quick walk-in</p><h2 className="mt-1 font-display text-2xl font-semibold text-white">A patient just arrived?</h2><p className="mt-1 text-sm text-white/65">Create an immediate appointment with the same availability safeguards.</p></div><Link className="relative z-[1]" to="/appointments"><Button className="bg-white text-clinic-900 hover:bg-clinic-50"><Plus size={17} />Add walk-in</Button></Link></div>}
  </>
}
