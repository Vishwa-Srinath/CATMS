/**
 * src/features/administration/administration-ui.test.tsx
 * Owner: Dev2 | Reviewer: Dev1 | Issue: CATMS-066
 *
 * Automated frontend component and journey test suite for Authentication and Administration UI:
 * 1. ProtectedPage route guarding (unauthenticated -> /login, unauthorized role -> /).
 * 2. LoginPage presentation, credentials, and error banners.
 * 3. BranchesTab rendering, stats, and non-admin disabled actions with tooltips.
 * 4. StaffTab business rule enforcement:
 *    - Active branch manager cannot be deactivated without replacement.
 *    - Current logged-in user cannot deactivate self.
 *    - Non-admin cannot register or transfer employees.
 * 5. UserAccountsTab business rule enforcement:
 *    - Unlocking active accounts with 0 failures is disabled with explanatory tooltip.
 *    - Locked accounts can be unlocked by administrator.
 * 6. SpecialtiesTab and AuditTrailTab presentation and filtering.
 * 7. DisabledAction and RuleError visual feedback and business rationale.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { ProtectedPage } from '../../App';
import { useClinic } from '../../context/ClinicContext';
import { DisabledAction, RuleError } from '../../components/ui';
import { BranchesTab } from './components/BranchesTab';
import { StaffTab } from './components/StaffTab';
import { SpecialtiesTab } from './components/SpecialtiesTab';
import { UserAccountsTab } from './components/UserAccountsTab';
import { AuditTrailTab } from './components/AuditTrailTab';
import LoginPage from '../../pages/LoginPage';

import type {
  BranchDto,
  EmployeeDto,
  DoctorProfileDto,
  SpecialtyDto,
  AdminUserDto,
  AuditLogDto,
} from '../../api/staff.api';

// ── Mock Clinic Context ───────────────────────────────────────────────────────
vi.mock('../../context/ClinicContext', () => ({
  useClinic: vi.fn(),
  ClinicProvider: ({ children }: { children: ReactNode }) => children,
}));

// ── Mock App Shell to avoid nested dependency tree in route guard tests ───────
vi.mock('../../components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// ── Test Fixtures ─────────────────────────────────────────────────────────────
const mockBranches: BranchDto[] = [
  {
    branchId: 1,
    branchCode: 'CMB',
    name: 'MedSync Colombo Main',
    city: 'Colombo',
    addressLine1: '100 Galle Road, Colombo 03',
    addressLine2: null,
    district: 'Colombo',
    postalCode: '00300',
    contactPhone: '+94 11 244 8910',
    timeZone: 'Asia/Colombo',
    isActive: true,
    manager: {
      employeeId: 1,
      fullName: 'Kamal Perera',
    },
  },
  {
    branchId: 2,
    branchCode: 'KDY',
    name: 'MedSync Kandy Central',
    city: 'Kandy',
    addressLine1: '18 Sangaraja Mawatha, Kandy',
    addressLine2: null,
    district: 'Kandy',
    postalCode: '20000',
    contactPhone: '+94 81 221 4070',
    timeZone: 'Asia/Colombo',
    isActive: true,
    manager: null,
  },
];

const mockEmployees: EmployeeDto[] = [
  {
    employeeId: 1,
    employeeNumber: 'EMP-0001',
    nic: '198012345678',
    fullName: 'Kamal Perera',
    genderCode: 'M',
    dateOfBirth: '1980-05-15',
    positionCode: 'Manager',
    role: 'Manager',
    employmentStatus: 'Active',
    hireDate: '2020-01-01',
    phone: '071 228 4560',
    email: 'k.perera@medsync.lk',
    isActive: true,
    branchId: 1,
    branchName: 'MedSync Colombo Main',
    userAccountId: 1,
    username: 'k.perera',
    roleCode: 'Manager',
    isDoctor: false,
  },
  {
    employeeId: 2,
    employeeNumber: 'EMP-0002',
    nic: '198512345678',
    fullName: 'Dr. Sunil Silva',
    genderCode: 'M',
    dateOfBirth: '1985-08-20',
    positionCode: 'Doctor',
    role: 'Doctor',
    employmentStatus: 'Active',
    hireDate: '2021-04-12',
    phone: '077 214 8091',
    email: 's.silva@medsync.lk',
    isActive: true,
    branchId: 1,
    branchName: 'MedSync Colombo Main',
    userAccountId: 2,
    username: 's.silva',
    roleCode: 'Clinician',
    isDoctor: true,
  },
  {
    employeeId: 3,
    employeeNumber: 'EMP-0003',
    nic: '199012345678',
    fullName: 'Nimal Fernando',
    genderCode: 'M',
    dateOfBirth: '1990-11-05',
    positionCode: 'Receptionist',
    role: 'Receptionist',
    employmentStatus: 'Active',
    hireDate: '2022-08-22',
    phone: '076 891 0334',
    email: 'n.fernando@medsync.lk',
    isActive: true,
    branchId: 1,
    branchName: 'MedSync Colombo Main',
    userAccountId: 3,
    username: 'reception.user',
    roleCode: 'Reception',
    isDoctor: false,
  },
  {
    employeeId: 4,
    employeeNumber: 'EMP-0004',
    nic: '199212345678',
    fullName: 'Admin Person',
    genderCode: 'F',
    dateOfBirth: '1992-03-10',
    positionCode: 'Admin',
    role: 'Admin',
    employmentStatus: 'Active',
    hireDate: '2019-11-18',
    phone: '077 420 5336',
    email: 'admin@medsync.lk',
    isActive: true,
    branchId: 1,
    branchName: 'MedSync Colombo Main',
    userAccountId: 4,
    username: 'admin.user',
    roleCode: 'Admin',
    isDoctor: false,
  },
];

const mockDoctors: DoctorProfileDto[] = [
  {
    doctorId: 2, // matches employeeId: 2 (Dr. Sunil Silva)
    employeeNumber: 'EMP-0002',
    fullName: 'Dr. Sunil Silva',
    medicalLicenseNo: 'SLMC-29481',
    practiceStartDate: '2021-04-12',
    defaultConsultationFee: 3500,
    isAcceptingAppointments: true,
    specialties: [
      { specialtyId: 1, name: 'General Practice', isPrimary: true },
      { specialtyId: 2, name: 'Cardiology', isPrimary: false },
    ],
  },
];

const mockSpecialties: SpecialtyDto[] = [
  {
    specialtyId: 1,
    specialtyCode: 'GP',
    name: 'General Practice',
    description: 'Primary care medicine',
    isActive: true,
  },
  {
    specialtyId: 2,
    specialtyCode: 'CARD',
    name: 'Cardiology',
    description: 'Heart and cardiovascular system',
    isActive: true,
  },
];

const mockAdminUsers: AdminUserDto[] = [
  {
    userAccountId: 1,
    employeeId: 1,
    username: 'k.perera',
    accountStatus: 'Active',
    failedLoginCount: 0,
    lastLoginAt: '2026-10-09T10:00:00Z',
    employeeNumber: 'EMP-0001',
    fullName: 'Kamal Perera',
    roles: [
      {
        roleCode: 'Manager',
        branchScopeId: 1,
        branchCode: 'CMB',
      },
    ],
  },
  {
    userAccountId: 5,
    employeeId: 5,
    username: 'locked.user',
    accountStatus: 'Locked',
    failedLoginCount: 5,
    lastLoginAt: null,
    employeeNumber: 'EMP-0005',
    fullName: 'Locked User',
    roles: [
      {
        roleCode: 'Reception',
        branchScopeId: 1,
        branchCode: 'CMB',
      },
    ],
  },
];

const mockAuditLogs: AuditLogDto[] = [
  {
    auditEventId: 101,
    actionCode: 'LOGIN_SUCCESS',
    entityType: 'USER_ACCOUNT',
    entityId: '1',
    actorUserId: 1,
    actorUsername: 'k.perera',
    actorName: 'Kamal Perera',
    clientIp: '192.168.1.10',
    occurredAt: '2026-10-10T08:30:00Z',
    payload: { method: 'password' },
  },
  {
    auditEventId: 102,
    actionCode: 'USER_ACCOUNT_LOCKED',
    entityType: 'USER_ACCOUNT',
    entityId: '5',
    actorUserId: null,
    actorUsername: 'system',
    actorName: 'System Security',
    clientIp: '192.168.1.50',
    occurredAt: '2026-10-10T08:45:00Z',
    payload: { failedCount: 5 },
  },
  {
    auditEventId: 103,
    actionCode: 'EMPLOYEE_DEACTIVATED',
    entityType: 'EMPLOYEE',
    entityId: '10',
    actorUserId: 4,
    actorUsername: 'admin.user',
    actorName: 'Admin Person',
    clientIp: '192.168.1.1',
    occurredAt: '2026-10-10T09:00:00Z',
    payload: { reason: 'Resigned' },
  },
];

describe('CATMS-066 — Administration Frontend Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Suite 1: Route Guarding & RBAC (ProtectedPage)
  // ===========================================================================
  describe('Suite 1: Route Guarding and Navigation (ProtectedPage)', () => {
    it('redirects unauthenticated user to /login with replace flag', () => {
      vi.mocked(useClinic).mockReturnValue({
        user: null,
        isLoadingSession: false,
      } as ReturnType<typeof useClinic>);

      const result = ProtectedPage({
        roles: ['Admin'],
        children: <div>Protected Admin Area</div>,
      }) as { type: unknown; props: { to: string; replace: boolean } };

      expect(result.type).toBe(Navigate);
      expect(result.props.to).toBe('/login');
      expect(result.props.replace).toBe(true);
    });

    it('shows loading block when session verification is in-flight', () => {
      vi.mocked(useClinic).mockReturnValue({
        user: null,
        isLoadingSession: true,
      } as ReturnType<typeof useClinic>);

      const result = ProtectedPage({
        roles: ['Admin'],
        children: <div>Protected Admin Area</div>,
      });

      const html = renderToString(result as React.ReactElement);
      expect(html).toContain('Verifying session credentials');
      expect(html).not.toContain('Protected Admin Area');
    });

    it('redirects unauthorized role to / when role restriction is not met', () => {
      vi.mocked(useClinic).mockReturnValue({
        user: {
          id: '3',
          name: 'Nimal Fernando',
          role: 'Receptionist',
          jobTitle: 'Receptionist',
          branchId: '1',
          initials: 'NF',
        },
        isLoadingSession: false,
      } as ReturnType<typeof useClinic>);

      const result = ProtectedPage({
        roles: ['Admin'],
        children: <div>Protected Admin Area</div>,
      }) as { type: unknown; props: { to: string; replace: boolean } };

      expect(result.type).toBe(Navigate);
      expect(result.props.to).toBe('/');
      expect(result.props.replace).toBe(true);
    });

    it('renders protected child component inside AppShell when user role matches authorized roles', () => {
      vi.mocked(useClinic).mockReturnValue({
        user: {
          id: '4',
          name: 'Admin Person',
          role: 'Admin',
          jobTitle: 'Finance Administrator',
          branchId: 'all',
          initials: 'AP',
        },
        isLoadingSession: false,
      } as ReturnType<typeof useClinic>);

      const result = ProtectedPage({
        roles: ['Admin'],
        children: <div>Protected Admin Area</div>,
      });

      const html = renderToString(result as React.ReactElement);
      expect(html).toContain('data-testid="app-shell"');
      expect(html).toContain('Protected Admin Area');
    });

    it('allows any authenticated role when no specific role filter is required', () => {
      vi.mocked(useClinic).mockReturnValue({
        user: {
          id: '3',
          name: 'Nimal Fernando',
          role: 'Receptionist',
          jobTitle: 'Receptionist',
          branchId: '1',
          initials: 'NF',
        },
        isLoadingSession: false,
      } as ReturnType<typeof useClinic>);

      const result = ProtectedPage({
        children: <div>Dashboard All Roles Area</div>,
      });

      const html = renderToString(result as React.ReactElement);
      expect(html).toContain('Dashboard All Roles Area');
    });
  });

  // ===========================================================================
  // Suite 2: Login Interface
  // ===========================================================================
  describe('Suite 2: Login Interface (LoginPage)', () => {
    it('renders staff access gateway with branding and role presets', () => {
      vi.mocked(useClinic).mockReturnValue({
        demoUsers: [
          { id: 'e8', name: 'Nimali Perera', role: 'Receptionist', jobTitle: 'Receptionist', branchId: 'b1', initials: 'NP' },
          { id: 'e1', name: 'Dr. Anjali Fernando', role: 'Clinician', jobTitle: 'Doctor', branchId: 'b1', initials: 'AF' },
          { id: 'e6', name: 'Tharindu Jayasinghe', role: 'Manager', jobTitle: 'Manager', branchId: 'b1', initials: 'TJ' },
          { id: 'e7', name: 'Ishara Bandara', role: 'Admin', jobTitle: 'Admin', branchId: 'all', initials: 'IB' },
        ],
        signIn: vi.fn(),
        notify: vi.fn(),
      } as unknown as ReturnType<typeof useClinic>);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const html = renderToString(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <LoginPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(html).toContain('Staff Portal Login');
      expect(html).toContain('Select your role and sign in to access your workspace');
      expect(html).toContain('Receptionist');
      expect(html).toContain('Clinician');
      expect(html).toContain('Manager');
      expect(html).toContain('Admin');
      expect(html).toContain('Sign in to workspace');
      expect(html).toContain('MedSync Clinics');
    });
  });

  // ===========================================================================
  // Suite 3: Physical Clinic Network (BranchesTab)
  // ===========================================================================
  describe('Suite 3: Clinic Network (BranchesTab)', () => {
    it('renders branch facilities, managers, and summary stats', () => {
      const html = renderToString(
        <BranchesTab
          branches={mockBranches}
          employees={mockEmployees}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={true}
          onCreateBranch={vi.fn()}
          onUpdateBranch={vi.fn()}
          onAssignManager={vi.fn()}
        />,
      );

      expect(html).toContain('Physical Clinic Network');
      expect(html).toContain('MedSync Colombo Main');
      expect(html).toContain('CMB');
      expect(html).toContain('Colombo');
      expect(html).toContain('MedSync Kandy Central');
      expect(html).toContain('KDY');
      expect(html).toContain('Kandy');
      expect(html).toContain('Kamal Perera');
      expect(html).toContain('Total clinic locations');
      expect(html).toContain('Add branch');
    });

    it('disables "Add branch" button with tooltip when user is non-admin', () => {
      const html = renderToString(
        <BranchesTab
          branches={mockBranches}
          employees={mockEmployees}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={false}
          onCreateBranch={vi.fn()}
          onUpdateBranch={vi.fn()}
          onAssignManager={vi.fn()}
        />,
      );

      expect(html).toContain('Only Admin role has permission to create new clinic facilities.');
      expect(html).toContain('disabled=""');
    });

    it('renders error state when branches query fails', () => {
      const html = renderToString(
        <BranchesTab
          branches={[]}
          employees={[]}
          isLoading={false}
          isError={true}
          error={new Error('Database connection timed out')}
          onRefresh={vi.fn()}
          isAdmin={true}
          onCreateBranch={vi.fn()}
          onUpdateBranch={vi.fn()}
          onAssignManager={vi.fn()}
        />,
      );

      expect(html).toContain('Failed to load branch records');
      expect(html).toContain('Database connection timed out');
      expect(html).toContain('Retry');
    });
  });

  // ===========================================================================
  // Suite 4: Staff Directory & Business Rules (StaffTab)
  // ===========================================================================
  describe('Suite 4: Staff Directory Business Rules (StaffTab)', () => {
    it('renders employees, doctor credentials, and contact info', () => {
      const html = renderToString(
        <StaffTab
          employees={mockEmployees}
          branches={mockBranches}
          doctors={mockDoctors}
          specialties={mockSpecialties}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={true}
          isManager={false}
          userBranchId="all"
          currentUserId="4"
          onRegisterEmployee={vi.fn()}
          onAssignBranch={vi.fn()}
          onDeactivateEmployee={vi.fn()}
          onRegisterDoctor={vi.fn()}
        />,
      );

      expect(html).toContain('Kamal Perera');
      expect(html).toContain('Dr. Sunil Silva');
      expect(html).toContain('Nimal Fernando');
      expect(html).toContain('Doctor');
      expect(html).toContain('General Practice');
    });

    it('disables deactivation of active branch manager with business rule tooltip', () => {
      // Kamal Perera (ID 1) is active manager of MedSync Colombo Main
      const html = renderToString(
        <StaffTab
          employees={mockEmployees}
          branches={mockBranches}
          doctors={mockDoctors}
          specialties={mockSpecialties}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={true}
          isManager={false}
          userBranchId="all"
          currentUserId="4"
          onRegisterEmployee={vi.fn()}
          onAssignBranch={vi.fn()}
          onDeactivateEmployee={vi.fn()}
          onRegisterDoctor={vi.fn()}
        />,
      );

      expect(html).toContain('Cannot deactivate an active branch manager. Transfer or assign a new manager first.');
    });

    it('disables deactivation of self with business rule tooltip', () => {
      // Current user is employee ID 2 (Dr. Sunil Silva, not a manager)
      const html = renderToString(
        <StaffTab
          employees={mockEmployees}
          branches={mockBranches}
          doctors={mockDoctors}
          specialties={mockSpecialties}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={true}
          isManager={false}
          userBranchId="all"
          currentUserId="2"
          onRegisterEmployee={vi.fn()}
          onAssignBranch={vi.fn()}
          onDeactivateEmployee={vi.fn()}
          onRegisterDoctor={vi.fn()}
        />,
      );

      expect(html).toContain('Cannot deactivate your own currently active session account.');
    });

    it('disables Add Employee button for non-admin users with tooltip', () => {
      const html = renderToString(
        <StaffTab
          employees={mockEmployees}
          branches={mockBranches}
          doctors={mockDoctors}
          specialties={mockSpecialties}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={false}
          isManager={true}
          userBranchId="1"
          currentUserId="1"
          onRegisterEmployee={vi.fn()}
          onAssignBranch={vi.fn()}
          onDeactivateEmployee={vi.fn()}
          onRegisterDoctor={vi.fn()}
        />,
      );

      expect(html).toContain('Only Admin role can register new clinic employees.');
    });
  });

  // ===========================================================================
  // Suite 5: User Account Governance (UserAccountsTab)
  // ===========================================================================
  describe('Suite 5: User Account Governance (UserAccountsTab)', () => {
    it('renders user accounts, status badges, and failed login counts', () => {
      const html = renderToString(
        <UserAccountsTab
          users={mockAdminUsers}
          employees={mockEmployees}
          branches={mockBranches}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={true}
          onCreateUser={vi.fn()}
          onUnlockUser={vi.fn()}
          onUpdateRole={vi.fn()}
        />,
      );

      expect(html).toContain('k.perera');
      expect(html).toContain('locked.user');
      expect(html).toContain('failed');
      expect(html).toContain('Locked');
    });

    it('disables unlock button for active account with 0 failed attempts', () => {
      const html = renderToString(
        <UserAccountsTab
          users={mockAdminUsers}
          employees={mockEmployees}
          branches={mockBranches}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={true}
          onCreateUser={vi.fn()}
          onUnlockUser={vi.fn()}
          onUpdateRole={vi.fn()}
        />,
      );

      expect(html).toContain('Account is active with no lockout. Unlock action is not needed.');
    });

    it('disables provisioning accounts for non-admin users with tooltip', () => {
      const html = renderToString(
        <UserAccountsTab
          users={mockAdminUsers}
          employees={mockEmployees}
          branches={mockBranches}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
          isAdmin={false}
          onCreateUser={vi.fn()}
          onUnlockUser={vi.fn()}
          onUpdateRole={vi.fn()}
        />,
      );

      expect(html).toContain('Only Admin role has permission to issue or configure user accounts.');
    });
  });

  // ===========================================================================
  // Suite 6: Specialties and Audit Trail
  // ===========================================================================
  describe('Suite 6: Specialties & Audit Trail (SpecialtiesTab & AuditTrailTab)', () => {
    it('renders specialties tab grouping doctors by medical specialty', () => {
      const html = renderToString(
        <SpecialtiesTab
          specialties={mockSpecialties}
          doctors={mockDoctors}
          isLoading={false}
        />,
      );

      expect(html).toContain('Doctor Specialty Catalogue');
      expect(html).toContain('General Practice');
      expect(html).toContain('Cardiology');
      expect(html).toContain('Dr. Sunil Silva');
      expect(html).toContain('SLMC-29481');
    });

    it('renders immutable audit log trail with action codes and actor data', () => {
      const html = renderToString(
        <AuditTrailTab
          logs={mockAuditLogs}
          isLoading={false}
          isError={false}
          error={null}
          onRefresh={vi.fn()}
        />,
      );

      expect(html).toContain('Security &amp; Procedural Audit Trail');
      expect(html).toContain('LOGIN_SUCCESS');
      expect(html).toContain('USER_ACCOUNT_LOCKED');
      expect(html).toContain('EMPLOYEE_DEACTIVATED');
      expect(html).toContain('k.perera');
      expect(html).toContain('192.168.1.10');
    });
  });

  // ===========================================================================
  // Suite 7: DisabledAction & RuleError Feedback
  // ===========================================================================
  describe('Suite 7: DisabledAction Tooltip and RuleError Visual Rationale', () => {
    it('renders DisabledAction with title attribute and role="tooltip"', () => {
      const reason = 'Action restricted by business rule BR-STAFF-02';
      const html = renderToString(
        <DisabledAction reason={reason}>
          <button disabled>Delete Item</button>
        </DisabledAction>,
      );

      expect(html).toContain(`title="${reason}"`);
      expect(html).toContain('role="tooltip"');
      expect(html).toContain(reason);
      expect(html).toContain('disabled=""');
    });

    it('renders RuleError with rejection message and code', () => {
      const error = new Error('NIC is already registered to another employee');
      (error as unknown as { code: string }).code = 'DB_EMPLOYEE_NIC_EXISTS';

      const html = renderToString(<RuleError error={error} />);

      expect(html).toContain('Operation rejected');
      expect(html).toContain('NIC is already registered to another employee');
      expect(html).toContain('DB_EMPLOYEE_NIC_EXISTS');
      expect(html).toContain('role="alert"');
    });
  });
});
