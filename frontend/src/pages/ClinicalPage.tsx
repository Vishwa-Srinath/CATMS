import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, ClipboardPlus, FileText, UserRound } from 'lucide-react'
import { ApiError } from '../api/errors'
import {
  fetchClinicalWorklist,
  fetchInvoice,
  fetchTreatments,
  recordCare,
  type ApiClinicalWorklistItem,
} from '../api/clinical-billing'
import { Avatar, Badge, Button, EmptyState, Field, InfoNote, Modal, PageHeader, RuleError } from '../components/ui'
import { formatCurrency, formatDate } from '../lib/domain'
import clinicianImage from '../assets/clinical/clinician-stethoscope.webp'

/**
 * src/pages/ClinicalPage.tsx
 * Owner: Dev1 & Dev4 | Issues: CATMS-062, CATMS-065
 *
 * Final live clinical workbench — fully connected to backend APIs.
 * In-memory database simulations and demo fallback toggles eliminated per CATMS-065.
 */
export default function ClinicalPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<ApiClinicalWorklistItem | null>(null)
  const [tab, setTab] = useState<'worklist' | 'records'>('worklist')
  const [search, setSearch] = useState('')
  const [treatmentIds, setTreatmentIds] = useState<string[]>([])
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const worklist = useQuery({
    queryKey: ['clinical-worklist'],
    queryFn: () => fetchClinicalWorklist(),
    staleTime: 15_000,
  })

  const treatments = useQuery({
    queryKey: ['treatments'],
    queryFn: () => fetchTreatments(),
    staleTime: 60_000,
  })

  const invoice = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => fetchInvoice(invoiceId!),
    enabled: invoiceId !== null,
  })

  const save = useMutation({
    mutationFn: ({ appointmentId, input }: {
      appointmentId: string
      input: Parameters<typeof recordCare>[1]
    }) => recordCare(appointmentId, input),
    onSuccess: async (result) => {
      setSelected(null)
      setTreatmentIds([])
      setInvoiceId(result.invoiceId)
      await queryClient.invalidateQueries({ queryKey: ['clinical-worklist'] })
      await queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })

  const pending = (worklist.data ?? []).filter((item) => item.consultationRevisionNo === null)
  const recorded = useMemo(() => (worklist.data ?? []).filter((item) => item.consultationRevisionNo !== null)
    .filter((item) => !search || `${item.patientName} ${item.patientNumber} ${item.appointmentNumber}`.toLowerCase().includes(search.toLowerCase())), [search, worklist.data])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected || save.isPending) return
    setError(null)
    const form = new FormData(event.currentTarget)
    const vitalsText = String(form.get('vitals') ?? '').trim()
    save.mutate({
      appointmentId: selected.appointmentId,
      input: {
        diagnosis_summary: String(form.get('diagnosis') ?? '').trim() || null,
        notes: String(form.get('notes') ?? ''),
        vitals: vitalsText ? { summary: vitalsText } : undefined,
        treatments: treatmentIds.map((treatmentId) => ({ treatmentId, quantity: '1' })),
      },
    }, {
      onError: (caught) => setError(caught instanceof Error ? caught : new Error('The clinical record could not be saved.')),
    })
  }

  return (
    <>
      <PageHeader
        image={clinicianImage}
        eyebrow="Clinician workspace"
        title="Clinical worklist"
        description="Record care for completed visits. The server snapshots catalogue prices and generates the invoice."
      />
      {worklist.error && <RuleError error={worklist.error instanceof Error ? worklist.error : new Error('The clinical worklist could not be loaded.')} />}
      {treatments.error && <RuleError error={treatments.error instanceof Error ? treatments.error : new Error('The treatment catalogue could not be loaded.')} />}
      
      <div className="mb-6 mt-6 flex max-w-sm tab-list">
        <button
          onClick={() => setTab('worklist')}
          className={`tab-button flex-1 ${tab === 'worklist' ? 'tab-button-active' : ''}`}
        >
          Active worklist <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{pending.length}</span>
        </button>
        <button
          onClick={() => setTab('records')}
          className={`tab-button flex-1 ${tab === 'records' ? 'tab-button-active' : ''}`}
        >
          Recorded care
        </button>
      </div>

      {tab === 'worklist' && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="section-title">Ready for documentation</h2>
              <p className="mt-1 text-xs text-slate-500">Completed appointments without a consultation record</p>
            </div>
            <Badge tone={pending.length ? 'PartiallyPaid' : 'Completed'}>{pending.length} pending</Badge>
          </div>
          <div className="space-y-3">
            {worklist.isLoading ? (
              <p className="card p-5 text-sm text-slate-500">Loading live worklist from database…</p>
            ) : pending.length ? (
              pending.map((item) => (
                <article key={item.appointmentId} className="card p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={item.patientName} size="lg" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-bold text-slate-800">{item.patientName}</h3>
                          <Badge>Completed</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{item.appointmentNumber} · {formatDate(item.startAt)}</p>
                        <p className="mt-1 text-xs text-slate-500">Patient {item.patientNumber} · {item.branchName}</p>
                      </div>
                    </div>
                    <Button onClick={() => { setSelected(item); setTreatmentIds([]); setError(null); }}>
                      <ClipboardPlus size={16} />Record care
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState icon={ClipboardCheck} title="Worklist complete" description="Every completed appointment has a consultation record." />
            )}
          </div>
        </section>
      )}

      {tab === 'records' && (
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <input
              className="input max-w-lg"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient or appointment…"
              aria-label="Search recorded care"
            />
            <p className="shrink-0 text-xs font-semibold text-slate-500">{recorded.length} records</p>
          </div>
          {recorded.length ? (
            <div className="table-shell overflow-x-auto">
              <table className="data-table min-w-[680px]">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Appointment</th>
                    <th>Revision</th>
                    <th>Treatments</th>
                    <th>Branch</th>
                  </tr>
                </thead>
                <tbody>
                  {recorded.map((item) => (
                    <tr key={item.appointmentId}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={item.patientName} size="sm" />
                          <div>
                            <p className="font-bold text-slate-800">{item.patientName}</p>
                            <p className="text-[11px] text-slate-400">{item.patientNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        {item.appointmentNumber}
                        <p className="text-[11px] text-slate-400">{formatDate(item.startAt)}</p>
                      </td>
                      <td>{item.consultationRevisionNo}</td>
                      <td>{item.treatmentCount}</td>
                      <td>{item.branchName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="card p-5 text-sm text-slate-500">No recorded care matches this search.</p>
          )}
        </section>
      )}

      {/* Record Consultation Modal */}
      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Record consultation"
        description={selected ? `${selected.appointmentNumber} · ${selected.patientName}` : undefined}
        size="xl"
      >
        {selected && (
          <form onSubmit={submit} className="space-y-5">
            {error && <RuleError error={error} />}
            <div className="flex items-center gap-3 rounded-xl border border-[#DCE4E4] bg-[#EFF3F3] p-4">
              <UserRound size={19} className="text-[var(--portal-accent)]" />
              <div>
                <p className="text-sm font-bold text-slate-900">{selected.patientName}</p>
                <p className="mt-0.5 text-xs text-slate-600">{selected.patientNumber} · {selected.appointmentNumber}</p>
              </div>
            </div>
            <Field label="Diagnosis" hint="Optional summary">
              <input name="diagnosis" className="input" maxLength={300} />
            </Field>
            <Field label="Vitals" hint="Optional summary">
              <input name="vitals" className="input" placeholder="e.g. BP 120/80 · HR 72 · SpO2 98%" />
            </Field>
            <Field label="Consultation notes" required>
              <textarea name="notes" className="input min-h-32 resize-y" required />
            </Field>
            <div>
              <p className="text-sm font-bold text-slate-900">Treatments delivered</p>
              <p className="mt-1 text-xs text-slate-500">Prices are read-only references; the API snapshots the active catalogue price.</p>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {(treatments.data ?? []).filter((item) => item.isActive).map((treatment) => (
                  <label key={treatment.treatmentId} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <input
                      type="checkbox"
                      checked={treatmentIds.includes(treatment.treatmentId)}
                      onChange={() => setTreatmentIds((current) => current.includes(treatment.treatmentId) ? current.filter((id) => id !== treatment.treatmentId) : [...current, treatment.treatmentId])}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-slate-800">{treatment.name}</span>
                      <span className="text-[10px] text-slate-400">{treatment.serviceCode} · {treatment.categoryName}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-600">{formatCurrency(Number(treatment.currentPrice))}</span>
                  </label>
                ))}
              </div>
            </div>
            <InfoNote title="Server-generated invoice">
              No financial totals are sent by this form. The database computes the invoice and returns its ID.
            </InfoNote>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
              <Button type="submit" disabled={!treatmentIds.length || save.isPending}>
                <ClipboardCheck size={16} />{save.isPending ? 'Saving…' : 'Save care & generate invoice'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Generated Invoice Modal */}
      <Modal
        open={invoiceId !== null}
        onClose={() => setInvoiceId(null)}
        title={invoice.data?.invoiceNumber ?? 'Generated invoice'}
        description="Read-only invoice returned by the billing API"
        size="lg"
      >
        {invoice.isLoading && <p className="text-sm text-slate-500">Loading invoice…</p>}
        {invoice.error && <RuleError error={invoice.error instanceof ApiError ? invoice.error : new Error('The generated invoice could not be loaded.')} />}
        {invoice.data && (
          <div className="space-y-4">
            <InfoNote title="Invoice issued">{invoice.data.invoiceNumber} · {invoice.data.invoiceState}</InfoNote>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Subtotal', invoice.data.subtotalAmount],
                ['Insurer balance', invoice.data.approvedInsuranceAmount],
                ['Patient balance', invoice.data.patientLiabilityAmount],
              ].map(([label, amount]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3">
                  <p className="label-caps">{label}</p>
                  <p className="mt-2 text-sm font-bold text-slate-800">{formatCurrency(Number(amount))}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Invoice lines</h3>
              <div className="mt-2 divide-y divide-slate-100">
                {invoice.data.lines.map((line) => (
                  <div key={line.invoiceLineId} className="flex justify-between gap-4 py-2 text-sm">
                    <span>{line.description} × {line.quantity}</span>
                    <span className="font-semibold">{formatCurrency(Number(line.lineTotal))}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setInvoiceId(null)}>
                <FileText size={16} />Close invoice
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
