/**
 * src/features/patients-insurance/components/ClaimTracker.tsx
 * Owner: Dev3 | Issues: CATMS-057, CATMS-060
 *
 * Insurance claim tracker cards grid component with live API integration
 * and role-gated resolution controls.
 */

import { FileCheck2, ShieldCheck, Clock } from 'lucide-react';
import type { Claim, Invoice, Patient, SessionUser } from '../../../types';
import { formatCurrency, formatDate } from '../../../lib/domain';
import { Badge, Button, EmptyState, LoadingBlock, DisabledAction } from '../../../components/ui';
import { useClaims } from '../hooks/useClaims';

export interface ClaimTrackerProps {
  claims?: Array<{ invoice: Invoice; claim: Claim }>;
  pendingCount?: number;
  onReviewClaim: (item: { invoice: Invoice; claim: Claim }) => void;
  getPatient: (invoice: Invoice) => Patient;
  currentUser?: SessionUser | null;
}

export function ClaimTracker({
  claims: propClaims,
  pendingCount: propPendingCount,
  onReviewClaim,
  getPatient,
  currentUser,
}: ClaimTrackerProps) {
  const { claims: apiClaims, isLoading } = useClaims();

  // Combine API claims with local invoice claims if present
  const isFinanceRole = currentUser?.role === 'Admin' || currentUser?.role === 'Manager';

  // Use API claims when available, mapping them to view items
  const displayClaims = propClaims && propClaims.length > 0
    ? propClaims
    : apiClaims.map((c) => {
        const dummyInvoice: Invoice = {
          id: `inv${c.invoiceId}`,
          invoiceNo: `INV-${c.invoiceId}`,
          appointmentId: `a${c.invoiceId}`,
          subtotal: c.claimedAmount,
          insuranceCovered: c.approvedAmount,
          patientPayable: c.claimedAmount - c.approvedAmount,
          amountPaid: 0,
          status: 'Unpaid',
          issuedAt: c.createdAt,
          payments: [],
          claims: [
            {
              id: `clm${c.claimId}`,
              policyNo: c.policyNumber || 'POL-DEFAULT',
              provider: c.providerName || 'Insurer',
              claimedAmount: c.claimedAmount,
              approvedAmount: c.approvedAmount,
              status: c.claimStatus,
              submittedAt: c.submittedAt,
            },
          ],
        };
        const mappedClaim: Claim = {
          id: `clm${c.claimId}`,
          policyNo: c.policyNumber || 'POL-DEFAULT',
          provider: c.providerName || 'Insurer',
          claimedAmount: c.claimedAmount,
          approvedAmount: c.approvedAmount,
          status: c.claimStatus,
          submittedAt: c.submittedAt,
        };
        return { invoice: dummyInvoice, claim: mappedClaim };
      });

  const pendingCount = propPendingCount !== undefined
    ? propPendingCount
    : displayClaims.filter((item) => item.claim.status === 'Pending').length;

  return (
    <section className="mt-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="section-title">Claim tracker</h2>
          <p className="mt-1 text-xs text-slate-500">
            Internal claims lifecycle and server-managed liability settlements.
          </p>
        </div>
        <Badge tone="Pending">
          <Clock size={12} className="inline mr-1" />
          {pendingCount} awaiting review
        </Badge>
      </div>

      {isLoading && displayClaims.length === 0 ? (
        <LoadingBlock label="Fetching claims from database…" />
      ) : displayClaims.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {displayClaims.map(({ invoice: item, claim }) => {
            const patient = getPatient(item);
            const isResolved = claim.status !== 'Pending';

            return (
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
                  <Badge tone={claim.status === 'Approved' ? 'Active' : (claim.status === 'Pending' ? 'Pending' : undefined)}>
                    {claim.status}
                  </Badge>
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
                  <p className="text-xs text-slate-500">{patient?.name || 'Clinic Patient'}</p>

                  {/* RBAC Gate: Non-finance users are blocked from resolution controls */}
                  {isFinanceRole ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onReviewClaim({ invoice: item, claim })}
                      disabled={isResolved}
                    >
                      {isResolved ? 'Resolved' : 'Review claim'}
                    </Button>
                  ) : (
                    <DisabledAction reason="Claim resolution is restricted to Finance administrators">
                      <Button variant="secondary" size="sm" disabled>
                        Review claim
                      </Button>
                    </DisabledAction>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="No claims recorded"
          description="Claims submitted from eligible patient invoices will appear here."
        />
      )}
    </section>
  );
}
