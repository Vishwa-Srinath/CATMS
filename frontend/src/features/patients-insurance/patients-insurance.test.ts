/**
 * src/features/patients-insurance/patients-insurance.test.ts
 * Owner: Dev3 | Issue: CATMS-059
 *
 * Unit and integration tests for Patient and Insurance API client, contracts,
 * duplicate identity detection, invalid policy rules, and persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { patientsApi, type RegisterPatientInput } from '../../api/patients.api';
import { insuranceApi, type CreateInsurancePolicyInput, type AddPolicyCoverageInput } from '../../api/insurance.api';
import { ApiError } from '../../api/errors';

describe('CATMS-059 — Patient and Insurance Frontend API & Business Rules Integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { document?: { cookie: string } }).document = {
      cookie: 'catms_csrf=test-csrf-token;',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  // ── 1. Patient Search & Listing ───────────────────────────────────────────

  describe('1. Clinic-wide Patient Search & Listing', () => {
    it('fetches clinic-wide patient list from /patients/search unwrapping envelope', async () => {
      const mockPatients = [
        {
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
          registeredBranchName: 'MedSync Colombo Main',
          isActive: true,
          registeredAt: '2026-10-01T08:00:00.000Z',
          createdAt: '2026-10-01T08:00:00.000Z',
          updatedAt: '2026-10-01T08:00:00.000Z',
          primaryIdentity: {
            identityId: 1,
            patientId: 1,
            identityType: 'NIC',
            identityNumber: '198510203040',
            isPrimary: true,
            createdAt: '2026-10-01T08:00:00.000Z',
          },
          primaryContact: {
            contactId: 1,
            patientId: 1,
            contactName: 'Champa Perera',
            relationship: 'Spouse',
            phoneNumber: '+94 71 234 5678',
            isPrimary: true,
            createdAt: '2026-10-01T08:00:00.000Z',
          },
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockPatients, meta: { correlationId: 'test-123' } }),
      });

      const result = await patientsApi.search('Anura');
      expect(result).toHaveLength(1);
      expect(result[0].patientNumber).toBe('PAT-20261001-0001');
      expect(result[0].registeredBranchName).toBe('MedSync Colombo Main');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/patients/search?q=Anura'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('retrieves single patient profile with identities, emergency contacts, and policies', async () => {
      const mockDetail = {
        patientId: 1,
        patientNumber: 'PAT-20261001-0001',
        firstName: 'Anura',
        lastName: 'Perera',
        fullName: 'Anura Perera',
        dateOfBirth: '1985-05-12',
        gender: 'Male',
        bloodGroup: 'B+',
        contactNumber: '+94 77 123 4567',
        registeredBranchId: 1,
        isActive: true,
        registeredAt: '2026-10-01T08:00:00.000Z',
        createdAt: '2026-10-01T08:00:00.000Z',
        updatedAt: '2026-10-01T08:00:00.000Z',
        identities: [
          {
            identityId: 1,
            patientId: 1,
            identityType: 'NIC',
            identityNumber: '198510203040',
            isPrimary: true,
            createdAt: '2026-10-01T08:00:00.000Z',
          },
        ],
        emergencyContacts: [
          {
            contactId: 1,
            patientId: 1,
            contactName: 'Champa Perera',
            relationship: 'Spouse',
            phoneNumber: '+94 71 234 5678',
            isPrimary: true,
            createdAt: '2026-10-01T08:00:00.000Z',
          },
        ],
        policies: [
          {
            policyId: 1,
            patientId: 1,
            providerId: 1,
            providerCode: 'SLIC',
            providerName: 'Sri Lanka Insurance',
            policyNumber: 'SLIC-POL-99001',
            policyStatus: 'ACTIVE',
            validFrom: '2026-01-01',
            validTo: '2026-12-31',
            notes: null,
            createdAt: '2026-10-01T08:00:00.000Z',
            updatedAt: '2026-10-01T08:00:00.000Z',
          },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockDetail }),
      });

      const detail = await patientsApi.getById(1);
      expect(detail.patientId).toBe(1);
      expect(detail.identities).toHaveLength(1);
      expect(detail.emergencyContacts).toHaveLength(1);
      expect(detail.policies).toHaveLength(1);
      expect(detail.policies[0].policyNumber).toBe('SLIC-POL-99001');
    });
  });

  // ── 2. Atomic Patient Registration & Errors ───────────────────────────────

  describe('2. Patient Registration & Database Error Feedback', () => {
    const validRegistration: RegisterPatientInput = {
      firstName: 'Kasun',
      lastName: 'Bandara',
      dateOfBirth: '1995-06-15',
      gender: 'Male',
      contactNumber: '+94 77 555 6666',
      identityType: 'NIC',
      identityNumber: '199516600011',
      contactName: 'Nalini Bandara',
      relationship: 'Mother',
      emergencyPhone: '+94 77 444 3333',
      bloodGroup: 'AB+',
      email: 'kasun.b@example.lk',
      address: '77 Kandy Road, Peradeniya',
      registeredBranchId: 2,
    };

    it('successfully posts atomic registration and receives created patient record', async () => {
      const createdPatient = {
        patientId: 3,
        patientNumber: 'PAT-20261001-0003',
        ...validRegistration,
        fullName: 'Kasun Bandara',
        isActive: true,
        registeredAt: '2026-10-10T10:00:00.000Z',
        createdAt: '2026-10-10T10:00:00.000Z',
        updatedAt: '2026-10-10T10:00:00.000Z',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: createdPatient }),
      });

      const result = await patientsApi.register(validRegistration);
      expect(result.patientId).toBe(3);
      expect(result.patientNumber).toBe('PAT-20261001-0003');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/patients',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'test-csrf-token',
          }),
        }),
      );
    });

    it('surfaces 409 CONFLICT with exact DB error message when identity already exists', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'CONFLICT',
            message: 'Patient with identity 198510203040 already exists clinic-wide.',
          },
          meta: { correlationId: 'conflict-corr-id' },
        }),
      });

      await expect(
        patientsApi.register({
          ...validRegistration,
          identityNumber: '198510203040',
        }),
      ).rejects.toThrow('Patient with identity 198510203040 already exists clinic-wide.');

      try {
        await patientsApi.register({
          ...validRegistration,
          identityNumber: '198510203040',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(409);
        expect(apiErr.code).toBe('CONFLICT');
        expect(apiErr.isConflict()).toBe(true);
      }
    });

    it('surfaces 422 VALIDATION_ERROR when date of birth is in the future', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            fieldErrors: [
              { field: 'dateOfBirth', message: 'Date of birth cannot be in the future.' },
            ],
          },
          meta: { correlationId: 'dob-validation-err' },
        }),
      });

      try {
        await patientsApi.register({
          ...validRegistration,
          dateOfBirth: '2028-01-01',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.isValidationError()).toBe(true);
        expect(apiErr.fieldErrors[0].field).toBe('dateOfBirth');
        expect(apiErr.fieldErrors[0].message).toBe('Date of birth cannot be in the future.');
      }
    });
  });

  // ── 3. Emergency Contacts CRUD ─────────────────────────────────────────────

  describe('3. Emergency Contacts Management', () => {
    it('fetches emergency contacts for a patient from /patients/:id/contacts', async () => {
      const mockContacts = [
        {
          contactId: 1,
          patientId: 1,
          contactName: 'Champa Perera',
          relationship: 'Spouse',
          phoneNumber: '+94 71 234 5678',
          isPrimary: true,
          createdAt: '2026-10-01T08:00:00.000Z',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockContacts }),
      });

      const contacts = await patientsApi.getEmergencyContacts(1);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].contactName).toBe('Champa Perera');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/patients/1/contacts',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('adds secondary emergency contact to a patient', async () => {
      const newContact = {
        contactName: 'Sunil Perera',
        relationship: 'Brother',
        phoneNumber: '+94 77 999 1111',
        isPrimary: false,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: { contactId: 2, patientId: 1, ...newContact },
        }),
      });

      const result = await patientsApi.addEmergencyContact(1, newContact);
      expect(result.contactId).toBe(2);
      expect(result.contactName).toBe('Sunil Perera');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/patients/1/contacts',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  // ── 4. Insurance Providers & Policies ──────────────────────────────────────

  describe('4. Insurance Providers and Policies', () => {
    it('fetches active insurance providers list', async () => {
      const mockProviders = [
        {
          providerId: 1,
          providerCode: 'SLIC',
          name: 'Sri Lanka Insurance',
          status: 'ACTIVE',
          contactName: 'Claims Desk',
          contactPhone: '+94 11 235 7000',
          contactEmail: 'claims@slic.lk',
          notes: null,
          createdAt: '2026-10-01T08:00:00.000Z',
          updatedAt: '2026-10-01T08:00:00.000Z',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockProviders }),
      });

      const providers = await insuranceApi.getProviders('ACTIVE');
      expect(providers).toHaveLength(1);
      expect(providers[0].providerCode).toBe('SLIC');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/insurance/providers?status=ACTIVE'),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('creates an insurance policy for a patient', async () => {
      const policyPayload: CreateInsurancePolicyInput = {
        patientId: 2,
        providerId: 2,
        policyNumber: 'AIA-HLTH-88220',
        validFrom: '2026-03-01',
        validTo: '2027-02-28',
        policyStatus: 'ACTIVE',
        notes: 'Corporate policy',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: { policyId: 10, ...policyPayload },
        }),
      });

      const policy = await insuranceApi.createPolicy(policyPayload);
      expect(policy.policyId).toBe(10);
      expect(policy.policyNumber).toBe('AIA-HLTH-88220');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/insurance/policies',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('surfaces 422 VALIDATION_ERROR when validTo date precedes validFrom', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Valid-until date must be on or after valid-from date.',
          },
        }),
      });

      try {
        await insuranceApi.createPolicy({
          patientId: 1,
          providerId: 1,
          policyNumber: 'INV-DATE-001',
          validFrom: '2026-06-01',
          validTo: '2026-05-01',
        });
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(422);
        expect(apiErr.message).toBe('Valid-until date must be on or after valid-from date.');
      }
    });

    it('adds treatment coverage term to an insurance policy', async () => {
      const coveragePayload: AddPolicyCoverageInput = {
        treatmentId: 2,
        coveragePercentage: 70.0,
        coverageCap: 5000.0,
        effectiveFrom: '2026-01-01',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: { coverageId: 5, policyId: 1, ...coveragePayload },
        }),
      });

      const coverage = await insuranceApi.addPolicyCoverage(1, coveragePayload);
      expect(coverage.coverageId).toBe(5);
      expect(coverage.coveragePercentage).toBe(70.0);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/insurance/policies/1/coverages',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('checks effective coverage eligibility lookup', async () => {
      const mockEffective = {
        coverageId: 1,
        policyId: 1,
        treatmentId: 1,
        coveragePercentage: 80.0,
        coverageCap: 3000.0,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-12-31',
        isEligible: true,
        ineligibilityReason: null,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockEffective }),
      });

      const effective = await insuranceApi.getEffectiveCoverage(1, 1, '2026-05-10');
      expect(effective.isEligible).toBe(true);
      expect(effective.coveragePercentage).toBe(80.0);
      expect(effective.ineligibilityReason).toBeNull();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/insurance/policies/1/effective-coverage?treatmentId=1&serviceDate=2026-05-10'),
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });
});
