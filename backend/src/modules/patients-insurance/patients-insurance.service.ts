/**
 * src/modules/patients-insurance/patients-insurance.service.ts
 * Owner: Dev3 | Issue: CATMS-048
 *
 * Core service operations for Patient Identity, Emergency Contacts,
 * Insurance Providers, Policies, and Coverage Terms.
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003, CATMS-006, CATMS-025, CATMS-026):
 *   - All mutations execute inside withTransaction().
 *   - Stored procedures handle business rule verification, atomicity, and lifecycle updates.
 *   - Parameterized SQL only — no ORM.
 *   - Patient search is clinic-wide across all branches (ignores branch filter).
 *   - Client-supplied IDs, status, and audit timestamps MUST NOT be accepted.
 *   - registered_by is derived strictly from authenticated user.
 */

import type { Pool, PoolClient } from 'pg';
import { pool } from '../../db/pool';
import { withTransaction, type DbRole } from '../../db/transaction';
import { AppError } from '../../shared/errors';
import type { JwtPayload } from '../../app/middleware/auth';
import type {
  PatientDto,
  PatientDetailDto,
  PatientIdentityDto,
  EmergencyContactDto,
  RegisterPatientInput,
  UpdatePatientInput,
  PatientSearchFilters,
  CreateEmergencyContactInput,
  UpdateEmergencyContactInput,
  CreatePatientIdentityInput,
  InsuranceProviderDto,
  CreateInsuranceProviderInput,
  InsurancePolicyDto,
  InsurancePolicyDetailDto,
  CreateInsurancePolicyInput,
  UpdatePolicyStatusInput,
  PolicyListFilters,
  PolicyCoverageDto,
  AddPolicyCoverageInput,
  UpdatePolicyCoverageInput,
  EffectiveCoverageDto,
  InsuranceProviderStatus,
} from '../../contracts/patients-insurance.contract';

function resolveDbRole(user?: JwtPayload): DbRole {
  if (!user) return 'catms_app';
  const role = (user.role || '').toLowerCase();
  if (role === 'admin') return 'catms_admin';
  if (role === 'reception' || role === 'receptionist') return 'catms_reception';
  if (role === 'clinician' || role === 'doctor') return 'catms_clinician';
  if (role === 'manager' || role === 'branchmanager') return 'catms_manager';
  if (role === 'qa') return 'catms_qa';
  return 'catms_app';
}

function formatDateOnly(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val);
  return str.length >= 10 ? str.slice(0, 10) : str;
}

export class PatientsInsuranceService {
  // ── Mapping Helpers ────────────────────────────────────────────────────────

  private mapPatientRow(r: Record<string, unknown>): PatientDto {
    const primaryIdentity: PatientIdentityDto | null = r['identity_id']
      ? {
          identityId: Number(r['identity_id']),
          patientId: Number(r['patient_id']),
          identityType: r['identity_type'] as PatientIdentityDto['identityType'],
          identityNumber: String(r['identity_number']),
          isPrimary: Boolean(r['identity_is_primary'] ?? true),
          createdAt: new Date(r['identity_created_at'] as string | Date).toISOString(),
        }
      : null;

    const primaryContact: EmergencyContactDto | null = r['contact_id']
      ? {
          contactId: Number(r['contact_id']),
          patientId: Number(r['patient_id']),
          contactName: String(r['contact_name']),
          relationship: String(r['relationship']),
          phoneNumber: String(r['emergency_phone_number'] ?? r['phone_number']),
          isPrimary: Boolean(r['contact_is_primary'] ?? true),
          createdAt: new Date(r['contact_created_at'] as string | Date).toISOString(),
        }
      : null;

    return {
      patientId: Number(r['patient_id']),
      patientNumber: String(r['patient_number']),
      firstName: String(r['first_name']),
      lastName: String(r['last_name']),
      fullName: `${String(r['first_name'])} ${String(r['last_name'])}`.trim(),
      dateOfBirth: formatDateOnly(r['date_of_birth']),
      gender: r['gender'] as PatientDto['gender'],
      bloodGroup: r['blood_group'] ? (r['blood_group'] as PatientDto['bloodGroup']) : null,
      contactNumber: String(r['contact_number']),
      email: r['email'] ? String(r['email']) : null,
      address: r['address'] ? String(r['address']) : null,
      registeredBranchId: r['registered_branch_id'] ? Number(r['registered_branch_id']) : null,
      registeredBranchName: r['registered_branch_name'] ? String(r['registered_branch_name']) : null,
      registeredBy: r['registered_by'] ? Number(r['registered_by']) : null,
      registeredAt: new Date(r['registered_at'] as string | Date).toISOString(),
      isActive: Boolean(r['is_active']),
      createdAt: new Date(r['created_at'] as string | Date).toISOString(),
      updatedAt: new Date(r['updated_at'] as string | Date).toISOString(),
      primaryIdentity,
      primaryContact,
    };
  }

