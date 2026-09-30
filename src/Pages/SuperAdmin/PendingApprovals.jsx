import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    Inbox,
    UserPlus,
    ArrowUpCircle,
    Wallet,
    Check,
    X,
    Mail,
    Phone,
    MapPin,
    ArrowUpRight,
    Clock4,
    Globe,
    User,
    Tag,
    ChevronRight,
} from 'lucide-react';
import api from '../../utils/api';
import { restaurantLink } from '../../utils/customerLinks';
import {
    PageHeader,
    SectionCard,
    Badge,
    Button,
    Skeleton,
    EmptyState,
    ConfirmModal,
    PromptModal,
} from './components/ui';

/**
 * PendingApprovals — single page surfacing every queue that needs the
 * Super Admin's attention:
 *
 *   • Self-signups        — new tenants registered via the marketing
 *                           site, awaiting first-touch approval
 *   • Plan changes        — tenant called/emailed asking to switch
 *                           plans; operator records the request and
 *                           approves it once payment is in
 *   • Payment-pending     — tenants whose paid plan is locked behind
 *                           an offline (cash / bank transfer) payment
 *
 * The three tabs share the same shell. Each row carries its own quick
 * Approve / Reject (or Confirm) actions; clicking anywhere else on a row
 * (or its "Details" button) opens the full review page under
 * /superadmin/pending-approvals/{signups|plan-changes|payments}/:id.
 * The restaurant-name link still goes to RestaurantDetail.
 */

const TABS = [
    { key: 'signups',     label: 'New Signups',      icon: UserPlus },
    { key: 'planChanges', label: 'Plan Changes',     icon: ArrowUpCircle },
    { key: 'payments',    label: 'Offline Payments', icon: Wallet },
];

const fmtMoney = (n) => {
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
    } catch {
        return `₹${(n || 0).toLocaleString('en-IN')}`;
    }
};

