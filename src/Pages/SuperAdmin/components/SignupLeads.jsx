import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
    Clock,
    AlertTriangle,
    BellRing,
    CheckCircle2,
    Search,
    Download,
    UserPlus,
    ChevronLeft,
    ChevronRight,
    Mail,
    Phone,
} from 'lucide-react';
import api from '../../../utils/api';
import { useAuth } from '../../../Context/AuthContext';
import useDebouncedValue from '../../../hooks/useDebouncedValue';
import SignupLeadModal from './SignupLeadModal';
import { SEGMENTS, SEGMENT_BADGE, STAGES, STAGE_BY_KEY, fmtDate, trialDaysLabel, isOverdue, stageOf } from './signupLeadsUtils';
import {
    Card,
    StatCard,
    Badge,
    Button,
    Skeleton,
    EmptyState,
    TableShell,
    TH,
    TD,
    inputClass,
} from './ui';

/**
 * Signup Leads — self-service restaurants (free plan or 14-day trial) seen
 * as a sales pipeline. The tenant record IS the lead; this list reads
 * `/superadmin/signup-leads` and the operator works it from the row modal
 * (stage, follow-up date, notes). No automatic emails come from here —
 * the trial reminder job owns those; we only show its history.
 */

const PAGE_SIZE = 25;

const SignupLeads = () => {
    const { canManageModule } = useAuth();
    const canWrite = canManageModule('signupLeads');

    const [segment, setSegment] = useState('all');
    const [stage, setStage] = useState('');
    const [followUpDue, setFollowUpDue] = useState(false);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 350);
    const [page, setPage] = useState(1);

    const [items, setItems] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [selected, setSelected] = useState(null); // lead open in the modal

    // Filters shared by the list and the CSV export (page/limit added by the list).
    const filterParams = useCallback(() => {
        const params = {};
        if (segment !== 'all') params.segment = segment;
        if (stage) params.stage = stage;
        if (followUpDue) params.followUp = 'due';
        if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
        return params;
    }, [segment, stage, followUpDue, debouncedSearch]);

    const loadSummary = useCallback(async () => {
        setSummaryLoading(true);
        try {
            const res = await api.get('/superadmin/signup-leads/summary');
            setSummary(res.data?.data || null);
        } catch {
            // Cards just show dashes; the list carries its own error toast.
        } finally {
            setSummaryLoading(false);
        }
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { ...filterParams(), page, limit: PAGE_SIZE };
            const res = await api.get('/superadmin/signup-leads', { params });
            setItems(res.data?.data || []);
            setPagination(res.data?.pagination || { page: 1, pages: 1, total: 0 });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load signup leads');
        } finally {
            setLoading(false);
        }
    }, [filterParams, page]);

    useEffect(() => { loadSummary(); }, [loadSummary]);
    // Back to page 1 whenever a filter changes.
    useEffect(() => { setPage(1); }, [segment, stage, followUpDue, debouncedSearch]);
    useEffect(() => { load(); }, [load]);

    // A PATCH / note returns the full lead: swap it into the row and the
    // open modal, and refresh the cards (stage / follow-up counts moved).
    const handleUpdated = (lead) => {
        if (!lead) return;
        setItems(list => list.map(l => (l.slug === lead.slug ? { ...l, ...lead } : l)));
        setSelected(cur => (cur && cur.slug === lead.slug ? { ...cur, ...lead } : cur));
        loadSummary();
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await api.get('/superadmin/signup-leads/export.csv', {
                params: filterParams(),
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `signup-leads-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('CSV downloaded');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Export failed');
        } finally {
            setExporting(false);
        }
    };

    const conversionHint = summary
        ? `${Number(summary.conversionRate ?? 0).toFixed(1)}% conversion`
        : undefined;

    return (
        <>
            {/* ── Summary cards ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
                <StatCard icon={Clock} tone="warning" label="On trial" value={summary?.trialActive} loading={summaryLoading} />
                <StatCard icon={AlertTriangle} tone="danger" label="Trial ended – follow up" value={summary?.trialEnded} loading={summaryLoading} />
                <StatCard icon={BellRing} tone="info" label="Follow-ups due" value={summary?.followUpsDue} loading={summaryLoading} />
                <StatCard icon={CheckCircle2} tone="success" label="Converted" value={summary?.paid} hint={conversionHint} loading={summaryLoading} />
            </div>

            {/* ── Filter bar ────────────────────────────────────────── */}
            <Card className="p-3 sm:p-4 mb-5">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 bg-[#FAF5F0] border border-orange-100/70 rounded-xl p-1 shrink-0" role="group" aria-label="Segment">
                        {SEGMENTS.map(s => (
                            <button
                                key={s.key}
                                type="button"
                                onClick={() => setSegment(s.key)}
                                aria-pressed={segment === s.key}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                                    segment === s.key
                                        ? 'bg-white text-[#FE8301] shadow-sm border border-orange-200'
                                        : 'text-gray-600 hover:text-[#FE8301]'
                                }`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <select
                        value={stage}
                        onChange={e => setStage(e.target.value)}
                        className={`${inputClass} w-auto! py-2.5 shrink-0`}
                        aria-label="Filter by stage"
                    >
                        <option value="">All stages</option>
                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>

                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700 select-none shrink-0">
                        <input
                            type="checkbox"
                            checked={followUpDue}
                            onChange={e => setFollowUpDue(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-[#FE8301] focus:ring-[#FE8301]/30"
                        />
                        Follow-ups due
                    </label>

                    <div className="relative flex-1 min-w-60">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search restaurant, owner, email, phone or city…"
                            aria-label="Search signup leads"
                            className={`${inputClass} pl-10`}
                        />
                    </div>

                    <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                        <span className="font-semibold tabular-nums">{pagination.total ?? items.length}</span>
                        <span>{(pagination.total ?? items.length) === 1 ? 'lead' : 'leads'}</span>
                    </div>

                    <Button variant="ghost" size="sm" icon={Download} disabled={exporting} onClick={handleExport}>
                        {exporting ? 'Exporting…' : 'Export CSV'}
                    </Button>
                </div>
            </Card>

            {/* ── Table ─────────────────────────────────────────────── */}
            <TableShell>
                <thead>
                    <tr>
                        <TH>Restaurant</TH>
                        <TH>Contact</TH>
                        <TH>Status</TH>
                        <TH>Trial days</TH>
                        <TH>Signed up</TH>
                        <TH>Stage</TH>
                        <TH>Follow-up</TH>
                    </tr>
                </thead>
                <tbody>
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <tr key={i} className="border-t border-gray-100" aria-hidden="true">
                                <TD><div className="space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-2.5 w-24" /></div></TD>
                                <TD><div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-2.5 w-36" /></div></TD>
                                <TD><Skeleton className="h-5 w-20 rounded-full" /></TD>
                                <TD><Skeleton className="h-3 w-20" /></TD>
                                <TD><Skeleton className="h-3 w-24" /></TD>
                                <TD><Skeleton className="h-5 w-20 rounded-full" /></TD>
                                <TD><Skeleton className="h-3 w-24" /></TD>
                            </tr>
                        ))
                    ) : items.length === 0 ? (
                        <tr>
                            <td colSpan={7}>
                                <EmptyState
                                    icon={UserPlus}
                                    title="No signup leads"
                                    description="Restaurants that start a trial or pick the free plan on their own will show up here. Try widening the filters."
                                />
                            </td>
                        </tr>
                    ) : (
                        items.map(lead => (
                            <LeadRow key={lead.slug || lead.id} lead={lead} onOpen={() => setSelected(lead)} />
                        ))
                    )}
                </tbody>
            </TableShell>

            {!loading && items.length > 0 && (pagination.pages || 1) > 1 && (
                <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-gray-500">
                        Page {pagination.page} of {pagination.pages} · {pagination.total} leads
                    </span>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                            Prev
                        </Button>
                        <Button variant="ghost" size="sm" iconRight={ChevronRight} disabled={page >= (pagination.pages || 1)} onClick={() => setPage(p => p + 1)}>
                            Next
                        </Button>
                    </div>
                </div>
            )}

            {selected && (
                <SignupLeadModal
                    lead={selected}
                    canWrite={canWrite}
                    onClose={() => setSelected(null)}
                    onUpdated={handleUpdated}
                />
            )}
        </>
    );
};

