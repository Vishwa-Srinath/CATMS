export interface ClinicalWorklistItem {
  appointmentId: string;
  appointmentNumber: string;
  patientId: string;
  patientNumber: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  branchId: string;
  branchName: string;
  startAt: string;
  consultationRevisionNo: number | null;
  treatmentCount: number;
}

export interface TreatmentDto {
  treatmentId: string;
  treatmentCategoryId: string;
  categoryName: string;
  serviceCode: string;
  name: string;
  description: string | null;
  currentPrice: string;
  defaultDurationMinutes: number;
  isConsultationService: boolean;
  isActive: boolean;
}

export interface InvoiceLineDto {
  invoiceLineId: string;
  lineNumber: number;
  serviceCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface InvoiceDto {
  invoiceId: string;
  invoiceNumber: string;
  appointmentId: string;
  invoiceState: string;
  currencyCode: string;
  subtotalAmount: string;
  approvedInsuranceAmount: string;
  patientLiabilityAmount: string;
  patientPaidAmount: string;
  insurerPaidAmount: string;
  patientPaymentStatus: string;
  issuedAt: string;
  lines: InvoiceLineDto[];
}

export interface PaymentDto {
  paymentId: string;
  invoiceId: string;
  receiptNumber: string;
  payerType: 'Patient' | 'Insurer';
  insuranceClaimId: string | null;
  amount: string;
  paymentMethod: string;
  paymentStatus: string;
  paidAt: string;
  referenceNumber: string | null;
  reversedAmount: string;
  netAmount: string;
  reversals: Array<{
    paymentReversalId: string;
    amount: string;
    reason: string;
    reversedAt: string;
  }>;
}
