/**
 * src/features/patients-insurance/components/PatientDetailModal.tsx
 * Owner: Dev3 | Issues: CATMS-048, CATMS-059
 *
 * Modal for displaying complete clinic-wide patient profile, emergency contacts,
 * identities, and insurance policy coverage rules.
 */

import { CalendarPlus, ContactRound, FileHeart, MapPin, Phone, Plus, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Modal, LoadingBlock } from '../../../components/ui';
import { usePatientDetail } from '../hooks/usePatientsInsurance';
import type { PatientDto } from '../../../api/patients.api';
import type { InsurancePolicyDto } from '../../../api/insurance.api';
import type { SessionUser } from '../../../types';
import { formatDate } from '../../../lib/domain';

export interface PatientDetailModalProps {
  open: boolean;
  onClose: () => void;
  patient: PatientDto | null;
  currentUser: SessionUser | null;
  onOpenAddPolicy: () => void;
}

export function PatientDetailModal({
  open,
  onClose,
  patient: initialPatient,
  currentUser,
  onOpenAddPolicy,
}: PatientDetailModalProps) {
  const navigate = useNavigate();
  const { patient: detail, isLoading } = usePatientDetail(initialPatient?.patientId);

  if (!initialPatient) return null;

  const patient = detail ?? initialPatient;
  const fullName = patient.fullName || `${patient.firstName} ${patient.lastName}`;
  const primaryId = patient.primaryIdentity?.identityNumber || patient.nationalId || 'N/A';
  const idType = patient.primaryIdentity?.identityType || 'NIC';
  const primaryContact = patient.primaryContact || patient.emergencyContacts?.[0];

  const policies: InsurancePolicyDto[] = (detail?.policies || patient.policies || []) as InsurancePolicyDto[];
  const canManagePolicies = currentUser?.role === 'Receptionist' || currentUser?.role === 'Admin';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fullName}
      description={`${patient.patientNumber || patient.patientNo} · Clinic-wide patient record`}
      size="lg"
    >
      {isLoading && !detail ? (
        <LoadingBlock label="Loading complete patient profile" />
      ) : (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="flex flex-col gap-5 rounded-2xl bg-clinic-900 p-5 text-white sm:flex-row sm:items-center">
            <Avatar name={fullName} size="lg" className="bg-white text-clinic-800 ring-0" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold">{fullName}</h3>
                {patient.bloodGroup && <Badge>{patient.bloodGroup}</Badge>}
              </div>
              <p className="mt-1 text-sm text-clinic-100/75">
                {patient.gender} · Born {formatDate(patient.dateOfBirth)} · {idType} {primaryId}
              </p>
              {patient.registeredBranchName && (
                <p className="mt-0.5 text-xs text-clinic-200/60">
                  Registered at {patient.registeredBranchName} · Accessible clinic-wide
                </p>
              )}
            </div>
            {currentUser?.role !== 'Clinician' && (
              <Button
                className="bg-white text-clinic-900 hover:bg-clinic-50"
                onClick={() => {
                  onClose();
                  navigate('/appointments');
                }}
              >
                <CalendarPlus size={16} />Book visit
              </Button>
            )}
          </div>

          {/* Quick Details Grid */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <Phone size={16} className="text-clinic-600" />
              <p className="mt-3 label-caps">Contact</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {patient.contactNumber || patient.phone || 'No phone'}
              </p>
              <p className="mt-1 truncate text-xs text-slate-500">
                {patient.email || 'No email provided'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <MapPin size={16} className="text-clinic-600" />
              <p className="mt-3 label-caps">Address</p>
              <p className="mt-1 text-sm leading-5 text-slate-700">
                {patient.address || 'No residential address'}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <ContactRound size={16} className="text-clinic-600" />
              <p className="mt-3 label-caps">Emergency Contact</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {primaryContact?.contactName || primaryContact?.name || 'Not provided'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {primaryContact?.relationship} · {primaryContact?.phoneNumber || primaryContact?.phone || 'No phone'}
              </p>
            </div>
          </div>

          {/* Insurance Policies Section */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="section-title">Insurance policies</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Multi-provider policies & coverage rules stored in database
                </p>
              </div>
              {canManagePolicies && (
                <Button variant="secondary" size="sm" onClick={onOpenAddPolicy}>
                  <Plus size={14} />Add policy
                </Button>
              )}
            </div>

            <div className="mt-3 space-y-3">
              {policies.length > 0 ? (
                policies.map((policy) => {
                  const policyNumber = policy.policyNumber || policy.policyNo;
                  const providerName = policy.providerName || policy.provider || policy.providerCode || 'Insurer';
                  const status = policy.policyStatus || policy.status || 'ACTIVE';
                  const validFrom = policy.validFrom || policy.startDate;
                  const validTo = policy.validTo || policy.endDate;
                  const coveragesCount = 'coverages' in policy && Array.isArray(policy.coverages)
                    ? policy.coverages.length
                    : ('coverage' in policy && Array.isArray(policy.coverage) ? policy.coverage.length : 0);

                  return (
                    <div
                      key={policy.policyId || policy.id || policyNumber}
                      className="rounded-xl border border-slate-200 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex gap-3">
                          <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
                            <FileHeart size={19} />
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-800">{providerName}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{policyNumber}</p>
                          </div>
                        </div>
                        <Badge tone={String(status).toUpperCase() === 'ACTIVE' ? 'Active' : undefined}>
                          {status}
                        </Badge>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                        <div>
                          <p className="text-slate-400">Valid from</p>
                          <p className="mt-1 font-semibold text-slate-700">{validFrom ? formatDate(validFrom) : 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Valid until</p>
                          <p className="mt-1 font-semibold text-slate-700">{validTo ? formatDate(validTo) : 'Indefinite'}</p>
                        </div>
                      </div>

                      {coveragesCount > 0 && (
                        <p className="mt-3 text-[11px] text-slate-500">
                          {coveragesCount} treatment-specific coverage rule{coveragesCount === 1 ? '' : 's'} configured
                        </p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center">
                  <ShieldCheck className="mx-auto text-slate-400" size={22} />
                  <p className="mt-2 text-sm font-semibold text-slate-700">No insurance policy recorded</p>
                  <p className="mt-1 text-xs text-slate-500">This patient currently uses self-pay.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
