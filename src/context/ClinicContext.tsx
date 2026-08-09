/* eslint-disable react-refresh/only-export-components -- provider and its typed hook intentionally share this module */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { demoUsers, initialData } from '../data/demoData'
import { ClinicRuleError, findAppointmentConflict, invoiceStatus, timeToMinutes } from '../lib/domain'
import type {
  Appointment,
  Branch,
  ClaimStatus,
  ClinicData,
  InsurancePolicy,
  Patient,
  SessionUser,
  StaffMember,
  Treatment,
} from '../types'

type PatientInput = Omit<Patient, 'id' | 'patientNo' | 'registeredAt' | 'lastVisit' | 'policies'>
type AppointmentInput = Pick<Appointment, 'patientId' | 'doctorId' | 'branchId' | 'date' | 'start' | 'end' | 'source' | 'reason'>

interface ToastMessage {
  id: number
  type: 'success' | 'error' | 'info'
  title: string
  message: string
  code?: string
}

interface ClinicContextValue {
  data: ClinicData
  user: SessionUser | null
  demoUsers: SessionUser[]
  toasts: ToastMessage[]
  signIn: (user: SessionUser) => void
  signOut: () => void
  dismissToast: (id: number) => void
  notify: (toast: Omit<ToastMessage, 'id'>) => void
  addPatient: (patient: PatientInput) => Patient
  addPolicy: (patientId: string, policy: Omit<InsurancePolicy, 'id'>) => void
  addAppointment: (appointment: AppointmentInput) => Appointment
  rescheduleAppointment: (id: string, date: string, start: string, end: string, reason: string) => void
  updateAppointmentStatus: (id: string, status: Appointment['status'], reason?: string) => void
  saveClinicalRecord: (appointmentId: string, diagnosis: string, notes: string, treatmentIds: string[], vitals?: string) => void
  postPayment: (invoiceId: string, amount: number, method: 'Cash' | 'Card' | 'Online' | 'Insurance', reference: string) => void
  submitClaim: (invoiceId: string, policyNo: string, provider: string, amount: number) => void
  updateClaimStatus: (invoiceId: string, claimId: string, status: ClaimStatus, approvedAmount: number) => void
  addStaff: (staff: Omit<StaffMember, 'id' | 'employeeNo' | 'isActive'>) => void
  toggleStaff: (id: string) => void
  addBranch: (branch: Omit<Branch, 'id' | 'code' | 'isActive'>) => void
  addTreatment: (treatment: Omit<Treatment, 'id' | 'isActive'>) => void
  toggleTreatment: (id: string) => void
}

const ClinicContext = createContext<ClinicContextValue | null>(null)

const cloneData = () => structuredClone(initialData)

