import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Receipt, Check } from 'lucide-react';
import api from '../../../utils/api';
import { Button, Field, inputClass, ModalShell } from './ui';
import { validateCyclePrices, monthlyEquivalent, savingsPct, formatINR, DEFAULT_GST_RATE } from '../../../utils/billingCycles';

/**
 * PlanFormModal — create or edit a SubscriptionPlan from the
 * Super Admin portal.
 *
 * Props:
 *   plan      — when present, modal opens in edit mode
 *   onClose   — closes the modal
 *   onSaved   — called with the updated plan after a successful save
 *
 * Slug rules:
 *   - On create, the slug is editable and required.
 *   - On edit, the slug is intentionally read-only — every existing
 *     tenant carries a snapshot of the plan including its slug, so
 *     renaming would create historical drift.
 *
 * Field set must mirror Backend/models/subscriptionPlan.js. Adding a
 * new feature key there means adding it to FEATURE_FIELDS below.
 */

// Boolean feature toggles. Order matches the SUPER_ADMIN_ARCHITECTURE
// pricing table for visual parity.
const FEATURE_FIELDS = [
    { key: 'dineIn',              label: 'Dine-in Ordering (QR)',      group: 'Core' },
    { key: 'takeaway',            label: 'Takeaway Ordering',          group: 'Core' },
    { key: 'kitchenDisplay',      label: 'Kitchen Display (Chef)',     group: 'Core' },
    { key: 'waiterDashboard',     label: 'Waiter Dashboard',           group: 'Core' },
    { key: 'advanceBookingTable', label: 'Advance Booking — Table',    group: 'Advanced' },
    { key: 'advanceBookingHall',  label: 'Advance Booking — Hall',     group: 'Advanced' },
    { key: 'walletLoyalty',       label: 'Wallet & Loyalty Points',    group: 'Advanced' },
    { key: 'couponPromotions',    label: 'Coupon & Promotion Engine',  group: 'Advanced' },
    { key: 'campaigns',           label: 'WhatsApp / SMS Campaigns',   group: 'Advanced' },
    { key: 'inventory',           label: 'Inventory Management',       group: 'Advanced' },
    { key: 'crm',                 label: 'CRM (Customer Mgmt)',        group: 'Advanced' },
    { key: 'tipManagement',       label: 'Tip Management',             group: 'Advanced' },
    { key: 'multiBranch',         label: 'Multi-Branch Support',       group: 'Management' },
    { key: 'staffPerformance',    label: 'Staff Performance Metrics',  group: 'Management' },
    { key: 'paymentGateway',      label: 'Payment Gateway (Razorpay)', group: 'Management' },
    { key: 'kiosk',               label: 'Self-Order Kiosk',           group: 'Management' },
    { key: 'incentives',          label: 'Staff Incentives',           group: 'Management' },
    { key: 'dataExport',          label: 'Data Export (CSV)',          group: 'Technical' },
    { key: 'accountingExport',    label: 'Tally / Accounting Export',  group: 'Technical' },
    { key: 'aggregatorOrders',    label: 'Zomato / Swiggy Orders',     group: 'Technical' },
    { key: 'eInvoice',            label: 'GST e-Invoice (IRN)',        group: 'Technical' },
    { key: 'webhooks',            label: 'Webhook Integrations',       group: 'Technical' },
    { key: 'publicApi',           label: 'API Keys & Webhooks',        group: 'Technical' },
    { key: 'whiteLabelBranding',  label: 'Own Branding (white-label)', group: 'Technical' },
];

const REVENUE_ANALYTICS_TIERS = [
    { value: 'none',     label: 'None' },
    { value: 'basic',    label: 'Basic' },
    { value: 'standard', label: 'Standard' },
    { value: 'advanced', label: 'Advanced' },
];

