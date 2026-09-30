// Hotel SELF-SIGNUP — route /register-restaurant. Two steps ("Your hotel",
// "Your account") → POST /public/register-restaurant → "Application received".
// The signup lands in Super Admin → Pending Approvals; the owner can sign in
// at /staff-login once it's approved (until then login answers 403
// SIGNUP_PENDING, which Pages/Login.jsx renders as a status panel).
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
    Building2, MapPin, Globe, User, Mail, Phone, Lock, Eye, EyeOff, ArrowLeft, ArrowRight,
    CheckCircle2, XCircle, Loader2, BadgeCheck, MailCheck, LogIn, Clock4, AlertCircle,
} from 'lucide-react';
import { publicAPI } from '../../utils/api';
import { getPublicAppOrigin } from '../../utils/customerLinks';
import { passwordError, MIN_LENGTH } from '../../utils/passwordPolicy';
import PasswordStrengthMeter from '../../Components/Common/PasswordStrengthMeter';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { PlatformBrand } from './components/PlatformChrome';
import { usePageMeta, usePublicPlans, formatPlanPrice, readUtm } from './platformShared';

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
};
const FORM_FIELDS = new Set([
    'restaurantName', 'city', 'slug', 'planId', 'ownerName', 'contactEmail',
    'contactPhone', 'password', 'confirmPassword', 'acceptTerms',
]);

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

const inputBase = 'w-full py-3 pr-4 border rounded-xl text-[15px] bg-white text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 transition-all';
const inputOk = `${inputBase} border-[#D0D5DD] focus:ring-[#FE8301]/25 focus:border-[#FE8301]`;
const inputErr = `${inputBase} border-red-400 focus:ring-red-200 focus:border-red-500`;
const labelCls = 'block text-[13px] font-bold text-[#344054] mb-1.5';

function FieldError({ id, message }) {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="mt-1.5 text-[12px] text-red-600 flex items-start gap-1">
            <AlertCircle size={13} className="shrink-0 mt-px" /> {message}
        </p>
    );
}

function IconInput({ icon, id, error, className = '', ...props }) {
    const Icon = icon;
    return (
        <div className="relative">
            <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A2B3] pointer-events-none" aria-hidden="true" />
            <input
                id={id}
                name={id}
                aria-invalid={error ? 'true' : 'false'}
                aria-describedby={error ? `${id}-error` : undefined}
                className={`${error ? inputErr : inputOk} pl-10 ${className}`}
                {...props}
            />
        </div>
    );
}

