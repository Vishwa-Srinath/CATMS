import { useState, useMemo } from 'react';
import {
  LockKeyhole,
  Unlock,
  ShieldAlert,
  UserCheck,
  Plus,
  RefreshCw,
  Search,
  UserCog,
} from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  DisabledAction,
  EmptyState,
  LoadingBlock,
  StatCard,
} from '../../../components/ui';
import { formatDate } from '../../../lib/domain';
import type {
  AdminUserDto,
  BranchDto,
  EmployeeDto,
  CreateAdminUserInput,
  UpdateUserRoleInput,
} from '../../../api/staff.api';
import { CreateUserAccountModal } from './CreateUserAccountModal';
import { ChangeRoleModal } from './ChangeRoleModal';

interface UserAccountsTabProps {
  users: AdminUserDto[];
  employees: EmployeeDto[];
  branches: BranchDto[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRefresh: () => void;
  isAdmin: boolean;
  onCreateUser: (data: CreateAdminUserInput) => Promise<void>;
  onUnlockUser: (userAccountId: number) => Promise<void>;
  onUpdateRole: (userAccountId: number, data: UpdateUserRoleInput) => Promise<void>;
}

export function UserAccountsTab({
  users,
  employees,
  branches,
  isLoading,
  isError,
  error,
  onRefresh,
  isAdmin,
  onCreateUser,
  onUnlockUser,
  onUpdateRole,
}: UserAccountsTabProps) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState<AdminUserDto | null>(null);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((u) => {
      const matchesRole =
        roleFilter === 'all' ||
        u.roles.some((r) => r.roleCode.toLowerCase() === roleFilter.toLowerCase());

      if (!matchesRole) return false;

      if (!needle) return true;

      const haystack = [u.username, u.fullName, u.employeeNumber, u.accountStatus]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [users, query, roleFilter]);

  const lockedUsersCount = users.filter(
    (u) => u.accountStatus.toLowerCase() === 'locked' || u.failedLoginCount >= 5,
  ).length;

  if (isLoading && users.length === 0) {
    return <LoadingBlock label="Loading user accounts and role mappings" />;
  }

  if (isError && users.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-bold text-red-800">Failed to load user account records</p>
        <p className="mt-1 text-xs text-red-600">{error?.message || 'Server connection error.'}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total active accounts"
          value={users.filter((u) => u.accountStatus.toLowerCase() === 'active').length}
          detail="Authenticated clinic identities"
          icon={UserCheck}
          accent="teal"
        />
        <StatCard
          label="Locked out accounts"
          value={lockedUsersCount}
          detail="Automatic lockout after 5 failed login attempts"
          icon={LockKeyhole}
          accent={lockedUsersCount > 0 ? 'coral' : 'blue'}
        />
        <StatCard
          label="Administrators & Managers"
          value={
            users.filter((u) =>
              u.roles.some((r) =>
                ['admin', 'manager'].includes(r.roleCode.toLowerCase()),
              ),
            ).length
          }
          detail="Elevated privilege role holders"
          icon={UserCog}
          accent="amber"
        />
      </div>

      {/* Search and Filters */}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={17}
          />
          <input
            className="input pl-10"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username, employee name, or number…"
          />
        </div>

        <select
          className="input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">All security roles</option>
          <option value="Admin">Admin / Finance</option>
          <option value="Manager">Branch Manager</option>
          <option value="Clinician">Doctor / Clinician</option>
          <option value="Reception">Reception</option>
          <option value="QA">QA Auditor</option>
        </select>

        {isAdmin ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Issue user account
          </Button>
        ) : (
          <DisabledAction reason="Only Admin role has permission to issue or configure user accounts.">
            <Button disabled>
              <Plus size={16} /> Issue user account
            </Button>
          </DisabledAction>
        )}
      </div>

      {filteredUsers.length === 0 ? (
        <EmptyState
          icon={LockKeyhole}
          title="No user accounts matched"
          description="Try broadening your search query or role filter."
        />
      ) : (
        <div className="table-shell overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th>Username</th>
                <th>Employee Holder</th>
                <th>Application Roles & Scope</th>
                <th>Status</th>
                <th>Failed Attempts</th>
                <th>Last Login</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((item) => {
                const isLocked =
                  item.accountStatus.toLowerCase() === 'locked' ||
                  item.failedLoginCount >= 5;
                const isDisabled = item.accountStatus.toLowerCase() === 'disabled';

                const statusTone = isLocked
                  ? 'Rejected'
                  : isDisabled
                  ? 'Inactive'
                  : 'Active';

                return (
                  <tr key={item.userAccountId}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={item.fullName} size="sm" />
                        <div>
                          <p className="font-mono font-bold text-slate-900">
                            @{item.username}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            ID #{item.userAccountId}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td>
                      <p className="font-semibold text-slate-800">{item.fullName}</p>
                      <p className="font-mono text-[10px] text-slate-400">
                        {item.employeeNumber}
                      </p>
                    </td>

                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {item.roles.map((r, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 border border-slate-200"
                          >
                            <span>{r.roleCode}</span>
                            {r.branchCode && (
                              <span className="font-mono text-[10px] text-clinic-700">
                                ({r.branchCode})
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td>
                      <Badge tone={statusTone}>
                        {isLocked ? 'Locked' : isDisabled ? 'Disabled' : 'Active'}
                      </Badge>
                    </td>

                    <td>
                      {item.failedLoginCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-coral">
                          <ShieldAlert size={13} />
                          {item.failedLoginCount} failed
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">0</span>
                      )}
                    </td>

                    <td className="text-xs text-slate-500">
                      {item.lastLoginAt ? formatDate(item.lastLoginAt) : 'Never logged in'}
                    </td>

                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isAdmin && (
                          <>
                            {isLocked ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="border-coral text-coral hover:bg-red-50"
                                onClick={() => onUnlockUser(item.userAccountId)}
                              >
                                <Unlock size={13} /> Unlock
                              </Button>
                            ) : (
                              <DisabledAction reason="Account is active with no lockout. Unlock action is not needed.">
                                <Button variant="ghost" size="sm" disabled>
                                  <Unlock size={13} className="text-slate-300" />
                                </Button>
                              </DisabledAction>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRoleModalUser(item)}
                            >
                              Change role
                            </Button>
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

      {/* Modals */}
      <CreateUserAccountModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        employees={employees}
        branches={branches}
        onSubmit={onCreateUser}
      />

      <ChangeRoleModal
        user={roleModalUser}
        open={Boolean(roleModalUser)}
        onClose={() => setRoleModalUser(null)}
        branches={branches}
        onSubmit={onUpdateRole}
      />
    </div>
  );
}
