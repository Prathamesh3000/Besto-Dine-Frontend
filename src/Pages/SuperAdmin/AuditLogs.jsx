import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
    Download,
    Search,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ClipboardList,
    UserCircle2,
} from 'lucide-react';
import api from '../../utils/api';
import {
    PageHeader,
    Card,
    Button,
    Field,
    inputClass,
    EmptyState,
    Skeleton,
    TableShell,
    TH,
    TD,
} from './components/ui';

// Classify an audit action into a colour category so the log is scannable
// at a glance — destructive (rose), approval (emerald), billing (amber),
// change (blue), neutral (slate). Keyword-based so new action names just work.
const actionTone = (action = '') => {
    const a = action.toLowerCase();
    if (/(suspend|reject|delete|cancel|halt|purge|remove|revoke|lock|fail)/.test(a)) return 'rose';
    if (/(approve|confirm|reactivate|activate|unlock|create|assign|grant|received)/.test(a)) return 'emerald';
    if (/(payment|charge|refund|invoice|billing|subscription|plan|razorpay)/.test(a)) return 'amber';
    if (/(update|edit|change|patch|resend)/.test(a)) return 'blue';
    return 'slate';
};
const TONE_CHIP = {
    rose:    'bg-rose-50 text-rose-700 ring-rose-200/70',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200/70',
    amber:   'bg-amber-50 text-amber-700 ring-amber-200/70',
    blue:    'bg-blue-50 text-blue-700 ring-blue-200/70',
    slate:   'bg-gray-100 text-gray-700 ring-gray-200/70',
};
const TONE_DOT = {
    rose: 'bg-rose-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', blue: 'bg-blue-500', slate: 'bg-gray-400',
};
const LEGEND = [
    { tone: 'emerald', label: 'Approve / create' },
    { tone: 'rose',    label: 'Suspend / reject / delete' },
    { tone: 'amber',   label: 'Billing / plan' },
    { tone: 'blue',    label: 'Update' },
];

/**
 * AuditLogs — paginated audit trail viewer.
 *
 * Read-only by design. All Super Admin endpoints write to this log via
 * `utils/audit.js`, so any privileged action surfaces here.
 *
 * Rows are clickable — clicking an entry expands it in-place to show
 * the full `details` object (e.g. plan.assign billing results,
 * suspension reasons, plan diffs). This is intentionally a JSON view
 * rather than a per-event custom renderer so new event types work
 * without needing UI changes.
 */
