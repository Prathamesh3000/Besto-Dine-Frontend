// Hotel SELF-SIGNUP — route /register-restaurant (plan §5).
// Steps: 1 "Your hotel" (name, city, web address, optional plan + billing
// cycle), 2 "Your account", and — for a PAID plan only — 3 "Payment".
// → POST /public/register-restaurant. 201 = instant start (the owner is
// signed in and sent to the dashboard after a short ProvisioningProgress
// screen); 202 = approval mode ("Application received", Super Admin →
// Pending Approvals; login answers 403 SIGNUP_PENDING until approved).
//
// Outcome by chosen plan (getCTA in utils/planCta — one rule everywhere):
//   trial-enabled plan → trial (same as /start-trial)
//   free plan          → account active at once, no payment, no trial clock
//   paid plan          → step 3: POST /public/register-order → Razorpay
//                        checkout → register-restaurant with `payment`
//   no plan            → "Decide later" = trial on the default trial plan
// Enterprise (tier >= 30) plans are not selectable here — "Contact sales".
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
    Building2, MapPin, Globe, User, Mail, Phone, Lock, Eye, EyeOff, ArrowLeft, ArrowRight,
    CheckCircle2, XCircle, Loader2, BadgeCheck, AlertCircle, CreditCard, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { publicAPI } from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import { setActiveTenant } from '../../utils/tenant';
import { getPublicAppOrigin } from '../../utils/customerLinks';
import { sanitizeMobileInput, mobileError, mobileInputAttrs } from '../../utils/mobile';
import { passwordError, MIN_LENGTH } from '../../utils/passwordPolicy';
import { getCTA, trialDaysOf } from '../../utils/planCta';
import { isCycle, rowForCycle, formatINR, cycleSuffix, cycleLabel, DEFAULT_GST_RATE } from '../../utils/billingCycles';
import PasswordStrengthMeter from '../../Components/Common/PasswordStrengthMeter';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { usePageMeta, usePublicPlans, formatPlanCyclePrice, publicCycleOptions, readUtm } from './platformShared';
import ProvisioningProgress from './components/ProvisioningProgress';
import { useProvisioning, useProvisioningSteps } from './components/useProvisioning';
import {
    SignupShell, ApplicationReceived, FieldError, IconInput, FormErrorBanner, inputOk, inputErr, labelCls, primaryBtn,
} from './components/SignupShared';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEP1_FIELDS = new Set(['restaurantName', 'city', 'slug', 'planId']);
// Server `field` names → form fields (tolerates a few aliases).
const FIELD_ALIASES = {
    name: 'restaurantName', restaurant: 'restaurantName', hotelName: 'restaurantName',
    email: 'contactEmail', phone: 'contactPhone', mobile: 'contactPhone',
    terms: 'acceptTerms', plan: 'planId',
};
const CODE_FIELDS = {
    TERMS_REQUIRED: 'acceptTerms',
    INVALID_PLAN: 'planId',
    WEAK_PASSWORD: 'password',
    SLUG_RESERVED: 'slug', INVALID_SLUG: 'slug', SLUG_TAKEN: 'slug',
    EMAIL_IN_USE: 'contactEmail',
    PHONE_IN_USE: 'contactPhone',
};
const FORM_FIELDS = new Set([
    'restaurantName', 'city', 'slug', 'planId', 'ownerName', 'contactEmail',
    'contactPhone', 'password', 'confirmPassword', 'acceptTerms',
]);
// Payment outcomes the server reports on register-restaurant (not field errors).
const PAYMENT_CODES = new Set(['PAYMENT_MISMATCH', 'PAYMENT_ALREADY_USED', 'PAYMENT_REQUIRED', 'PAYMENT_FAILED']);
const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
// Server order amount may differ from the list price we showed by at most
// this many rupees (rounding) before we stop and ask the user to review.
const AMOUNT_TOLERANCE_RUPEES = 1;

/** Name → URL slug, same shape the server accepts (a-z, 0-9, single hyphens). */
function slugify(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 55)
        .replace(/-+$/, '');
}

/** Sanitise while typing — keeps a trailing hyphen so "my-" can become "my-cafe". */
function sanitiseSlugInput(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-+/, '')
        .slice(0, 60);
}

/** Load Razorpay checkout.js once (same pattern as Pages/Admin/Subscription). */
function ensureRazorpay() {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${RAZORPAY_SRC}"]`);
        if (existing) {
            existing.addEventListener('load', resolve, { once: true });
            existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay')), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = RAZORPAY_SRC;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Razorpay'));
        document.body.appendChild(script);
    });
}

/** Paise (server) → rupees. */
const paiseToRupees = (p) => (Number.isFinite(Number(p)) ? Number(p) / 100 : NaN);

