/**
 * src/modules/auth-staff/staff.routes.ts
 * Owner: Dev2 | Issue: CATMS-046
 *
 * Express routers for Branch, Staff, Doctor, and Access Administration:
 *   - /api/v1/branches (GET, POST, PUT, POST /:id/manager)
 *   - /api/v1/employees (GET, POST, DELETE /:id, POST /:id/assignments)
 *   - /api/v1/doctors (GET, POST)
 *   - /api/v1/specialties (GET)
 *   - /api/v1/admin/users (GET, POST)
 *
 * Rules (CODEBASE_GUIDE.md §1 & §6, CATMS-003):
 *   - requireRole('Admin') guards all state-changing mutations.
 *   - requireRole('Admin', 'Manager') guards employee directory listing.
 *   - Zod validation rejects client-supplied IDs, maintained timestamps, and unknown fields.
 *   - Controlled procedures invoked via service layer.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireRole } from '../../app/middleware/auth';
import { staffService } from './staff.service';
import {
  createBranchSchema,
  updateBranchSchema,
  assignBranchManagerSchema,
  registerEmployeeSchema,
  assignEmployeeBranchSchema,
  deactivateEmployeeSchema,
  registerDoctorSchema,
  createAdminUserSchema,
} from './staff.schema';
import { AppError, successEnvelope } from '../../shared/errors';

// =============================================================================
// 1. Branch Router (/api/v1/branches)
// =============================================================================
export const branchRouter = Router();

// GET /api/v1/branches — View branch directory (all authenticated users)
branchRouter.get(
  '/',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const branches = await staffService.listBranches();
      res.status(200).json(successEnvelope(branches, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

function parseId(param: unknown, paramName = 'ID'): number {
  const value = Array.isArray(param) ? param[0] : param;
  const num = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN;
  if (value === undefined || value === null || value === '' || Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
    throw AppError.validationError(`Invalid ${paramName} provided.`);
  }
  return num;
}

// GET /api/v1/branches/:id — View branch details
branchRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const branchId = parseId(req.params.id, 'branch ID');
      const branch = await staffService.getBranchById(branchId);
      res.status(200).json(successEnvelope(branch, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/branches — Create branch (Admin only)
branchRouter.post(
  '/',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const validated = createBranchSchema.parse(req.body);
      const branch = await staffService.createBranch(validated, req.user?.userId);
      res.status(201).json(successEnvelope(branch, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/branches/:id — Update branch (Admin only)
branchRouter.put(
  '/:id',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const branchId = parseId(req.params.id, 'branch ID');
      const validated = updateBranchSchema.parse(req.body);
      const branch = await staffService.updateBranch(branchId, validated, req.user?.userId);
      res.status(200).json(successEnvelope(branch, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/branches/:id/manager — Assign branch manager (Admin only)
branchRouter.post(
  '/:id/manager',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const branchId = parseId(req.params.id, 'branch ID');
      const validated = assignBranchManagerSchema.parse(req.body);
      const result = await staffService.assignBranchManager(
        branchId,
        validated.employeeId,
        validated.reason,
        validated.effectiveDate,
        req.user?.userId,
      );
      res.status(200).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// 2. Employee Router (/api/v1/employees)
// =============================================================================
export const employeeRouter = Router();

// GET /api/v1/employees — List staff members (Admin & Manager)
employeeRouter.get(
  '/',
  requireAuth,
  requireRole('Admin', 'Manager'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const user = req.user!;

      let branchFilter: number | undefined;
      if (user.role.toLowerCase() === 'manager') {
        // Manager is strictly scoped to their assigned branch
        branchFilter = user.branchId === 'all' ? undefined : Number(user.branchId);
      } else if (req.query.branchId) {
        branchFilter = parseId(req.query.branchId as string, 'branchId query parameter');
      }

      const employees = await staffService.listEmployees(branchFilter);
      res.status(200).json(successEnvelope(employees, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/employees/:id — View single employee
employeeRouter.get(
  '/:id',
  requireAuth,
  requireRole('Admin', 'Manager'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const employeeId = parseId(req.params.id, 'employee ID');
      const employee = await staffService.getEmployeeById(employeeId);
      res.status(200).json(successEnvelope(employee, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/employees — Register employee (Admin only)
employeeRouter.post(
  '/',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const validated = registerEmployeeSchema.parse(req.body);
      const result = await staffService.registerEmployee(validated, req.user?.userId);
      res.status(201).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/employees/:id/assignments — Reassign employee branch (Admin only)
employeeRouter.post(
  '/:id/assignments',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const employeeId = parseId(req.params.id, 'employee ID');
      const validated = assignEmployeeBranchSchema.parse(req.body);
      const result = await staffService.assignEmployeeBranch(
        employeeId,
        validated.branchId,
        validated.assignmentType,
        validated.effectiveDate,
        req.user?.userId,
      );
      res.status(200).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/employees/:id — Deactivate employee (Admin only)
employeeRouter.delete(
  '/:id',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const employeeId = parseId(req.params.id, 'employee ID');
      const validated = deactivateEmployeeSchema.parse(req.body ?? {});
      const result = await staffService.deactivateEmployee(
        employeeId,
        validated.reason,
        validated.effectiveDate,
        req.user?.userId,
      );
      res.status(200).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// 3. Doctor Profile Router (/api/v1/doctors)
// =============================================================================
export const doctorRouter = Router();

// GET /api/v1/doctors — View doctors directory (all authenticated users)
doctorRouter.get(
  '/',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const doctors = await staffService.listDoctors();
      res.status(200).json(successEnvelope(doctors, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/doctors — Register doctor profile (Admin only)
doctorRouter.post(
  '/',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const validated = registerDoctorSchema.parse(req.body);
      const result = await staffService.registerDoctorProfile(validated, req.user?.userId);
      res.status(201).json(successEnvelope(result, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// 4. Specialty Router (/api/v1/specialties)
// =============================================================================
export const specialtyRouter = Router();

// GET /api/v1/specialties — View medical specialties catalogue
specialtyRouter.get(
  '/',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const specialties = await staffService.listSpecialties();
      res.status(200).json(successEnvelope(specialties, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// =============================================================================
// 5. Admin User Account Router (/api/v1/admin/users)
// =============================================================================
export const adminUserRouter = Router();

// GET /api/v1/admin/users — List user accounts & role mappings (Admin only)
adminUserRouter.get(
  '/',
  requireAuth,
  requireRole('Admin'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const users = await staffService.listAdminUsers();
      res.status(200).json(successEnvelope(users, correlationId));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/admin/users — Create user account with role (Admin only)
adminUserRouter.post(
  '/',
  requireAuth,
  requireRole('Admin'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
      const validated = createAdminUserSchema.parse(req.body);
      const user = await staffService.createAdminUser(validated, req.user?.userId);
      res.status(201).json(successEnvelope(user, correlationId));
    } catch (err) {
      next(err);
    }
  },
);
