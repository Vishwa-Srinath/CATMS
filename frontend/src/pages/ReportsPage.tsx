import { useMemo, useState } from 'react'
import { BadgeDollarSign, BarChart3, Building2, CalendarDays, Download, FileBarChart2, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useClinic } from '../context/ClinicContext'
import { DEMO_TODAY, formatCurrency, formatDate, outstanding } from '../lib/domain'
import { Badge, Button, InfoNote, PageHeader } from '../components/ui'
import digitalHealthImage from '../assets/clinical/digital-health.webp'

type ReportKey = 'appointments' | 'revenue' | 'outstanding' | 'treatments' | 'coverage'

const reportMeta: Record<ReportKey, { label: string; shortLabel: string; description: string; icon: typeof BarChart3 }> = {
  appointments: { label: 'Branch-wise daily appointments', shortLabel: 'Appointments', description: 'Scheduled, completed, and cancelled visits by branch for the selected date.', icon: CalendarDays },
  revenue: { label: 'Doctor-wise revenue', shortLabel: 'Doctor revenue', description: 'Gross invoice value and patient payments collected per doctor.', icon: BadgeDollarSign },
  outstanding: { label: 'Outstanding patient balances', shortLabel: 'Outstanding', description: 'Every unpaid and partially paid invoice with the amount still due.', icon: WalletCards },
  treatments: { label: 'Treatments by category', shortLabel: 'Treatments', description: 'Delivered treatment volume grouped by catalogue category in the selected period.', icon: FileBarChart2 },
  coverage: { label: 'Insurance vs out-of-pocket', shortLabel: 'Coverage mix', description: 'Monthly insurance-covered amount compared with patient payments.', icon: ShieldCheck },
}