/** Monthly / Annual / 2-year toggle; `options` from publicCycleOptions(plans). */
function CycleToggle({ options, value, onChange, idPrefix = 'signup-cycle' }) {
    const { t } = useTranslation();
    if (!options || options.length < 2) return null;
    const names = {
        monthly: t('platform.pricing.cycle_monthly', 'Monthly'),
        annual: t('platform.pricing.cycle_annual', 'Annual'),
        biennial: t('platform.pricing.cycle_biennial', '2-year'),
    };
    return (
        <div role="group" aria-label={t('platform.pricing.cycle_label', 'Billing period')} className="inline-flex items-center gap-1 rounded-full border border-[#EAECF0] bg-white p-1 shadow-sm">
            {options.map(({ cycle: c, savings }) => {
                const active = value === c;
                return (
                    <button
                        key={c}
                        type="button"
                        onClick={() => onChange(c)}
                        aria-pressed={active}
                        data-testid={`${idPrefix}-${c}`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                            active ? 'bg-[#FE8301] text-white shadow' : 'text-[#475467] hover:bg-[#F9FAFB]'
                        }`}
                    >
                        {names[c] || cycleLabel(c)}
                        {savings > 0 && (
                            <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${active ? 'bg-white/25 text-white' : 'bg-[#ECFDF3] text-[#067647]'}`}>
                                {t('platform.pricing.save', 'Save {{pct}}%', { pct: savings })}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

const RegisterRestaurant = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { startSession } = useAuth();
    const [searchParams] = useSearchParams();
    usePageMeta(
        t('register_hotel.meta_title', 'Register your hotel — BestoDine'),
        t('register_hotel.meta_description', 'Register your hotel or restaurant on BestoDine: QR ordering, kitchen display, waiter app, bookings and payments.'),
    );

    // Captured once — the query string can change (e.g. ?plan=) without
    // losing the attribution the visitor arrived with.
    const [attribution] = useState(() => ({
        utm: readUtm(),
        source: (searchParams.get('source') || searchParams.get('ref') || 'platform-signup').slice(0, 100),
    }));

    const [step, setStep] = useState(1);
    const [values, setValues] = useState(() => ({
        restaurantName: '', city: '', slug: '', planId: searchParams.get('plan') || '',
        ownerName: '', contactEmail: '', contactPhone: '', password: '', confirmPassword: '',
        acceptTerms: false,
    }));
    // Billing cycle for the plan picker / payment (?cycle= preselects).
    const [billingCycle, setBillingCycle] = useState(() => {
        const c = searchParams.get('cycle');
        return isCycle(c) ? c : 'monthly';
    });
    const [slugTouched, setSlugTouched] = useState(false);
    const [serverSuggestions, setServerSuggestions] = useState([]);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [result, setResult] = useState(null);
    // Confirmation popup shown on top of the success screen (N5).
    const [showConfirm, setShowConfirm] = useState(false);
    const [phoneBlurred, setPhoneBlurred] = useState(false);
    const formErrorRef = useRef(null);
    const { provisioning, start: startProvisioning } = useProvisioning();
    const provisioningSteps = useProvisioningSteps();

    // ── Payment step state ────────────────────────────────────────────
    const [order, setOrder] = useState(null);          // register-order response
    const [orderLoading, setOrderLoading] = useState(false);
    const [orderError, setOrderError] = useState('');
    const [orderNonce, setOrderNonce] = useState(0);   // bump → re-create the order
    const [mismatch, setMismatch] = useState(null);    // { expected, actual } rupees
    const [paying, setPaying] = useState(false);

    const plansQuery = usePublicPlans();
    const plans = useMemo(() => plansQuery.data || [], [plansQuery.data]);
    // ?plan= may carry a plan _id (pricing cards) or its slug (hand-made links).
    const matchedPlan = values.planId
        ? (plans.find(p => p._id === values.planId || (p.slug && p.slug === values.planId)) || null)
        : null;
    // Enterprise plans are "Contact sales" — never selectable here.
    const planKind = (p) => (p ? getCTA(p, billingCycle).kind : 'trial');
    const selectedPlan = matchedPlan && planKind(matchedPlan) !== 'contact' ? matchedPlan : null;
    const outcome = selectedPlan ? planKind(selectedPlan) : 'trial'; // trial | free | paid
    const isPaid = outcome === 'paid';

    const cycleOptions = useMemo(() => (plans.length ? publicCycleOptions(plans) : []), [plans]);
    // Keep the toggle on a cycle some plan actually sells.
    useEffect(() => {
        if (cycleOptions.length && !cycleOptions.some(o => o.cycle === billingCycle)) {
            setBillingCycle(cycleOptions[0].cycle);
        }
    }, [cycleOptions, billingCycle]);

    // For a paid plan: the price row we charge. Falls back to the monthly row
    // when the plan does not sell the chosen cycle (the server does the same).
    const gstRate = Number.isFinite(Number(selectedPlan?.gstRate)) ? Number(selectedPlan.gstRate) : DEFAULT_GST_RATE;
    const paidRow = isPaid
        ? (rowForCycle(selectedPlan, billingCycle, gstRate) || rowForCycle(selectedPlan, 'monthly', gstRate))
        : null;
    const effectiveCycle = paidRow ? paidRow.cycle : billingCycle;
    // What the page shows BEFORE the order call: list price + GST.
    const displayedTotal = paidRow ? paidRow.total : null;
    // What we charge once the order exists (server is authoritative).
    const orderTotal = order ? paiseToRupees(order.amount) : NaN;
    const payAmount = Number.isFinite(orderTotal) && !mismatch ? orderTotal : displayedTotal;

    // ── Web address availability ──────────────────────────────────────
    // Until the owner edits the address it follows the hotel name
    // (?name= → server-derived slug); after that it's checked as typed.
    const trimmedName = values.restaurantName.trim();
    const debName = useDebouncedValue(trimmedName, 400);
    const debSlug = useDebouncedValue(values.slug, 400);
    // City only sharpens the suggestions (e.g. spice-garden-pune).
    const debCity = useDebouncedValue(values.city.trim(), 600);
    const cityParam = debCity ? { city: debCity } : {};
    const checkParams = slugTouched
        ? (debSlug.length >= 1 ? { slug: debSlug.replace(/-+$/, ''), ...cityParam } : null)
        : (debName.length >= 2 ? { name: debName, ...cityParam } : null);
    const slugCheck = useQuery({
        queryKey: ['public', 'slug-availability', checkParams],
        queryFn: async ({ signal }) => {
            const res = await publicAPI.checkSlugAvailability(checkParams, { signal });
            return res.data?.data || res.data || null;
        },
        enabled: Boolean(checkParams),
        staleTime: 30 * 1000,
        retry: 0,
    });
    const check = slugCheck.data || null;
    const effectiveSlug = slugTouched
        ? values.slug.replace(/-+$/, '')
        : (check?.slug || slugify(trimmedName));
    const slugChecking = Boolean(
        (slugTouched ? debSlug !== values.slug : debName !== trimmedName) || slugCheck.isFetching,
    );
    const slugUnavailable = Boolean(check && check.available === false && !slugChecking);
    const suggestions = (slugUnavailable && check?.suggestions?.length ? check.suggestions : serverSuggestions).slice(0, 4);
    const origin = getPublicAppOrigin();
    const displayOrigin = origin.replace(/^https?:\/\//, '');

    const reasonText = (reason) => {
        switch (reason) {
            case 'reserved': return t('register_hotel.slug_reserved', 'This address is reserved — please pick another.');
            case 'taken': return t('register_hotel.slug_taken', 'Another restaurant already uses this address.');
            case 'too_short': return t('register_hotel.slug_short', 'Too short — use at least 2 characters.');
            case 'invalid': return t('register_hotel.slug_invalid', 'Use lowercase letters, numbers and single hyphens only.');
            default: return t('register_hotel.slug_unavailable', 'This address is not available.');
        }
    };

    // ── Field helpers ─────────────────────────────────────────────────
    const clearError = (field) => {
        setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));
        setFormError('');
    };
    const setField = (field) => (e) => {
        const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setValues(prev => ({ ...prev, [field]: v }));
        clearError(field);
    };
    const onSlugChange = (e) => {
        setSlugTouched(true);
        setServerSuggestions([]);
        setValues(prev => ({ ...prev, slug: sanitiseSlugInput(e.target.value) }));
        clearError('slug');
    };
    const pickSlug = (s) => {
        setSlugTouched(true);
        setServerSuggestions([]);
        setValues(prev => ({ ...prev, slug: s }));
        clearError('slug');
    };
    const followName = () => {
        setSlugTouched(false);
        setServerSuggestions([]);
        setValues(prev => ({ ...prev, slug: '' }));
        clearError('slug');
    };

    const focusField = (field) => {
        setTimeout(() => {
            const el = document.getElementById(field);
            if (el) { el.focus(); el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
        }, 60);
    };

    // ── Validation ────────────────────────────────────────────────────
    const validateStep1 = () => {
        const e = {};
        if (trimmedName.length < 2) e.restaurantName = t('register_hotel.err_name', 'Please enter your hotel or restaurant name.');
        else if (trimmedName.length > 80) e.restaurantName = t('register_hotel.err_name_long', 'Name cannot exceed 80 characters.');
        const city = values.city.trim();
        if (!city) e.city = t('register_hotel.err_city', 'Please enter your city.');
        else if (city.length > 80) e.city = t('register_hotel.err_city_long', 'City cannot exceed 80 characters.');
        if (slugTouched) {
            if (effectiveSlug.length < 2) e.slug = t('register_hotel.slug_short', 'Too short — use at least 2 characters.');
            else if (slugUnavailable) e.slug = reasonText(check?.reason);
        } else if (slugUnavailable) {
            e.slug = reasonText(check?.reason);
        }
        return e;
    };
    const validateStep2 = () => {
        const e = {};
        const owner = values.ownerName.trim();
        if (owner.length < 2) e.ownerName = t('register_hotel.err_owner', 'Please enter your full name.');
        else if (owner.length > 80) e.ownerName = t('register_hotel.err_owner_long', 'Name cannot exceed 80 characters.');
        const email = values.contactEmail.trim();
        if (!EMAIL_REGEX.test(email)) e.contactEmail = t('register_hotel.err_email', 'Please enter a valid email address.');
        else if (email.length > 120) e.contactEmail = t('register_hotel.err_email_long', 'Email cannot exceed 120 characters.');
        const phoneErr = mobileError(values.contactPhone);
        if (phoneErr) e.contactPhone = values.contactPhone
            ? phoneErr
            : t('register_hotel.err_phone', 'Please enter a valid 10-digit mobile number.');
        const pwErr = passwordError(values.password);
        if (pwErr) e.password = pwErr;
        if (!values.confirmPassword) e.confirmPassword = t('register_hotel.err_confirm', 'Please re-enter your password.');
        else if (values.confirmPassword !== values.password) e.confirmPassword = t('register_hotel.err_mismatch', 'Passwords do not match.');
        if (!values.acceptTerms) e.acceptTerms = t('register_hotel.err_terms', 'Please accept the Terms & Privacy Policy to continue.');
        return e;
    };

    const goNext = (ev) => {
        ev.preventDefault();
        setFormError('');
        const e = validateStep1();
        setErrors(e);
        const first = Object.keys(e)[0];
        if (first) { focusField(first); return; }
        setStep(2);
        focusField('ownerName');
    };

    /** Both steps valid? Moves to the offending step and focuses the field otherwise. */
    const validateAll = () => {
        const e1 = validateStep1();
        if (Object.keys(e1).length) {
            setErrors(e1);
            setStep(1);
            focusField(Object.keys(e1)[0]);
            return false;
        }
        const e2 = validateStep2();
        setErrors(e2);
        const first = Object.keys(e2)[0];
        if (first) { setStep(2); focusField(first); return false; }
        return true;
    };

    // ── Submit ────────────────────────────────────────────────────────
    /** POST /public/register-restaurant; `payment` only after Razorpay checkout. */
    const submitRegistration = async (payment) => {
        // Send the address only when the owner chose it or the server has
        // confirmed the name-derived one; otherwise let the server derive it.
        const sendSlug = slugTouched
            ? effectiveSlug
            : (check?.available && check?.slug ? check.slug : undefined);
        const payload = {
            restaurantName: trimmedName,
            ownerName: values.ownerName.trim(),
            contactEmail: values.contactEmail.trim().toLowerCase(),
            contactPhone: values.contactPhone, // already normalised to 10 digits by sanitizeMobileInput
            city: values.city.trim(),
            password: values.password,
            acceptTerms: true,
            source: attribution.source,
            ...(sendSlug ? { slug: sendSlug } : {}),
            ...(selectedPlan ? { planId: selectedPlan._id, billingCycle: effectiveCycle } : {}),
            ...(payment ? { payment } : {}),
            ...(attribution.utm ? { utm: attribution.utm } : {}),
        };

        setSubmitting(true);
        setFormError('');
        try {
            const res = await publicAPI.registerRestaurant(payload);
            const data = res.data?.data || {};
            const name = data.restaurant?.name || trimmedName;
            // INSTANT START (201): the response is the /auth/login body plus
            // data.trialStarted (trial) or an active subscription (free /
            // paid) — show the provisioning screen, sign the owner in and
            // open the dashboard. (202 = approval mode: no tokens.)
            if (res.status === 201 && (res.data?.token || res.data?.cookieAuth)) {
                // eslint-disable-next-line no-unused-vars
                const { success, data: _d, message: _m, ...loginBody } = res.data;
                const successToast = data.trialStarted
                    ? t('register_hotel.toast_trial_started', 'Your 14-day free trial has started')
                    : payment
                        ? t('register_hotel.toast_paid_active', 'Payment received — your account is active')
                        : t('register_hotel.toast_free_active', 'Your account is active — welcome to BestoDine');
                startProvisioning(name, provisioningSteps.length, () => {
                    const session = startSession(loginBody);
                    toast.success(successToast, { id: 'register-hotel-success' });
                    if (session?.success) {
                        const tn = session.user?.tenant;
                        if (tn?.slug) setActiveTenant({ slug: tn.slug, name: tn.name, _id: tn._id });
                        navigate('/admin/dashboard', { replace: true });
                    } else {
                        navigate('/staff-login', { replace: true });
                    }
                });
                return;
            }
            setResult({
                name,
                slug: data.restaurant?.slug || sendSlug || '',
                pageUrl: data.pageUrl || '',
                message: data.message || res.data?.message || '',
                email: data.owner?.email || payload.contactEmail,
                planName: data.requestedPlan?.name || selectedPlan?.name || '',
            });
            setStep('done');
            setShowConfirm(true);
            toast.success(t('register_hotel.toast_success', "Registration submitted — we'll review and email you."), { id: 'register-hotel-success' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            const status = err.response?.status;
            const body = err.response?.data || {};
            // The request is _silent (no global toast) and the error banner
            // sits at the top of a long form — surface failures visibly so
            // a rejected submit never looks like "nothing happened".
            toast.error(body.message || t('register_hotel.err_generic', 'Registration failed. Please check your details and try again.'), { id: 'register-hotel-error' });
            if (!err.response) {
                setFormError(t('register_hotel.err_network', "We couldn't reach BestoDine. Check your connection and try again."));
            } else if (status === 429) {
                setFormError(body.message || t('register_hotel.err_rate', 'Too many signup attempts from this network. Please try again in a little while.'));
            } else if (PAYMENT_CODES.has(body.code)) {
                // Payment was taken but the server could not match it to this
                // order (or it was already used): show the server's message on
                // the payment step; the owner can refresh the order and retry.
                setStep(3);
                setFormError(body.message || t('register_hotel.err_payment', 'We could not verify your payment. Please review and try again.'));
            } else {
                let field = CODE_FIELDS[body.code] || FIELD_ALIASES[body.field] || body.field;
                if (!FORM_FIELDS.has(field)) field = null;
                const message = body.message || t('register_hotel.err_generic', 'Registration failed. Please check your details and try again.');
                if (field) {
                    if (field === 'slug') {
                        // Make the address editable with the value that failed.
                        setSlugTouched(true);
                        setValues(prev => ({ ...prev, slug: effectiveSlug }));
                        setServerSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
                        queryClient.invalidateQueries({ queryKey: ['public', 'slug-availability'] });
                    }
                    setErrors(prev => ({ ...prev, [field]: message }));
                    setStep(STEP1_FIELDS.has(field) ? 1 : 2);
                    focusField(field);
                } else {
                    setFormError(message);
                }
            }
            setTimeout(() => formErrorRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 60);
        } finally {
            setSubmitting(false);
            setPaying(false);
        }
    };

    /** Step 2 submit: paid plan → payment step; otherwise register now. */
    const handleSubmit = async (ev) => {
        ev.preventDefault();
        setFormError('');
        if (!validateAll()) return;
        if (isPaid) {
            setStep(3);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        await submitRegistration(null);
    };

    // ── Payment step: create the Razorpay order ───────────────────────
    // Re-runs when the plan or cycle changes (toggle on step 3) or after
    // "Refresh amount". The displayed total is compared with the server's
    // amount: a difference beyond ₹1 stops the flow for review.
    const selectedPlanId = selectedPlan?._id || '';
    useEffect(() => {
        if (step !== 3 || !isPaid || !selectedPlanId) return undefined;
        let cancelled = false;
        setOrder(null);
        setMismatch(null);
        setOrderError('');
        setOrderLoading(true);
        const expected = displayedTotal;
        publicAPI.registerOrder({ planId: selectedPlanId, billingCycle: effectiveCycle })
            .then((res) => {
                if (cancelled) return;
                const o = res.data?.data || res.data || {};
                const actual = paiseToRupees(o.amount);
                if (!Number.isFinite(actual)) {
                    setOrderError(t('register_hotel.pay_order_failed', 'We could not prepare your payment. Please try again.'));
                    return;
                }
                if (Number.isFinite(expected) && Math.abs(actual - expected) > AMOUNT_TOLERANCE_RUPEES) {
                    setMismatch({ expected, actual });
                }
                setOrder(o);
            })
            .catch((err) => {
                if (cancelled) return;
                const body = err.response?.data || {};
                setOrderError(body.message || (err.response
                    ? t('register_hotel.pay_order_failed', 'We could not prepare your payment. Please try again.')
                    : t('register_hotel.err_network', "We couldn't reach BestoDine. Check your connection and try again.")));
            })
            .finally(() => { if (!cancelled) setOrderLoading(false); });
        return () => { cancelled = true; };
        // displayedTotal is derived from selectedPlanId + effectiveCycle; t is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, isPaid, selectedPlanId, effectiveCycle, orderNonce]);

    /** "Pay ₹X" → Razorpay checkout → register-restaurant with the payment proof. */
    const payNow = async () => {
        if (!order || mismatch || orderLoading || paying || submitting) return;
        setFormError('');
        setPaying(true);
        try {
            await ensureRazorpay();
            const rzp = new window.Razorpay({
                key: order.keyId,
                amount: order.amount,
                currency: order.currency || 'INR',
                name: 'BestoDine',
                description: t('register_hotel.pay_description', '{{plan}} plan — {{cycle}}', {
                    plan: order.plan?.name || selectedPlan?.name || '', cycle: cycleLabel(effectiveCycle),
                }),
                order_id: order.orderId,
                prefill: {
                    name: values.ownerName.trim(),
                    email: values.contactEmail.trim().toLowerCase(),
                    contact: values.contactPhone,
                },
                handler: (response) => {
                    submitRegistration({
                        razorpayOrderId: response.razorpay_order_id,
                        razorpayPaymentId: response.razorpay_payment_id,
                        razorpaySignature: response.razorpay_signature,
                    });
                },
                modal: {
                    ondismiss: () => {
                        setPaying(false);
                        toast(t('register_hotel.pay_cancelled', 'Payment cancelled — your details are kept, pay when you are ready.'), { icon: '!' });
                    },
                },
                theme: { color: '#FE8301' },
            });
            rzp.on?.('payment.failed', (resp) => {
                setPaying(false);
                setFormError(resp?.error?.description || t('register_hotel.pay_failed', 'Payment failed. You have not been charged — please try again.'));
            });
            rzp.open();
        } catch {
            setPaying(false);
            setFormError(t('register_hotel.pay_load_failed', 'Could not open the payment window. Check your connection and try again.'));
        }
    };

    // Live mobile feedback: once 10 digits are in (or the field was left).
    const livePhoneError = values.contactPhone && (values.contactPhone.length === 10 || phoneBlurred)
        ? mobileError(values.contactPhone)
        : '';

    // ── Provisioning (201) ────────────────────────────────────────────
    if (provisioning) {
        return (
            <SignupShell>
                <ProvisioningProgress name={provisioning.name} steps={provisioningSteps} done={provisioning.done} />
            </SignupShell>
        );
    }

    // ── Success (202) ─────────────────────────────────────────────────
    if (step === 'done' && result) {
        return (
            <SignupShell>
                <ApplicationReceived result={result} showConfirm={showConfirm} onCloseConfirm={() => setShowConfirm(false)} />
            </SignupShell>
        );
    }

    // ── Form ──────────────────────────────────────────────────────────
    const stepLabels = [
        t('register_hotel.step1', 'Your hotel'),
        t('register_hotel.step2', 'Your account'),
        ...(isPaid ? [t('register_hotel.step3', 'Payment')] : []),
    ];
    const planName = selectedPlan?.name || '';
    const heading = outcome === 'free'
        ? t('register_hotel.title_free', 'Create your free account')
        : isPaid
            ? t('register_hotel.title_paid', 'Get started with {{plan}}', { plan: planName })
            : t('register_hotel.title', 'Start your 14-day free trial');
    const subtitle = outcome === 'free'
        ? t('register_hotel.subtitle_free', 'Two quick steps. The {{plan}} plan is free — no card, no trial clock.', { plan: planName })
        : isPaid
            ? t('register_hotel.subtitle_paid', 'Three quick steps: your hotel, your account, then a secure payment of {{total}}.', { total: formatINR(payAmount) })
            : t('register_hotel.subtitle', 'Two quick steps. No card needed — you get instant access to every feature.');
    const step2Label = isPaid
        ? t('register_hotel.continue_payment', 'Continue to payment')
        : outcome === 'free'
            ? t('register_hotel.submit_free', 'Create account')
            : t('register_hotel.submit', 'Start free trial');
    const planCycleOptions = selectedPlan ? publicCycleOptions([selectedPlan]) : cycleOptions;

    return (
        <SignupShell asideNote={isPaid
            ? t('register_hotel.aside_note_paid', 'Secure payment via Razorpay. Your account is live the moment the payment goes through.')
            : outcome === 'free' ? t('register_hotel.aside_note_free', 'Free forever on this plan — upgrade any time from your admin panel.') : undefined}
        >
            <div className="bg-white rounded-3xl border border-[#EAECF0] shadow-[0_12px_40px_rgba(16,24,40,0.08)] overflow-hidden">
                <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-5 border-b border-[#F2F4F7]">
                    <h1 className="text-[24px] sm:text-[26px] font-extrabold tracking-tight text-[#101828]">{heading}</h1>
                    <p className="mt-1 text-[14px] text-[#667085]">{subtitle}</p>
                    <ol className="mt-5 flex items-center gap-2" aria-label={t('register_hotel.progress', 'Progress')}>
                        {stepLabels.map((label, i) => {
                            const n = i + 1;
                            const active = step === n;
                            const done = step > n;
                            return (
                                <li key={label} className="flex items-center gap-2 flex-1 min-w-0" aria-current={active ? 'step' : undefined}>
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 ${
                                        done ? 'bg-[#067647] text-white' : active ? 'bg-[#FE8301] text-white' : 'bg-[#F2F4F7] text-[#667085]'
                                    }`}>
                                        {done ? <CheckCircle2 size={15} /> : n}
                                    </span>
                                    <span className={`text-[13px] font-bold truncate ${active ? 'text-[#101828]' : 'text-[#667085]'}`}>{label}</span>
                                    {n < stepLabels.length && <span className="flex-1 h-px bg-[#EAECF0] ml-1" aria-hidden="true" />}
                                </li>
                            );
                        })}
                    </ol>
                </div>

                <div className="px-5 sm:px-8 py-6">
                    <FormErrorBanner innerRef={formErrorRef} message={formError} />

                    {step === 1 && (
                        <form onSubmit={goNext} noValidate className="space-y-5">
                            <div>
                                <label htmlFor="restaurantName" className={labelCls}>{t('register_hotel.name', 'Hotel / restaurant name')}</label>
                                <IconInput
                                    icon={Building2} id="restaurantName" error={errors.restaurantName}
                                    value={values.restaurantName} onChange={setField('restaurantName')}
                                    maxLength={80} autoComplete="organization" required
                                    placeholder={t('register_hotel.name_ph', 'e.g. Spice Garden')}
                                />
                                <FieldError id="restaurantName-error" message={errors.restaurantName} />
                            </div>

                            <div>
                                <label htmlFor="city" className={labelCls}>{t('register_hotel.city', 'City')}</label>
                                <IconInput
                                    icon={MapPin} id="city" error={errors.city}
                                    value={values.city} onChange={setField('city')}
                                    maxLength={80} autoComplete="address-level2" required
                                    placeholder={t('register_hotel.city_ph', 'e.g. Pune')}
                                />
                                <FieldError id="city-error" message={errors.city} />
                            </div>

                            {/* Web address */}
                            <div>
                                <label htmlFor="slug" className={labelCls}>{t('register_hotel.slug', 'Web address')}</label>
                                <div className={`flex items-stretch rounded-xl border overflow-hidden focus-within:ring-2 ${
                                    errors.slug ? 'border-red-400 focus-within:ring-red-200' : 'border-[#D0D5DD] focus-within:ring-[#FE8301]/25 focus-within:border-[#FE8301]'
                                }`}>
                                    <span className="hidden sm:flex items-center gap-1.5 pl-3.5 pr-1 bg-[#F9FAFB] text-[14px] text-[#667085] border-r border-[#EAECF0] shrink-0 max-w-[55%]">
                                        <Globe size={15} className="shrink-0" /> <span className="truncate">{displayOrigin}/</span>
                                    </span>
                                    <input
                                        id="slug" name="slug"
                                        value={slugTouched ? values.slug : effectiveSlug}
                                        onChange={onSlugChange}
                                        onBlur={() => { if (slugTouched) setValues(prev => ({ ...prev, slug: prev.slug.replace(/-+$/, '') })); }}
                                        maxLength={60}
                                        autoCapitalize="none" autoCorrect="off" spellCheck={false}
                                        placeholder={t('register_hotel.slug_ph', 'your-hotel')}
                                        aria-invalid={errors.slug ? 'true' : 'false'}
                                        aria-describedby="slug-status"
                                        className="flex-1 min-w-0 px-3 py-3 text-[15px] font-mono text-[#101828] placeholder:text-[#98A2B3] focus:outline-none bg-white"
                                    />
                                </div>
                                <div id="slug-status" aria-live="polite" className="mt-2 space-y-1.5">
                                    {effectiveSlug && (
                                        <p className="text-[12px] text-[#667085] break-all">
                                            {t('register_hotel.slug_preview', 'Your page:')}{' '}
                                            <span className="font-mono font-semibold text-[#344054]">{displayOrigin}/{effectiveSlug}</span>
                                        </p>
                                    )}
                                    {errors.slug ? (
                                        <FieldError id="slug-error" message={errors.slug} />
                                    ) : !effectiveSlug ? (
                                        <p className="text-[12px] text-[#667085]">{t('register_hotel.slug_hint', 'We’ll suggest one from your hotel name.')}</p>
                                    ) : slugChecking ? (
                                        <p className="text-[12px] text-[#667085] flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> {t('register_hotel.slug_checking', 'Checking availability…')}</p>
                                    ) : slugCheck.isError ? (
                                        <p className="text-[12px] text-[#667085]">{t('register_hotel.slug_check_failed', "Couldn't check right now — we'll confirm when you submit.")}</p>
                                    ) : check?.available ? (
                                        <p className="text-[12px] font-semibold text-[#067647] flex items-center gap-1.5"><CheckCircle2 size={14} /> {t('register_hotel.slug_available', 'Available')}</p>
                                    ) : slugUnavailable ? (
                                        <p className="text-[12px] font-semibold text-red-600 flex items-center gap-1.5"><XCircle size={14} /> {reasonText(check?.reason)}</p>
                                    ) : null}
                                    {suggestions.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[12px] text-[#667085]">{t('register_hotel.slug_try', 'Try:')}</span>
                                            {suggestions.map(s => (
                                                <button
                                                    key={s} type="button" onClick={() => pickSlug(s)}
                                                    className="px-2.5 py-1 rounded-lg bg-[#FFF3E6] text-[#B54708] text-[12px] font-mono font-semibold hover:bg-[#FFE7CC] transition-colors"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {slugTouched && trimmedName.length >= 2 && (
                                        <button type="button" onClick={followName} className="text-[12px] font-semibold text-[#FE8301] hover:underline">
                                            {t('register_hotel.slug_reset', 'Use the suggested address')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Plan picker (optional) */}
                            {plans.length > 0 && (
                                <fieldset>
                                    <legend className={labelCls}>
                                        {t('register_hotel.plan', 'Plan')} <span className="font-medium text-[#98A2B3]">{t('register_hotel.optional', '(optional)')}</span>
                                    </legend>
                                    {cycleOptions.length > 1 && (
                                        <div className="mb-3 flex flex-wrap items-center gap-2">
                                            <CycleToggle options={cycleOptions} value={billingCycle} onChange={setBillingCycle} />
                                            <span className="text-[12px] text-[#667085]">
                                                {t('register_hotel.cycle_hint', 'Prices before {{rate}}% GST.', { rate: Number.isFinite(Number(plans[0]?.gstRate)) ? Number(plans[0].gstRate) : DEFAULT_GST_RATE })}
                                            </span>
                                        </div>
                                    )}
                                    <div className="grid gap-2" data-testid="plan-picker">
                                        {[{ _id: '', name: t('register_hotel.plan_later', 'Decide later') }, ...plans].map((p) => {
                                            const isLater = !p._id;
                                            const kind = isLater ? 'later' : planKind(p);
                                            const contact = kind === 'contact';
                                            const checked = isLater ? !selectedPlan : (selectedPlan?._id || '') === p._id;
                                            const price = isLater ? null : formatPlanCyclePrice(p, billingCycle);
                                            const days = isLater ? 0 : trialDaysOf(p);
                                            return (
                                                <label
                                                    key={p._id || 'later'}
                                                    data-testid={`plan-option-${p.slug || p._id || 'later'}`}
                                                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                                                        contact ? 'cursor-default border-[#EAECF0] bg-[#F9FAFB]' : 'cursor-pointer'
                                                    } ${checked ? 'border-[#FE8301] bg-[#FFF8F0] ring-1 ring-[#FE8301]' : contact ? '' : 'border-[#EAECF0] hover:border-[#D0D5DD]'}`}
                                                >
                                                    <input
                                                        type="radio" name="planId" value={p._id} checked={checked} disabled={contact}
                                                        onChange={() => { setValues(prev => ({ ...prev, planId: p._id })); clearError('planId'); }}
                                                        className="accent-[#FE8301] w-4 h-4"
                                                    />
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-[14px] font-bold text-[#101828] capitalize">{p.name}</span>
                                                        {isLater && (
                                                            <span className="block text-[12px] text-[#667085]">{t('register_hotel.plan_later_hint', 'Our team will help you choose.')}</span>
                                                        )}
                                                        {kind === 'trial' && (
                                                            <span className="block text-[12px] text-[#067647] font-semibold">
                                                                {t('platform.pricing.trial', '{{days}}-day free trial', { days: days || 14 })}
                                                            </span>
                                                        )}
                                                        {kind === 'free' && (
                                                            <span className="block text-[12px] text-[#067647] font-semibold">{t('register_hotel.plan_free', 'Free')}</span>
                                                        )}
                                                        {kind === 'paid' && price && (
                                                            <span className="block text-[12px] text-[#B54708] font-semibold">
                                                                {t('register_hotel.plan_pay', 'Pay {{amount}} {{per}}', { amount: price.amount, per: price.per })}
                                                                {price.savingsPct > 0 && !price.fellBack && <> · {t('platform.pricing.save', 'Save {{pct}}%', { pct: price.savingsPct })}</>}
                                                            </span>
                                                        )}
                                                        {contact && (
                                                            <span className="block text-[12px] text-[#667085]">
                                                                <Link to="/contact" className="font-semibold text-[#FE8301] hover:underline">{t('platform.cta.contact_sales', 'Contact Sales')}</Link>
                                                            </span>
                                                        )}
                                                    </span>
                                                    {price && kind !== 'free' && !contact && (
                                                        <span className="text-[14px] font-extrabold text-[#101828] shrink-0">
                                                            {price.amount} <span className="text-[12px] font-semibold text-[#667085]">{price.per}</span>
                                                        </span>
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <FieldError id="planId-error" message={errors.planId} />
                                </fieldset>
                            )}

                            <button type="submit" className={`${primaryBtn} w-full`}>
                                {t('register_hotel.continue', 'Continue')} <ArrowRight size={17} />
                            </button>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleSubmit} noValidate className="space-y-5">
                            <div>
                                <label htmlFor="ownerName" className={labelCls}>{t('register_hotel.owner', 'Your full name')}</label>
                                <IconInput
                                    icon={User} id="ownerName" error={errors.ownerName}
                                    value={values.ownerName} onChange={setField('ownerName')}
                                    maxLength={80} autoComplete="name" required
                                />
                                <FieldError id="ownerName-error" message={errors.ownerName} />
                            </div>

                            <div>
                                <label htmlFor="contactEmail" className={labelCls}>{t('register_hotel.email', 'Email')}</label>
                                <IconInput
                                    icon={Mail} id="contactEmail" type="email" error={errors.contactEmail}
                                    value={values.contactEmail} onChange={setField('contactEmail')}
                                    maxLength={120} autoComplete="email" required inputMode="email"
                                    placeholder="you@yourhotel.com"
                                />
                                {!errors.contactEmail && (
                                    <p className="mt-1.5 text-[12px] text-[#667085]">
                                        {outcome === 'trial'
                                            ? t('register_hotel.email_hint', 'You’ll use this to sign in. We’ll send your trial details here.')
                                            : t('register_hotel.email_hint_account', 'You’ll use this to sign in. We’ll send your account details here.')}
                                    </p>
                                )}
                                <FieldError id="contactEmail-error" message={errors.contactEmail} />
                            </div>

                            <div>
                                <label htmlFor="contactPhone" className={labelCls}>{t('register_hotel.phone', 'Mobile number')}</label>
                                {/* Digits only, max 10. A pasted "+91 98765-43210" is
                                    normalised to 9876543210 (utils/mobile). No maxLength:
                                    it would truncate the paste before onChange runs. */}
                                <IconInput
                                    icon={Phone} id="contactPhone" {...mobileInputAttrs}
                                    error={errors.contactPhone || livePhoneError}
                                    value={values.contactPhone}
                                    onChange={(e) => { setValues(prev => ({ ...prev, contactPhone: sanitizeMobileInput(e.target.value) })); clearError('contactPhone'); }}
                                    onBlur={() => setPhoneBlurred(true)}
                                    required placeholder="98765 43210"
                                />
                                {!(errors.contactPhone || livePhoneError) && (
                                    <p className="mt-1.5 text-[12px] text-[#667085] tabular-nums">
                                        {t('register_hotel.phone_hint', '10-digit Indian mobile')} · {values.contactPhone.length}/10
                                    </p>
                                )}
                                <FieldError id="contactPhone-error" message={errors.contactPhone || livePhoneError} />
                            </div>

                            <div>
                                <label htmlFor="password" className={labelCls}>{t('register_hotel.password', 'Password')}</label>
                                <div className="relative">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A2B3] pointer-events-none" aria-hidden="true" />
                                    <input
                                        id="password" name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        autoComplete="new-password" required
                                        value={values.password}
                                        onChange={setField('password')}
                                        onBlur={() => {
                                            if (!values.password) return;
                                            const pwErr = passwordError(values.password);
                                            if (pwErr) setErrors(prev => ({ ...prev, password: pwErr }));
                                        }}
                                        aria-invalid={errors.password ? 'true' : 'false'}
                                        aria-describedby={errors.password ? 'password-error' : 'password-strength'}
                                        placeholder={t('register_hotel.password_ph', 'At least {{n}} characters', { n: MIN_LENGTH })}
                                        className={`${errors.password ? inputErr : inputOk} pl-10 pr-11`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        aria-label={showPassword ? t('register_hotel.hide_pw', 'Hide password') : t('register_hotel.show_pw', 'Show password')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#667085] hover:text-[#FE8301]"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <PasswordStrengthMeter password={values.password} />
                                <FieldError id="password-error" message={errors.password} />
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className={labelCls}>{t('register_hotel.confirm', 'Confirm password')}</label>
                                <IconInput
                                    icon={Lock} id="confirmPassword" type={showPassword ? 'text' : 'password'} error={errors.confirmPassword}
                                    value={values.confirmPassword} onChange={setField('confirmPassword')}
                                    autoComplete="new-password" required
                                />
                                <FieldError id="confirmPassword-error" message={errors.confirmPassword} />
                            </div>

                            <div>
                                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                                    <input
                                        id="acceptTerms" type="checkbox"
                                        checked={values.acceptTerms} onChange={setField('acceptTerms')}
                                        aria-invalid={errors.acceptTerms ? 'true' : 'false'}
                                        aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined}
                                        className="mt-0.5 w-4 h-4 accent-[#FE8301] shrink-0"
                                    />
                                    <span className="text-[13px] text-[#344054] leading-relaxed">
                                        {t('register_hotel.terms_a', 'I agree to the')}{' '}
                                        <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FE8301] underline underline-offset-2">{t('register_hotel.terms', 'Terms')}</a>
                                        {' '}{t('register_hotel.terms_and', '&')}{' '}
                                        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FE8301] underline underline-offset-2">{t('register_hotel.privacy', 'Privacy Policy')}</a>
                                    </span>
                                </label>
                                <FieldError id="acceptTerms-error" message={errors.acceptTerms} />
                            </div>

                            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setStep(1); setFormError(''); focusField('restaurantName'); }}
                                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-[15px] font-bold text-[#344054] border border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors"
                                >
                                    <ArrowLeft size={17} /> {t('register_hotel.back', 'Back')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    aria-busy={submitting ? 'true' : 'false'}
                                    className={`${primaryBtn} flex-1`}
                                >
                                    {submitting
                                        ? <><Loader2 size={17} className="animate-spin" /> {t('register_hotel.submitting', 'Submitting…')}</>
                                        : isPaid
                                            ? <>{step2Label} <ArrowRight size={17} /></>
                                            : <><BadgeCheck size={17} /> {step2Label}</>}
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 3 && isPaid && selectedPlan && (
                        <div className="space-y-5" data-testid="payment-step">
                            <div className="rounded-2xl border border-[#EAECF0] overflow-hidden">
                                <div className="px-4 py-3 bg-[#F9FAFB] border-b border-[#EAECF0] flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-[14px] font-bold text-[#101828] capitalize">{selectedPlan.name}</p>
                                        <p className="text-[12px] text-[#667085]">
                                            {t('register_hotel.pay_billed', 'Billed {{cycle}} · same price at renewal', { cycle: cycleLabel(effectiveCycle).toLowerCase() })}
                                        </p>
                                    </div>
                                    <CycleToggle options={planCycleOptions} value={effectiveCycle} onChange={setBillingCycle} idPrefix="payment-cycle" />
                                </div>
                                <dl className="px-4 py-3 text-[14px] text-[#344054] space-y-2">
                                    <div className="flex justify-between gap-3">
                                        <dt>{t('register_hotel.pay_plan_price', 'Plan price')} <span className="text-[#98A2B3]">{cycleSuffix(effectiveCycle)}</span></dt>
                                        <dd className="font-semibold tabular-nums">
                                            {formatINR(order && !mismatch && Number.isFinite(paiseToRupees(order.baseAmount)) ? paiseToRupees(order.baseAmount) : paidRow?.price)}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt>{t('register_hotel.pay_gst', 'GST ({{rate}}%)', { rate: order && !mismatch && Number.isFinite(Number(order.gstRate)) ? Number(order.gstRate) : gstRate })}</dt>
                                        <dd className="font-semibold tabular-nums">
                                            {formatINR(order && !mismatch && Number.isFinite(paiseToRupees(order.gstAmount)) ? paiseToRupees(order.gstAmount) : paidRow?.gst)}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3 pt-2 border-t border-[#EAECF0] text-[15px]">
                                        <dt className="font-bold text-[#101828]">{t('register_hotel.pay_total', 'Total due today')}</dt>
                                        <dd className="font-extrabold text-[#101828] tabular-nums" data-testid="payment-total">{formatINR(payAmount)}</dd>
                                    </div>
                                </dl>
                            </div>

                            {mismatch && (
                                <div role="alert" data-testid="payment-mismatch" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">
                                    <p className="font-bold flex items-center gap-2"><AlertCircle size={16} /> {t('register_hotel.pay_mismatch', 'The amount changed, please review.')}</p>
                                    <p className="mt-1">
                                        {t('register_hotel.pay_mismatch_detail', 'We showed {{expected}}; the current price for this plan is {{actual}}.', {
                                            expected: formatINR(mismatch.expected), actual: formatINR(mismatch.actual),
                                        })}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMismatch(null)}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501]"
                                        >
                                            {t('register_hotel.pay_accept_new', 'Continue with {{amount}}', { amount: formatINR(mismatch.actual) })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setStep(1); setFormError(''); }}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-bold text-[#344054] border border-[#EAECF0] bg-white hover:bg-[#F9FAFB]"
                                        >
                                            {t('register_hotel.pay_change_plan', 'Change plan')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {orderError && (
                                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">
                                    <p className="font-semibold">{orderError}</p>
                                    <button
                                        type="button"
                                        onClick={() => setOrderNonce(n => n + 1)}
                                        className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#B42318] underline underline-offset-2"
                                    >
                                        <RefreshCw size={14} /> {t('register_hotel.pay_retry', 'Try again')}
                                    </button>
                                </div>
                            )}

                            <p className="text-[12px] text-[#667085] flex items-start gap-1.5">
                                <ShieldCheck size={14} className="shrink-0 mt-px text-[#067647]" />
                                {t('register_hotel.pay_secure', 'Payment is handled by Razorpay. Your account is created only after the payment succeeds.')}
                            </p>

                            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setStep(2); setFormError(''); }}
                                    disabled={paying || submitting}
                                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-[15px] font-bold text-[#344054] border border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors disabled:opacity-60"
                                >
                                    <ArrowLeft size={17} /> {t('register_hotel.back', 'Back')}
                                </button>
                                {!orderLoading && !orderError && order && !mismatch && (
                                    <button
                                        type="button"
                                        onClick={() => setOrderNonce(n => n + 1)}
                                        disabled={paying || submitting}
                                        title={t('register_hotel.pay_refresh', 'Refresh amount')}
                                        className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-[14px] font-bold text-[#344054] border border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors disabled:opacity-60"
                                    >
                                        <RefreshCw size={16} /> <span className="sm:hidden">{t('register_hotel.pay_refresh', 'Refresh amount')}</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={payNow}
                                    disabled={!order || orderLoading || Boolean(mismatch) || Boolean(orderError) || paying || submitting}
                                    aria-busy={orderLoading || paying || submitting ? 'true' : 'false'}
                                    data-testid="pay-button"
                                    className={`${primaryBtn} flex-1`}
                                >
                                    {submitting
                                        ? <><Loader2 size={17} className="animate-spin" /> {t('register_hotel.pay_finishing', 'Finishing your signup…')}</>
                                        : paying
                                            ? <><Loader2 size={17} className="animate-spin" /> {t('register_hotel.pay_opening', 'Opening payment…')}</>
                                            : orderLoading
                                                ? <><Loader2 size={17} className="animate-spin" /> {t('register_hotel.pay_button', 'Pay {{amount}}', { amount: formatINR(payAmount) })}</>
                                                : <><CreditCard size={17} /> {t('register_hotel.pay_button', 'Pay {{amount}}', { amount: formatINR(payAmount) })}</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <p className="mt-5 text-center text-[13px] text-[#667085]">
                {t('register_hotel.have_account', 'Already have an account?')}{' '}
                <Link to="/staff-login" className="font-semibold text-[#FE8301] hover:underline">{t('platform.nav.staff_login', 'Staff login')}</Link>
                {' · '}
                <Link to="/request-demo" className="font-semibold text-[#FE8301] hover:underline">{t('platform.cta.demo', 'Request a demo')}</Link>
            </p>
        </SignupShell>
    );
};

export default RegisterRestaurant;
