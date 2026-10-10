/**
 * src/features/patients-insurance/components/AddPolicyModal.tsx
 * Owner: Dev3 | Issues: CATMS-048, CATMS-059
 *
 * Modal for creating an insurance policy and attaching treatment coverage terms.
 */

import { useState, type FormEvent } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, Field, InfoNote, Modal, RuleError } from '../../../components/ui';
import {
  useInsuranceProviders,
  useTreatmentsCatalogue,
  usePatientPolicies,
} from '../hooks/usePatientsInsurance';
import { insuranceApi, type InsurancePolicyStatus } from '../../../api/insurance.api';
import type { PatientDto } from '../../../api/patients.api';
import { ApiError } from '../../../api/errors';

export interface AddPolicyModalProps {
  open: boolean;
  onClose: () => void;
  patient: PatientDto | null;
  onSuccess: () => void;
}

interface CoverageItem {
  treatmentId: number;
  percentage: number;
  maximum?: number;
}

export function AddPolicyModal({
  open,
  onClose,
  patient,
  onSuccess,
}: AddPolicyModalProps) {
  const { providers, isLoading: isLoadingProviders } = useInsuranceProviders('ACTIVE');
  const { treatments, isLoading: isLoadingTreatments } = useTreatmentsCatalogue();
  const { createPolicy, isCreating } = usePatientPolicies(patient?.patientId);

  const [error, setError] = useState<Error | null>(null);
  const [coverages, setCoverages] = useState<CoverageItem[]>([
    { treatmentId: 1, percentage: 80 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  if (!patient) return null;

  const handleAddCoverageRow = () => {
    const nextTreatmentId = treatments[coverages.length]?.treatmentId ?? (coverages.length + 1);
    setCoverages((prev) => [...prev, { treatmentId: nextTreatmentId, percentage: 80 }]);
  };

  const handleRemoveCoverageRow = (index: number) => {
    setCoverages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCoverageChange = (index: number, field: keyof CoverageItem, value: number | undefined) => {
    setCoverages((prev) =>
      prev.map((cov, i) => (i === index ? { ...cov, [field]: value } : cov)),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const providerId = Number(form.get('providerId'));
    const policyNumber = String(form.get('policyNumber') || '').trim();
    const validFrom = String(form.get('validFrom') || '').trim();
    const validTo = String(form.get('validTo') || '').trim() || null;
    const policyStatus = (String(form.get('policyStatus') || 'ACTIVE') as InsurancePolicyStatus);
    const notes = String(form.get('notes') || '').trim() || null;

    try {
      // 1. Create insurance policy via API
      const newPolicy = await createPolicy({
        patientId: patient.patientId,
        providerId,
        policyNumber,
        validFrom,
        validTo,
        policyStatus,
        notes,
      });

      // 2. Add configured treatment coverages to the newly created policy
      for (const cov of coverages) {
        if (cov.treatmentId && cov.percentage >= 0) {
          await insuranceApi.addPolicyCoverage(newPolicy.policyId, {
            treatmentId: cov.treatmentId,
            coveragePercentage: cov.percentage,
            coverageCap: cov.maximum ?? null,
            effectiveFrom: validFrom,
            effectiveTo: validTo,
          });
        }
      }

      onSuccess();
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
      } else if (caught instanceof Error) {
        setError(caught);
      } else {
        setError(new Error('The insurance policy could not be saved.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = isCreating || submitting;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add insurance policy"
      description={`${patient.fullName || `${patient.firstName} ${patient.lastName}`} · Treatment-specific coverage`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <RuleError error={error} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Insurance provider" required>
            <select
              name="providerId"
              className="input"
              required
              disabled={isBusy || isLoadingProviders}
            >
              {providers.length > 0 ? (
                providers.map((p) => (
                  <option key={p.providerId} value={p.providerId}>
                    {p.name} ({p.providerCode})
                  </option>
                ))
              ) : (
                <>
                  <option value="1">Sri Lanka Insurance (SLIC)</option>
                  <option value="2">AIA Insurance Lanka (AIA)</option>
                  <option value="3">Ceylinco General Insurance (CEYLINCO)</option>
                  <option value="4">Allianz Insurance Lanka (ALLIANZ)</option>
                </>
              )}
            </select>
          </Field>

          <Field label="Policy number" hint="Unique per provider" required>
            <input
              name="policyNumber"
              className="input"
              placeholder="e.g. SLIC-POL-99001"
              required
              disabled={isBusy}
            />
          </Field>

          <Field label="Valid from" required>
            <input
              name="validFrom"
              type="date"
              className="input"
              required
              disabled={isBusy}
            />
          </Field>

          <Field label="Valid until" hint="Optional expiration date">
            <input
              name="validTo"
              type="date"
              className="input"
              disabled={isBusy}
            />
          </Field>

          <Field label="Policy status" required>
            <select
              name="policyStatus"
              className="input"
              defaultValue="ACTIVE"
              disabled={isBusy}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="EXPIRED">EXPIRED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </Field>

          <Field label="Internal notes">
            <input
              name="notes"
              className="input"
              placeholder="e.g. Corporate group dental and opd policy"
              disabled={isBusy}
            />
          </Field>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Treatment coverage terms</h3>
              <p className="mt-1 text-xs text-slate-500">
                Set reimbursement percentage and optional cap per treatment.
              </p>
            </div>
            {coverages.length < 5 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddCoverageRow}
                disabled={isBusy}
              >
                <Plus size={14} />Add treatment rule
              </Button>
            )}
          </div>

          <div className="mt-4 space-y-3">
            {coverages.map((cov, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1.4fr_.8fr_.8fr_auto] sm:items-end"
              >
                <Field label="Treatment" required>
                  <select
                    className="input"
                    value={cov.treatmentId}
                    onChange={(e) =>
                      handleCoverageChange(index, 'treatmentId', Number(e.target.value))
                    }
                    disabled={isBusy || isLoadingTreatments}
                  >
                    {treatments.length > 0 ? (
                      treatments.map((t) => (
                        <option key={t.treatmentId} value={t.treatmentId}>
                          {t.treatmentName} ({t.serviceCode})
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="1">General Consultation (MED-001)</option>
                        <option value="2">Dental Cleaning (DEN-001)</option>
                        <option value="3">Root Canal Treatment (DEN-002)</option>
                        <option value="4">Orthodontic Review (DEN-003)</option>
                        <option value="5">Blood Panel Complete (LAB-001)</option>
                      </>
                    )}
                  </select>
                </Field>

                <Field label="Coverage %" required>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    max="100"
                    value={cov.percentage}
                    onChange={(e) =>
                      handleCoverageChange(index, 'percentage', Number(e.target.value))
                    }
                    required
                    disabled={isBusy}
                  />
                </Field>

                <Field label="Max Cap (LKR)">
                  <input
                    type="number"
                    className="input"
                    min="0"
                    step="0.01"
                    placeholder="No cap"
                    value={cov.maximum ?? ''}
                    onChange={(e) =>
                      handleCoverageChange(
                        index,
                        'maximum',
                        e.target.value ? Number(e.target.value) : undefined,
                      )
                    }
                    disabled={isBusy}
                  />
                </Field>

                {coverages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCoverageRow(index)}
                    className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-rose-600"
                    title="Remove rule"
                    disabled={isBusy}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <InfoNote title="Multi-Policy and Eligibility Rule">
          A patient may hold active policies from more than one insurer. Eligibility and reimbursement caps are determined by database procedure rules.
        </InfoNote>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button type="submit" disabled={isBusy}>
            <ShieldCheck size={16} />
            {isBusy ? 'Saving policy…' : 'Save policy'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
