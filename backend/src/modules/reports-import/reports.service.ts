/**
 * src/modules/reports-import/reports.service.ts
 * Owner: Dev5 | Issue: CATMS-055, CATMS-071, CATMS-072
 *
 * Service layer for Reports & Ingestion API backed by PostgreSQL views and transactions.
 */

import { pool } from '../../db/pool';
import { 
  BranchWiseSummaryDto, 
  DoctorRevenueDto, 
  PatientBalanceDto, 
  TreatmentCountDto, 
  InsuranceReceiptDto, 
  ReportFilterDto,
  ImportStatusDto,
} from '../../contracts/reports-import.contract';

let lastImportStatus: ImportStatusDto = {
  status: 'idle',
  lastImportedAt: null,
  totalRecords: 0,
  acceptedRecords: 0,
  rejectedRecords: 0,
  errors: [],
};

export class ReportsService {
  
  static async getBranchWiseSummary(filters: ReportFilterDto): Promise<BranchWiseSummaryDto[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId !== undefined) {
      params.push(filters.branchId);
      conditions.push(`branch_id = $${params.length}`);
    }
    if (filters.startDate) {
      params.push(filters.startDate);
      conditions.push(`appointment_date >= $${params.length}`);
    }
    if (filters.endDate) {
      params.push(filters.endDate);
      conditions.push(`appointment_date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT 
        branch_name,
        appointment_date,
        scheduled_count,
        completed_count,
        cancelled_count
      FROM catms.r1_branch_appointment_summary
      ${whereClause}
      ORDER BY appointment_date, branch_name;
    `;

    const result = await pool.query<{
      branch_name: string;
      appointment_date: Date | string;
      scheduled_count: string | number;
      completed_count: string | number;
      cancelled_count: string | number;
    }>(sql, params);

    return result.rows.map(row => ({
      branchName: row.branch_name,
      appointmentDate: typeof row.appointment_date === 'string' 
        ? row.appointment_date 
        : (row.appointment_date instanceof Date 
            ? row.appointment_date.toISOString().slice(0, 10) 
            : String(row.appointment_date)),
      scheduledCount: Number(row.scheduled_count),
      completedCount: Number(row.completed_count),
      cancelledCount: Number(row.cancelled_count),
    }));
  }

  static async getDoctorRevenue(filters: ReportFilterDto): Promise<DoctorRevenueDto[]> {
    void filters;
    const sql = `
      SELECT 
        doctor_id,
        doctor_name,
        gross_revenue,
        actual_collections
      FROM catms.r2_doctor_revenue
      ORDER BY gross_revenue DESC;
    `;

    const result = await pool.query<{
      doctor_id: string | number;
      doctor_name: string;
      gross_revenue: string | number;
      actual_collections: string | number;
    }>(sql);

    return result.rows.map(row => ({
      doctorId: Number(row.doctor_id),
      doctorName: row.doctor_name,
      grossRevenue: Number(row.gross_revenue).toFixed(2),
      actualCollections: Number(row.actual_collections).toFixed(2),
    }));
  }

  static async getPatientBalances(filters: ReportFilterDto): Promise<PatientBalanceDto[]> {
    void filters;
    const sql = `
      SELECT 
        patient_id,
        patient_name,
        invoice_id,
        subtotal_amount,
        patient_liability_amount,
        outstanding_balance
      FROM catms.r3_patient_balances
      ORDER BY outstanding_balance DESC;
    `;

    const result = await pool.query<{
      patient_id: string | number;
      patient_name: string;
      invoice_id: string | number;
      subtotal_amount: string | number;
      patient_liability_amount: string | number;
      outstanding_balance: string | number;
    }>(sql);

    return result.rows.map(row => ({
      patientId: Number(row.patient_id),
      patientName: row.patient_name,
      invoiceId: Number(row.invoice_id),
      subtotal: Number(row.subtotal_amount).toFixed(2),
      patientLiability: Number(row.patient_liability_amount).toFixed(2),
      outstandingBalance: Number(row.outstanding_balance).toFixed(2),
    }));
  }

  static async getTreatmentCounts(filters: ReportFilterDto): Promise<TreatmentCountDto[]> {
    void filters;
    const sql = `
      SELECT 
        category_name,
        treatment_count
      FROM catms.r4_treatment_counts
      ORDER BY treatment_count DESC;
    `;

    const result = await pool.query<{
      category_name: string;
      treatment_count: string | number;
    }>(sql);

    return result.rows.map(row => ({
      categoryName: row.category_name,
      treatmentCount: Number(row.treatment_count),
    }));
  }

  static async getInsuranceReceipts(filters: ReportFilterDto): Promise<InsuranceReceiptDto[]> {
    void filters;
    const sql = `
      SELECT 
        report_month,
        total_approved_insurance,
        total_insurer_receipts,
        total_patient_receipts
      FROM catms.r5_insurance_receipts
      ORDER BY report_month ASC;
    `;

    const result = await pool.query<{
      report_month: string;
      total_approved_insurance: string | number;
      total_insurer_receipts: string | number;
      total_patient_receipts: string | number;
    }>(sql);

    return result.rows.map(row => ({
      reportMonth: String(row.report_month),
      totalApprovedInsurance: Number(row.total_approved_insurance).toFixed(2),
      totalInsurerReceipts: Number(row.total_insurer_receipts).toFixed(2),
      totalPatientReceipts: Number(row.total_patient_receipts).toFixed(2),
    }));
  }

  static async getImportStatus(): Promise<ImportStatusDto> {
    return { ...lastImportStatus };
  }

  /**
   * Controlled CSV Ingestion for Treatment Catalogue (CATMS-071).
   * Validates header columns, verifies row constraints, and performs transactional upsert.
   */
  static async importCsv(csvData: string): Promise<ImportStatusDto> {
    const rawLines = csvData
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (rawLines.length === 0) {
      lastImportStatus = {
        status: 'failed',
        lastImportedAt: new Date().toISOString(),
        totalRecords: 0,
        acceptedRecords: 0,
        rejectedRecords: 0,
        errors: ['Empty CSV payload received.'],
      };
      return lastImportStatus;
    }

    // 1. Validate Header Row
    const headerLine = rawLines[0]!;
    const headers = headerLine.split(',').map(h => h.trim().toLowerCase());
    
    // Support aliases: code/service_code, category_id/treatment_category_id, default_price/current_price
    const codeIdx = headers.findIndex(h => h === 'code' || h === 'service_code');
    const catIdx = headers.findIndex(h => h === 'category_id' || h === 'treatment_category_id');
    const nameIdx = headers.indexOf('name');
    const priceIdx = headers.findIndex(h => h === 'default_price' || h === 'current_price' || h === 'price');
    const durationIdx = headers.findIndex(h => h === 'duration_minutes' || h === 'default_duration_minutes' || h === 'duration');
    const activeIdx = headers.findIndex(h => h === 'is_active' || h === 'active');

    if (codeIdx === -1 || catIdx === -1 || nameIdx === -1 || priceIdx === -1) {
      lastImportStatus = {
        status: 'failed',
        lastImportedAt: new Date().toISOString(),
        totalRecords: rawLines.length - 1,
        acceptedRecords: 0,
        rejectedRecords: rawLines.length - 1,
        errors: [`Invalid CSV headers. Required: code, category_id, name, default_price. Found: ${headerLine}`],
      };
      return lastImportStatus;
    }

    const dataLines = rawLines.slice(1);
    const validRows: Array<{
      serviceCode: string;
      categoryId: number;
      name: string;
      price: number;
      durationMinutes: number;
      isActive: boolean;
    }> = [];
    const errors: string[] = [];

    // 2. Validate Row Data
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i]!;
      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      const rowNum = i + 2;

      const code = cols[codeIdx] ?? '';
      const catIdStr = cols[catIdx] ?? '';
      const name = cols[nameIdx] ?? '';
      const priceStr = cols[priceIdx] ?? '';
      const durationStr = durationIdx !== -1 ? (cols[durationIdx] ?? '15') : '15';
      const activeStr = activeIdx !== -1 ? (cols[activeIdx] ?? 'true') : 'true';

      if (!code) {
        errors.push(`Row ${rowNum}: Service code is required.`);
        continue;
      }
      if (!name) {
        errors.push(`Row ${rowNum}: Treatment name is required.`);
        continue;
      }

      const categoryId = parseInt(catIdStr, 10);
      if (isNaN(categoryId) || categoryId <= 0) {
        errors.push(`Row ${rowNum}: Invalid category_id '${catIdStr}'. Must be positive integer.`);
        continue;
      }

      const price = parseFloat(priceStr);
      if (isNaN(price) || price < 0) {
        errors.push(`Row ${rowNum}: Invalid price '${priceStr}'. Must be non-negative numeric value.`);
        continue;
      }

      const durationMinutes = parseInt(durationStr, 10);
      if (isNaN(durationMinutes) || durationMinutes <= 0) {
        errors.push(`Row ${rowNum}: Invalid duration '${durationStr}'. Must be positive integer.`);
        continue;
      }

      const isActive = activeStr.toLowerCase() === 'true' || activeStr === '1';

      validRows.push({
        serviceCode: code,
        categoryId,
        name,
        price,
        durationMinutes,
        isActive,
      });
    }

