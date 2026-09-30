import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    Store,
    CheckCircle2,
    Clock4,
    PauseCircle,
    UserCircle2,
    IndianRupee,
    AlertTriangle,
    History,
    Receipt,
    ChevronRight,
    Sparkles,
    Inbox,
    TrendingUp,
    TrendingDown,
    UserX,
    UserPlus,
    Plus,
    Database,
    Mail,
    Webhook,
    Zap,
    Trophy,
    MapPin,
    ArrowRight,
    RefreshCcw,
} from 'lucide-react';
import api from '../../utils/api';
import CreateRestaurantModal from './components/CreateRestaurantModal';
import {
    PageHeader,
    StatCard,
    SectionCard,
    Badge,
    Skeleton,
    EmptyState,
} from './components/ui';

/**
 * SuperAdminDashboard — platform operator overview.
 *
 * Six vertical sections, each with a specific job:
 *   1. Quick actions bar — one-click access to the operator's daily tasks
 *   2. Needs your attention — action signals + money (Pending, MRR, Trials, Branches)
 *   3. Growth pulse — new signups / net change / conversion / at-risk
 *   4. Tenant lifecycle — status snapshot (Total / Active / Trial / Suspended)
 *   5. Last 24h + System health — ops-critical 2-col row
 *   6. Top tenants + Geography — tenant insight 2-col row
 *   7. Trials watchlist + Plans distribution — 2-col row
 *   8. Recent audit log — full-width tail
 *
 * Strictly aggregates — no tenant PII (customer details, order contents)
 * ever enters this response (enforced at the /analytics endpoint).
 */

// ─── Formatters ──────────────────────────────────────────────────────

const fmtINR = (n) => {
    if (n == null || Number.isNaN(n)) return '—';
    try {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(n);
    } catch {
        return `₹${n}`;
    }
};

const fmtSignedINR = (n) => {
    if (n == null || Number.isNaN(n) || n === 0) return '—';
    const sign = n > 0 ? '+' : '−';
    return `${sign}${fmtINR(Math.abs(n))}`;
};

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

const fmtRelative = (iso) => {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString();
};

// Human-readable mapping for audit actions shown in the 24h feed.
const ACTION_LABELS = {
    'restaurant.create':            { verb: 'Created',            icon: Plus },
    'restaurant.self_signup':       { verb: 'Signed up',          icon: UserPlus },
    'restaurant.signup_approve':    { verb: 'Approved signup',    icon: CheckCircle2 },
    'restaurant.signup_reject':     { verb: 'Rejected signup',    icon: UserX },
    'restaurant.suspend':           { verb: 'Suspended',          icon: PauseCircle },
    'restaurant.reactivate':        { verb: 'Reactivated',        icon: CheckCircle2 },
    'restaurant.payment_confirm':   { verb: 'Payment confirmed',  icon: IndianRupee },
    'plan_change.request':          { verb: 'Plan change requested', icon: ArrowRight },
    'plan_change.approve':          { verb: 'Plan changed',       icon: CheckCircle2 },
    'plan_change.reject':           { verb: 'Plan change rejected', icon: UserX },
    'plan.create':                  { verb: 'New plan',           icon: Receipt },
    'plan.archive':                 { verb: 'Plan archived',      icon: Receipt },
};

// ─── Small presentational helpers ────────────────────────────────────

const SectionEyebrow = ({ children }) => (
    <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">
            {children}
        </span>
        <span className="flex-1 h-px bg-linear-to-r from-orange-100 to-transparent" />
    </div>
);

