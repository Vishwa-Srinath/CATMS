import { useState, useMemo } from 'react';
import { ChevronRight, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';
import { useClinic } from '../context/ClinicContext';
import { formatDate } from '../lib/domain';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  LoadingBlock,
  PageHeader,
  RuleError,
  SearchInput,
} from '../components/ui';
import {
  usePatients,
  useClinicBranches,
  RegisterPatientModal,
  PatientDetailModal,
  AddPolicyModal,
} from '../features/patients-insurance';
import type { PatientDto } from '../api/patients.api';
import type { InsurancePolicyDto } from '../api/insurance.api';

export default function PatientsPage() {
  const { user, notify } = useClinic();
  const [query, setQuery] = useState('');
  const [branch, setBranch] = useState('all');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<PatientDto | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  // Fetch branches from API or fallback
  const { branches } = useClinicBranches();

  // Fetch patients clinic-wide from the real backend API
  const {
    allPatients,
    isLoading,
    isError,
    error,
    refetch,
  } = usePatients({ query });

  // Acceptance requirement:
  // "branch filter never hides clinic-wide availability incorrectly"
  // When a search term is typed, search matches are returned clinic-wide across all branches.
  // When no query is typed, the branch dropdown filters the view by registered branch.
  const displayPatients = useMemo(() => {
    if (query.trim()) {
      // Clinic-wide search: do not hide matching patients based on registration branch filter
      return allPatients;
    }
    if (branch === 'all') return allPatients;
    const targetBranchId = Number(String(branch).replace(/\D/g, ''));
    if (isNaN(targetBranchId)) return allPatients;
    return allPatients.filter((p) => p.registeredBranchId === targetBranchId);
  }, [allPatients, query, branch]);

  const canRegister = user?.role === 'Receptionist' || user?.role === 'Admin';

  const handlePatientRegistered = (newPatient: PatientDto) => {
    notify({
      type: 'success',
      title: 'Patient registered clinic-wide',
      message: `${newPatient.fullName || `${newPatient.firstName} ${newPatient.lastName}`} can now be booked at all clinic branches.`,
    });
    setSelectedPatient(newPatient);
    refetch();
  };

  const handlePolicyAdded = () => {
    notify({
      type: 'success',
      title: 'Insurance policy added',
      message: 'Treatment coverage terms have been recorded and are active for billing.',
    });
    refetch();
  };

  return (
    <>
      <PageHeader
        eyebrow="Clinic-wide directory"
        title="Patients"
        description="Find a single patient record from any branch using a name, NIC or passport number, phone, or patient ID."
        actions={
          canRegister ? (
            <Button onClick={() => setRegistrationOpen(true)}>
              <UserPlus size={16} />Register patient
            </Button>
          ) : undefined
        }
      />

      {/* Filter and Search Bar */}
      <section className="card mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_14rem_auto] md:items-center">
          <SearchInput
            placeholder="Search by name, NIC, phone or patient ID…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search patients clinic-wide"
          />

          <select
            className="input"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            aria-label="Filter by registration branch"
          >
            <option value="all">All registration branches</option>
            {branches.length > 0 ? (
              branches.map((item) => (
                <option value={String(item.branchId)} key={item.branchId}>
                  {item.name} ({item.city})
                </option>
              ))
            ) : (
              <>
                <option value="1">MedSync Colombo Main</option>
                <option value="2">MedSync Kandy Central</option>
                <option value="3">MedSync Galle Fort</option>
              </>
            )}
          </select>

          <p className="whitespace-nowrap text-right text-xs font-semibold text-slate-500">
            {displayPatients.length} patient{displayPatients.length === 1 ? '' : 's'}
          </p>
        </div>

        {query.trim() && branch !== 'all' && (
          <p className="mt-2 text-xs text-clinic-700">
            Showing clinic-wide search results across all branches. Registration branch never restricts access.
          </p>
        )}
      </section>

      {/* Loading & Error States */}
      {isLoading ? (
        <LoadingBlock label="Fetching clinic-wide patient records from database…" />
      ) : isError ? (
        <div className="card p-6">
          <RuleError error={error} />
          <div className="mt-4 flex justify-end">
            <Button variant="secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      ) : displayPatients.length > 0 ? (
        <div className="table-shell overflow-x-auto">
          <table className="data-table min-w-[880px]">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Contact</th>
                <th>Registered at</th>
                <th>Last visit</th>
                <th>Insurance</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {displayPatients.map((patient) => {
                const fullName = patient.fullName || `${patient.firstName} ${patient.lastName}`;
                const patientNumber = patient.patientNumber || patient.patientNo;
                const primaryId = patient.primaryIdentity?.identityNumber || patient.nationalId || '';
                const branchName = patient.registeredBranchName ||
                  branches.find((b) => b.branchId === patient.registeredBranchId)?.name ||
                  'Clinic-wide';
                const branchCity = branches.find((b) => b.branchId === patient.registeredBranchId)?.city || '';

                const activePoliciesCount = (patient.policies as InsurancePolicyDto[] | undefined)?.filter(
                  (p: InsurancePolicyDto) => String(p.policyStatus || p.status).toUpperCase() === 'ACTIVE',
                ).length ?? 0;

                return (
                  <tr
                    key={patient.patientId || patientNumber}
                    className="cursor-pointer"
                    onClick={() => setSelectedPatient(patient)}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={fullName} />
                        <div>
                          <p className="font-bold text-slate-800">{fullName}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {patientNumber} {primaryId ? `· ${primaryId}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td>
                      <p className="font-medium text-slate-700">
                        {patient.contactNumber || patient.phone}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {patient.email || '—'}
                      </p>
                    </td>

                    <td>
                      <p className="font-medium text-slate-700">
                        {branchCity || branchName}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {formatDate(patient.registeredAt)}
                      </p>
                    </td>

                    <td>
                      {!patient.lastVisit || patient.lastVisit === 'No visits yet' ? (
                        <span className="text-slate-400">No visits yet</span>
                      ) : (
                        formatDate(patient.lastVisit)
                      )}
                    </td>

                    <td>
                      {activePoliciesCount > 0 ? (
                        <Badge tone="Active">{activePoliciesCount} active</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Self-pay</span>
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-clinic-700"
                        aria-label={`Open ${fullName}'s record`}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No matching patients"
          description="Try a different name, phone, identity number, or registration branch."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setBranch('all');
              }}
            >
              Clear filters
            </Button>
          }
        />
      )}

      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} className="text-clinic-600" />
        Patient records are clinic-wide. Registration branch never restricts care at another branch.
      </p>

      {/* Registration Modal */}
      <RegisterPatientModal
        open={registrationOpen}
        onClose={() => setRegistrationOpen(false)}
        onSuccess={handlePatientRegistered}
        defaultBranchId={user?.branchId === 'all' ? 1 : user?.branchId}
      />

      {/* Patient Profile Detail Modal */}
      <PatientDetailModal
        open={!!selectedPatient}
        onClose={() => setSelectedPatient(null)}
        patient={selectedPatient}
        currentUser={user}
        onOpenAddPolicy={() => setPolicyOpen(true)}
      />

      {/* Add Policy Modal */}
      <AddPolicyModal
        open={policyOpen}
        onClose={() => setPolicyOpen(false)}
        patient={selectedPatient}
        onSuccess={handlePolicyAdded}
      />
    </>
  );
}
