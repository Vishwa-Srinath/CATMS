import { useState, type FormEvent } from 'react';
import { CircleDollarSign, Clock3, Landmark, Plus, WalletCards } from 'lucide-react';
import { useClinic } from '../context/ClinicContext';
import { ClinicRuleError, formatCurrency, outstanding } from '../lib/domain';
import type { Claim, Invoice } from '../types';
import { Button, PageHeader, StatCard } from '../components/ui';
import financeImage from '../assets/clinical/finance-calculator.webp';
import medicationImage from '../assets/clinical/medication-flatlay.webp';
import ApiFinancePage from './ApiFinancePage'

// Feature boundary split — Dev4 (Clinical/Billing/Catalogue) & Dev3 (Claims/Insurance)
import {
  InvoiceTable,
  InvoiceDetailModal,
  PaymentModal,
  TreatmentCatalogueTable,
  AddTreatmentModal,
} from '../features/clinical-billing';
import {
  ClaimTracker,
  ClaimSubmissionModal,
  ClaimReviewModal,
} from '../features/patients-insurance';

type Tab = 'invoices' | 'claims' | 'catalogue';

export default function FinancePage() {
  const [showApi, setShowApi] = useState(true)
  return showApi
    ? <ApiFinancePage onBack={() => setShowApi(false)} />
    : <DemoFinancePage onOpenApi={() => setShowApi(true)} />
}

