import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    Plus,
    Search,
    Store,
    ArrowUpRight,
    ChevronRight,
    ChevronLeft,
    ArrowUp,
    ArrowDown,
    IndianRupee,
    CheckCircle2,
    Clock,
    Ban,
    GitBranch,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import CreateRestaurantModal from './components/CreateRestaurantModal';
import {
    PageHeader,
    Card,
    Badge,
    Button,
    EmptyState,
    Skeleton,
    TableShell,
    TH,
    TD,
    inputClass,
} from './components/ui';

/**
 * Restaurants — every BestoDine tenant.
 *
 * Redesigned operator console: a KPI summary strip (counts + MRR), a filter
 * bar (status pills + plan dropdown + search), a sortable table enriched with
 * plan price and branch count, and real pagination. Falls back to a stacked
 * card list on mobile.
 */

const STATUS_TONES = {
    active:    'success',
    trial:     'warning',
    suspended: 'danger',
    past_due:  'warning',
    cancelled: 'slate',
};

const STATUS_FILTERS = ['all', 'active', 'trial', 'suspended', 'cancelled'];

const fmtMoney = (n) => {
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
    } catch {
        return `₹${(n || 0).toLocaleString('en-IN')}`;
    }
};

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Restaurants = () => {
    const { isFullSuperAdmin } = useAuth();
    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState({ total: 0, active: 0, trial: 0, suspended: 0, cancelled: 0, mrr: 0 });
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('all');
    const [plan, setPlan] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState('createdAt');
    const [order, setOrder] = useState('desc');
    const [showCreate, setShowCreate] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { status, q, page, sort, order, limit: 25 };
            if (plan) params.plan = plan;
            const res = await api.get('/superadmin/restaurants', { params });
            setItems(res.data?.data || []);
            setSummary(res.data?.summary || {});
            setPagination(res.data?.pagination || { page: 1, pages: 1, total: 0 });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load restaurants');
        } finally {
            setLoading(false);
        }
    }, [status, q, plan, page, sort, order]);

    // Load the plan list once for the filter dropdown.
    useEffect(() => {
        api.get('/superadmin/plans')
            .then(res => setPlans(res.data?.data || []))
            .catch(() => { /* dropdown just stays empty */ });
    }, []);

    // Reset to page 1 whenever a filter/sort changes.
    useEffect(() => { setPage(1); }, [status, q, plan, sort, order]);

    useEffect(() => {
        const t = setTimeout(load, q ? 300 : 0); // debounce search
        return () => clearTimeout(t);
    }, [load, q]);

    const toggleSort = (field) => {
        if (sort === field) {
            setOrder(o => (o === 'asc' ? 'desc' : 'asc'));
        } else {
            setSort(field);
            setOrder('asc');
        }
    };

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Tenants"
                title="Restaurants"
                description="Manage every restaurant on the BestoDine platform — review status, billing and lifecycle."
                actions={
                    isFullSuperAdmin && (
                        <Button variant="brand" icon={Plus} onClick={() => setShowCreate(true)}>
                            New Restaurant
                        </Button>
                    )
                }
            />

            {/* ── KPI summary strip ──────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-5">
                <KpiCard icon={Store} tone="slate" label="Total tenants" value={summary.total ?? 0} loading={loading} />
                <KpiCard icon={CheckCircle2} tone="emerald" label="Active" value={summary.active ?? 0} loading={loading} />
                <KpiCard icon={Clock} tone="amber" label="On trial" value={summary.trial ?? 0} loading={loading} />
                <KpiCard icon={Ban} tone="rose" label="Suspended" value={summary.suspended ?? 0} loading={loading} />
                <KpiCard icon={IndianRupee} tone="orange" label="MRR" value={fmtMoney(summary.mrr)} loading={loading} />
            </div>

            {/* ── Filter bar ─────────────────────────────────────── */}
            <Card className="p-3 sm:p-4 mb-5">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 bg-[#FAF5F0] border border-orange-100/70 rounded-xl p-1 shrink-0">
                        {STATUS_FILTERS.map(s => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStatus(s)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition ${
                                    status === s
                                        ? 'bg-white text-[#FE8301] shadow-sm border border-orange-200'
                                        : 'text-gray-600 hover:text-[#FE8301]'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    <select
                        value={plan}
                        onChange={e => setPlan(e.target.value)}
                        className={`${inputClass} w-auto! py-2.5 shrink-0`}
                        aria-label="Filter by plan"
                    >
                        <option value="">All plans</option>
                        {plans.map(p => (
                            <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                    </select>

                    <div className="relative flex-1 min-w-60">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search name, slug, email or city…"
                            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#FE8301] focus:ring-4 focus:ring-[#FE8301]/10 transition"
                        />
                    </div>

                    <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
                        <span className="font-semibold tabular-nums">{pagination.total ?? items.length}</span>
                        <span>{(pagination.total ?? items.length) === 1 ? 'result' : 'results'}</span>
                    </div>
                </div>
            </Card>

            {/* ── Desktop table ──────────────────────────────────── */}
            <div className="hidden md:block">
                <TableShell>
                    <thead>
                        <tr>
                            <SortableTH label="Restaurant" field="name" sort={sort} order={order} onSort={toggleSort} />
                            <TH>Plan</TH>
                            <SortableTH label="Status" field="status" sort={sort} order={order} onSort={toggleSort} />
                            <TH align="right">Branches</TH>
                            <SortableTH label="Created" field="createdAt" sort={sort} order={order} onSort={toggleSort} />
                            <TH align="right">Actions</TH>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <tr key={i} className="border-t border-gray-100">
                                    <TD><div className="flex items-center gap-3"><Skeleton className="w-10 h-10 rounded-xl" /><div className="space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-2.5 w-24" /></div></div></TD>
                                    <TD><Skeleton className="h-3 w-20" /></TD>
                                    <TD><Skeleton className="h-5 w-16 rounded-full" /></TD>
                                    <TD align="right"><Skeleton className="h-3 w-8 ml-auto" /></TD>
                                    <TD><Skeleton className="h-3 w-20" /></TD>
                                    <TD align="right"><Skeleton className="h-3 w-12 ml-auto" /></TD>
                                </tr>
                            ))
                        ) : items.length === 0 ? (
                            <tr>
                                <td colSpan="6">
                                    <EmptyState
                                        icon={Store}
                                        title="No restaurants found"
                                        description="Try adjusting your filters, or onboard a new tenant to get started."
                                        action={
                                            isFullSuperAdmin && (
                                                <Button variant="brand" icon={Plus} onClick={() => setShowCreate(true)}>
                                                    New Restaurant
                                                </Button>
                                            )
                                        }
                                    />
                                </td>
                            </tr>
                        ) : items.map(r => {
                            const tone = STATUS_TONES[r.status] || 'slate';
                            const initials = r.name?.trim().slice(0, 2).toUpperCase() || 'R';
                            return (
                                <tr key={r._id} className="border-t border-gray-100 hover:bg-orange-50/30 transition group">
                                    <TD>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar initials={initials} logo={r.logo} />
                                            <div className="min-w-0">
                                                <div className="font-semibold text-gray-900 truncate">{r.name}</div>
                                                <div className="text-xs text-gray-500 truncate">{r.contactEmail || r.slug}</div>
                                            </div>
                                        </div>
                                    </TD>
                                    <TD>
                                        {r.subscription?.planName ? (
                                            <div className="leading-tight">
                                                <div className="text-sm text-gray-800 capitalize">{r.subscription.planName}</div>
                                                <div className="text-[11px] text-gray-500 tabular-nums">
                                                    {r.planPrice > 0 ? `${fmtMoney(r.planPrice)}/mo` : 'Free'}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-gray-400">Unassigned</span>
                                        )}
                                    </TD>
                                    <TD>
                                        <Badge tone={tone} dot>{r.status}</Badge>
                                    </TD>
                                    <TD align="right">
                                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-700 tabular-nums">
                                            <GitBranch size={13} className="text-gray-400" />
                                            {r.activeBranchCount ?? 0}
                                        </span>
                                    </TD>
                                    <TD>
                                        <span className="text-xs text-gray-500 tabular-nums">{fmtDate(r.createdAt)}</span>
                                    </TD>
                                    <TD align="right">
                                        <Link
                                            to={`/superadmin/restaurants/${r._id}`}
                                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 group-hover:text-[#FE8301] transition"
                                        >
                                            Manage
                                            <ArrowUpRight size={13} className="opacity-60 group-hover:opacity-100" />
                                        </Link>
                                    </TD>
                                </tr>
                            );
                        })}
                    </tbody>
                </TableShell>

                {/* Pagination */}
                {!loading && items.length > 0 && (
                    <Pagination pagination={pagination} page={page} setPage={setPage} loading={loading} />
                )}
            </div>

            {/* ── Mobile card list ───────────────────────────────── */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="p-4">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-12 h-12 rounded-xl" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-3 w-2/3" />
                                    <Skeleton className="h-2.5 w-1/2" />
                                </div>
                            </div>
                        </Card>
                    ))
                ) : items.length === 0 ? (
                    <Card>
                        <EmptyState icon={Store} title="No restaurants found" description="Try adjusting your filters." />
                    </Card>
                ) : (
                    <>
                        {items.map(r => {
                            const tone = STATUS_TONES[r.status] || 'slate';
                            const initials = r.name?.trim().slice(0, 2).toUpperCase() || 'R';
                            return (
                                <Link key={r._id} to={`/superadmin/restaurants/${r._id}`} className="block">
                                    <Card className="p-4 hover:border-gray-300 transition">
                                        <div className="flex items-start gap-3">
                                            <Avatar initials={initials} logo={r.logo} size="lg" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-semibold text-gray-900 truncate">{r.name}</div>
                                                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                                                </div>
                                                <div className="text-xs text-gray-500 truncate mt-0.5">{r.contactEmail || r.slug}</div>
                                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                                    <Badge tone={tone} dot>{r.status}</Badge>
                                                    <span className="text-[11px] text-gray-500 capitalize">
                                                        {r.subscription?.planName || 'unassigned'}
                                                        {r.planPrice > 0 && ` · ${fmtMoney(r.planPrice)}/mo`}
                                                    </span>
                                                    <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                                                        <GitBranch size={11} />{r.activeBranchCount ?? 0}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            );
                        })}
                        <Pagination pagination={pagination} page={page} setPage={setPage} loading={loading} />
                    </>
                )}
            </div>

            {showCreate && (
                <CreateRestaurantModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); load(); }}
                />
            )}
        </div>
    );
};

