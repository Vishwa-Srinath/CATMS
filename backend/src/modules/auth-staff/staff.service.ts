/**
 * src/modules/auth-staff/staff.service.ts
 * Owner: Dev2 | Issue: CATMS-046
 *
 * Service operations for organizational and staff administration:
 *   - Branches (listing, creation, updates, manager assignment)
 *   - Staff / Employees (listing, registration, branch assignment, deactivation)
 *   - Doctors & Specialties (registration, catalogue listing)
 *   - User Accounts (listing, creation, role assignments)
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003):
 *   - All mutations execute inside withTransaction(..., 'catms_admin').
 *   - Mutations call PostgreSQL stored procedures; business rules remain in DB.
 *   - Parameterized SQL only — no ORM.
 */

import bcrypt from 'bcryptjs';
import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../shared/errors';
import type {
  BranchDto,
  CreateBranchInput,
  UpdateBranchInput,
  EmployeeDto,
  RegisterEmployeeInput,
  DoctorProfileDto,
  RegisterDoctorInput,
  SpecialtyDto,
  AdminUserDto,
  CreateAdminUserInput,
  UpdateUserRoleInput,
  AuditLogDto,
} from '../../contracts/staff.contract';

export class StaffService {
  // ── Branches ──────────────────────────────────────────────────────────────
  async listBranches(): Promise<BranchDto[]> {
    const res = await pool.query(
      `SELECT
         b.branch_id,
         b.branch_code,
         b.name,
         b.address_line_1,
         b.address_line_2,
         b.city,
         b.district,
         b.postal_code,
         b.contact_phone,
         b.time_zone,
         b.is_active,
         bma.employee_id AS manager_employee_id,
         me.full_name AS manager_name
       FROM catms.branch b
       LEFT JOIN catms.branch_manager_assignment bma
         ON bma.branch_id = b.branch_id
        AND (bma.valid_to IS NULL OR bma.valid_to > now())
       LEFT JOIN catms.employee me
         ON me.employee_id = bma.employee_id
       ORDER BY b.branch_id ASC`,
    );

    return res.rows.map((r) => ({
      branchId: Number(r.branch_id),
      branchCode: r.branch_code,
      name: r.name,
      addressLine1: r.address_line_1,
      addressLine2: r.address_line_2,
      city: r.city,
      district: r.district,
      postalCode: r.postal_code,
      contactPhone: r.contact_phone,
      timeZone: r.time_zone,
      isActive: r.is_active,
      manager: r.manager_employee_id
        ? {
            employeeId: Number(r.manager_employee_id),
            fullName: r.manager_name,
          }
        : null,
    }));
  }

  async getBranchById(branchId: number): Promise<BranchDto> {
    const res = await pool.query(
      `SELECT
         b.branch_id,
         b.branch_code,
         b.name,
         b.address_line_1,
         b.address_line_2,
         b.city,
         b.district,
         b.postal_code,
         b.contact_phone,
         b.time_zone,
         b.is_active,
         bma.employee_id AS manager_employee_id,
         me.full_name AS manager_name
       FROM catms.branch b
       LEFT JOIN catms.branch_manager_assignment bma
         ON bma.branch_id = b.branch_id
        AND (bma.valid_to IS NULL OR bma.valid_to > now())
       LEFT JOIN catms.employee me
         ON me.employee_id = bma.employee_id
       WHERE b.branch_id = $1`,
      [branchId],
    );

    const r = res.rows[0];
    if (!r) {
      throw AppError.notFound('Branch');
    }

    return {
      branchId: Number(r.branch_id),
      branchCode: r.branch_code,
      name: r.name,
      addressLine1: r.address_line_1,
      addressLine2: r.address_line_2,
      city: r.city,
      district: r.district,
      postalCode: r.postal_code,
      contactPhone: r.contact_phone,
      timeZone: r.time_zone,
      isActive: r.is_active,
      manager: r.manager_employee_id
        ? {
            employeeId: Number(r.manager_employee_id),
            fullName: r.manager_name,
          }
        : null,
    };
  }

