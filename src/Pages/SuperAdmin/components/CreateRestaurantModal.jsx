import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
    Store, Mail, KeyRound, Copy, CheckCircle2, Check,
    MapPin, ShieldCheck, CreditCard, ArrowLeft, ArrowRight, Wallet, Link2,
} from 'lucide-react';
import api from '../../../utils/api';
import { restaurantLink } from '../../../utils/customerLinks';
import { Button, Field, inputClass, ModalShell } from './ui';

/**
 * CreateRestaurantModal — Super Admin onboarding wizard.
 *
 * A 4-step flow (Business → Location → Compliance → Plan & Payment) that
 * submits to POST /api/v1/superadmin/restaurants. The endpoint creates the
 * Restaurant document, the initial admin user, and a subscription snapshot
 * in one transaction, returning a one-time temporary password that must be
 * handed to the owner through a secure channel.
 */

// Wizard step definitions. Order here IS the step order; `fields` drives
// the "which step does this field live on" map used to bounce the user
// back to the right step when the server rejects a field.
const STEPS = [
    { key: 'business',   label: 'Business',   icon: Store,       title: 'Business & owner',  blurb: 'Who runs this restaurant and how we reach them.' },
    { key: 'location',   label: 'Location',   icon: MapPin,      title: 'Address',           blurb: 'Where the outlet is physically located.' },
    { key: 'compliance', label: 'Compliance', icon: ShieldCheck, title: 'Licenses & tax',    blurb: 'Regulatory identifiers used on invoices.' },
    { key: 'plan',       label: 'Plan & Pay', icon: CreditCard,  title: 'Plan & payment',    blurb: 'Choose a plan and record any upfront payment.' },
];
const LAST_STEP = STEPS.length - 1;