const BILLING_CYCLES = [
    { value: 'monthly',   label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly',    label: 'Yearly' },
];

// Card / catalogue limits — mirror routes/superadminRoute.js planFieldChains.
const BADGE_MAX = 40;
const HIGHLIGHTS_MAX = 8;
const HIGHLIGHT_MAX_LEN = 120;
const TRIAL_DAYS_MAX = 3650;
const DEFAULT_TRIAL_DAYS = 14;

/** Textarea (one per line) → highlights array: trimmed, blanks dropped. */
function parseHighlights(text = '') {
    return String(text)
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
}

const EMPTY_PLAN = {
    name: '',
    slug: '',
    description: '',
    price: 0,
    annualPrice: '',
    biennialPrice: '',
    billingCycle: 'monthly',
    // Tier rank is REQUIRED on create and 0 is a valid value, so the blank
    // string (not 0) is the "not filled in" state.
    tier: '',
    trialEnabled: false,
    trialDurationDays: DEFAULT_TRIAL_DAYS,
    badge: '',
    highlightsText: '',
    sortOrder: 0,
    isPublic: true,
    limits: { maxBranches: 1, maxStaff: 5, maxMenuItems: 50, maxTables: 10, apiRateLimit: 100 },
    features: FEATURE_FIELDS.reduce((acc, f) => { acc[f.key] = false; return acc; }, { revenueAnalytics: 'none' }),
};

function slugify(input = '') {
    return String(input)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const PlanFormModal = ({ plan, onClose, onSaved }) => {
    const isEdit = !!plan;
    const [form, setForm] = useState(EMPTY_PLAN);
    const [submitting, setSubmitting] = useState(false);
    // When the user manually edits the slug we stop auto-syncing it from
    // the name. Without this flag, typing in the name field would
    // overwrite a slug the user had carefully chosen.
    const [slugTouched, setSlugTouched] = useState(false);
    // Per-field errors (inline) + form-level error banner (server failures).
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');

    useEffect(() => {
        if (isEdit) {
            setForm({
                name: plan.name || '',
                slug: plan.slug || '',
                description: plan.description || '',
                price: plan.prices?.monthly ?? plan.price ?? 0,
                annualPrice: plan.prices?.annual ?? '',
                biennialPrice: plan.prices?.biennial ?? '',
                billingCycle: plan.billingCycle || 'monthly',
                // `tier` 0 is real — only null/undefined means "unset".
                tier: plan.tier === null || plan.tier === undefined ? '' : plan.tier,
                // Trial: prefer the structured object; fall back to legacy trialDays.
                ...(plan.trial && typeof plan.trial === 'object'
                    ? {
                        trialEnabled: plan.trial.enabled === true,
                        trialDurationDays: plan.trial.durationDays ?? DEFAULT_TRIAL_DAYS,
                    }
                    : {
                        trialEnabled: Number(plan.trialDays) > 0,
                        trialDurationDays: Number(plan.trialDays) > 0 ? Number(plan.trialDays) : DEFAULT_TRIAL_DAYS,
                    }),
                badge: plan.badge || '',
                highlightsText: Array.isArray(plan.highlights) ? plan.highlights.join('\n') : '',
                sortOrder: plan.sortOrder ?? 0,
                isPublic: plan.isPublic !== false,
                limits: {
                    maxBranches:  plan.limits?.maxBranches  ?? 1,
                    maxStaff:     plan.limits?.maxStaff     ?? 5,
                    maxMenuItems: plan.limits?.maxMenuItems ?? 50,
                    maxTables:    plan.limits?.maxTables    ?? 10,
                    apiRateLimit: plan.limits?.apiRateLimit ?? 100,
                },
                features: {
                    ...EMPTY_PLAN.features,
                    ...(plan.features || {}),
                },
            });
            setSlugTouched(true); // edit mode: never auto-derive slug
        } else {
            setForm(EMPTY_PLAN);
            setSlugTouched(false);
        }
    }, [isEdit, plan]);

    const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));
    const setLimit = (key, value) => setForm(f => ({ ...f, limits: { ...f.limits, [key]: Number(value) || 0 } }));
    const setFeature = (key, value) => setForm(f => ({ ...f, features: { ...f.features, [key]: value } }));

    const handleNameChange = (e) => {
        const next = e.target.value;
        setForm(f => ({
            ...f,
            name: next,
            // Only auto-sync slug while it hasn't been manually edited and we're in create mode.
            slug: !isEdit && !slugTouched ? slugify(next) : f.slug,
        }));
    };

    const handleSlugChange = (e) => {
        setSlugTouched(true);
        setField('slug', slugify(e.target.value));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;
        setFormError('');

        // Client-side validation — populates inline field errors instead
        // of firing one-at-a-time toasts.
        const errs = {};
        if (!form.name.trim())                                                                   errs.name = 'Plan name is required';
        if (!isEdit && !form.slug.trim())                                                        errs.slug = 'Slug is required';
        if (form.price === '' || form.price === null || isNaN(+form.price) || +form.price < 0)   errs.price = 'Price must be zero or greater';
        const cycleErrs = validateCyclePrices({ monthly: form.price, annual: form.annualPrice, biennial: form.biennialPrice });
        if (cycleErrs.annual) errs.annualPrice = cycleErrs.annual;
        if (cycleErrs.biennial) errs.biennialPrice = cycleErrs.biennial;
        // Tier rank: required, integer >= 0. `form.tier === ''` is the only
        // "missing" state — 0 is a legitimate rank (free plans).
        const tierNum = form.tier === '' || form.tier === null || form.tier === undefined ? NaN : Number(form.tier);
        if (Number.isNaN(tierNum))                                   errs.tier = 'Tier rank is required (0 for a free plan)';
        else if (!Number.isInteger(tierNum) || tierNum < 0)          errs.tier = 'Tier rank must be a whole number, 0 or greater';
        const trialDaysNum = form.trialDurationDays === '' ? NaN : Number(form.trialDurationDays);
        if (form.trialEnabled && (!Number.isInteger(trialDaysNum) || trialDaysNum < 1 || trialDaysNum > TRIAL_DAYS_MAX)) {
            errs.trialDays = `Trial length must be 1–${TRIAL_DAYS_MAX} days`;
        }
        if (form.badge.trim().length > BADGE_MAX)                    errs.badge = `Badge must be ${BADGE_MAX} characters or fewer`;
        const highlights = parseHighlights(form.highlightsText);
        if (highlights.length > HIGHLIGHTS_MAX)                      errs.highlights = `At most ${HIGHLIGHTS_MAX} highlights (one per line) — you have ${highlights.length}`;
        else if (highlights.some(h => h.length > HIGHLIGHT_MAX_LEN)) errs.highlights = `Each highlight must be ${HIGHLIGHT_MAX_LEN} characters or fewer`;
        setErrors(errs);
        if (Object.keys(errs).length) {
            const firstBad = ['name', 'slug', 'price', 'annualPrice', 'biennialPrice', 'tier', 'trialDays', 'badge', 'highlights'].find(k => errs[k]);
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(`plan-${firstBad}`);
                    if (el) { try { el.focus() } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }) }
                }, 0);
            }
            return;
        }

        setSubmitting(true);
        try {
            // Slug is immutable on edit — strip it from the payload so the
            // backend rejects any tampering at the call site, not just at
            // the validator layer.
            const blankToNull = (v) => (v === '' || v === null || v === undefined || !(Number(v) > 0) ? null : Number(v));
            // Built key-by-key (no `...form`) so the payload matches the
            // validator field-for-field — form-only helpers such as
            // annualPrice / trialEnabled / highlightsText never leak through.
            const trialEnabled = form.trialEnabled === true;
            const trialDuration = trialEnabled ? trialDaysNum : (Number.isInteger(trialDaysNum) && trialDaysNum >= 0 ? trialDaysNum : 0);
            const payload = {
                name: form.name.trim(),
                description: form.description,
                price: +form.price,
                // Per-cycle list prices, base rupees excl. GST; null = not sold.
                prices: {
                    monthly: blankToNull(form.price),
                    annual: blankToNull(form.annualPrice),
                    biennial: blankToNull(form.biennialPrice),
                },
                billingCycle: form.billingCycle,
                // Rank as a Number — 0 is valid and must survive as 0.
                tier: tierNum,
                trial: { enabled: trialEnabled, durationDays: trialDuration },
                // Legacy mirror the backend also syncs: enabled ? days : 0.
                trialDays: trialEnabled ? trialDuration : 0,
                badge: form.badge.trim(),
                highlights,
                sortOrder: +form.sortOrder || 0,
                isPublic: form.isPublic !== false,
                limits: form.limits,
                features: form.features,
            };
            // Slug is immutable on edit — only sent on create so the backend
            // rejects any tampering at the call site, not just at the validator.
            if (!isEdit) payload.slug = form.slug;

            // _silent so the global interceptor doesn't fire a duplicate
            // toast — we surface API errors as a banner above the form.
            const res = isEdit
                ? await api.put(`/superadmin/plans/${plan._id}`, payload, { _silent: true })
                : await api.post('/superadmin/plans', payload, { _silent: true });

            if (res.data?.success) {
                toast.success(isEdit ? 'Plan updated' : 'Plan created');
                onSaved?.(res.data.data);
            }
        } catch (err) {
            const msg = err.response?.data?.message;
            // Route slug-conflict to the slug field if we can detect it.
            if (/slug.*(taken|exist|in use)/i.test(msg || '')) {
                setErrors(prev => ({ ...prev, slug: msg }));
            } else {
                setFormError(msg || 'Failed to save plan. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    // Group features for visual organization
    const groupedFeatures = FEATURE_FIELDS.reduce((acc, f) => {
        (acc[f.group] = acc[f.group] || []).push(f);
        return acc;
    }, {});

    return (
        <ModalShell
            open
            onClose={onClose}
            title={isEdit ? `Edit Plan — ${plan.name}` : 'New Subscription Plan'}
            subtitle={
                isEdit
                    ? 'Editing a plan does not retroactively change tenants on it. Re-assign the plan to apply changes.'
                    : 'Defines what tenants on this plan may access and how much they may consume.'
            }
            icon={Receipt}
            maxWidth="max-w-3xl"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button
                        variant="brand"
                        type="submit"
                        form="plan-form"
                        disabled={submitting}
                    >
                        {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
                    </Button>
                </>
            }
        >
            <form id="plan-form" onSubmit={handleSubmit} className="px-5 sm:px-6 py-5 sm:py-6 space-y-7" noValidate>
                {formError && (
                    <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                        <span aria-hidden="true">⚠</span>
                        <span>{formError}</span>
                    </div>
                )}
                {/* ── Identity ──────────────────────────────────────── */}
                <FormSection title="Identity">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Name" required error={errors.name}>
                            <input
                                id="plan-name"
                                type="text"
                                value={form.name}
                                onChange={(e) => { handleNameChange(e); if (errors.name) setErrors(prev => ({ ...prev, name: undefined })) }}
                                placeholder="e.g. Standard, Pro, Enterprise"
                                aria-required="true"
                                aria-invalid={errors.name ? 'true' : 'false'}
                                className={`${inputClass} ${errors.name ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                            />
                        </Field>
                        <Field label="Slug" required hint={isEdit ? 'Locked after creation' : 'URL-safe, lowercase'} error={errors.slug}>
                            <input
                                id="plan-slug"
                                type="text"
                                value={form.slug}
                                onChange={(e) => { handleSlugChange(e); if (errors.slug) setErrors(prev => ({ ...prev, slug: undefined })) }}
                                placeholder="standard"
                                disabled={isEdit}
                                aria-required="true"
                                aria-invalid={errors.slug ? 'true' : 'false'}
                                className={`${inputClass} ${errors.slug ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                            />
                        </Field>
                    </div>
                    <Field label="Description" hint="Optional — shown on the public pricing page">
                        <textarea
                            value={form.description}
                            onChange={e => setField('description', e.target.value)}
                            placeholder="For growing restaurants with multi-branch needs."
                            rows={2}
                            maxLength={500}
                            className={inputClass}
                        />
                    </Field>
                </FormSection>

                {/* ── Visibility ────────────────────────────────────── */}
                <FormSection title="Visibility">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <VisibilityCard
                            active={form.isPublic !== false}
                            onClick={() => setField('isPublic', true)}
                            title="Public"
                            desc="Listed in the upgrade catalog for every tenant. Use for your standard tiers."
                        />
                        <VisibilityCard
                            active={form.isPublic === false}
                            onClick={() => setField('isPublic', false)}
                            title="Private (custom)"
                            desc="A bespoke deal for one restaurant. Hidden from the marketing site and every tenant's upgrade list — you assign it directly."
                        />
                    </div>
                    {form.isPublic === false && (
                        <div className="rounded-xl border border-amber-200/70 bg-amber-50/60 px-3.5 py-2.5 text-[11px] text-amber-800 leading-relaxed">
                            This plan won't appear anywhere public. Create it, then open the target restaurant → <span className="font-semibold">Billing → Apply now</span> and select it.
                        </div>
                    )}
                </FormSection>

                {/* ── Pricing ───────────────────────────────────────── */}
                <FormSection title="Pricing">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field label="Monthly price (₹)" required error={errors.price} hint="Excl. GST">
                            <input
                                id="plan-price"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="1"
                                value={form.price}
                                onChange={e => { setField('price', e.target.value); if (errors.price) setErrors(prev => ({ ...prev, price: undefined })) }}
                                aria-required="true"
                                aria-invalid={errors.price ? 'true' : 'false'}
                                className={`${inputClass} ${errors.price ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                            />
                        </Field>
                        <Field label="Legacy billing label" hint="Kept for older plans">
                            <select
                                value={form.billingCycle}
                                onChange={e => setField('billingCycle', e.target.value)}
                                className={inputClass}
                            >
                                {BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Tier rank" required error={errors.tier} hint="0 = free · 10 silver · 20 gold · 25 premium · 30+ enterprise (Contact Sales)">
                            <input
                                id="plan-tier"
                                type="number"
                                inputMode="numeric"
                                min="0"
                                step="1"
                                value={form.tier}
                                onChange={e => { setField('tier', e.target.value); if (errors.tier) setErrors(prev => ({ ...prev, tier: undefined })) }}
                                placeholder="e.g. 20"
                                aria-required="true"
                                aria-invalid={errors.tier ? 'true' : 'false'}
                                className={`${inputClass} ${errors.tier ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                            />
                        </Field>
                    </div>
                    {/* Free trial — structured `trial { enabled, durationDays }`;
                        the legacy `trialDays` is sent alongside, kept in sync. */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                        <FeatureToggle
                            id="plan-trialEnabled"
                            label="Free trial"
                            enabled={form.trialEnabled}
                            onChange={(v) => { setField('trialEnabled', v); if (errors.trialDays) setErrors(prev => ({ ...prev, trialDays: undefined })) }}
                        />
                        <Field label="Trial length (days)" error={errors.trialDays} hint={form.trialEnabled ? `1–${TRIAL_DAYS_MAX} days` : 'Turn on Free trial to set'}>
                            <input
                                id="plan-trialDays"
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max={TRIAL_DAYS_MAX}
                                step="1"
                                value={form.trialDurationDays}
                                disabled={!form.trialEnabled}
                                onChange={e => { setField('trialDurationDays', e.target.value); if (errors.trialDays) setErrors(prev => ({ ...prev, trialDays: undefined })) }}
                                aria-invalid={errors.trialDays ? 'true' : 'false'}
                                className={`${inputClass} ${errors.trialDays ? 'border-rose-400! focus:border-rose-500!' : ''} disabled:opacity-50`}
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Annual price (₹, 12 months)" error={errors.annualPrice} hint="Excl. GST — blank = not sold annually">
                            <input
                                id="plan-annualPrice"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="1"
                                value={form.annualPrice}
                                onChange={e => { setField('annualPrice', e.target.value); if (errors.annualPrice) setErrors(prev => ({ ...prev, annualPrice: undefined })) }}
                                aria-invalid={errors.annualPrice ? 'true' : 'false'}
                                className={`${inputClass} ${errors.annualPrice ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                            />
                        </Field>
                        <Field label="2-year price (₹, 24 months prepay)" error={errors.biennialPrice} hint="Excl. GST — blank = not sold for 2 years">
                            <input
                                id="plan-biennialPrice"
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="1"
                                value={form.biennialPrice}
                                onChange={e => { setField('biennialPrice', e.target.value); if (errors.biennialPrice) setErrors(prev => ({ ...prev, biennialPrice: undefined })) }}
                                aria-invalid={errors.biennialPrice ? 'true' : 'false'}
                                className={`${inputClass} ${errors.biennialPrice ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                            />
                        </Field>
                    </div>
                    <CyclePreview monthly={form.price} annual={form.annualPrice} biennial={form.biennialPrice} />
                    <Field label="Sort order" hint="Lower numbers appear first on the pricing page">
                        <input
                            type="number"
                            value={form.sortOrder}
                            onChange={e => setField('sortOrder', e.target.value)}
                            className={inputClass}
                        />
                    </Field>
                </FormSection>

                {/* ── Pricing card ──────────────────────────────────── */}
                <FormSection title="Pricing card">
                    <Field label="Badge" error={errors.badge} hint={`Ribbon on the card, e.g. "Most popular" · ${form.badge.trim().length}/${BADGE_MAX}`}>
                        <input
                            id="plan-badge"
                            type="text"
                            value={form.badge}
                            maxLength={BADGE_MAX}
                            onChange={e => { setField('badge', e.target.value); if (errors.badge) setErrors(prev => ({ ...prev, badge: undefined })) }}
                            placeholder="Most popular"
                            aria-invalid={errors.badge ? 'true' : 'false'}
                            className={`${inputClass} ${errors.badge ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                        />
                    </Field>
                    <Field
                        label="Highlights"
                        error={errors.highlights}
                        hint={`One per line, up to ${HIGHLIGHTS_MAX} · ${parseHighlights(form.highlightsText).length}/${HIGHLIGHTS_MAX}`}
                    >
                        <textarea
                            id="plan-highlights"
                            value={form.highlightsText}
                            onChange={e => { setField('highlightsText', e.target.value); if (errors.highlights) setErrors(prev => ({ ...prev, highlights: undefined })) }}
                            placeholder={'Unlimited menu items\nKitchen display\nPriority support'}
                            rows={4}
                            aria-invalid={errors.highlights ? 'true' : 'false'}
                            className={`${inputClass} ${errors.highlights ? 'border-rose-400! focus:border-rose-500!' : ''}`}
                        />
                    </Field>
                </FormSection>

                {/* ── Limits ────────────────────────────────────────── */}
                <FormSection title="Limits">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <Field label="Max branches">
                            <input type="number" min="0" value={form.limits.maxBranches}
                                onChange={e => setLimit('maxBranches', e.target.value)} className={inputClass} />
                        </Field>
                        <Field label="Max staff">
                            <input type="number" min="0" value={form.limits.maxStaff}
                                onChange={e => setLimit('maxStaff', e.target.value)} className={inputClass} />
                        </Field>
                        <Field label="Max menu items">
                            <input type="number" min="0" value={form.limits.maxMenuItems}
                                onChange={e => setLimit('maxMenuItems', e.target.value)} className={inputClass} />
                        </Field>
                        <Field label="Max tables">
                            <input type="number" min="0" value={form.limits.maxTables}
                                onChange={e => setLimit('maxTables', e.target.value)} className={inputClass} />
                        </Field>
                        <Field label="API rate limit /min">
                            <input type="number" min="0" value={form.limits.apiRateLimit}
                                onChange={e => setLimit('apiRateLimit', e.target.value)} className={inputClass} />
                        </Field>
                    </div>
                </FormSection>

                {/* ── Feature flags ─────────────────────────────────── */}
                <FormSection title="Features">
                    {Object.entries(groupedFeatures).map(([group, fields]) => (
                        <div key={group} className="mb-5 last:mb-0">
                            <div className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">
                                {group}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {fields.map(f => (
                                    <FeatureToggle
                                        key={f.key}
                                        label={f.label}
                                        enabled={!!form.features[f.key]}
                                        onChange={(v) => setFeature(f.key, v)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* Tiered analytics — separate from booleans */}
                    <Field label="Revenue analytics tier">
                        <select
                            value={form.features.revenueAnalytics || 'none'}
                            onChange={e => setFeature('revenueAnalytics', e.target.value)}
                            className={inputClass}
                        >
                            {REVENUE_ANALYTICS_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </Field>
                </FormSection>
            </form>
        </ModalShell>
    );
};

// Per-month equivalents + GST-inclusive totals so the admin sees what the
// owner will actually pay (backend adds GST at checkout).
const CyclePreview = ({ monthly, annual, biennial }) => {
    const m = Number(monthly) > 0 ? Number(monthly) : null;
    const rows = [
        ['monthly', 'Monthly', m],
        ['annual', 'Annual', Number(annual) > 0 ? Number(annual) : null],
        ['biennial', '2-year', Number(biennial) > 0 ? Number(biennial) : null],
    ].filter(([, , v]) => v);
    if (!rows.length) return null;
    return (
        <ul data-testid="cycle-preview" className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[11px] text-slate-600 space-y-1">
            {rows.map(([key, label, v]) => (
                <li key={key} className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold text-slate-700">{label}</span>
                    <span>
                        {formatINR(monthlyEquivalent(v, key))}/month
                        {key !== 'monthly' && savingsPct(v, key, m) > 0 && ` · saves ${savingsPct(v, key, m)}% vs monthly`}
                        {` · owner pays ${formatINR(Math.round(v * (100 + DEFAULT_GST_RATE)) / 100)} incl. ${DEFAULT_GST_RATE}% GST`}
                    </span>
                </li>
            ))}
        </ul>
    );
};

const FormSection = ({ title, children }) => (
    <section>
        <h3 className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
            {title}
        </h3>
        <div className="space-y-3">{children}</div>
    </section>
);

const VisibilityCard = ({ active, onClick, title, desc }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`text-left rounded-xl border p-3.5 transition ${
            active
                ? 'border-[#FE8301] bg-orange-50/60 ring-2 ring-orange-100/60'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
        }`}
    >
        <div className="flex items-center gap-2">
            <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-[#FE8301]' : 'border-gray-300'}`}>
                {active && <span className="w-2 h-2 rounded-full bg-[#FE8301]" />}
            </span>
            <span className="text-sm font-semibold text-gray-900">{title}</span>
        </div>
        <p className="text-[11px] text-gray-500 leading-relaxed mt-1.5 pl-6">{desc}</p>
    </button>
);

const FeatureToggle = ({ id, label, enabled, onChange }) => (
    <button
        id={id}
        type="button"
        onClick={() => onChange(!enabled)}
        aria-pressed={enabled}
        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition text-left ${
            enabled
                ? 'border-orange-200 bg-orange-50 text-orange-900 ring-2 ring-orange-100/50'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300'
        }`}
    >
        <span className="text-xs font-semibold flex items-center gap-2">
            {enabled && <Check size={12} className="text-orange-600 shrink-0" />}
            {label}
        </span>
        <span
            className={`relative inline-block w-9 h-5 rounded-full transition shrink-0 ${
                enabled ? 'bg-[#FE8301]' : 'bg-gray-300'
            }`}
        >
            <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                    enabled ? 'left-[18px]' : 'left-0.5'
                }`}
            />
        </span>
    </button>
);

export default PlanFormModal;
