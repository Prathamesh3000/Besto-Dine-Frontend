import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Receipt, Search, IndianRupee, RefreshCcw, CheckCircle2, ChevronLeft, ChevronRight, Store, Eye, Calendar, Hash, CreditCard } from 'lucide-react';
import api from '../../utils/api';
import {
    PageHeader,
    Badge,
    Button,
    Skeleton,
    EmptyState,
    TableShell,
    TH,
    TD,
    ModalShell,
    inputClass,
} from './components/ui';

/**
 * Payments — platform-wide subscription billing ledger. Lists every
 * successful Razorpay subscription charge across all tenants
 * (tenant → BestoDine), sourced from the SubscriptionInvoice model
 * via GET /superadmin/subscription-payments. Read-only.
 */

const STATUS_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'paid', label: 'Paid' },
    { key: 'partially_refunded', label: 'Part. Refunded' },
    { key: 'refunded', label: 'Refunded' },
];

const STATUS_TONE = {
    paid: 'success',
    partially_refunded: 'warning',
    refunded: 'slate',
};

const STATUS_LABEL = {
    paid: 'Paid',
    partially_refunded: 'Part. refunded',
    refunded: 'Refunded',
};

// Amounts are stored in paise (Razorpay convention) — divide by 100 for ₹.
const fmtAmount = (paise, currency = 'INR') => {
    const v = (Number(paise) || 0) / 100;
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);
    } catch {
        return `₹${v.toLocaleString('en-IN')}`;
    }
};

