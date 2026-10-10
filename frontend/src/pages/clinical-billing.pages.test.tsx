// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as clinicalBillingApi from '../api/clinical-billing'
import type {
  ApiClinicalWorklistItem,
  ApiInvoice,
  ApiInvoiceSummary,
  ApiPayment,
  ApiTreatment,
} from '../api/clinical-billing'
import { formatCurrency } from '../lib/domain'
import ApiClinicalPage from './ApiClinicalPage'
import ApiFinancePage from './ApiFinancePage'

vi.mock('../api/clinical-billing', () => ({
  createTreatment: vi.fn(),
  deactivateTreatment: vi.fn(),
  fetchClinicalWorklist: vi.fn(),
  fetchInvoice: vi.fn(),
  fetchInvoices: vi.fn(),
  fetchPayments: vi.fn(),
  fetchTreatmentCategories: vi.fn(),
  fetchTreatments: vi.fn(),
  postPayment: vi.fn(),
  previewPayment: vi.fn(),
  recordCare: vi.fn(),
  reversePayment: vi.fn(),
}))

const worklistItem: ApiClinicalWorklistItem = {
  appointmentId: 'appointment-1',
  appointmentNumber: 'APT-1001',
  patientId: 'patient-1',
  patientNumber: 'PAT-1001',
  patientName: 'Asha Perera',
  doctorId: 'doctor-1',
  doctorName: 'Dr. Silva',
  branchId: 'branch-1',
  branchName: 'Colombo',
  startAt: '2026-01-15',
  consultationRevisionNo: null,
  treatmentCount: 0,
}

const treatment: ApiTreatment = {
  treatmentId: 'treatment-1',
  treatmentCategoryId: 'category-1',
  categoryName: 'Consultation',
  serviceCode: 'CONS-01',
  name: 'General consultation',
  description: null,
  currentPrice: '125.00',
  defaultDurationMinutes: 30,
  isConsultationService: true,
  isActive: true,
}

const invoiceSummary: ApiInvoiceSummary = {
  invoiceId: 'invoice-1',
  invoiceNumber: 'INV-1001',
  appointmentId: worklistItem.appointmentId,
  invoiceState: 'Issued',
  currencyCode: 'LKR',
  subtotalAmount: '125.00',
  approvedInsuranceAmount: '25.00',
  patientLiabilityAmount: '100.00',
  patientPaidAmount: '0.00',
  insurerPaidAmount: '0.00',
  patientPaymentStatus: 'Due',
  issuedAt: '2026-01-15',
  patientId: worklistItem.patientId,
  patientNumber: worklistItem.patientNumber,
  patientName: worklistItem.patientName,
  appointmentNumber: worklistItem.appointmentNumber,
  approvedClaims: [],
}

const invoice: ApiInvoice = {
  ...invoiceSummary,
  lines: [{
    invoiceLineId: 'line-1',
    lineNumber: 1,
    serviceCode: treatment.serviceCode,
    description: treatment.name,
    quantity: '1',
    unitPrice: '125.00',
    lineTotal: '125.00',
  }],
}

const payment: ApiPayment = {
  paymentId: 'payment-1',
  invoiceId: invoiceSummary.invoiceId,
  receiptNumber: 'RCT-1001',
  payerType: 'Patient',
  insuranceClaimId: null,
  amount: '100.00',
  paymentMethod: 'Cash',
  paymentStatus: 'Posted',
  paidAt: '2026-01-15T11:00:00.000Z',
  referenceNumber: null,
  reversedAmount: '0.00',
  netAmount: '100.00',
  reversals: [],
}

const postedPayment: ApiPayment = {
  ...payment,
  reversedAmount: '100.00',
  netAmount: '0.00',
  paymentStatus: 'Reversed',
  reversals: [{
    paymentReversalId: 'reversal-1',
    amount: '100.00',
    reason: 'Duplicate payment',
    reversedAt: '2026-01-15T12:00:00.000Z',
  }],
}

function renderWithQueryClient(component: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>)
}

function currencyText(amount: number) {
  const formatted = formatCurrency(amount).replace(/\s+/g, ' ').trim()
  return (_text: string, element: Element | null) =>
    element?.textContent?.replace(/\s+/g, ' ').trim() === formatted
}

function expectCurrency(container: HTMLElement, amount: number) {
  expect(within(container).getAllByText(currencyText(amount)).length).toBeGreaterThan(0)
}

