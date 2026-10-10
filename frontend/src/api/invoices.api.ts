/**
 * src/api/invoices.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Invoices and billing lines API client.
 */

import { apiClient } from './client';

export interface InvoiceLineDto {
  invoiceLineId: number;
  treatmentName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface InvoiceDto {
  invoiceId: number;
  invoiceNo: string;
  appointmentId: number;
  patientId: number;
  patientName: string;
  patientNo: string;
  subtotal: number;
  insuranceCovered: number;
  patientLiability: number;
  amountPaid: number;
  outstandingBalance: number;
  status: 'Unpaid' | 'PartiallyPaid' | 'Paid';
  issuedAt: string;
  lines?: InvoiceLineDto[];
}

export interface InvoiceListParams {
  patientId?: number;
  status?: string;
  query?: string;
}

export const invoicesApi = {
  list: (params?: InvoiceListParams) =>
    apiClient.get<InvoiceDto[]>('/invoices', { params }),

  getById: (invoiceId: number) =>
    apiClient.get<InvoiceDto>(`/invoices/${invoiceId}`),
};
