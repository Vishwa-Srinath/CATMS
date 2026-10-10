import { useState, useMemo } from 'react';
import {
  Fingerprint,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  LoadingBlock,
} from '../../../components/ui';
import { formatDate } from '../../../lib/domain';
import type { AuditLogDto } from '../../../api/staff.api';

interface AuditTrailTabProps {
  logs: AuditLogDto[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onRefresh: () => void;
}

export function AuditTrailTab({
  logs,
  isLoading,
  isError,
  error,
  onRefresh,
}: AuditTrailTabProps) {
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const filteredLogs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (filterType !== 'ALL') {
        if (filterType === 'AUTH' && !log.actionCode.startsWith('LOGIN') && !log.actionCode.startsWith('LOGOUT')) {
          return false;
        }
        if (filterType === 'USER' && !log.actionCode.includes('ACCOUNT') && !log.actionCode.includes('ROLE')) {
          return false;
        }
        if (filterType === 'STAFF' && !log.actionCode.includes('EMPLOYEE') && !log.actionCode.includes('DOCTOR') && !log.actionCode.includes('BRANCH')) {
          return false;
        }
      }

      if (!needle) return true;

      const haystack = [
        log.actorUsername,
        log.actorName,
        log.actionCode,
        log.entityType,
        log.entityId,
        log.clientIp || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [logs, query, filterType]);

  const getActionTone = (code: string): string => {
    const c = code.toUpperCase();
    if (c.includes('LOCKED') || c.includes('REJECTED') || c.includes('DEACTIVATED') || c.includes('FAILED')) {
      return 'Rejected';
    }
    if (c.includes('SUCCESS') || c.includes('UNLOCKED') || c.includes('CREATED') || c.includes('REGISTERED') || c.includes('ASSIGNED')) {
      return 'Completed';
    }
    return 'Pending';
  };

  if (isLoading && logs.length === 0) {
    return <LoadingBlock label="Loading append-only audit trail records" />;
  }

  if (isError && logs.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-bold text-red-800">Failed to load audit events</p>
        <p className="mt-1 text-xs text-red-600">{error?.message || 'Server connection error.'}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRefresh}>
          <RefreshCw size={14} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="section-title">Security & Procedural Audit Trail</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Immutable log of state mutations, logins, account lockouts, and administrative assignments.
          </p>
        </div>

        <Button variant="secondary" size="sm" onClick={onRefresh}>
          <RefreshCw size={14} /> Refresh logs
        </Button>
      </div>

      {/* Filter Row */}
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
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
            placeholder="Search by actor, action code, or entity…"
          />
        </div>

        <select
          className="input"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="ALL">All audit events</option>
          <option value="AUTH">Authentication (Login/Logout)</option>
          <option value="USER">User & Role Management</option>
          <option value="STAFF">Staff & Branch Mutations</option>
        </select>
      </div>

      {filteredLogs.length === 0 ? (
        <EmptyState
          icon={Fingerprint}
          title="No audit log entries found"
          description="Actions performed by clinic operators will be appended to this immutable audit table."
        />
      ) : (
        <div className="table-shell overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor Identity</th>
                <th>Action Code</th>
                <th>Target Entity</th>
                <th>Client IP</th>
                <th className="text-right">Payload</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const isExpanded = expandedLogId === log.auditEventId;

                return (
                  <tr key={log.auditEventId} className="hover:bg-slate-50/70 transition">
                    <td className="whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {formatDate(log.occurredAt)} {log.occurredAt.split('T')[1]?.slice(0, 8)}
                    </td>

                    <td>
                      <div>
                        <p className="font-semibold text-slate-800 text-xs">{log.actorName}</p>
                        <p className="font-mono text-[10px] text-slate-400">@{log.actorUsername}</p>
                      </div>
                    </td>

                    <td>
                      <Badge tone={getActionTone(log.actionCode)}>
                        {log.actionCode}
                      </Badge>
                    </td>

                    <td>
                      <span className="font-mono text-xs text-slate-700 font-medium">
                        {log.entityType} #{log.entityId}
                      </span>
                    </td>

                    <td className="font-mono text-xs text-slate-500">
                      {log.clientIp || '127.0.0.1'}
                    </td>

                    <td className="text-right">
                      {log.payload ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedLogId(isExpanded ? null : log.auditEventId)
                          }
                        >
                          <Terminal size={12} /> {isExpanded ? 'Hide' : 'Details'}
                        </Button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded payload viewer */}
      {expandedLogId !== null && (
        <div className="rounded-xl border border-slate-300 bg-slate-900 p-4 text-white font-mono text-xs overflow-x-auto">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
            <span className="text-slate-400 font-sans font-semibold">
              Event #{expandedLogId} Payload Detail:
            </span>
            <button
              type="button"
              className="text-slate-400 hover:text-white"
              onClick={() => setExpandedLogId(null)}
            >
              ✕ Close
            </button>
          </div>
          <pre>
            {JSON.stringify(
              logs.find((l) => l.auditEventId === expandedLogId)?.payload,
              null,
              2,
            )}
          </pre>
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-500 pt-2">
        <ShieldCheck size={14} className="text-clinic-600 shrink-0" />
        Guaranteed append-only audit trail in PostgreSQL: UPDATE and DELETE operations on `catms.audit_event` are prohibited by database engine triggers.
      </p>
    </div>
  );
}