  private mapIdentityRow(r: Record<string, unknown>): PatientIdentityDto {
    return {
      identityId: Number(r['identity_id']),
      patientId: Number(r['patient_id']),
      identityType: r['identity_type'] as PatientIdentityDto['identityType'],
      identityNumber: String(r['identity_number']),
      isPrimary: Boolean(r['is_primary']),
      createdAt: new Date(r['created_at'] as string | Date).toISOString(),
    };
  }

  private mapEmergencyContactRow(r: Record<string, unknown>): EmergencyContactDto {
    return {
      contactId: Number(r['contact_id']),
      patientId: Number(r['patient_id']),
      contactName: String(r['contact_name']),
      relationship: String(r['relationship']),
      phoneNumber: String(r['phone_number']),
      isPrimary: Boolean(r['is_primary']),
      createdAt: new Date(r['created_at'] as string | Date).toISOString(),
    };
  }

  private mapProviderRow(r: Record<string, unknown>): InsuranceProviderDto {
    return {
      providerId: Number(r['provider_id']),
      providerCode: String(r['provider_code']),
      name: String(r['name']),
      contactName: r['contact_name'] ? String(r['contact_name']) : null,
      contactPhone: r['contact_phone'] ? String(r['contact_phone']) : null,
      contactEmail: r['contact_email'] ? String(r['contact_email']) : null,
      status: r['status'] as InsuranceProviderDto['status'],
      notes: r['notes'] ? String(r['notes']) : null,
      createdAt: new Date(r['created_at'] as string | Date).toISOString(),
      updatedAt: new Date(r['updated_at'] as string | Date).toISOString(),
    };
  }

  private mapPolicyRow(r: Record<string, unknown>): InsurancePolicyDto {
    return {
      policyId: Number(r['policy_id']),
      patientId: Number(r['patient_id']),
      providerId: Number(r['provider_id']),
      providerCode: r['provider_code'] ? String(r['provider_code']) : undefined,
      providerName: r['provider_name'] ? String(r['provider_name']) : undefined,
      policyNumber: String(r['policy_number']),
      policyStatus: r['policy_status'] as InsurancePolicyDto['policyStatus'],
      validFrom: formatDateOnly(r['valid_from']),
      validTo: r['valid_to'] ? formatDateOnly(r['valid_to']) : null,
      notes: r['notes'] ? String(r['notes']) : null,
      createdAt: new Date(r['created_at'] as string | Date).toISOString(),
      updatedAt: new Date(r['updated_at'] as string | Date).toISOString(),
    };
  }

  private mapCoverageRow(r: Record<string, unknown>): PolicyCoverageDto {
    return {
      coverageId: Number(r['coverage_id']),
      policyId: Number(r['policy_id']),
      treatmentId: Number(r['treatment_id']),
      treatmentName: r['treatment_name'] ? String(r['treatment_name']) : null,
      serviceCode: r['service_code'] ? String(r['service_code']) : null,
      coveragePercentage: Number(r['coverage_percentage']),
      coverageCap: r['coverage_cap'] !== null && r['coverage_cap'] !== undefined ? Number(r['coverage_cap']) : null,
      effectiveFrom: formatDateOnly(r['effective_from']),
      effectiveTo: r['effective_to'] ? formatDateOnly(r['effective_to']) : null,
      createdAt: new Date(r['created_at'] as string | Date).toISOString(),
    };
  }

  // ── Patient Queries & Procedures ───────────────────────────────────────────

