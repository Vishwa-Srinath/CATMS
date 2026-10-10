/**
 * src/features/patients-insurance/index.ts
 * Owner: Dev3 | Issues: CATMS-048, CATMS-049, CATMS-057, CATMS-059, CATMS-060
 *
 * Feature package for patient registry, insurance policies and claims lifecycle.
 */

export * from './components/ClaimTracker';
export * from './components/ClaimSubmissionModal';
export * from './components/ClaimReviewModal';
export * from './components/RegisterPatientModal';
export * from './components/AddPolicyModal';
export * from './components/PatientDetailModal';

export * from './hooks/usePatientsInsurance';
export * from './hooks/useClaims';
