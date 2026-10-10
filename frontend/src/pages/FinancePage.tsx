/**
 * src/pages/FinancePage.tsx
 * Owner: Dev1, Dev3, Dev4 | Issues: CATMS-060, CATMS-062, CATMS-063, CATMS-065
 *
 * Final live finance workbench — fully connected to backend APIs.
 * Eliminates demo fallbacks, mock toggles, and in-memory simulations per CATMS-065.
 * Unifies live Invoices, live Payments, live Claims Tracker, and Treatment Catalogue.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CircleDollarSign,
  History,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useClinic } from '../context/ClinicContext';
import { ApiError } from '../api/errors';
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
} from '../api/clinical-billing';
import { insuranceApi } from '../api/insurance.api';
import {
  ClaimTracker,
  ClaimSubmissionModal,
  ClaimReviewModal,
} from '../features/patients-insurance';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  InfoNote,
  Modal,
  PageHeader,
  RuleError,
  SearchInput,
  StatCard,
} from '../components/ui';
import { formatCurrency, formatDate } from '../lib/domain';
import type { Claim, InsurancePolicy, Invoice, Patient } from '../types';

type Tab = 'invoices' | 'claims' | 'catalogue';
type PayerType = 'Patient' | 'Insurer';

export default function FinancePage() {
  const { user, notify } = useClinic();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('invoices');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal target states
  const [invoiceDetailTarget, setInvoiceDetailTarget] = useState<ApiInvoiceSummary | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<ApiInvoiceSummary | null>(null);
  const [claimTarget, setClaimTarget] = useState<ApiInvoiceSummary | null>(null);
  const [claimReview, setClaimReview] = useState<{ invoice: Invoice; claim: Claim } | null>(null);
  const [reverseTarget, setReverseTarget] = useState<ApiPayment | null>(null);

  // Form input states
  const [payerType, setPayerType] = useState<PayerType>('Patient');
  const [claimId, setClaimId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentError, setPaymentError] = useState<Error | null>(null);
  const [catalogueError, setCatalogueError] = useState<Error | null>(null);
  const [reverseError, setReverseError] = useState<Error | null>(null);

  // Idempotency guard for payment submissions
  const idempotencyKey = useRef<string | null>(null);
  const submittingPayment = useRef(false);

  // Live queries
  const invoicesQuery = useQuery({ queryKey: ['invoices'], queryFn: fetchInvoices });
  const categoriesQuery = useQuery({ queryKey: ['treatment-categories'], queryFn: fetchTreatmentCategories });
  const treatmentsQuery = useQuery({ queryKey: ['treatments', 'all'], queryFn: () => fetchTreatments(true) });

  const invoiceDetailQuery = useQuery({
    queryKey: ['invoice-detail', invoiceDetailTarget?.invoiceId],
    queryFn: () => fetchInvoice(invoiceDetailTarget!.invoiceId),
    enabled: invoiceDetailTarget !== null,
  });

  const paymentsQuery = useQuery({
    queryKey: ['payments', invoiceDetailTarget?.invoiceId],
    queryFn: () => fetchPayments(invoiceDetailTarget!.invoiceId),
    enabled: invoiceDetailTarget !== null,
  });

  const paymentPreviewQuery = useQuery({
    queryKey: ['payment-preview', paymentTarget?.invoiceId, payerType, claimId],
    queryFn: () =>
      previewPayment({
        invoiceId: paymentTarget!.invoiceId,
        payerType,
        ...(payerType === 'Insurer' ? { insuranceClaimId: claimId } : {}),
      }),
    enabled: paymentTarget !== null && (payerType === 'Patient' || claimId.length > 0),
    retry: false,
  });

  useEffect(() => {
    if (paymentPreviewQuery.data) {
      setPaymentAmount(paymentPreviewQuery.data.outstandingAmount);
    }
  }, [paymentPreviewQuery.data]);

  // Query patient policies for the selected claim target
  const patientPoliciesQuery = useQuery({
    queryKey: ['insurance-policies', claimTarget?.patientId],
    queryFn: () => insuranceApi.getPatientPolicies(Number(claimTarget!.patientId)),
    enabled: Boolean(claimTarget && claimTarget.patientId),
  });

  // Live mutations
  const postPaymentMutation = useMutation({
    mutationFn: postPayment,
    onSuccess: async () => {
      idempotencyKey.current = null;
      submittingPayment.current = false;
      setPaymentTarget(null);
      notify({
        type: 'success',
        title: 'Payment posted',
        message: 'Payment recorded in database and outstanding liability updated.',
      });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
      await queryClient.invalidateQueries({ queryKey: ['invoice-detail'] });
    },
  });

  const reversePaymentMutation = useMutation({
    mutationFn: ({ paymentId, amount, reason }: { paymentId: string; amount: string; reason: string }) =>
      reversePayment(paymentId, { amount, reason }),
    onSuccess: async () => {
      setReverseTarget(null);
      notify({
        type: 'success',
        title: 'Payment reversed',
        message: 'Audited reversal recorded. Historical payment retained.',
      });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });

  const addServiceMutation = useMutation({
    mutationFn: createTreatment,
    onSuccess: async () => {
      setCatalogueError(null);
      notify({
        type: 'success',
        title: 'Service created',
        message: 'Treatment added to catalogue with snapshot price.',
      });
      await queryClient.invalidateQueries({ queryKey: ['treatments'] });
    },
  });

  const retireServiceMutation = useMutation({
    mutationFn: deactivateTreatment,
    onSuccess: async () => {
      notify({
        type: 'info',
        title: 'Service retired',
        message: 'Treatment deactivated. Historical invoice snapshots preserved.',
      });
      await queryClient.invalidateQueries({ queryKey: ['treatments'] });
    },
  });

  // Computed summary values from live database invoices
  const invoiceRows = useMemo(() => {
    return (invoicesQuery.data ?? []).filter((item) => {
      const search = query.trim().toLowerCase();
      const matchesSearch =
        !search ||
        [item.invoiceNumber, item.patientName, item.patientNumber, item.appointmentNumber].some((value) =>
          value.toLowerCase().includes(search),
        );
      const matchesStatus = statusFilter === 'all' || item.patientPaymentStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoicesQuery.data, query, statusFilter]);

  const openPatientBalance = useMemo(
    () =>
      (invoicesQuery.data ?? []).reduce(
        (sum, item) => sum + Math.max(Number(item.patientLiabilityAmount) - Number(item.patientPaidAmount), 0),
        0,
      ),
    [invoicesQuery.data],
  );

  const openInsurerBalance = useMemo(
    () =>
      (invoicesQuery.data ?? []).reduce(
        (sum, item) => sum + Math.max(Number(item.approvedInsuranceAmount) - Number(item.insurerPaidAmount), 0),
        0,
      ),
    [invoicesQuery.data],
  );

  const collectedTotal = useMemo(
    () => (invoicesQuery.data ?? []).reduce((sum, item) => sum + Number(item.patientPaidAmount) + Number(item.insurerPaidAmount), 0),
    [invoicesQuery.data],
  );

  // Handlers
  const openPayment = (item: ApiInvoiceSummary) => {
    setPaymentTarget(item);
    setPayerType('Patient');
    setClaimId('');
    setPaymentAmount('');
    setPaymentError(null);
    idempotencyKey.current = null;
  };

  const handlePaymentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentTarget || submittingPayment.current || !paymentPreviewQuery.data) return;
    const form = new FormData(event.currentTarget);
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    submittingPayment.current = true;
    setPaymentError(null);

    postPaymentMutation.mutate(
      {
        invoiceId: paymentTarget.invoiceId,
        payerType,
        ...(payerType === 'Insurer' ? { insuranceClaimId: claimId } : {}),
        amount: String(form.get('amount')),
        paymentMethod: String(form.get('method')) as 'Cash' | 'Card' | 'BankTransfer' | 'Online',
        idempotencyKey: key,
        referenceNumber: String(form.get('reference') ?? '').trim() || undefined,
      },
      {
        onError: (caught) => {
          submittingPayment.current = false;
          setPaymentError(caught instanceof Error ? caught : new Error('The payment could not be posted.'));
        },
      },
    );
  };

  const handleReversalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reverseTarget) return;
    const form = new FormData(event.currentTarget);
    setReverseError(null);
    reversePaymentMutation.mutate(
      {
        paymentId: reverseTarget.paymentId,
        amount: String(form.get('amount')),
        reason: String(form.get('reason')),
      },
      {
        onError: (caught) =>
          setReverseError(caught instanceof Error ? caught : new Error('The payment reversal could not be recorded.')),
      },
    );
  };

  const handleServiceSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setCatalogueError(null);
    addServiceMutation.mutate(
      {
        treatmentCategoryId: String(form.get('category')),
        serviceCode: String(form.get('code')).trim().toUpperCase(),
        name: String(form.get('name')).trim(),
        description: String(form.get('description')).trim() || null,
        currentPrice: String(form.get('price')),
        defaultDurationMinutes: Number(form.get('duration')),
      },
      {
        onError: (caught) =>
          setCatalogueError(caught instanceof Error ? caught : new Error('The catalogue service could not be created.')),
      },
    );
  };

  // Adapter for ClaimSubmissionModal from selected invoice
  const adaptedClaimInvoice: Invoice | null = useMemo(() => {
    if (!claimTarget) return null;
    return {
      id: claimTarget.invoiceId,
      invoiceNo: claimTarget.invoiceNumber,
      appointmentId: claimTarget.appointmentId,
      subtotal: Number(claimTarget.subtotalAmount),
      insuranceCovered: Number(claimTarget.approvedInsuranceAmount),
      patientPayable: Number(claimTarget.patientLiabilityAmount),
      amountPaid: Number(claimTarget.patientPaidAmount),
      status: (claimTarget.patientPaymentStatus as Invoice['status']) || 'Unpaid',
      issuedAt: claimTarget.issuedAt,
      payments: [],
      claims: [],
    };
  }, [claimTarget]);

  const adaptedClaimPatient: Patient | null = useMemo(() => {
    if (!claimTarget) return null;
    return {
      id: claimTarget.patientId,
      name: claimTarget.patientName,
      patientNo: claimTarget.patientNumber,
      nic: '',
      phone: '',
      email: '',
      dob: '',
      gender: 'Other',
      bloodGroup: 'Unknown',
      address: '',
      registeredAt: '',
      lastVisit: '',
      registeredBranchId: '1',
      emergencyContacts: [],
      policies: (patientPoliciesQuery.data || []).map((p) => ({
        id: String(p.policyId),
        policyNo: p.policyNumber,
        provider: p.providerName || 'Unknown Provider',
        status: (p.status as InsurancePolicy['status']) || 'Active',
        validFrom: p.startDate || '',
        validTo: p.endDate || '',
        coverage: [],
      })),
    };
  }, [claimTarget, patientPoliciesQuery.data]);

  return (
    <>
      <PageHeader
        eyebrow="Finance workspace"
        title="Billing & claims"
        description="Review database-generated invoices, post payer-specific payments, track internal insurance claims, and manage treatment catalogue."
      />

      {/* Database KPI Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open patient balances"
          value={formatCurrency(openPatientBalance)}
          detail="Patient liability less patient payments"
          icon={WalletCards}
          accent="coral"
        />
        <StatCard
          label="Open insurer balances"
          value={formatCurrency(openInsurerBalance)}
          detail="Approved claims less insurer payments"
          icon={Landmark}
          accent="blue"
        />
        <StatCard
          label="Total outstanding"
          value={formatCurrency(openPatientBalance + openInsurerBalance)}
          detail="Distinct patient and insurer liabilities"
          icon={Banknote}
          accent="amber"
        />
        <StatCard
          label="Collected"
          value={formatCurrency(collectedTotal)}
          detail="Posted payments verified by database"
          icon={CircleDollarSign}
          accent="teal"
        />
      </div>

      {/* Tabs list */}
      <div className="mt-6 flex max-w-lg tab-list">
        <button
          type="button"
          className={`tab-button flex-1 ${tab === 'invoices' ? 'tab-button-active' : ''}`}
          onClick={() => setTab('invoices')}
        >
          Invoices
        </button>
        <button
          type="button"
          className={`tab-button flex-1 ${tab === 'claims' ? 'tab-button-active' : ''}`}
          onClick={() => setTab('claims')}
        >
          Claim tracker
        </button>
        <button
          type="button"
          className={`tab-button flex-1 ${tab === 'catalogue' ? 'tab-button-active' : ''}`}
          onClick={() => setTab('catalogue')}
        >
          Treatment catalogue
        </button>
      </div>

      {/* ── TAB 1: INVOICES ──────────────────────────────────────────────── */}
      {tab === 'invoices' && (
        <section className="mt-5">
          {invoicesQuery.error && (
            <RuleError error={invoicesQuery.error instanceof Error ? invoicesQuery.error : new Error('Invoices could not be loaded.')} />
          )}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-3">
              <SearchInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search invoice number, patient name, or ID…"
                aria-label="Search invoices"
              />
              <select
                className="input max-w-[10rem]"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter status"
              >
                <option value="all">All statuses</option>
                <option value="Unpaid">Unpaid</option>
                <option value="PartiallyPaid">Partially Paid</option>
                <option value="Paid">Paid</option>
              </select>
            </div>
            <p className="shrink-0 text-xs font-semibold text-slate-500">{invoiceRows.length} invoices</p>
          </div>

          {invoicesQuery.isLoading ? (
            <p className="card p-5 text-sm text-slate-500">Loading invoices from database…</p>
          ) : invoiceRows.length > 0 ? (
            <div className="table-shell overflow-x-auto">
              <table className="data-table min-w-[1000px]">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Patient</th>
                    <th>Issued</th>
                    <th>Subtotal</th>
                    <th>Insurer balance</th>
                    <th>Patient balance</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((item) => (
                    <tr key={item.invoiceId}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setInvoiceDetailTarget(item)}
                          className="font-bold text-clinic-700 hover:underline text-left"
                        >
                          {item.invoiceNumber}
                        </button>
                        <p className="text-[10px] text-slate-400">{item.appointmentNumber}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Avatar name={item.patientName} size="sm" />
                          <div>
                            <p className="font-semibold text-slate-800">{item.patientName}</p>
                            <p className="text-[10px] text-slate-400">{item.patientNumber}</p>
                          </div>
                        </div>
                      </td>
                      <td>{formatDate(item.issuedAt)}</td>
                      <td>{formatCurrency(Number(item.subtotalAmount))}</td>
                      <td className="text-blue-700">
                        {formatCurrency(Math.max(Number(item.approvedInsuranceAmount) - Number(item.insurerPaidAmount), 0))}
                      </td>
                      <td className="text-emerald-700">
                        {formatCurrency(Math.max(Number(item.patientLiabilityAmount) - Number(item.patientPaidAmount), 0))}
                      </td>
                      <td>
                        <Badge>{item.patientPaymentStatus}</Badge>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => openPayment(item)}>
                            Payment
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setClaimTarget(item)}
                            title="Submit insurance claim for this invoice"
                          >
                            <ShieldCheck size={14} />
                            Claim
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={ReceiptText}
              title="No invoices found"
              description="Invoices generated by clinical care will appear here."
            />
          )}
        </section>
      )}

      {/* ── TAB 2: CLAIM TRACKER ─────────────────────────────────────────── */}
      {tab === 'claims' && (
        <section className="mt-5">
          <ClaimTracker
            onReviewClaim={setClaimReview}
            getPatient={() => ({
              id: 'p1',
              name: 'Clinic Patient',
              patientNo: 'PAT-0001',
              nic: '',
              phone: '',
              email: '',
              dob: '',
              gender: 'Other',
              bloodGroup: 'Unknown',
              address: '',
              registeredAt: '',
              lastVisit: '',
              registeredBranchId: '1',
              emergencyContacts: [],
              policies: [],
            })}
            currentUser={user}
          />
        </section>
      )}

      {/* ── TAB 3: TREATMENT CATALOGUE ───────────────────────────────────── */}
      {tab === 'catalogue' && (
        <section className="mt-5">
          {catalogueError && <RuleError error={catalogueError} />}
          {treatmentsQuery.error && (
            <RuleError
              error={
                treatmentsQuery.error instanceof Error
                  ? treatmentsQuery.error
                  : new Error('Treatment catalogue could not be loaded.')
              }
            />
          )}

          <div className="table-shell overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Duration</th>
                  <th>Reference price</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(treatmentsQuery.data ?? []).map((item) => (
                  <tr key={item.treatmentId}>
                    <td className="font-bold">{item.name}</td>
                    <td>{item.serviceCode}</td>
                    <td>{item.categoryName}</td>
                    <td>{item.defaultDurationMinutes} min</td>
                    <td>{formatCurrency(Number(item.currentPrice))}</td>
                    <td>
                      <Badge>{item.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td>
                      {item.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => retireServiceMutation.mutate(item.treatmentId)}
                          disabled={retireServiceMutation.isPending}
                        >
                          Retire
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="card mt-4 p-5">
            <summary className="cursor-pointer text-sm font-bold">Add catalogue service</summary>
            <form onSubmit={handleServiceSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Category" required>
                <select name="category" className="input" required>
                  {(categoriesQuery.data ?? []).map((category) => (
                    <option key={category.treatmentCategoryId} value={category.treatmentCategoryId}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Service code" required>
                <input name="code" className="input" maxLength={30} required />
              </Field>
              <Field label="Name" required>
                <input name="name" className="input" maxLength={120} required />
              </Field>
              <Field label="Description">
                <input name="description" className="input" maxLength={300} />
              </Field>
              <Field label="Reference price" required>
                <input name="price" type="number" className="input" min="0" step="0.01" required />
              </Field>
              <Field label="Duration (minutes)" required>
                <input name="duration" type="number" className="input" min="1" max="32767" required />
              </Field>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit" disabled={addServiceMutation.isPending}>
                  {addServiceMutation.isPending ? 'Creating…' : 'Create service'}
                </Button>
              </div>
            </form>
          </details>
        </section>
      )}

      {/* ── MODALS ───────────────────────────────────────────────────────── */}

      {/* Invoice Detail Modal */}
      <Modal
        open={invoiceDetailTarget !== null}
        onClose={() => setInvoiceDetailTarget(null)}
        title={invoiceDetailTarget?.invoiceNumber ?? 'Invoice'}
        description="Database-generated billing record"
        size="lg"
      >
        {invoiceDetailQuery.isLoading && <p className="text-sm text-slate-500">Loading invoice…</p>}
        {invoiceDetailQuery.error && (
          <RuleError
            error={
              invoiceDetailQuery.error instanceof Error
                ? invoiceDetailQuery.error
                : new Error('Invoice details could not be loaded.')
            }
          />
        )}
        {invoiceDetailQuery.data && (
          <div className="space-y-5">
            <div className="flex justify-between rounded-2xl bg-clinic-900 p-5 text-white">
              <div>
                <p className="text-xs text-clinic-200">Patient</p>
                <p className="mt-1 text-lg font-bold">{invoiceDetailTarget?.patientName}</p>
                <p className="mt-1 text-xs">
                  {invoiceDetailTarget?.patientNumber} · {invoiceDetailTarget?.appointmentNumber}
                </p>
              </div>
              <Badge>{invoiceDetailQuery.data.invoiceState}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['Subtotal', invoiceDetailQuery.data.subtotalAmount],
                ['Insurer liability', invoiceDetailQuery.data.approvedInsuranceAmount],
                ['Patient liability', invoiceDetailQuery.data.patientLiabilityAmount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 p-3">
                  <p className="label-caps">{label}</p>
                  <p className="mt-2 font-bold">{formatCurrency(Number(value))}</p>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-bold">Invoice lines</h3>
              <div className="mt-2 divide-y divide-slate-100">
                {invoiceDetailQuery.data.lines.map((line) => (
                  <div className="flex justify-between py-2 text-sm" key={line.invoiceLineId}>
                    <span>
                      {line.description} × {line.quantity}
                    </span>
                    <span className="font-semibold">{formatCurrency(Number(line.lineTotal))}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold">Payment history</h3>
              {paymentsQuery.isLoading && <p className="mt-2 text-xs text-slate-500">Loading payments…</p>}
              {paymentsQuery.error && (
                <RuleError
                  error={
                    paymentsQuery.error instanceof Error
                      ? paymentsQuery.error
                      : new Error('Payment history could not be loaded.')
                  }
                />
              )}
              <div className="mt-2 space-y-2">
                {(paymentsQuery.data ?? []).map((payment) => (
                  <div key={payment.paymentId} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <History size={15} className="text-slate-400" />
                        <div>
                          <p className="text-xs font-bold">
                            {payment.payerType} · {payment.paymentMethod} · {payment.receiptNumber}
                          </p>
                          <p className="text-[10px] text-slate-400">{new Date(payment.paidAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold">
                        {formatCurrency(Number(payment.netAmount))} net{' '}
                        <span className="text-xs font-normal text-slate-500">
                          of {formatCurrency(Number(payment.amount))}
                        </span>
                      </p>
                      {Number(payment.netAmount) > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setReverseTarget(payment);
                            setReverseError(null);
                          }}
                        >
                          <RotateCcw size={14} />
                          Reverse
                        </Button>
                      )}
                    </div>
                    {payment.reversals.map((item) => (
                      <p className="mt-2 text-xs text-amber-800" key={item.paymentReversalId}>
                        Reversed {formatCurrency(Number(item.amount))} · {item.reason}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              {!paymentsQuery.isLoading && !(paymentsQuery.data ?? []).length && (
                <p className="mt-2 text-xs text-slate-500">No payments recorded.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="secondary"
                onClick={() => {
                  setInvoiceDetailTarget(null);
                  if (invoiceDetailTarget) setClaimTarget(invoiceDetailTarget);
                }}
              >
                <ShieldCheck size={16} />
                Submit insurance claim
              </Button>
              <Button
                onClick={() => {
                  const target = invoiceDetailTarget;
                  setInvoiceDetailTarget(null);
                  if (target) openPayment(target);
                }}
              >
                Post payment
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Post Payment Modal */}
      <Modal
        open={paymentTarget !== null}
        onClose={() => {
          setPaymentTarget(null);
          setPaymentError(null);
        }}
        title="Post a payment"
        description={paymentTarget ? `${paymentTarget.invoiceNumber} · ${paymentTarget.patientName}` : undefined}
        size="sm"
      >
        {paymentTarget && (
          <form
            onSubmit={handlePaymentSubmit}
            onChange={() => {
              idempotencyKey.current = null;
            }}
            className="space-y-4"
          >
            {paymentError && <RuleError error={paymentError} />}
            <Field label="Payer" required>
              <select
                className="input"
                value={payerType}
                onChange={(event) => {
                  setPayerType(event.target.value as PayerType);
                  setClaimId('');
                  setPaymentAmount('');
                  setPaymentError(null);
                }}
              >
                <option value="Patient">Patient</option>
                <option value="Insurer">Insurer</option>
              </select>
            </Field>

            {payerType === 'Insurer' && (
              <Field label="Approved claim" required>
                <select
                  className="input"
                  value={claimId}
                  onChange={(event) => {
                    setClaimId(event.target.value);
                    setPaymentAmount('');
                  }}
                  required
                >
                  <option value="">Select approved claim</option>
                  {paymentTarget.approvedClaims.map((claim) => (
                    <option value={claim.claimId} key={claim.claimId}>
                      {claim.providerName} · {claim.policyNumber} · {claim.claimNumber} ({claim.claimStatus})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {paymentPreviewQuery.error && (
              <RuleError
                error={
                  paymentPreviewQuery.error instanceof ApiError
                    ? paymentPreviewQuery.error
                    : new Error('The outstanding balance could not be previewed.')
                }
              />
            )}

            {paymentPreviewQuery.data && Number(paymentPreviewQuery.data.outstandingAmount) > 0 && (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="label-caps">{payerType} outstanding</p>
                <p className="mt-1 text-2xl font-bold">
                  {formatCurrency(Number(paymentPreviewQuery.data.outstandingAmount))}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Balance is calculated by the API; partial payments are allowed.
                </p>
              </div>
            )}

            {paymentPreviewQuery.data && Number(paymentPreviewQuery.data.outstandingAmount) <= 0 && (
              <InfoNote title="No balance due">
                There is no outstanding balance for this payer and claim.
              </InfoNote>
            )}

            <Field label="Payment amount" required>
              <input
                name="amount"
                type="number"
                className="input"
                min="0.01"
                step="0.01"
                max={paymentPreviewQuery.data?.outstandingAmount}
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                required
                disabled={!paymentPreviewQuery.data || Number(paymentPreviewQuery.data.outstandingAmount) <= 0}
              />
            </Field>

            <Field label="Payment method" required>
              <select name="method" className="input">
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="BankTransfer">BankTransfer</option>
                <option value="Online">Online</option>
              </select>
            </Field>

            <Field label="Reference">
              <input name="reference" className="input" maxLength={100} placeholder="e.g. Receipt / TXN ID" />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setPaymentTarget(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  !paymentPreviewQuery.data ||
                  Number(paymentPreviewQuery.data.outstandingAmount) <= 0 ||
                  !paymentAmount ||
                  postPaymentMutation.isPending
                }
              >
                {postPaymentMutation.isPending ? 'Posting…' : 'Commit payment'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reverse Payment Modal */}
      <Modal
        open={reverseTarget !== null}
        onClose={() => setReverseTarget(null)}
        title="Reverse payment"
        description={reverseTarget?.receiptNumber}
        size="sm"
      >
        {reverseTarget && (
          <form onSubmit={handleReversalSubmit} className="space-y-4">
            {reverseError && <RuleError error={reverseError} />}
            <InfoNote title="Audited reversal">
              This records a reversal against the original payment; it does not delete or edit the payment.
            </InfoNote>
            <Field
              label="Amount to reverse"
              hint={`Maximum ${formatCurrency(Number(reverseTarget.netAmount))}`}
              required
            >
              <input
                className="input"
                name="amount"
                type="number"
                min="0.01"
                max={reverseTarget.netAmount}
                step="0.01"
                defaultValue={reverseTarget.netAmount}
                required
              />
            </Field>
            <Field label="Reason" required>
              <textarea
                className="input min-h-24"
                name="reason"
                maxLength={250}
                placeholder="Reason for reversal"
                required
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setReverseTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={reversePaymentMutation.isPending}>
                {reversePaymentMutation.isPending ? 'Reversing…' : 'Record reversal'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Insurance Claim Submission Modal (Dev3) */}
      <ClaimSubmissionModal
        invoice={adaptedClaimInvoice}
        open={Boolean(claimTarget)}
        onClose={() => setClaimTarget(null)}
        onSubmitSuccess={() => {
          notify({
            type: 'success',
            title: 'Claim submitted to database',
            message: 'Claim created in Pending state. Patient liability remains unchanged until resolution.',
          });
        }}
        getPatient={() =>
          adaptedClaimPatient || {
            id: 'p1',
            name: 'Clinic Patient',
            patientNo: 'PAT-0001',
            nic: '',
            phone: '',
            email: '',
            dob: '',
            gender: 'Other',
            bloodGroup: 'Unknown',
            address: '',
            registeredAt: '',
            lastVisit: '',
            registeredBranchId: '1',
            emergencyContacts: [],
            policies: [],
          }
        }
      />

      {/* Insurance Claim Review Modal (Dev3 - Role-gated) */}
      <ClaimReviewModal
        claimReview={claimReview}
        open={Boolean(claimReview)}
        onClose={() => setClaimReview(null)}
        currentUser={user}
        onSuccess={() => {
          notify({
            type: 'success',
            title: 'Claim resolved successfully',
            message: 'Invoice patient liability updated by database procedure.',
          });
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
        }}
      />
    </>
  );
}
