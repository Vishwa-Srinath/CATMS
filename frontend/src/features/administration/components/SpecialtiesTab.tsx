import { useMemo } from 'react';
import { Stethoscope, Building2 } from 'lucide-react';
import { Avatar, Badge, EmptyState, LoadingBlock } from '../../../components/ui';
import { formatCurrency } from '../../../lib/domain';
import type { SpecialtyDto, DoctorProfileDto, BranchDto } from '../../../api/staff.api';

interface SpecialtiesTabProps {
  specialties: SpecialtyDto[];
  doctors: DoctorProfileDto[];
  branches?: BranchDto[];
  isLoading: boolean;
}

export function SpecialtiesTab({
  specialties,
  doctors,
  isLoading,
}: SpecialtiesTabProps) {
  const specialtyMap = useMemo(() => {
    const map = new Map<string, { specialty: SpecialtyDto; doctors: DoctorProfileDto[] }>();

    specialties.forEach((spec) => {
      map.set(spec.name, { specialty: spec, doctors: [] });
    });

    doctors.forEach((doc) => {
      doc.specialties.forEach((s) => {
        const entry = map.get(s.name);
        if (entry) {
          entry.doctors.push(doc);
        } else {
          map.set(s.name, {
            specialty: {
              specialtyId: s.specialtyId,
              specialtyCode: s.name.slice(0, 4).toUpperCase(),
              name: s.name,
              description: null,
              isActive: true,
            },
            doctors: [doc],
          });
        }
      });
    });

    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [specialties, doctors]);

  if (isLoading && specialties.length === 0) {
    return <LoadingBlock label="Loading doctor specialties catalogue" />;
  }

  if (specialties.length === 0 && doctors.length === 0) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No medical specialties configured"
        description="Doctor specialties catalogue will appear once loaded from the backend database."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="section-title">Doctor Specialty Catalogue</h2>
        <p className="mt-1 text-xs text-slate-500">
          Medical practitioners may hold multiple verified clinical specialties. Specialization dictates clinical treatment capabilities and appointment scheduling.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {specialtyMap.map(([name, { doctors: docs }]) => (
          <article key={name} className="card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
                  <Stethoscope size={19} />
                </span>
                <Badge tone="Active">
                  {docs.length} doctor{docs.length === 1 ? '' : 's'}
                </Badge>
              </div>

              <h3 className="mt-4 text-base font-bold text-slate-800">{name}</h3>

              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {docs.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No doctors currently assigned</p>
                ) : (
                  docs.map((doc) => {
                    const primary = doc.specialties.find((s) => s.name === name)?.isPrimary;
                    return (
                      <div key={doc.doctorId} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={doc.fullName} size="sm" />
                          <div>
                            <p className="text-xs font-bold text-slate-700">{doc.fullName}</p>
                            <p className="text-[10px] text-slate-400">
                              {doc.medicalLicenseNo} {primary ? '· Primary' : ''}
                            </p>
                          </div>
                        </div>
                        {doc.defaultConsultationFee && (
                          <span className="font-mono text-[11px] font-semibold text-slate-600">
                            {formatCurrency(doc.defaultConsultationFee)}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Building2 size={12} /> Multi-branch coverage
              </span>
              <span className="font-mono text-[10px]">Active</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
