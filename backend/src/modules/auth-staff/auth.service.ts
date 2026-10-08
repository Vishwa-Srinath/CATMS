/**
 * src/modules/auth-staff/auth.service.ts
 * Owner: Dev2 | Issue: CATMS-045
 *
 * Authentication, credential verification, failed attempt tracking,
 * account lockout, session retrieval, and audit trail operations.
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003):
 *   - Passwords must be verified using bcrypt.compare.
 *   - Plaintext passwords and hashes must never be logged or exposed.
 *   - 5 consecutive failed login attempts automatically locks the account.
 *   - Successful login resets failed attempt count.
 *   - All security mutations (lock, failed count, login, logout) are transactional and audited.
 */

import bcrypt from 'bcryptjs';
import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { AppError, ErrorCode } from '../../shared/errors';
import type { SessionUserDto } from '../../contracts/auth.contract';

const MAX_FAILED_ATTEMPTS = 5;
const DUMMY_BCRYPT_HASH = '$2a$10$abcdefghijklmnopqrstuvwxyz123456789012345678901234567890';

function sanitizeIp(ip?: string | null): string | null {
  if (!ip) return null;
  const cleanIp = ip.replace(/^::ffff:/, '').trim();
  const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(cleanIp);
  const isIpv6 = cleanIp.includes(':');
  return isIpv4 || isIpv6 ? cleanIp : null;
}

function sanitizeUuid(id?: string | null): string | null {
  if (!id) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return isUuid ? id : null;
}

export class AuthService {
  /**
   * Validates username and password, updates failed attempts / lockouts,
   * resets failed counter on success, logs audit records, and returns SessionUserDto.
   */
  async authenticate(
    username: string,
    password: string,
    correlationId?: string,
    clientIp?: string,
  ): Promise<SessionUserDto> {
    const cleanIp = sanitizeIp(clientIp);
    const cleanCorrelationId = sanitizeUuid(correlationId);

    // 1. Fetch user account and associated employee details
    const userRes = await pool.query(
      `SELECT
         u.user_account_id,
         u.employee_id,
         u.username,
         u.password_hash,
         u.account_status,
         u.failed_login_count,
         e.full_name,
         e.position_code,
         e.is_active AS employee_active
       FROM catms.user_account u
       JOIN catms.employee e ON e.employee_id = u.employee_id
       WHERE u.username = $1`,
      [username.trim()],
    );

    const user = userRes.rows[0];

    // If user not found, perform dummy bcrypt compare to prevent timing enumeration
    if (!user) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      throw AppError.unauthenticated('Invalid username or password.');
    }

    const accountStatus = String(user.account_status || '').toUpperCase();

