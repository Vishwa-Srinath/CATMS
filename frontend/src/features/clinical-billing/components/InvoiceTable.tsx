/**
 * src/features/clinical-billing/components/InvoiceTable.tsx
 * Owner: Dev4 | Issue: CATMS-057
 *
 * Invoices table, search and status filter component.
 */

import { Banknote, MoreHorizontal, ReceiptText } from 'lucide-react';
import type { Appointment, Invoice, Patient } from '../../../types';
import { formatCurrency, formatDate, outstanding } from '../../../lib/domain';
import { Avatar, Badge, Button, EmptyState, SearchInput } from '../../../components/ui';

export interface InvoiceTableProps {
  invoices: Invoice[];
  query: string;
  onQueryChange: (query: string) => void;
  status: string;
  onStatusChange: (status: string) => void;
  onSelectInvoice: (invoice: Invoice) => void;
  onOpenPayment: (invoice: Invoice) => void;
  getPatient: (invoice: Invoice) => Patient;
  getAppointment: (invoice: Invoice) => Appointment;
}

export function InvoiceTable({
  invoices,
  query,
  onQueryChange,
  status,
  onStatusChange,
  onSelectInvoice,
  onOpenPayment,
  getPatient,
  getAppointment,
}: InvoiceTableProps) {
  return (
    <section className="mt-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_13rem_auto]">
        <SearchInput
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search invoice or patient…"
          aria-label="Search invoices"
        />
        <select
          className="input"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          aria-label="Invoice status"
        >
          <option value="all">All payment statuses</option>
          <option>Unpaid</option>
          <option value="PartiallyPaid">Partially paid</option>
          <option>Paid</option>
        </select>
        <p className="self-center text-xs font-semibold text-slate-500">{invoices.length} invoices</p>
      </div>

      {invoices.length ? (
        <div className="table-shell overflow-x-auto">
          <table className="data-table min-w-[1000px]">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Patient</th>
                <th>Issued</th>
                <th>Subtotal</th>
                <th>Covered</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((item) => {
                const patient = getPatient(item);
                const apt = getAppointment(item);
                const balance = outstanding(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <button
                        onClick={() => onSelectInvoice(item)}
                        className="font-bold text-clinic-700 hover:underline"
                      >
                        {item.invoiceNo}
                      </button>
                      <p className="mt-0.5 text-[10px] text-slate-400">{apt?.reference}</p>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={patient.name} size="sm" />
                        <div>
                          <p className="font-semibold text-slate-800">{patient.name}</p>
                          <p className="text-[10px] text-slate-400">{patient.patientNo}</p>
                        </div>
                      </div>
                    </td>
                    <td>{formatDate(item.issuedAt)}</td>
                    <td className="font-semibold text-slate-700">{formatCurrency(item.subtotal)}</td>
                    <td className="text-blue-700">{formatCurrency(item.insuranceCovered)}</td>
                    <td className="text-emerald-700">{formatCurrency(item.amountPaid)}</td>
                    <td className="font-bold text-slate-900">{formatCurrency(balance)}</td>
                    <td>
                      <Badge>{item.status}</Badge>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {balance > 0 && (
                          <Button size="sm" onClick={() => onOpenPayment(item)}>
                            <Banknote size={14} />Payment
                          </Button>
                        )}
                        <button
                          onClick={() => onSelectInvoice(item)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
                          aria-label={`View ${item.invoiceNo}`}
                        >
                          <MoreHorizontal size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="No matching invoices"
          description="Adjust the search or payment-status filter."
        />
      )}
    </section>
  );
}
