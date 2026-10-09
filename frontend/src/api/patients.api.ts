/**
 * src/api/patients.api.ts
 * Owner: Dev1 | Issue: CATMS-056
 *
 * Patient registry and emergency contacts API client.
 */

import { apiClient } from './client';

export interface EmergencyContactDto {
  contactId: number;
  contactName: string;
  relationship: string;
  phone: string;
  isPrimary: boolean;
}

export interface PatientDto {
  patientId: number;
  patientNo: string;
  nationalId?: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email?: string;
  address?: string;
  emergencyContacts?: EmergencyContactDto[];
  createdAt: string;
}

export interface RegisterPatientInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email?: string;
  nationalId?: string;
  address?: string;
  emergencyContacts?: Array<{
    contactName: string;
    relationship: string;
    phone: string;
    isPrimary?: boolean;
  }>;
}

export const patientsApi = {
  search: (query: string) =>
    apiClient.get<PatientDto[]>('/patients', { params: { query } }),

  getById: (patientId: number) =>
    apiClient.get<PatientDto>(`/patients/${patientId}`),

  register: (data: RegisterPatientInput) =>
    apiClient.post<PatientDto>('/patients', data),

  getEmergencyContacts: (patientId: number) =>
    apiClient.get<EmergencyContactDto[]>(`/patients/${patientId}/emergency-contacts`),

  addEmergencyContact: (patientId: number, data: Omit<EmergencyContactDto, 'contactId'>) =>
    apiClient.post<EmergencyContactDto>(`/patients/${patientId}/emergency-contacts`, data),
};