const RegisterRestaurant = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
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
    const [slugTouched, setSlugTouched] = useState(false);
    const [serverSuggestions, setServerSuggestions] = useState([]);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [result, setResult] = useState(null);

    const plansQuery = usePublicPlans();
    const plans = plansQuery.data || [];
    // ?plan= may carry a plan _id (pricing cards) or its slug (hand-made links).
    const selectedPlan = values.planId
        ? (plans.find(p => p._id === values.planId || (p.slug && p.slug === values.planId)) || null)
        : null;

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
        const phone = values.contactPhone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
        if (!/^[6-9]\d{9}$/.test(phone)) e.contactPhone = t('register_hotel.err_phone', 'Please enter a valid 10-digit mobile number.');
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

    // ── Submit ────────────────────────────────────────────────────────
    const handleSubmit = async (ev) => {
        ev.preventDefault();
        setFormError('');
        const e1 = validateStep1();
        if (Object.keys(e1).length) {
            setErrors(e1);
            setStep(1);
            focusField(Object.keys(e1)[0]);
            return;
        }
        const e2 = validateStep2();
        setErrors(e2);
        const first = Object.keys(e2)[0];
        if (first) { focusField(first); return; }

        // Send the address only when the owner chose it or the server has
        // confirmed the name-derived one; otherwise let the server derive it.
        const sendSlug = slugTouched
            ? effectiveSlug
            : (check?.available && check?.slug ? check.slug : undefined);
        const payload = {
            restaurantName: trimmedName,
            ownerName: values.ownerName.trim(),
            contactEmail: values.contactEmail.trim().toLowerCase(),
            contactPhone: values.contactPhone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''),
            city: values.city.trim(),
            password: values.password,
            acceptTerms: true,
            source: attribution.source,
            ...(sendSlug ? { slug: sendSlug } : {}),
            ...(selectedPlan ? { planId: selectedPlan._id } : {}),
            ...(attribution.utm ? { utm: attribution.utm } : {}),
        };

        setSubmitting(true);
        try {
            const res = await publicAPI.registerRestaurant(payload);
            const data = res.data?.data || {};
            setResult({
                name: data.restaurant?.name || trimmedName,
                slug: data.restaurant?.slug || sendSlug || '',
                pageUrl: data.pageUrl || '',
                message: data.message || res.data?.message || '',
                email: data.owner?.email || payload.contactEmail,
                planName: data.requestedPlan?.name || selectedPlan?.name || '',
            });
            setStep('done');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            const status = err.response?.status;
            const body = err.response?.data || {};
            if (!err.response) {
                setFormError(t('register_hotel.err_network', "We couldn't reach BestoDine. Check your connection and try again."));
            } else if (status === 429) {
                setFormError(body.message || t('register_hotel.err_rate', 'Too many signup attempts from this network. Please try again in a little while.'));
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
                    if (STEP1_FIELDS.has(field)) setStep(1);
                    focusField(field);
                } else {
                    setFormError(message);
                }
            }
        } finally {
            setSubmitting(false);
        }
    };

    // ── Success ───────────────────────────────────────────────────────
    if (step === 'done' && result) {
        const pageUrl = result.pageUrl || (result.slug ? `${origin}/${result.slug}` : '');
        return (
            <Shell>
                <div className="bg-white rounded-3xl border border-[#EAECF0] shadow-[0_12px_40px_rgba(16,24,40,0.08)] p-6 sm:p-8" role="status">
                    <div className="w-14 h-14 rounded-2xl bg-[#ECFDF3] text-[#067647] flex items-center justify-center">
                        <CheckCircle2 size={28} />
                    </div>
                    <h1 className="mt-5 text-[26px] font-extrabold tracking-tight text-[#101828]">
                        {t('register_hotel.done_title', 'Application received')}
                    </h1>
                    <p className="mt-2 text-[15px] text-[#475467] leading-relaxed">
                        {result.message || t('register_hotel.done_body', 'Thanks for registering {{name}} on BestoDine.', { name: result.name })}
                    </p>
                    <h2 className="mt-6 text-[13px] font-bold uppercase tracking-wide text-[#667085]">{t('register_hotel.next_title', 'What happens next')}</h2>
                    <ol className="mt-3 space-y-4">
                        <li className="flex gap-3">
                            <span className="w-9 h-9 rounded-xl bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center shrink-0"><Clock4 size={17} /></span>
                            <span className="text-[14px] text-[#344054] leading-relaxed">
                                <strong className="text-[#101828]">{t('register_hotel.next1_title', 'We review your application')}</strong><br />
                                {t('register_hotel.next1_body', 'Usually within one business day.')}
                            </span>
                        </li>
                        <li className="flex gap-3">
                            <span className="w-9 h-9 rounded-xl bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center shrink-0"><MailCheck size={17} /></span>
                            <span className="text-[14px] text-[#344054] leading-relaxed">
                                <strong className="text-[#101828]">{t('register_hotel.next2_title', 'You get an email when approved')}</strong><br />
                                {t('register_hotel.next2_body', "We'll write to {{email}}. Then sign in at staff login with the password you just created.", { email: result.email })}
                            </span>
                        </li>
                        {pageUrl && (
                            <li className="flex gap-3">
                                <span className="w-9 h-9 rounded-xl bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center shrink-0"><Globe size={17} /></span>
                                <span className="text-[14px] text-[#344054] leading-relaxed min-w-0">
                                    <strong className="text-[#101828]">{t('register_hotel.next3_title', 'Your page goes live')}</strong><br />
                                    {t('register_hotel.next3_body', 'Once approved, guests can find you at')}{' '}
                                    <span className="font-mono text-[13px] font-semibold text-[#B54708] break-all">{pageUrl.replace(/^https?:\/\//, '')}</span>
                                </span>
                            </li>
                        )}
                    </ol>
                    {result.planName && (
                        <p className="mt-5 text-[13px] text-[#667085]">
                            {t('register_hotel.done_plan', 'Requested plan:')}{' '}
                            <span className="font-semibold text-[#344054] capitalize">{result.planName}</span>
                            {' — '}{t('register_hotel.done_plan_note', 'our team will confirm it when approving your account.')}
                        </p>
                    )}
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                        <Link to="/staff-login" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] transition-colors">
                            <LogIn size={17} /> {t('register_hotel.go_login', 'Go to staff login')}
                        </Link>
                        <Link to="/" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[15px] font-bold text-[#1A181B] border border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors">
                            {t('register_hotel.go_home', 'Back to BestoDine')}
                        </Link>
                    </div>
                </div>
            </Shell>
        );
    }

    // ── Form ──────────────────────────────────────────────────────────
    const stepLabels = [t('register_hotel.step1', 'Your hotel'), t('register_hotel.step2', 'Your account')];

    return (
        <Shell>
            <div className="bg-white rounded-3xl border border-[#EAECF0] shadow-[0_12px_40px_rgba(16,24,40,0.08)] overflow-hidden">
                <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-5 border-b border-[#F2F4F7]">
                    <h1 className="text-[24px] sm:text-[26px] font-extrabold tracking-tight text-[#101828]">
                        {t('register_hotel.title', 'Register your hotel')}
                    </h1>
                    <p className="mt-1 text-[14px] text-[#667085]">
                        {t('register_hotel.subtitle', 'Two quick steps. We review every application before it goes live.')}
                    </p>
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
                    {formError && (
                        <div role="alert" className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-[14px] text-red-700 font-medium">
                            <AlertCircle size={17} className="shrink-0 mt-0.5" /> {formError}
                        </div>
                    )}

                    {step === 1 ? (
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
                                    <div className="grid gap-2">
                                        {[{ _id: '', name: t('register_hotel.plan_later', 'Decide later') }, ...plans].map((p) => {
                                            const checked = (selectedPlan?._id || '') === p._id;
                                            const price = p._id ? formatPlanPrice(p) : null;
                                            const trial = Number(p.trialDays) || 0;
                                            return (
                                                <label
                                                    key={p._id || 'later'}
                                                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ${
                                                        checked ? 'border-[#FE8301] bg-[#FFF8F0] ring-1 ring-[#FE8301]' : 'border-[#EAECF0] hover:border-[#D0D5DD]'
                                                    }`}
                                                >
                                                    <input
                                                        type="radio" name="planId" value={p._id} checked={checked}
                                                        onChange={() => { setValues(prev => ({ ...prev, planId: p._id })); clearError('planId'); }}
                                                        className="accent-[#FE8301] w-4 h-4"
                                                    />
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-[14px] font-bold text-[#101828] capitalize">{p.name}</span>
                                                        {p._id && trial > 0 && (
                                                            <span className="block text-[12px] text-[#067647] font-semibold">
                                                                {t('platform.pricing.trial', '{{days}}-day free trial', { days: trial })}
                                                            </span>
                                                        )}
                                                        {!p._id && (
                                                            <span className="block text-[12px] text-[#667085]">{t('register_hotel.plan_later_hint', 'Our team will help you choose.')}</span>
                                                        )}
                                                    </span>
                                                    {price && (
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

                            <button
                                type="submit"
                                className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] shadow-[0_6px_20px_rgba(254,131,1,0.3)] transition-colors"
                            >
                                {t('register_hotel.continue', 'Continue')} <ArrowRight size={17} />
                            </button>
                        </form>
                    ) : (
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
                                    <p className="mt-1.5 text-[12px] text-[#667085]">{t('register_hotel.email_hint', 'You’ll use this to sign in. We’ll email you here when you’re approved.')}</p>
                                )}
                                <FieldError id="contactEmail-error" message={errors.contactEmail} />
                            </div>

                            <div>
                                <label htmlFor="contactPhone" className={labelCls}>{t('register_hotel.phone', 'Mobile number')}</label>
                                <IconInput
                                    icon={Phone} id="contactPhone" type="tel" inputMode="numeric" error={errors.contactPhone}
                                    value={values.contactPhone}
                                    onChange={(e) => { setValues(prev => ({ ...prev, contactPhone: e.target.value.replace(/[^\d+\s-]/g, '').slice(0, 16) })); clearError('contactPhone'); }}
                                    autoComplete="tel-national" required placeholder="98765 43210"
                                />
                                <FieldError id="contactPhone-error" message={errors.contactPhone} />
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
                                    className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 rounded-xl text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] shadow-[0_6px_20px_rgba(254,131,1,0.3)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                >
                                    {submitting
                                        ? <><Loader2 size={17} className="animate-spin" /> {t('register_hotel.submitting', 'Submitting…')}</>
                                        : <><BadgeCheck size={17} /> {t('register_hotel.submit', 'Submit application')}</>}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
            <p className="mt-5 text-center text-[13px] text-[#667085]">
                {t('register_hotel.have_account', 'Already approved?')}{' '}
                <Link to="/staff-login" className="font-semibold text-[#FE8301] hover:underline">{t('platform.nav.staff_login', 'Staff login')}</Link>
                {' · '}
                <Link to="/request-demo" className="font-semibold text-[#FE8301] hover:underline">{t('platform.cta.demo', 'Request a demo')}</Link>
            </p>
        </Shell>
    );
};

/** Page frame: slim brand bar, benefits column on desktop, content column. */
function Shell({ children }) {
    const { t } = useTranslation();
    const perks = [
        t('register_hotel.perk1', 'QR table ordering — no app for your guests'),
        t('register_hotel.perk2', 'Kitchen display, waiter & captain apps'),
        t('register_hotel.perk3', 'Table & hall bookings, wallet and loyalty'),
        t('register_hotel.perk4', 'Razorpay payments and reports'),
    ];
    return (
        <div className="min-h-screen bg-[#FCFCFD]">
            <header className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
                <PlatformBrand />
                <Link to="/staff-login" className="text-[14px] font-semibold text-[#344054] hover:text-[#FE8301]">
                    {t('platform.nav.staff_login', 'Staff login')}
                </Link>
            </header>
            <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 pt-2 sm:pt-6 grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-start">
                <aside className="hidden lg:block sticky top-8 rounded-3xl bg-linear-to-br from-[#FE8301] to-[#FF6B00] text-white p-8 overflow-hidden">
                    <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/80">BestoDine</p>
                    <h2 className="mt-3 text-[30px] leading-tight font-extrabold tracking-tight">
                        {t('register_hotel.aside_title', 'Bring your restaurant online in a day.')}
                    </h2>
                    <ul className="mt-6 space-y-3">
                        {perks.map(p => (
                            <li key={p} className="flex items-start gap-2.5 text-[15px] font-medium">
                                <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> {p}
                            </li>
                        ))}
                    </ul>
                    <p className="mt-8 text-[13px] text-white/85 leading-relaxed">
                        {t('register_hotel.aside_note', 'Every application is reviewed by our team — usually within one business day.')}
                    </p>
                </aside>
                <div className="w-full max-w-xl mx-auto lg:mx-0">{children}</div>
            </main>
        </div>
    );
}

export default RegisterRestaurant;
