import { apiClient } from './client'

export interface ApiClinicalWorklistItem {
  appointmentId: string
  appointmentNumber: string
  patientId: string
  patientNumber: string
  patientName: string
  doctorId: string
  doctorName: string
  branchId: string
  branchName: string
  startAt: string
  consultationRevisionNo: number | null
  treatmentCount: number
}

export interface ApiTreatment {
  treatmentId: string
  treatmentCategoryId: string
  categoryName: string
  serviceCode: string
  name: string
  description: string | null
  currentPrice: string
  defaultDurationMinutes: number
  isConsultationService: boolean
  isActive: boolean
}

export interface ApiTreatmentCategory {
  treatmentCategoryId: string
  categoryCode: string
  name: string
}

export interface ApiInvoiceLine {
  invoiceLineId: string
  lineNumber: number
  serviceCode: string
  description: string
  quantity: string
  unitPrice: string
  lineTotal: string
}

export interface ApiInvoice {
  invoiceId: string
  invoiceNumber: string
  appointmentId: string
  invoiceState: string
  currencyCode: string
  subtotalAmount: string
  approvedInsuranceAmount: string
  patientLiabilityAmount: string
  patientPaidAmount: string
  insurerPaidAmount: string
  patientPaymentStatus: string
  issuedAt: string
  lines: ApiInvoiceLine[]
}

export interface ApiInvoiceSummary extends Omit<ApiInvoice, 'lines'> {
  patientId: string
  patientNumber: string
  patientName: string
  appointmentNumber: string
  approvedClaims: Array<{
    claimId: string
    claimNumber: string
    claimStatus: string
    approvedAmount: string
    policyNumber: string
    providerName: string
  }>
}

export interface ApiPayment {
  paymentId: string
  invoiceId: string
  receiptNumber: string
  payerType: 'Patient' | 'Insurer'
  insuranceClaimId: string | null
  amount: string
  paymentMethod: 'Cash' | 'Card' | 'BankTransfer' | 'Online'
  paymentStatus: string
  paidAt: string
  referenceNumber: string | null
  reversedAmount: string
  netAmount: string
  reversals: Array<{
    paymentReversalId: string
    amount: string
    reason: string
    reversedAt: string
  }>
}

export interface ApiPaymentPreview {
  invoiceId: string
  payerType: 'Patient' | 'Insurer'
  insuranceClaimId?: string
  approvedClaimAmount?: string
  paidAgainstClaim?: string
  outstandingAmount: string
}

export interface RecordCareRequest {
  notes: string
  diagnosis_summary?: string | null
  vitals?: Record<string, string | number | boolean | null>
  treatments: Array<{
    treatmentId: string
    quantity: string
  }>
}

export interface CreatePaymentRequest {
  invoiceId: string
  payerType: 'Patient' | 'Insurer'
  insuranceClaimId?: string
  amount: string
  paymentMethod: ApiPayment['paymentMethod']
  idempotencyKey: string
  referenceNumber?: string
}

export interface CreateTreatmentRequest {
  treatmentCategoryId: string
  serviceCode: string
  name: string
  description?: string | null
  currentPrice: string
  defaultDurationMinutes: number
  isConsultationService?: boolean
}

export async function fetchClinicalWorklist(branchId?: string): Promise<ApiClinicalWorklistItem[]> {
  return apiClient.get('/clinical/worklist', { params: { branchId } })
}

export async function fetchTreatments(includeInactive = false): Promise<ApiTreatment[]> {
  return apiClient.get('/treatments', { params: { includeInactive: includeInactive ? 'true' : undefined } })
}

export async function fetchTreatmentCategories(): Promise<ApiTreatmentCategory[]> {
  return apiClient.get('/treatments/categories')
}

export async function createTreatment(input: CreateTreatmentRequest): Promise<ApiTreatment> {
  return apiClient.post('/treatments', input)
}

export async function deactivateTreatment(treatmentId: string): Promise<void> {
  return apiClient.delete(`/treatments/${encodeURIComponent(treatmentId)}`)
}

export async function recordCare(
  appointmentId: string,
  input: RecordCareRequest,
): Promise<{ appointmentId: string; consultationNoteId: string; treatmentIds: string[]; invoiceId: string }> {
  return apiClient.post(`/clinical/${encodeURIComponent(appointmentId)}/record`, input)
}

export async function fetchInvoice(invoiceId: string): Promise<ApiInvoice> {
  return apiClient.get(`/invoices/${encodeURIComponent(invoiceId)}`)
}

export async function fetchInvoices(): Promise<ApiInvoiceSummary[]> {
  return apiClient.get('/invoices')
}

export async function fetchPayments(invoiceId: string): Promise<ApiPayment[]> {
  return apiClient.get('/payments', { params: { invoiceId } })
}

export async function previewPayment(input: {
  invoiceId: string
  payerType: 'Patient' | 'Insurer'
  insuranceClaimId?: string
}): Promise<ApiPaymentPreview> {
  return apiClient.post('/payments/preview', input)
}

export async function postPayment(input: CreatePaymentRequest): Promise<ApiPayment> {
  return apiClient.post('/payments', input)
}

export async function reversePayment(
  paymentId: string,
  input: { amount: string; reason: string },
): Promise<{ paymentReversalId: string; payment: ApiPayment }> {
  return apiClient.post(`/payments/${encodeURIComponent(paymentId)}/reverse`, input)
}