const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const Payments = () => {
    const [payments, setPayments] = useState([]);
    const [summary, setSummary] = useState({ totalCount: 0, paidCount: 0, refundedCount: 0, grossAmount: 0, refundedAmount: 0, currency: 'INR' });
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 25 });
    const [loading, setLoading] = useState(true);
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState('all');
    const [search, setSearch] = useState(() => searchParams.get('search') || '');
    const [page, setPage] = useState(1);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [rangeKey, setRangeKey] = useState('all');
    const [selected, setSelected] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page };
            if (status !== 'all') params.status = status;
            if (search.trim()) params.search = search.trim();
            if (from) params.from = from;
            if (to) params.to = to;
            const res = await api.get('/superadmin/subscription-payments', { params });
            const d = res.data?.data || {};
            setPayments(d.payments || []);
            setSummary(d.summary || {});
            setPagination(d.pagination || { page: 1, pages: 1, total: 0 });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load subscription payments');
        } finally {
            setLoading(false);
        }
    }, [status, search, page, from, to]);

    // Reset to page 1 whenever any filter changes.
    useEffect(() => { setPage(1); }, [status, search, from, to]);

    // Apply a preset date range. Custom keeps whatever the date inputs hold.
    const applyPreset = (key) => {
        setRangeKey(key);
        const ymd = (d) => d.toISOString().slice(0, 10);
        const now = new Date();
        if (key === 'all') { setFrom(''); setTo(''); }
        else if (key === 'month') { setFrom(ymd(new Date(now.getFullYear(), now.getMonth(), 1))); setTo(''); }
        else if (key === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); setFrom(ymd(d)); setTo(''); }
        else if (key === 'year') { setFrom(ymd(new Date(now.getFullYear(), 0, 1))); setTo(''); }
    };

    const DATE_PRESETS = [
        { key: 'all', label: 'All time' },
        { key: 'month', label: 'This month' },
        { key: '30d', label: 'Last 30 days' },
        { key: 'year', label: 'This year' },
    ];

    useEffect(() => {
        const t = setTimeout(load, search ? 350 : 0);
        return () => clearTimeout(t);
    }, [load, search]);

    const netAmount = (summary.grossAmount || 0) - (summary.refundedAmount || 0);

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Billing"
                title="Subscription Payments"
                description="Read-only record of every successful Razorpay charge across all tenants. To confirm an offline (cash / bank) payment and unlock a tenant, use Pending Approvals → Offline Payments."
                actions={
                    <Button variant="ghost" icon={RefreshCcw} onClick={load} disabled={loading}>
                        Refresh
                    </Button>
                }
            />

            {/* ── Summary cards ───────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <SummaryCard
                    icon={IndianRupee}
                    label="Net received"
                    value={fmtAmount(netAmount, summary.currency)}
                    hint={`${fmtAmount(summary.grossAmount, summary.currency)} gross · ${DATE_PRESETS.find(d => d.key === rangeKey)?.label || 'Custom range'}`}
                    tone="orange"
                />
                <SummaryCard
                    icon={CheckCircle2}
                    label="Successful charges"
                    value={String(summary.paidCount || 0)}
                    hint={`${summary.totalCount || 0} total records`}
                    tone="emerald"
                />
                <SummaryCard
                    icon={RefreshCcw}
                    label="Refunds"
                    value={String(summary.refundedCount || 0)}
                    hint={`${fmtAmount(summary.refundedAmount, summary.currency)} refunded`}
                    tone="slate"
                />
            </div>

            {/* ── Date range ──────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
                {DATE_PRESETS.map(d => {
                    const active = rangeKey === d.key;
                    return (
                        <button
                            key={d.key}
                            type="button"
                            onClick={() => applyPreset(d.key)}
                            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
                                active
                                    ? 'bg-gray-900 text-white border-gray-900'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                        >
                            <Calendar size={13} /> {d.label}
                        </button>
                    );
                })}
                <div className="flex items-center gap-2 ml-auto">
                    <input
                        type="date"
                        value={from}
                        onChange={(e) => { setFrom(e.target.value); setRangeKey('custom'); }}
                        className={`${inputClass} w-auto py-2 text-xs`}
                        aria-label="From date"
                    />
                    <span className="text-gray-400 text-xs">to</span>
                    <input
                        type="date"
                        value={to}
                        onChange={(e) => { setTo(e.target.value); setRangeKey('custom'); }}
                        className={`${inputClass} w-auto py-2 text-xs`}
                        aria-label="To date"
                    />
                </div>
            </div>

            {/* ── Filters + search ────────────────────────────────────── */}
            <div className="flex flex-col gap-3 mb-5">
                <div className="flex flex-wrap items-center gap-2">
                    {STATUS_FILTERS.map(f => {
                        const active = status === f.key;
                        return (
                            <button
                                key={f.key}
                                type="button"
                                onClick={() => setStatus(f.key)}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
                                    active
                                        ? 'bg-[#FE8301] text-white border-[#FE8301] shadow-[0_4px_12px_rgba(254,131,1,0.25)]'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
                <div className="relative max-w-sm">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search restaurant, invoice no, plan, Razorpay id…"
                        className={`${inputClass} pl-9`}
                    />
                </div>
            </div>

            {/* ── Table ───────────────────────────────────────────────── */}
            {loading ? (
                <TableShell>
                    <tbody>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <tr key={i} className="border-t border-gray-100 first:border-t-0">
                                <td className="px-5 py-4" colSpan={6}><Skeleton className="h-5 w-full" /></td>
                            </tr>
                        ))}
                    </tbody>
                </TableShell>
            ) : payments.length === 0 ? (
                <EmptyState
                    icon={Receipt}
                    title="No payments yet"
                    description="When a tenant is charged for a paid plan, the Razorpay webhook records the invoice here."
                />
            ) : (
                <>
                    <TableShell>
                        <thead>
                            <tr>
                                <TH>Invoice</TH>
                                <TH>Restaurant</TH>
                                <TH>Plan</TH>
                                <TH align="right">Amount</TH>
                                <TH>Status</TH>
                                <TH>Date</TH>
                                <TH align="right">View</TH>
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map(p => (
                                <tr
                                    key={p._id}
                                    onClick={() => setSelected(p)}
                                    className="border-t border-gray-100 hover:bg-orange-50/30 transition cursor-pointer"
                                >
                                    <TD>
                                        <span className="font-mono text-xs text-gray-700">{p.invoiceNumber}</span>
                                    </TD>
                                    <TD>
                                        <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
                                            <Store size={13} className="text-gray-400" />
                                            {p.restaurantName || '—'}
                                        </span>
                                    </TD>
                                    <TD>
                                        <span className="text-gray-700">{p.planName || '—'}</span>
                                    </TD>
                                    <TD align="right">
                                        <span className="font-semibold text-gray-900">{fmtAmount(p.amount, p.currency)}</span>
                                    </TD>
                                    <TD>
                                        <Badge tone={STATUS_TONE[p.status] || 'slate'} dot>{STATUS_LABEL[p.status] || p.status}</Badge>
                                    </TD>
                                    <TD>
                                        <span className="text-gray-600 text-xs">{fmtDate(p.paidAt || p.createdAt)}</span>
                                    </TD>
                                    <TD align="right">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setSelected(p); }}
                                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 transition"
                                            aria-label="View invoice details"
                                        >
                                            <Eye size={16} />
                                        </button>
                                    </TD>
                                </tr>
                            ))}
                        </tbody>
                    </TableShell>

                    {/* ── Pagination ──────────────────────────────────── */}
                    <div className="flex items-center justify-between mt-4">
                        <span className="text-xs text-gray-500">
                            Page {pagination.page} of {pagination.pages} · {pagination.total} payments
                        </span>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={ChevronLeft}
                                disabled={loading || page <= 1}
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                            >
                                Prev
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                iconRight={ChevronRight}
                                disabled={loading || page >= (pagination.pages || 1)}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* ── Invoice detail ──────────────────────────────────────── */}
            <InvoiceDetailModal payment={selected} onClose={() => setSelected(null)} />
        </div>
    );
};

