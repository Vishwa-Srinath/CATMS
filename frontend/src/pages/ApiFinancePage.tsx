import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, CircleDollarSign, History, Landmark, ReceiptText, RotateCcw, WalletCards } from 'lucide-react'
import { ApiError } from '../api/errors'
import {
  createTreatment,
  deactivateTreatment,
  fetchInvoice,
  fetchInvoices,
  fetchPayments,
  fetchTreatmentCategories,
  fetchTreatments,
  postPayment,
  previewPayment,
  reversePayment,
  type ApiInvoiceSummary,
  type ApiPayment,
} from '../api/clinical-billing'
import { Avatar, Badge, Button, EmptyState, Field, InfoNote, Modal, PageHeader, RuleError, SearchInput, StatCard } from '../components/ui'
import { formatCurrency, formatDate } from '../lib/domain'
import financeImage from '../assets/clinical/finance-calculator.webp'
import medicationImage from '../assets/clinical/medication-flatlay.webp'

type FinanceTab = 'invoices' | 'catalogue'
type PayerType = 'Patient' | 'Insurer'

export default function ApiFinancePage({ onBack }: { onBack?: () => void }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<FinanceTab>('invoices')
  const [query, setQuery] = useState('')
  const [invoice, setInvoice] = useState<ApiInvoiceSummary | null>(null)
  const [paymentTarget, setPaymentTarget] = useState<ApiInvoiceSummary | null>(null)
  const [payerType, setPayerType] = useState<PayerType>('Patient')
  const [claimId, setClaimId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentError, setPaymentError] = useState<Error | null>(null)
  const [catalogueError, setCatalogueError] = useState<Error | null>(null)
  const [reverseTarget, setReverseTarget] = useState<ApiPayment | null>(null)
  const [reverseError, setReverseError] = useState<Error | null>(null)
  const idempotencyKey = useRef<string | null>(null)
  const submitting = useRef(false)
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: fetchInvoices })
  const categories = useQuery({ queryKey: ['treatment-categories'], queryFn: fetchTreatmentCategories })
  const treatments = useQuery({ queryKey: ['treatments', 'all'], queryFn: () => fetchTreatments(true) })
  const detail = useQuery({
    queryKey: ['invoice-detail', invoice?.invoiceId],
    queryFn: () => fetchInvoice(invoice!.invoiceId),
    enabled: invoice !== null,
  })
  const payments = useQuery({
    queryKey: ['payments', invoice?.invoiceId],
    queryFn: () => fetchPayments(invoice!.invoiceId),
    enabled: invoice !== null,
  })
  const preview = useQuery({
    queryKey: ['payment-preview', paymentTarget?.invoiceId, payerType, claimId],
    queryFn: () => previewPayment({
      invoiceId: paymentTarget!.invoiceId,
      payerType,
      ...(payerType === 'Insurer' ? { insuranceClaimId: claimId } : {}),
    }),
    enabled: paymentTarget !== null && (payerType === 'Patient' || claimId.length > 0),
    retry: false,
  })
  useEffect(() => {
    if (preview.data) setPaymentAmount(preview.data.outstandingAmount)
  }, [preview.data])
  const post = useMutation({
    mutationFn: postPayment,
    onSuccess: async () => {
      idempotencyKey.current = null
      submitting.current = false
      setPaymentTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      await queryClient.invalidateQueries({ queryKey: ['payments'] })
    },
  })
  const reverse = useMutation({
    mutationFn: ({ paymentId, amount, reason }: { paymentId: string; amount: string; reason: string }) => reversePayment(paymentId, { amount, reason }),
    onSuccess: async () => {
      setReverseTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
      await queryClient.invalidateQueries({ queryKey: ['payments'] })
      await queryClient.invalidateQueries({ queryKey: ['invoice-detail'] })
    },
  })
  const addService = useMutation({
    mutationFn: createTreatment,
    onSuccess: async () => {
      setCatalogueError(null)
      await queryClient.invalidateQueries({ queryKey: ['treatments'] })
    },
  })
  const retireService = useMutation({
    mutationFn: deactivateTreatment,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['treatments'] }),
  })
  const invoiceRows = (invoices.data ?? []).filter((item) => {
    const search = query.trim().toLowerCase()
    return !search || [item.invoiceNumber, item.patientName, item.patientNumber, item.appointmentNumber].some((value) => value.toLowerCase().includes(search))
  })
  const openBalance = (invoices.data ?? []).reduce((sum, item) => sum + Math.max(Number(item.patientLiabilityAmount) - Number(item.patientPaidAmount), 0) + Math.max(Number(item.approvedInsuranceAmount) - Number(item.insurerPaidAmount), 0), 0)
  const collected = (invoices.data ?? []).reduce((sum, item) => sum + Number(item.patientPaidAmount) + Number(item.insurerPaidAmount), 0)

  const openPayment = (item: ApiInvoiceSummary) => {
    setPaymentTarget(item)
    setPayerType('Patient')
    setClaimId('')
    setPaymentAmount('')
    setPaymentError(null)
    idempotencyKey.current = null
  }

  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!paymentTarget || submitting.current || !preview.data) return
    const form = new FormData(event.currentTarget)
    const key = idempotencyKey.current ?? crypto.randomUUID()
    idempotencyKey.current = key
    submitting.current = true
    setPaymentError(null)
    post.mutate({
      invoiceId: paymentTarget.invoiceId,
      payerType,
      ...(payerType === 'Insurer' ? { insuranceClaimId: claimId } : {}),
      amount: String(form.get('amount')),
      paymentMethod: String(form.get('method')) as 'Cash' | 'Card' | 'BankTransfer' | 'Online',
      idempotencyKey: key,
      referenceNumber: String(form.get('reference') ?? '').trim() || undefined,
    }, {
      onError: (caught) => {
        submitting.current = false
        setPaymentError(caught instanceof Error ? caught : new Error('The payment could not be posted.'))
      },
    })
  }

  const submitReversal = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reverseTarget) return
    const form = new FormData(event.currentTarget)
    setReverseError(null)
    reverse.mutate({
      paymentId: reverseTarget.paymentId,
      amount: String(form.get('amount')),
      reason: String(form.get('reason')),
    }, {
      onError: (caught) => setReverseError(caught instanceof Error ? caught : new Error('The payment reversal could not be recorded.')),
    })
  }

  const submitService = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setCatalogueError(null)
    addService.mutate({
      treatmentCategoryId: String(form.get('category')),
      serviceCode: String(form.get('code')).trim().toUpperCase(),
      name: String(form.get('name')).trim(),
      description: String(form.get('description')).trim() || null,
      currentPrice: String(form.get('price')),
      defaultDurationMinutes: Number(form.get('duration')),
    }, {
      onError: (caught) => setCatalogueError(caught instanceof Error ? caught : new Error('The catalogue service could not be created.')),
    })
  }

  return <>
    <PageHeader image={tab === 'catalogue' ? medicationImage : financeImage} eyebrow="Finance workspace" title="Billing & payments" description="Use database-owned balances, record payer-specific payments, and review audited reversals." actions={onBack ? <Button variant="secondary" onClick={onBack}>Back to claims workspace</Button> : undefined} />
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard label="Open patient balances" value={formatCurrency((invoices.data ?? []).reduce((sum, item) => sum + Math.max(Number(item.patientLiabilityAmount) - Number(item.patientPaidAmount), 0), 0))} detail="Patient liability less patient payments" icon={WalletCards} accent="coral" />
      <StatCard label="Open insurer balances" value={formatCurrency((invoices.data ?? []).reduce((sum, item) => sum + Math.max(Number(item.approvedInsuranceAmount) - Number(item.insurerPaidAmount), 0), 0))} detail="Approved coverage less insurer payments" icon={Landmark} accent="blue" />
      <StatCard label="Total open balances" value={formatCurrency(openBalance)} detail="Separate patient and insurer outstanding amounts" icon={Banknote} accent="amber" />
      <StatCard label="Collected" value={formatCurrency(collected)} detail="Database-posted patient and insurer payments" icon={CircleDollarSign} accent="teal" />
    </div>
    <div className="mt-6 flex max-w-sm tab-list"><button className={`tab-button flex-1 ${tab === 'invoices' ? 'tab-button-active' : ''}`} onClick={() => setTab('invoices')}>Invoices</button><button className={`tab-button flex-1 ${tab === 'catalogue' ? 'tab-button-active' : ''}`} onClick={() => setTab('catalogue')}>Treatment catalogue</button></div>

    {tab === 'invoices' && <section className="mt-5">
      {invoices.error && <RuleError error={invoices.error instanceof Error ? invoices.error : new Error('Invoices could not be loaded.')} />}
      <div className="mb-4 flex items-center gap-3"><SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search invoice or patient…" aria-label="Search invoices" /><p className="shrink-0 text-xs font-semibold text-slate-500">{invoiceRows.length} invoices</p></div>
      {invoices.isLoading ? <p className="card p-5 text-sm text-slate-500">Loading invoices…</p> : invoiceRows.length ? <div className="table-shell overflow-x-auto"><table className="data-table min-w-[1000px]"><thead><tr><th>Invoice</th><th>Patient</th><th>Issued</th><th>Subtotal</th><th>Insurer balance</th><th>Patient balance</th><th>Status</th><th /></tr></thead><tbody>{invoiceRows.map((item) => <tr key={item.invoiceId}>
        <td><button onClick={() => setInvoice(item)} className="font-bold text-clinic-700 hover:underline">{item.invoiceNumber}</button><p className="text-[10px] text-slate-400">{item.appointmentNumber}</p></td>
        <td><div className="flex items-center gap-2"><Avatar name={item.patientName} size="sm" /><div><p className="font-semibold text-slate-800">{item.patientName}</p><p className="text-[10px] text-slate-400">{item.patientNumber}</p></div></div></td>
        <td>{formatDate(item.issuedAt)}</td><td>{formatCurrency(Number(item.subtotalAmount))}</td>
        <td className="text-blue-700">{formatCurrency(Math.max(Number(item.approvedInsuranceAmount) - Number(item.insurerPaidAmount), 0))}</td>
        <td className="text-emerald-700">{formatCurrency(Math.max(Number(item.patientLiabilityAmount) - Number(item.patientPaidAmount), 0))}</td>
        <td><Badge>{item.patientPaymentStatus}</Badge></td><td><Button size="sm" onClick={() => openPayment(item)}>Payment</Button></td>
      </tr>)}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No invoices found" description="Invoices generated by clinical care will appear here." />}
    </section>}

    {tab === 'catalogue' && <section className="mt-5">
      {catalogueError && <RuleError error={catalogueError} />}
      {treatments.error && <RuleError error={treatments.error instanceof Error ? treatments.error : new Error('Treatment catalogue could not be loaded.')} />}
      <div className="table-shell overflow-x-auto"><table className="data-table min-w-[760px]"><thead><tr><th>Service</th><th>Code</th><th>Category</th><th>Duration</th><th>Reference price</th><th>Status</th><th /></tr></thead><tbody>{(treatments.data ?? []).map((item) => <tr key={item.treatmentId}><td className="font-bold">{item.name}</td><td>{item.serviceCode}</td><td>{item.categoryName}</td><td>{item.defaultDurationMinutes} min</td><td>{formatCurrency(Number(item.currentPrice))}</td><td><Badge>{item.isActive ? 'Active' : 'Inactive'}</Badge></td><td>{item.isActive && <Button variant="ghost" size="sm" onClick={() => retireService.mutate(item.treatmentId)}>Retire</Button>}</td></tr>)}</tbody></table></div>
      <details className="card mt-4 p-5"><summary className="cursor-pointer text-sm font-bold">Add catalogue service</summary>
        <form onSubmit={submitService} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Category" required><select name="category" className="input" required>{(categories.data ?? []).map((category) => <option key={category.treatmentCategoryId} value={category.treatmentCategoryId}>{category.name}</option>)}</select></Field>
          <Field label="Service code" required><input name="code" className="input" maxLength={30} required /></Field>
          <Field label="Name" required><input name="name" className="input" maxLength={120} required /></Field>
          <Field label="Description"><input name="description" className="input" maxLength={300} /></Field>
          <Field label="Reference price" required><input name="price" type="number" className="input" min="0" step="0.01" required /></Field>
          <Field label="Duration (minutes)" required><input name="duration" type="number" className="input" min="1" max="32767" required /></Field>
          <Button type="submit" disabled={addService.isPending}>Create service</Button>
        </form>
      </details>
    </section>}

    <Modal open={invoice !== null} onClose={() => setInvoice(null)} title={invoice?.invoiceNumber ?? 'Invoice'} description="Database-generated billing record" size="lg">
      {detail.isLoading && <p className="text-sm text-slate-500">Loading invoice…</p>}
      {detail.error && <RuleError error={detail.error instanceof Error ? detail.error : new Error('Invoice details could not be loaded.')} />}
      {detail.data && <div className="space-y-5">
        <div className="flex justify-between rounded-2xl bg-clinic-900 p-5 text-white"><div><p className="text-xs text-clinic-200">Patient</p><p className="mt-1 text-lg font-bold">{invoice?.patientName}</p><p className="mt-1 text-xs">{invoice?.patientNumber} · {invoice?.appointmentNumber}</p></div><Badge>{detail.data.invoiceState}</Badge></div>
        <div className="grid gap-3 sm:grid-cols-3">{[
          ['Subtotal', detail.data.subtotalAmount],
          ['Insurer liability', detail.data.approvedInsuranceAmount],
          ['Patient liability', detail.data.patientLiabilityAmount],
        ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 p-3"><p className="label-caps">{label}</p><p className="mt-2 font-bold">{formatCurrency(Number(value))}</p></div>)}</div>
        <div><h3 className="text-sm font-bold">Invoice lines</h3><div className="mt-2 divide-y">{detail.data.lines.map((line) => <div className="flex justify-between py-2 text-sm" key={line.invoiceLineId}><span>{line.description} × {line.quantity}</span><span>{formatCurrency(Number(line.lineTotal))}</span></div>)}</div></div>
        <div><h3 className="text-sm font-bold">Payment history</h3>{payments.isLoading && <p className="mt-2 text-xs text-slate-500">Loading payments…</p>}{payments.error && <RuleError error={payments.error instanceof Error ? payments.error : new Error('Payment history could not be loaded.')} />}
          <div className="mt-2 space-y-2">{(payments.data ?? []).map((payment) => <div key={payment.paymentId} className="rounded-xl border border-slate-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><History size={15} className="text-slate-400" /><div><p className="text-xs font-bold">{payment.payerType} · {payment.paymentMethod} · {payment.receiptNumber}</p><p className="text-[10px] text-slate-400">{new Date(payment.paidAt).toLocaleString()}</p></div></div><p className="text-sm font-bold">{formatCurrency(Number(payment.netAmount))} net <span className="text-xs font-normal text-slate-500">of {formatCurrency(Number(payment.amount))}</span></p>{Number(payment.netAmount) > 0 && <Button size="sm" variant="secondary" onClick={() => { setReverseTarget(payment); setReverseError(null) }}><RotateCcw size={14} />Reverse</Button>}</div>
            {payment.reversals.map((item) => <p className="mt-2 text-xs text-amber-800" key={item.paymentReversalId}>Reversed {formatCurrency(Number(item.amount))} · {item.reason}</p>)}
          </div>)}</div>
          {!payments.isLoading && !(payments.data ?? []).length && <p className="mt-2 text-xs text-slate-500">No payments recorded.</p>}
        </div>
      </div>}
    </Modal>

    <Modal open={paymentTarget !== null} onClose={() => { setPaymentTarget(null); setPaymentError(null) }} title="Post a payment" description={paymentTarget ? `${paymentTarget.invoiceNumber} · ${paymentTarget.patientName}` : undefined} size="sm">
      {paymentTarget && <form onSubmit={submitPayment} onChange={() => { idempotencyKey.current = null }} className="space-y-4">
        {paymentError && <RuleError error={paymentError} />}
        <Field label="Payer" required><select className="input" value={payerType} onChange={(event) => { setPayerType(event.target.value as PayerType); setClaimId(''); setPaymentAmount(''); setPaymentError(null) }}><option value="Patient">Patient</option><option value="Insurer">Insurer</option></select></Field>
        {payerType === 'Insurer' && <Field label="Approved claim" required><select className="input" value={claimId} onChange={(event) => { setClaimId(event.target.value); setPaymentAmount('') }} required><option value="">Select approved claim</option>{paymentTarget.approvedClaims.map((claim) => <option value={claim.claimId} key={claim.claimId}>{claim.providerName} · {claim.policyNumber} · {claim.claimNumber} ({claim.claimStatus})</option>)}</select></Field>}
        {preview.error && <RuleError error={preview.error instanceof ApiError ? preview.error : new Error('The outstanding balance could not be previewed.')} />}
        {preview.data && Number(preview.data.outstandingAmount) > 0 && <div className="rounded-xl bg-slate-50 p-4"><p className="label-caps">{payerType} outstanding</p><p className="mt-1 text-2xl font-bold">{formatCurrency(Number(preview.data.outstandingAmount))}</p><p className="mt-1 text-xs text-slate-500">Balance is calculated by the API; partial payments are allowed.</p></div>}
        {preview.data && Number(preview.data.outstandingAmount) <= 0 && <InfoNote title="No balance due">There is no outstanding balance for this payer and claim.</InfoNote>}
        <Field label="Payment amount" required><input name="amount" type="number" className="input" min="0.01" step="0.01" max={preview.data?.outstandingAmount} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required disabled={!preview.data || Number(preview.data.outstandingAmount) <= 0} /></Field>
        <Field label="Payment method" required><select name="method" className="input"><option>Cash</option><option>Card</option><option>BankTransfer</option><option>Online</option></select></Field>
        <Field label="Reference"><input name="reference" className="input" maxLength={100} /></Field>
        <div className="flex justify-end"><Button type="submit" disabled={!preview.data || Number(preview.data.outstandingAmount) <= 0 || !paymentAmount || post.isPending}>{post.isPending ? 'Posting…' : 'Commit payment'}</Button></div>
      </form>}
    </Modal>

    <Modal open={reverseTarget !== null} onClose={() => setReverseTarget(null)} title="Reverse payment" description={reverseTarget?.receiptNumber} size="sm">
      {reverseTarget && <form onSubmit={submitReversal} className="space-y-4">
        {reverseError && <RuleError error={reverseError} />}
        <InfoNote title="Audited reversal">This records a reversal against the original payment; it does not delete or edit the payment.</InfoNote>
        <Field label="Amount to reverse" hint={`Maximum ${formatCurrency(Number(reverseTarget.netAmount))}`} required><input className="input" name="amount" type="number" min="0.01" max={reverseTarget.netAmount} step="0.01" defaultValue={reverseTarget.netAmount} required /></Field>
        <Field label="Reason" required><textarea className="input min-h-24" name="reason" maxLength={250} required /></Field>
        <div className="flex justify-end"><Button type="submit" disabled={reverse.isPending}>{reverse.isPending ? 'Reversing…' : 'Record reversal'}</Button></div>
      </form>}
    </Modal>
  </>
}
