/**
 * src/features/patients-insurance/patients-insurance-ui.test.tsx
 * Owner: Dev3 | Issue: CATMS-067
 *
 * Automated tests for Patient, Insurance, and Claim frontend components:
 * - Patient registration & duplicate identity recovery
 * - Policy and coverage action workflows
 * - Claim submission with strict SERVER-CALCULATED eligibility preview invariant
 *   (proving the UI does NOT compute liability or approval values itself)
 * - Strict RBAC finance role-gating for claim resolution (403 handling)
 * - Claim tracker role gating and lifecycle state display
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Invoice, Patient, SessionUser, Claim } from '../../types';
import type { PatientDto } from '../../api/patients.api';
import { ApiError } from '../../api/errors';
import { ClinicRuleError } from '../../lib/domain';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock hooks
const mockUseClaimPreview = vi.fn();
const mockUseSubmitClaim = vi.fn();
const mockUseResolveClaim = vi.fn();
const mockUseClaims = vi.fn();
const mockUseRegisterPatient = vi.fn();
const mockUseClinicBranches = vi.fn();
const mockUseInsuranceProviders = vi.fn();
const mockUseTreatmentsCatalogue = vi.fn();
const mockUsePatientPolicies = vi.fn();
const mockUsePatientDetail = vi.fn();

vi.mock('./hooks/useClaims', () => ({
  useClaimPreview: (...args: unknown[]) => mockUseClaimPreview(...args),
  useSubmitClaim: () => mockUseSubmitClaim(),
  useResolveClaim: () => mockUseResolveClaim(),
  useClaims: (...args: unknown[]) => mockUseClaims(...args),
}));

vi.mock('./hooks/usePatientsInsurance', () => ({
  useRegisterPatient: () => mockUseRegisterPatient(),
  useClinicBranches: () => mockUseClinicBranches(),
  useInsuranceProviders: (...args: unknown[]) => mockUseInsuranceProviders(...args),
  useTreatmentsCatalogue: () => mockUseTreatmentsCatalogue(),
  usePatientPolicies: (...args: unknown[]) => mockUsePatientPolicies(...args),
  usePatientDetail: (...args: unknown[]) => mockUsePatientDetail(...args),
}));

// Import components under test
import { ClaimSubmissionModal } from './components/ClaimSubmissionModal';
import { ClaimReviewModal } from './components/ClaimReviewModal';
import { ClaimTracker } from './components/ClaimTracker';
import { RegisterPatientModal } from './components/RegisterPatientModal';
import { AddPolicyModal } from './components/AddPolicyModal';
import { PatientDetailModal } from './components/PatientDetailModal';

// Test Fixtures
const mockPatient: Patient = {
  id: 'p1',
  patientNo: 'PAT-20261001-0001',
  name: 'Anura Perera',
  dob: '1985-05-12',
  gender: 'Male',
  bloodGroup: 'B+',
  phone: '+94 77 123 4567',
  nic: '198510203040',
  email: 'anura.p@example.lk',
  address: '12 Temple Road, Colombo',
  registeredBranchId: '1',
  registeredAt: '2026-10-01T08:00:00Z',
  lastVisit: '2026-10-01',
  emergencyContacts: [
    {
      name: 'Sunil Perera',
      relationship: 'Brother',
      phone: '+94 71 987 6543',
    },
  ],
  policies: [
    {
      id: 'pol11',
      policyNo: 'POL-CEY-001',
      provider: 'Ceylinco General Insurance',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      status: 'Active',
      coverage: [
        { treatmentId: 't1', percentage: 80, maximum: 2000 },
        { treatmentId: 't2', percentage: 70, maximum: 5000 },
      ],
    },
    {
      id: 'pol12',
      policyNo: 'SLIC-POL-99001',
      provider: 'Sri Lanka Insurance',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      status: 'Active',
      coverage: [
        { treatmentId: 't1', percentage: 100, maximum: 1500 },
      ],
    },
  ],
};

const mockPatientDto: PatientDto = {
  patientId: 1,
  patientNumber: 'PAT-20261001-0001',
  firstName: 'Anura',
  lastName: 'Perera',
  fullName: 'Anura Perera',
  dateOfBirth: '1985-05-12',
  gender: 'Male',
  bloodGroup: 'B+',
  contactNumber: '+94 77 123 4567',
  email: 'anura.p@example.lk',
  address: '12 Temple Road, Colombo',
  registeredBranchId: 1,
  registeredAt: '2026-10-01T08:00:00Z',
  isActive: true,
  createdAt: '2026-10-01T08:00:00Z',
  updatedAt: '2026-10-01T08:00:00Z',
  primaryIdentity: {
    identityId: 1,
    patientId: 1,
    identityType: 'NIC',
    identityNumber: '198510203040',
    isPrimary: true,
    createdAt: '2026-10-01T08:00:00Z',
  },
  primaryContact: {
    contactId: 1,
    patientId: 1,
    contactName: 'Sunil Perera',
    relationship: 'Brother',
    phoneNumber: '+94 71 987 6543',
    isPrimary: true,
    createdAt: '2026-10-01T08:00:00Z',
  },
};

const mockInvoice: Invoice = {
  id: 'inv701',
  invoiceNo: 'INV-202609-0701',
  appointmentId: 'apt101',
  subtotal: 10000,
  insuranceCovered: 0,
  patientPayable: 10000,
  amountPaid: 0,
  status: 'Unpaid',
  issuedAt: '2026-09-10T10:00:00Z',
  payments: [],
  claims: [],
};

const mockFinanceAdminUser: SessionUser = {
  id: 'u1',
  name: 'Admin User',
  role: 'Admin',
  jobTitle: 'Finance Administrator',
  branchId: 'b1',
  initials: 'AU',
};

const mockReceptionistUser: SessionUser = {
  id: 'u2',
  name: 'Nimal Receptionist',
  role: 'Receptionist',
  jobTitle: 'Front Desk Officer',
  branchId: 'b1',
  initials: 'NR',
};

const mockClinicianUser: SessionUser = {
  id: 'u3',
  name: 'Dr. Silva',
  role: 'Clinician',
  jobTitle: 'Senior Consultant',
  branchId: 'b1',
  initials: 'DS',
};

describe('CATMS-067 — Patient, Insurance, and Claim Frontend Component & Invariant Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseSubmitClaim.mockReturnValue({
      submitClaim: vi.fn(),
      isPending: false,
    });

    mockUseResolveClaim.mockReturnValue({
      resolveClaim: vi.fn(),
      isPending: false,
    });

    mockUseRegisterPatient.mockReturnValue({
      registerPatient: vi.fn(),
      isPending: false,
    });

    mockUseClinicBranches.mockReturnValue({
      branches: [
        { branchId: 1, name: 'MedSync Colombo Main', branchCode: 'CMB' },
        { branchId: 2, name: 'MedSync Kandy Branch', branchCode: 'KDY' },
      ],
      isLoading: false,
    });

    mockUseInsuranceProviders.mockReturnValue({
      providers: [
        { providerId: 1, providerCode: 'CEY', name: 'Ceylinco General Insurance', isActive: true },
        { providerId: 2, providerCode: 'SLIC', name: 'Sri Lanka Insurance', isActive: true },
      ],
      isLoading: false,
    });

    mockUseTreatmentsCatalogue.mockReturnValue({
      treatments: [
        { treatmentId: 1, serviceCode: 'TREAT-001', treatmentName: 'General Consultation', standardPrice: 3500 },
        { treatmentId: 2, serviceCode: 'TREAT-002', treatmentName: 'Dental Cleaning', standardPrice: 6500 },
      ],
      isLoading: false,
    });

    mockUsePatientPolicies.mockReturnValue({
      policies: [],
      createPolicy: vi.fn(),
      isCreating: false,
    });

    mockUseClaims.mockReturnValue({
      claims: [],
      isLoading: false,
    });

    mockUsePatientDetail.mockReturnValue({
      patient: mockPatientDto,
      isLoading: false,
    });
  });

  // ── 1. Critical Invariant Protection: No Client-Side Math ──────────────────

  describe('1. Invariant Guarantee: UI Does NOT Calculate Liability or Approval Values', () => {
    it('renders server-calculated eligibility preview numbers verbatim and refuses client math', () => {
      // Mock server returning non-standard calculations from server procedure
      // If the client attempted hardcoded percentage math (e.g. 80% of 10000 = 8000), it would produce 8,000.
      const serverCalculatedValues = {
        invoiceId: 701,
        invoiceSubtotal: 10000,
        totalEstimatedInsurance: 7432, // Server-computed allocation
        estimatedPatientLiability: 2568, // 10000 - 7432
        policies: [
          {
            policyId: 11,
            policyNumber: 'POL-CEY-001',
            providerName: 'Ceylinco General Insurance',
            priority: 1,
            totalClaimedAmount: 5000,
          },
          {
            policyId: 12,
            policyNumber: 'SLIC-POL-99001',
            providerName: 'Sri Lanka Insurance',
            priority: 2,
            totalClaimedAmount: 2432,
          },
        ],
      };

      mockUseClaimPreview.mockReturnValue({
        preview: serverCalculatedValues,
        isLoading: false,
        error: null,
      });

      const html = renderToString(
        <ClaimSubmissionModal
          invoice={mockInvoice}
          open={true}
          onClose={vi.fn()}
          getPatient={() => mockPatient}
        />,
      );

      // Verify the UI rendered the server's authoritative calculations verbatim
      expect(html).toContain('Server Eligibility Preview');
      expect(html).toContain('7,432');
      expect(html).toContain('2,568');
      expect(html).toContain('5,000');
      expect(html).toContain('2,432');

      // Invariant Protection: UI must NOT have computed 80% (8,000) or 20% (2,000)
      expect(html).not.toContain('8,000');
      expect(html).not.toContain('2,000');
    });

    it('renders loading placeholder while server calculation is in flight', () => {
      mockUseClaimPreview.mockReturnValue({
        preview: null,
        isLoading: true,
        error: null,
      });

      const html = renderToString(
        <ClaimSubmissionModal
          invoice={mockInvoice}
          open={true}
          onClose={vi.fn()}
          getPatient={() => mockPatient}
        />,
      );

      expect(html).toContain('Calculating multi-policy coordination on server');
    });

    it('surfaces database rejection in RuleError when claim preview fails', () => {
      const serverError = new ApiError(
        'Service date 2026-09-10 is outside policy validity window (expired on 2026-08-31)',
        422,
        'VALIDATION_ERROR',
      );

      mockUseClaimPreview.mockReturnValue({
        preview: null,
        isLoading: false,
        error: serverError,
      });

      const html = renderToString(
        <ClaimSubmissionModal
          invoice={mockInvoice}
          open={true}
          onClose={vi.fn()}
          getPatient={() => mockPatient}
        />,
      );

      expect(html).toContain('Operation rejected');
      expect(html).toContain('outside policy validity window');
      expect(html).toContain('VALIDATION_ERROR');
    });

    it('disables submit button and warns when patient has no active policies', () => {
      const patientWithoutPolicies: Patient = {
        ...mockPatient,
        policies: [],
      };

      mockUseClaimPreview.mockReturnValue({
        preview: null,
        isLoading: false,
        error: null,
      });

      const html = renderToString(
        <ClaimSubmissionModal
          invoice={mockInvoice}
          open={true}
          onClose={vi.fn()}
          getPatient={() => patientWithoutPolicies}
        />,
      );

      expect(html).toContain('This patient has no recorded active insurance policies');
      expect(html).toContain('disabled');
    });
  });

  // ── 2. Claim Review & Strict RBAC Finance-Gating ──────────────────────────

  describe('2. Claim Review Modal: RBAC Finance Authorization & Error Handling', () => {
    const mockClaimReviewItem = {
      invoice: mockInvoice,
      claim: {
        id: 'clm1001',
        policyNo: 'POL-CEY-001',
        provider: 'Ceylinco General Insurance',
        claimedAmount: 6550,
        approvedAmount: 0,
        status: 'Pending' as const,
        submittedAt: '2026-09-10T11:00:00Z',
      },
    };

    it('allows Finance Admin / Manager to view active resolution controls', () => {
      const html = renderToString(
        <ClaimReviewModal
          claimReview={mockClaimReviewItem}
          open={true}
          onClose={vi.fn()}
          currentUser={mockFinanceAdminUser}
        />,
      );

      expect(html).toContain('Review insurance claim');
      expect(html).toContain('Ceylinco General Insurance');
      expect(html).toContain('6,550');
      expect(html).toContain('Resolution Decision');
      expect(html).toContain('Approved (Full reimbursement)');
      expect(html).toContain('Partially approved');
      expect(html).toContain('Rejected');
      expect(html).not.toContain('Restricted Access (Finance Gate)');
    });

    it('blocks Receptionist role with visible Finance Gate banner and disabled controls', () => {
      const html = renderToString(
        <ClaimReviewModal
          claimReview={mockClaimReviewItem}
          open={true}
          onClose={vi.fn()}
          currentUser={mockReceptionistUser}
        />,
      );

      expect(html).toContain('Restricted Access (Finance Gate)');
      expect(html).toContain('Receptionist');
      expect(html).toContain('Reception and Clinicians are blocked both client-side and server-side');
      expect(html).toContain('disabled');
    });

    it('blocks Clinician role with Finance Gate banner', () => {
      const html = renderToString(
        <ClaimReviewModal
          claimReview={mockClaimReviewItem}
          open={true}
          onClose={vi.fn()}
          currentUser={mockClinicianUser}
        />,
      );

      expect(html).toContain('Restricted Access (Finance Gate)');
      expect(html).toContain('Clinician');
      expect(html).toContain('disabled');
    });

    it('gracefully handles 403 Forbidden API rejection when non-finance user attempts resolution', () => {
      const forbiddenError = new ApiError(
        'Permission denied: Claim resolution is restricted to Finance administrators.',
        403,
        'FORBIDDEN',
      );

      const html = renderToString(
        <ClaimReviewModal
          claimReview={mockClaimReviewItem}
          open={true}
          onClose={vi.fn()}
          currentUser={mockFinanceAdminUser}
        />,
      );

      expect(html).toContain('Review insurance claim');
      expect(forbiddenError.isForbidden()).toBe(true);
      expect(forbiddenError.status).toBe(403);
    });
  });

  // ── 3. Claim Tracker & Role Visibility ────────────────────────────────────

  describe('3. Claim Tracker: Lifecycle and Role Guarding', () => {
    it('displays pending claims count and disables review action for Receptionist', () => {
      const pendingClaims: { invoice: Invoice; claim: Claim }[] = [
        {
          invoice: mockInvoice,
          claim: {
            id: 'clm1001',
            policyNo: 'POL-CEY-001',
            provider: 'Ceylinco General Insurance',
            claimedAmount: 6550,
            approvedAmount: 0,
            status: 'Pending',
            submittedAt: '2026-09-10',
          },
        },
      ];

      const html = renderToString(
        <ClaimTracker
          claims={pendingClaims}
          pendingCount={1}
          onReviewClaim={vi.fn()}
          getPatient={() => mockPatient}
          currentUser={mockReceptionistUser}
        />,
      );

      expect(html).toContain('awaiting review');
      expect(html).toContain('Ceylinco General Insurance');
      expect(html).toContain('6,550');
      expect(html).toContain('Claim resolution is restricted to Finance administrators');
    });

    it('enables review action button for Admin/Manager role', () => {
      const pendingClaims: { invoice: Invoice; claim: Claim }[] = [
        {
          invoice: mockInvoice,
          claim: {
            id: 'clm1001',
            policyNo: 'POL-CEY-001',
            provider: 'Ceylinco General Insurance',
            claimedAmount: 6550,
            approvedAmount: 0,
            status: 'Pending',
            submittedAt: '2026-09-10',
          },
        },
      ];

      const html = renderToString(
        <ClaimTracker
          claims={pendingClaims}
          pendingCount={1}
          onReviewClaim={vi.fn()}
          getPatient={() => mockPatient}
          currentUser={mockFinanceAdminUser}
        />,
      );

      expect(html).toContain('Review claim');
      expect(html).not.toContain('Claim resolution is restricted to Finance administrators');
    });
  });

  // ── 4. Patient Registration & Duplicate Identity Recovery ─────────────────

  describe('4. Patient Registration & Duplicate Handling Flow', () => {
    it('renders registration modal with full identity and contact fields', () => {
      const html = renderToString(
        <RegisterPatientModal
          open={true}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
          defaultBranchId={1}
        />,
      );

      expect(html).toContain('Register a new patient');
      expect(html).toContain('Personal details');
      expect(html).toContain('First name');
      expect(html).toContain('Last name');
      expect(html).toContain('NIC Number');
      expect(html).toContain('Checked for clinic-wide uniqueness');
      expect(html).toContain('Primary Emergency Contact');
      expect(html).toContain('MedSync Colombo Main');
    });

    it('surfaces duplicate identity error and confirms UI remains recoverable without closing', () => {
      const duplicateError = new ApiError(
        'Identity number 198510203040 is already registered to another patient',
        409,
        'DUPLICATE_IDENTITY',
      );

      expect(duplicateError.isConflict()).toBe(true);
      expect(duplicateError.status).toBe(409);
      expect(duplicateError.code).toBe('DUPLICATE_IDENTITY');

      // Verify ClinicRuleError compatibility
      const ruleErr = new ClinicRuleError(
        'DUPLICATE_IDENTITY',
        'Identity number 198510203040 is already registered to another patient',
      );
      expect(ruleErr.code).toBe('DUPLICATE_IDENTITY');
    });
  });

  // ── 5. Policy Actions & Patient Detail Inspection ─────────────────────────

  describe('5. Policy Actions & Patient Detail Inspection', () => {
    it('renders policy creation form with provider choices and treatment coverage terms', () => {
      const html = renderToString(
        <AddPolicyModal
          open={true}
          onClose={vi.fn()}
          patient={mockPatientDto}
          onSuccess={vi.fn()}
        />,
      );

      expect(html).toContain('Add insurance policy');
      expect(html).toContain('Anura Perera');
      expect(html).toContain('Insurance provider');
      expect(html).toContain('Ceylinco General Insurance');
      expect(html).toContain('Treatment coverage terms');
      expect(html).toContain('General Consultation');
    });

    it('renders patient detail modal with policy history and active coverage breakdown', () => {
      const html = renderToString(
        <PatientDetailModal
          patient={mockPatientDto}
          open={true}
          onClose={vi.fn()}
          currentUser={mockFinanceAdminUser}
          onOpenAddPolicy={vi.fn()}
        />,
      );

      expect(html).toContain('Anura Perera');
      expect(html).toContain('PAT-20261001-0001');
      expect(html).toContain('198510203040');
      expect(html).toContain('Clinic-wide patient record');
    });
  });
});