export function ClinicProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ClinicData>(cloneData)
  const [user, setUser] = useState<SessionUser | null>(() => {
    const storedRole = sessionStorage.getItem('catms-demo-role')
    return demoUsers.find((candidate) => candidate.role === storedRole) ?? null
  })
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 6000)
  }, [])

  const signIn = (selectedUser: SessionUser) => {
    sessionStorage.setItem('catms-demo-role', selectedUser.role)
    setUser(selectedUser)
    notify({ type: 'success', title: `Welcome, ${selectedUser.name.split(' ')[0]}`, message: `${selectedUser.role} workspace is ready.` })
  }

  const signOut = () => {
    sessionStorage.removeItem('catms-demo-role')
    setUser(null)
  }

  const addPatient = (input: PatientInput) => {
    const duplicate = data.patients.find((patient) => patient.nic.toLowerCase() === input.nic.toLowerCase())
    if (duplicate) throw new ClinicRuleError('DB_PATIENT_IDENTITY_EXISTS', `NIC or passport ${input.nic} is already registered to ${duplicate.name} (${duplicate.patientNo}).`)
    const patient: Patient = {
      ...input,
      id: `p${Date.now()}`,
      patientNo: `PAT-${String(data.patients.length + 571).padStart(5, '0')}`,
      registeredAt: '2026-08-09',
      lastVisit: 'No visits yet',
      policies: [],
    }
    setData((current) => ({ ...current, patients: [patient, ...current.patients] }))
    notify({ type: 'success', title: 'Patient registered clinic-wide', message: `${patient.name} can now be booked at all three branches.` })
    return patient
  }

  const addPolicy = (patientId: string, policy: Omit<InsurancePolicy, 'id'>) => {
    if (data.patients.some((patient) => patient.policies.some((item) => item.policyNo.toLowerCase() === policy.policyNo.toLowerCase()))) throw new ClinicRuleError('DB_POLICY_NUMBER_EXISTS', `Policy number ${policy.policyNo} is already registered.`)
    if (policy.validFrom > policy.validTo) throw new ClinicRuleError('DB_POLICY_DATE_RANGE_INVALID', 'Policy valid-from date must be on or before its valid-until date.')
    if (policy.coverage.some((item) => item.percentage < 0 || item.percentage > 100)) throw new ClinicRuleError('DB_COVERAGE_PERCENTAGE_INVALID', 'Every treatment coverage percentage must be between 0 and 100.')
    const coverageIds = policy.coverage.map((item) => item.treatmentId)
    if (new Set(coverageIds).size !== coverageIds.length) throw new ClinicRuleError('DB_POLICY_COVERAGE_DUPLICATE', 'The same treatment cannot be assigned twice to one policy.')
    const newPolicy: InsurancePolicy = { ...policy, id: `pol${Date.now()}` }
    setData((current) => ({ ...current, patients: current.patients.map((patient) => patient.id === patientId ? { ...patient, policies: [...patient.policies, newPolicy] } : patient) }))
    notify({ type: 'success', title: 'Insurance policy added', message: `${policy.provider} coverage is now available for billing calculations.` })
  }

  const addAppointment = (input: AppointmentInput) => {
    if (timeToMinutes(input.start) >= timeToMinutes(input.end)) throw new ClinicRuleError('DB_APPOINTMENT_TIME_RANGE_INVALID', 'Appointment end time must be later than its start time.')
    const conflict = findAppointmentConflict(data.appointments, input)
    if (conflict) {
      const doctor = data.staff.find((item) => item.id === input.doctorId)?.name ?? 'Doctor'
      throw new ClinicRuleError('DB_APPOINTMENT_OVERLAP', `${doctor} already has ${conflict.reference} from ${conflict.start} to ${conflict.end}. Choose a non-overlapping time.`)
    }
    const appointment: Appointment = {
      ...input,
      id: `a${Date.now()}`,
      reference: `APT-${10848 + data.appointments.length}`,
      status: 'Scheduled',
      createdBy: user?.id ?? 'demo',
      updatedAt: new Date().toISOString(),
    }
    setData((current) => ({ ...current, appointments: [...current.appointments, appointment] }))
    notify({ type: 'success', title: input.source === 'Walk-in' ? 'Walk-in added' : 'Appointment booked', message: `${appointment.reference} is confirmed for ${appointment.start}.` })
    return appointment
  }

  const rescheduleAppointment = (id: string, date: string, start: string, end: string, reason: string) => {
    const appointment = data.appointments.find((item) => item.id === id)
    if (!appointment) return
    if (timeToMinutes(start) >= timeToMinutes(end)) throw new ClinicRuleError('DB_APPOINTMENT_TIME_RANGE_INVALID', 'Appointment end time must be later than its start time. The original booking was kept unchanged.')
    const conflict = findAppointmentConflict(data.appointments, { ...appointment, date, start, end }, id)
    if (conflict) {
      const doctor = data.staff.find((item) => item.id === appointment.doctorId)?.name ?? 'Doctor'
      throw new ClinicRuleError('DB_APPOINTMENT_OVERLAP', `${doctor} already has ${conflict.reference} from ${conflict.start} to ${conflict.end}. The original booking was kept unchanged.`)
    }
    setData((current) => ({
      ...current,
      appointments: current.appointments.map((item) => item.id === id ? { ...item, date, start, end, updatedAt: new Date().toISOString() } : item),
    }))
    notify({ type: 'success', title: 'Appointment rescheduled', message: `${appointment.reference} moved successfully. Reason recorded: ${reason}` })
  }

  const updateAppointmentStatus = (id: string, status: Appointment['status'], reason?: string) => {
    const appointment = data.appointments.find((item) => item.id === id)
    if (!appointment) return
    if (appointment.status !== 'Scheduled') throw new ClinicRuleError('DB_INVALID_STATUS_TRANSITION', `${appointment.reference} is already ${appointment.status}. Only Scheduled appointments can be completed or cancelled.`)
    setData((current) => ({
      ...current,
      appointments: current.appointments.map((item) => item.id === id ? { ...item, status, cancellationReason: status === 'Cancelled' ? reason : undefined, updatedAt: new Date().toISOString() } : item),
    }))
    notify({ type: status === 'Cancelled' ? 'info' : 'success', title: `Appointment ${status.toLowerCase()}`, message: `${appointment.reference} was retained and its status audit was recorded.` })
  }

  const saveClinicalRecord = (appointmentId: string, diagnosis: string, notes: string, treatmentIds: string[], vitals?: string) => {
    const appointment = data.appointments.find((item) => item.id === appointmentId)
    if (!appointment || appointment.status !== 'Completed') throw new ClinicRuleError('DB_TREATMENT_REQUIRES_COMPLETED', 'Treatments and consultation notes can only be recorded after the appointment is Completed.')
    if (data.clinicalRecords.some((record) => record.appointmentId === appointmentId)) throw new ClinicRuleError('DB_CONSULTATION_NOTE_UNIQUE', 'This appointment already has its consultation record. Duplicate notes are not allowed.')
    const lineItems = treatmentIds.map((treatmentId) => {
      const treatment = data.treatments.find((item) => item.id === treatmentId)
      if (!treatment) throw new ClinicRuleError('DB_TREATMENT_NOT_FOUND', 'A selected treatment is no longer in the catalogue.')
      return { treatmentId, quantity: 1, unitPrice: treatment.price }
    })
    const subtotal = lineItems.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
    const patient = data.patients.find((item) => item.id === appointment.patientId)
    const activePolicy = patient?.policies.find((policy) => policy.status === 'Active')
    const insuranceCovered = lineItems.reduce((sum, line) => {
      const coverage = activePolicy?.coverage.find((item) => item.treatmentId === line.treatmentId)
      if (!coverage) return sum
      const amount = line.unitPrice * (coverage.percentage / 100)
      return sum + Math.min(amount, coverage.maximum ?? amount)
    }, 0)
    const patientPayable = subtotal - insuranceCovered
    setData((current) => ({
      ...current,
      clinicalRecords: [...current.clinicalRecords, { appointmentId, diagnosis, notes, vitals, treatments: lineItems, recordedAt: new Date().toISOString() }],
      invoices: [...current.invoices, {
        id: `i${Date.now()}`, invoiceNo: `INV-260809-${185 + current.invoices.length}`, appointmentId,
        subtotal, insuranceCovered, patientPayable, amountPaid: 0, status: invoiceStatus(0, patientPayable),
        issuedAt: '2026-08-09', payments: [], claims: [],
      }],
    }))
    notify({ type: 'success', title: 'Consultation recorded', message: 'Price-at-treatment was captured and the invoice was generated automatically.' })
  }

  const postPayment = (invoiceId: string, amount: number, method: 'Cash' | 'Card' | 'Online' | 'Insurance', reference: string) => {
    const invoice = data.invoices.find((item) => item.id === invoiceId)
    if (!invoice) return
    if (amount <= 0) throw new ClinicRuleError('DB_PAYMENT_AMOUNT_INVALID', 'Payment amount must be greater than zero.')
    if (invoice.amountPaid + amount > invoice.patientPayable) throw new ClinicRuleError('DB_PAYMENT_EXCEEDS_BALANCE', `Payment rejected. ${invoice.invoiceNo} has only LKR ${(invoice.patientPayable - invoice.amountPaid).toLocaleString('en-LK')} outstanding.`)
    setData((current) => ({
      ...current,
      invoices: current.invoices.map((item) => {
        if (item.id !== invoiceId) return item
        const amountPaid = item.amountPaid + amount
        return { ...item, amountPaid, status: invoiceStatus(amountPaid, item.patientPayable), payments: [...item.payments, { id: `pay${Date.now()}`, amount, method, reference, paidAt: new Date().toISOString() }] }
      }),
    }))
    notify({ type: 'success', title: 'Payment posted', message: `${method} payment was committed and the outstanding balance recalculated.` })
  }

  const submitClaim = (invoiceId: string, policyNo: string, provider: string, amount: number) => {
    if (amount <= 0) throw new ClinicRuleError('DB_CLAIM_AMOUNT_INVALID', 'Claimed amount must be greater than zero.')
    setData((current) => ({
      ...current,
      invoices: current.invoices.map((invoice) => invoice.id === invoiceId ? { ...invoice, claims: [...invoice.claims, { id: `cl${Date.now()}`, policyNo, provider, claimedAmount: amount, approvedAmount: 0, status: 'Pending', submittedAt: '2026-08-09' }] } : invoice),
    }))
    notify({ type: 'success', title: 'Claim submitted', message: `${provider} claim is now pending internal review.` })
  }

  const updateClaimStatus = (invoiceId: string, claimId: string, status: ClaimStatus, approvedAmount: number) => {
    setData((current) => ({
      ...current,
      invoices: current.invoices.map((invoice) => invoice.id === invoiceId ? { ...invoice, claims: invoice.claims.map((claim) => claim.id === claimId ? { ...claim, status, approvedAmount } : claim) } : invoice),
    }))
    notify({ type: 'success', title: 'Claim status updated', message: `The claim is now ${status}. Its audit history remains available.` })
  }

  const addStaff = (staff: Omit<StaffMember, 'id' | 'employeeNo' | 'isActive'>) => {
    if (data.staff.some((item) => item.nic === staff.nic)) throw new ClinicRuleError('DB_EMPLOYEE_NIC_EXISTS', `NIC ${staff.nic} already belongs to an employee.`)
    if (staff.role === 'Doctor' && !staff.license) throw new ClinicRuleError('DB_DOCTOR_LICENSE_REQUIRED', 'A unique medical licence is required for employees with the Doctor role.')
    if (staff.license && data.staff.some((item) => item.license?.toLowerCase() === staff.license?.toLowerCase())) throw new ClinicRuleError('DB_DOCTOR_LICENSE_EXISTS', `Medical licence ${staff.license} is already registered.`)
    if (staff.specialties && new Set(staff.specialties.map((item) => item.toLowerCase())).size !== staff.specialties.length) throw new ClinicRuleError('DB_DOCTOR_SPECIALTY_DUPLICATE', 'The same specialty cannot be assigned twice to one doctor.')
    setData((current) => ({ ...current, staff: [...current.staff, { ...staff, id: `e${Date.now()}`, employeeNo: `EMP-${String(current.staff.length + 34).padStart(4, '0')}`, isActive: true }] }))
    notify({ type: 'success', title: 'Employee added', message: `${staff.name} is active in the staff directory.` })
  }

  const toggleStaff = (id: string) => {
    setData((current) => ({ ...current, staff: current.staff.map((staff) => staff.id === id ? { ...staff, isActive: !staff.isActive } : staff) }))
    notify({ type: 'info', title: 'Employment status updated', message: 'The historical employee record was retained.' })
  }

  const addBranch = (branch: Omit<Branch, 'id' | 'code' | 'isActive'>) => {
    setData((current) => ({ ...current, branches: [...current.branches, { ...branch, id: `b${Date.now()}`, code: branch.city.slice(0, 3).toUpperCase(), isActive: true }] }))
    notify({ type: 'success', title: 'Branch created', message: `${branch.name} is now available throughout the workspace.` })
  }

  const addTreatment = (treatment: Omit<Treatment, 'id' | 'isActive'>) => {
    if (data.treatments.some((item) => item.serviceCode.toLowerCase() === treatment.serviceCode.toLowerCase())) throw new ClinicRuleError('DB_SERVICE_CODE_EXISTS', `Service code ${treatment.serviceCode} is already used in the treatment catalogue.`)
    setData((current) => ({ ...current, treatments: [...current.treatments, { ...treatment, id: `t${Date.now()}`, isActive: true }] }))
    notify({ type: 'success', title: 'Catalogue service added', message: `${treatment.name} is now available clinic-wide.` })
  }

  const toggleTreatment = (id: string) => {
    setData((current) => ({ ...current, treatments: current.treatments.map((treatment) => treatment.id === id ? { ...treatment, isActive: !treatment.isActive } : treatment) }))
    notify({ type: 'info', title: 'Catalogue status updated', message: 'Historical invoice line items and price snapshots remain unchanged.' })
  }

  const value = useMemo<ClinicContextValue>(() => ({
    data, user, demoUsers, toasts, signIn, signOut, dismissToast, notify,
    addPatient, addPolicy, addAppointment, rescheduleAppointment, updateAppointmentStatus, saveClinicalRecord,
    postPayment, submitClaim, updateClaimStatus, addStaff, toggleStaff, addBranch, addTreatment, toggleTreatment,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, user, toasts])

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>
}

export function useClinic() {
  const context = useContext(ClinicContext)
  if (!context) throw new Error('useClinic must be used inside ClinicProvider')
  return context
}