// InlineStat — compact "metric tile" used inside consolidated
// SectionCards. Replaces a full StatCard when we want to show several
// related numbers in one panel without card-stacking the page.
const InlineStat = ({ dot, label, value, sub }) => (
    <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gray-500 flex items-center gap-1.5">
            {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
            {label}
        </div>
        <div className="mt-1.5 text-lg font-bold text-gray-900 tabular-nums leading-none">
            {value ?? 0}
        </div>
        {sub && <div className="mt-1 text-[11px] text-gray-500 truncate">{sub}</div>}
    </div>
);

// LifecycleBar — segmented progress bar showing Active / Trial /
// Suspended as proportions of the total. A single-pixel-thin visual
// that instantly communicates funnel health.
const LifecycleBar = ({ active, trial, suspended, total }) => {
    if (!total) {
        return <div className="h-2 rounded-full bg-gray-100" />;
    }
    const aPct = (active / total) * 100;
    const tPct = (trial / total) * 100;
    const sPct = (suspended / total) * 100;
    return (
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden flex">
            {active > 0    && <div className="bg-emerald-500" style={{ width: `${aPct}%` }} />}
            {trial > 0     && <div className="bg-amber-500"   style={{ width: `${tPct}%` }} />}
            {suspended > 0 && <div className="bg-rose-500"    style={{ width: `${sPct}%` }} />}
        </div>
    );
};

// Inline delta chip for the MRR card — shows ▲ +X% or ▼ -X%.
const DeltaChip = ({ deltaPct, deltaAmount, neutralLabel = 'no change' }) => {
    if (!deltaPct && !deltaAmount) {
        return <span className="text-gray-400">{neutralLabel}</span>;
    }
    const positive = (deltaPct ?? 0) >= 0;
    const Icon = positive ? TrendingUp : TrendingDown;
    const color = positive ? 'text-emerald-600' : 'text-rose-600';
    return (
        <span className={`inline-flex items-center gap-1 font-semibold ${color}`}>
            <Icon size={12} strokeWidth={2.5} />
            {positive ? '+' : ''}{deltaPct}%
            {deltaAmount != null && (
                <span className="text-gray-500 font-normal">({fmtSignedINR(deltaAmount)})</span>
            )}
        </span>
    );
};

// ─── Main component ──────────────────────────────────────────────────

const SuperAdminDashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [showCreate, setShowCreate] = useState(false);

    const load = useCallback(async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        try {
            const res = await api.get('/superadmin/analytics');
            setData(res.data?.data || null);
            setUpdatedAt(Date.now());
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const r = data?.restaurants || {};
    const br = data?.branches || {};
    const mrr = data?.mrr || {};
    const growth = data?.growth || {};
    const conversion = growth.conversion || {};
    const trials = data?.trialsExpiringSoon || { count: 0, tenants: [] };
    const pending = data?.pendingApprovals || { signups: 0, planChanges: 0, payments: 0, total: 0 };
    const today = data?.today || [];
    const health = data?.systemHealth || {};
    const topTenants = data?.topTenants || [];
    const atRisk = data?.atRiskTenants || { count: 0, tenants: [] };
    const geo = data?.geoDistribution || [];

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Dashboard"
                title="Platform Overview"
                description="A bird's-eye view of every BestoDine tenant — what needs action, how the business is growing, and whether the platform is healthy."
                actions={
                    <div className="flex items-center gap-3">
                        {updatedAt && !loading && (
                            <span className="hidden sm:inline text-[11px] text-gray-400">
                                Updated {fmtRelative(updatedAt)}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => load(true)}
                            disabled={refreshing || loading}
                            className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 text-gray-700 hover:text-[#FE8301] text-sm font-semibold px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                        >
                            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
                            {refreshing ? 'Refreshing…' : 'Refresh'}
                        </button>
                    </div>
                }
            />

            {/* ── Quick actions — the operator's daily one-click tasks ── */}
            <section className="flex flex-wrap items-center gap-2.5 mb-7">
                <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 bg-[#FE8301] hover:bg-[#e57601] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-[0_4px_12px_rgba(254,131,1,0.22)] transition"
                >
                    <Plus size={16} /> New Restaurant
                </button>
                <Link
                    to="/superadmin/pending-approvals"
                    className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 text-gray-700 hover:text-[#FE8301] text-sm font-semibold px-4 py-2.5 rounded-xl transition"
                >
                    <Inbox size={16} /> Review Pending
                    {pending.total > 0 && (
                        <span className="ml-0.5 inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[11px] font-bold rounded-full bg-orange-100 text-[#FE8301]">
                            {pending.total}
                        </span>
                    )}
                </Link>
                <Link
                    to="/superadmin/payments"
                    className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 text-gray-700 hover:text-[#FE8301] text-sm font-semibold px-4 py-2.5 rounded-xl transition"
                >
                    <Receipt size={16} /> Payments
                </Link>
                <Link
                    to="/superadmin/restaurants"
                    className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 text-gray-700 hover:text-[#FE8301] text-sm font-semibold px-4 py-2.5 rounded-xl transition"
                >
                    <Store size={16} /> All Tenants
                </Link>
            </section>

            {/* ── Row 1 — Action signals ──────────────────────────── */}
            <SectionEyebrow>Needs your attention</SectionEyebrow>
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-7">
                <Link
                    to="/superadmin/pending-approvals"
                    className="block group transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#FE8301]/30 rounded-2xl"
                >
                    <StatCard
                        label="Pending Approvals"
                        value={pending.total}
                        icon={Inbox}
                        tone={pending.total > 0 ? 'warning' : 'success'}
                        hint={
                            pending.total > 0
                                ? `${pending.signups} signups · ${pending.planChanges} plan · ${pending.payments} payments`
                                : 'All caught up — review queue is empty'
                        }
                        loading={loading}
                    />
                </Link>

                {/* MRR with MoM delta inline */}
                <div className="bg-white rounded-2xl border border-orange-100/60 p-5 shadow-[0_1px_2px_rgba(254,131,1,0.05)] hover:shadow-[0_8px_24px_rgba(254,131,1,0.10)] hover:border-orange-200/70 transition-all">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                                Monthly Revenue
                            </div>
                            <div className="mt-2.5 text-[28px] leading-none font-bold text-gray-900 tabular-nums">
                                {loading ? <Skeleton className="w-20 h-7" /> : fmtINR(mrr.amount)}
                            </div>
                            <div className="mt-2 text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                                {loading ? (
                                    <Skeleton className="h-3 w-24" />
                                ) : (
                                    <>
                                        <DeltaChip
                                            deltaPct={mrr.deltaPct}
                                            deltaAmount={mrr.deltaAmount}
                                        />
                                        <span className="text-gray-400">vs last month</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center ring-1 ring-emerald-200/70">
                            <IndianRupee size={18} strokeWidth={2} />
                        </div>
                    </div>
                </div>

                <StatCard
                    label="Trials Ending ≤ 7d"
                    value={trials.count}
                    icon={AlertTriangle}
                    tone={trials.count > 0 ? 'warning' : 'success'}
                    hint={trials.count > 0 ? 'Reach out before they churn' : 'No churn risk this week'}
                    loading={loading}
                />
                <StatCard
                    label="At-Risk Tenants"
                    value={atRisk.count}
                    icon={UserX}
                    tone={atRisk.count > 0 ? 'warning' : 'success'}
                    hint={atRisk.count > 0 ? '0 orders in last 14 days' : 'Every tenant is active'}
                    loading={loading}
                />
            </section>

            {/* ── Row 2 — Consolidated summary: Lifecycle + Growth ───
                Two SectionCards instead of 8 repetitive StatCards.
                Left card = "the universe" (how many tenants, where in
                the funnel). Right card = "the trajectory" (growth,
                conversion, movement). Reading both together tells the
                operator where the business stands AND where it's heading. */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
                <SectionCard
                    title="Tenant lifecycle"
                    subtitle="Where every restaurant currently sits in the funnel."
                    icon={Store}
                    actions={
                        <Link
                            to="/superadmin/restaurants"
                            className="text-xs font-semibold text-[#FE8301] hover:text-[#e57601] inline-flex items-center gap-1"
                        >
                            Manage <ChevronRight size={13} />
                        </Link>
                    }
                >
                    {loading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : (
                        <>
                            <div className="flex items-baseline gap-3 mb-4">
                                <span className="text-[40px] leading-none font-bold text-gray-900 tabular-nums">
                                    {r.total ?? 0}
                                </span>
                                <span className="text-sm text-gray-500 font-semibold">
                                    total restaurant{r.total === 1 ? '' : 's'}
                                </span>
                            </div>
                            <LifecycleBar
                                active={r.active || 0}
                                trial={r.trial || 0}
                                suspended={r.suspended || 0}
                                total={r.total || 0}
                            />
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                                <InlineStat dot="bg-emerald-500" label="Active"    value={r.active}    sub={r.total ? `${pct(r.active, r.total)}%` : ''} />
                                <InlineStat dot="bg-amber-500"   label="On Trial"  value={r.trial}     sub={r.total ? `${pct(r.trial, r.total)}%` : ''} />
                                <InlineStat dot="bg-rose-500"    label="Suspended" value={r.suspended} sub={r.suspended > 0 ? 'locked out' : ''} />
                                <InlineStat dot="bg-indigo-500"  label="Branches"  value={br.total}    sub={br.total != null ? `${br.active || 0} active` : ''} />
                            </div>
                        </>
                    )}
                </SectionCard>

                <SectionCard
                    title="Growth pulse"
                    subtitle="Are we growing, stagnating or bleeding? Last 30 / 90 days."
                    icon={TrendingUp}
                >
                    {loading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : (
                        <>
                            <div className="flex items-baseline gap-3 mb-1">
                                <span className="text-[40px] leading-none font-bold text-gray-900 tabular-nums">
                                    {growth.signupsThisMonth ?? 0}
                                </span>
                                <span className="text-sm text-gray-500 font-semibold">
                                    new signup{growth.signupsThisMonth === 1 ? '' : 's'} this month
                                </span>
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-2 mb-5">
                                <DeltaChip deltaPct={growth.signupsDeltaPct} neutralLabel="first signups" />
                                <span className="text-gray-400">vs last month</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <InlineStat
                                    dot={(growth.netTenantsThisMonth ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}
                                    label="Net change"
                                    value={
                                        <span className={(growth.netTenantsThisMonth ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                                            {(growth.netTenantsThisMonth ?? 0) >= 0 ? '+' : ''}{growth.netTenantsThisMonth ?? 0}
                                        </span>
                                    }
                                    sub={`+${growth.signupsThisMonth ?? 0} / −${growth.cancelsThisMonth ?? 0}`}
                                />
                                <InlineStat
                                    dot={
                                        (conversion.ratePct ?? 0) >= 20 ? 'bg-emerald-500'
                                        : (conversion.ratePct ?? 0) >= 10 ? 'bg-amber-500'
                                        : 'bg-gray-300'
                                    }
                                    label="Trial → Paid"
                                    value={`${conversion.ratePct ?? 0}%`}
                                    sub={
                                        conversion.trialsStarted90d > 0
                                            ? `${conversion.convertedToPaid}/${conversion.trialsStarted90d} (90d)`
                                            : 'no data'
                                    }
                                />
                                <InlineStat
                                    dot="bg-emerald-500"
                                    label="Revenue"
                                    value={fmtINR(mrr.amount)}
                                    sub={
                                        mrr.paidTenants
                                            ? `${mrr.paidTenants} paid · MoM ${mrr.deltaPct >= 0 ? '+' : ''}${mrr.deltaPct}%`
                                            : ''
                                    }
                                />
                            </div>
                        </>
                    )}
                </SectionCard>
            </section>

            {/* ── Row 4 — Last 24h activity + System health ─────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
                <div className="lg:col-span-2">
                    <SectionCard
                        title="Last 24 hours"
                        subtitle="Privileged actions that changed tenant or platform state."
                        icon={Zap}
                        actions={
                            <Link
                                to="/superadmin/audit-logs"
                                className="text-xs font-semibold text-[#FE8301] hover:text-[#e57601] inline-flex items-center gap-1"
                            >
                                Full log <ChevronRight size={13} />
                            </Link>
                        }
                    >
                        {loading ? (
                            <SkeletonList rows={4} />
                        ) : today.length === 0 ? (
                            <EmptyState
                                icon={Sparkles}
                                title="Quiet day"
                                description="Nothing changed on the platform in the last 24 hours."
                            />
                        ) : (
                            <ul className="space-y-3 -my-1">
                                {today.map(a => {
                                    const meta = ACTION_LABELS[a.action] || { verb: a.action, icon: History };
                                    const Icon = meta.icon;
                                    return (
                                        <li key={a._id} className="flex items-start gap-3 py-1">
                                            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                                                <Icon size={15} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm text-gray-900 truncate">
                                                    <span className="font-semibold">{meta.verb}</span>
                                                    {a.targetName && (
                                                        <span className="text-gray-600"> · {a.targetName}</span>
                                                    )}
                                                </div>
                                                <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                                    by {a.actorEmail}
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                                                {fmtRelative(a.createdAt)}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </SectionCard>
                </div>

                <SystemHealthCard health={health} loading={loading} />
            </section>

            {/* ── Row 5 — Top tenants + Geo distribution ────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
                <SectionCard
                    title="Top tenants by activity"
                    subtitle="Busiest tenants by order volume in the last 30 days."
                    icon={Trophy}
                >
                    {loading ? (
                        <SkeletonList rows={5} />
                    ) : topTenants.length === 0 ? (
                        <EmptyState
                            icon={Trophy}
                            title="No order activity yet"
                            description="Once tenants start taking orders, your busiest ones will surface here."
                        />
                    ) : (
                        <ol className="space-y-3 -my-1">
                            {topTenants.map((t, idx) => (
                                <li key={t._id} className="flex items-center gap-3 py-1">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                        idx === 0 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70' :
                                        idx === 1 ? 'bg-gray-100 text-gray-600 ring-1 ring-gray-200/70' :
                                        idx === 2 ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/70' :
                                        'bg-gray-50 text-gray-500'
                                    }`}>
                                        {idx + 1}
                                    </div>
                                    <Link
                                        to={`/superadmin/restaurants/${t._id}`}
                                        className="font-semibold text-sm text-gray-900 hover:text-[#FE8301] truncate flex-1 transition"
                                    >
                                        {t.name}
                                    </Link>
                                    <span className="text-[11px] text-gray-500 capitalize">
                                        {t.planName || 'unassigned'}
                                    </span>
                                    <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0">
                                        {t.orderCount30d.toLocaleString('en-IN')}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </SectionCard>

                <SectionCard
                    title="Where tenants are"
                    subtitle="Top cities by tenant count. Useful for regional expansion strategy."
                    icon={MapPin}
                >
                    {loading ? (
                        <SkeletonList rows={5} />
                    ) : geo.length === 0 ? (
                        <EmptyState
                            icon={MapPin}
                            title="No city data yet"
                            description="Tenants haven't provided city info during signup or onboarding."
                        />
                    ) : (
                        <ul className="space-y-3">
                            {geo.map(g => {
                                const total = geo.reduce((s, x) => s + (x.count || 0), 0) || 1;
                                const p = Math.round(((g.count || 0) / total) * 100);
                                return (
                                    <li key={g.city}>
                                        <div className="flex items-center justify-between text-sm mb-1.5">
                                            <span className="font-semibold text-gray-800 inline-flex items-center gap-1.5">
                                                <MapPin size={12} className="text-gray-400" />
                                                {g.city}
                                            </span>
                                            <span className="text-xs text-gray-500 tabular-nums">
                                                {g.count} · <span className="text-gray-400">{p}%</span>
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-linear-to-r from-indigo-400 to-indigo-500"
                                                style={{ width: `${p}%` }}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SectionCard>
            </section>

            {/* ── Row 6 — Watchlists: Trials expiring + Plans ─────── */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
                <SectionCard
                    title="Trials expiring within 7 days"
                    subtitle="Owners on a free window — chase before the trial lapses."
                    icon={Clock4}
                    actions={
                        <Link
                            to="/superadmin/restaurants"
                            className="text-xs font-semibold text-[#FE8301] hover:text-[#e57601] inline-flex items-center gap-1"
                        >
                            View all <ChevronRight size={13} />
                        </Link>
                    }
                >
                    {loading ? (
                        <SkeletonList rows={4} />
                    ) : trials.tenants.length === 0 ? (
                        <EmptyState
                            icon={Sparkles}
                            title="No trials ending soon"
                            description="There's nothing urgent in the next 7 days."
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100 -my-2">
                            {trials.tenants.map(t => (
                                <li key={t._id} className="py-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            to={`/superadmin/restaurants/${t._id}`}
                                            className="font-semibold text-sm text-gray-900 hover:text-[#FE8301] truncate block transition"
                                        >
                                            {t.name}
                                        </Link>
                                        <div className="text-xs text-gray-500 truncate mt-0.5">
                                            <span className="capitalize">{t.planName || 'unassigned'}</span> · ends{' '}
                                            {t.trialEndDate ? new Date(t.trialEndDate).toLocaleDateString() : '—'}
                                        </div>
                                    </div>
                                    <Badge
                                        tone={t.daysLeft <= 1 ? 'danger' : t.daysLeft <= 3 ? 'warning' : 'slate'}
                                        dot
                                    >
                                        {t.daysLeft === 0 ? 'today' : t.daysLeft === 1 ? '1 day' : `${t.daysLeft} days`}
                                    </Badge>
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <SectionCard
                    title="Plans by usage"
                    subtitle="How tenants are distributed across pricing tiers."
                    icon={Receipt}
                    actions={
                        <Link
                            to="/superadmin/plans"
                            className="text-xs font-semibold text-[#FE8301] hover:text-[#e57601] inline-flex items-center gap-1"
                        >
                            Manage <ChevronRight size={13} />
                        </Link>
                    }
                >
                    {loading ? (
                        <SkeletonList rows={3} />
                    ) : (data?.plansByUsage || []).length === 0 ? (
                        <EmptyState
                            icon={Receipt}
                            title="No tenants on a plan"
                            description="Assign a plan from any restaurant detail page."
                        />
                    ) : (
                        <ul className="space-y-3">
                            {data.plansByUsage.map(p => {
                                const total = data.plansByUsage.reduce((s, x) => s + (x.count || 0), 0) || 1;
                                const p2 = Math.round(((p.count || 0) / total) * 100);
                                return (
                                    <li key={p._id || 'unassigned'}>
                                        <div className="flex items-center justify-between text-sm mb-1.5">
                                            <span className="font-semibold text-gray-800 capitalize">
                                                {p._id || 'unassigned'}
                                            </span>
                                            <span className="text-xs text-gray-500 tabular-nums">
                                                {p.count} · <span className="text-gray-400">{p2}%</span>
                                            </span>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-linear-to-r from-orange-400 to-orange-500"
                                                style={{ width: `${p2}%` }}
                                            />
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SectionCard>
            </section>

            {/* ── Row 7 — Recent audit log (full-width tail) ────────── */}
            <SectionCard
                title="Recent activity"
                subtitle="Most recent privileged actions across the platform."
                icon={History}
                actions={
                    <Link
                        to="/superadmin/audit-logs"
                        className="text-xs font-semibold text-[#FE8301] hover:text-[#e57601] inline-flex items-center gap-1"
                    >
                        Audit log <ChevronRight size={13} />
                    </Link>
                }
            >
                {loading ? (
                    <SkeletonList rows={4} />
                ) : (data?.recentActivity || []).length === 0 ? (
                    <EmptyState
                        icon={History}
                        title="No recent actions"
                        description="When a Super Admin performs a privileged action, it shows up here."
                    />
                ) : (
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                        {data.recentActivity.map(a => (
                            <li key={a._id} className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200/70 flex items-center justify-center text-gray-500 shrink-0">
                                    <UserCircle2 size={16} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-gray-900 truncate">
                                        <span className="font-mono text-[12px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                            {a.action}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 truncate mt-1">
                                        {a.actorEmail} → {a.targetName || a.targetType || '—'}
                                    </div>
                                </div>
                                <div className="text-[11px] text-gray-400 shrink-0 tabular-nums">
                                    {fmtRelative(a.createdAt)}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </SectionCard>

            {showCreate && (
                <CreateRestaurantModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => { setShowCreate(false); load(true); }}
                />
            )}
        </div>
    );
};

// ─── System Health sub-component ─────────────────────────────────────

const HealthRow = ({ icon, label, value, status, hint }) => {
    const Icon = icon;
    const dotColor =
        status === 'ok'      ? 'bg-emerald-500' :
        status === 'warn'    ? 'bg-amber-500'   :
        status === 'error'   ? 'bg-rose-500'    : 'bg-gray-300';
    const valueColor =
        status === 'ok'      ? 'text-emerald-700' :
        status === 'warn'    ? 'text-amber-700'   :
        status === 'error'   ? 'text-rose-700'    : 'text-gray-500';
    return (
        <li className="flex items-start gap-3 py-2">
            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-200/70 text-gray-500 flex items-center justify-center shrink-0">
                <Icon size={14} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-700">{label}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                </div>
                <div className={`text-xs font-semibold ${valueColor} mt-0.5`}>{value}</div>
                {hint && <div className="text-[10.5px] text-gray-400 mt-0.5">{hint}</div>}
            </div>
        </li>
    );
};

const SystemHealthCard = ({ health, loading }) => {
    const db = health.db || {};
    const email = health.email || {};
    const razorpay = health.razorpay || {};

    const dbStatus = db.ok ? (db.responseMs > 500 ? 'warn' : 'ok') : 'error';
    const emailStatus = email.configured ? 'ok' : 'warn';
    const razorpayStatus = !razorpay.configured
        ? 'warn'
        : razorpay.lastWebhookAgeHours == null
            ? 'warn'
            : razorpay.lastWebhookAgeHours > 72
                ? 'warn'
                : 'ok';

    return (
        <SectionCard
            title="System health"
            subtitle="Platform plumbing — green = happy, amber = check config."
            icon={Database}
        >
            {loading ? (
                <SkeletonList rows={3} />
            ) : (
                <ul className="space-y-1 -my-2">
                    <HealthRow
                        icon={Database}
                        label="Database"
                        status={dbStatus}
                        value={db.ok ? `${db.responseMs}ms` : 'unreachable'}
                        hint={dbStatus === 'warn' ? 'Slow response — check indexes' : null}
                    />
                    <HealthRow
                        icon={Mail}
                        label="Email provider"
                        status={emailStatus}
                        value={email.configured ? email.provider : 'not configured'}
                        hint={
                            !email.configured
                                ? 'Welcome emails fall back to on-screen temp password'
                                : null
                        }
                    />
                    <HealthRow
                        icon={Webhook}
                        label="Razorpay webhook"
                        status={razorpayStatus}
                        value={
                            !razorpay.configured
                                ? 'not configured'
                                : razorpay.lastWebhookAt
                                    ? fmtRelative(razorpay.lastWebhookAt)
                                    : 'never received'
                        }
                        hint={
                            !razorpay.configured
                                ? 'Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET'
                                : razorpay.lastWebhookAgeHours != null && razorpay.lastWebhookAgeHours > 72
                                    ? `Last event ${razorpay.lastWebhookAgeHours}h ago — check webhook config`
                                    : null
                        }
                    />
                </ul>
            )}
        </SectionCard>
    );
};

// ─── Skeleton helpers ────────────────────────────────────────────────

const SkeletonList = ({ rows = 3 }) => (
    <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/5" />
                    <Skeleton className="h-2.5 w-2/5" />
                </div>
                <Skeleton className="h-6 w-14 rounded-full" />
            </div>
        ))}
    </div>
);

export default SuperAdminDashboard;
