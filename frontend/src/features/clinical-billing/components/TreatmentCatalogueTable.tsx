/**
 * src/features/clinical-billing/components/TreatmentCatalogueTable.tsx
 * Owner: Dev4 | Issue: CATMS-057
 *
 * Treatment catalogue table and status toggling component.
 */

import type { Treatment } from '../../../types';
import { formatCurrency } from '../../../lib/domain';
import { Badge, Button } from '../../../components/ui';

export interface TreatmentCatalogueTableProps {
  treatments: Treatment[];
  onToggleTreatment: (id: string) => void;
}

export function TreatmentCatalogueTable({
  treatments,
  onToggleTreatment,
}: TreatmentCatalogueTableProps) {
  const activeCount = treatments.filter((item) => item.isActive).length;

  return (
    <section className="mt-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="section-title">Clinic-wide services</h2>
          <p className="mt-1 text-xs text-slate-500">
            Prices apply to every branch. Retiring a service preserves historical invoice values.
          </p>
        </div>
        <p className="text-xs font-semibold text-slate-500">{activeCount} active</p>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th>Service</th>
              <th>Code</th>
              <th>Category</th>
              <th>Duration</th>
              <th>Current price</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {treatments.map((treatment) => (
              <tr key={treatment.id}>
                <td className="font-bold text-slate-800">{treatment.name}</td>
                <td>
                  <code className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                    {treatment.serviceCode}
                  </code>
                </td>
                <td>{treatment.category}</td>
                <td>{treatment.duration} min</td>
                <td className="font-bold text-slate-800">{formatCurrency(treatment.price)}</td>
                <td>
                  <Badge>{treatment.isActive ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleTreatment(treatment.id)}
                  >
                    {treatment.isActive ? 'Retire' : 'Reactivate'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
