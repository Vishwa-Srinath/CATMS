/**
 * src/api/clinical.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Clinical consultations, notes revisions and treatments catalogue API client.
 */

import { apiClient } from './client';

export interface ClinicalWorklistItemDto {
  appointmentId: number;
  appointmentRef: string;
  patientId: number;
  patientName: string;
  patientNo: string;
  startTime: string;
  status: string;
  doctorName: string;
}

export interface ConsultationNoteDto {
  noteId: number;
  appointmentId: number;
  diagnosis: string;
  clinicalNotes: string;
  recordedAt: string;
  revisionNumber: number;
}

export interface TreatmentCatalogueItemDto {
  treatmentId: number;
  serviceCode: string;
  treatmentName: string;
  categoryName: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

export const clinicalApi = {
  getWorklist: (branchId?: number) =>
    apiClient.get<ClinicalWorklistItemDto[]>('/clinical/worklist', { params: { branchId } }),

  recordConsultation: (
    appointmentId: number,
    data: { diagnosis: string; clinicalNotes: string; treatmentIds?: number[] },
  ) => apiClient.post<ConsultationNoteDto>(`/clinical/consultations/${appointmentId}`, data),

  recordRevision: (
    appointmentId: number,
    data: { diagnosis: string; clinicalNotes: string; reasonForRevision: string },
  ) => apiClient.post<ConsultationNoteDto>(`/clinical/consultations/${appointmentId}/revisions`, data),

  getCatalogue: (params?: { category?: string; isActive?: boolean }) =>
    apiClient.get<TreatmentCatalogueItemDto[]>('/treatments', { params }),

  createCatalogueItem: (data: {
    serviceCode: string;
    treatmentName: string;
    categoryName: string;
    price: number;
    durationMinutes: number;
  }) => apiClient.post<TreatmentCatalogueItemDto>('/treatments', data),

  toggleCatalogueItem: (treatmentId: number, isActive: boolean) =>
    apiClient.patch<TreatmentCatalogueItemDto>(`/treatments/${treatmentId}`, { isActive }),
};