    // 2. Check if account or employee is disabled
    if (accountStatus === 'DISABLED' || user.employee_active === false) {
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO catms.audit_event (
             actor_user_id, entity_type, entity_id, action_code, correlation_id, payload, client_ip
           ) VALUES ($1, 'USER_ACCOUNT', $2, $3, $4, $5, $6)`,
          [
            user.user_account_id,
            String(user.user_account_id),
            'LOGIN_REJECTED_DISABLED',
            cleanCorrelationId,
            JSON.stringify({ username: user.username, reason: 'Account disabled' }),
            cleanIp,
          ],
        );
      });
      throw new AppError(
        ErrorCode.ACCOUNT_DISABLED,
        'Account is disabled. Please contact an administrator.',
        403,
      );
    }

    // 3. Check if account is locked
    if (accountStatus === 'LOCKED') {
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO catms.audit_event (
             actor_user_id, entity_type, entity_id, action_code, correlation_id, payload, client_ip
           ) VALUES ($1, 'USER_ACCOUNT', $2, $3, $4, $5, $6)`,
          [
            user.user_account_id,
            String(user.user_account_id),
            'LOGIN_REJECTED_LOCKED',
            cleanCorrelationId,
            JSON.stringify({ username: user.username, reason: 'Account locked' }),
            cleanIp,
          ],
        );
      });
      throw new AppError(
        ErrorCode.ACCOUNT_DISABLED,
        'Account is locked due to repeated failed login attempts. Please contact an administrator.',
        403,
      );
    }

    // 4. Verify password hash using bcrypt
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      const currentFailures = Number(user.failed_login_count || 0) + 1;
      const isNowLocked = currentFailures >= MAX_FAILED_ATTEMPTS;

      await withTransaction(async (client) => {
        if (isNowLocked) {
          await client.query(
            `UPDATE catms.user_account
             SET failed_login_count = $1, account_status = 'Locked', updated_at = now()
             WHERE user_account_id = $2`,
            [currentFailures, user.user_account_id],
          );
          await client.query(
            `INSERT INTO catms.audit_event (
               actor_user_id, entity_type, entity_id, action_code, correlation_id, payload, client_ip
             ) VALUES ($1, 'USER_ACCOUNT', $2, $3, $4, $5, $6)`,
            [
              user.user_account_id,
              String(user.user_account_id),
              'ACCOUNT_LOCKED',
              cleanCorrelationId,
              JSON.stringify({
                reason: 'Max failed login attempts exceeded',
                failedAttempts: currentFailures,
              }),
              cleanIp,
            ],
          );
        } else {
          await client.query(
            `UPDATE catms.user_account
             SET failed_login_count = $1, updated_at = now()
             WHERE user_account_id = $2`,
            [currentFailures, user.user_account_id],
          );
          await client.query(
            `INSERT INTO catms.audit_event (
               actor_user_id, entity_type, entity_id, action_code, correlation_id, payload, client_ip
             ) VALUES ($1, 'USER_ACCOUNT', $2, $3, $4, $5, $6)`,
            [
              user.user_account_id,
              String(user.user_account_id),
              'LOGIN_FAILED',
              cleanCorrelationId,
              JSON.stringify({ failedAttempts: currentFailures }),
              cleanIp,
            ],
          );
        }
      });

      if (isNowLocked) {
        throw new AppError(
          ErrorCode.ACCOUNT_DISABLED,
          'Account is locked due to repeated failed login attempts. Please contact an administrator.',
          403,
        );
      }

      throw AppError.unauthenticated('Invalid username or password.');
    }

    // 5. Successful authentication — reset failures and record audit
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE catms.user_account
         SET failed_login_count = 0, last_login_at = now(), updated_at = now()
         WHERE user_account_id = $1`,
        [user.user_account_id],
      );
      await client.query(
        `INSERT INTO catms.audit_event (
           actor_user_id, entity_type, entity_id, action_code, correlation_id, payload, client_ip
         ) VALUES ($1, 'USER_ACCOUNT', $2, $3, $4, $5, $6)`,
        [
          user.user_account_id,
          String(user.user_account_id),
          'LOGIN_SUCCESS',
          cleanCorrelationId,
          JSON.stringify({ username: user.username }),
          cleanIp,
        ],
      );
    });

    // 6. Build and return session payload
    return this.buildSessionUser(user.user_account_id, user.employee_id, user.username, user.full_name, user.position_code);
  }

  /**
   * Builds the current user session details with role and branch scope.
   */
  async buildSessionUser(
    userAccountId: number,
    employeeId: number,
    username: string,
    fullName: string,
    positionCode: string,
  ): Promise<SessionUserDto> {
    // Query active application role
    const roleRes = await pool.query(
      `SELECT
         r.role_code,
         r.display_name AS role_display_name,
         uar.branch_scope_id,
         b.branch_code,
         b.name AS branch_name
       FROM catms.user_account_role uar
       JOIN catms.app_role r ON r.app_role_id = uar.app_role_id
       LEFT JOIN catms.branch b ON b.branch_id = uar.branch_scope_id
       WHERE uar.user_account_id = $1
         AND (uar.valid_to IS NULL OR uar.valid_to > now())
         AND r.is_active = TRUE
       ORDER BY uar.user_account_role_id ASC
       LIMIT 1`,
      [userAccountId],
    );

    const activeRole = roleRes.rows[0];
    const roleCode = activeRole ? activeRole.role_code : 'Reception';
    const roleDisplayName = activeRole ? activeRole.role_display_name : 'Receptionist';

    // Query active primary branch assignment
    const branchRes = await pool.query(
      `SELECT eba.branch_id, b.branch_code, b.name AS branch_name
       FROM catms.employee_branch_assignment eba
       JOIN catms.branch b ON b.branch_id = eba.branch_id
       WHERE eba.employee_id = $1
         AND eba.is_primary = TRUE
         AND (eba.valid_to IS NULL OR eba.valid_to > now())
       LIMIT 1`,
      [employeeId],
    );

    const primaryBranch = branchRes.rows[0];

    // Determine branchId for the session
    const normalizedRole = roleCode.toLowerCase();
    let branchId: number | 'all' = 'all';
    let branchCode: string | null = null;
    let branchName: string | null = null;

    if (normalizedRole === 'admin' || normalizedRole === 'qa') {
      branchId = 'all';
      if (primaryBranch) {
        branchCode = primaryBranch.branch_code;
        branchName = primaryBranch.branch_name;
      }
    } else if (activeRole && activeRole.branch_scope_id != null) {
      branchId = Number(activeRole.branch_scope_id);
      branchCode = activeRole.branch_code ?? null;
      branchName = activeRole.branch_name ?? null;
    } else if (primaryBranch) {
      branchId = Number(primaryBranch.branch_id);
      branchCode = primaryBranch.branch_code;
      branchName = primaryBranch.branch_name;
    }

    return {
      userId: Number(userAccountId),
      employeeId: Number(employeeId),
      username,
      fullName,
      role: roleCode,
      roleDisplayName,
      positionCode,
      branchId,
      branchCode,
      branchName,
    };
  }

  /**
   * Retrieves current session user by ID and verifies active account status.
   */
  async getMe(userAccountId: number): Promise<SessionUserDto> {
    const userRes = await pool.query(
      `SELECT
         u.user_account_id,
         u.employee_id,
         u.username,
         u.account_status,
         e.full_name,
         e.position_code,
         e.is_active AS employee_active
       FROM catms.user_account u
       JOIN catms.employee e ON e.employee_id = u.employee_id
       WHERE u.user_account_id = $1`,
      [userAccountId],
    );

    const user = userRes.rows[0];
    if (!user) {
      throw AppError.unauthenticated('User account not found.');
    }

    const accountStatus = String(user.account_status || '').toUpperCase();
    if (accountStatus === 'DISABLED' || accountStatus === 'LOCKED' || user.employee_active === false) {
      throw new AppError(
        ErrorCode.ACCOUNT_DISABLED,
        'Account is disabled or locked. Please contact an administrator.',
        403,
      );
    }

    return this.buildSessionUser(
      user.user_account_id,
      user.employee_id,
      user.username,
      user.full_name,
      user.position_code,
    );
  }

  /**
   * Logs a user logout audit event.
   */
  async logout(
    userAccountId: number,
    correlationId?: string,
    clientIp?: string,
  ): Promise<void> {
    const cleanIp = sanitizeIp(clientIp);
    const cleanCorrelationId = sanitizeUuid(correlationId);

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO catms.audit_event (
           actor_user_id, entity_type, entity_id, action_code, correlation_id, payload, client_ip
         ) VALUES ($1, 'USER_ACCOUNT', $2, $3, $4, $5, $6)`,
        [
          userAccountId,
          String(userAccountId),
          'LOGOUT',
          cleanCorrelationId,
          JSON.stringify({ userAccountId }),
          cleanIp,
        ],
      );
    });
  }
}

export const authService = new AuthService();
