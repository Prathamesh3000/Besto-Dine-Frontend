import React, { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft,
    Building2,
    Activity,
    CreditCard,
    UserCog,
    PowerOff,
    Power,
    RefreshCcw,
    ExternalLink,
    Copy,
    Mail,
    Phone,
    AlertTriangle,
    Store,
    ChefHat,
    Utensils,
    ShoppingBag,
    CalendarDays,
    Save,
    MapPin,
    GitBranch,
    Check,
    X,
    UserPlus,
    Wallet,
    ArrowUpCircle,
    FileText,
    Clock,
    Globe2,
    Pencil,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import ShareLinkPanel from '../../Components/Common/ShareLinkPanel';
import { restaurantLink } from '../../utils/customerLinks';
import {
    Card,
    SectionCard,
    Badge,
    Button,
    Field,
    inputClass,
    DL,
    DLItem,
    Skeleton,
    ModalShell,
    ConfirmModal,
    PromptModal,
} from './components/ui';

/**
 * RestaurantDetail — Super Admin tenant management surface.
 *
 * Allowed actions (gated by `superadminLevel === 'full'`):
 *   - Assign a different subscription plan
 *   - Cancel an active Razorpay subscription
 *   - Resend the welcome email / regenerate temp password
 *   - Suspend / reactivate the tenant
 *
 * Reading is allowed for both 'full' and 'support' superadmins. The
 * controller never returns customer PII so this page is safe to render
 * even when impersonation has not been requested.
 */

const STATUS_TONES = {
    active: 'success',
    trial: 'warning',
    suspended: 'danger',
    past_due: 'warning',
    cancelled: 'slate',
};

const TABS = [
    { key: 'overview', label: 'Overview', icon: Building2 },
    { key: 'billing',  label: 'Billing',  icon: CreditCard },
    { key: 'branches', label: 'Branches', icon: GitBranch },
    { key: 'account',  label: 'Account',  icon: UserCog },
];

// SubscriptionInvoice amounts are stored in paise (Razorpay convention).
const fmtInvoiceAmount = (paise, currency = 'INR') => {
    const v = (Number(paise) || 0) / 100;
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);
    } catch {
        return `₹${v.toLocaleString('en-IN')}`;
    }
};
const fmtInvDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const INVOICE_TONE = { paid: 'success', refunded: 'slate', partially_refunded: 'warning' };

