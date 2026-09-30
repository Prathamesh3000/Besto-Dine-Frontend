/**
 * Helpers shared by the BestoDine platform pages (Pages/Platform/*):
 * the marketing home at `/`, hotel self-signup at /register-restaurant
 * and the /request-demo page.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { publicAPI } from '../../utils/api';
import { FEATURE_LABELS } from '../../utils/featureLabels';

export const PLATFORM_TITLE = 'BestoDine — Restaurant management & QR ordering';
export const PLATFORM_DESCRIPTION =
    'BestoDine runs your restaurant end to end: QR table ordering, kitchen display, waiter & captain apps, table and hall bookings, wallet & loyalty, Razorpay payments and multi-branch management.';

/**
 * Set document.title + <meta name="description"> while a page is mounted,
 * restoring the previous values on unmount so the SPA's other pages keep
 * whatever they had.
 */
export function usePageMeta(title, description) {
    useEffect(() => {
        const prevTitle = document.title;
        let meta = document.querySelector('meta[name="description"]');
        const created = !meta;
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'description');
            document.head.appendChild(meta);
        }
        const prevDesc = meta.getAttribute('content');
        document.title = title;
        if (description) meta.setAttribute('content', description);
        return () => {
            document.title = prevTitle;
            if (created) meta.remove();
            else if (prevDesc !== null) meta.setAttribute('content', prevDesc);
        };
    }, [title, description]);
}

/** GET /public/plans → array (tolerates `{ data: [...] }` or a bare array). */
export function usePublicPlans() {
    return useQuery({
        queryKey: ['public', 'plans'],
        queryFn: async () => {
            const res = await publicAPI.getPlans();
            const body = res.data;
            const list = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
            return list;
        },
        staleTime: 10 * 60 * 1000,
        retry: 1,
    });
}

const CYCLE_LABEL = { monthly: 'month', quarterly: 'quarter', yearly: 'year' };

/** { amount: '₹1,499', per: '/ month' } or { amount: 'Free', per: '' }. */
export function formatPlanPrice(plan) {
    const price = Number(plan?.price) || 0;
    if (price <= 0) return { amount: 'Free', per: '' };
    let amount;
    try {
        amount = new Intl.NumberFormat('en-IN', {
            style: 'currency', currency: plan?.currency || 'INR', maximumFractionDigits: 0,
        }).format(price);
    } catch {
        amount = `₹${price.toLocaleString('en-IN')}`;
    }
    const cycle = CYCLE_LABEL[plan?.billingCycle] || 'month';
    return { amount, per: `/ ${cycle}` };
}

// /public/plans sends limits as { branches, tables, staff, menuItems };
// the admin-side plan documents use maxBranches etc. — accept both.
const LIMIT_LABELS = [
    ['branches', 'maxBranches', 'branch', 'branches'],
    ['tables', 'maxTables', 'table', 'tables'],
    ['staff', 'maxStaff', 'staff account', 'staff accounts'],
    ['menuItems', 'maxMenuItems', 'menu item', 'menu items'],
];

/** Human-readable bullet list for a plan card: limits first, then features. */
export function planHighlights(plan, maxFeatures = 8) {
    const out = [];
    const limits = plan?.limits || {};
    for (const [key, legacyKey, one, many] of LIMIT_LABELS) {
        const v = Number(limits[key] ?? limits[legacyKey]);
        if (!Number.isFinite(v) || v <= 0) continue;
        if (v >= 100000) out.push(`Unlimited ${many}`);
        else out.push(`Up to ${v.toLocaleString('en-IN')} ${v === 1 ? one : many}`);
    }
    const features = plan?.features;
    let names = [];
    if (Array.isArray(features)) {
        names = features.map(f => (typeof f === 'string' ? (FEATURE_LABELS[f] || f) : (f?.label || f?.name))).filter(Boolean);
    } else if (features && typeof features === 'object') {
        names = Object.entries(features)
            .filter(([, v]) => v === true || v === 'basic' || v === 'standard' || v === 'advanced')
            .map(([k, v]) => {
                const label = FEATURE_LABELS[k];
                if (!label) return null;
                return typeof v === 'string' ? `${label} (${v})` : label;
            })
            .filter(Boolean);
    }
    return [...out, ...names.slice(0, maxFeatures)];
}

/** utm_* query params → { source, medium, campaign, term, content } (present keys only) or undefined. */
export function readUtm(search = window.location.search) {
    const params = new URLSearchParams(search);
    const utm = {};
    for (const key of ['source', 'medium', 'campaign', 'term', 'content']) {
        const v = params.get(`utm_${key}`);
        if (v) utm[key] = v.slice(0, 100);
    }
    return Object.keys(utm).length ? utm : undefined;
}
