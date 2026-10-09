/**
 * src/api/reports.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Reports & Import Status API client.
 */

import { apiClient } from './client';

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

export interface ImportStatusDto {
  status: 'idle' | 'running' | 'completed' | 'failed';
  lastImportedAt: string | null;
  totalRecords: number;
  acceptedRecords: number;
  rejectedRecords: number;
  errors: string[];
}

export interface ReportFilterParams {
  startDate?: string;
  endDate?: string;
  branchId?: number;
}

export const reportsApi = {
  getBranchSummary: (params?: ReportFilterParams) =>
    apiClient.get<BranchWiseSummaryDto[]>('/reports/daily-appointments', { params }),

  getDoctorRevenue: (params?: ReportFilterParams) =>
    apiClient.get<DoctorRevenueDto[]>('/reports/doctor-revenue', { params }),

  getPatientBalances: (params?: ReportFilterParams) =>
    apiClient.get<PatientBalanceDto[]>('/reports/patient-outstanding', { params }),

  getTreatmentCounts: (params?: ReportFilterParams) =>
    apiClient.get<TreatmentCountDto[]>('/reports/treatments-by-category', { params }),

  getInsuranceReceipts: (params?: ReportFilterParams) =>
    apiClient.get<InsuranceReceiptDto[]>('/reports/insurance-vs-cash', { params }),

  getImportStatus: () =>
    apiClient.get<ImportStatusDto>('/reports/import-status'),
};