const RestaurantDetail = () => {
    const { id } = useParams();
    const { isFullSuperAdmin } = useAuth();
    const [data, setData] = useState(null);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [planId, setPlanId] = useState('');
    const [trialDays, setTrialDays] = useState('');
    const [suspendReason, setSuspendReason] = useState('');
    const [reactivateReason, setReactivateReason] = useState('');
    const [planChangeNote, setPlanChangeNote] = useState('');
    const [planMode, setPlanMode] = useState('apply'); // 'apply' | 'request'
    // Holds the dev-mode temp password returned by the resend-invitation
    // endpoint when no email provider is configured. When the email was
    // actually sent, this stays null and we just show a success toast.
    const [resendResult, setResendResult] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');

    // Dialog state for the branded ConfirmModal / PromptModal — replaces
    // the previous native window.confirm / window.prompt across every
    // destructive action on this page. `null` = closed; for actions that
    // need an id, the id itself = open.
    const [dlgCancelSub, setDlgCancelSub] = useState(false);
    const [dlgSuspend, setDlgSuspend] = useState(false);
    const [dlgApproveSignup, setDlgApproveSignup] = useState(false);
    const [dlgRejectSignup, setDlgRejectSignup] = useState(false);
    const [dlgPaymentConfirm, setDlgPaymentConfirm] = useState(false);
    const [dlgApprovePlan, setDlgApprovePlan] = useState(null); // requestId | null
    const [dlgRejectPlan, setDlgRejectPlan] = useState(null);   // requestId | null
    const [dlgResendInvite, setDlgResendInvite] = useState(false);

    // Business-profile edit modal — fields default to whatever's already
    // saved on the restaurant, falling back to the Main branch when the
    // restaurant-level address is still empty (legacy / self-signup
    // tenants), so the operator can confirm + persist with one click.
    const [editProfileOpen, setEditProfileOpen] = useState(false);
    const [profileForm, setProfileForm] = useState(null);

    const openEditProfile = () => {
        const restAddr = data?.address || {};
        const mainBranch = (data?.branches || []).find(b => b.slug === 'main') || {};
        const usingFallback = !(restAddr.line1 || restAddr.pincode || restAddr.state);
        const src = usingFallback
            ? {
                line1:   mainBranch.addressLine1 || '',
                line2:   mainBranch.addressLine2 || '',
                state:   mainBranch.state || '',
                pincode: mainBranch.postalCode || '',
                country: mainBranch.country || 'India',
            }
            : {
                line1:   restAddr.line1 || '',
                line2:   restAddr.line2 || '',
                state:   restAddr.state || '',
                pincode: restAddr.pincode || '',
                country: restAddr.country || 'India',
            };
        setProfileForm({
            line1:   src.line1,
            line2:   src.line2,
            city:    data?.city || mainBranch.city || '',
            state:   src.state,
            pincode: src.pincode,
            country: src.country,
            legalBusinessName: data?.legal?.legalBusinessName || '',
            fssaiLicense:      data?.legal?.fssaiLicense || '',
            gstin:             data?.legal?.gstin || '',
            pan:               data?.legal?.pan || '',
            timezone:          data?.timezone || 'Asia/Kolkata',
        });
        setEditProfileOpen(true);
    };

    const handleProfileFieldChange = (e) => {
        const { name, value } = e.target;
        setProfileForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = async (e) => {
        e?.preventDefault?.();
        if (!profileForm) return;

        // Client-side mirror of the backend regex — fail fast before round-tripping
        const f = profileForm;
        if (f.pincode && !/^[0-9]{6}$/.test(f.pincode.trim())) {
            toast.error('Pincode must be a 6-digit number');
            return;
        }
        if (f.fssaiLicense && !/^[0-9]{14}$/.test(f.fssaiLicense.trim())) {
            toast.error('FSSAI license must be a 14-digit number');
            return;
        }
        const cleanGstin = (f.gstin || '').trim().toUpperCase();
        if (cleanGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
            toast.error('GSTIN must be a valid 15-character identifier');
            return;
        }
        const cleanPan = (f.pan || '').trim().toUpperCase();
        if (cleanPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
            toast.error('PAN must be a valid 10-character identifier');
            return;
        }

        setActionLoading(true);
        try {
            await api.patch(`/superadmin/restaurants/${id}`, {
                city: (f.city || '').trim(),
                address: {
                    line1:   (f.line1 || '').trim(),
                    line2:   (f.line2 || '').trim(),
                    state:   (f.state || '').trim(),
                    pincode: (f.pincode || '').trim(),
                    country: (f.country || '').trim() || 'India',
                },
                legal: {
                    legalBusinessName: (f.legalBusinessName || '').trim(),
                    fssaiLicense:      (f.fssaiLicense || '').trim(),
                    gstin:             cleanGstin,
                    pan:               cleanPan,
                },
                timezone: (f.timezone || '').trim() || 'Asia/Kolkata',
            });
            toast.success('Business profile updated');
            setEditProfileOpen(false);
            setProfileForm(null);
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update business profile');
        } finally {
            setActionLoading(false);
        }
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [resR, resP] = await Promise.all([
                api.get(`/superadmin/restaurants/${id}`),
                api.get('/superadmin/plans'),
            ]);
            setData(resR.data?.data || null);
            setPlans(resP.data?.data || []);
            setPlanId(resR.data?.data?.subscription?.plan || '');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load restaurant');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const handleAssignPlan = async () => {
        if (!planId) return;
        setActionLoading(true);
        try {
            const res = await api.post(`/superadmin/restaurants/${id}/assign-plan`, {
                planId,
                trialDays: trialDays === '' ? undefined : Number(trialDays),
            });
            const billing = res.data?.billing;

            if (billing?.subscriptionCreated && billing.shortUrl) {
                toast.success('Plan assigned — payment link created', { duration: 5000 });
            } else if (billing?.configured && billing?.error) {
                const body = billing.hint || billing.error;
                toast(`Plan assigned, but Razorpay setup failed: ${body}`, { icon: '⚠️', duration: 10000 });
            } else {
                toast.success('Plan assigned');
            }
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to assign plan');
        } finally {
            setActionLoading(false);
        }
    };

    // Cancel-subscription is a two-step flow: the user opens the modal
    // by clicking Cancel, the modal asks whether to cancel immediately
    // or at end-of-cycle, then this body runs the API call.
    const doCancelSubscription = async (immediate) => {
        setActionLoading(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/cancel-subscription`, { immediate });
            toast.success(
                immediate
                    ? 'Subscription cancelled immediately'
                    : 'Subscription will end at the current billing cycle'
            );
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to cancel subscription');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSuspend = async () => {
        const reason = suspendReason.trim();
        if (!reason) {
            // The Suspend button is already disabled on empty reason
            // (see the button's `disabled={... || !suspendReason.trim()}`)
            // so this guard is paranoia; bail silently.
            return;
        }
        setDlgSuspend(true);
    };

    const doSuspend = async () => {
        const reason = suspendReason.trim();
        if (!reason) return;
        setActionLoading(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/suspend`, { reason });
            toast.success('Restaurant suspended');
            setSuspendReason('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to suspend restaurant');
        } finally {
            setActionLoading(false);
        }
    };

    const handleReactivate = async () => {
        const reason = reactivateReason.trim();
        if (!reason) {
            toast.error('Please enter a reactivation reason');
            return;
        }
        setActionLoading(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/reactivate`, { reason });
            toast.success('Restaurant reactivated');
            setReactivateReason('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reactivate restaurant');
        } finally {
            setActionLoading(false);
        }
    };

    // ── Pending Approvals actions ────────────────────────────────
    // The body of each action assumes the user already passed through
    // the confirmation dialog. Row buttons just open the dialog.
    const doApproveSignup = async () => {
        setActionLoading(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/approve-signup`);
            toast.success('Signup approved');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve signup');
        } finally {
            setActionLoading(false);
        }
    };

    const doRejectSignup = async (reason) => {
        setActionLoading(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/reject-signup`, { reason });
            toast.success('Signup rejected');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject signup');
        } finally {
            setActionLoading(false);
        }
    };

    const doConfirmPayment = async (note) => {
        setActionLoading(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/confirm-payment`, { note: note || '' });
            toast.success('Payment confirmed — tenant unlocked');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to confirm payment');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreatePlanChangeRequest = async () => {
        if (!planId) {
            toast.error('Please select a plan');
            return;
        }
        setActionLoading(true);
        try {
            await api.post(`/superadmin/restaurants/${id}/plan-change-request`, {
                planId,
                note: planChangeNote.trim(),
            });
            toast.success('Plan change request created');
            setPlanChangeNote('');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to create request');
        } finally {
            setActionLoading(false);
        }
    };

    const doApprovePlanChange = async (requestId) => {
        setActionLoading(true);
        try {
            await api.post(`/superadmin/plan-change-requests/${requestId}/approve`);
            toast.success('Plan change approved');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to approve');
        } finally {
            setActionLoading(false);
        }
    };

    const doRejectPlanChange = async (requestId, reason) => {
        setActionLoading(true);
        try {
            await api.post(`/superadmin/plan-change-requests/${requestId}/reject`, { reason });
            toast.success('Plan change rejected');
            load();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reject');
        } finally {
            setActionLoading(false);
        }
    };

    const doResendInvitation = async () => {
        setActionLoading(true);
        setResendResult(null);
        try {
            const res = await api.post(`/superadmin/restaurants/${id}/resend-invitation`);
            const result = res.data?.data || {};
            if (result.sent) {
                toast.success(`Invitation email sent to ${result.email}`);
                setResendResult(null);
            } else {
                setResendResult(result);
                toast('Email provider not configured — password shown below', { icon: '⚠️' });
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to resend invitation');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
                <Skeleton className="h-3 w-32 mb-6" />
                <div className="flex items-center gap-4 mb-8">
                    <Skeleton className="w-16 h-16 rounded-2xl" />
                    <div className="space-y-2 flex-1">
                        <Skeleton className="h-5 w-2/5" />
                        <Skeleton className="h-3 w-1/3" />
                    </div>
                </div>
                <div className="space-y-5">
                    {[1, 2, 3].map(i => (
                        <Card key={i} className="p-6 space-y-4">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-3/4" />
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="px-4 sm:px-6 lg:px-8 py-12 max-w-360 mx-auto text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 mb-4">
                    <Store size={24} />
                </div>
                <p className="text-gray-600 font-semibold">Restaurant not found.</p>
                <Link to="/superadmin/restaurants" className="text-sm text-[#FE8301] hover:underline mt-4 inline-block">
                    ← Back to restaurants
                </Link>
            </div>
        );
    }

    const initials = data.name?.trim().slice(0, 2).toUpperCase() || 'R';
    const tone = STATUS_TONES[data.status] || 'slate';

    // Current plan (matched against the loaded plan list) for the hero price line.
    const currentPlan = plans.find(p => p._id === data.subscription?.plan) || null;
    const planPriceLabel = currentPlan
        ? (currentPlan.price > 0 ? `₹${currentPlan.price}/${currentPlan.billingCycle}` : 'Free')
        : null;

    // Derived "attention" flags — surfaced as chips in the hero so an
    // operator sees the tenant's health without scrolling through sections.
    const attentionFlags = [];
    if (data.status === 'suspended') attentionFlags.push({ tone: 'danger', label: 'Suspended' });
    if (data.subscription?.trialEndDate) {
        const days = Math.round((new Date(data.subscription.trialEndDate).getTime() - Date.now()) / 86400000);
        if (days >= 0 && days <= 7) attentionFlags.push({ tone: 'warning', label: days === 0 ? 'Trial ends today' : `Trial ends in ${days}d` });
    }
    if (data.subscription?.razorpaySubscriptionId && !data.subscription?.currentPeriodEnd) {
        attentionFlags.push({ tone: 'warning', label: 'Awaiting first charge' });
    }
    if ((data.metrics?.orderCount30d ?? 0) === 0) attentionFlags.push({ tone: 'danger', label: 'No orders in 30d' });
    if (!data.legal?.fssaiLicense) attentionFlags.push({ tone: 'warning', label: 'FSSAI missing' });

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-360 mx-auto">
            <Link
                to="/superadmin/restaurants"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#FE8301] transition mb-5"
            >
                <ArrowLeft size={14} />
                Back to restaurants
            </Link>

            {/* ── Pending-approval banners (if any) ──────────────── */}
            {isFullSuperAdmin && data.signupStatus === 'pending' && (
                <div className="rounded-2xl border border-amber-200/70 bg-linear-to-br from-amber-50 to-orange-50/40 p-4 sm:p-5 mb-5">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                            <UserPlus size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-amber-900">Self-signup awaiting your review</div>
                            <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
                                This tenant registered via the marketing site and is locked out until you approve.
                                {data.signupNote && <> Note: <span className="italic">"{data.signupNote}"</span></>}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap mt-3">
                                <Button variant="success" icon={Check} disabled={actionLoading} onClick={() => setDlgApproveSignup(true)}>
                                    Approve signup
                                </Button>
                                <Button variant="danger" icon={X} disabled={actionLoading} onClick={() => setDlgRejectSignup(true)}>
                                    Reject
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isFullSuperAdmin && data.paymentStatus === 'pending' && (
                <div className="rounded-2xl border border-rose-200/70 bg-linear-to-br from-rose-50 to-orange-50/40 p-4 sm:p-5 mb-5">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                            <Wallet size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-rose-900">Awaiting offline payment</div>
                            <p className="text-xs text-rose-800/80 mt-1 leading-relaxed">
                                Tenant locked until you confirm cash / bank-transfer payment is received.
                                {data.paymentNote && <> Note: <span className="italic">"{data.paymentNote}"</span></>}
                            </p>
                            <div className="mt-3">
                                <Button variant="success" icon={Check} disabled={actionLoading} onClick={() => setDlgPaymentConfirm(true)}>
                                    Mark Payment Received
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isFullSuperAdmin && data.pendingPlanChange && (
                <div className="rounded-2xl border border-orange-200/70 bg-linear-to-br from-orange-50 to-amber-50/40 p-4 sm:p-5 mb-5">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white border border-orange-200 text-orange-600 flex items-center justify-center shrink-0">
                            <ArrowUpCircle size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-orange-900">Plan change awaiting approval</div>
                            <p className="text-xs text-orange-800/80 mt-1 leading-relaxed">
                                <span className="capitalize">{data.pendingPlanChange.currentPlanName || 'unassigned'}</span>
                                <span className="mx-1.5">→</span>
                                <span className="capitalize font-semibold">{data.pendingPlanChange.requestedPlanName}</span>
                                <span className="ml-1">(₹{data.pendingPlanChange.requestedPlanPrice})</span>
                                {data.pendingPlanChange.note && <> · <span className="italic">"{data.pendingPlanChange.note}"</span></>}
                            </p>
                            <div className="flex items-center gap-2 flex-wrap mt-3">
                                <Button variant="success" icon={Check} disabled={actionLoading} onClick={() => setDlgApprovePlan(data.pendingPlanChange._id)}>
                                    Approve & switch plan
                                </Button>
                                <Button variant="danger" icon={X} disabled={actionLoading} onClick={() => setDlgRejectPlan(data.pendingPlanChange._id)}>
                                    Reject
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Hero / identity card ───────────────────────────── */}
            <Card className="p-5 sm:p-6 mb-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-orange-100 to-orange-200/70 text-orange-700 font-bold text-xl flex items-center justify-center ring-1 ring-orange-200/60 shrink-0">
                        {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                                {data.name}
                            </h1>
                            <Badge tone={tone} dot>{data.status}</Badge>
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-2">
                            {data.contactEmail && (
                                <span className="inline-flex items-center gap-1.5"><Mail size={12} />{data.contactEmail}</span>
                            )}
                            {data.contactPhone && (
                                <span className="inline-flex items-center gap-1.5"><Phone size={12} />{data.contactPhone}</span>
                            )}
                            {(() => {
                                const mainBranch = (data.branches || []).find(b => b.slug === 'main') || {};
                                const city  = data.city || mainBranch.city;
                                const state = data.address?.state || mainBranch.state;
                                const label = [city, state].filter(Boolean).join(', ');
                                return label ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Building2 size={12} />{label}
                                    </span>
                                ) : null;
                            })()}
                            {planPriceLabel && (
                                <span className="inline-flex items-center gap-1.5">
                                    <CreditCard size={12} />
                                    <span className="capitalize">{currentPlan.name}</span> · {planPriceLabel}
                                </span>
                            )}
                            <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{data.slug}</span>
                        </div>

                        {/* Attention chips — at-a-glance health signals */}
                        {attentionFlags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                {attentionFlags.map(f => (
                                    <Badge key={f.label} tone={f.tone} dot>{f.label}</Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* ── Tabs ───────────────────────────────────────────── */}
            <div className="flex items-center gap-1 bg-white border border-gray-200/70 rounded-xl p-1 mb-5 overflow-x-auto">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setActiveTab(t.key)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition ${
                                active
                                    ? 'bg-[#FE8301] text-white shadow-[0_4px_12px_rgba(254,131,1,0.22)]'
                                    : 'text-gray-600 hover:bg-orange-50 hover:text-[#FE8301]'
                            }`}
                        >
                            <Icon size={15} strokeWidth={2.2} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* ═══ OVERVIEW TAB ═══ */}
            {activeTab === 'overview' && (
            <>
            {/* ── Overview & subscription summary ────────────────── */}
            <SectionCard
                title="Overview"
                subtitle="Plan, lifecycle and identifiers."
                icon={Building2}
                className="mb-5"
                actions={
                    <Link
                        to={`/superadmin/payments?search=${encodeURIComponent(data.name || '')}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition"
                    >
                        <CreditCard size={13} />
                        View payments
                    </Link>
                }
            >
                <DL columns={3}>
                    <DLItem label="Plan" value={<span className="capitalize">{data.subscription?.planName || '—'}</span>} />
                    <DLItem label="Subscription" value={<span className="capitalize">{data.subscription?.status || '—'}</span>} />
                    <DLItem
                        label="Trial ends"
                        value={data.subscription?.trialEndDate
                            ? new Date(data.subscription.trialEndDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                    />
                    <DLItem label="Slug" value={<span className="font-mono text-xs text-gray-700">{data.slug}</span>} />
                    <DLItem label="Status" value={<span className="capitalize">{data.status}</span>} />
                    <DLItem
                        label="Created"
                        value={data.createdAt
                            ? new Date(data.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                    />
                </DL>
            </SectionCard>

            {/* ── Customer link — shareable direct entry + QR ────── */}
            <SectionCard
                title="Customer link"
                subtitle="Share this link or QR so customers land directly on this restaurant, without seeing the other restaurants on the platform."
                icon={Globe2}
                className="mb-5"
                actions={!['active', 'trial'].includes(data.status)
                    ? <Badge tone="danger" dot>Not live while {data.status}</Badge>
                    : null}
            >
                <ShareLinkPanel
                    url={restaurantLink(data.slug)}
                    qrFileName={`${data.slug}-qr`}
                    note={(data.metrics?.activeBranchCount ?? 0) > 1
                        ? 'This restaurant has several branches: customers choose one after opening this link. Each branch has its own direct link on the Branches tab.'
                        : null}
                />
            </SectionCard>

            {/* ── Business profile — address, licenses, tax IDs ──── */}
            <SectionCard
                title="Business profile"
                subtitle="Registered address, regulatory licenses and tax identifiers captured at onboarding."
                icon={FileText}
                className="mb-5"
                actions={
                    <div className="flex items-center gap-2">
                        {data.legal?.fssaiLicense ? (
                            <Badge tone="success" dot>FSSAI on file</Badge>
                        ) : (
                            <Badge tone="warning" dot>FSSAI missing</Badge>
                        )}
                        {isFullSuperAdmin && (
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={Pencil}
                                onClick={openEditProfile}
                                disabled={actionLoading}
                            >
                                Edit
                            </Button>
                        )}
                    </div>
                }
            >
                {/* Registered address block */}
                <div className="rounded-xl border border-gray-200/70 bg-linear-to-br from-gray-50/70 to-white px-4 py-3.5 mb-5 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200/70 text-gray-500 flex items-center justify-center shrink-0">
                        <MapPin size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500">
                            Registered address
                        </div>
                        {(() => {
                            // Prefer the restaurant-level address (captured at
                            // onboarding in the new flow). For tenants created
                            // before that field existed, fall back to the
                            // auto-provisioned Main branch where the same data
                            // lives — so the page reflects what we actually
                            // know rather than "Not provided".
                            const restAddr = data.address || {};
                            const mainBranch = (data.branches || []).find(b => b.slug === 'main') || {};
                            const usingFallback = !(restAddr.line1 || restAddr.pincode || restAddr.state);
                            const src = usingFallback
                                ? {
                                    line1: mainBranch.addressLine1,
                                    line2: mainBranch.addressLine2,
                                    city: data.city || mainBranch.city,
                                    state: mainBranch.state,
                                    pincode: mainBranch.postalCode,
                                    country: mainBranch.country,
                                }
                                : {
                                    line1: restAddr.line1,
                                    line2: restAddr.line2,
                                    city: data.city,
                                    state: restAddr.state,
                                    pincode: restAddr.pincode,
                                    country: restAddr.country,
                                };
                            const parts = [src.line1, src.line2, src.city, src.state, src.pincode, src.country]
                                .map(s => (s || '').trim())
                                .filter(Boolean);
                            if (parts.length === 0) {
                                return (
                                    <div className="text-sm text-gray-400 italic mt-1">Not provided</div>
                                );
                            }
                            return (
                                <>
                                    <div className="text-sm text-gray-900 font-medium mt-1 leading-relaxed">
                                        {parts.join(', ')}
                                    </div>
                                    {usingFallback && (
                                        <div className="text-[11px] text-amber-600 mt-1.5 inline-flex items-center gap-1">
                                            <AlertTriangle size={11} />
                                            Inherited from Main branch — not yet saved on the restaurant profile
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>

                <DL columns={2}>
                    <DLItem
                        label="Legal business name"
                        value={data.legal?.legalBusinessName || <span className="text-gray-400 italic">Not provided</span>}
                    />
                    <DLItem
                        label="FSSAI license"
                        value={<CopyableMono value={data.legal?.fssaiLicense} />}
                    />
                    <DLItem
                        label="GSTIN"
                        value={<CopyableMono value={data.legal?.gstin} />}
                    />
                    <DLItem
                        label="PAN"
                        value={<CopyableMono value={data.legal?.pan} />}
                    />
                    <DLItem
                        label={<span className="inline-flex items-center gap-1.5"><Clock size={11} />Timezone</span>}
                        value={<span className="font-mono text-xs text-gray-700">{data.timezone || 'Asia/Kolkata'}</span>}
                    />
                    <DLItem
                        label={<span className="inline-flex items-center gap-1.5"><Globe2 size={11} />Country</span>}
                        value={
                            data.address?.country ||
                            (data.branches || []).find(b => b.slug === 'main')?.country ||
                            '—'
                        }
                    />
                </DL>
            </SectionCard>

            {/* ── Usage section ──────────────────────────────────── */}
            <SectionCard
                title="Usage"
                subtitle="Counts only — no tenant PII. Helps spot 'paid plan, no activity' or 'huge menu, no orders' misalignments."
                icon={Activity}
                className="mb-5"
                actions={
                    data.metrics?.lastOrderAt ? (
                        <span className="text-[11px] text-gray-500 inline-flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Last order {new Date(data.metrics.lastOrderAt).toLocaleString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                    ) : (
                        <Badge tone="danger" dot>No orders ever</Badge>
                    )
                }
            >
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                    <UsageStat icon={ChefHat} label="Staff accounts" value={data.metrics?.staffCount ?? 0} />
                    <UsageStat icon={Utensils} label="Menu items" value={data.metrics?.menuItemCount ?? 0} />
                    <UsageStat icon={Store} label="Tables" value={data.metrics?.tableCount ?? 0} />
                    <UsageStat icon={ShoppingBag} label="Orders (all-time)" value={data.metrics?.orderCount ?? 0} />
                    <UsageStat
                        icon={CalendarDays}
                        label="Orders (30 days)"
                        value={data.metrics?.orderCount30d ?? 0}
                        warn={(data.metrics?.orderCount30d ?? 0) === 0}
                    />
                    <UsageStat
                        icon={Activity}
                        label="Last activity"
                        value={
                            data.metrics?.lastOrderAt
                                ? `${Math.max(0, Math.round(
                                    (Date.now() - new Date(data.metrics.lastOrderAt).getTime()) / (24 * 60 * 60 * 1000)
                                ))}d ago`
                                : '—'
                        }
                    />
                </div>
            </SectionCard>

            </>
            )}

            {/* ═══ BRANCHES TAB ═══ */}
            {activeTab === 'branches' && (
            <>
            {/* ── Branches — locations this tenant has opened ────── */}
            <SectionCard
                title="Branches"
                subtitle="Every physical location this tenant has opened. Main branch is auto-provisioned during onboarding."
                icon={GitBranch}
                className="mb-5"
                actions={
                    <Badge tone="indigo" dot>
                        {data.metrics?.activeBranchCount ?? 0} active
                        {(data.metrics?.branchCount ?? 0) !== (data.metrics?.activeBranchCount ?? 0) &&
                            ` · ${data.metrics?.branchCount ?? 0} total`}
                    </Badge>
                }
            >
                {(!data.branches || data.branches.length === 0) ? (
                    <div className="text-sm text-gray-500 italic">
                        No branches found for this tenant.
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {data.branches.map(br => {
                            const addressParts = [
                                br.addressLine1,
                                br.addressLine2,
                                br.city,
                                br.state,
                                br.postalCode,
                                br.country,
                            ].map(s => (s || '').trim()).filter(Boolean);
                            const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

                            return (
                                <li
                                    key={br._id}
                                    className={`rounded-xl border p-4 transition ${
                                        br.isActive
                                            ? 'border-gray-200/70 bg-white hover:border-gray-300'
                                            : 'border-gray-200/70 bg-gray-50/60 opacity-75'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ${
                                            br.isActive
                                                ? 'bg-linear-to-br from-orange-100 to-orange-200/70 text-orange-700 ring-orange-200/60'
                                                : 'bg-gray-100 text-gray-400 ring-gray-200/60'
                                        }`}>
                                            <Building2 size={16} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-sm text-gray-900 truncate">
                                                    {br.name}
                                                </span>
                                                {br.slug === 'main' ? (
                                                    <Badge tone="warning">Main</Badge>
                                                ) : (
                                                    <span className="font-mono text-[11px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                                                        {br.slug}
                                                    </span>
                                                )}
                                                {!br.isActive && (
                                                    <Badge tone="slate">Inactive</Badge>
                                                )}
                                            </div>
                                            {fullAddress ? (
                                                <div className="text-xs text-gray-600 mt-1.5 inline-flex items-start gap-1.5">
                                                    <MapPin size={12} className="text-gray-400 shrink-0 mt-0.5" />
                                                    <span>{fullAddress}</span>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-gray-400 italic mt-1.5">
                                                    No address on file
                                                </div>
                                            )}
                                            {(br.contactPhone || br.contactEmail) && (
                                                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-gray-500 mt-1.5">
                                                    {br.contactPhone && (
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <Phone size={11} />
                                                            {br.contactPhone}
                                                        </span>
                                                    )}
                                                    {br.contactEmail && (
                                                        <span className="inline-flex items-center gap-1.5 truncate">
                                                            <Mail size={11} />
                                                            {br.contactEmail}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {/* Active branches only — the public branch list
                                                (and so the link) skips disabled ones. */}
                                            {br.isActive && (
                                                <div className="flex items-center gap-2 mt-2 min-w-0">
                                                    <span className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 shrink-0">
                                                        Customer link
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <CopyableMono value={restaurantLink(data.slug, br.slug)} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SectionCard>

            </>
            )}

            {/* ═══ BILLING TAB ═══ */}
            {activeTab === 'billing' && (
            <>
            {/* ── Subscription invoices ──────────────────────────── */}
            <SectionCard
                title="Subscription invoices"
                subtitle="Successful subscription charges billed to this tenant (most recent first)."
                icon={FileText}
                className="mb-5"
                actions={
                    <Link
                        to={`/superadmin/payments?search=${encodeURIComponent(data.name || '')}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition"
                    >
                        <CreditCard size={13} />
                        View all
                    </Link>
                }
            >
                {(!data.invoices || data.invoices.length === 0) ? (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-4 py-6 text-center">
                        <p className="text-sm text-gray-500">No subscription charges yet.</p>
                        <p className="text-xs text-gray-400 mt-1">Invoices appear here automatically after the first successful Razorpay charge.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10.5px] uppercase tracking-widest text-gray-500 border-b border-gray-100">
                                    <th className="py-2.5 pr-4 font-semibold">Invoice</th>
                                    <th className="py-2.5 pr-4 font-semibold">Plan</th>
                                    <th className="py-2.5 pr-4 font-semibold text-right">Amount</th>
                                    <th className="py-2.5 pr-4 font-semibold">Status</th>
                                    <th className="py-2.5 font-semibold">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.invoices.map(inv => (
                                    <tr key={inv._id} className="border-b border-gray-50 last:border-0">
                                        <td className="py-3 pr-4 font-mono text-xs text-gray-700">{inv.invoiceNumber}</td>
                                        <td className="py-3 pr-4 text-gray-700 capitalize">{inv.planName || '—'}</td>
                                        <td className="py-3 pr-4 text-right font-semibold text-gray-900 tabular-nums">{fmtInvoiceAmount(inv.amount, inv.currency)}</td>
                                        <td className="py-3 pr-4"><Badge tone={INVOICE_TONE[inv.status] || 'slate'} dot>{inv.status}</Badge></td>
                                        <td className="py-3 text-xs text-gray-500 tabular-nums">{fmtInvDate(inv.paidAt || inv.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            {/* ── Billing (Razorpay) — only when a sub exists ────── */}
            {data.subscription?.razorpaySubscriptionId && (
                <SectionCard
                    title="Billing (Razorpay)"
                    subtitle="Automated recurring charges via Razorpay Subscriptions."
                    icon={CreditCard}
                    className="mb-5"
                    actions={<BillingStatusBadge status={data.subscription.razorpayStatus} />}
                >
                    <DL columns={2} className="mb-5">
                        <DLItem
                            label="Subscription ID"
                            value={<span className="font-mono text-xs break-all text-gray-700">{data.subscription.razorpaySubscriptionId}</span>}
                        />
                        <DLItem
                            label="Customer ID"
                            value={<span className="font-mono text-xs break-all text-gray-700">{data.subscription.razorpayCustomerId || '—'}</span>}
                        />
                        <DLItem
                            label="Last charged"
                            value={data.subscription.lastChargedAt
                                ? new Date(data.subscription.lastChargedAt).toLocaleString('en-IN')
                                : '—'}
                        />
                        <DLItem
                            label="Next billing"
                            value={data.subscription.currentPeriodEnd
                                ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                : <span className="text-amber-600 font-semibold">Awaiting first charge</span>}
                        />
                    </DL>

                    {data.subscription.shortUrl && (
                        <div className="rounded-2xl border border-orange-200/70 bg-linear-to-br from-orange-50 to-amber-50/40 p-4 sm:p-5 mb-4">
                            <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-white border border-orange-200 text-orange-600 flex items-center justify-center shrink-0">
                                    <ExternalLink size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-orange-900">
                                        Payment authorization link
                                    </div>
                                    <p className="text-xs text-orange-800/80 mt-1 leading-relaxed">
                                        Share this link with the owner. They'll enter their card / UPI / netbanking once to authorize recurring charges.
                                    </p>
                                    <div className="flex items-center gap-2 flex-wrap mt-3">
                                        <a
                                            href={data.subscription.shortUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 bg-[#FE8301] hover:bg-[#e57601] text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-[0_4px_12px_rgba(254,131,1,0.25)] transition"
                                        >
                                            Open payment page
                                            <ExternalLink size={13} />
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(data.subscription.shortUrl);
                                                toast.success('Link copied');
                                            }}
                                            className="inline-flex items-center gap-1.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold px-3.5 py-2 rounded-lg transition"
                                        >
                                            <Copy size={12} />
                                            Copy link
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isFullSuperAdmin && (
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setDlgCancelSub(true)}
                            className="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50 underline-offset-4 hover:underline"
                        >
                            Cancel subscription
                        </button>
                    )}
                </SectionCard>
            )}

            {/* ── Subscription — one control, two modes (apply now / record request) ── */}
            {isFullSuperAdmin && (
                <SectionCard
                    title="Subscription"
                    subtitle="Change this tenant's plan — apply it immediately, or log a request to approve later (after payment) from Pending Approvals."
                    icon={CreditCard}
                    className="mb-5"
                >
                    {/* Mode toggle — replaces the old two separate cards that each
                        had their own plan dropdown (confusingly duplicated). */}
                    <div className="inline-flex items-center gap-1 bg-[#FAF5F0] border border-orange-100/70 rounded-xl p-1 mb-3">
                        <button
                            type="button"
                            onClick={() => setPlanMode('apply')}
                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${planMode === 'apply' ? 'bg-white text-[#FE8301] shadow-sm border border-orange-200' : 'text-gray-600 hover:text-[#FE8301]'}`}
                        >
                            Apply now
                        </button>
                        <button
                            type="button"
                            onClick={() => setPlanMode('request')}
                            disabled={!!data.pendingPlanChange}
                            title={data.pendingPlanChange ? 'A plan change request is already pending' : undefined}
                            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${planMode === 'request' ? 'bg-white text-[#FE8301] shadow-sm border border-orange-200' : 'text-gray-600 hover:text-[#FE8301]'}`}
                        >
                            Record request
                        </button>
                    </div>

                    <p className="text-xs text-gray-500 mb-4">
                        {planMode === 'apply'
                            ? 'Switches the plan right away — use for comps, trials and free plans. Trial days override the plan default.'
                            : "Logs the tenant's requested plan; the swap happens when you Approve it from Pending Approvals after receiving payment."}
                    </p>

                    <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                        <div className="flex-1 min-w-0">
                            <Field label="Plan">
                                <select value={planId} onChange={e => setPlanId(e.target.value)} className={inputClass}>
                                    {planMode === 'request' && <option value="">Select a plan…</option>}
                                    {plans.map(p => (
                                        <option key={p._id} value={p._id}>
                                            {p.name} — ₹{p.price}/{p.billingCycle}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        {planMode === 'apply' ? (
                            <>
                                <div className="lg:w-36">
                                    <Field label="Trial days" hint="Optional">
                                        <input type="number" min="0" value={trialDays} onChange={e => setTrialDays(e.target.value)} placeholder="0" className={inputClass} />
                                    </Field>
                                </div>
                                <Button variant="primary" icon={Save} disabled={actionLoading} onClick={handleAssignPlan}>
                                    Save plan
                                </Button>
                            </>
                        ) : (
                            <>
                                <div className="flex-1 min-w-0">
                                    <Field label="Note" hint="Optional — payment terms, timing, etc.">
                                        <input type="text" value={planChangeNote} onChange={e => setPlanChangeNote(e.target.value)} placeholder="e.g. paying via bank transfer next week" className={inputClass} />
                                    </Field>
                                </div>
                                <Button variant="primary" icon={ArrowUpCircle} disabled={actionLoading || !planId} onClick={handleCreatePlanChangeRequest}>
                                    Create request
                                </Button>
                            </>
                        )}
                    </div>

                    {data.pendingPlanChange && (
                        <p className="text-[11px] text-amber-600 mt-3 inline-flex items-center gap-1.5">
                            <AlertTriangle size={11} /> A plan change request is already pending approval (see the banner above).
                        </p>
                    )}
                </SectionCard>
            )}

            </>
            )}

            {/* ═══ ACCOUNT TAB ═══ */}
            {activeTab === 'account' && (
            <>
            {/* ── Owner account (full only) ──────────────────────── */}
            {isFullSuperAdmin && data.ownerProfile && (
                <SectionCard
                    title="Owner account"
                    subtitle="Resend the welcome email to regenerate a temporary password. The current one will be invalidated."
                    icon={UserCog}
                    className="mb-5"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-11 h-11 rounded-xl bg-linear-to-br from-[#FE8301] to-[#cc6a01] text-white text-sm font-bold flex items-center justify-center shrink-0">
                                {(data.ownerProfile.name || data.ownerProfile.email || 'O').trim().charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 truncate">
                                    {data.ownerProfile.name || '—'}
                                </div>
                                <div className="text-xs text-gray-500 truncate">{data.ownerProfile.email}</div>
                                {data.ownerProfile.mobile && (
                                    <div className="text-xs text-gray-500 truncate mt-0.5">{data.ownerProfile.mobile}</div>
                                )}
                            </div>
                        </div>
                        <Button
                            variant="brand"
                            icon={RefreshCcw}
                            disabled={actionLoading}
                            onClick={() => setDlgResendInvite(true)}
                        >
                            Resend invitation
                        </Button>
                    </div>

                    {resendResult && !resendResult.sent && resendResult.temporaryPassword && (
                        <div className="mt-5 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-amber-900">
                                        Email provider not configured — hand these credentials over manually
                                    </div>
                                    <div className="bg-white rounded-xl px-3.5 py-3 border border-amber-200 font-mono text-xs mt-3 space-y-1.5">
                                        <div><span className="text-gray-500">Email:</span> <span className="break-all text-gray-900">{resendResult.email}</span></div>
                                        <div><span className="text-gray-500">Temporary password:</span> <span className="break-all text-gray-900">{resendResult.temporaryPassword}</span></div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setResendResult(null)}
                                        className="mt-2.5 text-[11px] font-semibold text-amber-700 hover:underline"
                                    >
                                        Hide
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </SectionCard>
            )}

            {/* ── Lifecycle (full only) ──────────────────────────── */}
            {isFullSuperAdmin && (
                <SectionCard
                    title="Lifecycle"
                    subtitle={data.status === 'suspended'
                        ? 'This tenant is currently suspended. Reactivate to restore staff access.'
                        : 'Suspending will lock the tenant\'s staff out of the portal until reactivated.'}
                    icon={data.status === 'suspended' ? Power : PowerOff}
                >
                    {data.status === 'suspended' ? (
                        <div className="space-y-4">
                            <div className="rounded-xl bg-rose-50 border border-rose-200/70 px-4 py-3">
                                <div className="text-sm font-semibold text-rose-900">Suspended</div>
                                {data.suspendedReason && (
                                    <div className="text-xs text-rose-700 mt-0.5">Reason: {data.suspendedReason}</div>
                                )}
                            </div>
                            <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                                <div className="flex-1 min-w-0">
                                    <Field label="Reactivation reason" hint="Required">
                                        <input
                                            type="text"
                                            value={reactivateReason}
                                            onChange={e => setReactivateReason(e.target.value)}
                                            placeholder="e.g. payment cleared, issue resolved"
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
                                <Button
                                    variant="success"
                                    icon={Power}
                                    disabled={actionLoading || !reactivateReason.trim()}
                                    onClick={handleReactivate}
                                >
                                    Reactivate
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                            <div className="flex-1 min-w-0">
                                <Field label="Suspension reason" hint="Required">
                                    <input
                                        type="text"
                                        value={suspendReason}
                                        onChange={e => setSuspendReason(e.target.value)}
                                        placeholder="e.g. payment failure, ToS violation"
                                        className={inputClass}
                                    />
                                </Field>
                            </div>
                            <Button
                                variant="danger"
                                icon={PowerOff}
                                disabled={actionLoading || !suspendReason.trim()}
                                onClick={handleSuspend}
                            >
                                Suspend tenant
                            </Button>
                        </div>
                    )}
                </SectionCard>
            )}

            </>
            )}

            {/* ── Edit business profile modal ─────────────────────── */}
            {editProfileOpen && profileForm && (
                <ModalShell
                    open
                    onClose={() => { if (!actionLoading) { setEditProfileOpen(false); setProfileForm(null); } }}
                    title="Edit business profile"
                    subtitle="Update the registered address and regulatory identifiers for this tenant."
                    icon={FileText}
                    maxWidth="max-w-2xl"
                    footer={
                        <>
                            <Button
                                variant="ghost"
                                onClick={() => { setEditProfileOpen(false); setProfileForm(null); }}
                                disabled={actionLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                icon={Save}
                                onClick={handleSaveProfile}
                                disabled={actionLoading}
                            >
                                Save changes
                            </Button>
                        </>
                    }
                >
                    <form onSubmit={handleSaveProfile} className="px-5 sm:px-6 py-5 space-y-6">
                        <section>
                            <h3 className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
                                Registered address
                            </h3>
                            <div className="space-y-3">
                                <Field label="Address line 1">
                                    <input
                                        type="text"
                                        name="line1"
                                        value={profileForm.line1}
                                        onChange={handleProfileFieldChange}
                                        placeholder="Shop / building / street"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Address line 2" hint="Landmark, floor, area (optional)">
                                    <input
                                        type="text"
                                        name="line2"
                                        value={profileForm.line2}
                                        onChange={handleProfileFieldChange}
                                        placeholder="Near Metro Station"
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="City">
                                        <input
                                            type="text"
                                            name="city"
                                            value={profileForm.city}
                                            onChange={handleProfileFieldChange}
                                            placeholder="Mumbai"
                                            className={inputClass}
                                        />
                                    </Field>
                                    <Field label="State">
                                        <input
                                            type="text"
                                            name="state"
                                            value={profileForm.state}
                                            onChange={handleProfileFieldChange}
                                            placeholder="Maharashtra"
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="Pincode" hint="6-digit (optional)">
                                        <input
                                            type="text"
                                            name="pincode"
                                            value={profileForm.pincode}
                                            onChange={handleProfileFieldChange}
                                            placeholder="400050"
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            className={inputClass}
                                        />
                                    </Field>
                                    <Field label="Country">
                                        <input
                                            type="text"
                                            name="country"
                                            value={profileForm.country}
                                            onChange={handleProfileFieldChange}
                                            placeholder="India"
                                            className={inputClass}
                                        />
                                    </Field>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
                                Licenses & tax
                            </h3>
                            <div className="space-y-3">
                                <Field label="Legal business name" hint="Appears on invoices — may differ from brand name">
                                    <input
                                        type="text"
                                        name="legalBusinessName"
                                        value={profileForm.legalBusinessName}
                                        onChange={handleProfileFieldChange}
                                        placeholder="e.g. BestoDine Hospitality Pvt Ltd"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="FSSAI license" hint="14-digit food license number">
                                    <input
                                        type="text"
                                        name="fssaiLicense"
                                        value={profileForm.fssaiLicense}
                                        onChange={handleProfileFieldChange}
                                        placeholder="12345678901234"
                                        inputMode="numeric"
                                        pattern="[0-9]{14}"
                                        maxLength={14}
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="GSTIN" hint="15-char (optional)">
                                        <input
                                            type="text"
                                            name="gstin"
                                            value={profileForm.gstin}
                                            onChange={handleProfileFieldChange}
                                            placeholder="27AAAAA0000A1Z5"
                                            maxLength={15}
                                            className={`${inputClass} uppercase`}
                                        />
                                    </Field>
                                    <Field label="PAN" hint="10-char (optional)">
                                        <input
                                            type="text"
                                            name="pan"
                                            value={profileForm.pan}
                                            onChange={handleProfileFieldChange}
                                            placeholder="AAAAA0000A"
                                            maxLength={10}
                                            className={`${inputClass} uppercase`}
                                        />
                                    </Field>
                                </div>
                                <Field label="Timezone" hint="IANA format — used for reports & cutoffs">
                                    <input
                                        type="text"
                                        name="timezone"
                                        value={profileForm.timezone}
                                        onChange={handleProfileFieldChange}
                                        placeholder="Asia/Kolkata"
                                        className={inputClass}
                                    />
                                </Field>
                            </div>
                        </section>

                        {/* Hidden submit so Enter triggers the form's onSubmit (Save button is in the modal footer) */}
                        <button type="submit" className="hidden" />
                    </form>
                </ModalShell>
            )}

            {/* ── Branded replacements for every window.confirm / window.prompt ── */}
            {/* Cancel subscription — two confirm buttons because the choice
                matters more than yes/no (immediate vs end-of-cycle). */}
            {dlgCancelSub && (
                <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn" role="dialog" aria-modal="true">
                    <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slideUp">
                        <header className="px-5 sm:px-6 py-4 border-b border-orange-100/70">
                            <h2 className="text-base font-bold text-gray-900">Cancel subscription</h2>
                            <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                                Pick when the tenant loses access. Cancelling at end-of-cycle is the polite default —
                                they paid for that period.
                            </p>
                        </header>
                        <footer className="px-5 sm:px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 bg-[#FAF5F0]/50">
                            <button
                                type="button"
                                onClick={() => setDlgCancelSub(false)}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition"
                            >
                                Keep subscription
                            </button>
                            <button
                                type="button"
                                onClick={() => { setDlgCancelSub(false); doCancelSubscription(false); }}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#FE8301] hover:bg-[#e57601] text-white transition"
                            >
                                Cancel at end of cycle
                            </button>
                            <button
                                type="button"
                                onClick={() => { setDlgCancelSub(false); doCancelSubscription(true); }}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white transition"
                            >
                                Cancel immediately
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={dlgSuspend}
                title="Suspend this restaurant?"
                description={`Their staff will be locked out immediately. Reason captured: "${suspendReason.trim()}"`}
                confirmLabel="Suspend"
                danger
                onClose={() => setDlgSuspend(false)}
                onConfirm={doSuspend}
            />

            <ConfirmModal
                open={dlgApproveSignup}
                title="Approve this signup?"
                description="The owner will receive a welcome email and be able to log in."
                confirmLabel="Approve signup"
                onClose={() => setDlgApproveSignup(false)}
                onConfirm={doApproveSignup}
            />
            <PromptModal
                open={dlgRejectSignup}
                title="Reject this signup?"
                description="The reason is recorded in the audit log and emailed to the applicant."
                placeholder="e.g. Suspicious application details, duplicate of existing tenant"
                confirmLabel="Reject signup"
                danger
                required
                onClose={() => setDlgRejectSignup(false)}
                onConfirm={doRejectSignup}
            />

            <PromptModal
                open={dlgPaymentConfirm}
                title="Confirm payment received?"
                description="The tenant will be unlocked once you confirm. Add an optional note (payment method / reference number) so the audit log captures it."
                placeholder="e.g. UPI ref TXN12345 / Bank transfer 8 May"
                confirmLabel="Confirm payment"
                onClose={() => setDlgPaymentConfirm(false)}
                onConfirm={doConfirmPayment}
            />

            <ConfirmModal
                open={!!dlgApprovePlan}
                title="Approve this plan change?"
                description="The tenant's plan will be updated immediately."
                confirmLabel="Approve"
                onClose={() => setDlgApprovePlan(null)}
                onConfirm={() => { const id = dlgApprovePlan; setDlgApprovePlan(null); if (id) doApprovePlanChange(id); }}
            />
            <PromptModal
                open={!!dlgRejectPlan}
                title="Reject this plan change?"
                description="The reason is recorded in the audit log."
                placeholder="e.g. Payment not received, plan no longer offered"
                confirmLabel="Reject change"
                danger
                required
                onClose={() => setDlgRejectPlan(null)}
                onConfirm={(reason) => { const id = dlgRejectPlan; setDlgRejectPlan(null); if (id) doRejectPlanChange(id, reason); }}
            />

            <ConfirmModal
                open={dlgResendInvite}
                title="Resend welcome email?"
                description="This generates a new temporary password and invalidates the owner's current password. They'll need to use the new one from the email."
                confirmLabel="Resend invitation"
                danger
                onClose={() => setDlgResendInvite(false)}
                onConfirm={doResendInvitation}
            />
        </div>
    );
};

const CopyableMono = ({ value }) => {
    if (!value) {
        return <span className="text-gray-400 italic text-sm">Not provided</span>;
    }
    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        toast.success('Copied');
    };
    return (
        <button
            type="button"
            onClick={handleCopy}
            title="Click to copy"
            className="group inline-flex items-center gap-1.5 font-mono text-xs bg-gray-50 border border-gray-200/70 hover:border-[#FE8301]/40 hover:bg-orange-50/40 px-2 py-1 rounded-md text-gray-900 transition max-w-full"
        >
            <span className="truncate">{value}</span>
            <Copy size={11} className="text-gray-400 group-hover:text-[#FE8301] transition shrink-0" />
        </button>
    );
};

const UsageStat = ({ icon, label, value, warn }) => {
    const Icon = icon;
    return (
        <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200/70 flex items-center justify-center text-gray-500 shrink-0">
                <Icon size={16} />
            </div>
            <div className="min-w-0">
                <div className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500">
                    {label}
                </div>
                <div className={`text-base font-bold tabular-nums mt-0.5 ${warn ? 'text-rose-600' : 'text-gray-900'}`}>
                    {value}
                </div>
            </div>
        </div>
    );
};

const BillingStatusBadge = ({ status }) => {
    const toneMap = {
        active: 'success',
        authenticated: 'success',
        activated: 'success',
        created: 'warning',
        pending: 'warning',
        halted: 'danger',
        cancelled: 'slate',
        completed: 'slate',
    };
    return <Badge tone={toneMap[status] || 'slate'} dot>{status || 'unknown'}</Badge>;
};

export default RestaurantDetail;
