import type { Appointment, Invoice, InvoiceStatus } from '../types'

export const DEMO_TODAY = '2026-08-09'

export class ClinicRuleError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ClinicRuleError'
    this.code = code
  }
}

export const timeToMinutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export const overlaps = (startA: string, endA: string, startB: string, endB: string) =>
  timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA)

export function findAppointmentConflict(
  appointments: Appointment[],
  candidate: Pick<Appointment, 'doctorId' | 'date' | 'start' | 'end'>,
  excludedId?: string,
) {
  return appointments.find(
    (appointment) =>
      appointment.id !== excludedId &&
      appointment.doctorId === candidate.doctorId &&
      appointment.date === candidate.date &&
      appointment.status !== 'Cancelled' &&
      overlaps(appointment.start, appointment.end, candidate.start, candidate.end),
  )
}

export const invoiceStatus = (paid: number, payable: number): InvoiceStatus => {
  if (payable <= 0 || paid >= payable) return 'Paid'
  if (paid > 0) return 'PartiallyPaid'
  return 'Unpaid'
}

export const outstanding = (invoice: Invoice) => Math.max(0, invoice.patientPayable - invoice.amountPaid)

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

export const formatDate = (date: string, options?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-LK', options ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(`${date}T00:00:00`),
  )

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
