import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SkeletonStatGrid, SkeletonRows } from '../../Components/Common/Skeleton';
import { Navigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    Check, X, ExternalLink, CreditCard, Download, Receipt,
    DatabaseBackup, RefreshCw, Crown, Zap, Shield, Clock,
    Users, UtensilsCrossed, LayoutGrid, GitBranch, ChevronDown, ChevronUp,
    Star, ArrowRight, AlertTriangle, Info, Sparkles,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';

/* ─── Human-readable labels ──────────────────────────────────────── */

const FEATURE_LABELS = {
    dineIn:              { label: 'Dine-In Ordering',        icon: UtensilsCrossed },
    takeaway:            { label: 'Takeaway Orders',         icon: null },
    kitchenDisplay:      { label: 'Kitchen Display (KDS)',   icon: null },
    waiterDashboard:     { label: 'Waiter Dashboard',        icon: null },
    advanceBookingTable: { label: 'Table Reservations',      icon: null },
    advanceBookingHall:  { label: 'Hall / Event Bookings',   icon: null },
    walletLoyalty:       { label: 'Wallet & Loyalty',        icon: null },
    couponPromotions:    { label: 'Coupons & Promotions',    icon: null },
    inventory:           { label: 'Inventory Management',    icon: null },
    crm:                 { label: 'Customer CRM',            icon: null },
    tipManagement:       { label: 'Tip Management',          icon: null },
    multiBranch:         { label: 'Multi-Branch Support',    icon: GitBranch },
    staffPerformance:    { label: 'Staff Performance',       icon: null },
    paymentGateway:      { label: 'Payment Gateway',         icon: null },
    customBranding:      { label: 'Custom Branding',         icon: null },
    dataExport:          { label: 'Data Export',              icon: null },
    webhooks:            { label: 'Webhooks / Integrations', icon: null },
    revenueAnalytics:    { label: 'Revenue Analytics',       icon: null },
};

const LIMIT_LABELS = {
    maxStaff:     { label: 'Staff Members',  icon: Users },
    maxTables:    { label: 'Tables',         icon: LayoutGrid },
    maxMenuItems: { label: 'Menu Items',     icon: UtensilsCrossed },
    maxBranches:  { label: 'Branches',       icon: GitBranch },
};

const BILLING_STATUS = {
    active:        { label: 'Active',                bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    trial:         { label: 'Trial',                 bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500' },
    pending:       { label: 'Pending',               bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
    // Razorpay-level statuses BEFORE the first charge lands. The card
    // status badge previously fell back to "Active" for these, which
    // misled tenants into thinking they were paid up when they were
    // really still on the optimistic feature-grant from the Super
    // Admin's assign flow (no invoice yet, Complete Payment still due).
    created:       { label: 'Awaiting Authorization', bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
    authenticated: { label: 'Setup Pending',          bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
    pending_payment:{ label: 'Payment Pending',       bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-400' },
    halted:        { label: 'Payment Halted',         bg: 'bg-rose-50',     text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500' },
    cancelled:     { label: 'Cancelled',              bg: 'bg-slate-50',    text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400' },
};

// Razorpay statuses where the user has NOT yet completed the first
// payment authorization. While here, the subscription card shows a
// "Complete Payment" CTA and the helper banner below explaining why no
// invoice exists yet.
const SETUP_PENDING_RZP_STATUSES = new Set(['created', 'authenticated', 'pending', 'pending_payment']);

// Shared dimensions for the three Subscription page tab panels
// (Available Plans / Invoices / Data Export) so they occupy the exact
// same vertical canvas. Without this, the Plans grid was ~700px tall
// while the empty Invoices / Data Export panels were ~280px, making
// the page feel like it "shrunk" when switching tabs. The min picks
// the smaller of 720px or 70% of viewport so the canvas is comfortable
// on laptops (no wasted scroll) but doesn't dwarf small screens.
const TAB_PANEL_CLASS = 'min-h-[min(720px,70vh)]';

const fmtINR = (n) => {
    if (n == null || Number.isNaN(n)) return '—';
    try {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: 'INR', maximumFractionDigits: 0,
        }).format(n);
    } catch { return `₹${n}`; }
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/* ─── Shimmer skeleton ───────────────────────────────────────────── */

const Skeleton = ({ className = '' }) => (
    <div className={`animate-pulse bg-slate-200 rounded-lg ${className}`} />
);

const LoadingSkeleton = () => (
    <div className="h-full flex flex-col pb-12 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 mt-1" />
        <Skeleton className="h-52 w-full rounded-2xl" />
        <Skeleton className="h-6 w-36 mt-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
        </div>
    </div>
);

/* ─── Trial countdown helper ─────────────────────────────────────── */

function trialInfo(trialEndDate) {
    if (!trialEndDate) return null;
    const now = new Date();
    const end = new Date(trialEndDate);
    const diffMs = end - now;
    if (diffMs <= 0) return { daysLeft: 0, pct: 100, expired: true };
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    // Rough progress: assume 14-day trial for the progress bar
    const totalDays = 14;
    const elapsed = totalDays - daysLeft;
    const pct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
    return { daysLeft, pct, expired: false };
}

/* ═══════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════ */

const SubscriptionInner = () => {
    const [upgrading, setUpgrading] = useState(null);
    const [downloadingInvoiceId, setDownloadingInvoiceId] = useState(null);
    // Plan details modal — holds the full plan object the user clicked
    // "View details" on. Replaces the old inline expand/collapse, which
    // made the cards jumpy and hid the limits + disabled-feature info.
    const [detailsPlan, setDetailsPlan] = useState(null);
    // Downgrade-request modal — opens when the user clicks Upgrade on
    // a cheaper plan (backend returns DOWNGRADE_NOT_SUPPORTED). Holds
    // the target plan they want to switch to.
    const [downgradePlan, setDowngradePlan] = useState(null);
    const [cancellingRequest, setCancellingRequest] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [activeTab, setActiveTab] = useState('plans'); // 'plans' | 'invoices' | 'export'
    // Auto-sync should run at most once per page mount when we land in
    // a setup-pending state. The ref prevents re-firing on subsequent
    // re-renders (refetch, tab switches, etc).
    const autoSyncedRef = useRef(false);

    // Subscription bundle (current plan + plan list + invoices). Three
    // calls fire in parallel inside queryFn, all _silent so a missing
    // billing setup doesn't toast every endpoint individually. The
    // legacy `load()` shim covers post-upgrade refetch sites.
    const {
        data: subscriptionData,
        isLoading: loading,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ['admin', 'subscription', 'bundle'],
        queryFn: async () => {
            try {
                const [curRes, plansRes, invRes] = await Promise.all([
                    api.get('/tenant/billing/current',  { _silent: true }),
                    api.get('/tenant/billing/plans',    { _silent: true }),
                    api.get('/tenant/billing/invoices', { _silent: true }),
                ]);
                return {
                    current: curRes.data?.data || null,
                    plans: plansRes.data?.data?.plans || [],
                    currentPlanSlug: plansRes.data?.data?.currentPlanSlug || '',
                    invoices: invRes.data?.data || [],
                };
            } catch (err) {
                toast.error(err.response?.data?.message || 'Failed to load subscription');
                return { current: null, plans: [], currentPlanSlug: '', invoices: [] };
            }
        },
        staleTime: 30_000,
    });
    const current = subscriptionData?.current ?? null;
    const plans = useMemo(() => subscriptionData?.plans ?? [], [subscriptionData?.plans]);
    const currentPlanSlug = subscriptionData?.currentPlanSlug ?? '';
    const invoices = useMemo(() => subscriptionData?.invoices ?? [], [subscriptionData?.invoices]);
    // ADM-106 follow-up — surfaces the tenant's pending downgrade
    // request (if any) so the page can render the status banner +
    // disable further upgrade buttons while a request is being
    // reviewed.
    const downgradeRequest = current?.downgradeRequest ?? null;
    // Approved + scheduled downgrade — applies at cycle end. While
    // this is set, the tenant keeps their current plan features but
    // sees a clear banner showing what the switch will be and when.
    const scheduledDowngrade = current?.scheduledDowngrade ?? null;
    // refreshing = the second-and-onwards revalidations (post-upgrade etc).
    // The first paint stays under `loading` so the skeleton renders.
    const refreshing = !loading && isFetching;
    const load = useCallback(() => { refetch() }, [refetch]);

    /* ── Sync from Razorpay (recovery path) ──────────────────────────
       Pulls authoritative subscription + payment state from Razorpay
       so missing invoices get materialised even when the webhook
       can't reach the server (local dev, blocked URL, etc). */
    const handleSync = useCallback(async ({ silent = false } = {}) => {
        if (syncing) return;
        setSyncing(true);
        try {
            const res = await api.post('/tenant/billing/sync', {}, { _silent: true });
            const created = res.data?.data?.invoicesCreated || 0;
            const applied = res.data?.data?.upgradeApplied;
            if (!silent) {
                if (created > 0 || applied) {
                    toast.success(
                        created > 0
                            ? `Synced — ${created} invoice${created > 1 ? 's' : ''} added.`
                            : 'Synced — plan activated.'
                    );
                } else {
                    toast.success('Already up to date with Razorpay.');
                }
            }
            await refetch();
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'NO_RAZORPAY_SUBSCRIPTION') {
                if (!silent) toast('No Razorpay subscription on file yet.', { icon: 'ℹ️' });
            } else if (!silent) {
                toast.error(err.response?.data?.message || 'Sync failed. Try again in a moment.');
            }
        } finally {
            setSyncing(false);
        }
    }, [syncing, refetch]);

    // Auto-sync once when the page loads in a setup-pending state. The
    // tenant clicked Complete Payment, paid on Razorpay's hosted page,
    // and came back here expecting the invoice to appear — but the
    // webhook never reached us. This single auto-sync closes that gap
    // without making them hunt for a button.
    useEffect(() => {
        if (loading || autoSyncedRef.current) return;
        const sub = subscriptionData?.current?.subscription;
        const statusKey = (sub?.razorpayStatus || sub?.status || '').toLowerCase();
        const inSetupPending = SETUP_PENDING_RZP_STATUSES.has(statusKey);
        const hasSubId = !!sub?.razorpaySubscriptionId;
        if (inSetupPending && hasSubId) {
            autoSyncedRef.current = true;
            handleSync({ silent: true });
        }
    }, [loading, subscriptionData, handleSync]);

    /* ── Downgrade-request handlers ──────────────────────────────── */

    // Called from the DowngradeRequestModal when the tenant fills in
    // a reason and clicks Submit. On success, refetches so the
    // pending-request banner shows immediately.
    const handleSubmitDowngradeRequest = useCallback(async ({ plan, reason }) => {
        try {
            await api.post('/tenant/billing/downgrade-request', {
                planId: plan._id,
                reason,
            }, { _silent: true });
            toast.success('Request submitted — our team will review it shortly.');
            setDowngradePlan(null);
            await refetch();
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'REQUEST_ALREADY_PENDING') {
                toast.error('You already have a pending plan change request. Cancel it first.');
                setDowngradePlan(null);
                await refetch();
            } else if (code === 'REASON_REQUIRED') {
                toast.error(err.response.data.message);
            } else if (code === 'SAME_PLAN') {
                toast.error("You're already on that plan.");
                setDowngradePlan(null);
            } else {
                toast.error(err.response?.data?.message || 'Failed to submit request. Please try again.');
            }
        }
    }, [refetch]);

    // Tenant withdraws their own pending request — no super admin
    // involvement, no audit complication. Re-enables the upgrade
    // buttons immediately.
    const handleCancelDowngradeRequest = useCallback(async () => {
        if (!downgradeRequest?._id || cancellingRequest) return;
        if (!window.confirm('Cancel this downgrade request? You can submit a new one anytime.')) return;
        setCancellingRequest(true);
        try {
            await api.delete(`/tenant/billing/downgrade-request/${downgradeRequest._id}`, { _silent: true });
            toast.success('Request cancelled.');
            await refetch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel request.');
        } finally {
            setCancellingRequest(false);
        }
    }, [downgradeRequest, cancellingRequest, refetch]);

    // Cancel an APPROVED, already-scheduled downgrade. Razorpay's
    // cancel_at_cycle_end can't be undone, so the warning copy is
    // deliberate — the old subscription still closes at cycle end,
    // they just won't be auto-switched to the cheaper plan when it
    // does.
    const handleCancelScheduledDowngrade = useCallback(async () => {
        if (cancellingRequest) return;
        const ok = window.confirm(
            'Cancel scheduled downgrade?\n\n'
            + 'Important: Razorpay cancellation cannot be undone. Your current '
            + 'subscription still ends at the original cycle date and you will '
            + 'need to start a fresh upgrade to keep paying. Continue?'
        );
        if (!ok) return;
        setCancellingRequest(true);
        try {
            const res = await api.post('/tenant/billing/scheduled-downgrade/cancel', {}, { _silent: true });
            toast.success(res.data?.data?.note || 'Scheduled downgrade cancelled.');
            await refetch();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel scheduled downgrade.');
        } finally {
            setCancellingRequest(false);
        }
    }, [cancellingRequest, refetch]);

    /* ── Upgrade handler ─────────────────────────────────────────── */

    const handleUpgrade = async (plan) => {
        if (upgrading) return;
        const confirmText = `Upgrade to ${plan.name} (${fmtINR(plan.price)}/${plan.billingCycle || 'month'})?\n\nYou'll be redirected to Razorpay to authorize the recurring payment.`;
        if (!window.confirm(confirmText)) return;

        setUpgrading(plan._id);
        try {
            const res = await api.post('/tenant/billing/upgrade', { planId: plan._id }, { _silent: true });
            const billing = res.data?.data?.billing;
            // shortUrl lives under pendingUpgrade / billing in the upgrade
            // response — NOT under subscription (which is the CURRENT
            // plan's snapshot and has no fresh shortUrl). Reading the
            // wrong field made the success-toast branch fire even though
            // the user still had a pending Razorpay authorization.
            const shortUrl = res.data?.data?.pendingUpgrade?.shortUrl
                          || res.data?.data?.billing?.shortUrl;

            if (billing?.fallbackOrder) {
                if (!window.Razorpay) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
                        script.onload = resolve;
                        script.onerror = () => reject(new Error('Failed to load Razorpay'));
                        document.body.appendChild(script);
                    });
                }
                toast.success('Opening payment...');
                const options = {
                    key: billing.key,
                    amount: billing.amount,
                    currency: billing.currency || 'INR',
                    name: 'BestoDine',
                    description: `Upgrade to ${plan.name}`,
                    order_id: billing.orderId,
                    // ADM-106 — confirm the charge with our backend so the
                    // SubscriptionInvoice is created even if Razorpay's
                    // payment.captured webhook can't reach the server.
                    // Webhook stays as the safety net for tab-close cases.
                    handler: async (response) => {
                        try {
                            await api.post('/tenant/billing/upgrade/verify', {
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            }, { _silent: true });
                            toast.success('Payment successful! Plan upgraded.');
                        } catch (verifyErr) {
                            const code = verifyErr.response?.data?.code;
                            if (code === 'PAYMENT_NOT_CAPTURED') {
                                toast('Payment received — invoice will appear shortly.', { icon: '⏳' });
                            } else {
                                toast.error(verifyErr.response?.data?.message || 'Payment confirmed but invoice generation failed. Please refresh in a minute.');
                            }
                        } finally {
                            await load(true);
                        }
                    },
                    modal: { ondismiss: () => toast('Payment cancelled.', { icon: '!' }) },
                    theme: { color: '#FE8301' },
                };
                new window.Razorpay(options).open();
            } else if (shortUrl) {
                toast.success('Redirecting to Razorpay to authorize payment...');
                window.open(shortUrl, '_blank', 'noopener,noreferrer');
                await load(true);
            } else {
                toast.success('Plan updated successfully!');
                await load(true);
            }
        } catch (err) {
            const data = err.response?.data;
            if (data?.code === 'BILLING_NOT_CONFIGURED') {
                toast.error('Online billing is not available right now. Contact support to upgrade.');
            } else if (data?.code === 'BILLING_SETUP_FAILED') {
                toast.error(data.message || 'Razorpay setup failed. Your plan is unchanged.');
            } else if (data?.code === 'SAME_PLAN') {
                toast.error("You're already on that plan.");
            } else if (data?.code === 'DOWNGRADE_NOT_SUPPORTED') {
                // Open the request-to-super-admin modal instead of just
                // showing an error. Tenant fills in a reason, super
                // admin reviews via the Pending Approvals queue, and on
                // approval the plan auto-switches.
                setDowngradePlan(plan);
            } else if (data?.code === 'UPGRADE_ALREADY_PENDING') {
                toast.error(data.message || 'You have a pending upgrade. Complete or cancel it first.');
            } else if (data?.code === 'DOWNGRADE_REQUEST_PENDING') {
                toast.error(data.message || 'You have a pending downgrade request. Cancel it first.');
            } else if (data?.code === 'DOWNGRADE_SCHEDULED') {
                toast.error(data.message || 'A downgrade is already scheduled. Cancel it first.');
            } else {
                toast.error(data?.message || 'Upgrade failed. Please try again.');
            }
        } finally {
            setUpgrading(null);
        }
    };

    /* ── Invoice PDF download ────────────────────────────────────── */

    const handleDownloadInvoice = async (invoice) => {
        if (downloadingInvoiceId) return;
        setDownloadingInvoiceId(invoice._id);
        try {
            const res = await api.get(`/tenant/billing/invoices/${invoice._id}/download`, { responseType: 'blob', _silent: true });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `${invoice.invoiceNumber || 'invoice'}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to download invoice');
        } finally {
            setDownloadingInvoiceId(null);
        }
    };

    /* ── Data export ─────────────────────────────────────────────── */

    const handleExport = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const res = await api.get('/tenant/export', { responseType: 'blob', _silent: true });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }));
            const a = document.createElement('a');
            a.href = url;
            const disp = res.headers?.['content-disposition'] || '';
            a.download = disp.match(/filename="?(.+?)"?$/)?.[1] || 'data-export.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Export downloaded');
        } catch (err) {
            const code = err.response?.data?.code;
            if (code === 'EXPORT_COOLDOWN') {
                toast.error(err.response.data.message || 'Please wait before exporting again.');
            } else {
                toast.error(err.response?.data?.message || 'Failed to export data');
            }
        } finally {
            setExporting(false);
        }
    };

    /* ── Derived data ────────────────────────────────────────────── */

    const sub = current?.subscription || {};
    const statusKey = (sub.razorpayStatus || sub.status || '').toLowerCase();
    const status = BILLING_STATUS[statusKey] || BILLING_STATUS.active;
    const trial = sub.status === 'trial' ? trialInfo(sub.trialEndDate) : null;

    const currentFeatures = useMemo(() => {
        if (!sub.features) return [];
        return Object.entries(sub.features)
            .map(([key, val]) => ({
                key,
                enabled: val === true || (typeof val === 'string' && val !== 'none'),
                value: val,
                ...(FEATURE_LABELS[key] || { label: key.replace(/([A-Z])/g, ' $1').trim() }),
            }))
            .sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));
    }, [sub.features]);

    const currentLimits = useMemo(() => {
        if (!sub.limits) return [];
        return Object.entries(sub.limits)
            .filter(([key]) => LIMIT_LABELS[key])
            .map(([key, val]) => ({ key, value: val, ...(LIMIT_LABELS[key]) }));
    }, [sub.limits]);

    if (loading) return <LoadingSkeleton />;

    // Match the full-width admin page pattern used by CRM / Dashboard /
    // Orders etc. AdminLayout's <main> already supplies the horizontal
    // padding (px-4 md:px-6) and the width cap (max-w-[1920px] mx-auto),
    // so we MUST NOT add another `p-4 md:p-6 max-w-6xl mx-auto` here —
    // that double-padding + 1152px cap was making the Subscription page
    // visibly narrower than every other admin tab.
    return (
        <div className="h-full flex flex-col pb-12">
            {/* ── Header ─────────────────────────────────────────── */}
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Crown size={22} className="text-[#FE8301]" />
                        Subscription & Billing
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Manage your plan, view invoices, and export data.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => handleSync()}
                        disabled={syncing}
                        title="Pull the latest subscription status and payments directly from Razorpay — use this if a recent payment isn't showing up."
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Syncing...' : 'Sync with Razorpay'}
                    </button>
                    <button
                        onClick={() => load(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </header>

            {/* ── Current Plan Card ──────────────────────────────── */}
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
                {/* Top gradient bar */}
                <div className="h-1.5 bg-linear-to-r from-[#FE8301] via-orange-400 to-amber-300" />

                <div className="p-5 md:p-6">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        {/* Left: Plan name + status */}
                        <div className="flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-bold text-slate-800">
                                    {sub.planName || 'No Plan Assigned'}
                                </h2>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${status.bg} ${status.text} ${status.border}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                                    {status.label}
                                </span>
                            </div>

                            {/* Billing dates */}
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
                                {sub.startDate && (
                                    <span className="flex items-center gap-1.5">
                                        <Clock size={13} />
                                        Started {fmtDate(sub.startDate)}
                                    </span>
                                )}
                                {sub.currentPeriodEnd && sub.status !== 'trial' && (
                                    <span className="flex items-center gap-1.5">
                                        <CreditCard size={13} />
                                        Next billing {fmtDate(sub.currentPeriodEnd)}
                                    </span>
                                )}
                                {sub.lastChargedAt && (
                                    <span className="flex items-center gap-1.5">
                                        <Receipt size={13} />
                                        Last charge {fmtDate(sub.lastChargedAt)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Pending authorization CTA */}
                        {sub.shortUrl && SETUP_PENDING_RZP_STATUSES.has(statusKey) && (
                            <a
                                href={sub.shortUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-xl transition shadow-sm"
                            >
                                <ExternalLink size={15} />
                                Complete Payment
                            </a>
                        )}
                    </div>

                    {/* Setup-pending explainer — shown when the plan was
                        assigned (features applied) but the user hasn't
                        completed Razorpay payment authorization yet.
                        Without this banner, tenants got confused why the
                        plan said "Active" but no invoice existed. */}
                    {SETUP_PENDING_RZP_STATUSES.has(statusKey) && sub.shortUrl && (
                        <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                            <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-700 leading-relaxed">
                                <p className="font-semibold text-amber-800 mb-0.5">Payment authorization pending</p>
                                Your plan features are active, but Razorpay hasn't recorded the first charge on our end yet — that's why no invoice is listed below. If you haven't paid, click <span className="font-semibold">Complete Payment</span> above. If you <em>have</em> already paid on Razorpay, click <span className="font-semibold">Sync with Razorpay</span> in the top right to pull the latest status and generate your invoice.
                            </div>
                        </div>
                    )}

                    {/* Trial countdown */}
                    {trial && !trial.expired && (
                        <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                                    <AlertTriangle size={15} />
                                    Trial Period
                                </span>
                                <span className="text-sm font-bold text-amber-700">
                                    {trial.daysLeft} day{trial.daysLeft !== 1 ? 's' : ''} remaining
                                </span>
                            </div>
                            <div className="w-full bg-amber-200 rounded-full h-2 overflow-hidden">
                                <div
                                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                                    style={{ width: `${trial.pct}%` }}
                                />
                            </div>
                            <p className="text-xs text-amber-600 mt-2">
                                Your trial ends on {fmtDate(sub.trialEndDate)}. Upgrade to a paid plan to keep all your features.
                            </p>
                        </div>
                    )}

                    {trial?.expired && (
                        <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                            <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-rose-800">Trial Expired</p>
                                <p className="text-xs text-rose-600 mt-0.5">
                                    Your trial period has ended. Please upgrade to continue using all features.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Halted warning */}
                    {statusKey === 'halted' && (
                        <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                            <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-semibold text-rose-800">Payment Halted</p>
                                <p className="text-xs text-rose-600 mt-0.5">
                                    Your recurring payment has been halted by Razorpay. Please update your payment method or contact support.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Limits summary */}
                    {currentLimits.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                            {currentLimits.map(({ key, value, label, icon: Icon }) => (
                                <div key={key} className="bg-slate-50 rounded-xl p-3 text-center">
                                    <Icon size={18} className="mx-auto text-[#FE8301] mb-1.5" />
                                    <div className="text-lg font-bold text-slate-800">
                                        {value >= 100000 ? 'Unlimited' : value.toLocaleString()}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-medium">{label}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Features grid */}
                    {currentFeatures.length > 0 && (
                        <div className="mt-5">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Your Features</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
                                {currentFeatures.map(({ key, enabled, value, label }) => (
                                    <div key={key} className="flex items-center gap-2 py-1">
                                        {enabled ? (
                                            <Check size={14} className="text-emerald-500 shrink-0" />
                                        ) : (
                                            <X size={14} className="text-slate-300 shrink-0" />
                                        )}
                                        <span className={`text-xs ${enabled ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                                            {label}
                                            {typeof value === 'string' && value !== 'none' && value !== 'true' && (
                                                <span className="ml-1 text-[10px] font-semibold text-[#FE8301] uppercase">({value})</span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Scheduled downgrade banner — shown after the Super
                Admin has approved the request. The plan switch is
                scheduled for the cycle end so the tenant doesn't lose
                money they've already paid. They keep current features
                until that date. */}
            {scheduledDowngrade && (
                <section className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                            <Clock size={18} className="text-amber-700" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-amber-900">
                                Downgrade scheduled for {fmtDate(scheduledDowngrade.effectiveAt)}
                            </p>
                            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                                Your plan switches from <span className="font-semibold">{scheduledDowngrade.fromPlanName || current?.subscription?.planName || 'your current plan'}</span> to <span className="font-semibold">{scheduledDowngrade.planName}</span> at the end of your current billing cycle. You keep all your current features until then — you've already paid for them.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleCancelScheduledDowngrade}
                        disabled={cancellingRequest}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition disabled:opacity-50"
                    >
                        <X size={13} />
                        {cancellingRequest ? 'Cancelling...' : 'Cancel Schedule'}
                    </button>
                </section>
            )}

            {/* Pending downgrade-request banner — shown when the tenant
                has submitted a request that's still awaiting Super Admin
                review. Includes a Cancel button so they can withdraw it. */}
            {downgradeRequest && (
                <section className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                            <Clock size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-blue-900">
                                Downgrade request pending review
                            </p>
                            <p className="text-xs text-blue-700 mt-0.5 leading-relaxed">
                                You requested to switch from <span className="font-semibold">{downgradeRequest.currentPlanName || 'your current plan'}</span> to <span className="font-semibold">{downgradeRequest.requestedPlanName}</span>. Our team will review and apply the change shortly.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleCancelDowngradeRequest}
                        disabled={cancellingRequest}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition disabled:opacity-50"
                    >
                        <X size={13} />
                        {cancellingRequest ? 'Cancelling...' : 'Cancel Request'}
                    </button>
                </section>
            )}

            {/* ── Tabs ───────────────────────────────────────────── */}
            <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-100 p-1 mb-6 shadow-sm w-fit">
                {[
                    { id: 'plans',    label: 'Available Plans', icon: Zap },
                    { id: 'invoices', label: 'Invoices',        icon: Receipt, count: invoices.length },
                    { id: 'export',   label: 'Data Export',     icon: DatabaseBackup },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition ${
                            activeTab === tab.id
                                ? 'bg-[#FE8301] text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <tab.icon size={15} />
                        <span className="hidden sm:inline">{tab.label}</span>
                        {tab.count > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── Available Plans ─────────────────────────────────── */}
            {/* All three tabs share the same TAB_PANEL_MIN_H so the
                page footer + surrounding chrome don't reflow when the
                user switches between a tall view (Plans grid) and
                shorter views (empty Invoices / Data Export). Combined
                with the global `scrollbar-gutter: stable` rule in
                index.css, this guarantees zero horizontal shift AND a
                consistent vertical canvas across tab switches.

                We use a viewport-relative min so the canvas grows on
                taller monitors instead of leaving a band of dead space
                at the bottom. `min(720px, 70vh)` caps the height on
                very tall screens (4K) and keeps it readable on laptops. */}
            {activeTab === 'plans' && (
                <section className={TAB_PANEL_CLASS}>
                    {plans.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center h-full flex flex-col items-center justify-center">
                            <Shield size={40} className="text-slate-300 mb-3" />
                            <p className="text-sm text-slate-500 font-medium">No plans available right now.</p>
                            <p className="text-xs text-slate-400 mt-1">Contact support if you'd like to change your plan.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {plans.map((plan, idx) => {
                                const isCurrent = plan.slug === currentPlanSlug;
                                const isFree = plan.price <= 0;
                                // A ₹0 plan in this catalog is never "free" — it's a
                                // custom-quote tier (e.g. Enterprise, seeded price: 0,
                                // "quoted individually"). We show "Custom" instead of
                                // a misleading "₹0/month" and route the CTA to sales.
                                // If a genuinely-free plan is ever introduced, gate this
                                // on an explicit plan flag rather than price alone.
                                const isCustom = plan.price <= 0;
                                // Plans arrive sorted by (sortOrder, price). The plan
                                // immediately before this one in the list is what we
                                // compare against for the "+N additional features"
                                // ribbon at the top of each card. The first/cheapest
                                // plan has no previous, so no ribbon.
                                const previousPlan = idx > 0 ? plans[idx - 1] : null;

                                const allFeatures = Object.entries(plan.features || {})
                                    .map(([key, val]) => ({
                                        key,
                                        enabled: val === true || (typeof val === 'string' && val !== 'none'),
                                        value: val,
                                        label: FEATURE_LABELS[key]?.label || key.replace(/([A-Z])/g, ' $1').trim(),
                                    }))
                                    .sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0));

                                const enabledFeatures = allFeatures.filter(f => f.enabled);
                                // Cards always show top 4 enabled features to keep the
                                // card height compact (was 6 — too tall). The modal
                                // (opened via "View full details") shows everything —
                                // included + not-included — with limits + description.
                                const visibleFeatures = enabledFeatures.slice(0, 4);
                                const hasMore = allFeatures.length > visibleFeatures.length;

                                // Features enabled in this plan but NOT enabled in the
                                // previous (cheaper) plan = "additional features over
                                // {previousPlan}". Lets the user see the upgrade value
                                // at a glance without opening every plan side by side.
                                const additionalCount = previousPlan
                                    ? enabledFeatures.filter(f => {
                                        const prev = previousPlan.features?.[f.key];
                                        return !(prev === true || (typeof prev === 'string' && prev !== 'none'));
                                    }).length
                                    : 0;

                                const planLimits = plan.limits ? Object.entries(plan.limits)
                                    .filter(([key]) => LIMIT_LABELS[key])
                                    .map(([key, val]) => ({ key, value: val, ...LIMIT_LABELS[key] }))
                                    : [];

                                return (
                                    <div
                                        key={plan._id}
                                        className={`bg-white rounded-2xl border-2 flex flex-col h-full overflow-hidden transition-all ${
                                            isCurrent
                                                ? 'border-[#FE8301] shadow-md shadow-orange-100'
                                                : 'border-slate-100 hover:border-slate-200 hover:shadow-md shadow-sm'
                                        }`}
                                    >
                                        {/* Top ribbon slot — ALWAYS rendered (even as
                                            an empty spacer) so every card's content
                                            starts at the same Y, keeping the price,
                                            limits, and features perfectly aligned
                                            across the grid row. Three variants:
                                              - Current plan → green badge
                                              - Upgrade tier → orange "+N features"
                                              - Baseline / no delta → transparent spacer */}
                                        {isCurrent ? (
                                            <div className="bg-linear-to-r from-emerald-50 via-emerald-50 to-teal-50 border-b border-emerald-100 px-3.5 py-1.5 flex items-center gap-1.5">
                                                <Star size={11} className="text-emerald-600 shrink-0" fill="currentColor" />
                                                <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider truncate">
                                                    Your Current Plan
                                                </span>
                                            </div>
                                        ) : additionalCount > 0 && previousPlan ? (
                                            <div className="bg-linear-to-r from-orange-50 via-amber-50 to-orange-50 border-b border-orange-100 px-3.5 py-1.5 flex items-center gap-1.5">
                                                <Sparkles size={11} className="text-[#FE8301] shrink-0" />
                                                <span className="text-[10px] font-semibold text-[#B45309] truncate">
                                                    +{additionalCount} {additionalCount === 1 ? 'feature' : 'features'} over {previousPlan.name}
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="h-[27px] border-b border-transparent" aria-hidden="true" />
                                        )}

                                        {/* Header (name + 2-line description). Fixed
                                            min-height on the description keeps the
                                            price baseline aligned even when a plan's
                                            description is short or absent. */}
                                        <div className="px-4 pt-4 pb-3">
                                            <h3 className="text-base font-bold text-slate-800 leading-tight">{plan.name}</h3>
                                            <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2 min-h-[28px]">
                                                {plan.description || ' '}
                                            </p>
                                        </div>

                                        {/* Price band — neutral light strip so the
                                            number anchors the eye. */}
                                        <div className="px-4 pb-3">
                                            <div className="flex items-baseline gap-1">
                                                {isCustom ? (
                                                    <>
                                                        <span className="text-[26px] font-extrabold text-slate-800 leading-none">Custom</span>
                                                        <span className="text-xs text-slate-400 font-medium">pricing</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-[26px] font-extrabold text-slate-800 leading-none">{fmtINR(plan.price)}</span>
                                                        <span className="text-xs text-slate-400 font-medium">/ {plan.billingCycle || 'month'}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Limits — always a 2×N grid so cards align
                                            row-by-row regardless of which limits a plan
                                            defines. flex-wrap was creating different
                                            heights per card. */}
                                        {planLimits.length > 0 && (
                                            <div className="px-4 pb-3">
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {planLimits.map(({ key, value, label, icon: Icon }) => (
                                                        <div key={key} className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-50 rounded-md text-[11px] text-slate-600 font-medium min-w-0">
                                                            <Icon size={11} className="text-slate-400 shrink-0" />
                                                            <span className="truncate">
                                                                <span className="font-semibold text-slate-700">{value >= 100000 ? '∞' : value}</span> {label}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Divider */}
                                        <div className="mx-4 border-t border-slate-100" />

                                        {/* Features — flex-1 so the section grows to
                                            fill remaining vertical space, pushing the
                                            CTA to the bottom of the card consistently
                                            even when cards differ in feature count. */}
                                        <div className="px-4 pt-3 pb-3 flex-1 flex flex-col">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Included</p>
                                            <ul className="space-y-1.5 flex-1">
                                                {visibleFeatures.map(({ key, value, label }) => (
                                                    <li key={key} className="flex items-start gap-1.5 text-[11.5px] leading-snug">
                                                        <Check size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                                                        <span className="text-slate-700">
                                                            {label}
                                                            {typeof value === 'string' && value !== 'none' && value !== 'true' && (
                                                                <span className="ml-1 text-[9px] font-semibold text-[#FE8301] uppercase">({value})</span>
                                                            )}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>

                                            {/* "View full details" opens a modal with all
                                                features (included + not), limits, and the
                                                full description. */}
                                            <button
                                                type="button"
                                                onClick={() => setDetailsPlan(plan)}
                                                className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#FE8301] hover:text-[#e57500] transition self-start"
                                            >
                                                <Info size={12} />
                                                {hasMore ? `View full details (${allFeatures.length})` : 'View full details'}
                                            </button>
                                        </div>

                                        {/* CTA */}
                                        <div className="p-4 pt-0">
                                            <button
                                                type="button"
                                                onClick={() => handleUpgrade(plan)}
                                                disabled={isCurrent || isFree || !!upgrading}
                                                title={
                                                    isCustom ? 'Custom-priced plan — contact sales to switch'
                                                    : isCurrent ? "You're already on this plan"
                                                    : ''
                                                }
                                                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                                                    isCurrent
                                                        ? 'bg-slate-100 text-slate-400 cursor-default'
                                                        : isFree || upgrading
                                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                        : 'bg-[#FE8301] hover:bg-[#e57500] text-white shadow-sm hover:shadow-md'
                                                }`}
                                            >
                                                {upgrading === plan._id ? (
                                                    <><RefreshCw size={14} className="animate-spin" /> Setting up...</>
                                                ) : isCurrent ? (
                                                    <><Check size={15} /> Current Plan</>
                                                ) : isCustom ? (
                                                    <>Contact Sales</>
                                                ) : (
                                                    <><ArrowRight size={15} /> Upgrade to {plan.name}</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* ── Invoices ───────────────────────────────────────── */}
            {activeTab === 'invoices' && (
                <section className={TAB_PANEL_CLASS}>
                    {invoices.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center h-full flex flex-col items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                <Receipt size={28} className="text-slate-300" />
                            </div>
                            <p className="text-base text-slate-700 font-semibold mb-1">No invoices yet</p>
                            <p className="text-sm text-slate-500 max-w-sm">Invoices will appear here automatically after your first subscription charge succeeds.</p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden md:block bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                        <tr>
                                            <th className="text-left px-5 py-3 font-semibold">Invoice #</th>
                                            <th className="text-left px-5 py-3 font-semibold">Date</th>
                                            <th className="text-left px-5 py-3 font-semibold">Plan</th>
                                            <th className="text-left px-5 py-3 font-semibold">Period</th>
                                            <th className="text-right px-5 py-3 font-semibold">Amount</th>
                                            <th className="text-center px-5 py-3 font-semibold">Status</th>
                                            <th className="text-right px-5 py-3 font-semibold"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoices.map(inv => (
                                            <tr key={inv._id} className="border-t border-slate-100 hover:bg-slate-50/50 transition">
                                                <td className="px-5 py-3.5 font-mono text-xs text-slate-700 font-medium">{inv.invoiceNumber}</td>
                                                <td className="px-5 py-3.5 text-xs text-slate-600">{fmtDate(inv.paidAt || inv.createdAt)}</td>
                                                <td className="px-5 py-3.5 text-slate-800 font-medium">{inv.planName || '—'}</td>
                                                <td className="px-5 py-3.5 text-xs text-slate-500">
                                                    {inv.periodStart && inv.periodEnd
                                                        ? `${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}`
                                                        : '—'}
                                                </td>
                                                <td className="px-5 py-3.5 text-right font-semibold text-slate-800">{fmtINR((inv.amount || 0) / 100)}</td>
                                                <td className="px-5 py-3.5 text-center">
                                                    <InvoiceStatusBadge status={inv.status} />
                                                </td>
                                                <td className="px-5 py-3.5 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadInvoice(inv)}
                                                        disabled={downloadingInvoiceId === inv._id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#FE8301] hover:text-white hover:bg-[#FE8301] border border-[#FE8301]/30 hover:border-[#FE8301] rounded-lg transition disabled:opacity-50"
                                                    >
                                                        <Download size={12} />
                                                        {downloadingInvoiceId === inv._id ? 'Downloading...' : 'PDF'}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile cards */}
                            <div className="md:hidden space-y-3">
                                {invoices.map(inv => (
                                    <div key={inv._id} className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-mono text-xs text-slate-700 font-medium">{inv.invoiceNumber}</span>
                                            <InvoiceStatusBadge status={inv.status} />
                                        </div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-semibold text-slate-800">{inv.planName || '—'}</span>
                                            <span className="text-sm font-bold text-slate-800">{fmtINR((inv.amount || 0) / 100)}</span>
                                        </div>
                                        <div className="text-xs text-slate-500 mb-3">
                                            {fmtDate(inv.paidAt || inv.createdAt)}
                                            {inv.periodStart && inv.periodEnd && (
                                                <> &middot; {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDownloadInvoice(inv)}
                                            disabled={downloadingInvoiceId === inv._id}
                                            className="w-full py-2 text-xs font-semibold text-[#FE8301] border border-[#FE8301]/30 rounded-lg hover:bg-orange-50 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                        >
                                            <Download size={12} />
                                            {downloadingInvoiceId === inv._id ? 'Downloading...' : 'Download PDF'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* ── Data Export ─────────────────────────────────────── */}
            {activeTab === 'export' && (
                <section className={`${TAB_PANEL_CLASS} bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden`}>
                    <div className="p-6 md:p-8 h-full">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-slate-100 rounded-xl shrink-0">
                                <DatabaseBackup size={24} className="text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-slate-800 mb-1">Export Your Restaurant Data</h3>
                                <p className="text-sm text-slate-500 leading-relaxed mb-4">
                                    Download a complete, structured export of your restaurant's data as a single ZIP bundle. It contains
                                    every collection — orders, menu, recipes, inventory, suppliers, purchases, staff, tables, invoices,
                                    bookings, wallets, and more — as both lossless JSON files and a ready-to-open Excel workbook
                                    (one sheet per collection). Use it for record-keeping, migration, or compliance.
                                </p>
                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleExport}
                                        disabled={exporting}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl transition disabled:opacity-50"
                                    >
                                        {exporting ? (
                                            <><RefreshCw size={15} className="animate-spin" /> Exporting...</>
                                        ) : (
                                            <><Download size={15} /> Download Full Export (ZIP)</>
                                        )}
                                    </button>
                                </div>
                                <div className="flex items-start gap-2 mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                                    <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-blue-600 leading-relaxed">
                                        This export includes all data scoped to your restaurant. No other tenant's data is included.
                                        There may be a cooldown between consecutive exports.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* ── Footer note ────────────────────────────────────── */}
            <p className="text-xs text-slate-400 mt-8 text-center">
                Payments are processed securely via Razorpay. After authorization, your new plan activates automatically within a few minutes.
            </p>

            {/* Plan details modal — full feature breakdown, limits,
                description, and primary upgrade CTA. Opened from each
                plan card's "View full details" button. */}
            {detailsPlan && (
                <PlanDetailsModal
                    plan={detailsPlan}
                    currentPlanSlug={currentPlanSlug}
                    onClose={() => setDetailsPlan(null)}
                    onUpgrade={handleUpgrade}
                    upgrading={upgrading}
                />
            )}

            {/* Downgrade-request modal — opens when the upgrade flow
                returns DOWNGRADE_NOT_SUPPORTED. Tenant explains why
                they want to downgrade, Super Admin reviews + approves. */}
            {downgradePlan && (
                <DowngradeRequestModal
                    plan={downgradePlan}
                    currentPlanName={current?.subscription?.planName || ''}
                    onClose={() => setDowngradePlan(null)}
                    onSubmit={handleSubmitDowngradeRequest}
                />
            )}
        </div>
    );
};

/* ─── Sub-components ─────────────────────────────────────────────── */

function InvoiceStatusBadge({ status }) {
    const styles = {
        paid:                'bg-emerald-50 text-emerald-700 border-emerald-200',
        refunded:            'bg-slate-50 text-slate-600 border-slate-200',
        partially_refunded:  'bg-amber-50 text-amber-700 border-amber-200',
    };
    return (
        <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${styles[status] || styles.paid}`}>
            {(status || 'paid').replace('_', ' ')}
        </span>
    );
}

/**
 * PlanDetailsModal — full-screen-feeling modal showing everything
 * about a plan: description, price, limits, every feature (grouped
 * Included / Not Included), and the primary upgrade CTA.
 *
 * Replaces the old inline "Show all features" expand/collapse on each
 * plan card. Opens via the "View full details" button. Closes on
 * backdrop click, ESC, or the X. Body scroll is locked while open.
 */
function PlanDetailsModal({ plan, currentPlanSlug, onClose, onUpgrade, upgrading }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    const isCurrent = plan.slug === currentPlanSlug;
    const isFree = plan.price <= 0;
    // ₹0 here means custom-quote (e.g. Enterprise), not free — see the
    // matching note on the plan card. Show "Custom" instead of "₹0".
    const isCustom = plan.price <= 0;

    const allFeatures = Object.entries(plan.features || {})
        .map(([key, val]) => ({
            key,
            enabled: val === true || (typeof val === 'string' && val !== 'none'),
            value: val,
            label: FEATURE_LABELS[key]?.label || key.replace(/([A-Z])/g, ' $1').trim(),
        }));
    const enabledFeatures = allFeatures.filter(f => f.enabled);
    const disabledFeatures = allFeatures.filter(f => !f.enabled);

    const planLimits = plan.limits ? Object.entries(plan.limits)
        .filter(([key]) => LIMIT_LABELS[key])
        .map(([key, val]) => ({ key, value: val, ...LIMIT_LABELS[key] }))
        : [];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={`${plan.name} plan details`}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative p-6 border-b border-slate-100 bg-linear-to-br from-orange-50 via-white to-white">
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute top-4 right-4 p-1.5 hover:bg-white rounded-lg transition"
                        aria-label="Close"
                    >
                        <X size={18} className="text-slate-500" />
                    </button>
                    <div className="flex items-start justify-between gap-4 pr-10">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <h2 className="text-2xl font-bold text-slate-800 truncate">{plan.name}</h2>
                                {isCurrent && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#FE8301] bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1 uppercase">
                                        <Star size={10} fill="currentColor" />
                                        Current Plan
                                    </span>
                                )}
                            </div>
                            {plan.description && (
                                <p className="text-sm text-slate-600 leading-relaxed">{plan.description}</p>
                            )}
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-3xl font-extrabold text-slate-800">{isCustom ? 'Custom' : fmtINR(plan.price)}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{isCustom ? 'contact sales for a quote' : `per ${plan.billingCycle || 'month'}`}</div>
                        </div>
                    </div>
                </div>

                {/* Body — scrollable */}
                <div className="overflow-y-auto px-6 py-5 space-y-6 flex-1">
                    {planLimits.length > 0 && (
                        <section>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Plan Limits</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {planLimits.map(({ key, value, label, icon: Icon }) => (
                                    <div key={key} className="bg-slate-50 rounded-xl p-4 text-center">
                                        <Icon size={20} className="mx-auto text-[#FE8301] mb-2" />
                                        <div className="text-xl font-bold text-slate-800">
                                            {value >= 100000 ? 'Unlimited' : value.toLocaleString()}
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">{label}</div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {enabledFeatures.length > 0 && (
                        <section>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100">
                                    <Check size={10} className="text-emerald-600" />
                                </span>
                                Included ({enabledFeatures.length})
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                                {enabledFeatures.map(({ key, value, label }) => (
                                    <div key={key} className="flex items-start gap-2 py-0.5">
                                        <Check size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                                        <span className="text-sm text-slate-700">
                                            {label}
                                            {typeof value === 'string' && value !== 'none' && value !== 'true' && (
                                                <span className="ml-1 text-[10px] font-semibold text-[#FE8301] uppercase">({value})</span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {disabledFeatures.length > 0 && (
                        <section>
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100">
                                    <X size={10} className="text-slate-400" />
                                </span>
                                Not Included ({disabledFeatures.length})
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                                {disabledFeatures.map(({ key, label }) => (
                                    <div key={key} className="flex items-start gap-2 py-0.5 opacity-70">
                                        <X size={16} className="text-slate-300 shrink-0 mt-0.5" />
                                        <span className="text-sm text-slate-500 line-through">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 p-4 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white rounded-xl transition"
                    >
                        Close
                    </button>
                    {isCurrent ? (
                        <div className="px-5 py-2 bg-slate-100 text-slate-500 text-sm font-semibold rounded-xl inline-flex items-center gap-2">
                            <Check size={15} />
                            Current Plan
                        </div>
                    ) : isCustom ? (
                        <div className="px-5 py-2 bg-slate-100 text-slate-500 text-sm font-semibold rounded-xl inline-flex items-center gap-2">
                            Contact Sales for a quote
                        </div>
                    ) : !isFree && (
                        <button
                            type="button"
                            onClick={() => { onClose(); onUpgrade(plan); }}
                            disabled={!!upgrading}
                            className="inline-flex items-center gap-2 px-5 py-2 bg-[#FE8301] hover:bg-[#e57500] text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 shadow-sm"
                        >
                            <ArrowRight size={15} />
                            Upgrade to {plan.name}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * DowngradeRequestModal — collects the tenant's reason for wanting
 * to switch to a cheaper plan and submits a PlanChangeRequest for
 * Super Admin review. Self-service downgrade isn't allowed because
 * it requires cancelling the old Razorpay sub + handling proration
 * / refunds — a human in the loop is the right tradeoff.
 *
 * UX:
 *   - Modal shows current plan → requested plan with a clear arrow
 *   - Reason textarea is required (min 10 chars per backend rule)
 *   - Submit is disabled while empty / under 10 chars / submitting
 *   - ESC / backdrop / Cancel all close without submitting
 */
function DowngradeRequestModal({ plan, currentPlanName, onClose, onSubmit }) {
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const MIN = 10;
    const MAX = 1000;

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose(); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose, submitting]);

    const trimmed = reason.trim();
    const canSubmit = trimmed.length >= MIN && trimmed.length <= MAX && !submitting;

    const submit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            await onSubmit({ plan, reason: trimmed });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={() => !submitting && onClose()}
            role="dialog"
            aria-modal="true"
            aria-label="Request plan downgrade"
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative p-5 border-b border-slate-100 bg-linear-to-br from-blue-50 via-white to-white">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="absolute top-4 right-4 p-1.5 hover:bg-white rounded-lg transition disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X size={18} className="text-slate-500" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-800 pr-10">Request Plan Downgrade</h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Downgrades need a quick review by our team — they involve cancelling your current billing cycle and may affect features your staff uses.
                    </p>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* From → To pill */}
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                        <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Current</div>
                            <div className="text-sm font-bold text-slate-700 truncate">{currentPlanName || '—'}</div>
                        </div>
                        <ArrowRight size={16} className="text-slate-400 shrink-0" />
                        <div className="flex-1 min-w-0 text-right">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Requested</div>
                            <div className="text-sm font-bold text-[#FE8301] truncate">{plan.name}</div>
                            <div className="text-[11px] text-slate-500">{fmtINR(plan.price)} / {plan.billingCycle || 'month'}</div>
                        </div>
                    </div>

                    {/* Reason textarea */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            Why do you want to downgrade? <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value.slice(0, MAX))}
                            placeholder="e.g. We're scaling down operations for the next quarter and need fewer staff seats and tables."
                            rows={4}
                            disabled={submitting}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:border-[#FE8301] focus:ring-2 focus:ring-orange-100 outline-none transition resize-none disabled:bg-slate-50 disabled:opacity-70"
                        />
                        <div className="flex items-center justify-between mt-1">
                            <p className="text-[11px] text-slate-500">
                                Minimum {MIN} characters. Helps our team review faster.
                            </p>
                            <p className={`text-[11px] font-medium ${
                                trimmed.length < MIN ? 'text-slate-400'
                                : trimmed.length > MAX - 50 ? 'text-amber-600' : 'text-slate-600'
                            }`}>
                                {trimmed.length} / {MAX}
                            </p>
                        </div>
                    </div>

                    {/* What happens next */}
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                        <p className="text-xs font-semibold text-blue-900 mb-1 flex items-center gap-1.5">
                            <Info size={13} />
                            What happens next
                        </p>
                        <ul className="text-[11px] text-blue-800 leading-relaxed space-y-0.5 ml-5 list-disc">
                            <li>Our team reviews your request (usually within 1 business day).</li>
                            <li>Once approved, the switch is <span className="font-semibold">scheduled for the end of your current billing cycle</span> — you keep all your current-plan features until then (you've already paid for them, so no money is lost or refunded).</li>
                            <li>Your old Razorpay subscription is cancelled at cycle end. A new subscription for the cheaper plan starts on its first invoice.</li>
                            <li>If declined, you'll see the reason here. You can submit a new request anytime.</li>
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 p-4 bg-slate-50 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-white rounded-xl transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className="inline-flex items-center gap-2 px-5 py-2 bg-[#FE8301] hover:bg-[#e57500] text-white text-sm font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        {submitting ? (
                            <><RefreshCw size={14} className="animate-spin" /> Submitting...</>
                        ) : (
                            <><Check size={15} /> Submit Request</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Owner-only wrapper. Branch-pinned Branch Admins are bounced to the
 * dashboard — the backend's `adminExclusive` middleware would 401
 * the API anyway, but this hides the page entirely for clarity.
 */
const Subscription = () => {
    const { user } = useAuth();
    if (user?.branch) return <Navigate to="/admin/dashboard" replace />;
    return <SubscriptionInner />;
};

export default Subscription;