  async createBranch(input: CreateBranchInput, actorUserId?: number): Promise<BranchDto> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO catms.branch (
           branch_code, name, address_line_1, address_line_2, city, district, postal_code, contact_phone, time_zone
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          input.branchCode.toUpperCase(),
          input.name,
          input.addressLine1,
          input.addressLine2 ?? null,
          input.city,
          input.district ?? null,
          input.postalCode ?? null,
          input.contactPhone,
          input.timeZone ?? 'Asia/Colombo',
        ],
      );

      const r = res.rows[0];

      await client.query(
        `INSERT INTO catms.audit_event (
           actor_user_id, entity_type, entity_id, action_code, payload
         ) VALUES ($1, 'BRANCH', $2, 'BRANCH_CREATED', $3)`,
        [
          actorUserId ?? null,
          String(r.branch_id),
          JSON.stringify({ branchCode: r.branch_code, name: r.name }),
        ],
      );

      return {
        branchId: Number(r.branch_id),
        branchCode: r.branch_code,
        name: r.name,
        addressLine1: r.address_line_1,
        addressLine2: r.address_line_2,
        city: r.city,
        district: r.district,
        postalCode: r.postal_code,
        contactPhone: r.contact_phone,
        timeZone: r.time_zone,
        isActive: r.is_active,
        manager: null,
      };
    }, 'catms_admin');
  }

  async updateBranch(branchId: number, input: UpdateBranchInput, actorUserId?: number): Promise<BranchDto> {
    return withTransaction(async (client) => {
      // 1. Verify existence
      const exists = await client.query('SELECT branch_id FROM catms.branch WHERE branch_id = $1', [branchId]);
      if (exists.rows.length === 0) {
        throw AppError.notFound('Branch');
      }

      // 2. Build parameterized UPDATE
      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (input.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(input.name);
      }
      if (input.addressLine1 !== undefined) {
        updates.push(`address_line_1 = $${idx++}`);
        values.push(input.addressLine1);
      }
      if (input.addressLine2 !== undefined) {
        updates.push(`address_line_2 = $${idx++}`);
        values.push(input.addressLine2);
      }
      if (input.city !== undefined) {
        updates.push(`city = $${idx++}`);
        values.push(input.city);
      }
      if (input.district !== undefined) {
        updates.push(`district = $${idx++}`);
        values.push(input.district);
      }
      if (input.postalCode !== undefined) {
        updates.push(`postal_code = $${idx++}`);
        values.push(input.postalCode);
      }
      if (input.contactPhone !== undefined) {
        updates.push(`contact_phone = $${idx++}`);
        values.push(input.contactPhone);
      }
      if (input.isActive !== undefined) {
        updates.push(`is_active = $${idx++}`);
        values.push(input.isActive);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = now()`);
        values.push(branchId);
        await client.query(
          `UPDATE catms.branch SET ${updates.join(', ')} WHERE branch_id = $${idx}`,
          values,
        );

        await client.query(
          `INSERT INTO catms.audit_event (
             actor_user_id, entity_type, entity_id, action_code, payload
           ) VALUES ($1, 'BRANCH', $2, 'BRANCH_UPDATED', $3)`,
          [actorUserId ?? null, String(branchId), JSON.stringify(input)],
        );
      }

      return this.getBranchById(branchId);
    }, 'catms_admin');
  }

  async assignBranchManager(
    branchId: number,
    employeeId: number,
    reason?: string,
    effectiveDate?: string,
    actorUserId?: number,
  ): Promise<{ assignmentId: number; branchId: number; employeeId: number }> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.assign_branch_manager($1, $2, $3, $4, $5, $6)`,
        [
          branchId,
          employeeId,
          reason ?? 'Branch manager appointment',
          effectiveDate ?? null,
          actorUserId ?? null,
          null, // INOUT p_assignment_id
        ],
      );

      const assignmentId = Number(res.rows[0]?.p_assignment_id);
      return { assignmentId, branchId, employeeId };
    }, 'catms_admin');
  }

  // ── Employees ─────────────────────────────────────────────────────────────
  async listEmployees(branchId?: number): Promise<EmployeeDto[]> {
    let queryText = `
      SELECT
        e.employee_id,
        e.employee_number,
        e.nic,
        e.full_name,
        e.gender_code,
        e.date_of_birth,
        e.position_code,
        e.employment_status,
        e.hire_date,
        e.phone,
        e.email,
        e.is_active,
        eba.branch_id,
        b.name AS branch_name,
        u.user_account_id,
        u.username,
        r.role_code,
        (dp.doctor_id IS NOT NULL) AS is_doctor
      FROM catms.employee e
      LEFT JOIN catms.employee_branch_assignment eba
        ON eba.employee_id = e.employee_id
       AND eba.is_primary = TRUE
       AND (eba.valid_to IS NULL OR eba.valid_to > now())
      LEFT JOIN catms.branch b ON b.branch_id = eba.branch_id
      LEFT JOIN catms.user_account u ON u.employee_id = e.employee_id
      LEFT JOIN catms.user_account_role uar
        ON uar.user_account_id = u.user_account_id
       AND (uar.valid_to IS NULL OR uar.valid_to > now())
      LEFT JOIN catms.app_role r ON r.app_role_id = uar.app_role_id
      LEFT JOIN catms.doctor_profile dp ON dp.doctor_id = e.employee_id
    `;

    const values: unknown[] = [];
    if (branchId !== undefined) {
      queryText += ` WHERE eba.branch_id = $1`;
      values.push(branchId);
    }
    queryText += ` ORDER BY e.employee_id ASC`;

    const res = await pool.query(queryText, values);

    return res.rows.map((r) => ({
      employeeId: Number(r.employee_id),
      employeeNumber: r.employee_number,
      nic: r.nic,
      fullName: r.full_name,
      genderCode: r.gender_code,
      dateOfBirth: typeof r.date_of_birth === 'object' ? r.date_of_birth.toISOString().split('T')[0] : String(r.date_of_birth),
      positionCode: r.position_code,
      employmentStatus: r.employment_status,
      hireDate: typeof r.hire_date === 'object' ? r.hire_date.toISOString().split('T')[0] : String(r.hire_date),
      phone: r.phone,
      email: r.email,
      isActive: r.is_active,
      branchId: r.branch_id ? Number(r.branch_id) : null,
      branchName: r.branch_name ?? null,
      userAccountId: r.user_account_id ? Number(r.user_account_id) : null,
      username: r.username ?? null,
      roleCode: r.role_code ?? null,
      isDoctor: Boolean(r.is_doctor),
    }));
  }

  async getEmployeeById(employeeId: number): Promise<EmployeeDto> {
    const list = await this.listEmployees();
    const found = list.find((e) => e.employeeId === employeeId);
    if (!found) {
      throw AppError.notFound('Employee');
    }
    return found;
  }

  async registerEmployee(
    input: RegisterEmployeeInput,
    actorUserId?: number,
  ): Promise<{ employeeId: number; userAccountId: number | null; assignmentId: number }> {
    return withTransaction(async (client) => {
      // Hash password if credentials were submitted
      const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : null;

      const res = await client.query(
        `CALL catms.register_employee(
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
         )`,
        [
          input.employeeNumber.trim(),
          input.nic.trim(),
          input.fullName.trim(),
          input.genderCode,
          input.dateOfBirth,
          input.positionCode.trim(),
          input.phone.trim(),
          input.branchId,
          input.email?.trim() ?? null,
          input.hireDate ?? null,
          input.assignmentType ?? 'PRIMARY',
          input.username?.trim() ?? null,
          passwordHash,
          input.roleCode?.trim() ?? null,
          actorUserId ?? null,
          null, // INOUT p_employee_id ($16)
          null, // INOUT p_user_account_id ($17)
          null, // INOUT p_assignment_id ($18)
        ],
      );

      const r = res.rows[0] ?? {};
      return {
        employeeId: Number(r.p_employee_id),
        userAccountId: r.p_user_account_id ? Number(r.p_user_account_id) : null,
        assignmentId: Number(r.p_assignment_id),
      };
    }, 'catms_admin');
  }

  async assignEmployeeBranch(
    employeeId: number,
    branchId: number,
    assignmentType = 'PRIMARY',
    effectiveDate?: string,
    actorUserId?: number,
  ): Promise<{ assignmentId: number; employeeId: number; branchId: number }> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.assign_employee_branch($1, $2, $3, $4, $5, $6)`,
        [
          employeeId,
          branchId,
          assignmentType,
          effectiveDate ?? null,
          actorUserId ?? null,
          null, // INOUT p_assignment_id
        ],
      );

      const assignmentId = Number(res.rows[0]?.p_assignment_id);
      return { assignmentId, employeeId, branchId };
    }, 'catms_admin');
  }

  async deactivateEmployee(
    employeeId: number,
    reason = 'Staff deactivation',
    effectiveDate?: string,
    actorUserId?: number,
  ): Promise<{ success: boolean; employeeId: number }> {
    return withTransaction(async (client) => {
      await client.query(
        `CALL catms.deactivate_employee($1, $2, $3, $4)`,
        [employeeId, reason, actorUserId ?? null, effectiveDate ?? null],
      );

      return { success: true, employeeId };
    }, 'catms_admin');
  }

  // ── Doctors & Specialties ──────────────────────────────────────────────────
  async registerDoctorProfile(
    input: RegisterDoctorInput,
    actorUserId?: number,
  ): Promise<{ doctorId: number }> {
    return withTransaction(async (client) => {
      const res = await client.query(
        `CALL catms.register_doctor_profile($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.employeeId,
          input.medicalLicenseNo.trim(),
          input.practiceStartDate ?? null,
          input.defaultConsultationFee ?? null,
          input.specialtyIds ?? [],
          input.primarySpecialtyId ?? null,
          actorUserId ?? null,
          null, // INOUT p_doctor_id ($8)
        ],
      );

      const doctorId = Number(res.rows[0]?.p_doctor_id);
      return { doctorId };
    }, 'catms_admin');
  }

  async listDoctors(): Promise<DoctorProfileDto[]> {
    const res = await pool.query(
      `SELECT
         dp.doctor_id,
         e.employee_number,
         e.full_name,
         dp.medical_license_no,
         dp.practice_start_date,
         dp.default_consultation_fee,
         dp.is_accepting_appointments,
         COALESCE(
           json_agg(
             json_build_object(
               'specialtyId', s.specialty_id,
               'name', s.name,
               'isPrimary', ds.is_primary
             )
           ) FILTER (WHERE s.specialty_id IS NOT NULL),
           '[]'
         ) AS specialties
       FROM catms.doctor_profile dp
       JOIN catms.employee e ON e.employee_id = dp.doctor_id
       LEFT JOIN catms.doctor_specialty ds ON ds.doctor_id = dp.doctor_id AND (ds.valid_to IS NULL OR ds.valid_to >= CURRENT_DATE)
       LEFT JOIN catms.specialty s ON s.specialty_id = ds.specialty_id
       WHERE e.is_active = TRUE
       GROUP BY dp.doctor_id, e.employee_number, e.full_name, dp.medical_license_no, dp.practice_start_date, dp.default_consultation_fee, dp.is_accepting_appointments
       ORDER BY e.full_name ASC`,
    );

    return res.rows.map((r) => ({
      doctorId: Number(r.doctor_id),
      employeeNumber: r.employee_number,
      fullName: r.full_name,
      medicalLicenseNo: r.medical_license_no,
      practiceStartDate: typeof r.practice_start_date === 'object' ? r.practice_start_date.toISOString().split('T')[0] : String(r.practice_start_date),
      defaultConsultationFee: r.default_consultation_fee ? Number(r.default_consultation_fee) : null,
      isAcceptingAppointments: r.is_accepting_appointments,
      specialties: r.specialties || [],
    }));
  }

  async listSpecialties(): Promise<SpecialtyDto[]> {
    const res = await pool.query(
      `SELECT specialty_id, specialty_code, name, description, is_active
       FROM catms.specialty
       WHERE is_active = TRUE
       ORDER BY name ASC`,
    );

    return res.rows.map((r) => ({
      specialtyId: Number(r.specialty_id),
      specialtyCode: r.specialty_code,
      name: r.name,
      description: r.description,
      isActive: r.is_active,
    }));
  }

  // ── Admin User Accounts ────────────────────────────────────────────────────
  async listAdminUsers(): Promise<AdminUserDto[]> {
    const res = await pool.query(
      `SELECT
         u.user_account_id,
         u.employee_id,
         e.employee_number,
         e.full_name,
         u.username,
         u.account_status,
         u.failed_login_count,
         u.last_login_at,
         COALESCE(
           json_agg(
             json_build_object(
               'roleCode', r.role_code,
               'branchScopeId', uar.branch_scope_id,
               'branchCode', b.branch_code
             )
           ) FILTER (WHERE r.role_code IS NOT NULL),
           '[]'
         ) AS roles
       FROM catms.user_account u
       JOIN catms.employee e ON e.employee_id = u.employee_id
       LEFT JOIN catms.user_account_role uar ON uar.user_account_id = u.user_account_id AND (uar.valid_to IS NULL OR uar.valid_to > now())
       LEFT JOIN catms.app_role r ON r.app_role_id = uar.app_role_id
       LEFT JOIN catms.branch b ON b.branch_id = uar.branch_scope_id
       GROUP BY u.user_account_id, u.employee_id, e.employee_number, e.full_name, u.username, u.account_status, u.failed_login_count, u.last_login_at
       ORDER BY u.user_account_id ASC`,
    );

    return res.rows.map((r) => ({
      userAccountId: Number(r.user_account_id),
      employeeId: Number(r.employee_id),
      employeeNumber: r.employee_number,
      fullName: r.full_name,
      username: r.username,
      accountStatus: r.account_status,
      failedLoginCount: Number(r.failed_login_count),
      lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
      roles: r.roles || [],
    }));
  }

  async createAdminUser(input: CreateAdminUserInput, actorUserId?: number): Promise<AdminUserDto> {
    return withTransaction(async (client) => {
      // 1. Verify employee exists and is active
      const empRes = await client.query(
        `SELECT employee_id, employee_number, full_name, is_active FROM catms.employee WHERE employee_id = $1`,
        [input.employeeId],
      );
      if (empRes.rows.length === 0) {
        throw AppError.notFound('Employee');
      }
      if (!empRes.rows[0].is_active) {
        throw AppError.forbidden('Cannot create user account for inactive employee.');
      }
      const emp = empRes.rows[0];

      // 2. Hash password
      const passwordHash = await bcrypt.hash(input.password, 10);

      // 3. Insert user account
      const userRes = await client.query(
        `INSERT INTO catms.user_account (
           employee_id, username, password_hash, account_status
         ) VALUES ($1, $2, $3, 'Active')
         RETURNING user_account_id`,
        [input.employeeId, input.username.trim(), passwordHash],
      );

      const userAccountId = Number(userRes.rows[0].user_account_id);

      // 4. Find app role
      const roleRes = await client.query(
        `SELECT app_role_id FROM catms.app_role WHERE UPPER(role_code) = UPPER($1)`,
        [input.roleCode.trim()],
      );
      if (roleRes.rows.length === 0) {
        throw AppError.validationError(`Unknown application role: ${input.roleCode}`);
      }

      const appRoleId = roleRes.rows[0].app_role_id;

      // 5. Insert role assignment
      await client.query(
        `INSERT INTO catms.user_account_role (
           user_account_id, app_role_id, branch_scope_id, assigned_by_user_id
         ) VALUES ($1, $2, $3, $4)`,
        [userAccountId, appRoleId, input.branchScopeId ?? null, actorUserId ?? null],
      );

      // 6. Audit event
      await client.query(
        `INSERT INTO catms.audit_event (
           actor_user_id, entity_type, entity_id, action_code, payload
         ) VALUES ($1, 'USER_ACCOUNT', $2, 'USER_ACCOUNT_CREATED', $3)`,
        [actorUserId ?? null, String(userAccountId), JSON.stringify({ username: input.username, role: input.roleCode })],
      );

      let branchCode: string | null = null;
      if (input.branchScopeId) {
        const branchRes = await client.query(
          `SELECT branch_code FROM catms.branch WHERE branch_id = $1`,
          [input.branchScopeId],
        );
        branchCode = branchRes.rows[0]?.branch_code ?? null;
      }

      return {
        userAccountId,
        employeeId: input.employeeId,
        employeeNumber: emp.employee_number ?? '',
        fullName: emp.full_name ?? '',
        username: input.username.trim(),
        accountStatus: 'Active',
        failedLoginCount: 0,
        lastLoginAt: null,
        roles: [
          {
            roleCode: input.roleCode.trim(),
            branchScopeId: input.branchScopeId ?? null,
            branchCode,
          },
        ],
      };
    }, 'catms_admin');
  }

  async unlockUserAccount(userAccountId: number, actorUserId?: number): Promise<AdminUserDto> {
    return withTransaction(async (client) => {
      const userRes = await client.query(
        `SELECT user_account_id, username, account_status FROM catms.user_account WHERE user_account_id = $1`,
        [userAccountId],
      );
      if (userRes.rows.length === 0) {
        throw AppError.notFound('User account');
      }

      await client.query(
        `UPDATE catms.user_account
         SET failed_login_count = 0, account_status = 'Active', updated_at = now()
         WHERE user_account_id = $1`,
        [userAccountId],
      );

      await client.query(
        `INSERT INTO catms.audit_event (
           actor_user_id, entity_type, entity_id, action_code, payload
         ) VALUES ($1, 'USER_ACCOUNT', $2, 'ACCOUNT_UNLOCKED', $3)`,
        [actorUserId ?? null, String(userAccountId), JSON.stringify({ userAccountId, username: userRes.rows[0].username })],
      );

      const allUsers = await this.listAdminUsers();
      const updated = allUsers.find((u) => u.userAccountId === userAccountId);
      if (!updated) {
        throw AppError.notFound('User account');
      }
      return updated;
    }, 'catms_admin');
  }

  async updateUserRole(
    userAccountId: number,
    input: UpdateUserRoleInput,
    actorUserId?: number,
  ): Promise<AdminUserDto> {
    return withTransaction(async (client) => {
      const userRes = await client.query(
        `SELECT user_account_id, username FROM catms.user_account WHERE user_account_id = $1`,
        [userAccountId],
      );
      if (userRes.rows.length === 0) {
        throw AppError.notFound('User account');
      }

      const roleRes = await client.query(
        `SELECT app_role_id FROM catms.app_role WHERE UPPER(role_code) = UPPER($1)`,
        [input.roleCode.trim()],
      );
      if (roleRes.rows.length === 0) {
        throw AppError.validationError(`Unknown application role: ${input.roleCode}`);
      }
      const appRoleId = roleRes.rows[0].app_role_id;

      // Close current active roles
      await client.query(
        `UPDATE catms.user_account_role
         SET valid_to = now()
         WHERE user_account_id = $1 AND (valid_to IS NULL OR valid_to > now())`,
        [userAccountId],
      );

      // Insert new active role
      await client.query(
        `INSERT INTO catms.user_account_role (
           user_account_id, app_role_id, branch_scope_id, assigned_by_user_id
         ) VALUES ($1, $2, $3, $4)`,
        [userAccountId, appRoleId, input.branchScopeId ?? null, actorUserId ?? null],
      );

      // Audit event
      await client.query(
        `INSERT INTO catms.audit_event (
           actor_user_id, entity_type, entity_id, action_code, payload
         ) VALUES ($1, 'USER_ACCOUNT', $2, 'ROLE_CHANGED', $3)`,
        [actorUserId ?? null, String(userAccountId), JSON.stringify({ role: input.roleCode, branchScopeId: input.branchScopeId })],
      );

      const allUsers = await this.listAdminUsers();
      const updated = allUsers.find((u) => u.userAccountId === userAccountId);
      if (!updated) {
        throw AppError.notFound('User account');
      }
      return updated;
    }, 'catms_admin');
  }

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  async listAuditLogs(limit = 100): Promise<AuditLogDto[]> {
    const res = await pool.query(
      `SELECT
         a.audit_event_id,
         a.actor_user_id,
         COALESCE(u.username, 'System') AS actor_username,
         COALESCE(e.full_name, 'System') AS actor_name,
         a.entity_type,
         a.entity_id,
         a.action_code,
         a.occurred_at,
         a.payload,
         a.client_ip::text AS client_ip
       FROM catms.audit_event a
       LEFT JOIN catms.user_account u ON u.user_account_id = a.actor_user_id
       LEFT JOIN catms.employee e ON e.employee_id = u.employee_id
       ORDER BY a.audit_event_id DESC
       LIMIT $1`,
      [limit],
    );

    return res.rows.map((r) => ({
      auditEventId: Number(r.audit_event_id),
      actorUserId: r.actor_user_id ? Number(r.actor_user_id) : null,
      actorUsername: r.actor_username,
      actorName: r.actor_name,
      entityType: r.entity_type,
      entityId: r.entity_id,
      actionCode: r.action_code,
      occurredAt: r.occurred_at ? new Date(r.occurred_at).toISOString() : new Date().toISOString(),
      payload: r.payload,
      clientIp: r.client_ip ?? null,
    }));
  }
}

export const staffService = new StaffService();
