/**
 * src/features/administration/administration.test.ts
 * Owner: Dev2 | Issue: CATMS-058
 *
 * Unit and integration tests for Administration API client, contracts, and business rules.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { staffApi } from '../../api/staff.api';
import { ApiError } from '../../api/errors';

describe('CATMS-058 — Administration Frontend API & Business Rules Integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as { document?: { cookie: string } }).document = {
      cookie: 'catms_csrf=valid-csrf-token;',
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  describe('1. Branches Management', () => {
    it('fetches branches list unwrapped from API envelope', async () => {
      const mockBranches = [
        {
          branchId: 1,
          branchCode: 'CMB',
          name: 'MedSync Colombo Main',
          city: 'Colombo',
          addressLine1: '100 Galle Road',
          contactPhone: '0112111111',
          isActive: true,
          manager: 'Kamal Perera',
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockBranches }),
      });

      const branches = await staffApi.getBranches();
      expect(branches).toHaveLength(1);
      expect(branches[0].branchCode).toBe('CMB');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/branches',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('creates a new branch with valid input and CSRF token', async () => {
      const newBranch = {
        branchCode: 'NEG',
        name: 'MedSync Negombo',
        city: 'Negombo',
        addressLine1: '45 Main Street',
        contactPhone: '0312223344',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ data: { branchId: 4, ...newBranch, isActive: true } }),
      });

      const created = await staffApi.createBranch(newBranch);
      expect(created.branchId).toBe(4);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/branches',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-CSRF-Token': 'valid-csrf-token',
          }),
        }),
      );
    });

    it('assigns branch manager successfully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { assignmentId: 10, branchId: 1, employeeId: 2 },
        }),
      });

      const res = await staffApi.assignBranchManager(1, { employeeId: 2, reason: 'Promotion' });
      expect(res.assignmentId).toBe(10);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/branches/1/manager',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('2. Staff Directory Management', () => {
    it('registers a new employee', async () => {
      const input = {
        employeeNumber: 'EMP-0099',
        nic: '199512345678',
        fullName: 'Dilshan Silva',
        genderCode: 'M',
        dateOfBirth: '1995-03-12',
        positionCode: 'Nurse',
        phone: '0779998877',
        branchId: 1,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: { employeeId: 15, userAccountId: null, assignmentId: 20 },
        }),
      });

      const result = await staffApi.registerEmployee(input);
      expect(result.employeeId).toBe(15);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/employees',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('reassigns employee to new branch', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { assignmentId: 21, employeeId: 15, branchId: 2 },
        }),
      });

      const result = await staffApi.assignEmployeeBranch(15, { branchId: 2 });
      expect(result.branchId).toBe(2);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/employees/15/assignments',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('deactivates employee softly with reason payload', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: { success: true, employeeId: 15 },
        }),
      });

      const result = await staffApi.deactivateEmployee(15, { reason: 'Resigned' });
      expect(result.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/employees/15',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('3. Doctors and Specialties', () => {
    it('registers doctor profile with medical license and specialties', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: { doctorId: 5 },
        }),
      });

      const res = await staffApi.registerDoctor({
        employeeId: 15,
        medicalLicenseNo: 'SLMC-99881',
        defaultConsultationFee: 3500,
        specialtyIds: [1, 2],
      });
      expect(res.doctorId).toBe(5);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/doctors',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('fetches specialties list', async () => {
      const mockSpecialties = [
        { specialtyId: 1, specialtyCode: 'GP', name: 'General Practice', description: null, isActive: true },
        { specialtyId: 2, specialtyCode: 'CARD', name: 'Cardiology', description: null, isActive: true },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockSpecialties }),
      });

      const list = await staffApi.getSpecialties();
      expect(list).toHaveLength(2);
      expect(list[0].specialtyCode).toBe('GP');
    });
  });

  describe('4. User Account Governance & Audit Trail', () => {
    it('creates a user account linked to an employee', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            userAccountId: 22,
            employeeId: 15,
            username: 'd.silva',
            accountStatus: 'Active',
            failedLoginCount: 0,
            roles: [{ roleCode: 'Reception', roleDisplayName: 'Receptionist', branchScopeId: 1 }],
          },
        }),
      });

      const created = await staffApi.createAdminUser({
        employeeId: 15,
        username: 'd.silva',
        password: 'TemporaryPassword123!',
        roleCode: 'Reception',
        branchScopeId: 1,
      });

      expect(created.userAccountId).toBe(22);
      expect(created.accountStatus).toBe('Active');
    });

    it('unlocks locked user account via /admin/users/:id/unlock', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            userAccountId: 5,
            accountStatus: 'Active',
            failedLoginCount: 0,
          },
        }),
      });

      const res = await staffApi.unlockAdminUser(5);
      expect(res.accountStatus).toBe('Active');
      expect(res.failedLoginCount).toBe(0);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/admin/users/5/unlock',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('updates user role and branch scope via /admin/users/:id/role', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            userAccountId: 5,
            roles: [{ roleCode: 'Admin', roleDisplayName: 'System Administrator', branchScopeId: null }],
          },
        }),
      });

      const res = await staffApi.updateAdminUserRole(5, { roleCode: 'Admin', branchScopeId: null });
      expect(res.userAccountId).toBe(5);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/admin/users/5/role',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('fetches audit logs from /admin/audit-logs', async () => {
      const mockLogs = [
        {
          auditEventId: 101,
          actionCode: 'USER_ACCOUNT_UNLOCKED',
          entityType: 'USER_ACCOUNT',
          entityId: '5',
          actorUserId: 2,
          actorUsername: 'admin.user',
          actorName: 'Admin User',
          occurredAt: '2026-10-10T09:00:00Z',
          details: { previousStatus: 'Locked' },
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: mockLogs }),
      });

      const logs = await staffApi.getAuditLogs({ limit: 50 });
      expect(logs).toHaveLength(1);
      expect(logs[0].actionCode).toBe('USER_ACCOUNT_UNLOCKED');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/admin/audit-logs?limit=50',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('correctly maps 403 Forbidden business rule error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({
          error: {
            code: 'FORBIDDEN_ROLE',
            message: 'Only Admin role can perform this operation.',
          },
          meta: { correlationId: 'test-corr-403' },
        }),
      });

      await expect(staffApi.createBranch({
        branchCode: 'BAD',
        name: 'Unauthorized',
        city: 'Bad',
        addressLine1: 'None',
        contactPhone: '0000',
      })).rejects.toThrow(ApiError);
    });
  });
});
