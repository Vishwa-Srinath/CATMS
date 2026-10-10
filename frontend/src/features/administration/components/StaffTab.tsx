import { useState, useMemo } from 'react';
import {
  ArrowRightLeft,
  CircleOff,
  CheckCircle2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  DisabledAction,
  EmptyState,
  LoadingBlock,
  SearchInput,
} from '../../../components/ui';
import { formatDate } from '../../../lib/domain';
import type {
  BranchDto,
  EmployeeDto,
  DoctorProfileDto,
  SpecialtyDto,
  RegisterEmployeeInput,
  AssignEmployeeBranchInput,
  DeactivateEmployeeInput,
  RegisterDoctorInput,
} from '../../../api/staff.api';
import { AddEmployeeModal } from './AddEmployeeModal';
import { TransferBranchModal } from './TransferBranchModal';
import { DoctorProfileModal } from './DoctorProfileModal';
import { StaffDetailModal } from './StaffDetailModal';

interface StaffTabProps {
  employees: EmployeeDto[];
  branches: BranchDto[];
  doctors: DoctorProfileDto[];
  specialties: SpecialtyDto[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRefresh: () => void;
  isAdmin: boolean;
  isManager: boolean;
  userBranchId: string | number;
  currentUserId: string;
  onRegisterEmployee: (data: RegisterEmployeeInput, doctorData?: { license: string; fee?: number; specialtyIds: number[] }) => Promise<void>;
  onAssignBranch: (employeeId: number, data: AssignEmployeeBranchInput) => Promise<void>;
  onDeactivateEmployee: (employeeId: number, data?: DeactivateEmployeeInput) => Promise<void>;
  onRegisterDoctor: (data: RegisterDoctorInput) => Promise<void>;
}

export function StaffTab({
  employees,
  branches,
  doctors,
  specialties,
  isLoading,
  isError,
  error,
  onRefresh,
  isAdmin,
  isManager,
  userBranchId,
  currentUserId,
  onRegisterEmployee,
  onAssignBranch,
  onDeactivateEmployee,
  onRegisterDoctor,
}: StaffTabProps) {
  const [query, setQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>(
    isManager && userBranchId !== 'all' ? String(userBranchId) : 'all',
  );

  const [addOpen, setAddOpen] = useState(false);
  const [detailEmployee, setDetailEmployee] = useState<EmployeeDto | null>(null);
  const [transferEmployee, setTransferEmployee] = useState<EmployeeDto | null>(null);
  const [doctorModalEmployee, setDoctorModalEmployee] = useState<EmployeeDto | null>(null);

  // Active branch manager IDs to prevent deactivating active managers without replacement
  const activeManagerEmployeeIds = useMemo(() => {
    return new Set(
      branches
        .filter((b) => b.manager?.employeeId)
        .map((b) => b.manager!.employeeId),
    );
  }, [branches]);

  const filteredStaff = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return employees.filter((item) => {
      const matchesBranch =
        branchFilter === 'all' ||
        String(item.branchId) === String(branchFilter);

      if (!matchesBranch) return false;

      if (!needle) return true;

      const haystack = [
        item.fullName,
        item.employeeNumber,
        item.nic,
        item.positionCode,
        item.phone,
        item.email || '',
        item.branchName || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [employees, query, branchFilter]);

  if (isLoading && employees.length === 0) {
    return <LoadingBlock label="Loading clinic staff directory from database" />;
  }

  if (isError && employees.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-bold text-red-800">Failed to load staff records</p>
        <p className="mt-1 text-xs text-red-600">{error?.message || 'Server connection error.'}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto]">
        <SearchInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, employee #, NIC, or position…"
          aria-label="Search staff"
        />

        <div className="relative">
          <select
            className="input w-full"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            disabled={isManager && userBranchId !== 'all'}
          >
            {!isManager && <option value="all">All clinic branches</option>}
            {branches.map((branch) => (
              <option key={branch.branchId} value={String(branch.branchId)}>
                {branch.name} ({branch.city})
              </option>
            ))}
          </select>
          {isManager && userBranchId !== 'all' && (
            <span className="block mt-1 text-[10px] text-clinic-700 font-medium">
              Scoped strictly to your assigned branch
            </span>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            {filteredStaff.length} employees
          </p>

          {isAdmin ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add employee
            </Button>
          ) : (
            <DisabledAction reason="Only Admin role can register new clinic employees.">
              <Button disabled>
                <Plus size={16} /> Add employee
              </Button>
            </DisabledAction>
          )}
        </div>
      </div>

      {filteredStaff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees found"
          description={
            query
              ? `No staff records matched "${query}". Try adjusting your search query or branch filter.`
              : 'No employees are registered in this branch category.'
          }
          action={
            isAdmin ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={16} /> Add employee
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-shell overflow-x-auto">
          <table className="data-table min-w-[980px]">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Position & Role</th>
                <th>Home Branch</th>
                <th>Contact</th>
                <th>Joined</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map((item) => {
                const isDoctor =
                  item.isDoctor || item.positionCode.toLowerCase() === 'doctor';
                const doctorProfile = doctors.find((d) => d.doctorId === item.employeeId);
                const isActiveManager = activeManagerEmployeeIds.has(item.employeeId);
                const isCurrentSelf = String(item.employeeId) === currentUserId;

                // Deactivation business rules
                const deactivationDisabledReason = !isAdmin
                  ? 'Only Admin role has permission to deactivate employees.'
                  : isActiveManager && item.isActive
                  ? 'Cannot deactivate an active branch manager. Transfer or assign a new manager first.'
                  : isCurrentSelf
                  ? 'Cannot deactivate your own currently active session account.'
                  : null;

                return (
                  <tr key={item.employeeId}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setDetailEmployee(item)}
                        className="flex items-center gap-3 text-left group"
                      >
                        <Avatar name={item.fullName} />
                        <div>
                          <p className="font-bold text-slate-800 group-hover:text-clinic-700 transition">
                            {item.fullName}
                          </p>
                          <p className="font-mono text-[10px] text-slate-400">
                            {item.employeeNumber} · {item.nic}
                          </p>
                        </div>
                      </button>
                    </td>

                    <td>
                      <p className="font-semibold text-slate-700">{item.positionCode}</p>
                      {doctorProfile && doctorProfile.specialties.length > 0 && (
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {doctorProfile.specialties.map((s) => s.name).join(' · ')}
                        </p>
                      )}
                    </td>

                    <td>
                      <span className="font-medium text-slate-800">
                        {item.branchName || 'Unassigned'}
                      </span>
                    </td>

                    <td>
                      <p className="text-xs">{item.phone}</p>
                      {item.email && (
                        <p className="text-[10px] text-slate-400">{item.email}</p>
                      )}
                    </td>

                    <td className="text-xs text-slate-600">
                      {formatDate(item.hireDate)}
                    </td>

                    <td>
                      <Badge tone={item.isActive ? 'Active' : 'Inactive'}>
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailEmployee(item)}
                        >
                          View
                        </Button>

                        {isAdmin && (
                          <>
                            {isDoctor && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Manage medical licence and specialties"
                                onClick={() => setDoctorModalEmployee(item)}
                              >
                                <Stethoscope size={14} />
                              </Button>
                            )}

                            {item.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Transfer to another branch"
                                onClick={() => setTransferEmployee(item)}
                              >
                                <ArrowRightLeft size={14} />
                              </Button>
                            ) : (
                              <DisabledAction reason="Inactive employees cannot be transferred. Reactivate first.">
                                <Button variant="ghost" size="sm" disabled>
                                  <ArrowRightLeft size={14} />
                                </Button>
                              </DisabledAction>
                            )}

                            {deactivationDisabledReason ? (
                              <DisabledAction reason={deactivationDisabledReason}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled
                                  className="text-slate-400"
                                >
                                  {item.isActive ? <CircleOff size={14} /> : <CheckCircle2 size={14} />}
                                </Button>
                              </DisabledAction>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className={item.isActive ? 'text-coral hover:bg-red-50' : 'text-leaf hover:bg-emerald-50'}
                                onClick={() =>
                                  onDeactivateEmployee(item.employeeId, {
                                    reason: item.isActive ? 'Admin deactivation' : 'Admin reactivation',
                                  })
                                }
                              >
                                {item.isActive ? (
                                  <span className="flex items-center gap-1 text-xs">
                                    <CircleOff size={13} /> Deactivate
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-emerald-700">
                                    <CheckCircle2 size={13} /> Reactivate
                                  </span>
                                )}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-500 pt-2">
        <ShieldCheck size={14} className="text-clinic-600 shrink-0" />
        Employee deactivation is an audited soft state change; historical consultations, invoices, and appointments remain permanently preserved.
      </p>

      {/* Modals */}
      <AddEmployeeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        branches={branches}
        specialties={specialties}
        onSubmit={onRegisterEmployee}
      />

      <TransferBranchModal
        employee={transferEmployee}
        open={Boolean(transferEmployee)}
        onClose={() => setTransferEmployee(null)}
        branches={branches}
        onSubmit={onAssignBranch}
      />

      <DoctorProfileModal
        employee={doctorModalEmployee}
        open={Boolean(doctorModalEmployee)}
        onClose={() => setDoctorModalEmployee(null)}
        specialties={specialties}
        onSubmit={onRegisterDoctor}
      />

      <StaffDetailModal
        employee={detailEmployee}
        doctorProfile={doctors.find((d) => d.doctorId === detailEmployee?.employeeId)}
        open={Boolean(detailEmployee)}
        onClose={() => setDetailEmployee(null)}
        onTransferBranch={(e) => setTransferEmployee(e)}
        onManageDoctor={(e) => setDoctorModalEmployee(e)}
        onToggleDeactivate={(e) =>
          onDeactivateEmployee(e.employeeId, {
            reason: e.isActive ? 'Admin deactivation' : 'Admin reactivation',
          })
        }
        isAdmin={isAdmin}
      />
    </div>
  );
}
