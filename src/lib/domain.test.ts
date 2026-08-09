import { describe, expect, it } from 'vitest'
import { findAppointmentConflict, invoiceStatus, overlaps } from './domain'
import type { Appointment } from '../types'

const appointment: Appointment = {
  id: 'a1', reference: 'APT-1', patientId: 'p1', doctorId: 'd1', branchId: 'b1',
  date: '2026-08-09', start: '09:00', end: '09:30', status: 'Scheduled', source: 'Booked',
  reason: 'Review', createdBy: 'e1', updatedAt: '2026-08-09T08:00:00',
}

describe('clinic business-rule helpers', () => {
  it('detects actual overlaps but permits adjacent slots', () => {
    expect(overlaps('09:15', '09:45', '09:00', '09:30')).toBe(true)
    expect(overlaps('09:30', '10:00', '09:00', '09:30')).toBe(false)
  })

  it('ignores cancelled appointments', () => {
    expect(findAppointmentConflict([{ ...appointment, status: 'Cancelled' }], appointment)).toBeUndefined()
  })

  it('classifies invoice states from database-owned totals', () => {
    expect(invoiceStatus(0, 5000)).toBe('Unpaid')
    expect(invoiceStatus(2500, 5000)).toBe('PartiallyPaid')
    expect(invoiceStatus(5000, 5000)).toBe('Paid')
  })
})
