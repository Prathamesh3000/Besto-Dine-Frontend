import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Receipt, Check } from 'lucide-react';
import api from '../../../utils/api';
import { Button, Field, inputClass, ModalShell } from './ui';

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
    { key: 'inventory',           label: 'Inventory Management',       group: 'Advanced' },
    { key: 'crm',                 label: 'CRM (Customer Mgmt)',        group: 'Advanced' },
    { key: 'tipManagement',       label: 'Tip Management',             group: 'Advanced' },
    { key: 'multiBranch',         label: 'Multi-Branch Support',       group: 'Management' },
    { key: 'staffPerformance',    label: 'Staff Performance Metrics',  group: 'Management' },
    { key: 'paymentGateway',      label: 'Payment Gateway (Razorpay)', group: 'Management' },
    { key: 'kiosk',               label: 'Self-Order Kiosk',           group: 'Management' },
    { key: 'dataExport',          label: 'Data Export (CSV)',          group: 'Technical' },
    { key: 'webhooks',            label: 'Webhook Integrations',       group: 'Technical' },
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

const EMPTY_PLAN = {
    name: '',
    slug: '',
    description: '',
    price: 0,
    billingCycle: 'monthly',
    trialDays: 0,
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
                price: plan.price ?? 0,
                billingCycle: plan.billingCycle || 'monthly',
                trialDays: plan.trialDays ?? 0,
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
        setErrors(errs);
        if (Object.keys(errs).length) {
            const firstBad = ['name', 'slug', 'price'].find(k => errs[k]);
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
            const payload = { ...form, price: +form.price, trialDays: +form.trialDays || 0, sortOrder: +form.sortOrder || 0 };
            if (isEdit) delete payload.slug;

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
                        <Field label="Price (₹)" required error={errors.price}>
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
                        <Field label="Billing cycle">
                            <select
                                value={form.billingCycle}
                                onChange={e => setField('billingCycle', e.target.value)}
                                className={inputClass}
                            >
                                {BILLING_CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Trial days" hint="0 = no trial">
                            <input
                                type="number"
                                min="0"
                                value={form.trialDays}
                                onChange={e => setField('trialDays', e.target.value)}
                                className={inputClass}
                            />
                        </Field>
                    </div>
                    <Field label="Sort order" hint="Lower numbers appear first on the pricing page">
                        <input
                            type="number"
                            value={form.sortOrder}
                            onChange={e => setField('sortOrder', e.target.value)}
                            className={inputClass}
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

const FeatureToggle = ({ label, enabled, onChange }) => (
    <button
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