// ─── Row ─────────────────────────────────────────────────────────────

const LeadRow = ({ lead, onOpen }) => {
    const seg = SEGMENT_BADGE[lead.segment] || { tone: 'slate', label: lead.segment || '—' };
    const stageKey = stageOf(lead);
    const stageMeta = STAGE_BY_KEY[stageKey] || { label: stageKey, tone: 'slate' };
    const overdue = isOverdue(lead.nextFollowUpAt);
    return (
        <tr
            className="border-t border-gray-100 hover:bg-orange-50/30 cursor-pointer transition"
            onClick={onOpen}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
            tabIndex={0}
            aria-label={`Open ${lead.name}`}
        >
            <TD>
                <div className="font-semibold text-gray-900">{lead.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                    {[lead.city, lead.plan?.name].filter(Boolean).join(' · ') || '—'}
                </div>
            </TD>
            <TD>
                <div className="text-sm text-gray-800">{lead.owner || '—'}</div>
                <div className="text-xs text-gray-500 mt-0.5 flex flex-col gap-0.5">
                    {lead.email && <span className="inline-flex items-center gap-1.5"><Mail size={11} />{lead.email}</span>}
                    {lead.phone && <span className="inline-flex items-center gap-1.5"><Phone size={11} />{lead.phone}</span>}
                </div>
            </TD>
            <TD><Badge tone={seg.tone} dot>{seg.label}</Badge></TD>
            <TD>
                <span className={`text-sm tabular-nums ${lead.segment === 'trial_ended' ? 'text-rose-600 font-medium' : 'text-gray-700'}`}>
                    {trialDaysLabel(lead)}
                </span>
            </TD>
            <TD><span className="text-sm text-gray-700 tabular-nums">{fmtDate(lead.signedUpAt)}</span></TD>
            <TD><Badge tone={stageMeta.tone}>{stageMeta.label}</Badge></TD>
            <TD>
                <span
                    data-testid={`followup-${lead.slug}`}
                    className={`text-sm tabular-nums ${overdue ? 'text-rose-600 font-semibold' : 'text-gray-700'}`}
                >
                    {fmtDate(lead.nextFollowUpAt)}
                </span>
            </TD>
        </tr>
    );
};

export default SignupLeads;