const fmtRelative = (iso) => {
    if (!iso) return '—';
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

const TAB_KEYS = TABS.map(t => t.key);

const PendingApprovals = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [data, setData] = useState({ signups: [], planChanges: [], paymentPending: [], counts: {} });
    const [loading, setLoading] = useState(true);
    // Active tab lives in ?tab= so "Back" from a detail page lands on
    // the same queue.
    const tabParam = searchParams.get('tab');
    const tab = TAB_KEYS.includes(tabParam) ? tabParam : 'signups';
    const setTab = (key) => setSearchParams(key === 'signups' ? {} : { tab: key }, { replace: true });
    const [busyId, setBusyId] = useState('');
    // Dialog state. Each entry holds the id of the row being acted on
    // (or null when closed). The PromptModal/ConfirmModal at the bottom
    // of the JSX consume these states. Replaces native window.prompt /
    // window.confirm so the look-and-feel matches the rest of the page.
    const [approveSignupId, setApproveSignupId] = useState(null);
    const [rejectSignupId, setRejectSignupId] = useState(null);
    const [approvePlanReqId, setApprovePlanReqId] = useState(null);
    const [rejectPlanReqId, setRejectPlanReqId] = useState(null);
    const [paymentConfirmId, setPaymentConfirmId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/superadmin/pending-approvals');
            setData(res.data?.data || { signups: [], planChanges: [], paymentPending: [], counts: {} });
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load pending approvals');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // ── Signup actions ────────────────────────────────────────────
    // The handleApprove / handleReject / handleConfirmPayment functions
    // below are the *body* of the action — they assume the user has
    // already passed through the confirmation dialog. Callers wire the
    // row buttons to `setApproveSignupId(id)` etc.; the dialogs at the
    // bottom of the JSX call back into these handlers on Confirm.

    const handleApproveSignup = async (id) => {
        setBusyId(id);
        try {
            await api.post(`/superadmin/restaurants/${id}/approve-signup`);
            toast.success('Signup approved');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve');
        } finally {
            setBusyId('');
        }
    };

    const handleRejectSignup = async (id, reason) => {
        setBusyId(id);
        try {
            await api.post(`/superadmin/restaurants/${id}/reject-signup`, { reason });
            toast.success('Signup rejected');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject');
        } finally {
            setBusyId('');
        }
    };

    // ── Plan change actions ───────────────────────────────────────
    const handleApprovePlanChange = async (requestId) => {
        setBusyId(requestId);
        try {
            await api.post(`/superadmin/plan-change-requests/${requestId}/approve`);
            toast.success('Plan change approved');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve');
        } finally {
            setBusyId('');
        }
    };

    const handleRejectPlanChange = async (requestId, reason) => {
        setBusyId(requestId);
        try {
            await api.post(`/superadmin/plan-change-requests/${requestId}/reject`, { reason });
            toast.success('Plan change rejected');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject');
        } finally {
            setBusyId('');
        }
    };

    // ── Payment confirm ───────────────────────────────────────────
    const handleConfirmPayment = async (id, note) => {
        setBusyId(id);
        try {
            await api.post(`/superadmin/restaurants/${id}/confirm-payment`, { note: note || '' });
            toast.success('Payment confirmed — tenant unlocked');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to confirm payment');
        } finally {
            setBusyId('');
        }
    };

    const counts = data.counts || {};
    const countFor = (key) => key === 'signups' ? (counts.signups || 0)
        : key === 'planChanges' ? (counts.planChanges || 0)
        : (counts.paymentPending || 0);
    const totalPending = countFor('signups') + countFor('planChanges') + countFor('payments');

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <PageHeader
                eyebrow="Operator queue"
                title="Pending Approvals"
                description="Self-signups, plan changes and offline payments waiting for your review."
                actions={
                    loading ? null : (
                        totalPending > 0
                            ? <Badge tone="warning" dot>{totalPending} awaiting review</Badge>
                            : <Badge tone="success" dot>All caught up</Badge>
                    )
                }
            />

            {/* ── Queue selector — summary cards that double as tabs ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const count = countFor(t.key);
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            aria-pressed={active}
                            className={`text-left rounded-2xl border p-4 flex items-center gap-3 transition ${
                                active
                                    ? 'border-[#FE8301] bg-orange-50/40 shadow-[0_6px_18px_rgba(254,131,1,0.14)]'
                                    : 'border-gray-200/70 bg-white hover:border-gray-300 hover:bg-gray-50/60'
                            }`}
                        >
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition ${
                                active ? 'bg-[#FE8301] text-white shadow-[0_4px_12px_rgba(254,131,1,0.28)]' : 'bg-gray-50 border border-gray-200 text-gray-500'
                            }`}>
                                <Icon size={18} strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className={`text-[11px] font-semibold uppercase tracking-wider ${active ? 'text-[#FE8301]' : 'text-gray-400'}`}>
                                    {t.label}
                                </div>
                                {loading
                                    ? <Skeleton className="h-6 w-8 mt-1" />
                                    : <div className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">{count}</div>}
                            </div>
                            {count > 0 && (
                                <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-[#FE8301]' : 'bg-orange-300'}`} />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab content ───────────────────────────────────────── */}
            {tab === 'signups' && (
                <SectionCard
                    title="Self-signups awaiting review"
                    subtitle="Hotels that registered themselves on BestoDine. Approving sends the welcome email and unlocks staff login."
                    icon={UserPlus}
                >
                    {loading ? (
                        <ListSkeleton />
                    ) : data.signups.length === 0 ? (
                        <EmptyState
                            icon={Inbox}
                            title="No pending signups"
                            description="When a new hotel registers at /register-restaurant, it'll appear here for review."
                        />
                    ) : (
                        <ul className="space-y-3">
                            {data.signups.map(s => (
                                <SignupRow
                                    key={s._id}
                                    item={s}
                                    onOpen={() => navigate(`/superadmin/pending-approvals/signups/${s._id}`)}
                                    busy={busyId === s._id}
                                    onApprove={() => setApproveSignupId(s._id)}
                                    onReject={() => setRejectSignupId(s._id)}
                                />
                            ))}
                        </ul>
                    )}
                </SectionCard>
            )}

            {tab === 'planChanges' && (
                <SectionCard
                    title="Plan change requests"
                    subtitle="Tenant has asked to switch plans — approve once you receive payment."
                    icon={ArrowUpCircle}
                >
                    {loading ? (
                        <ListSkeleton />
                    ) : data.planChanges.length === 0 ? (
                        <EmptyState
                            icon={Inbox}
                            title="No pending plan changes"
                            description="Open any restaurant's detail page to record a new plan change request on their behalf."
                        />
                    ) : (
                        <ul className="space-y-3">
                            {data.planChanges.map(p => (
                                <PlanChangeRow
                                    key={p._id}
                                    item={p}
                                    onOpen={() => navigate(`/superadmin/pending-approvals/plan-changes/${p._id}`)}
                                    busy={busyId === p._id}
                                    onApprove={() => setApprovePlanReqId(p._id)}
                                    onReject={() => setRejectPlanReqId(p._id)}
                                />
                            ))}
                        </ul>
                    )}
                </SectionCard>
            )}

            {tab === 'payments' && (
                <SectionCard
                    title="Offline payments awaiting confirmation"
                    subtitle="Tenants whose plan is locked until you confirm cash / bank-transfer payment was received."
                    icon={Wallet}
                >
                    {/* Plain-language explainer so any operator gets the flow at a glance */}
                    <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 px-4 py-3 mb-4 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                            <Wallet size={15} />
                        </div>
                        <div className="text-xs text-blue-900/90 leading-relaxed">
                            <span className="font-semibold">What is this?</span> These tenants chose a paid plan but pay <span className="font-semibold">offline</span> (cash / bank transfer / UPI), so their staff login is <span className="font-semibold">locked</span> until you confirm the money is in. Collect the amount shown, then click <span className="font-semibold">"Confirm payment & unlock"</span>.
                            <div className="mt-1 text-blue-800/70">
                                Looking for auto-charged Razorpay invoices instead? That's the <span className="font-semibold">Payments</span> page in the sidebar.
                            </div>
                        </div>
                    </div>
                    {loading ? (
                        <ListSkeleton />
                    ) : data.paymentPending.length === 0 ? (
                        <EmptyState
                            icon={Inbox}
                            title="No payment-pending tenants"
                            description="Tenants flagged 'payment pending' by the operator will appear here."
                        />
                    ) : (
                        <ul className="space-y-3">
                            {data.paymentPending.map(p => (
                                <PaymentRow
                                    key={p._id}
                                    item={p}
                                    onOpen={() => navigate(`/superadmin/pending-approvals/payments/${p._id}`)}
                                    busy={busyId === p._id}
                                    onConfirm={() => setPaymentConfirmId(p._id)}
                                />
                            ))}
                        </ul>
                    )}
                </SectionCard>
            )}

            {/* ── Branded replacements for window.confirm / window.prompt ── */}
            <ConfirmModal
                open={!!approveSignupId}
                title="Approve this signup?"
                description="The owner will receive a welcome email and be able to log in."
                confirmLabel="Approve signup"
                onClose={() => setApproveSignupId(null)}
                onConfirm={() => { const id = approveSignupId; setApproveSignupId(null); if (id) handleApproveSignup(id); }}
            />
            <PromptModal
                open={!!rejectSignupId}
                title="Reject this signup?"
                description="The reason is recorded in the audit log and emailed to the applicant."
                placeholder="e.g. Suspicious application details, duplicate of existing tenant"
                confirmLabel="Reject signup"
                danger
                required
                onClose={() => setRejectSignupId(null)}
                onConfirm={(reason) => { const id = rejectSignupId; setRejectSignupId(null); if (id) handleRejectSignup(id, reason); }}
            />
            {/* Approve dialog — copy switches based on whether the
                request is an UPGRADE (operator path / tenant-paid
                higher tier → applied immediately) or a tenant-source
                DOWNGRADE (scheduled for end of current billing cycle
                so the tenant keeps what they paid for). The backend
                makes the same determination by comparing prices — we
                preview it here so the operator isn't surprised. */}
            {(() => {
                const req = data.planChanges.find(p => p._id === approvePlanReqId);
                let title = 'Approve this plan change?';
                let description = "The tenant's plan will be updated immediately.";
                if (req) {
                    const isTenantDowngrade =
                        req.requestSource === 'tenant'
                        && typeof req.requestedPlanPrice === 'number'
                        && typeof req.currentPlanPrice === 'number'
                        && req.currentPlanPrice > 0
                        && req.requestedPlanPrice < req.currentPlanPrice;
                    if (isTenantDowngrade) {
                        title = 'Approve scheduled downgrade?';
                        description = `Their plan will switch to ${req.requestedPlanName} at the end of their current billing cycle. The old Razorpay subscription is cancelled at cycle end — no refund, no proration.`;
                    } else {
                        description = `Their plan will switch to ${req.requestedPlanName} immediately.`;
                    }
                }
                return (
                    <ConfirmModal
                        open={!!approvePlanReqId}
                        title={title}
                        description={description}
                        confirmLabel="Approve"
                        onClose={() => setApprovePlanReqId(null)}
                        onConfirm={() => { const id = approvePlanReqId; setApprovePlanReqId(null); if (id) handleApprovePlanChange(id); }}
                    />
                );
            })()}
            <PromptModal
                open={!!rejectPlanReqId}
                title="Reject this plan change?"
                description="The reason is recorded in the audit log."
                placeholder="e.g. Payment not received, plan no longer offered"
                confirmLabel="Reject change"
                danger
                required
                onClose={() => setRejectPlanReqId(null)}
                onConfirm={(reason) => { const id = rejectPlanReqId; setRejectPlanReqId(null); if (id) handleRejectPlanChange(id, reason); }}
            />
            <PromptModal
                open={!!paymentConfirmId}
                title="Confirm payment received?"
                description="The tenant will be unlocked once you confirm. Add an optional note (payment method / reference number) so the audit log captures it."
                placeholder="e.g. UPI ref TXN12345 / Bank transfer 8 May"
                confirmLabel="Confirm payment"
                onClose={() => setPaymentConfirmId(null)}
                onConfirm={(note) => { const id = paymentConfirmId; setPaymentConfirmId(null); if (id) handleConfirmPayment(id, note); }}
            />
        </div>
    );
};

