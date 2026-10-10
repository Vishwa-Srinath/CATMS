/**
 * src/features/clinical-billing/components/InvoiceDetailModal.tsx
 * Owner: Dev4 | Issue: CATMS-057
 *
 * Detailed invoice overview modal with billing breakdown and payment history.
 */

import { Banknote, FilePlus2, History } from 'lucide-react';
import type { Appointment, Invoice, Patient } from '../../../types';
import { formatCurrency, outstanding } from '../../../lib/domain';
import { Badge, Button, InfoNote, Modal } from '../../../components/ui';

export interface InvoiceDetailModalProps {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onOpenPayment: (invoice: Invoice) => void;
  onOpenClaim: (invoice: Invoice) => void;
  getPatient: (invoice: Invoice) => Patient;
  getAppointment: (invoice: Invoice) => Appointment;
}

export function InvoiceDetailModal({
  invoice,
  open,
  onClose,
  onOpenPayment,
  onOpenClaim,
  getPatient,
  getAppointment,
}: InvoiceDetailModalProps) {
  if (!invoice) return null;

  const patient = getPatient(invoice);
  const apt = getAppointment(invoice);
  const balance = outstanding(invoice);
  const hasActivePolicies = patient.policies.some((p) => p.status === 'Active');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={invoice.invoiceNo}
      description="Database-generated billing record"
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-4 rounded-2xl bg-clinic-900 p-5 text-white sm:flex-row sm:items-center">
          <div>
            <p className="text-xs text-clinic-200">Patient</p>
            <p className="mt-1 text-lg font-bold">{patient.name}</p>
            <p className="mt-1 text-xs text-clinic-100/70">
              {patient.patientNo} · {apt?.reference}
            </p>
          </div>
          <Badge>{invoice.status}</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Subtotal', value: invoice.subtotal },
            { label: 'Insurance', value: invoice.insuranceCovered },
            { label: 'Patient payable', value: invoice.patientPayable },
            { label: 'Outstanding', value: balance },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-200 p-3">
              <p className="label-caps">{item.label}</p>
              <p className="mt-2 text-sm font-bold text-slate-800">{formatCurrency(item.value)}</p>
            </div>
          ))}
        </div>

        <InfoNote title="Read-only calculated totals">
          Subtotal, insurance-covered, patient-payable, paid, and status are maintained by database
          billing logic—not editable form fields.
        </InfoNote>

        <div>
          <h3 className="text-sm font-bold text-slate-900">Payment history</h3>
          <div className="mt-3 space-y-2">
            {invoice.payments.length ? (
              invoice.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-2">
                    <History size={15} className="text-slate-400" />
                    <div>
                      <p className="text-xs font-bold text-slate-700">
                        {payment.method} · {payment.reference}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(payment.paidAt).toLocaleString('en-LK')}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-emerald-700">{formatCurrency(payment.amount)}</p>
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">
                No patient payments recorded.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {hasActivePolicies && (
            <Button variant="secondary" onClick={() => onOpenClaim(invoice)}>
              <FilePlus2 size={16} />Submit claim
            </Button>
          )}
          {balance > 0 && (
            <Button onClick={() => onOpenPayment(invoice)}>
              <Banknote size={16} />Post payment
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