// ─── Invoice detail modal ────────────────────────────────────────────

const DetailRow = ({ icon: Icon, label, value, mono = false }) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 shrink-0">
            {Icon && <Icon size={14} className="text-gray-400" />}
            {label}
        </span>
        <span className={`text-sm text-gray-900 text-right break-all ${mono ? 'font-mono text-xs' : 'font-medium'}`}>
            {value || '—'}
        </span>
    </div>
);

const InvoiceDetailModal = ({ payment, onClose }) => {
    if (!payment) return null;
    const p = payment;
    const period = (p.periodStart || p.periodEnd)
        ? `${fmtDate(p.periodStart)} → ${fmtDate(p.periodEnd)}`
        : '—';

    return (
        <ModalShell
            open={!!payment}
            onClose={onClose}
            title={`Invoice ${p.invoiceNumber || ''}`}
            subtitle="Platform subscription charge (tenant → BestoDine)"
            icon={Receipt}
            maxWidth="max-w-lg"
        >
            <div className="p-5 sm:p-6">
                {/* Amount + status header */}
                <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Amount</div>
                        <div className="text-2xl font-bold text-gray-900">{fmtAmount(p.amount, p.currency)}</div>
                    </div>
                    <Badge tone={STATUS_TONE[p.status] || 'slate'} dot>{STATUS_LABEL[p.status] || p.status}</Badge>
                </div>

                <div className="rounded-xl border border-gray-200/70 bg-gray-50/50 px-4">
                    <DetailRow icon={Hash} label="Invoice number" value={p.invoiceNumber} mono />
                    <DetailRow icon={Store} label="Restaurant" value={p.restaurantName} />
                    <DetailRow icon={CreditCard} label="Plan" value={p.planName} />
                    <DetailRow icon={Calendar} label="Billing period" value={period} />
                    <DetailRow icon={Calendar} label="Paid at" value={fmtDateTime(p.paidAt)} />
                    <DetailRow icon={Calendar} label="Recorded" value={fmtDateTime(p.createdAt)} />
                    <DetailRow icon={Hash} label="Razorpay payment ID" value={p.razorpayPaymentId} mono />
                    <DetailRow icon={Hash} label="Razorpay subscription ID" value={p.razorpaySubscriptionId} mono />
                </div>
            </div>
        </ModalShell>
    );
};

const TONE_CLASS = {
    orange: 'bg-orange-50 border-orange-100 text-[#FE8301]',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    slate: 'bg-gray-50 border-gray-200 text-gray-500',
};

const SummaryCard = ({ icon, label, value, hint, tone = 'orange' }) => {
    const Icon = icon;
    return (
        <div className="rounded-2xl border border-gray-200/70 bg-white p-5 flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${TONE_CLASS[tone]}`}>
                <Icon size={20} strokeWidth={2} />
            </div>
            <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
                <div className="text-xl font-bold text-gray-900 mt-0.5 truncate">{value}</div>
                {hint && <div className="text-[11px] text-gray-500 mt-0.5 truncate">{hint}</div>}
            </div>
        </div>
    );
};

export default Payments;