// ─── Row components ──────────────────────────────────────────────────

// The whole row opens the detail page. Clicks that land on an inner
// link / button (restaurant name, web address, tel:, quick actions) are
// left alone so those keep their own behaviour.
const RowShell = ({ initials, children, onOpen, className = '' }) => {
    const handleClick = (e) => {
        if (!onOpen || e.defaultPrevented) return;
        if (e.target.closest('a, button, [data-row-ignore]')) return;
        onOpen();
    };
    const handleKeyDown = (e) => {
        if (!onOpen || e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
    };
    return (
        <li
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={onOpen ? 0 : undefined}
            className={`rounded-xl border border-gray-200/70 bg-white p-4 hover:border-[#FE8301]/40 hover:shadow-[0_6px_18px_rgba(254,131,1,0.08)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]/40 ${onOpen ? 'cursor-pointer' : ''} ${className}`}
        >
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-linear-to-br from-orange-100 to-orange-200/70 text-orange-700 font-bold flex items-center justify-center shrink-0 ring-1 ring-orange-200/60">
                    {initials}
                </div>
                {children}
            </div>
        </li>
    );
};

// Action column. stopPropagation keeps the quick actions from also
// opening the detail page.
const RowActions = ({ onOpen, children }) => (
    <div
        className="flex items-center gap-2 flex-wrap sm:flex-col sm:items-stretch shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        data-row-ignore
    >
        {children}
        <Button
            variant="ghost"
            size="sm"
            iconRight={ChevronRight}
            onClick={(e) => { e.stopPropagation(); onOpen?.(); }}
        >
            Details
        </Button>
    </div>
);

const initialsFor = (name) => (name || 'R').trim().slice(0, 2).toUpperCase();

const SignupRow = ({ item, busy, onApprove, onReject, onOpen }) => {
    // The page the hotel will get once approved (/<slug>).
    const pageUrl = item.slug ? restaurantLink(item.slug) : '';
    // Plan picked on the signup form (informational — billing isn't
    // activated until the operator assigns a plan). Older signups only
    // carry subscription.planName.
    const requestedPlan = item.requestedPlan?.name || item.requestedPlan?.planName || item.subscription?.planName || '';
    const meta = item.signupMeta || {};
    const ownerName = item.ownerName || meta.ownerName || '';
    const attribution = [meta.source, meta.utmSource, meta.utmMedium, meta.utmCampaign].filter(Boolean).join(' · ');
    return (
        <RowShell initials={initialsFor(item.name)} onOpen={onOpen}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        to={`/superadmin/restaurants/${item._id}`}
                        className="font-semibold text-sm text-gray-900 hover:text-[#FE8301] transition truncate"
                    >
                        {item.name}
                    </Link>
                    <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                        {item.slug}
                    </span>
                    <Badge tone="warning" dot>self-signup</Badge>
                </div>
                {pageUrl && (
                    <div className="text-xs mt-1.5 inline-flex items-center gap-1.5 text-gray-600 min-w-0 max-w-full">
                        <Globe size={11} className="shrink-0" />
                        <span className="text-gray-500 shrink-0">Web address:</span>
                        <a
                            href={pageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[#FE8301] hover:underline truncate"
                            title="Opens the public page (live once approved)"
                        >
                            {pageUrl.replace(/^https?:\/\//, '')}
                        </a>
                    </div>
                )}
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-1.5">
                    {ownerName && (
                        <span className="inline-flex items-center gap-1.5"><User size={11} />{ownerName}</span>
                    )}
                    {item.contactEmail && (
                        <span className="inline-flex items-center gap-1.5"><Mail size={11} />{item.contactEmail}</span>
                    )}
                    {item.contactPhone && (
                        <a href={`tel:${item.contactPhone}`} className="inline-flex items-center gap-1.5 hover:text-[#FE8301]"><Phone size={11} />{item.contactPhone}</a>
                    )}
                    {item.city && (
                        <span className="inline-flex items-center gap-1.5"><MapPin size={11} />{item.city}</span>
                    )}
                    <span className="inline-flex items-center gap-1.5"><Clock4 size={11} />{fmtRelative(item.createdAt)}</span>
                </div>
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-gray-500 mt-1.5">
                    <span>
                        Requested plan:{' '}
                        {requestedPlan
                            ? <span className="font-semibold capitalize text-gray-700">{requestedPlan}</span>
                            : <span className="italic">none chosen</span>}
                    </span>
                    {attribution && (
                        <span className="inline-flex items-center gap-1.5"><Tag size={11} />{attribution}</span>
                    )}
                </div>
                {item.signupNote && (
                    <div className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-200/70 rounded-lg px-3 py-2 italic">
                        "{item.signupNote}"
                    </div>
                )}
            </div>
            <RowActions onOpen={onOpen}>
                <Button variant="success" icon={Check} disabled={busy} onClick={(e) => { e.stopPropagation(); onApprove(); }}>Approve</Button>
                <Button variant="danger"  icon={X}     disabled={busy} onClick={(e) => { e.stopPropagation(); onReject(); }}>Reject</Button>
            </RowActions>
        </RowShell>
    );
};

const PlanChangeRow = ({ item, busy, onApprove, onReject, onOpen }) => {
    const r = item.restaurant || {};
    return (
        <RowShell initials={initialsFor(r.name)} onOpen={onOpen}>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <Link
                        to={`/superadmin/restaurants/${r._id}`}
                        className="font-semibold text-sm text-gray-900 hover:text-[#FE8301] transition truncate"
                    >
                        {r.name || '(deleted tenant)'}
                    </Link>
                    {r.slug && (
                        <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                            {r.slug}
                        </span>
                    )}
                </div>
                <div className="text-sm text-gray-700 mt-2 inline-flex items-center gap-2 flex-wrap">
                    <span className="capitalize bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {item.currentPlanName || 'unassigned'}
                    </span>
                    <ArrowUpRight size={14} className="text-gray-400" />
                    <span className="capitalize bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-xs font-semibold">
                        {item.requestedPlanName} · ₹{item.requestedPlanPrice}
                    </span>
                </div>
                {item.note && (
                    <div className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-200/70 rounded-lg px-3 py-2 italic">
                        "{item.note}"
                    </div>
                )}
                <div className="text-[11px] text-gray-500 mt-1.5 inline-flex items-center gap-1.5">
                    <Clock4 size={11} />{fmtRelative(item.createdAt)}
                    {item.requestedByEmail && <span> · by {item.requestedByEmail}</span>}
                </div>
            </div>
            <RowActions onOpen={onOpen}>
                <Button variant="success" icon={Check} disabled={busy} onClick={(e) => { e.stopPropagation(); onApprove(); }}>Approve</Button>
                <Button variant="danger"  icon={X}     disabled={busy} onClick={(e) => { e.stopPropagation(); onReject(); }}>Reject</Button>
            </RowActions>
        </RowShell>
    );
};

const PaymentRow = ({ item, busy, onConfirm, onOpen }) => (
    <RowShell initials={initialsFor(item.name)} onOpen={onOpen}>
        <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
                <Link
                    to={`/superadmin/restaurants/${item._id}`}
                    className="font-semibold text-sm text-gray-900 hover:text-[#FE8301] transition truncate"
                >
                    {item.name}
                </Link>
                <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                    {item.slug}
                </span>
                <Badge tone="danger" dot>payment pending</Badge>
            </div>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-1.5">
                {item.contactEmail && (
                    <span className="inline-flex items-center gap-1.5"><Mail size={11} />{item.contactEmail}</span>
                )}
                {item.contactPhone && (
                    <span className="inline-flex items-center gap-1.5"><Phone size={11} />{item.contactPhone}</span>
                )}
            </div>
            {/* Amount to collect — the single most useful fact for this queue */}
            <div className="flex items-center gap-2 flex-wrap mt-3">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70">Collect</span>
                    <span className="text-sm font-bold text-emerald-700 tabular-nums">
                        {item.planPrice > 0 ? `${fmtMoney(item.planPrice)}/mo` : '—'}
                    </span>
                </span>
                {item.subscription?.planName && (
                    <span className="text-[11px] text-gray-500">
                        for <span className="font-semibold capitalize">{item.subscription.planName}</span> plan
                    </span>
                )}
            </div>
            {item.paymentNote && (
                <div className="text-xs text-gray-600 mt-2 bg-gray-50 border border-gray-200/70 rounded-lg px-3 py-2 italic">
                    "{item.paymentNote}"
                </div>
            )}
        </div>
        <RowActions onOpen={onOpen}>
            <Button variant="success" icon={Check} disabled={busy} onClick={(e) => { e.stopPropagation(); onConfirm(); }}>
                Confirm payment &amp; unlock
            </Button>
        </RowActions>
    </RowShell>
);

const ListSkeleton = () => (
    <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200/70 bg-white p-4">
                <div className="flex items-start gap-3">
                    <Skeleton className="w-11 h-11 rounded-xl" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-3 w-2/5" />
                        <Skeleton className="h-2.5 w-3/5" />
                        <Skeleton className="h-2.5 w-1/3" />
                    </div>
                    <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
            </div>
        ))}
    </div>
);

export default PendingApprovals;
