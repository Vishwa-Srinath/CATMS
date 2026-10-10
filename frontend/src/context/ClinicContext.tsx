/* eslint-disable react-refresh/only-export-components -- provider and its typed hook intentionally share this module */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { demoUsers, initialData } from '../data/demoData'
import { assertLiveMode } from './demoAdapter'
import { useSession } from '../app/useSession'
import type { SessionUserDto } from '../api/auth.api'
import type {
  Appointment,
  Branch,
  ClaimStatus,
  ClinicData,
  InsurancePolicy,
  Patient,
  Role,
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
  isLoadingSession: boolean
  demoUsers: SessionUser[]
  toasts: ToastMessage[]
  signIn: (user: SessionUser) => void
  signOut: () => Promise<void> | void
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


function mapSessionDtoToUser(dto: SessionUserDto): SessionUser {
  let role: Role = 'Admin'
  const normalized = (dto.role || '').toLowerCase()
  if (normalized.includes('reception')) {
    role = 'Receptionist'
  } else if (normalized.includes('clinic') || normalized.includes('doctor')) {
    role = 'Clinician'
  } else if (normalized.includes('manager')) {
    role = 'Manager'
  } else if (normalized.includes('admin')) {
    role = 'Admin'
  }

  const names = dto.fullName ? dto.fullName.trim().split(/\s+/) : ['User']
  const initials = names.length >= 2
    ? `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase()
    : (dto.fullName ? dto.fullName.slice(0, 2).toUpperCase() : 'US')

  return {
    id: String(dto.userId),
    name: dto.fullName || dto.username,
    role,
    jobTitle: dto.roleDisplayName || dto.positionCode || dto.role,
    branchId: dto.branchId === 'all' ? 'all' : String(dto.branchId),
    initials,
  }
}

export function ClinicProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const data = useMemo<ClinicData>(() => initialData, [])
  const [demoUser, setDemoUser] = useState<SessionUser | null>(() => {
    const storedRole = sessionStorage.getItem('catms-demo-role')
    return demoUsers.find((candidate) => candidate.role === storedRole) ?? null
  })
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const user = useMemo<SessionUser | null>(() => {
    if (session.user) {
      return mapSessionDtoToUser(session.user)
    }
    return demoUser
  }, [session.user, demoUser])

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 6000)
  }, [])

  const signIn = useCallback((selectedUser: SessionUser) => {
    sessionStorage.setItem('catms-demo-role', selectedUser.role)
    setDemoUser(selectedUser)
    notify({ type: 'success', title: `Welcome, ${selectedUser.name.split(' ')[0]}`, message: `${selectedUser.role} workspace is ready.` })
  }, [notify])

  const signOut = useCallback(async () => {
    sessionStorage.removeItem('catms-demo-role')
    setDemoUser(null)
    try {
      await session.logout()
    } catch {
      // Ignored if session already ended or server unreachable
    }
  }, [session])

  const addPatient = (input: PatientInput): Patient => {
    assertLiveMode('addPatient', input);
    throw new Error('In-memory patient registration is disabled in final profile (CATMS-065). Use useRegisterPatient() API mutation.');
  };

  const addPolicy = (patientId: string, policy: Omit<InsurancePolicy, 'id'>) => {
    assertLiveMode('addPolicy', patientId, policy);
  };

  const addAppointment = (input: AppointmentInput): Appointment => {
    assertLiveMode('addAppointment', input);
    throw new Error('In-memory appointment booking is disabled in final profile (CATMS-065). Use useBookAppointment() API mutation.');
  };

  const rescheduleAppointment = (id: string, date: string, start: string, end: string, reason: string) => {
    assertLiveMode('rescheduleAppointment', id, date, start, end, reason);
  };

  const updateAppointmentStatus = (id: string, status: Appointment['status'], reason?: string) => {
    assertLiveMode('updateAppointmentStatus', id, status, reason);
  };

  const saveClinicalRecord = (appointmentId: string, diagnosis: string, notes: string, treatmentIds: string[], vitals?: string) => {
    assertLiveMode('saveClinicalRecord', appointmentId, diagnosis, notes, treatmentIds, vitals);
  };

  const postPayment = (invoiceId: string, amount: number, method: 'Cash' | 'Card' | 'Online' | 'Insurance', reference: string) => {
    assertLiveMode('postPayment', invoiceId, amount, method, reference);
  };

  const submitClaim = (invoiceId: string, policyNo: string, provider: string, amount: number) => {
    assertLiveMode('submitClaim', invoiceId, policyNo, provider, amount);
  };

  const updateClaimStatus = (invoiceId: string, claimId: string, status: ClaimStatus, approvedAmount: number) => {
    assertLiveMode('updateClaimStatus', invoiceId, claimId, status, approvedAmount);
  };

  const addStaff = (staff: Omit<StaffMember, 'id' | 'employeeNo' | 'isActive'>) => {
    assertLiveMode('addStaff', staff);
  };

  const toggleStaff = (id: string) => {
    assertLiveMode('toggleStaff', id);
  };

  const addBranch = (branch: Omit<Branch, 'id' | 'code' | 'isActive'>) => {
    assertLiveMode('addBranch', branch);
  };

  const addTreatment = (treatment: Omit<Treatment, 'id' | 'isActive'>) => {
    assertLiveMode('addTreatment', treatment);
  };

  const toggleTreatment = (id: string) => {
    assertLiveMode('toggleTreatment', id);
  };

  const value = useMemo<ClinicContextValue>(() => ({
    data, user, isLoadingSession: session.isLoading, demoUsers, toasts, signIn, signOut, dismissToast, notify,
    addPatient, addPolicy, addAppointment, rescheduleAppointment, updateAppointmentStatus, saveClinicalRecord,
    postPayment, submitClaim, updateClaimStatus, addStaff, toggleStaff, addBranch, addTreatment, toggleTreatment,
  }), [data, user, session.isLoading, toasts, signIn, signOut, dismissToast, notify])

  return <ClinicContext.Provider value={value}>{children}</ClinicContext.Provider>
}

export function useClinic() {
  const context = useContext(ClinicContext)
  if (!context) throw new Error('useClinic must be used inside ClinicProvider')
  return context
}