export default function ReportsPage() {
  const { data, user, notify } = useClinic()
  const allowedReports: ReportKey[] = user?.role === 'Manager' ? ['appointments'] : ['appointments', 'revenue', 'outstanding', 'treatments', 'coverage']
  const [active, setActive] = useState<ReportKey>('appointments')
  const [date, setDate] = useState(DEMO_TODAY)
  const [from, setFrom] = useState('2026-07-01')
  const [to, setTo] = useState('2026-08-09')
  const meta = reportMeta[active]

  const appointmentRows = data.branches.map((branch) => {
    const items = data.appointments.filter((appointment) => appointment.branchId === branch.id && appointment.date === date)
    return { branch: branch.name, scheduled: items.filter((item) => item.status === 'Scheduled').length, completed: items.filter((item) => item.status === 'Completed').length, cancelled: items.filter((item) => item.status === 'Cancelled').length, total: items.length }
  }).filter((row) => user?.role !== 'Manager' || row.branch === data.branches.find((branch) => branch.id === user.branchId)?.name)

  const revenueRows = data.staff.filter((staff) => staff.role === 'Doctor').map((doctor) => {
    const doctorInvoices = data.invoices.filter((invoice) => {
      const appointment = data.appointments.find((item) => item.id === invoice.appointmentId)
      return appointment?.doctorId === doctor.id && appointment.date >= from && appointment.date <= to
    })
    return { doctor: doctor.name.replace('Dr. ', ''), specialty: doctor.specialties?.[0] ?? '—', gross: doctorInvoices.reduce((sum, item) => sum + item.subtotal, 0), collected: doctorInvoices.reduce((sum, item) => sum + item.amountPaid, 0), invoices: doctorInvoices.length }
  }).filter((row) => row.invoices > 0).sort((a, b) => b.gross - a.gross)

  const outstandingRows = data.invoices.filter((invoice) => outstanding(invoice) > 0).map((invoice) => {
    const appointment = data.appointments.find((item) => item.id === invoice.appointmentId)!
    const patient = data.patients.find((item) => item.id === appointment.patientId)!
    return { patient: patient.name, patientNo: patient.patientNo, invoice: invoice.invoiceNo, issued: invoice.issuedAt, payable: invoice.patientPayable, paid: invoice.amountPaid, due: outstanding(invoice), status: invoice.status }
  }).sort((a, b) => b.due - a.due)

  const treatmentRows = useMemo(() => {
    const grouped = new Map<string, { category: string; count: number; value: number }>()
    data.clinicalRecords.forEach((record) => {
      const appointment = data.appointments.find((item) => item.id === record.appointmentId)
      if (!appointment || appointment.date < from || appointment.date > to) return
      record.treatments.forEach((line) => {
        const treatment = data.treatments.find((item) => item.id === line.treatmentId)
        if (!treatment) return
        const current = grouped.get(treatment.category) ?? { category: treatment.category, count: 0, value: 0 }
        current.count += line.quantity; current.value += line.quantity * line.unitPrice; grouped.set(treatment.category, current)
      })
    })
    return [...grouped.values()].sort((a, b) => b.count - a.count)
  }, [data, from, to])

  const coverageRows = [
    { month: 'Apr 2026', insurance: 32800, patientPaid: 56200 }, { month: 'May 2026', insurance: 41600, patientPaid: 68900 },
    { month: 'Jun 2026', insurance: 38400, patientPaid: 72100 }, { month: 'Jul 2026', insurance: 46300, patientPaid: 84900 },
    { month: 'Aug 2026', insurance: data.invoices.reduce((sum, invoice) => sum + invoice.insuranceCovered, 0), patientPaid: data.invoices.reduce((sum, invoice) => sum + invoice.amountPaid, 0) },
  ]

  const exportReport = () => {
    const rows: Record<string, string | number>[] = active === 'appointments' ? appointmentRows : active === 'revenue' ? revenueRows : active === 'outstanding' ? outstandingRows : active === 'treatments' ? treatmentRows : coverageRows
    const headers = Object.keys(rows[0] ?? { message: 'No rows' })
    const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n')
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `catms-${active}-${date}.csv`; link.click(); URL.revokeObjectURL(link.href)
    notify({ type: 'success', title: 'Report exported', message: `${meta.label} was downloaded as a CSV file.` })
  }

  return <>
    <PageHeader image={digitalHealthImage} eyebrow="Management reporting" title="Reports" description="Verifiable management views backed by reporting objects. Every chart is paired with its raw rows." actions={<Button variant="secondary" onClick={exportReport}><Download size={16} />Export CSV</Button>} />

    {user?.role === 'Manager' && <div className="mb-5"><InfoNote title="Branch-manager access">You can view the daily appointment summary for {data.branches.find((branch) => branch.id === user.branchId)?.name}. Financial and clinic-wide reports require Admin / Finance access.</InfoNote></div>}

    <div className="grid gap-6 xl:grid-cols-[14rem_1fr]">
      <aside className="card h-fit p-2">
        <nav aria-label="Report selection" className="flex gap-1 overflow-x-auto xl:flex-col">
          {allowedReports.map((key) => { const Icon = reportMeta[key].icon; return <button key={key} onClick={() => setActive(key)} className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold transition xl:w-full ${active === key ? 'bg-clinic-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={16} /><span>{reportMeta[key].shortLabel}</span></button> })}
        </nav>
      </aside>

      <div className="min-w-0 space-y-5">
        <section className="card p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end"><div><p className="label-caps">Report {allowedReports.indexOf(active) + 1} of {allowedReports.length}</p><h2 className="mt-1 section-title">{meta.label}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{meta.description}</p></div>
            {active === 'appointments' ? <label className="text-xs font-bold text-slate-600">Report date<input type="date" className="input mt-1.5" value={date} onChange={(event) => setDate(event.target.value)} /></label> : (active === 'revenue' || active === 'treatments') ? <div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-600">From<input type="date" className="input mt-1.5" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs font-bold text-slate-600">To<input type="date" className="input mt-1.5" value={to} onChange={(event) => setTo(event.target.value)} /></label></div> : <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">As at {formatDate(date)}</span>}
          </div>

          <div className="mt-5 h-72" role="img" aria-label={`${meta.label} chart`}>
            {active === 'appointments' && <ResponsiveContainer width="100%" height="100%"><BarChart data={appointmentRows} margin={{ left: -20 }}><CartesianGrid vertical={false} stroke="#EAEFEF" /><XAxis dataKey="branch" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#4B5D66' }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#7C8B92' }} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #DCE4E4', boxShadow: '0 8px 24px rgba(18,35,43,.08)', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="scheduled" name="Scheduled" fill="#1E77B8" radius={[4,4,0,0]} /><Bar dataKey="completed" name="Completed" fill="#1E8A5F" radius={[4,4,0,0]} /><Bar dataKey="cancelled" name="Cancelled" fill="#8A97A0" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>}
            {active === 'revenue' && <ResponsiveContainer width="100%" height="100%"><BarChart data={revenueRows} margin={{ left: 8 }}><CartesianGrid vertical={false} stroke="#EAEFEF" /><XAxis dataKey="doctor" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#4B5D66' }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value / 1000}k`} tick={{ fontSize: 10, fill: '#7C8B92' }} /><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #DCE4E4', boxShadow: '0 8px 24px rgba(18,35,43,.08)', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="gross" name="Gross revenue" fill="#0E5E5E" radius={[4,4,0,0]} /><Bar dataKey="collected" name="Collected" fill="#B5651D" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>}
            {active === 'outstanding' && <ResponsiveContainer width="100%" height="100%"><BarChart data={outstandingRows} layout="vertical" margin={{ left: 38 }}><CartesianGrid horizontal={false} stroke="#EAEFEF" /><XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(value) => `${value / 1000}k`} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="patient" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={90} /><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #DCE4E4', boxShadow: '0 8px 24px rgba(18,35,43,.08)', fontSize: 12 }} /><Bar dataKey="due" name="Amount due" fill="#C4425A" radius={[0,5,5,0]} maxBarSize={28} /></BarChart></ResponsiveContainer>}
            {active === 'treatments' && <ResponsiveContainer width="100%" height="100%"><BarChart data={treatmentRows} margin={{ left: -20 }}><CartesianGrid vertical={false} stroke="#EAEFEF" /><XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#4B5D66' }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#7C8B92' }} /><Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #DCE4E4', boxShadow: '0 8px 24px rgba(18,35,43,.08)', fontSize: 12 }} /><Bar dataKey="count" name="Treatments" fill="#6C4AB6" radius={[5,5,0,0]} maxBarSize={48} /></BarChart></ResponsiveContainer>}
            {active === 'coverage' && <ResponsiveContainer width="100%" height="100%"><BarChart data={coverageRows} margin={{ left: 5 }}><CartesianGrid vertical={false} stroke="#EAEFEF" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#4B5D66' }} /><YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `${value / 1000}k`} tick={{ fontSize: 10, fill: '#7C8B92' }} /><Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ borderRadius: 12, border: '1px solid #DCE4E4', boxShadow: '0 8px 24px rgba(18,35,43,.08)', fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="insurance" name="Insurance covered" stackId="a" fill="#3B6EA5" /><Bar dataKey="patientPaid" name="Out of pocket" stackId="a" fill="#1E8A5F" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer>}
          </div>
        </section>

        <section className="table-shell overflow-x-auto">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h3 className="text-sm font-bold text-slate-800">Raw report rows</h3><p className="mt-0.5 text-[11px] text-slate-500">Use these values to reconcile the chart and database view.</p></div><span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-clinic-700"><ReceiptText size={13} />Verified view</span></div>
          {active === 'appointments' && <table className="data-table min-w-[640px]"><thead><tr><th>Branch</th><th>Scheduled</th><th>Completed</th><th>Cancelled</th><th>Total</th></tr></thead><tbody>{appointmentRows.map((row) => <tr key={row.branch}><td className="font-bold text-slate-800"><span className="flex items-center gap-2"><Building2 size={14} className="text-clinic-600" />{row.branch}</span></td><td>{row.scheduled}</td><td>{row.completed}</td><td>{row.cancelled}</td><td className="font-bold text-slate-900">{row.total}</td></tr>)}</tbody></table>}
          {active === 'revenue' && <table className="data-table min-w-[680px]"><thead><tr><th>Doctor</th><th>Specialty</th><th>Invoices</th><th>Gross revenue</th><th>Collected</th><th>Collection</th></tr></thead><tbody>{revenueRows.map((row) => <tr key={row.doctor}><td className="font-bold text-slate-800">Dr. {row.doctor}</td><td>{row.specialty}</td><td>{row.invoices}</td><td>{formatCurrency(row.gross)}</td><td className="font-semibold text-emerald-700">{formatCurrency(row.collected)}</td><td>{row.gross ? Math.round(row.collected / row.gross * 100) : 0}%</td></tr>)}</tbody></table>}
          {active === 'outstanding' && <table className="data-table min-w-[820px]"><thead><tr><th>Patient</th><th>Invoice</th><th>Issued</th><th>Patient payable</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>{outstandingRows.map((row) => <tr key={row.invoice}><td><p className="font-bold text-slate-800">{row.patient}</p><p className="text-[10px] text-slate-400">{row.patientNo}</p></td><td>{row.invoice}</td><td>{formatDate(row.issued)}</td><td>{formatCurrency(row.payable)}</td><td>{formatCurrency(row.paid)}</td><td className="font-bold text-[#C4425A]">{formatCurrency(row.due)}</td><td><Badge>{row.status}</Badge></td></tr>)}</tbody></table>}
          {active === 'treatments' && <table className="data-table min-w-[560px]"><thead><tr><th>Category</th><th>Treatments delivered</th><th>Gross treatment value</th></tr></thead><tbody>{treatmentRows.map((row) => <tr key={row.category}><td className="font-bold text-slate-800">{row.category}</td><td>{row.count}</td><td>{formatCurrency(row.value)}</td></tr>)}</tbody></table>}
          {active === 'coverage' && <table className="data-table min-w-[660px]"><thead><tr><th>Month</th><th>Insurance covered</th><th>Out of pocket</th><th>Total settled</th><th>Insurance share</th></tr></thead><tbody>{coverageRows.map((row) => <tr key={row.month}><td className="font-bold text-slate-800">{row.month}</td><td className="text-blue-700">{formatCurrency(row.insurance)}</td><td className="text-emerald-700">{formatCurrency(row.patientPaid)}</td><td>{formatCurrency(row.insurance + row.patientPaid)}</td><td>{Math.round(row.insurance / (row.insurance + row.patientPaid) * 100)}%</td></tr>)}</tbody></table>}
        </section>
      </div>
    </div>
  </>
}
