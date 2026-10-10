import { useState, useMemo } from 'react'
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
  BranchDto,
  EmployeeDto,
  DoctorProfileDto,
  SpecialtyDto,
  AdminUserDto,
  AuditLogDto,
} from '../api/staff.api'

type Tab = 'branches' | 'staff' | 'specialties' | 'accounts' | 'audit'

export default function AdministrationPage() {
  const { user, data, notify } = useClinic()
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

  // Fallback demo datasets when backend is offline
  const fallbackBranches: BranchDto[] = useMemo(() => {
    return data.branches.map((b, idx) => {
      const mgr = data.staff.find((s) => s.name === b.manager);
      return {
        branchId: idx + 1,
        branchCode: b.code,
        name: b.name,
        branchName: b.name,
        addressLine1: b.address,
        addressLine2: null,
        city: b.city,
        district: b.city,
        postalCode: '00' + (idx + 1) + '00',
        contactPhone: b.phone,
        phone: b.phone,
        timeZone: 'Asia/Colombo',
        isActive: b.isActive,
        manager: mgr ? { employeeId: idx + 10, fullName: mgr.name } : null,
      };
    });
  }, [data.branches, data.staff]);

  const effectiveBranches = useMemo(() => {
    return branchesHook.branches.length > 0 ? branchesHook.branches : fallbackBranches;
  }, [branchesHook.branches, fallbackBranches]);

  const fallbackEmployees: EmployeeDto[] = useMemo(() => {
    return data.staff.map((s, idx) => {
      const branch = data.branches.find((b) => b.id === s.branchId);
      const branchIndex = data.branches.findIndex((b) => b.id === s.branchId);
      const isFemale =
        s.name.includes('Dr. Anjali') ||
        s.name.includes('Dr. Malini') ||
        s.name.includes('Nimali') ||
        s.name.includes('Sachini') ||
        s.name.includes('Sanduni');
      return {
        employeeId: idx + 1,
        employeeNumber: s.employeeNo,
        employeeNo: s.employeeNo,
        nic: s.nic,
        fullName: s.name,
        genderCode: isFemale ? 'FEMALE' : 'MALE',
        dateOfBirth: '1988-06-15',
        positionCode: s.role.toUpperCase(),
        role: s.role,
        employmentStatus: s.isActive ? 'ACTIVE' : 'INACTIVE',
        hireDate: s.joined,
        phone: s.phone,
        email: s.email,
        isActive: s.isActive,
        branchId: branchIndex >= 0 ? branchIndex + 1 : 1,
        branchName: branch ? branch.name : 'Colombo Central',
        userAccountId: idx + 1,
        username: s.email ? s.email.split('@')[0] : `user${idx + 1}`,
        roleCode:
          s.role === 'Doctor'
            ? 'CLINICIAN'
            : s.role === 'Admin'
            ? 'ADMIN'
            : s.role === 'Manager'
            ? 'MANAGER'
            : 'RECEPTIONIST',
        isDoctor: s.role === 'Doctor',
      };
    });
  }, [data.staff, data.branches]);

  const effectiveEmployees = useMemo(() => {
    return employeesHook.employees.length > 0 ? employeesHook.employees : fallbackEmployees;
  }, [employeesHook.employees, fallbackEmployees]);

  const fallbackDoctors: DoctorProfileDto[] = useMemo(() => {
    return data.staff
      .filter((s) => s.role === 'Doctor')
      .map((s, idx) => ({
        doctorId: idx + 1,
        employeeNumber: s.employeeNo,
        fullName: s.name,
        medicalLicenseNo: s.license ?? `SLMC-${30000 + idx}`,
        practiceStartDate: s.joined,
        defaultConsultationFee: s.consultationFee ?? 3500,
        isAcceptingAppointments: s.isActive,
        specialties: (s.specialties ?? ['General Medicine']).map((specName, sIdx) => ({
          specialtyId: sIdx + 1,
          name: specName,
          isPrimary: sIdx === 0,
        })),
      }));
  }, [data.staff]);

  const effectiveDoctors = useMemo(() => {
    return doctorsHook.doctors.length > 0 ? doctorsHook.doctors : fallbackDoctors;
  }, [doctorsHook.doctors, fallbackDoctors]);

  const fallbackSpecialties: SpecialtyDto[] = useMemo(
    () => [
      {
        specialtyId: 1,
        specialtyCode: 'GEN',
        name: 'General Medicine',
        specialtyName: 'General Medicine',
        description: 'Primary health consultations and routine physical examinations.',
        isActive: true,
      },
      {
        specialtyId: 2,
        specialtyCode: 'CARD',
        name: 'Cardiology',
        specialtyName: 'Cardiology',
        description: 'Cardiovascular assessment, ECG review, and hypertension management.',
        isActive: true,
      },
      {
        specialtyId: 3,
        specialtyCode: 'ENT',
        name: 'ENT',
        specialtyName: 'ENT',
        description: 'Ear, nose, and throat diagnostic and minor interventions.',
        isActive: true,
      },
      {
        specialtyId: 4,
        specialtyCode: 'PAED',
        name: 'Paediatrics',
        specialtyName: 'Paediatrics',
        description: 'Infant care, childhood vaccinations, and development checks.',
        isActive: true,
      },
      {
        specialtyId: 5,
        specialtyCode: 'DERM',
        name: 'Dermatology',
        specialtyName: 'Dermatology',
        description: 'Skin pathologies, rashes, allergen reviews, and wound dressings.',
        isActive: true,
      },
      {
        specialtyId: 6,
        specialtyCode: 'ORTHO',
        name: 'Orthopaedics',
        specialtyName: 'Orthopaedics',
        description: 'Musculoskeletal care, joint pain evaluations, and fracture triage.',
        isActive: true,
      },
    ],
    [],
  );

  const effectiveSpecialties = useMemo(() => {
    return specialtiesHook.specialties.length > 0 ? specialtiesHook.specialties : fallbackSpecialties;
  }, [specialtiesHook.specialties, fallbackSpecialties]);

  const fallbackUsers: AdminUserDto[] = useMemo(
    () => [
      {
        userAccountId: 1,
        employeeId: 7,
        employeeNumber: 'EMP-0006',
        fullName: 'Ishara Bandara',
        username: 'ishara.b',
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lastLoginAt: '2026-08-09T08:15:00',
        roles: [{ roleCode: 'ADMIN', branchScopeId: null, branchCode: null }],
      },
      {
        userAccountId: 2,
        employeeId: 6,
        employeeNumber: 'EMP-0003',
        fullName: 'Tharindu Jayasinghe',
        username: 'tharindu.j',
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lastLoginAt: '2026-08-09T08:20:00',
        roles: [{ roleCode: 'MANAGER', branchScopeId: 1, branchCode: 'CMB' }],
      },
      {
        userAccountId: 3,
        employeeId: 1,
        employeeNumber: 'EMP-0014',
        fullName: 'Dr. Anjali Fernando',
        username: 'anjali.f',
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lastLoginAt: '2026-08-09T08:25:00',
        roles: [{ roleCode: 'CLINICIAN', branchScopeId: 1, branchCode: 'CMB' }],
      },
      {
        userAccountId: 4,
        employeeId: 8,
        employeeNumber: 'EMP-0027',
        fullName: 'Nimali Perera',
        username: 'nimali.p',
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lastLoginAt: '2026-08-09T07:55:00',
        roles: [{ roleCode: 'RECEPTIONIST', branchScopeId: 1, branchCode: 'CMB' }],
      },
      {
        userAccountId: 5,
        employeeId: 9,
        employeeNumber: 'EMP-0011',
        fullName: 'Sanduni Ekanayake',
        username: 'sanduni.e',
        accountStatus: 'ACTIVE',
        failedLoginCount: 0,
        lastLoginAt: '2026-08-08T17:40:00',
        roles: [{ roleCode: 'MANAGER', branchScopeId: 2, branchCode: 'KDY' }],
      },
      {
        userAccountId: 6,
        employeeId: 10,
        employeeNumber: 'EMP-0008',
        fullName: 'Harsha de Silva',
        username: 'harsha.d',
        accountStatus: 'LOCKED',
        failedLoginCount: 5,
        lastLoginAt: '2026-08-07T14:10:00',
        roles: [{ roleCode: 'MANAGER', branchScopeId: 3, branchCode: 'GLE' }],
      },
    ],
    [],
  );

  const effectiveUsers = useMemo(() => {
    return usersHook.users.length > 0 ? usersHook.users : fallbackUsers;
  }, [usersHook.users, fallbackUsers]);

  const fallbackAuditLogs: AuditLogDto[] = useMemo(
    () => [
      {
        auditEventId: 101,
        actorUserId: 1,
        actorUsername: 'ishara.b',
        actorName: 'Ishara Bandara',
        entityType: 'INVOICE',
        entityId: 'INV-260809-195',
        actionCode: 'POST_PAYMENT',
        occurredAt: '2026-08-09T12:40:15',
        payload: { amount: 3500, method: 'Cash', receipt: 'CASH-0284' },
        clientIp: '192.168.1.104',
      },
      {
        auditEventId: 102,
        actorUserId: 3,
        actorUsername: 'anjali.f',
        actorName: 'Dr. Anjali Fernando',
        entityType: 'CLINICAL_RECORD',
        entityId: 'APT-10841',
        actionCode: 'COMPLETE_CONSULTATION',
        occurredAt: '2026-08-09T12:35:00',
        payload: { diagnosis: 'Essential hypertension follow-up', treatments: ['CONS-GEN'] },
        clientIp: '192.168.1.110',
      },
      {
        auditEventId: 103,
        actorUserId: 4,
        actorUsername: 'nimali.p',
        actorName: 'Nimali Perera',
        entityType: 'APPOINTMENT',
        entityId: 'APT-10849',
        actionCode: 'CREATE_APPOINTMENT',
        occurredAt: '2026-08-09T10:15:30',
        payload: { patient: 'PAT-00645', doctor: 'Dr. Anjali Fernando', source: 'Walk-in' },
        clientIp: '192.168.1.102',
      },
      {
        auditEventId: 104,
        actorUserId: 2,
        actorUsername: 'tharindu.j',
        actorName: 'Tharindu Jayasinghe',
        entityType: 'STAFF',
        entityId: 'EMP-0033',
        actionCode: 'ASSIGN_BRANCH',
        occurredAt: '2026-08-08T16:50:00',
        payload: { branch: 'GLE', assignmentType: 'PRIMARY' },
        clientIp: '192.168.1.105',
      },
      {
        auditEventId: 105,
        actorUserId: 1,
        actorUsername: 'ishara.b',
        actorName: 'Ishara Bandara',
        entityType: 'USER_ACCOUNT',
        entityId: 'USR-6',
        actionCode: 'LOCK_ACCOUNT_MAX_ATTEMPTS',
        occurredAt: '2026-08-07T14:10:22',
        payload: { failedCount: 5, status: 'LOCKED' },
        clientIp: '192.168.1.104',
      },
    ],
    [],
  );

  const effectiveAuditLogs = useMemo(() => {
    return auditHook.logs.length > 0 ? auditHook.logs : fallbackAuditLogs;
  }, [auditHook.logs, fallbackAuditLogs]);

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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'Branch facility created (Demo)',
          message: `${data.name} (${data.branchCode}) registered in demo session.`,
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'Branch information updated (Demo)',
          message: 'Clinic facility record updated in demo session.',
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'Branch manager assigned (Demo)',
          message: 'Leadership assignment recorded in demo session.',
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'Employee registered (Demo)',
          message: `${data.fullName} (${data.employeeNumber}) enrolled into demo directory.`,
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'Home branch reassigned (Demo)',
          message: 'Branch assignment updated in demo session.',
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'info',
          title: 'Employment status modified (Demo)',
          message: 'Employee active state updated in demo session.',
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'Doctor credentials recorded (Demo)',
          message: 'Medical license and specialty assignments saved in demo session.',
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'User account provisioned (Demo)',
          message: `Account @${data.username} created in demo session.`,
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'User account unlocked (Demo)',
          message: 'Failed login counter reset and account unlocked in demo session.',
        })
        return
      }
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
      if (message.includes('backend') || message.includes('offline') || message.includes('Network') || (err as any)?.code === 'BACKEND_OFFLINE') {
        notify({
          type: 'success',
          title: 'Role authorization updated (Demo)',
          message: 'Permissions and scope updated in demo session.',
        })
        return
      }
      notify({ type: 'error', title: 'Role update rejected', message })
      throw err
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Building2; count?: number }> = [
    { id: 'branches', label: 'Branches', icon: Building2, count: effectiveBranches.length },
    { id: 'staff', label: 'Staff directory', icon: Users, count: effectiveEmployees.length },
    { id: 'specialties', label: 'Specialties', icon: Stethoscope, count: effectiveSpecialties.length },
    { id: 'accounts', label: 'User accounts', icon: LockKeyhole, count: effectiveUsers.length },
    { id: 'audit', label: 'Audit trail', icon: Fingerprint, count: effectiveAuditLogs.length },
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
          branches={effectiveBranches}
          employees={effectiveEmployees}
          isLoading={branchesHook.branches.length === 0 && effectiveBranches.length === 0 && branchesHook.isLoading}
          isError={branchesHook.branches.length === 0 && effectiveBranches.length === 0 && branchesHook.isError}
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
          employees={effectiveEmployees}
          branches={effectiveBranches}
          doctors={effectiveDoctors}
          specialties={effectiveSpecialties}
          isLoading={employeesHook.employees.length === 0 && effectiveEmployees.length === 0 && employeesHook.isLoading}
          isError={employeesHook.employees.length === 0 && effectiveEmployees.length === 0 && employeesHook.isError}
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
          specialties={effectiveSpecialties}
          doctors={effectiveDoctors}
          branches={effectiveBranches}
          isLoading={specialtiesHook.specialties.length === 0 && effectiveSpecialties.length === 0 && specialtiesHook.isLoading}
        />
      )}

      {tab === 'accounts' && (
        <UserAccountsTab
          users={effectiveUsers}
          employees={effectiveEmployees}
          branches={effectiveBranches}
          isLoading={usersHook.users.length === 0 && effectiveUsers.length === 0 && usersHook.isLoading}
          isError={usersHook.users.length === 0 && effectiveUsers.length === 0 && usersHook.isError}
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
          logs={effectiveAuditLogs}
          isLoading={auditHook.logs.length === 0 && effectiveAuditLogs.length === 0 && auditHook.isLoading}
          isError={auditHook.logs.length === 0 && effectiveAuditLogs.length === 0 && auditHook.isError}
          error={auditHook.error}
          onRefresh={auditHook.refetch}
        />
      )}
    </>
  )
}
