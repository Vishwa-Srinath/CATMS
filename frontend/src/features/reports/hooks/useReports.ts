import { useQuery } from '@tanstack/react-query';
import { reportsApi, ReportFilterParams } from '../../../api/reports.api';

export interface UseReportOptions {
  enabled?: boolean;
}

export function useBranchSummary(params?: ReportFilterParams, options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'branch-summary', params],
    queryFn: async () => {
      return await reportsApi.getBranchSummary(params);
    },
    enabled: options?.enabled,
  });
}

export function useDoctorRevenue(params?: ReportFilterParams, options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'doctor-revenue', params],
    queryFn: async () => {
      return await reportsApi.getDoctorRevenue(params);
    },
    enabled: options?.enabled,
  });
}

export function usePatientBalances(params?: ReportFilterParams, options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'patient-balances', params],
    queryFn: async () => {
      return await reportsApi.getPatientBalances(params);
    },
    enabled: options?.enabled,
  });
}

export function useTreatmentCounts(params?: ReportFilterParams, options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'treatment-counts', params],
    queryFn: async () => {
      return await reportsApi.getTreatmentCounts(params);
    },
    enabled: options?.enabled,
  });
}

export function useInsuranceReceipts(params?: ReportFilterParams, options?: UseReportOptions) {
  return useQuery({
    queryKey: ['reports', 'insurance-receipts', params],
    queryFn: async () => {
      return await reportsApi.getInsuranceReceipts(params);
    },
    enabled: options?.enabled,
  });
}
