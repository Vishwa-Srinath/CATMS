import { useState, type FormEvent } from 'react'
import { Banknote, CheckCircle2, CircleDollarSign, Clock3, CreditCard, FileCheck2, FilePlus2, History, Landmark, MoreHorizontal, Plus, ReceiptText, ShieldCheck, WalletCards } from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import { ClinicRuleError, formatCurrency, formatDate, outstanding } from '../lib/domain'
import type { Claim, Invoice } from '../types'
import { Avatar, Badge, Button, EmptyState, Field, InfoNote, Modal, PageHeader, RuleError, SearchInput, StatCard } from '../components/ui'
import financeImage from '../assets/clinical/finance-calculator.webp'
import medicationImage from '../assets/clinical/medication-flatlay.webp'

type Tab = 'invoices' | 'claims' | 'catalogue'

export default function FinancePage() {
  const { data, postPayment, submitClaim, updateClaimStatus, addTreatment, toggleTreatment, notify } = useClinic()
  const [tab, setTab] = useState<Tab>('invoices')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [treatmentOpen, setTreatmentOpen] = useState(false)
  const [claimReview, setClaimReview] = useState<{ invoice: Invoice; claim: Claim } | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const getAppointment = (item: Invoice) => data.appointments.find((appointment) => appointment.id === item.appointmentId)!
  const getPatient = (item: Invoice) => data.patients.find((patient) => patient.id === getAppointment(item).patientId)!
  const invoices = data.invoices.filter((item) => {
    const patient = getPatient(item)
    const needle = query.toLowerCase()
    return (!needle || item.invoiceNo.toLowerCase().includes(needle) || patient.name.toLowerCase().includes(needle) || patient.patientNo.toLowerCase().includes(needle)) && (status === 'all' || item.status === status)
  })
  const claims = data.invoices.flatMap((item) => item.claims.map((claim) => ({ invoice: item, claim })))
  const totalOutstanding = data.invoices.reduce((sum, item) => sum + outstanding(item), 0)
  const collected = data.invoices.reduce((sum, item) => sum + item.amountPaid, 0)
  const pendingClaims = claims.filter((item) => item.claim.status === 'Pending')

  const handleError = (caught: unknown, title: string) => { setError(caught instanceof Error ? caught : new Error('The operation could not be completed.')); if (caught instanceof ClinicRuleError) notify({ type: 'error', title, message: caught.message, code: caught.code }) }

  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!invoice) return; setError(null)
    const form = new FormData(event.currentTarget)
    try { postPayment(invoice.id, Number(form.get('amount')), form.get('method') as 'Cash' | 'Card' | 'Online' | 'Insurance', String(form.get('reference'))); setPaymentOpen(false); setInvoice(null) } catch (caught) { handleError(caught, 'Payment rejected') }
  }

  const submitInsuranceClaim = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!invoice) return; setError(null)
    const patient = getPatient(invoice)
    const form = new FormData(event.currentTarget)
    const policyNo = String(form.get('policy'))
    const policy = patient.policies.find((item) => item.policyNo === policyNo)
    try { submitClaim(invoice.id, policyNo, policy?.provider ?? '', Number(form.get('amount'))); setClaimOpen(false); setInvoice(null) } catch (caught) { handleError(caught, 'Claim rejected') }
  }

  const submitClaimReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!claimReview) return
    const form = new FormData(event.currentTarget)
    updateClaimStatus(claimReview.invoice.id, claimReview.claim.id, form.get('status') as Claim['status'], Number(form.get('approvedAmount')))
    setClaimReview(null)
  }

  const submitTreatment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null)
    const form = new FormData(event.currentTarget)
    try { addTreatment({ serviceCode: String(form.get('code')).toUpperCase(), name: String(form.get('name')), category: String(form.get('category')), price: Number(form.get('price')), duration: Number(form.get('duration')) }); setTreatmentOpen(false) } catch (caught) { handleError(caught, 'Catalogue update rejected') }
  }

  return <>
    <PageHeader image={tab === 'catalogue' ? medicationImage : financeImage} eyebrow="Finance workspace" title="Billing & claims" description="Review database-generated invoices, post partial or full payments, and track internal insurance claims." actions={tab === 'catalogue' ? <Button onClick={() => { setError(null); setTreatmentOpen(true) }}><Plus size={16} />Add service</Button> : undefined} />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Open balances" value={formatCurrency(totalOutstanding)} detail="Across unpaid and partially paid invoices" icon={WalletCards} accent="coral" />
      <StatCard label="Collected" value={formatCurrency(collected)} detail="Recorded in the current demo period" icon={CircleDollarSign} accent="teal" />
      <StatCard label="Claims pending" value={pendingClaims.length} detail={`${formatCurrency(pendingClaims.reduce((sum, item) => sum + item.claim.claimedAmount, 0))} under review`} icon={Clock3} accent="blue" />
      <StatCard label="Collection rate" value="68.4%" detail="Patient-payable value collected" icon={Landmark} accent="amber" />
    </div>

    <div className="mt-6 flex max-w-lg tab-list"><button className={`tab-button flex-1 ${tab === 'invoices' ? 'tab-button-active' : ''}`} onClick={() => setTab('invoices')}>Invoices</button><button className={`tab-button flex-1 ${tab === 'claims' ? 'tab-button-active' : ''}`} onClick={() => setTab('claims')}>Insurance claims</button><button className={`tab-button flex-1 ${tab === 'catalogue' ? 'tab-button-active' : ''}`} onClick={() => setTab('catalogue')}>Treatment catalogue</button></div>

    {tab === 'invoices' && <section className="mt-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_13rem_auto]"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice or patient…" aria-label="Search invoices" /><select className="input" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Invoice status"><option value="all">All payment statuses</option><option>Unpaid</option><option value="PartiallyPaid">Partially paid</option><option>Paid</option></select><p className="self-center text-xs font-semibold text-slate-500">{invoices.length} invoices</p></div>
      {invoices.length ? <div className="table-shell overflow-x-auto"><table className="data-table min-w-[1000px]"><thead><tr><th>Invoice</th><th>Patient</th><th>Issued</th><th>Subtotal</th><th>Covered</th><th>Paid</th><th>Balance</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{invoices.map((item) => {
        const patient = getPatient(item)
        return <tr key={item.id}><td><button onClick={() => setInvoice(item)} className="font-bold text-clinic-700 hover:underline">{item.invoiceNo}</button><p className="mt-0.5 text-[10px] text-slate-400">{getAppointment(item).reference}</p></td><td><div className="flex items-center gap-2"><Avatar name={patient.name} size="sm" /><div><p className="font-semibold text-slate-800">{patient.name}</p><p className="text-[10px] text-slate-400">{patient.patientNo}</p></div></div></td><td>{formatDate(item.issuedAt)}</td><td className="font-semibold text-slate-700">{formatCurrency(item.subtotal)}</td><td className="text-blue-700">{formatCurrency(item.insuranceCovered)}</td><td className="text-emerald-700">{formatCurrency(item.amountPaid)}</td><td className="font-bold text-slate-900">{formatCurrency(outstanding(item))}</td><td><Badge>{item.status}</Badge></td><td><div className="flex gap-1">{outstanding(item) > 0 && <Button size="sm" onClick={() => { setInvoice(item); setPaymentOpen(true); setError(null) }}><Banknote size={14} />Payment</Button>}<button onClick={() => setInvoice(item)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label={`View ${item.invoiceNo}`}><MoreHorizontal size={17} /></button></div></td></tr>
      })}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No matching invoices" description="Adjust the search or payment-status filter." />}
    </section>}

    {tab === 'claims' && <section className="mt-5">
      <div className="mb-4 flex items-center justify-between"><div><h2 className="section-title">Claim tracker</h2><p className="mt-1 text-xs text-slate-500">Internal status only; claims are not transmitted to providers in Phase 1.</p></div><Badge tone="Pending">{pendingClaims.length} awaiting review</Badge></div>
      {claims.length ? <div className="grid gap-4 lg:grid-cols-2">{claims.map(({ invoice: item, claim }) => <article key={claim.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><FileCheck2 size={19} /></span><div><p className="text-sm font-bold text-slate-800">{claim.provider}</p><p className="mt-0.5 text-xs text-slate-500">{claim.policyNo} · {item.invoiceNo}</p></div></div><Badge>{claim.status}</Badge></div><div className="mt-5 grid grid-cols-3 gap-3 border-y border-slate-100 py-4"><div><p className="label-caps">Claimed</p><p className="mt-1 text-sm font-bold text-slate-800">{formatCurrency(claim.claimedAmount)}</p></div><div><p className="label-caps">Approved</p><p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(claim.approvedAmount)}</p></div><div><p className="label-caps">Submitted</p><p className="mt-1 text-xs font-semibold text-slate-700">{formatDate(claim.submittedAt)}</p></div></div><div className="mt-4 flex items-center justify-between"><p className="text-xs text-slate-500">{getPatient(item).name}</p><Button variant="secondary" size="sm" onClick={() => setClaimReview({ invoice: item, claim })}>Review claim</Button></div></article>)}</div> : <EmptyState icon={ShieldCheck} title="No claims recorded" description="Claims created from eligible patient invoices will appear here." />}
    </section>}

    {tab === 'catalogue' && <section className="mt-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="section-title">Clinic-wide services</h2><p className="mt-1 text-xs text-slate-500">Prices apply to every branch. Retiring a service preserves historical invoice values.</p></div><p className="text-xs font-semibold text-slate-500">{data.treatments.filter((item) => item.isActive).length} active</p></div><div className="table-shell overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Service</th><th>Code</th><th>Category</th><th>Duration</th><th>Current price</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.treatments.map((treatment) => <tr key={treatment.id}><td className="font-bold text-slate-800">{treatment.name}</td><td><code className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">{treatment.serviceCode}</code></td><td>{treatment.category}</td><td>{treatment.duration} min</td><td className="font-bold text-slate-800">{formatCurrency(treatment.price)}</td><td><Badge>{treatment.isActive ? 'Active' : 'Inactive'}</Badge></td><td><Button variant="ghost" size="sm" onClick={() => toggleTreatment(treatment.id)}>{treatment.isActive ? 'Retire' : 'Reactivate'}</Button></td></tr>)}</tbody></table></div></section>}

    <Modal open={!!invoice && !paymentOpen && !claimOpen} onClose={() => setInvoice(null)} title={invoice?.invoiceNo ?? 'Invoice'} description="Database-generated billing record" size="lg">
      {invoice && <div className="space-y-5"><div className="flex flex-col justify-between gap-4 rounded-2xl bg-clinic-900 p-5 text-white sm:flex-row sm:items-center"><div><p className="text-xs text-clinic-200">Patient</p><p className="mt-1 text-lg font-bold">{getPatient(invoice).name}</p><p className="mt-1 text-xs text-clinic-100/70">{getPatient(invoice).patientNo} · {getAppointment(invoice).reference}</p></div><Badge>{invoice.status}</Badge></div><div className="grid gap-3 sm:grid-cols-4">{[{ label: 'Subtotal', value: invoice.subtotal }, { label: 'Insurance', value: invoice.insuranceCovered }, { label: 'Patient payable', value: invoice.patientPayable }, { label: 'Outstanding', value: outstanding(invoice) }].map((item) => <div key={item.label} className="rounded-xl border border-slate-200 p-3"><p className="label-caps">{item.label}</p><p className="mt-2 text-sm font-bold text-slate-800">{formatCurrency(item.value)}</p></div>)}</div><InfoNote title="Read-only calculated totals">Subtotal, insurance-covered, patient-payable, paid, and status are maintained by database billing logic—not editable form fields.</InfoNote><div><h3 className="text-sm font-bold text-slate-900">Payment history</h3><div className="mt-3 space-y-2">{invoice.payments.length ? invoice.payments.map((payment) => <div key={payment.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2"><History size={15} className="text-slate-400" /><div><p className="text-xs font-bold text-slate-700">{payment.method} · {payment.reference}</p><p className="text-[10px] text-slate-400">{new Date(payment.paidAt).toLocaleString('en-LK')}</p></div></div><p className="text-sm font-bold text-emerald-700">{formatCurrency(payment.amount)}</p></div>) : <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">No patient payments recorded.</p>}</div></div><div className="flex flex-wrap justify-end gap-2">{getPatient(invoice).policies.some((policy) => policy.status === 'Active') && <Button variant="secondary" onClick={() => { setClaimOpen(true); setError(null) }}><FilePlus2 size={16} />Submit claim</Button>}{outstanding(invoice) > 0 && <Button onClick={() => { setPaymentOpen(true); setError(null) }}><Banknote size={16} />Post payment</Button>}</div></div>}
    </Modal>

    <Modal open={paymentOpen} onClose={() => { setPaymentOpen(false); setInvoice(null) }} title="Post a payment" description={invoice ? `${invoice.invoiceNo} · ${getPatient(invoice).name}` : undefined} size="sm">
      {invoice && <form onSubmit={submitPayment} className="space-y-5">{error && <RuleError error={error} />}<div className="rounded-xl bg-slate-50 p-4"><p className="label-caps">Outstanding balance</p><p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(outstanding(invoice))}</p><p className="mt-1 text-xs text-slate-500">Partial payments are accepted.</p></div><Field label="Payment amount" hint={`Maximum ${formatCurrency(outstanding(invoice))}`} required><input name="amount" type="number" className="input" min="1" step="0.01" defaultValue={outstanding(invoice)} required /></Field><Field label="Payment method" required><select name="method" className="input"><option>Cash</option><option>Card</option><option>Online</option><option>Insurance</option></select></Field><Field label="Reference" required><input name="reference" className="input" placeholder="Receipt, POS or transfer reference" required /></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => { setPaymentOpen(false); setInvoice(null) }}>Cancel</Button><Button type="submit"><CreditCard size={16} />Commit payment</Button></div></form>}
    </Modal>

    <Modal open={claimOpen} onClose={() => { setClaimOpen(false); setInvoice(null) }} title="Submit insurance claim" description={invoice ? `${invoice.invoiceNo} · internal tracking` : undefined} size="sm">
      {invoice && <form onSubmit={submitInsuranceClaim} className="space-y-5">{error && <RuleError error={error} />}<InfoNote title="No external transmission">Phase 1 stores and tracks this claim internally. It does not send data to the insurer.</InfoNote><Field label="Insurance policy" required><select name="policy" className="input">{getPatient(invoice).policies.filter((policy) => policy.status === 'Active').map((policy) => <option value={policy.policyNo} key={policy.id}>{policy.provider} · {policy.policyNo}</option>)}</select></Field><Field label="Claimed amount" required><input name="amount" type="number" className="input" min="1" step="0.01" defaultValue={invoice.insuranceCovered} required /></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => { setClaimOpen(false); setInvoice(null) }}>Cancel</Button><Button type="submit"><ShieldCheck size={16} />Submit claim</Button></div></form>}
    </Modal>

    <Modal open={!!claimReview} onClose={() => setClaimReview(null)} title="Review insurance claim" description={claimReview ? `${claimReview.claim.provider} · ${claimReview.invoice.invoiceNo}` : undefined} size="sm">
      {claimReview && <form onSubmit={submitClaimReview} className="space-y-5"><div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4"><div><p className="label-caps">Claimed</p><p className="mt-1 font-bold text-slate-800">{formatCurrency(claimReview.claim.claimedAmount)}</p></div><div><p className="label-caps">Current status</p><div className="mt-1"><Badge>{claimReview.claim.status}</Badge></div></div></div><Field label="Decision" required><select name="status" className="input" defaultValue={claimReview.claim.status}><option>Pending</option><option>Approved</option><option value="PartiallyApproved">Partially approved</option><option>Rejected</option></select></Field><Field label="Approved amount" hint="Enter 0 for a rejected or pending claim" required><input name="approvedAmount" type="number" className="input" min="0" max={claimReview.claim.claimedAmount} step="0.01" defaultValue={claimReview.claim.approvedAmount} required /></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setClaimReview(null)}>Cancel</Button><Button type="submit"><CheckCircle2 size={16} />Save decision</Button></div></form>}
    </Modal>

    <Modal open={treatmentOpen} onClose={() => setTreatmentOpen(false)} title="Add catalogue service" description="New services and prices apply clinic-wide." size="sm">
      <form onSubmit={submitTreatment} className="space-y-4">{error && <RuleError error={error} />}<Field label="Service name" required><input name="name" className="input" required /></Field><Field label="Service code" hint="Must be unique" required><input name="code" className="input uppercase" placeholder="e.g. LAB-LFT" required /></Field><Field label="Category" required><input name="category" className="input" placeholder="e.g. Laboratory" required /></Field><div className="grid grid-cols-2 gap-3"><Field label="Price (LKR)" required><input name="price" className="input" type="number" min="0" step="0.01" required /></Field><Field label="Duration" required><select name="duration" className="input"><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option></select></Field></div><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setTreatmentOpen(false)}>Cancel</Button><Button type="submit"><Plus size={16} />Add service</Button></div></form>
    </Modal>
  </>
}
