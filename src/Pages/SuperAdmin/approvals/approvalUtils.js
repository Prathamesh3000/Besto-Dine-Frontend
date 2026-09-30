// Formatting helpers shared by the Pending Approvals detail pages.
import { FEATURE_LABELS } from '../../../utils/featureLabels';

export const LIST_PATH = '/superadmin/pending-approvals';

export const fmtMoney = (n, currency = 'INR') => {
    if (n === null || n === undefined) return '—';
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
    } catch {
        return `₹${Number(n).toLocaleString('en-IN')}`;
    }
};

// SubscriptionInvoice amounts are stored in paise (Razorpay convention).
export const fmtPaise = (paise, currency = 'INR') => {
    const v = (Number(paise) || 0) / 100;
    try {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v);
    } catch {
        return `₹${v.toLocaleString('en-IN')}`;
    }
};

export const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso) =>
    iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const fmtRelative = (iso) => {
    if (!iso) return '—';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return fmtDate(iso);
};

export const waitingLabel = (days) =>
    days <= 0 ? 'waiting since today' : `waiting ${days} day${days === 1 ? '' : 's'}`;

// Strip to digits + ensure a country code for wa.me links (same rule as Leads).
export const waNumber = (phone) => {
    const d = (phone || '').replace(/[^\d]/g, '');
    return d.length === 10 ? `91${d}` : d;
};

export const featureLabel = (key) => FEATURE_LABELS[key] || key;

export const LIMIT_LABELS = {
    maxBranches: 'Branches',
    maxTables: 'Tables',
    maxStaff: 'Staff',
    maxMenuItems: 'Menu items',
    apiRateLimit: 'API requests / min',
    auditRetentionDays: 'Audit retention (days)',
};
export const limitLabel = (key) => LIMIT_LABELS[key] || key;

// 0 / missing = not capped (mirrors the backend limit checks).
export const fmtLimit = (v) => (typeof v === 'number' && v > 0 ? v.toLocaleString('en-IN') : 'Unlimited');

export const enabledFeatures = (features = {}) =>
    Object.entries(features || {})
        .filter(([k, v]) => k !== '_id' && (v === true || (typeof v === 'string' && v !== 'none' && v !== '')))
        .map(([k, v]) => ({ key: k, label: featureLabel(k), tier: typeof v === 'string' ? v : null }));

// Audit action keys → readable phrases for the activity timeline.
const ACTION_LABELS = {
    'restaurant.self_signup': 'Signed up via the website',
    'restaurant.signup_approve': 'Signup approved',
    'restaurant.signup_reject': 'Signup rejected',
    'restaurant.signup_note': 'Internal review note updated',
    'restaurant.payment_confirm': 'Offline payment confirmed',
    'restaurant.create': 'Restaurant created',
    'restaurant.update': 'Restaurant details updated',
    'restaurant.suspend': 'Restaurant suspended',
    'restaurant.reactivate': 'Restaurant reactivated',
    'restaurant.plan.assign': 'Plan assigned',
    'restaurant.subscription.cancel': 'Subscription cancelled',
    'restaurant.resend_invitation': 'Invitation re-sent',
    'restaurant.self_upgrade': 'Tenant upgraded their plan',
    'plan_change.request': 'Plan change requested',
    'plan_change.approve': 'Plan change approved',
    'plan_change.approve.scheduled': 'Downgrade scheduled',
    'plan_change.reject': 'Plan change rejected',
    'plan_change.tenant_request': 'Tenant requested a plan change',
    'plan_change.tenant_cancel': 'Tenant cancelled the plan change',
};
export const actionLabel = (action) =>
    ACTION_LABELS[action] || (action || '').replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const errorState = (err, fallback) => ({
    status: err?.response?.status || 0,
    message: err?.response?.data?.message || fallback,
});
