import { useState } from 'react'
import {
  Building2,
  Fingerprint,
  LockKeyhole,
  Stethoscope,
  Users,
} from 'lucide-react'
import { useClinic } from '../context/ClinicContext'
import { PageHeader } from '../components/ui'
import {
  useBranches,
  useEmployees,
  useDoctors,
  useSpecialties,
  useAdminUsers,
  useAuditLogs,
  BranchesTab,
  StaffTab,
  SpecialtiesTab,
  UserAccountsTab,
  AuditTrailTab,
} from '../features/administration'
import type {
  CreateBranchInput,
  UpdateBranchInput,
  AssignBranchManagerInput,
  RegisterEmployeeInput,
  AssignEmployeeBranchInput,
  DeactivateEmployeeInput,
  RegisterDoctorInput,
  CreateAdminUserInput,
  UpdateUserRoleInput,
} from '../api/staff.api'

type Tab = 'branches' | 'staff' | 'specialties' | 'accounts' | 'audit'

export default function AdministrationPage() {
  const { user, notify } = useClinic()
  const [tab, setTab] = useState<Tab>('branches')

  const isAdmin = user?.role === 'Admin'
  const isManager = user?.role === 'Manager'
  const userBranchId = user?.branchId ?? 'all'
  const currentUserId = user?.id ?? ''

  // TanStack Query Hooks connected to live backend APIs
  const branchesHook = useBranches()
  const employeesHook = useEmployees()
  const doctorsHook = useDoctors()
  const specialtiesHook = useSpecialties()
  const usersHook = useAdminUsers()
  const auditHook = useAuditLogs(200)

  // Handlers with toast feedback
  const handleCreateBranch = async (data: CreateBranchInput) => {
    try {
      await branchesHook.createBranch(data)
      notify({
        type: 'success',
        title: 'Branch facility created',
        message: `${data.name} (${data.branchCode}) is active in the clinic network.`,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create branch.'
      notify({ type: 'error', title: 'Branch creation rejected', message })
      throw err
    }
  }

  const handleUpdateBranch = async (id: number, data: UpdateBranchInput) => {
    try {
      await branchesHook.updateBranch({ id, data })
      notify({
        type: 'success',
        title: 'Branch information updated',
        message: 'Clinic facility record has been saved.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update branch.'
      notify({ type: 'error', title: 'Branch update rejected', message })
      throw err
    }
  }

  const handleAssignManager = async (branchId: number, data: AssignBranchManagerInput) => {
    try {
      await branchesHook.assignManager({ branchId, data })
      notify({
        type: 'success',
        title: 'Branch manager assigned',
        message: 'Operational branch leadership assignment has been saved.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign branch manager.'
      notify({ type: 'error', title: 'Manager assignment rejected', message })
      throw err
    }
  }

  const handleRegisterEmployee = async (
    data: RegisterEmployeeInput,
    doctorData?: { license: string; fee?: number; specialtyIds: number[] },
  ) => {
    try {
      const newEmp = await employeesHook.registerEmployee(data)
      if (doctorData && (data.positionCode.toLowerCase() === 'doctor' || data.positionCode.toLowerCase() === 'clinician')) {
        await doctorsHook.registerDoctor({
          employeeId: newEmp.employeeId,
          medicalLicenseNo: doctorData.license,
          defaultConsultationFee: doctorData.fee,
          specialtyIds: doctorData.specialtyIds,
        })
      }
      notify({
        type: 'success',
        title: 'Employee registered',
        message: `${data.fullName} (${data.employeeNumber}) enrolled into staff directory.`,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register employee.'
      notify({ type: 'error', title: 'Registration rejected', message })
      throw err
    }
  }

  const handleAssignBranch = async (employeeId: number, data: AssignEmployeeBranchInput) => {
    try {
      await employeesHook.assignBranch({ employeeId, data })
      notify({
        type: 'success',
        title: 'Home branch reassigned',
        message: 'Staff member branch assignment updated successfully.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reassign branch.'
      notify({ type: 'error', title: 'Transfer rejected', message })
      throw err
    }
  }

  const handleDeactivateEmployee = async (employeeId: number, data?: DeactivateEmployeeInput) => {
    try {
      await employeesHook.deactivateEmployee({ employeeId, data })
      notify({
        type: 'info',
        title: 'Employment status modified',
        message: 'Employee active state updated without deleting historical records.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to modify employment status.'
      notify({ type: 'error', title: 'Status change rejected', message })
      throw err
    }
  }

  const handleRegisterDoctor = async (data: RegisterDoctorInput) => {
    try {
      await doctorsHook.registerDoctor(data)
      notify({
        type: 'success',
        title: 'Doctor credentials recorded',
        message: 'Medical license and specialty assignments saved.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to register doctor credentials.'
      notify({ type: 'error', title: 'Doctor credentials rejected', message })
      throw err
    }
  }

  const handleCreateUser = async (data: CreateAdminUserInput) => {
    try {
      await usersHook.createUser(data)
      notify({
        type: 'success',
        title: 'User account provisioned',
        message: `Account @${data.username} created with secure role scoping.`,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create user account.'
      notify({ type: 'error', title: 'Account creation rejected', message })
      throw err
    }
  }

  const handleUnlockUser = async (userAccountId: number) => {
    try {
      await usersHook.unlockUser(userAccountId)
      notify({
        type: 'success',
        title: 'User account unlocked',
        message: 'Failed login counter reset and account set to Active status.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to unlock user account.'
      notify({ type: 'error', title: 'Unlock rejected', message })
      throw err
    }
  }

  const handleUpdateRole = async (userAccountId: number, data: UpdateUserRoleInput) => {
    try {
      await usersHook.updateRole({ userAccountId, data })
      notify({
        type: 'success',
        title: 'Role authorization updated',
        message: 'Account permissions and branch scope updated.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update user role.'
      notify({ type: 'error', title: 'Role update rejected', message })
      throw err
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Building2; count?: number }> = [
    { id: 'branches', label: 'Branches', icon: Building2, count: branchesHook.branches.length },
    { id: 'staff', label: 'Staff directory', icon: Users, count: employeesHook.employees.length },
    { id: 'specialties', label: 'Specialties', icon: Stethoscope, count: specialtiesHook.specialties.length },
    { id: 'accounts', label: 'User accounts', icon: LockKeyhole, count: usersHook.users.length },
    { id: 'audit', label: 'Audit trail', icon: Fingerprint, count: auditHook.logs.length },
  ]

  return (
    <>
      <PageHeader
        eyebrow="System administration"
        title="Clinic network & access control"
        description="Live administrative control of clinic locations, staff assignments, clinician specialties, user accounts, and immutable audit logs."
      />

      {/* Tab Navigation */}
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-2" role="tablist" aria-label="Administration sections">
        {tabs.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                active
                  ? 'bg-clinic-800 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon size={15} className={active ? 'text-clinic-200' : 'text-slate-400'} />
              <span>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                    active ? 'bg-clinic-900 text-clinic-100' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      {tab === 'branches' && (
        <BranchesTab
          branches={branchesHook.branches}
          employees={employeesHook.employees}
          isLoading={branchesHook.isLoading}
          isError={branchesHook.isError}
          error={branchesHook.error}
          onRefresh={branchesHook.refetch}
          isAdmin={isAdmin}
          onCreateBranch={handleCreateBranch}
          onUpdateBranch={handleUpdateBranch}
          onAssignManager={handleAssignManager}
        />
      )}

      {tab === 'staff' && (
        <StaffTab
          employees={employeesHook.employees}
          branches={branchesHook.branches}
          doctors={doctorsHook.doctors}
          specialties={specialtiesHook.specialties}
          isLoading={employeesHook.isLoading}
          isError={employeesHook.isError}
          error={employeesHook.error}
          onRefresh={employeesHook.refetch}
          isAdmin={isAdmin}
          isManager={isManager}
          userBranchId={userBranchId}
          currentUserId={currentUserId}
          onRegisterEmployee={handleRegisterEmployee}
          onAssignBranch={handleAssignBranch}
          onDeactivateEmployee={handleDeactivateEmployee}
          onRegisterDoctor={handleRegisterDoctor}
        />
      )}

      {tab === 'specialties' && (
        <SpecialtiesTab
          specialties={specialtiesHook.specialties}
          doctors={doctorsHook.doctors}
          branches={branchesHook.branches}
          isLoading={specialtiesHook.isLoading}
        />
      )}

      {tab === 'accounts' && (
        <UserAccountsTab
          users={usersHook.users}
          employees={employeesHook.employees}
          branches={branchesHook.branches}
          isLoading={usersHook.isLoading}
          isError={usersHook.isError}
          error={usersHook.error}
          onRefresh={usersHook.refetch}
          isAdmin={isAdmin}
          onCreateUser={handleCreateUser}
          onUnlockUser={handleUnlockUser}
          onUpdateRole={handleUpdateRole}
        />
      )}

      {tab === 'audit' && (
        <AuditTrailTab
          logs={auditHook.logs}
          isLoading={auditHook.isLoading}
          isError={auditHook.isError}
          error={auditHook.error}
          onRefresh={auditHook.refetch}
        />
      )}
    </>
  )
}
