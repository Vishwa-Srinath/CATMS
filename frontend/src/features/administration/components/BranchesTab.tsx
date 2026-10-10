import { useState } from 'react';
import { Building2, MapPin, Phone, Plus, UserCog, Edit, RefreshCw } from 'lucide-react';
import { Avatar, Badge, Button, DisabledAction, EmptyState, LoadingBlock, StatCard } from '../../../components/ui';
import type { BranchDto, EmployeeDto, CreateBranchInput, UpdateBranchInput, AssignBranchManagerInput } from '../../../api/staff.api';
import { AddBranchModal } from './AddBranchModal';
import { EditBranchModal } from './EditBranchModal';
import { AssignManagerModal } from './AssignManagerModal';

interface BranchesTabProps {
  branches: BranchDto[];
  employees: EmployeeDto[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRefresh: () => void;
  isAdmin: boolean;
  onCreateBranch: (data: CreateBranchInput) => Promise<void>;
  onUpdateBranch: (id: number, data: UpdateBranchInput) => Promise<void>;
  onAssignManager: (branchId: number, data: AssignBranchManagerInput) => Promise<void>;
}

export function BranchesTab({
  branches,
  employees,
  isLoading,
  isError,
  error,
  onRefresh,
  isAdmin,
  onCreateBranch,
  onUpdateBranch,
  onAssignManager,
}: BranchesTabProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<BranchDto | null>(null);
  const [assignManagerBranch, setAssignManagerBranch] = useState<BranchDto | null>(null);

  if (isLoading && branches.length === 0) {
    return <LoadingBlock label="Loading clinic branches from database" />;
  }

  if (isError && branches.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-bold text-red-800">Failed to load branch records</p>
        <p className="mt-1 text-xs text-red-600">{error?.message || 'Server connection error.'}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  const activeBranches = branches.filter((b) => b.isActive);
  const eligibleManagers = employees.filter(
    (e) => e.positionCode.toLowerCase() === 'manager' && e.isActive,
  );

  return (
    <div className="space-y-6">
      {/* Top summary row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total clinic locations"
          value={branches.length}
          detail={`${activeBranches.length} active facilities in network`}
          icon={Building2}
          accent="teal"
        />
        <StatCard
          label="Branch managers"
          value={branches.filter((b) => Boolean(b.manager)).length}
          detail={`${eligibleManagers.length} active manager personnel available`}
          icon={UserCog}
          accent="blue"
        />
        <StatCard
          label="Staff deployed"
          value={employees.filter((e) => e.isActive).length}
          detail="Assigned across operating branches"
          icon={Building2}
          accent="amber"
        />
      </div>

      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Physical Clinic Network</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Locations anchor patient records, doctor scheduling availability, and operational reports.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Add branch
          </Button>
        ) : (
          <DisabledAction reason="Only Admin role has permission to create new clinic facilities.">
            <Button disabled>
              <Plus size={16} /> Add branch
            </Button>
          </DisabledAction>
        )}
      </div>

      {branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No branches found"
          description="Create your first branch location to begin deploying staff and scheduling appointments."
          action={
            isAdmin ? (
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={16} /> Add branch
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="grid gap-5 lg:grid-cols-3">
          {branches.map((branch) => {
            const assignedStaff = employees.filter(
              (e) => e.branchId === branch.branchId && e.isActive,
            );
            const assignedDoctors = assignedStaff.filter(
              (e) => e.isDoctor || e.positionCode.toLowerCase() === 'doctor',
            );

            return (
              <article key={branch.branchId} className="card overflow-hidden flex flex-col justify-between">
                <div>
                  <div className={`h-2 ${branch.isActive ? 'bg-clinic-600' : 'bg-slate-300'}`} />
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-clinic-50 text-clinic-700">
                        <Building2 size={21} />
                      </span>
                      <Badge tone={branch.isActive ? 'Active' : 'Inactive'}>
                        {branch.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div className="mt-4">
                      <p className="label-caps font-mono">
                        {branch.branchCode} · {branch.city}
                      </p>
                      <h3 className="mt-1 section-title">{branch.name}</h3>
                    </div>

                    <div className="mt-4 space-y-2 text-xs text-slate-500">
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 shrink-0 text-slate-400" size={14} />
                        <span>
                          {branch.addressLine1}
                          {branch.addressLine2 ? `, ${branch.addressLine2}` : ''}
                          {branch.district ? `, ${branch.district}` : ''}
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <Phone className="shrink-0 text-slate-400" size={14} />
                        <span>{branch.contactPhone || branch.phone || 'No phone'}</span>
                      </p>
                    </div>

                    <div className="mt-5 grid grid-cols-2 divide-x divide-slate-200 border-y border-slate-100 py-3 text-center">
                      <div>
                        <p className="text-base font-bold text-slate-900">{assignedStaff.length}</p>
                        <p className="text-[10px] text-slate-400">Total staff</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-900">{assignedDoctors.length}</p>
                        <p className="text-[10px] text-slate-400">Doctors</p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar name={branch.manager?.fullName || 'Unassigned'} size="sm" />
                        <div>
                          <p className="text-[10px] text-slate-400">Branch manager</p>
                          <p className="text-xs font-bold text-slate-700">
                            {branch.manager?.fullName || 'Not appointed'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-5 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditBranch(branch)}
                    >
                      <Edit size={13} /> Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setAssignManagerBranch(branch)}
                    >
                      <UserCog size={13} /> Appoint manager
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {/* Modals */}
      <AddBranchModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={onCreateBranch}
      />

      <EditBranchModal
        branch={editBranch}
        open={Boolean(editBranch)}
        onClose={() => setEditBranch(null)}
        onSubmit={onUpdateBranch}
      />

      <AssignManagerModal
        branch={assignManagerBranch}
        open={Boolean(assignManagerBranch)}
        onClose={() => setAssignManagerBranch(null)}
        eligibleManagers={eligibleManagers}
        onSubmit={onAssignManager}
      />
    </div>
  );
}
