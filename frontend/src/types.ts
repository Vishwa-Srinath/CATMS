export type Role = 'Receptionist' | 'Clinician' | 'Manager' | 'Admin'
export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled'
export type AppointmentSource = 'Booked' | 'Walk-in'
export type InvoiceStatus = 'Unpaid' | 'PartiallyPaid' | 'Paid'
export type ClaimStatus = 'Pending' | 'Approved' | 'PartiallyApproved' | 'Rejected'

export interface SessionUser {
  id: string
  name: string
  role: Role
  jobTitle: string
  branchId: string | 'all'
  initials: string
}

export interface Branch {
  id: string
  code: string
  name: string
  city: string
  address: string
  phone: string
  manager: string
  isActive: boolean
}

export interface StaffMember {
  id: string
  employeeNo: string
  name: string
  role: 'Manager' | 'Doctor' | 'Nurse' | 'Receptionist' | 'Admin' | 'Other'
  branchId: string
  email: string
  phone: string
  nic: string
  joined: string
  isActive: boolean
  license?: string
  specialties?: string[]
  consultationFee?: number
}

export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
}

export interface PolicyCoverage {
  treatmentId: string
  percentage: number
  maximum?: number
}

export interface InsurancePolicy {
  id: string
  provider: string
  policyNo: string
  validFrom: string
  validTo: string
  status: 'Active' | 'Expired' | 'Suspended'
  coverage: PolicyCoverage[]
}

export interface Patient {
  id: string
  patientNo: string
  name: string
  nic: string
  dob: string
  gender: string
  bloodGroup: string
  phone: string
  email: string
  address: string
  registeredBranchId: string
  registeredAt: string
  lastVisit: string
  emergencyContacts: EmergencyContact[]
  policies: InsurancePolicy[]
}

export interface Appointment {
  id: string
  reference: string
  patientId: string
  doctorId: string
  branchId: string
  date: string
  start: string
  end: string
  status: AppointmentStatus
  source: AppointmentSource
  reason: string
  createdBy: string
  updatedAt: string
  cancellationReason?: string
}

export interface Treatment {
  id: string
  serviceCode: string
  name: string
  category: string
  price: number
  duration: number
  isActive: boolean
}

export interface ClinicalRecord {
  appointmentId: string
  diagnosis: string
  notes: string
  vitals?: string
  treatments: { treatmentId: string; quantity: number; unitPrice: number }[]
  recordedAt: string
}

export interface Payment {
  id: string
  amount: number
  method: 'Cash' | 'Card' | 'Insurance' | 'Online'
  reference: string
  paidAt: string
}

export interface Claim {
  id: string
  policyNo: string
  provider: string
  claimedAmount: number
  approvedAmount: number
  status: ClaimStatus
  submittedAt: string
}

export interface Invoice {
  id: string
  invoiceNo: string
  appointmentId: string
  subtotal: number
  insuranceCovered: number
  patientPayable: number
  amountPaid: number
  status: InvoiceStatus
  issuedAt: string
  payments: Payment[]
  claims: Claim[]
}

export interface ClinicData {
  branches: Branch[]
  staff: StaffMember[]
  patients: Patient[]
  appointments: Appointment[]
  treatments: Treatment[]
  clinicalRecords: ClinicalRecord[]
  invoices: Invoice[]
}
