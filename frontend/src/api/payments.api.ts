/**
 * src/api/payments.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Payment posting, idempotency handling and reversals API client.
 */

import { apiClient } from './client';

export interface PaymentDto {
  paymentId: number;
  invoiceId: number;
  amount: number;
  method: 'Cash' | 'Card' | 'Online' | 'Insurance';
  reference: string;
  payerType: 'Patient' | 'Insurer';
  paidAt: string;
  isReversed: boolean;
}

export interface PaymentPreviewDto {
  invoiceId: number;
  currentOutstanding: number;
  amountToPay: number;
  resultingOutstanding: number;
}

export interface PostPaymentInput {
  invoiceId: number;
  amount: number;
  method: 'Cash' | 'Card' | 'Online' | 'Insurance';
  reference: string;
  payerType?: 'Patient' | 'Insurer';
}

export const paymentsApi = {
  list: (invoiceId: number) =>
    apiClient.get<PaymentDto[]>('/payments', { params: { invoiceId } }),

  preview: (invoiceId: number, amount: number, payerType: 'Patient' | 'Insurer' = 'Patient') =>
    apiClient.post<PaymentPreviewDto>('/payments/preview', { invoiceId, amount, payerType }),

  postPayment: (data: PostPaymentInput, idempotencyKey?: string) => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      headers['Idempotency-Key'] = crypto.randomUUID();
    }
    return apiClient.post<PaymentDto>('/payments', data, { headers });
  },

  reverse: (paymentId: number, reason: string) =>
    apiClient.post<PaymentDto>(`/payments/${paymentId}/reverse`, { reason }),
};
