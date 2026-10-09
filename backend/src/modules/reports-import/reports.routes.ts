/**
 * src/modules/reports-import/reports.routes.ts
 * Owner: Dev5 | Issue: CATMS-055
 *
 * Express router for Reports API.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireRole } from '../../app/middleware/auth';
import { ReportsService } from './reports.service';

const router = Router();

// Apply auth middleware
router.use(requireAuth);
// Only Branch Manager, Admin/Finance can access reports
router.use(requireRole(['Branch Manager', 'Admin/Finance']));

router.get('/r1-branch-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ReportsService.getBranchWiseSummary(req.query);
    res.json({ data, meta: { correlationId: req.headers['x-correlation-id'] || 'mock-id' } });
  } catch (error) {
    next(error);
  }
});

router.get('/r2-doctor-revenue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ReportsService.getDoctorRevenue(req.query);
    res.json({ data, meta: { correlationId: req.headers['x-correlation-id'] || 'mock-id' } });
  } catch (error) {
    next(error);
  }
});

router.get('/r3-patient-balances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ReportsService.getPatientBalances(req.query);
    res.json({ data, meta: { correlationId: req.headers['x-correlation-id'] || 'mock-id' } });
  } catch (error) {
    next(error);
  }
});

router.get('/r4-treatment-counts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ReportsService.getTreatmentCounts(req.query);
    res.json({ data, meta: { correlationId: req.headers['x-correlation-id'] || 'mock-id' } });
  } catch (error) {
    next(error);
  }
});

router.get('/r5-insurance-receipts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await ReportsService.getInsuranceReceipts(req.query);
    res.json({ data, meta: { correlationId: req.headers['x-correlation-id'] || 'mock-id' } });
  } catch (error) {
    next(error);
  }
});

export default router;