    // 3. Perform Transactional Ingestion
    let acceptedRecords = 0;
    if (validRows.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of validRows) {
          await client.query(`
            INSERT INTO catms.treatment_catalogue (
              service_code, 
              treatment_category_id, 
              name, 
              current_price, 
              default_duration_minutes, 
              is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (service_code) DO UPDATE SET
              treatment_category_id    = EXCLUDED.treatment_category_id,
              name                     = EXCLUDED.name,
              current_price            = EXCLUDED.current_price,
              default_duration_minutes = EXCLUDED.default_duration_minutes,
              is_active                = EXCLUDED.is_active,
              updated_at               = now();
          `, [
            row.serviceCode,
            row.categoryId,
            row.name,
            row.price,
            row.durationMinutes,
            row.isActive,
          ]);
          acceptedRecords++;
        }
        await client.query('COMMIT');
      } catch (err: unknown) {
        await client.query('ROLLBACK');
        const errMsg = err instanceof Error ? err.message : String(err);
        errors.push(`Database transaction rolled back: ${errMsg}`);
        acceptedRecords = 0;
      } finally {
        client.release();
      }
    }

    const totalRecords = dataLines.length;
    const rejectedRecords = totalRecords - acceptedRecords;
    const status = (rejectedRecords === 0 && acceptedRecords > 0)
      ? 'completed'
      : (acceptedRecords > 0 ? 'completed' : 'failed');

    lastImportStatus = {
      status,
      lastImportedAt: new Date().toISOString(),
      totalRecords,
      acceptedRecords,
      rejectedRecords,
      errors,
    };

    return lastImportStatus;
  }
}
