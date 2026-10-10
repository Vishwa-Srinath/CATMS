import { useQuery } from '@tanstack/react-query';
import { reportsApi, ReportFilterParams } from '../../../api/reports.api';

export function useBranchSummary(params?: ReportFilterParams) {
  return useQuery({
    queryKey: ['reports', 'branch-summary', params],
    queryFn: async () => {
      return await reportsApi.getBranchSummary(params);
    },
  });
}

export function useDoctorRevenue(params?: ReportFilterParams) {
  return useQuery({
    queryKey: ['reports', 'doctor-revenue', params],
    queryFn: async () => {
      return await reportsApi.getDoctorRevenue(params);
    },
  });
}

export function usePatientBalances(params?: ReportFilterParams) {
  return useQuery({
    queryKey: ['reports', 'patient-balances', params],
    queryFn: async () => {
      return await reportsApi.getPatientBalances(params);
    },
  });
}

export function useTreatmentCounts(params?: ReportFilterParams) {
  return useQuery({
    queryKey: ['reports', 'treatment-counts', params],
    queryFn: async () => {
      return await reportsApi.getTreatmentCounts(params);
    },
  });
}

export function useInsuranceReceipts(params?: ReportFilterParams) {
  return useQuery({
    queryKey: ['reports', 'insurance-receipts', params],
    queryFn: async () => {
      return await reportsApi.getInsuranceReceipts(params);
    },
  });
}