const AuditLogs = () => {
    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ action: '', targetType: '', from: '', to: '' });
    const [expandedId, setExpandedId] = useState(null);
    const [exporting, setExporting] = useState(false);

    const load = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const res = await api.get('/superadmin/audit-logs', {
                params: { ...filters, page, limit: pagination.limit },
            });
            setItems(res.data?.data || []);
            setPagination(res.data?.pagination || pagination);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load audit log');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    useEffect(() => { load(1); }, [load]);

    const toggleExpanded = (id) => {
        setExpandedId(current => (current === id ? null : id));
    };

    /**
     * Export the current filter view as CSV. Uses fetch + Blob so JWT
     * stays in the Authorization header (browsers don't send custom
     * headers on native downloads). Reuses the same api.js instance so
     * the auth interceptor fires automatically.
     */
    const handleExport = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const params = {};
            if (filters.action)     params.action = filters.action;
            if (filters.targetType) params.targetType = filters.targetType;
            if (filters.from)       params.from = filters.from;
            if (filters.to)         params.to = filters.to;

            const res = await api.get('/superadmin/audit-logs/export', {
                params,
                responseType: 'blob',
            });

            const truncated = res.headers?.['x-export-truncated'] === 'true';
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            const stamp = new Date().toISOString().slice(0, 10);
            a.download = `audit-logs-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            if (truncated) {
                toast(
                    'Export was capped at 10,000 rows. Narrow the date range to get the rest.',
                    { icon: '⚠️', duration: 6000 }
                );
            } else {
                toast.success('Audit log exported');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to export audit log');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Compliance"
                title="Audit Log"
                description="Every privileged Super Admin action is recorded here. Click any row to inspect the full event payload."
                actions={
                    <Button
                        variant="brand"
                        icon={Download}
                        onClick={handleExport}
                        disabled={exporting}
                    >
                        {exporting ? 'Exporting…' : 'Export CSV'}
                    </Button>
                }
            />

            {/* ── Filter bar ─────────────────────────────────────── */}
            <Card className="p-4 sm:p-5 mb-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="lg:col-span-1 sm:col-span-2">
                        <Field label="Action">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="e.g. restaurant.suspend"
                                    value={filters.action}
                                    onChange={e => setFilters(f => ({ ...f, action: e.target.value }))}
                                    className={`${inputClass} pl-9`}
                                />
                            </div>
                        </Field>
                    </div>
                    <Field label="Target type">
                        <select
                            value={filters.targetType}
                            onChange={e => setFilters(f => ({ ...f, targetType: e.target.value }))}
                            className={inputClass}
                        >
                            <option value="">All targets</option>
                            <option value="restaurant">Restaurant</option>
                            <option value="plan">Plan</option>
                            <option value="user">User</option>
                            <option value="platform">Platform</option>
                        </select>
                    </Field>
                    <Field label="From">
                        <input
                            type="date"
                            value={filters.from}
                            onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="To">
                        <input
                            type="date"
                            value={filters.to}
                            onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                </div>

                {/* Legend + clear filters */}
                <div className="flex items-center justify-between gap-4 flex-wrap mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap">
                        {LEGEND.map(l => (
                            <span key={l.tone} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500">
                                <span className={`w-2 h-2 rounded-full ${TONE_DOT[l.tone]}`} />
                                {l.label}
                            </span>
                        ))}
                    </div>
                    {(filters.action || filters.targetType || filters.from || filters.to) && (
                        <button
                            type="button"
                            onClick={() => setFilters({ action: '', targetType: '', from: '', to: '' })}
                            className="text-xs font-semibold text-gray-500 hover:text-[#FE8301] transition"
                        >
                            Clear filters
                        </button>
                    )}
                </div>
            </Card>

            {/* ── Audit table ────────────────────────────────────── */}
            <TableShell>
                <thead>
                    <tr>
                        <TH className="w-8"></TH>
                        <TH>When</TH>
                        <TH>Actor</TH>
                        <TH>Action</TH>
                        <TH>Target</TH>
                        <TH>IP</TH>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <tr key={i} className="border-t border-gray-100">
                                <TD><Skeleton className="h-3 w-3" /></TD>
                                <TD><Skeleton className="h-3 w-28" /></TD>
                                <TD><Skeleton className="h-3 w-32" /></TD>
                                <TD><Skeleton className="h-3 w-36" /></TD>
                                <TD><Skeleton className="h-3 w-24" /></TD>
                                <TD><Skeleton className="h-3 w-20" /></TD>
                            </tr>
                        ))
                    ) : items.length === 0 ? (
                        <tr>
                            <td colSpan="6">
                                <EmptyState
                                    icon={ClipboardList}
                                    title="No audit entries"
                                    description="No privileged actions have been recorded for this filter. Try widening the date range or clearing filters."
                                />
                            </td>
                        </tr>
                    ) : items.map(a => {
                        const isOpen = expandedId === a._id;
                        const hasDetails = a.details && Object.keys(a.details).length > 0;
                        const initial = (a.actorEmail || 'S').charAt(0).toUpperCase();

                        return (
                            <React.Fragment key={a._id}>
                                <tr
                                    className={`border-t border-gray-100 align-middle cursor-pointer transition ${isOpen ? 'bg-orange-50/40' : 'hover:bg-gray-50/60'}`}
                                    onClick={() => toggleExpanded(a._id)}
                                >
                                    <TD>
                                        <ChevronDown
                                            size={14}
                                            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-0' : '-rotate-90'}`}
                                        />
                                    </TD>
                                    <TD>
                                        <div className="text-xs text-gray-700 tabular-nums whitespace-nowrap">
                                            {new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                                        </div>
                                        <div className="text-[10.5px] text-gray-400 tabular-nums">
                                            {new Date(a.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </TD>
                                    <TD>
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-[11px] font-bold flex items-center justify-center shrink-0">
                                                {initial}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-gray-900 truncate">
                                                    {a.actorEmail || (a.actor ? String(a.actor) : '—')}
                                                </div>
                                                <div className="text-[10.5px] text-gray-500 capitalize">
                                                    {a.actorLevel || a.actorRole || '—'}
                                                </div>
                                            </div>
                                        </div>
                                    </TD>
                                    <TD>
                                        <span className={`inline-flex items-center gap-1.5 font-mono text-[11.5px] px-2 py-1 rounded-md ring-1 ${TONE_CHIP[actionTone(a.action)]}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[actionTone(a.action)]}`} />
                                            {a.action}
                                        </span>
                                    </TD>
                                    <TD>
                                        <div className="text-xs font-semibold text-gray-900 truncate max-w-45">
                                            {a.targetName || '—'}
                                        </div>
                                        <div className="text-[10.5px] text-gray-500 capitalize">{a.targetType}</div>
                                    </TD>
                                    <TD>
                                        <span className="text-[11px] text-gray-500 font-mono">{formatIp(a.ip)}</span>
                                    </TD>
                                </tr>
                                {isOpen && (
                                    <tr className="bg-gray-50/40">
                                        <td></td>
                                        <td colSpan="5" className="px-5 py-4">
                                            <DetailsPanel entry={a} hasDetails={hasDetails} />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </TableShell>

            {/* ── Pagination ─────────────────────────────────────── */}
            <div className="flex items-center justify-between mt-5 gap-4 flex-wrap">
                <div className="text-xs text-gray-500">
                    Showing page <span className="font-semibold text-gray-700 tabular-nums">{pagination.page}</span> of{' '}
                    <span className="font-semibold text-gray-700 tabular-nums">{pagination.pages}</span>
                    <span className="text-gray-400"> · {pagination.total.toLocaleString('en-IN')} entries</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={ChevronLeft}
                        onClick={() => load(Math.max(1, pagination.page - 1))}
                        disabled={pagination.page <= 1}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        iconRight={ChevronRight}
                        onClick={() => load(Math.min(pagination.pages, pagination.page + 1))}
                        disabled={pagination.page >= pagination.pages}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    );
};

/** Format IP for display — show "localhost" for loopback addresses. */
const formatIp = (ip) => {
    if (!ip) return '—';
    const trimmed = ip.trim();
    if (trimmed === '::1' || trimmed === '127.0.0.1' || trimmed === '::ffff:127.0.0.1') return 'localhost';
    // Strip ::ffff: prefix from IPv4-mapped IPv6 addresses
    if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
    return trimmed;
};

/**
 * DetailsPanel — renders the `details` object of an audit entry, plus
 * any metadata the top table row doesn't already show. Falls back to
 * formatted JSON for unknown shapes so new event types work without
 * UI changes.
 */
const DetailsPanel = ({ entry, hasDetails }) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 mb-2.5 flex items-center gap-1.5">
                <UserCircle2 size={12} />
                Event metadata
            </div>
            <dl className="text-xs space-y-2">
                <MetaRow
                    label="Actor"
                    value={
                        <div>
                            <span className="font-semibold text-gray-800">{entry.actorEmail || '—'}</span>
                            {(entry.actorLevel || entry.actorRole) && (
                                <span className="ml-1.5 text-[10.5px] text-gray-500 capitalize">
                                    ({entry.actorLevel || entry.actorRole})
                                </span>
                            )}
                        </div>
                    }
                />
                <MetaRow
                    label="Target"
                    value={
                        <div>
                            <span className="font-semibold text-gray-800">{entry.targetName || '—'}</span>
                            {entry.targetType && (
                                <span className="ml-1.5 text-[10.5px] text-gray-500 capitalize">
                                    ({entry.targetType})
                                </span>
                            )}
                        </div>
                    }
                />
                <MetaRow label="IP" value={<span className="font-mono text-gray-600">{formatIp(entry.ip)}</span>} />
                <MetaRow label="User agent" value={<span className="break-all text-gray-600">{entry.userAgent || '—'}</span>} />
            </dl>
        </div>
        <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 mb-2.5">
                Details payload
            </div>
            {hasDetails ? (
                <pre className="bg-white border border-gray-200 rounded-xl p-3.5 text-[11px] font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all max-h-80 overflow-y-auto custom-scrollbar leading-relaxed">
                    {JSON.stringify(entry.details, null, 2)}
                </pre>
            ) : (
                <div className="text-xs text-gray-400 italic px-1">No additional details recorded for this event.</div>
            )}
        </div>
    </div>
);

const MetaRow = ({ label, value }) => (
    <div className="flex items-start gap-3">
        <dt className="text-gray-500 w-20 shrink-0 font-semibold">{label}</dt>
        <dd className="text-gray-700 flex-1 min-w-0">{value}</dd>
    </div>
);

export default AuditLogs;
