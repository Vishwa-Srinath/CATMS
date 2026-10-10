/**
 * src/features/patients-insurance/components/ClaimSubmissionModal.tsx
 * Owner: Dev3 | Issues: CATMS-049, CATMS-057, CATMS-060
 *
 * Submit insurance claim modal with server-calculated eligibility preview
 * and multi-policy coordination of benefits.
 */

import { useState, useMemo, type FormEvent } from 'react';
import { FileCheck, ShieldCheck, AlertCircle } from 'lucide-react';
import type { Invoice, Patient } from '../../../types';
import { formatCurrency } from '../../../lib/domain';
import { Button, InfoNote, Modal, RuleError, LoadingBlock, Badge } from '../../../components/ui';
import { useClaimPreview, useSubmitClaim } from '../hooks/useClaims';
import { ApiError } from '../../../api/errors';

export interface ClaimSubmissionModalProps {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
  onSubmitSuccess?: () => void;
  error?: Error | null;
  getPatient: (invoice: Invoice) => Patient;
}

export function ClaimSubmissionModal({
  invoice,
  open,
  onClose,
  onSubmitSuccess,
  error: parentError,
  getPatient,
}: ClaimSubmissionModalProps) {
  const patient = useMemo(() => (invoice ? getPatient(invoice) : null), [invoice, getPatient]);
  const activePolicies = useMemo(
    () => (patient?.policies || []).filter((p) => (p.status || '').toUpperCase() === 'ACTIVE' || p.status === 'Active'),
    [patient],
  );

  // Extract numeric policy IDs or generate IDs
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<number[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Derive invoice ID (numeric)
  const invoiceId = useMemo(() => {
    if (!invoice) return 0;
    const parsed = parseInt(String(invoice.id).replace(/\D/g, ''), 10);
    return isNaN(parsed) ? 1 : parsed;
  }, [invoice]);

  // When active policies load, preselect the first policy if none selected
  const availablePolicies = useMemo(() => {
    return activePolicies.map((p, index) => {
      const numId = parseInt(String(p.id).replace(/\D/g, ''), 10);
      const policyId = isNaN(numId) ? (index + 1) : numId;
      return {
        ...p,
        numericId: policyId,
      };
    });
  }, [activePolicies]);

  // Handle policy selection
  const handleTogglePolicy = (policyId: number) => {
    setError(null);
    setSelectedPolicyIds((current) =>
      current.includes(policyId)
        ? current.filter((id) => id !== policyId)
        : [...current, policyId],
    );
  };

  // Preview eligibility from real backend API — NEVER calculate client-side!
  const {
    preview,
    isLoading: isPreviewLoading,
    error: previewError,
  } = useClaimPreview(
    invoiceId,
    selectedPolicyIds.length > 0 ? selectedPolicyIds : (availablePolicies[0] ? [availablePolicies[0].numericId] : []),
  );

  const effectivePolicyIds = selectedPolicyIds.length > 0
    ? selectedPolicyIds
    : (availablePolicies[0] ? [availablePolicies[0].numericId] : []);

  const { submitClaim, isPending: isSubmitting } = useSubmitClaim();

  if (!invoice || !patient) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (effectivePolicyIds.length === 0) {
      setError(new Error('Please select at least one active insurance policy.'));
      return;
    }

    try {
      await submitClaim({
        invoiceId,
        policyIds: effectivePolicyIds,
      });

      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught);
      } else if (caught instanceof Error) {
        setError(caught);
      } else {
        setError(new Error('The claim could not be submitted.'));
      }
    }
  };

  const activeError = error || previewError || parentError;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit insurance claim"
      description={`${invoice.invoiceNo} · Server-calculated eligibility`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {activeError && <RuleError error={activeError} />}

        <InfoNote title="Coordination of Benefits & Invariant Rule">
          Claimable amounts and policy caps are computed strictly on the server. Pending claims do not alter patient liability until formal finance resolution.
        </InfoNote>

        {/* Policy Selection (Supports Multi-Policy) */}
        <div>
          <label className="label-caps block mb-2">Select Insurance Policies</label>
          {availablePolicies.length > 0 ? (
            <div className="space-y-2">
              {availablePolicies.map((policy) => {
                const isSelected = effectivePolicyIds.includes(policy.numericId);
                return (
                  <div
                    key={policy.numericId}
                    onClick={() => handleTogglePolicy(policy.numericId)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-colors ${
                      isSelected
                        ? 'border-clinic-500 bg-clinic-50/50 text-clinic-900 ring-1 ring-clinic-400'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // Handled by container
                        className="rounded border-slate-300 text-clinic-600 focus:ring-clinic-500"
                      />
                      <div>
                        <p className="text-sm font-bold">{policy.provider}</p>
                        <p className="text-xs text-slate-500">{policy.policyNo}</p>
                      </div>
                    </div>
                    <Badge tone="Active">Active</Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span>This patient has no recorded active insurance policies.</span>
            </div>
          )}
        </div>

        {/* Server-Side Calculated Eligibility Preview */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileCheck size={14} className="text-clinic-600" />
              Server Eligibility Preview
            </h4>
            {isPreviewLoading && <span className="text-xs text-slate-400">Calculating…</span>}
          </div>

          {isPreviewLoading && !preview ? (
            <LoadingBlock label="Calculating multi-policy coordination on server…" />
          ) : preview ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 border-b border-slate-200 pb-3 text-center">
                <div>
                  <p className="label-caps">Invoice Subtotal</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {formatCurrency(preview.invoiceSubtotal ?? preview.totalSubtotal ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="label-caps">Est. Insurance</p>
                  <p className="mt-1 text-sm font-bold text-emerald-700">
                    {formatCurrency(preview.totalEstimatedInsurance ?? preview.totalCovered ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="label-caps">Est. Patient Liability</p>
                  <p className="mt-1 text-sm font-bold text-blue-700">
                    {formatCurrency(preview.estimatedPatientLiability ?? preview.patientLiability ?? 0)}
                  </p>
                </div>
              </div>

              {/* Per-Policy Claimable Allocations */}
              {preview.policies && preview.policies.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500">Coverage Allocation by Policy:</p>
                  {preview.policies.map((p, idx) => (
                    <div
                      key={p.policyId || idx}
                      className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white border border-slate-100"
                    >
                      <span className="font-medium text-slate-700">
                        {p.priority ? `Priority ${p.priority}: ` : ''}{p.providerName || p.policyNumber}
                      </span>
                      <span className="font-bold text-emerald-700">
                        {formatCurrency(p.totalClaimedAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-2">
              Select policies above to request real-time server eligibility preview.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || effectivePolicyIds.length === 0 || isPreviewLoading}
          >
            <ShieldCheck size={16} />
            {isSubmitting ? 'Submitting…' : 'Submit claim to database'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
