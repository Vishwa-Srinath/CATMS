/**
 * src/contracts/reports-import.contract.ts
 * Owner: Dev5 | Issue: CATMS-055
 *
 * Data Transfer Objects (DTOs) and request inputs for Reports and Import API.
 */

export interface BranchWiseSummaryDto {
  branchName: string;
  appointmentDate: string;
  scheduledCount: number;
  completedCount: number;
  cancelledCount: number;
}

export interface DoctorRevenueDto {
  doctorId: number;
  doctorName: string;
  grossRevenue: string;
  actualCollections: string;
}

export interface PatientBalanceDto {
  patientId: number;
  patientName: string;
  invoiceId: number;
  subtotal: string;
  patientLiability: string;
  outstandingBalance: string;
}

export interface TreatmentCountDto {
  categoryName: string;
  treatmentCount: number;
}

export interface InsuranceReceiptDto {
  reportMonth: string;
  totalApprovedInsurance: string;
  totalInsurerReceipts: string;
  totalPatientReceipts: string;
}

export interface ReportFilterDto {
  startDate?: string;
  endDate?: string;
  branchId?: number;
}