function DemoFinancePage({ onOpenApi }: { onOpenApi: () => void }) {
  const { data, user, postPayment, addTreatment, toggleTreatment, notify } = useClinic();
  const [tab, setTab] = useState<Tab>('invoices');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [claimReview, setClaimReview] = useState<{ invoice: Invoice; claim: Claim } | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const getAppointment = (item: Invoice) =>
    data.appointments.find((appointment) => appointment.id === item.appointmentId)!;
  const getPatient = (item: Invoice) =>
    data.patients.find((patient) => patient.id === getAppointment(item).patientId)!;

  const invoices = data.invoices.filter((item) => {
    const patient = getPatient(item);
    const needle = query.toLowerCase();
    return (
      (!needle ||
        item.invoiceNo.toLowerCase().includes(needle) ||
        patient.name.toLowerCase().includes(needle) ||
        patient.patientNo.toLowerCase().includes(needle)) &&
      (status === 'all' || item.status === status)
    );
  });

  const claims = data.invoices.flatMap((item) => item.claims.map((claim) => ({ invoice: item, claim })));
  const totalOutstanding = data.invoices.reduce((sum, item) => sum + outstanding(item), 0);
  const collected = data.invoices.reduce((sum, item) => sum + item.amountPaid, 0);
  const pendingClaims = claims.filter((item) => item.claim.status === 'Pending');

  const handleError = (caught: unknown, title: string) => {
    setError(caught instanceof Error ? caught : new Error('The operation could not be completed.'));
    if (caught instanceof ClinicRuleError) {
      notify({ type: 'error', title, message: caught.message, code: caught.code });
    }
  };

  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invoice) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      postPayment(
        invoice.id,
        Number(form.get('amount')),
        form.get('method') as 'Cash' | 'Card' | 'Online' | 'Insurance',
        String(form.get('reference')),
      );
      setPaymentOpen(false);
      setInvoice(null);
    } catch (caught) {
      handleError(caught, 'Payment rejected');
    }
  };


  const submitTreatment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      addTreatment({
        serviceCode: String(form.get('code')).toUpperCase(),
        name: String(form.get('name')),
        category: String(form.get('category')),
        price: Number(form.get('price')),
        duration: Number(form.get('duration')),
      });
      setTreatmentOpen(false);
    } catch (caught) {
      handleError(caught, 'Catalogue update rejected');
    }
  };

  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="secondary" onClick={onOpenApi}>Open live API billing</Button></div>
      <PageHeader
        image={tab === 'catalogue' ? medicationImage : financeImage}
        eyebrow="Finance workspace"
        title="Billing & claims"
        description="Review database-generated invoices, post partial or full payments, and track internal insurance claims."
        actions={
          tab === 'catalogue' ? (
            <Button
              onClick={() => {
                setError(null);
                setTreatmentOpen(true);
              }}
            >
              <Plus size={16} />Add service
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open balances"
          value={formatCurrency(totalOutstanding)}
          detail="Across unpaid and partially paid invoices"
          icon={WalletCards}
          accent="coral"
        />
        <StatCard
          label="Collected"
          value={formatCurrency(collected)}
          detail="Recorded in the current demo period"
          icon={CircleDollarSign}
          accent="teal"
        />
        <StatCard
          label="Claims pending"
          value={pendingClaims.length}
          detail={`${formatCurrency(
            pendingClaims.reduce((sum, item) => sum + item.claim.claimedAmount, 0),
          )} under review`}
          icon={Clock3}
          accent="blue"
        />
        <StatCard
          label="Collection rate"
          value="68.4%"
          detail="Patient-payable value collected"
          icon={Landmark}
          accent="amber"
        />
      </div>

      <div className="mt-6 flex max-w-lg tab-list">
        <button
          className={`tab-button flex-1 ${tab === 'invoices' ? 'tab-button-active' : ''}`}
          onClick={() => setTab('invoices')}
        >
          Invoices
        </button>
        <button
          className={`tab-button flex-1 ${tab === 'claims' ? 'tab-button-active' : ''}`}
          onClick={() => setTab('claims')}
        >
          Insurance claims
        </button>
        <button
          className={`tab-button flex-1 ${tab === 'catalogue' ? 'tab-button-active' : ''}`}
          onClick={() => setTab('catalogue')}
        >
          Treatment catalogue
        </button>
      </div>

      {tab === 'invoices' && (
        <InvoiceTable
          invoices={invoices}
          query={query}
          onQueryChange={setQuery}
          status={status}
          onStatusChange={setStatus}
          onSelectInvoice={setInvoice}
          onOpenPayment={(item) => {
            setInvoice(item);
            setPaymentOpen(true);
            setError(null);
          }}
          getPatient={getPatient}
          getAppointment={getAppointment}
        />
      )}

      {tab === 'claims' && (
        <ClaimTracker
          claims={claims}
          pendingCount={pendingClaims.length}
          onReviewClaim={setClaimReview}
          getPatient={getPatient}
          currentUser={user}
        />
      )}

      {tab === 'catalogue' && (
        <TreatmentCatalogueTable
          treatments={data.treatments}
          onToggleTreatment={toggleTreatment}
        />
      )}

      {/* Invoice Details Modal (Dev4) */}
      <InvoiceDetailModal
        invoice={invoice}
        open={Boolean(invoice && !paymentOpen && !claimOpen)}
        onClose={() => setInvoice(null)}
        onOpenPayment={(item) => {
          setPaymentOpen(true);
          setError(null);
          setInvoice(item);
        }}
        onOpenClaim={(item) => {
          setClaimOpen(true);
          setError(null);
          setInvoice(item);
        }}
        getPatient={getPatient}
        getAppointment={getAppointment}
      />

      {/* Payment Posting Modal (Dev4) */}
      <PaymentModal
        invoice={invoice}
        open={paymentOpen}
        onClose={() => {
          setPaymentOpen(false);
          setInvoice(null);
        }}
        onSubmit={submitPayment}
        error={error}
        getPatient={getPatient}
      />

      {/* Insurance Claim Submission Modal (Dev3) */}
      <ClaimSubmissionModal
        invoice={invoice}
        open={claimOpen}
        onClose={() => {
          setClaimOpen(false);
          setInvoice(null);
        }}
        onSubmitSuccess={() => {
          notify({
            type: 'success',
            title: 'Claim submitted to database',
            message: 'Claim created in Pending state. Patient liability remains unchanged until resolution.',
          });
        }}
        error={error}
        getPatient={getPatient}
      />

      {/* Claim Review Modal (Dev3) */}
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
        }}
      />

      {/* Add Treatment Service Modal (Dev4) */}
      <AddTreatmentModal
        open={treatmentOpen}
        onClose={() => setTreatmentOpen(false)}
        onSubmit={submitTreatment}
        error={error}
      />
    </>
  );
}