  /**
   * Clinic-wide search and listing of patients.
   * Explicitly ignores registration branch to support clinic-wide accessibility.
   */
  async searchPatients(filters: PatientSearchFilters): Promise<PatientDto[]> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.max(1, Math.min(100, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.isActive === 'true' || filters.isActive === undefined) {
      conditions.push('p.is_active = TRUE');
    } else if (filters.isActive === 'false') {
      conditions.push('p.is_active = FALSE');
    }

    if (filters.q && filters.q.trim().length > 0) {
      const qParam = `%${filters.q.trim()}%`;
      values.push(qParam);
      const idx = values.length;
      conditions.push(`(
        p.patient_number ILIKE $${idx} OR
        p.first_name ILIKE $${idx} OR
        p.last_name ILIKE $${idx} OR
        (p.first_name || ' ' || p.last_name) ILIKE $${idx} OR
        p.contact_number ILIKE $${idx} OR
        p.email ILIKE $${idx} OR
        pi.identity_number ILIKE $${idx}
      )`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(limit, offset);
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;

    const sql = `
      SELECT
        p.patient_id,
        p.patient_number,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.gender,
        p.blood_group,
        p.contact_number,
        p.email,
        p.address,
        p.registered_branch_id,
        b.name AS registered_branch_name,
        p.registered_by,
        p.registered_at,
        p.is_active,
        p.created_at,
        p.updated_at,
        pi.identity_id,
        pi.identity_type,
        pi.identity_number,
        pi.is_primary AS identity_is_primary,
        pi.created_at AS identity_created_at,
        ec.contact_id,
        ec.contact_name,
        ec.relationship,
        ec.phone_number AS emergency_phone_number,
        ec.is_primary AS contact_is_primary,
        ec.created_at AS contact_created_at
      FROM catms.patient p
      LEFT JOIN catms.branch b ON p.registered_branch_id = b.branch_id
      LEFT JOIN catms.patient_identity pi ON p.patient_id = pi.patient_id AND pi.is_primary = TRUE
      LEFT JOIN catms.emergency_contact ec ON p.patient_id = ec.patient_id AND ec.is_primary = TRUE
      ${whereClause}
      ORDER BY p.patient_id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const res = await pool.query(sql, values);
    return res.rows.map((r) => this.mapPatientRow(r));
  }

  /**
   * Retrieves single patient details along with all identities, emergency contacts,
   * and policies.
   */
  async getPatientById(
    patientId: number,
    clientOrPool: Pool | PoolClient = pool,
  ): Promise<PatientDetailDto> {
    const patientRes = await clientOrPool.query(
      `SELECT
        p.patient_id,
        p.patient_number,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.gender,
        p.blood_group,
        p.contact_number,
        p.email,
        p.address,
        p.registered_branch_id,
        b.name AS registered_branch_name,
        p.registered_by,
        p.registered_at,
        p.is_active,
        p.created_at,
        p.updated_at
      FROM catms.patient p
      LEFT JOIN catms.branch b ON p.registered_branch_id = b.branch_id
      WHERE p.patient_id = $1`,
      [patientId],
    );

    if (patientRes.rows.length === 0) {
      throw AppError.notFound('Patient');
    }

    const row = patientRes.rows[0];

    // Fetch identities
    const idRes = await clientOrPool.query(
      `SELECT identity_id, patient_id, identity_type, identity_number, is_primary, created_at
       FROM catms.patient_identity
       WHERE patient_id = $1
       ORDER BY is_primary DESC, identity_id ASC`,
      [patientId],
    );

    // Fetch emergency contacts
    const ecRes = await clientOrPool.query(
      `SELECT contact_id, patient_id, contact_name, relationship, phone_number, is_primary, created_at
       FROM catms.emergency_contact
       WHERE patient_id = $1
       ORDER BY is_primary DESC, contact_id ASC`,
      [patientId],
    );

    // Fetch insurance policies
    const polRes = await clientOrPool.query(
      `SELECT
         pol.policy_id,
         pol.patient_id,
         pol.provider_id,
         prov.provider_code,
         prov.name AS provider_name,
         pol.policy_number,
         pol.policy_status,
         pol.valid_from,
         pol.valid_to,
         pol.notes,
         pol.created_at,
         pol.updated_at
       FROM catms.insurance_policy pol
       JOIN catms.insurance_provider prov ON pol.provider_id = prov.provider_id
       WHERE pol.patient_id = $1
       ORDER BY pol.valid_from DESC, pol.policy_id DESC`,
      [patientId],
    );

    const identities = idRes.rows.map((r) => this.mapIdentityRow(r));
    const emergencyContacts = ecRes.rows.map((r) => this.mapEmergencyContactRow(r));
    const policies = polRes.rows.map((r) => this.mapPolicyRow(r));

    const basePatient = this.mapPatientRow({
      ...row,
      identity_id: identities[0]?.identityId,
      identity_type: identities[0]?.identityType,
      identity_number: identities[0]?.identityNumber,
      identity_is_primary: identities[0]?.isPrimary,
      identity_created_at: identities[0]?.createdAt,
      contact_id: emergencyContacts[0]?.contactId,
      contact_name: emergencyContacts[0]?.contactName,
      relationship: emergencyContacts[0]?.relationship,
      emergency_phone_number: emergencyContacts[0]?.phoneNumber,
      contact_is_primary: emergencyContacts[0]?.isPrimary,
      contact_created_at: emergencyContacts[0]?.createdAt,
    });

    return {
      ...basePatient,
      identities,
      emergencyContacts,
      policies,
    };
  }

  /**
   * Registers a patient atomically via catms.register_patient procedure.
   * Creates patient master, primary identity, and primary emergency contact.
   * Server strictly enforces that registered_by is taken from the authenticated user.
   */
  async registerPatient(
    input: RegisterPatientInput,
    user: JwtPayload,
  ): Promise<PatientDetailDto> {
    const dbRole = resolveDbRole(user);

    // Derive registered_by from authenticated user
    const registeredBy = user.employeeId && user.employeeId > 0 ? user.employeeId : null;

    // Resolve branch: if provided use it, else default to user's assigned branch if single-branch
    let branchId: number | null = input.registeredBranchId ?? null;
    if (branchId === null && typeof user.branchId === 'number') {
      branchId = user.branchId;
    }

    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.register_patient(
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NULL
        )`,
        [
          input.firstName,
          input.lastName,
          input.dateOfBirth,
          input.gender,
          input.contactNumber,
          input.identityType,
          input.identityNumber,
          input.contactName,
          input.relationship,
          input.emergencyPhone,
          input.patientNumber ?? null,
          input.bloodGroup ?? null,
          input.email ?? null,
          input.address ?? null,
          branchId,
          registeredBy,
        ],
      );

      const patientId = Number(res.rows[0]?.p_patient_id);
      return this.getPatientById(patientId, client);
    }, dbRole);
  }

  /**
   * Updates basic patient demographic fields.
   */
  async updatePatient(
    patientId: number,
    input: UpdatePatientInput,
    user: JwtPayload,
  ): Promise<PatientDetailDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      // Verify patient exists
      const check = await client.query('SELECT patient_id FROM catms.patient WHERE patient_id = $1', [patientId]);
      if (check.rows.length === 0) {
        throw AppError.notFound('Patient');
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (input.firstName !== undefined) {
        values.push(input.firstName.trim());
        updates.push(`first_name = $${values.length}`);
      }
      if (input.lastName !== undefined) {
        values.push(input.lastName.trim());
        updates.push(`last_name = $${values.length}`);
      }
      if (input.dateOfBirth !== undefined) {
        values.push(input.dateOfBirth);
        updates.push(`date_of_birth = $${values.length}`);
      }
      if (input.gender !== undefined) {
        values.push(input.gender);
        updates.push(`gender = $${values.length}`);
      }
      if (input.bloodGroup !== undefined) {
        values.push(input.bloodGroup);
        updates.push(`blood_group = $${values.length}`);
      }
      if (input.contactNumber !== undefined) {
        values.push(input.contactNumber.trim());
        updates.push(`contact_number = $${values.length}`);
      }
      if (input.email !== undefined) {
        values.push(input.email ? input.email.trim() : null);
        updates.push(`email = $${values.length}`);
      }
      if (input.address !== undefined) {
        values.push(input.address ? input.address.trim() : null);
        updates.push(`address = $${values.length}`);
      }
      if (input.isActive !== undefined) {
        values.push(input.isActive);
        updates.push(`is_active = $${values.length}`);
      }

      if (updates.length > 0) {
        updates.push('updated_at = clock_timestamp()');
        values.push(patientId);
        const sql = `UPDATE catms.patient SET ${updates.join(', ')} WHERE patient_id = $${values.length}`;
        await client.query(sql, values);
      }

      return this.getPatientById(patientId, client);
    }, dbRole);
  }

  // ── Emergency Contacts CRUD ────────────────────────────────────────────────

  async listEmergencyContacts(patientId: number): Promise<EmergencyContactDto[]> {
    const res = await pool.query(
      `SELECT contact_id, patient_id, contact_name, relationship, phone_number, is_primary, created_at
       FROM catms.emergency_contact
       WHERE patient_id = $1
       ORDER BY is_primary DESC, contact_id ASC`,
      [patientId],
    );
    return res.rows.map((r) => this.mapEmergencyContactRow(r));
  }

  async addEmergencyContact(
    patientId: number,
    input: CreateEmergencyContactInput,
    user: JwtPayload,
  ): Promise<EmergencyContactDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      // Check patient exists
      const patientCheck = await client.query('SELECT patient_id FROM catms.patient WHERE patient_id = $1', [patientId]);
      if (patientCheck.rows.length === 0) {
        throw AppError.notFound('Patient');
      }

      if (input.isPrimary) {
        await client.query(
          'UPDATE catms.emergency_contact SET is_primary = FALSE WHERE patient_id = $1',
          [patientId],
        );
      }

      const res = await client.query(
        `INSERT INTO catms.emergency_contact (
           patient_id, contact_name, relationship, phone_number, is_primary, created_at
         ) VALUES ($1, $2, $3, $4, $5, clock_timestamp())
         RETURNING contact_id, patient_id, contact_name, relationship, phone_number, is_primary, created_at`,
        [
          patientId,
          input.contactName.trim(),
          input.relationship.trim(),
          input.phoneNumber.trim(),
          input.isPrimary ?? false,
        ],
      );

      return this.mapEmergencyContactRow(res.rows[0]);
    }, dbRole);
  }

  async updateEmergencyContact(
    patientId: number,
    contactId: number,
    input: UpdateEmergencyContactInput,
    user: JwtPayload,
  ): Promise<EmergencyContactDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      const check = await client.query(
        'SELECT contact_id, is_primary FROM catms.emergency_contact WHERE patient_id = $1 AND contact_id = $2',
        [patientId, contactId],
      );
      if (check.rows.length === 0) {
        throw AppError.notFound('Emergency contact');
      }

      if (input.isPrimary === true) {
        await client.query(
          'UPDATE catms.emergency_contact SET is_primary = FALSE WHERE patient_id = $1 AND contact_id != $2',
          [patientId, contactId],
        );
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (input.contactName !== undefined) {
        values.push(input.contactName.trim());
        updates.push(`contact_name = $${values.length}`);
      }
      if (input.relationship !== undefined) {
        values.push(input.relationship.trim());
        updates.push(`relationship = $${values.length}`);
      }
      if (input.phoneNumber !== undefined) {
        values.push(input.phoneNumber.trim());
        updates.push(`phone_number = $${values.length}`);
      }
      if (input.isPrimary !== undefined) {
        values.push(input.isPrimary);
        updates.push(`is_primary = $${values.length}`);
      }

      if (updates.length > 0) {
        values.push(patientId, contactId);
        const sql = `UPDATE catms.emergency_contact
                     SET ${updates.join(', ')}
                     WHERE patient_id = $${values.length - 1} AND contact_id = $${values.length}
                     RETURNING contact_id, patient_id, contact_name, relationship, phone_number, is_primary, created_at`;
        const res = await client.query(sql, values);
        return this.mapEmergencyContactRow(res.rows[0]);
      }

      const res = await client.query(
        'SELECT contact_id, patient_id, contact_name, relationship, phone_number, is_primary, created_at FROM catms.emergency_contact WHERE contact_id = $1',
        [contactId],
      );
      return this.mapEmergencyContactRow(res.rows[0]);
    }, dbRole);
  }

  async deleteEmergencyContact(
    patientId: number,
    contactId: number,
    user: JwtPayload,
  ): Promise<{ success: boolean }> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      // Guard: patient must maintain at least one contact
      const countRes = await client.query(
        'SELECT COUNT(*)::int AS count FROM catms.emergency_contact WHERE patient_id = $1',
        [patientId],
      );
      if (Number(countRes.rows[0].count) <= 1) {
        throw AppError.conflict('Cannot delete the only emergency contact for this patient.');
      }

      const res = await client.query(
        'DELETE FROM catms.emergency_contact WHERE patient_id = $1 AND contact_id = $2 RETURNING contact_id',
        [patientId, contactId],
      );

      if (res.rows.length === 0) {
        throw AppError.notFound('Emergency contact');
      }

      return { success: true };
    }, dbRole);
  }

  // ── Patient Identity CRUD ──────────────────────────────────────────────────

  async listPatientIdentities(patientId: number): Promise<PatientIdentityDto[]> {
    const res = await pool.query(
      `SELECT identity_id, patient_id, identity_type, identity_number, is_primary, created_at
       FROM catms.patient_identity
       WHERE patient_id = $1
       ORDER BY is_primary DESC, identity_id ASC`,
      [patientId],
    );
    return res.rows.map((r) => this.mapIdentityRow(r));
  }

  async addPatientIdentity(
    patientId: number,
    input: CreatePatientIdentityInput,
    user: JwtPayload,
  ): Promise<PatientIdentityDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      const patientCheck = await client.query('SELECT patient_id FROM catms.patient WHERE patient_id = $1', [patientId]);
      if (patientCheck.rows.length === 0) {
        throw AppError.notFound('Patient');
      }

      if (input.isPrimary) {
        await client.query(
          'UPDATE catms.patient_identity SET is_primary = FALSE WHERE patient_id = $1',
          [patientId],
        );
      }

      const res = await client.query(
        `INSERT INTO catms.patient_identity (
           patient_id, identity_type, identity_number, is_primary, created_at
         ) VALUES ($1, $2, $3, $4, clock_timestamp())
         RETURNING identity_id, patient_id, identity_type, identity_number, is_primary, created_at`,
        [
          patientId,
          input.identityType,
          input.identityNumber.trim(),
          input.isPrimary ?? false,
        ],
      );

      return this.mapIdentityRow(res.rows[0]);
    }, dbRole);
  }

  // ── Insurance Providers ────────────────────────────────────────────────────

  async listInsuranceProviders(status?: InsuranceProviderStatus): Promise<InsuranceProviderDto[]> {
    let sql = `
      SELECT provider_id, provider_code, name, contact_name, contact_phone, contact_email, status, notes, created_at, updated_at
      FROM catms.insurance_provider
    `;
    const values: unknown[] = [];

    if (status) {
      sql += ' WHERE status = $1';
      values.push(status);
    }
    sql += ' ORDER BY name ASC';

    const res = await pool.query(sql, values);
    return res.rows.map((r) => this.mapProviderRow(r));
  }

  async getInsuranceProviderById(providerId: number): Promise<InsuranceProviderDto> {
    const res = await pool.query(
      `SELECT provider_id, provider_code, name, contact_name, contact_phone, contact_email, status, notes, created_at, updated_at
       FROM catms.insurance_provider
       WHERE provider_id = $1`,
      [providerId],
    );

    if (res.rows.length === 0) {
      throw AppError.notFound('Insurance provider');
    }

    return this.mapProviderRow(res.rows[0]);
  }

  async createInsuranceProvider(
    input: CreateInsuranceProviderInput,
    user: JwtPayload,
  ): Promise<InsuranceProviderDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.create_insurance_provider(
           $1, $2, $3, $4, $5, $6, $7, NULL
         )`,
        [
          input.providerCode.trim(),
          input.name.trim(),
          input.contactName?.trim() || null,
          input.contactPhone?.trim() || null,
          input.contactEmail?.trim() || null,
          input.status ?? 'ACTIVE',
          input.notes?.trim() || null,
        ],
      );

      const providerId = Number(res.rows[0]?.p_provider_id);
      const provRes = await client.query(
        `SELECT provider_id, provider_code, name, contact_name, contact_phone, contact_email, status, notes, created_at, updated_at
         FROM catms.insurance_provider
         WHERE provider_id = $1`,
        [providerId],
      );
      return this.mapProviderRow(provRes.rows[0]);
    }, dbRole);
  }

  // ── Insurance Policies ─────────────────────────────────────────────────────

  async listInsurancePolicies(filters: PolicyListFilters = {}): Promise<InsurancePolicyDto[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.patientId) {
      values.push(filters.patientId);
      conditions.push(`pol.patient_id = $${values.length}`);
    }
    if (filters.providerId) {
      values.push(filters.providerId);
      conditions.push(`pol.provider_id = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`pol.policy_status = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT
        pol.policy_id,
        pol.patient_id,
        pol.provider_id,
        prov.provider_code,
        prov.name AS provider_name,
        pol.policy_number,
        pol.policy_status,
        pol.valid_from,
        pol.valid_to,
        pol.notes,
        pol.created_at,
        pol.updated_at
      FROM catms.insurance_policy pol
      JOIN catms.insurance_provider prov ON pol.provider_id = prov.provider_id
      ${whereClause}
      ORDER BY pol.valid_from DESC, pol.policy_id DESC
    `;

    const res = await pool.query(sql, values);
    return res.rows.map((r) => this.mapPolicyRow(r));
  }

  async getInsurancePolicyById(
    policyId: number,
    clientOrPool: Pool | PoolClient = pool,
  ): Promise<InsurancePolicyDetailDto> {
    const polRes = await clientOrPool.query(
      `SELECT
         pol.policy_id,
         pol.patient_id,
         pol.provider_id,
         prov.provider_code,
         prov.name AS provider_name,
         pol.policy_number,
         pol.policy_status,
         pol.valid_from,
         pol.valid_to,
         pol.notes,
         pol.created_at,
         pol.updated_at
       FROM catms.insurance_policy pol
       JOIN catms.insurance_provider prov ON pol.provider_id = prov.provider_id
       WHERE pol.policy_id = $1`,
      [policyId],
    );

    if (polRes.rows.length === 0) {
      throw AppError.notFound('Insurance policy');
    }

    const covRes = await clientOrPool.query(
      `SELECT
         c.coverage_id,
         c.policy_id,
         c.treatment_id,
         tc.name AS treatment_name,
         tc.service_code,
         c.coverage_percentage,
         c.coverage_cap,
         c.effective_from,
         c.effective_to,
         c.created_at
       FROM catms.policy_coverage c
       LEFT JOIN catms.treatment_catalogue tc ON c.treatment_id = tc.treatment_id
       WHERE c.policy_id = $1
       ORDER BY c.effective_from DESC, c.coverage_id DESC`,
      [policyId],
    );

    const base = this.mapPolicyRow(polRes.rows[0]);
    const coverages = covRes.rows.map((r) => this.mapCoverageRow(r));

    return {
      ...base,
      coverages,
    };
  }

  async createInsurancePolicy(
    input: CreateInsurancePolicyInput,
    user: JwtPayload,
  ): Promise<InsurancePolicyDetailDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.create_insurance_policy(
           $1, $2, $3, $4, $5, $6, $7, NULL
         )`,
        [
          input.patientId,
          input.providerId,
          input.policyNumber.trim(),
          input.validFrom,
          input.validTo || null,
          input.policyStatus ?? 'ACTIVE',
          input.notes?.trim() || null,
        ],
      );

      const policyId = Number(res.rows[0]?.p_policy_id);
      return this.getInsurancePolicyById(policyId, client);
    }, dbRole);
  }

  async updatePolicyStatus(
    policyId: number,
    input: UpdatePolicyStatusInput,
    user: JwtPayload,
  ): Promise<InsurancePolicyDetailDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      await client.query(
        `CALL catms.update_policy_status($1, $2, $3)`,
        [policyId, input.policyStatus, input.notes?.trim() || null],
      );

      return this.getInsurancePolicyById(policyId, client);
    }, dbRole);
  }

  // ── Policy Coverage Terms ──────────────────────────────────────────────────

  async listPolicyCoverages(policyId: number): Promise<PolicyCoverageDto[]> {
    // Check policy exists
    const check = await pool.query('SELECT policy_id FROM catms.insurance_policy WHERE policy_id = $1', [policyId]);
    if (check.rows.length === 0) {
      throw AppError.notFound('Insurance policy');
    }

    const res = await pool.query(
      `SELECT
         c.coverage_id,
         c.policy_id,
         c.treatment_id,
         tc.name AS treatment_name,
         tc.service_code,
         c.coverage_percentage,
         c.coverage_cap,
         c.effective_from,
         c.effective_to,
         c.created_at
       FROM catms.policy_coverage c
       LEFT JOIN catms.treatment_catalogue tc ON c.treatment_id = tc.treatment_id
       WHERE c.policy_id = $1
       ORDER BY c.effective_from DESC, c.coverage_id DESC`,
      [policyId],
    );

    return res.rows.map((r) => this.mapCoverageRow(r));
  }

  async addPolicyCoverage(
    policyId: number,
    input: AddPolicyCoverageInput,
    user: JwtPayload,
  ): Promise<PolicyCoverageDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.add_policy_coverage($1, $2, $3, $4, $5, $6, NULL)`,
        [
          policyId,
          input.treatmentId,
          input.coveragePercentage,
          input.coverageCap !== undefined && input.coverageCap !== null ? input.coverageCap : null,
          input.effectiveFrom,
          input.effectiveTo || null,
        ],
      );

      const coverageId = Number(res.rows[0]?.p_coverage_id);
      const covRes = await client.query(
        `SELECT
           c.coverage_id,
           c.policy_id,
           c.treatment_id,
           tc.name AS treatment_name,
           tc.service_code,
           c.coverage_percentage,
           c.coverage_cap,
           c.effective_from,
           c.effective_to,
           c.created_at
         FROM catms.policy_coverage c
         LEFT JOIN catms.treatment_catalogue tc ON c.treatment_id = tc.treatment_id
         WHERE c.coverage_id = $1`,
        [coverageId],
      );
      return this.mapCoverageRow(covRes.rows[0]);
    }, dbRole);
  }

  /**
   * Updates policy coverage terms using immutable lifecycle procedure.
   * Closes prior active term at (effective_from - 1 day) and inserts new row.
   */
  async updatePolicyCoverage(
    policyId: number,
    input: UpdatePolicyCoverageInput,
    user: JwtPayload,
  ): Promise<PolicyCoverageDto> {
    const dbRole = resolveDbRole(user);

    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.update_policy_coverage($1, $2, $3, $4, $5, $6, NULL)`,
        [
          policyId,
          input.treatmentId,
          input.coveragePercentage,
          input.coverageCap !== undefined && input.coverageCap !== null ? input.coverageCap : null,
          input.effectiveFrom,
          input.effectiveTo || null,
        ],
      );

      const newCoverageId = Number(res.rows[0]?.p_new_coverage_id);
      const covRes = await client.query(
        `SELECT
           c.coverage_id,
           c.policy_id,
           c.treatment_id,
           tc.name AS treatment_name,
           tc.service_code,
           c.coverage_percentage,
           c.coverage_cap,
           c.effective_from,
           c.effective_to,
           c.created_at
         FROM catms.policy_coverage c
         LEFT JOIN catms.treatment_catalogue tc ON c.treatment_id = tc.treatment_id
         WHERE c.coverage_id = $1`,
        [newCoverageId],
      );
      return this.mapCoverageRow(covRes.rows[0]);
    }, dbRole);
  }

  /**
   * Service-date eligibility and terms lookup via catms.get_effective_coverage.
   */
  async getEffectiveCoverage(
    policyId: number,
    treatmentId: number,
    serviceDate: string,
  ): Promise<EffectiveCoverageDto> {
    const res = await pool.query(
      `SELECT * FROM catms.get_effective_coverage($1, $2, $3)`,
      [policyId, treatmentId, serviceDate],
    );

    if (res.rows.length === 0) {
      return {
        coverageId: null,
        policyId,
        treatmentId,
        coveragePercentage: 0,
        coverageCap: null,
        effectiveFrom: null,
        effectiveTo: null,
        isEligible: false,
        ineligibilityReason: 'Policy or treatment terms not found.',
      };
    }

    const r = res.rows[0];
    return {
      coverageId: r['coverage_id'] ? Number(r['coverage_id']) : null,
      policyId: Number(r['policy_id']),
      treatmentId: Number(r['treatment_id']),
      coveragePercentage: Number(r['coverage_percentage']),
      coverageCap: r['coverage_cap'] !== null && r['coverage_cap'] !== undefined ? Number(r['coverage_cap']) : null,
      effectiveFrom: r['effective_from'] ? formatDateOnly(r['effective_from']) : null,
      effectiveTo: r['effective_to'] ? formatDateOnly(r['effective_to']) : null,
      isEligible: Boolean(r['is_eligible']),
      ineligibilityReason: r['ineligibility_reason'] ? String(r['ineligibility_reason']) : null,
    };
  }
}

export const patientsInsuranceService = new PatientsInsuranceService();