// ─── Sub-components ──────────────────────────────────────────────────

const KPI_TONES = {
    slate:   'bg-gray-50 border-gray-200 text-gray-500',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    amber:   'bg-amber-50 border-amber-100 text-amber-600',
    rose:    'bg-rose-50 border-rose-100 text-rose-600',
    orange:  'bg-orange-50 border-orange-100 text-[#FE8301]',
};

const KpiCard = ({ icon, label, value, tone = 'slate', loading }) => {
    const Icon = icon;
    return (
        <Card className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${KPI_TONES[tone]}`}>
                <Icon size={18} strokeWidth={2} />
            </div>
            <div className="min-w-0">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400 truncate">{label}</div>
                {loading
                    ? <Skeleton className="h-5 w-12 mt-1" />
                    : <div className="text-lg font-bold text-gray-900 tabular-nums truncate">{value}</div>}
            </div>
        </Card>
    );
};

const Avatar = ({ initials, logo, size = 'md' }) => {
    const dim = size === 'lg' ? 'w-12 h-12' : 'w-10 h-10';
    if (logo) {
        return (
            <div className={`${dim} rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center shrink-0`}>
                <img src={logo} alt="" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
        );
    }
    return (
        <div className={`${dim} rounded-xl bg-linear-to-br from-orange-100 to-orange-200/70 text-orange-700 font-bold text-sm flex items-center justify-center shrink-0 ring-1 ring-orange-200/60`}>
            {initials}
        </div>
    );
};

const SortableTH = ({ label, field, sort, order, onSort }) => {
    const active = sort === field;
    return (
        <th className="text-left px-5 py-3.5 text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 bg-[#FAF5F0]/70">
            <button
                type="button"
                onClick={() => onSort(field)}
                className={`inline-flex items-center gap-1 transition hover:text-[#FE8301] ${active ? 'text-[#FE8301]' : ''}`}
            >
                {label}
                {active && (order === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
            </button>
        </th>
    );
};

const Pagination = ({ pagination, page, setPage, loading }) => {
    if ((pagination.pages || 1) <= 1) return null;
    return (
        <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-gray-500">
                Page {pagination.page} of {pagination.pages} · {pagination.total} tenants
            </span>
            <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={loading || page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                    Prev
                </Button>
                <Button variant="ghost" size="sm" iconRight={ChevronRight} disabled={loading || page >= (pagination.pages || 1)} onClick={() => setPage(p => p + 1)}>
                    Next
                </Button>
            </div>
        </div>
    );
};

export default Restaurants;
