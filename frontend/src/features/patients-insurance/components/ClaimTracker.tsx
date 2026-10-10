/**
 * src/features/patients-insurance/components/ClaimTracker.tsx
 * Owner: Dev3 | Issue: CATMS-057
 *
 * Insurance claim tracker cards grid component.
 */

import { FileCheck2, ShieldCheck } from 'lucide-react';
import type { Claim, Invoice, Patient } from '../../../types';
import { formatCurrency, formatDate } from '../../../lib/domain';
import { Badge, Button, EmptyState } from '../../../components/ui';

export interface ClaimTrackerProps {
  claims: Array<{ invoice: Invoice; claim: Claim }>;
  pendingCount: number;
  onReviewClaim: (item: { invoice: Invoice; claim: Claim }) => void;
  getPatient: (invoice: Invoice) => Patient;
}

export function ClaimTracker({
  claims,
  pendingCount,
  onReviewClaim,
  getPatient,
}: ClaimTrackerProps) {
  return (
    <section className="mt-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="section-title">Claim tracker</h2>
          <p className="mt-1 text-xs text-slate-500">
            Internal status only; claims are not transmitted to providers in Phase 1.
          </p>
        </div>
        <Badge tone="Pending">{pendingCount} awaiting review</Badge>
      </div>

      {claims.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {claims.map(({ invoice: item, claim }) => (
            <article key={claim.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
                    <FileCheck2 size={19} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{claim.provider}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {claim.policyNo} · {item.invoiceNo}
                    </p>
                  </div>
                </div>
                <Badge>{claim.status}</Badge>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 border-y border-slate-100 py-4">
                <div>
                  <p className="label-caps">Claimed</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {formatCurrency(claim.claimedAmount)}
                  </p>
                </div>
                <div>
                  <p className="label-caps">Approved</p>
                  <p className="mt-1 text-sm font-bold text-emerald-700">
                    {formatCurrency(claim.approvedAmount)}
                  </p>
                </div>
                <div>
                  <p className="label-caps">Submitted</p>
                  <p className="mt-1 text-xs font-semibold text-slate-700">
                    {formatDate(claim.submittedAt)}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-500">{getPatient(item).name}</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onReviewClaim({ invoice: item, claim })}
                >
                  Review claim
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="No claims recorded"
          description="Claims created from eligible patient invoices will appear here."
        />
      )}
    </section>
  );
}