const api = vi.mocked(clinicalBillingApi)

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchClinicalWorklist.mockResolvedValue([worklistItem])
  api.fetchTreatments.mockResolvedValue([treatment])
  api.fetchTreatmentCategories.mockResolvedValue([])
  api.fetchInvoices.mockResolvedValue([invoiceSummary])
  api.fetchInvoice.mockResolvedValue(invoice)
  api.fetchPayments.mockResolvedValue([payment])
  api.previewPayment.mockResolvedValue({
    invoiceId: invoiceSummary.invoiceId,
    payerType: 'Patient',
    outstandingAmount: '100.00',
  })
  api.recordCare.mockResolvedValue({
    appointmentId: worklistItem.appointmentId,
    consultationNoteId: 'note-1',
    treatmentIds: [treatment.treatmentId],
    invoiceId: invoice.invoiceId,
  })
  api.postPayment.mockResolvedValue(payment)
  api.reversePayment.mockResolvedValue({ paymentReversalId: 'reversal-1', payment: postedPayment })
})

afterEach(() => cleanup())

describe('CATMS-068 clinical and billing page workflows', () => {
  it('submits only clinical data and displays the server-generated invoice as read-only', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<ApiClinicalPage />)

    await user.click(await screen.findByRole('button', { name: 'Record care' }))
    await user.type(screen.getByLabelText(/Diagnosis/), 'Routine examination')
    await user.type(screen.getByLabelText(/Vitals/), 'BP 120/80')
    await user.type(screen.getByLabelText(/Consultation notes/), 'Patient reviewed and stable.')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Save care & generate invoice' }))

    await waitFor(() => expect(api.recordCare).toHaveBeenCalledOnce())
    expect(api.recordCare).toHaveBeenCalledWith(worklistItem.appointmentId, {
      diagnosis_summary: 'Routine examination',
      notes: 'Patient reviewed and stable.',
      vitals: { summary: 'BP 120/80' },
      treatments: [{ treatmentId: treatment.treatmentId, quantity: '1' }],
    })
    expect(api.recordCare.mock.calls[0][1]).not.toHaveProperty('subtotalAmount')
    expect(api.recordCare.mock.calls[0][1]).not.toHaveProperty('patientLiabilityAmount')

    const invoiceDialog = await screen.findByRole('dialog', { name: invoice.invoiceNumber })
    expect(within(invoiceDialog).getByText('General consultation × 1')).toBeTruthy()
    expectCurrency(invoiceDialog, 125)
    expectCurrency(invoiceDialog, 25)
    expectCurrency(invoiceDialog, 100)
    expect(within(invoiceDialog).queryByRole('textbox')).toBeNull()
    expect(within(invoiceDialog).queryByRole('spinbutton')).toBeNull()
    expect(api.fetchInvoice).toHaveBeenCalledWith(invoice.invoiceId)
  })

  it('retains the care form values and treatment selection when the API rejects the save', async () => {
    const user = userEvent.setup()
    api.recordCare.mockRejectedValueOnce(new Error('Care record was rejected.'))
    renderWithQueryClient(<ApiClinicalPage />)

    await user.click(await screen.findByRole('button', { name: 'Record care' }))
    await user.type(screen.getByLabelText(/Diagnosis/), 'Follow-up')
    await user.type(screen.getByLabelText(/Consultation notes/), 'Keep the original note.')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Save care & generate invoice' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Care record was rejected.')
    expect((screen.getByLabelText(/Diagnosis/) as HTMLInputElement).value).toBe('Follow-up')
    expect((screen.getByLabelText(/Consultation notes/) as HTMLTextAreaElement).value).toBe('Keep the original note.')
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Record consultation' })).toBeTruthy()
  })

  it('shows invoice amounts and payment status from the API without editable maintained fields', async () => {
    renderWithQueryClient(<ApiFinancePage />)

    expect(await screen.findByText('INV-1001')).toBeTruthy()
    expect(screen.getByText('Due')).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: /INV-1001/ }))

    const invoiceDialog = await screen.findByRole('dialog', { name: 'INV-1001' })
    expect(within(invoiceDialog).getByText('Issued')).toBeTruthy()
    expectCurrency(invoiceDialog, 125)
    expectCurrency(invoiceDialog, 25)
    expectCurrency(invoiceDialog, 100)
    expect(within(invoiceDialog).queryByRole('textbox')).toBeNull()
    expect(within(invoiceDialog).queryByRole('spinbutton')).toBeNull()
  })

  it('blocks concurrent payment submits and retains form context and idempotency key after an overpayment rejection', async () => {
    const user = userEvent.setup()
    api.postPayment
      .mockRejectedValueOnce(new Error('Payment exceeds the current outstanding balance.'))
      .mockResolvedValueOnce(payment)
    api.fetchInvoices
      .mockResolvedValueOnce([invoiceSummary])
      .mockResolvedValueOnce([{
        ...invoiceSummary,
        patientPaidAmount: '100.00',
        patientPaymentStatus: 'Paid',
      }])
    renderWithQueryClient(<ApiFinancePage />)

    await user.click(await screen.findByRole('button', { name: 'Payment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Post a payment' })
    const amount = await within(dialog).findByLabelText(/Payment amount/)
    await waitFor(() => expect((amount as HTMLInputElement).value).toBe('100.00'))
    await user.selectOptions(within(dialog).getByLabelText(/Payment method/), 'Card')
    await user.type(within(dialog).getByLabelText(/Reference/), 'bank-ref-1001')

    const form = dialog.querySelector('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)
    fireEvent.submit(form!)

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Payment exceeds the current outstanding balance.')
    await waitFor(() => expect(api.postPayment).toHaveBeenCalledOnce())
    expect((within(dialog).getByLabelText(/Payment amount/) as HTMLInputElement).value).toBe('100.00')
    expect((within(dialog).getByLabelText(/Payment method/) as HTMLSelectElement).value).toBe('Card')
    expect((within(dialog).getByLabelText(/Reference/) as HTMLInputElement).value).toBe('bank-ref-1001')

    const firstRequest = api.postPayment.mock.calls[0][0]
    expect(firstRequest.amount).toBe('100.00')
    expect(firstRequest.idempotencyKey).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Commit payment' }))
    await waitFor(() => expect(api.postPayment).toHaveBeenCalledTimes(2))
    expect(api.postPayment.mock.calls[1][0].idempotencyKey).toBe(firstRequest.idempotencyKey)
    expect(api.postPayment.mock.calls[1][0]).toMatchObject({
      amount: '100.00',
      paymentMethod: 'Card',
      referenceNumber: 'bank-ref-1001',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('Paid')).toBeTruthy()
  })

  it('retains reversal context on rejection and refreshes payment state after the reversal succeeds', async () => {
    const user = userEvent.setup()
    api.reversePayment
      .mockRejectedValueOnce(new Error('Reversal amount is invalid.'))
      .mockResolvedValueOnce({ paymentReversalId: 'reversal-1', payment: postedPayment })
    api.fetchPayments
      .mockResolvedValueOnce([payment])
      .mockResolvedValueOnce([postedPayment])
    renderWithQueryClient(<ApiFinancePage />)

    await user.click(await screen.findByRole('button', { name: /INV-1001/ }))
    const invoiceDialog = await screen.findByRole('dialog', { name: 'INV-1001' })
    await user.click(await within(invoiceDialog).findByRole('button', { name: 'Reverse' }))

    const reversalDialog = screen.getAllByRole('dialog').find((element) => element.textContent?.includes('Reverse payment'))
    expect(reversalDialog).toBeDefined()
    const dialog = reversalDialog!
    const reversalAmount = within(dialog).getByLabelText(/Amount to reverse/)
    const reason = within(dialog).getByLabelText(/Reason/)
    expect((reversalAmount as HTMLInputElement).value).toBe('100.00')
    await user.type(reason, 'Duplicate payment')
    await user.click(within(dialog).getByRole('button', { name: 'Record reversal' }))

    expect((await within(dialog).findByRole('alert')).textContent).toContain('Reversal amount is invalid.')
    expect((reversalAmount as HTMLInputElement).value).toBe('100.00')
    expect((reason as HTMLTextAreaElement).value).toBe('Duplicate payment')
    await user.click(within(dialog).getByRole('button', { name: 'Record reversal' }))

    await waitFor(() => expect(api.reversePayment).toHaveBeenCalledTimes(2))
    expect(api.reversePayment).toHaveBeenLastCalledWith(payment.paymentId, {
      amount: '100.00',
      reason: 'Duplicate payment',
    })
    await waitFor(() => expect(api.fetchPayments).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(invoiceDialog.textContent?.replace(/\s+/g, ' ')).toContain(`Reversed ${formatCurrency(100).replace(/\s+/g, ' ')} · Duplicate payment`))
    expect(within(invoiceDialog).queryByRole('button', { name: 'Reverse' })).toBeNull()
  })
})
