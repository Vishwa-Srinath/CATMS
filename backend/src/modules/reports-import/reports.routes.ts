/**
 * src/modules/reports-import/reports.routes.ts
 * Owner: Dev5 | Issue: CATMS-055
 *
 * Express router for Reports & Import Status API.
 *
 * RBAC Rules (CATMS-003, CATMS-007, CATMS-055):
 *   - requireAuth protects all reporting endpoints.
 *   - Operational Reports (R1: daily appointments, R4: treatments by category):
 *       Accessible by Admin, QA, AdminFinance, and Branch Manager (Manager).
 *       Branch Manager is strictly scoped to their assigned clinic branch.
 *   - Financial Reports (R2: doctor revenue, R3: patient balances, R5: insurance receipts):
 *       Accessible strictly by Admin, QA, and AdminFinance.
 *       Branch Manager, Reception, and Clinician are strictly forbidden (403).
 *   - Import Status:
 *       Accessible strictly by Admin, QA, and AdminFinance.
 *   - Reception and Clinician roles are prohibited from all report endpoints.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireRole } from '../../app/middleware/auth';
import { AppError, successEnvelope } from '../../shared/errors';
import { reportFilterSchema } from './reports.schema';
import { ReportsService } from './reports.service';

export const reportsRouter = Router();

// ── Base Auth Guard ──────────────────────────────────────────────────────────
reportsRouter.use(requireAuth);

/**
 * Helper to enforce that Branch Managers only access data for their assigned branch.
 */
function enforceReportBranchScope(req: Request, filters: { branchId?: number | undefined }) {
  const role = (req.user?.role || '').toLowerCase().trim();
  const isManager = role.includes('manager') && !role.includes('admin');
  if (isManager) {
    const userBranchId = Number(req.user?.branchId);
    if (filters.branchId !== undefined && filters.branchId !== userBranchId) {
      throw AppError.forbidden('Forbidden: You can only access data for your assigned clinic branch.');
    }
    filters.branchId = userBranchId;
  }
}

// ── R1: Daily Appointment Summary ───────────────────────────────────────────
// Accessible by Branch Manager (assigned branch only), Admin, QA, AdminFinance.
const r1Handler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = reportFilterSchema.parse(req.query);
    enforceReportBranchScope(req, filters);
    const data = await ReportsService.getBranchWiseSummary(filters);
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(200).json(successEnvelope(data, correlationId));
  } catch (error) {
    next(error);
  }
};

reportsRouter.get(
  '/daily-appointments',
  requireRole('Admin', 'Manager', 'Branch Manager', 'BranchManager', 'QA', 'AdminFinance', 'Admin/Finance'),
  r1Handler,
);
reportsRouter.get(
  '/r1-branch-summary',
  requireRole('Admin', 'Manager', 'Branch Manager', 'BranchManager', 'QA', 'AdminFinance', 'Admin/Finance'),
  r1Handler,
);

// ── R2: Doctor Gross Revenue & Actual Collections ───────────────────────────
// Accessible strictly by Admin, QA, AdminFinance (Manager forbidden).
const r2Handler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = reportFilterSchema.parse(req.query);
    const data = await ReportsService.getDoctorRevenue(filters);
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(200).json(successEnvelope(data, correlationId));
  } catch (error) {
    next(error);
  }
};

reportsRouter.get(
  '/doctor-revenue',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  r2Handler,
);
reportsRouter.get(
  '/r2-doctor-revenue',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  r2Handler,
);

// ── R3: Patient Outstanding Balances ────────────────────────────────────────
// Accessible strictly by Admin, QA, AdminFinance (Manager forbidden).
const r3Handler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = reportFilterSchema.parse(req.query);
    const data = await ReportsService.getPatientBalances(filters);
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(200).json(successEnvelope(data, correlationId));
  } catch (error) {
    next(error);
  }
};

reportsRouter.get(
  '/patient-outstanding',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  r3Handler,
);
reportsRouter.get(
  '/r3-patient-balances',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  r3Handler,
);

// ── R4: Treatments Delivered by Category ────────────────────────────────────
// Accessible by Branch Manager (assigned branch only), Admin, QA, AdminFinance.
const r4Handler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = reportFilterSchema.parse(req.query);
    enforceReportBranchScope(req, filters);
    const data = await ReportsService.getTreatmentCounts(filters);
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(200).json(successEnvelope(data, correlationId));
  } catch (error) {
    next(error);
  }
};

reportsRouter.get(
  '/treatments-by-category',
  requireRole('Admin', 'Manager', 'Branch Manager', 'BranchManager', 'QA', 'AdminFinance', 'Admin/Finance'),
  r4Handler,
);
reportsRouter.get(
  '/r4-treatment-counts',
  requireRole('Admin', 'Manager', 'Branch Manager', 'BranchManager', 'QA', 'AdminFinance', 'Admin/Finance'),
  r4Handler,
);

// ── R5: Approved Insurance, Insurer Receipts & Patient Receipts ─────────────
// Accessible strictly by Admin, QA, AdminFinance (Manager forbidden).
const r5Handler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = reportFilterSchema.parse(req.query);
    const data = await ReportsService.getInsuranceReceipts(filters);
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(200).json(successEnvelope(data, correlationId));
  } catch (error) {
    next(error);
  }
};

reportsRouter.get(
  '/insurance-vs-cash',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  r5Handler,
);
reportsRouter.get(
  '/r5-insurance-receipts',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  r5Handler,
);

// ── Import Status ───────────────────────────────────────────────────────────
// Accessible strictly by Admin, QA, AdminFinance.
const importStatusHandler = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ReportsService.getImportStatus();
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(200).json(successEnvelope(data, correlationId));
  } catch (error) {
    next(error);
  }
};

reportsRouter.get(
  '/import-status',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  importStatusHandler,
);

// 🔄 Import CSV ───────────────────────────────────────────────────────────
// Accessible strictly by Admin, QA, AdminFinance.
import express from 'express';

const importCsvHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let csvData = '';
    if (typeof req.body === 'string') {
      csvData = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      csvData = req.body.toString('utf-8');
    } else if (req.body && req.body.csvData) {
      csvData = String(req.body.csvData);
    }
    
    const data = await ReportsService.importCsv(csvData);
    const correlationId = (res.locals['correlationId'] as string | undefined) ?? 'unknown';
    res.status(200).json(successEnvelope(data, correlationId));
  } catch (error) {
    next(error);
  }
};

reportsRouter.post(
  '/import-csv',
  requireRole('Admin', 'QA', 'AdminFinance', 'Admin/Finance'),
  express.text({ type: '*/*' }),
  importCsvHandler,
);

export default reportsRouter;