// Which step owns each field — used to jump back when the server returns a
// field-specific validation error after final submit.
const FIELD_STEP = {
    name: 0, ownerName: 0, contactEmail: 0, contactPhone: 0,
    addressLine1: 1, addressLine2: 1, city: 1, state: 1, pincode: 1, country: 1,
    legalBusinessName: 2, fssaiLicense: 2, gstin: 2, pan: 2, timezone: 2,
    planId: 3, priceOverride: 3, trialDays: 3, paymentMethod: 3, paymentNote: 3,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

const CreateRestaurantModal = ({ onClose, onCreated, prefill }) => {
    const [plans, setPlans] = useState([]);
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [createdAdmin, setCreatedAdmin] = useState(null);
    const [step, setStep] = useState(0);
    const [form, setForm] = useState({
        // `prefill` seeds the form when converting a marketing Lead so the
        // operator doesn't retype what the prospect already gave us.
        name: prefill?.restaurantName || '',
        contactEmail: prefill?.email || '',
        contactPhone: prefill?.phone || '',
        ownerName: prefill?.name || '',

        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',

        legalBusinessName: '',
        fssaiLicense: '',
        gstin: '',
        pan: '',

        timezone: 'Asia/Kolkata',

        planId: '',
        trialDays: '',

        // Offline payment capture (walk-in onboarding). priceOverride is
        // optional — blank falls back to the plan's catalog price.
        priceOverride: '',
        paymentReceived: false,
        paymentMethod: 'cash',
        paymentNote: '',
    });

    // Server-level errors that don't map to a single field (rate limiting,
    // plan unavailable, etc.) and field-level validation errors.
    const [formError, setFormError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get('/superadmin/plans');
                const list = res.data?.data || [];
                setPlans(list);
                if (list.length > 0) {
                    setForm(f => ({ ...f, planId: list[0]._id }));
                }
            } catch {
                toast.error('Failed to load plans');
            } finally {
                setLoadingPlans(false);
            }
        })();
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        // Clear this field's error as the user fixes it.
        setFieldErrors(fe => (fe[name] ? { ...fe, [name]: undefined } : fe));
        if (type === 'checkbox') {
            setForm(f => ({ ...f, [name]: checked }));
            return;
        }
        const upper = name === 'gstin' || name === 'pan' ? value.toUpperCase() : value;
        setForm(f => ({ ...f, [name]: upper }));
    };

    const selectedPlan = plans.find(p => p._id === form.planId);

    // Client-side per-step validation. Mirrors the server rules so the user
    // gets immediate feedback instead of bouncing off the API.
    const validateStep = (idx) => {
        const e = {};
        if (idx === 0) {
            if (!form.name.trim()) e.name = 'Restaurant name is required';
            if (!form.ownerName.trim()) e.ownerName = 'Owner name is required';
            if (!form.contactEmail.trim()) e.contactEmail = 'Owner email is required';
            else if (!EMAIL_RE.test(form.contactEmail.trim())) e.contactEmail = 'Enter a valid email address';
        } else if (idx === 1) {
            if (!form.addressLine1.trim()) e.addressLine1 = 'Address line 1 is required';
            if (!form.city.trim()) e.city = 'City is required';
            if (!form.state.trim()) e.state = 'State is required';
            if (!/^[0-9]{6}$/.test(form.pincode.trim())) e.pincode = 'Pincode must be a 6-digit number';
        } else if (idx === 2) {
            if (!form.legalBusinessName.trim()) e.legalBusinessName = 'Legal business name is required';
            if (!/^[0-9]{14}$/.test(form.fssaiLicense.trim())) e.fssaiLicense = 'FSSAI must be a 14-digit number';
            if (form.gstin.trim() && !GSTIN_RE.test(form.gstin.trim())) e.gstin = 'Invalid GSTIN';
            if (form.pan.trim() && !PAN_RE.test(form.pan.trim())) e.pan = 'Invalid PAN';
        } else if (idx === 3) {
            if (!form.planId) e.planId = 'Select a plan';
            if (form.priceOverride !== '' && (!Number.isFinite(Number(form.priceOverride)) || Number(form.priceOverride) < 0)) {
                e.priceOverride = 'Price must be a non-negative number';
            }
        }
        return e;
    };

    const goToStep = (idx) => {
        setFormError('');
        setFieldErrors({});
        setStep(idx);
    };

    const goBack = () => goToStep(Math.max(0, step - 1));

    const goNext = () => {
        const e = validateStep(step);
        if (Object.keys(e).length) {
            setFieldErrors(e);
            return false;
        }
        setFieldErrors({});
        setStep(s => Math.min(LAST_STEP, s + 1));
        return true;
    };

    const submit = async () => {
        if (submitting) return;
        // Final guard — re-run every step's validation so a value that was
        // valid when typed but later cleared can't slip through.
        for (let i = 0; i <= LAST_STEP; i++) {
            const e = validateStep(i);
            if (Object.keys(e).length) {
                setFieldErrors(e);
                setStep(i);
                return;
            }
        }
        setFormError('');
        setFieldErrors({});
        setSubmitting(true);
        try {
            const payload = {
                ...form,
                trialDays: form.trialDays === '' ? undefined : Number(form.trialDays),
                priceOverride: form.priceOverride === '' ? undefined : Number(form.priceOverride),
                // Method only matters when payment was actually collected.
                paymentMethod: form.paymentReceived ? form.paymentMethod : '',
            };
            // _silent so the global axios interceptor stays quiet — we
            // surface errors inline. Without this, two toasts fire for the
            // same failure.
            const res = await api.post('/superadmin/restaurants', payload, { _silent: true });
            toast.success('Restaurant created');
            setCreatedAdmin(res.data?.data || null);
        } catch (err) {
            const code = err.response?.data?.code;
            const msg = err.response?.data?.message;
            const field = err.response?.data?.field;
            if (code === 'EMAIL_TAKEN' || /email.*(already|exist|taken|registered)/i.test(msg || '')) {
                setFieldErrors({ contactEmail: msg || 'That email is already registered.' });
                setStep(FIELD_STEP.contactEmail);
                focusField('contactEmail');
            } else if (field && FIELD_STEP[field] !== undefined) {
                setFieldErrors({ [field]: msg || 'Please check this field.' });
                setStep(FIELD_STEP[field]);
                focusField(field);
            } else {
                setFormError(msg || 'Failed to create restaurant. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const focusField = (name) => {
        setTimeout(() => {
            const el = document.querySelector(`[name="${name}"]`);
            if (el) { try { el.focus(); } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
        }, 0);
    };

    // Enter / footer button both route through here. Advance until the last
    // step, then submit.
    const handleSubmit = (e) => {
        e.preventDefault();
        if (step < LAST_STEP) { goNext(); return; }
        submit();
    };

    const handleClose = () => {
        if (createdAdmin) onCreated?.(createdAdmin);
        else onClose?.();
    };

    const errCls = (k) => (fieldErrors[k] ? 'border-rose-400! focus:border-rose-500! focus:ring-rose-200!' : '');

    return (
        <ModalShell
            open
            onClose={handleClose}
            maxWidth="max-w-xl"
            title={createdAdmin ? 'Restaurant Created' : 'New Restaurant'}
            subtitle={
                createdAdmin
                    ? 'Hand the credentials below to the owner through a secure channel — they will only be shown once.'
                    : `Step ${step + 1} of ${STEPS.length} · ${STEPS[step].title}`
            }
            icon={createdAdmin ? CheckCircle2 : (STEPS[step].icon || Store)}
            footer={
                createdAdmin ? (
                    <Button variant="primary" onClick={handleClose} className="w-full sm:w-auto">
                        Done
                    </Button>
                ) : (
                    <div className="flex items-center justify-between w-full gap-3">
                        <div>
                            {step > 0 && (
                                <Button variant="ghost" icon={ArrowLeft} onClick={goBack} type="button">
                                    Back
                                </Button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={handleClose} type="button" className="hidden sm:inline-flex">
                                Cancel
                            </Button>
                            {step < LAST_STEP ? (
                                <Button variant="brand" iconRight={ArrowRight} type="submit" form="create-restaurant-form">
                                    Next
                                </Button>
                            ) : (
                                <Button
                                    variant="brand"
                                    type="submit"
                                    form="create-restaurant-form"
                                    disabled={submitting || !form.planId}
                                >
                                    {submitting ? 'Creating…' : 'Create restaurant'}
                                </Button>
                            )}
                        </div>
                    </div>
                )
            }
        >
            {createdAdmin ? (
                <div className="p-5 sm:p-6 space-y-4">
                    <div className="rounded-2xl bg-linear-to-br from-emerald-50 to-emerald-100/30 border border-emerald-200/70 p-4 flex items-start gap-3">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-emerald-900 leading-relaxed">
                            The tenant has been onboarded successfully. The credentials below grant the owner first-time access — they're shown only once and aren't retrievable later.
                        </div>
                    </div>
                    <CredentialRow icon={Mail}     label="Owner email"        value={createdAdmin.admin?.email} />
                    <CredentialRow icon={KeyRound} label="Temporary password" value={createdAdmin.temporaryPassword} mono />
                    {createdAdmin.restaurant?.slug && (
                        <CredentialRow icon={Link2} label="Customer link" value={restaurantLink(createdAdmin.restaurant.slug)} mono />
                    )}
                </div>
            ) : (
                <div className="flex flex-col">
                    {/* ── Stepper ──────────────────────────────────────── */}
                    <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-orange-100/60 bg-[#FAF5F0]/40">
                        <Stepper current={step} onStepClick={(i) => i < step && goToStep(i)} />
                    </div>

                    <form id="create-restaurant-form" onSubmit={handleSubmit} className="p-5 sm:p-6" noValidate>
                        {formError && (
                            <div role="alert" className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                                <span aria-hidden="true">⚠</span>
                                <span>{formError}</span>
                            </div>
                        )}

                        {/* Step intro */}
                        <div className="mb-5">
                            <h3 className="text-base font-bold text-gray-900">{STEPS[step].title}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{STEPS[step].blurb}</p>
                        </div>

                        {/* Keyed so each step replays the entrance animation. */}
                        <div key={step} className="animate-fadeIn space-y-4">
                            {step === 0 && (
                                <>
                                    <Field label="Restaurant name" required error={fieldErrors.name}>
                                        <input
                                            type="text" name="name" value={form.name} onChange={handleChange}
                                            placeholder="e.g. BestoDine Bandra" autoFocus
                                            className={`${inputClass} ${errCls('name')}`}
                                        />
                                    </Field>
                                    <Field label="Owner name" required error={fieldErrors.ownerName}>
                                        <input
                                            type="text" name="ownerName" value={form.ownerName} onChange={handleChange}
                                            placeholder="e.g. Priya Singh"
                                            className={`${inputClass} ${errCls('ownerName')}`}
                                        />
                                    </Field>
                                    <Field label="Owner email" required hint="Used for login + welcome email" error={fieldErrors.contactEmail}>
                                        <input
                                            type="email" name="contactEmail" value={form.contactEmail} onChange={handleChange}
                                            placeholder="owner@yourdomain.com" aria-invalid={fieldErrors.contactEmail ? 'true' : 'false'}
                                            className={`${inputClass} ${errCls('contactEmail')}`}
                                        />
                                    </Field>
                                    <Field label="Owner phone" hint="Optional">
                                        <input
                                            type="tel" name="contactPhone" value={form.contactPhone} onChange={handleChange}
                                            placeholder="+91 98765 43210"
                                            className={inputClass}
                                        />
                                    </Field>
                                </>
                            )}

                            {step === 1 && (
                                <>
                                    <Field label="Address line 1" required error={fieldErrors.addressLine1}>
                                        <input
                                            type="text" name="addressLine1" value={form.addressLine1} onChange={handleChange}
                                            placeholder="Shop / building / street" autoFocus
                                            className={`${inputClass} ${errCls('addressLine1')}`}
                                        />
                                    </Field>
                                    <Field label="Address line 2" hint="Landmark, floor, area (optional)">
                                        <input
                                            type="text" name="addressLine2" value={form.addressLine2} onChange={handleChange}
                                            placeholder="Near Metro Station"
                                            className={inputClass}
                                        />
                                    </Field>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field label="City" required error={fieldErrors.city}>
                                            <input
                                                type="text" name="city" value={form.city} onChange={handleChange}
                                                placeholder="Mumbai"
                                                className={`${inputClass} ${errCls('city')}`}
                                            />
                                        </Field>
                                        <Field label="State" required error={fieldErrors.state}>
                                            <input
                                                type="text" name="state" value={form.state} onChange={handleChange}
                                                placeholder="Maharashtra"
                                                className={`${inputClass} ${errCls('state')}`}
                                            />
                                        </Field>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field label="Pincode" required hint="6-digit" error={fieldErrors.pincode}>
                                            <input
                                                type="text" name="pincode" value={form.pincode} onChange={handleChange}
                                                placeholder="400050" inputMode="numeric" maxLength={6}
                                                className={`${inputClass} ${errCls('pincode')}`}
                                            />
                                        </Field>
                                        <Field label="Country">
                                            <input
                                                type="text" name="country" value={form.country} onChange={handleChange}
                                                placeholder="India"
                                                className={inputClass}
                                            />
                                        </Field>
                                    </div>
                                </>
                            )}

                            {step === 2 && (
                                <>
                                    <Field label="Legal business name" required hint="Appears on invoices" error={fieldErrors.legalBusinessName}>
                                        <input
                                            type="text" name="legalBusinessName" value={form.legalBusinessName} onChange={handleChange}
                                            placeholder="e.g. BestoDine Hospitality Pvt Ltd" autoFocus
                                            className={`${inputClass} ${errCls('legalBusinessName')}`}
                                        />
                                    </Field>
                                    <Field label="FSSAI license" required hint="14-digit food license number" error={fieldErrors.fssaiLicense}>
                                        <input
                                            type="text" name="fssaiLicense" value={form.fssaiLicense} onChange={handleChange}
                                            placeholder="12345678901234" inputMode="numeric" maxLength={14}
                                            className={`${inputClass} ${errCls('fssaiLicense')}`}
                                        />
                                    </Field>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field label="GSTIN" hint="15-char, optional" error={fieldErrors.gstin}>
                                            <input
                                                type="text" name="gstin" value={form.gstin} onChange={handleChange}
                                                placeholder="27AAAAA0000A1Z5" maxLength={15}
                                                className={`${inputClass} uppercase ${errCls('gstin')}`}
                                            />
                                        </Field>
                                        <Field label="PAN" hint="10-char, optional" error={fieldErrors.pan}>
                                            <input
                                                type="text" name="pan" value={form.pan} onChange={handleChange}
                                                placeholder="AAAAA0000A" maxLength={10}
                                                className={`${inputClass} uppercase ${errCls('pan')}`}
                                            />
                                        </Field>
                                    </div>
                                    <Field label="Timezone" hint="IANA format — used for reports & cutoffs">
                                        <input
                                            type="text" name="timezone" value={form.timezone} onChange={handleChange}
                                            placeholder="Asia/Kolkata"
                                            className={inputClass}
                                        />
                                    </Field>
                                </>
                            )}

                            {step === 3 && (
                                <>
                                    <Field label="Plan" required error={fieldErrors.planId}>
                                        <select
                                            name="planId" value={form.planId} onChange={handleChange} disabled={loadingPlans}
                                            className={`${inputClass} ${errCls('planId')}`}
                                        >
                                            {plans.map(p => (
                                                <option key={p._id} value={p._id}>
                                                    {p.name} — ₹{p.price}/{p.billingCycle}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field label="Price (₹)" hint="Optional — overrides plan price" error={fieldErrors.priceOverride}>
                                            <input
                                                type="number" name="priceOverride" min="0" step="1"
                                                value={form.priceOverride} onChange={handleChange}
                                                placeholder={selectedPlan ? String(selectedPlan.price) : '0'}
                                                className={`${inputClass} ${errCls('priceOverride')}`}
                                            />
                                        </Field>
                                        <Field label="Trial days" hint="Optional — overrides default">
                                            <input
                                                type="number" name="trialDays" min="0"
                                                value={form.trialDays} onChange={handleChange}
                                                placeholder="0"
                                                className={inputClass}
                                            />
                                        </Field>
                                    </div>

                                    {/* Payment capture */}
                                    <div className="pt-1">
                                        <div className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
                                            <Wallet size={12} /> Payment
                                        </div>
                                        <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 cursor-pointer hover:border-[#FE8301]/40 transition">
                                            <input
                                                type="checkbox" name="paymentReceived" checked={form.paymentReceived} onChange={handleChange}
                                                className="mt-0.5 w-4 h-4 accent-[#FE8301]"
                                            />
                                            <span className="text-sm text-gray-800">
                                                <span className="font-semibold">Payment received</span>
                                                <span className="block text-xs text-gray-500 mt-0.5">
                                                    Tick if the owner paid you directly (cash / UPI / etc.). Leave unticked to keep it in the offline-payments queue.
                                                </span>
                                            </span>
                                        </label>

                                        {form.paymentReceived && (
                                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fadeIn">
                                                <Field label="Payment method">
                                                    <select
                                                        name="paymentMethod" value={form.paymentMethod} onChange={handleChange}
                                                        className={inputClass}
                                                    >
                                                        <option value="cash">Cash</option>
                                                        <option value="upi">UPI</option>
                                                        <option value="card">Card</option>
                                                        <option value="bank_transfer">Bank transfer</option>
                                                        <option value="cheque">Cheque</option>
                                                        <option value="other">Other</option>
                                                    </select>
                                                </Field>
                                                <Field label="Payment note" hint="Optional — txn id, remarks">
                                                    <input
                                                        type="text" name="paymentNote" value={form.paymentNote} onChange={handleChange}
                                                        placeholder="e.g. UPI ref 4821…" maxLength={500}
                                                        className={inputClass}
                                                    />
                                                </Field>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </form>
                </div>
            )}
        </ModalShell>
    );
};

// ─── Stepper ─────────────────────────────────────────────────────────
// Horizontal progress indicator. Labels show from `sm` up; on mobile only
// the numbered circles + connectors render (with the active step's title
// surfaced in the modal subtitle). Completed steps are clickable to go back.
const Stepper = ({ current, onStepClick }) => (
    <nav aria-label="Progress" className="flex items-center">
        {STEPS.map((s, i) => {
            const done = i < current;
            const active = i === current;
            const Icon = s.icon;
            const circle = (
                <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all shrink-0 ${
                        active
                            ? 'bg-[#FE8301] border-[#FE8301] text-white shadow-[0_4px_12px_rgba(254,131,1,0.30)]'
                            : done
                                ? 'bg-[#FE8301]/10 border-[#FE8301] text-[#FE8301]'
                                : 'bg-white border-gray-200 text-gray-400'
                    }`}
                >
                    {done ? <Check size={16} strokeWidth={3} /> : <Icon size={16} strokeWidth={2} />}
                </div>
            );
            return (
                <React.Fragment key={s.key}>
                    <div className="flex flex-col items-center gap-1.5">
                        {done ? (
                            <button type="button" onClick={() => onStepClick?.(i)} className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]/40" aria-label={`Go back to ${s.label}`}>
                                {circle}
                            </button>
                        ) : circle}
                        <span className={`text-[10px] font-semibold hidden sm:block whitespace-nowrap ${active ? 'text-gray-900' : done ? 'text-[#FE8301]' : 'text-gray-400'}`}>
                            {s.label}
                        </span>
                    </div>
                    {i < STEPS.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-1.5 sm:mx-2 rounded-full transition-colors ${i < current ? 'bg-[#FE8301]' : 'bg-gray-200'}`} />
                    )}
                </React.Fragment>
            );
        })}
    </nav>
);

const CredentialRow = ({ icon, label, value, mono = false }) => {
    const Icon = icon;
    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        toast.success(`${label} copied`);
    };
    return (
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3">
            <div className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 mb-1.5 flex items-center gap-1.5">
                <Icon size={11} />
                {label}
            </div>
            <div className="flex items-center gap-2">
                <div className={`flex-1 min-w-0 text-sm text-gray-900 break-all ${mono ? 'font-mono' : 'font-semibold'}`}>
                    {value}
                </div>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50/60 text-gray-500 hover:text-[#FE8301] flex items-center justify-center transition shrink-0"
                    title="Copy"
                >
                    <Copy size={13} />
                </button>
            </div>
        </div>
    );
};

export default CreateRestaurantModal;
