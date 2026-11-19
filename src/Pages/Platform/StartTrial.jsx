// FREE-TRIAL SIGNUP — route /start-trial → POST /public/start-trial.
//
// Why this is a separate route from /register-restaurant (plan §4):
//  - different funnel: one short form vs. a multi-step page with plan
//    picker, web-address check and (for paid plans) a payment step;
//  - different trust model: this page sends NO plan, price or trial length
//    — the server decides the trial plan (TRIAL_PLAN_SLUG) and duration;
//  - different guards: its own rate limit, its own duplicate checks and its
//    own messages;
//  - different data: the server tags it `registrationSource:
//    'self_service_trial'` for analytics, the trial lifecycle and Leads;
//  - keeping /register-restaurant strict, so trial changes never weaken
//    its payment validation.
//
// Body: { orgName, email, phone?, adminName, adminPassword }. 201 → the
// login body + data.trialStarted (sign in, open the dashboard); 202 →
// approval mode ("Application received"). Errors: 400 field errors
// (`field`/`code`), 409 EMAIL_IN_USE / PHONE_IN_USE, 503 TRIAL_UNAVAILABLE,
// 429 rate limit — all rendered inline (the request is _silent).
import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, User, Mail, Phone, Lock, Eye, EyeOff, Loader2, BadgeCheck } from 'lucide-react';
import { publicAPI } from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import { setActiveTenant } from '../../utils/tenant';
import { sanitizeMobileInput, mobileError, mobileInputAttrs } from '../../utils/mobile';
import { MIN_LENGTH } from '../../utils/passwordPolicy';
import PasswordStrengthMeter from '../../Components/Common/PasswordStrengthMeter';
import { usePageMeta } from './platformShared';
import ProvisioningProgress from './components/ProvisioningProgress';
import { useProvisioning, useProvisioningSteps } from './components/useProvisioning';
import {
    SignupShell, ApplicationReceived, FieldError, IconInput, FormErrorBanner, inputOk, inputErr, labelCls, primaryBtn,
} from './components/SignupShared';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM_FIELDS = new Set(['orgName', 'adminName', 'email', 'phone', 'adminPassword']);
// Server `field` names → form fields (the server accepts a few aliases, so
// its error `field` may name either spelling).
const FIELD_ALIASES = {
    restaurantName: 'orgName', name: 'orgName', restaurant: 'orgName',
    ownerName: 'adminName', adminName: 'adminName',
    contactEmail: 'email', email: 'email',
    contactPhone: 'phone', mobile: 'phone', phone: 'phone',
    password: 'adminPassword', adminPassword: 'adminPassword',
};
const CODE_FIELDS = {
    EMAIL_IN_USE: 'email',
    PHONE_IN_USE: 'phone',
    WEAK_PASSWORD: 'adminPassword',
    INVALID_EMAIL: 'email',
    INVALID_PHONE: 'phone',
};

const StartTrial = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { startSession } = useAuth();
    usePageMeta(
        t('platform.start_trial.meta_title', 'Start your free trial — BestoDine'),
        t('platform.start_trial.meta_description', 'Start a 14-day free trial of BestoDine: QR ordering, kitchen display, waiter app, bookings and payments. No card needed.'),
    );

    const [values, setValues] = useState({ orgName: '', adminName: '', email: '', phone: '', adminPassword: '' });
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState('');
    // Set with EMAIL_IN_USE so the banner/field can offer "Sign in".
    const [emailInUse, setEmailInUse] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [phoneBlurred, setPhoneBlurred] = useState(false);
    const [result, setResult] = useState(null); // 202 outcome
    const [showConfirm, setShowConfirm] = useState(false);
    const formErrorRef = useRef(null);
    const { provisioning, start: startProvisioning } = useProvisioning();
    const steps = useProvisioningSteps();

    const clearError = (field) => {
        setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));
        setFormError('');
        if (field === 'email') setEmailInUse(false);
    };
    const setField = (field) => (e) => {
        const v = e.target.value;
        setValues(prev => ({ ...prev, [field]: v }));
        clearError(field);
    };
    const focusField = (field) => {
        setTimeout(() => {
            const el = document.getElementById(field);
            if (el) { el.focus(); el.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
        }, 60);
    };

    const validate = () => {
        const e = {};
        const org = values.orgName.trim();
        if (org.length < 2) e.orgName = t('platform.start_trial.err_org_name', 'Please enter your restaurant name.');
        else if (org.length > 80) e.orgName = t('platform.start_trial.err_org_name_long', 'Name cannot exceed 80 characters.');
        const admin = values.adminName.trim();
        if (admin.length < 2) e.adminName = t('platform.start_trial.err_admin_name', 'Please enter your name.');
        else if (admin.length > 80) e.adminName = t('platform.start_trial.err_admin_name_long', 'Name cannot exceed 80 characters.');
        const email = values.email.trim();
        if (!EMAIL_REGEX.test(email)) e.email = t('platform.start_trial.err_email', 'Please enter a valid email address.');
        else if (email.length > 120) e.email = t('platform.start_trial.err_email_long', 'Email cannot exceed 120 characters.');
        // Mobile is optional on this form; when given it must be a valid Indian number.
        const phoneErr = mobileError(values.phone, { required: false });
        if (phoneErr) e.phone = phoneErr;
        if (values.adminPassword.length < MIN_LENGTH) {
            e.adminPassword = t('platform.start_trial.err_password_short', 'Password must be at least {{n}} characters.', { n: MIN_LENGTH });
        }
        return e;
    };

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        setFormError('');
        setEmailInUse(false);
        const e = validate();
        setErrors(e);
        const first = Object.keys(e)[0];
        if (first) { focusField(first); return; }

        // Exactly the contract body — no plan, price or trial length.
        const payload = {
            orgName: values.orgName.trim(),
            email: values.email.trim().toLowerCase(),
            adminName: values.adminName.trim(),
            adminPassword: values.adminPassword,
            ...(values.phone ? { phone: values.phone } : {}),
        };

        setSubmitting(true);
        try {
            const res = await publicAPI.startTrial(payload);
            const data = res.data?.data || {};
            const name = data.restaurant?.name || payload.orgName;
            if (res.status === 201 && (res.data?.token || res.data?.cookieAuth)) {
                // eslint-disable-next-line no-unused-vars
                const { success, data: _d, message: _m, ...loginBody } = res.data;
                startProvisioning(name, steps.length, () => {
                    const session = startSession(loginBody);
                    if (session?.success) {
                        const tn = session.user?.tenant;
                        if (tn?.slug) setActiveTenant({ slug: tn.slug, name: tn.name, _id: tn._id });
                        toast.success(t('platform.start_trial.toast_started', 'Your 14-day free trial has started'), { id: 'start-trial-success' });
                        navigate('/admin/dashboard', { replace: true });
                    } else {
                        // Tokens were unusable: fall back to the sign-in page.
                        toast.success(t('platform.start_trial.toast_started', 'Your 14-day free trial has started'), { id: 'start-trial-success' });
                        navigate('/staff-login', { replace: true });
                    }
                });
                return;
            }
            // 202 (approval mode) — same presentation as /register-restaurant.
            setResult({
                name,
                slug: data.restaurant?.slug || '',
                pageUrl: data.pageUrl || '',
                message: data.message || res.data?.message || '',
                email: data.owner?.email || payload.email,
                planName: data.requestedPlan?.name || '',
            });
            setShowConfirm(true);
            toast.success(t('platform.start_trial.toast_submitted', 'Registration submitted — we’ll review and email you.'), { id: 'start-trial-success' });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            const status = err.response?.status;
            const body = err.response?.data || {};
            const generic = t('platform.start_trial.err_generic', 'We couldn’t start your trial. Please check your details and try again.');
            if (!err.response) {
                setFormError(t('platform.start_trial.err_network', 'We couldn’t reach BestoDine. Check your connection and try again.'));
            } else if (status === 429) {
                setFormError(body.message || t('platform.start_trial.err_rate', 'Too many signup attempts from this network. Please try again in a little while.'));
            } else if (status === 503 || body.code === 'TRIAL_UNAVAILABLE') {
                setFormError(body.message || t('platform.start_trial.err_unavailable', 'Free trials are temporarily unavailable. Please try again later or request a demo.'));
            } else {
                let field = CODE_FIELDS[body.code] || FIELD_ALIASES[body.field] || body.field;
                if (!FORM_FIELDS.has(field)) field = null;
                const message = body.message || generic;
                if (field) {
                    setErrors(prev => ({ ...prev, [field]: message }));
                    if (body.code === 'EMAIL_IN_USE') setEmailInUse(true);
                    focusField(field);
                } else {
                    setFormError(message);
                }
            }
            toast.error(body.message || generic, { id: 'start-trial-error' });
            setTimeout(() => formErrorRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 60);
        } finally {
            setSubmitting(false);
        }
    };

    const livePhoneError = values.phone && (values.phone.length === 10 || phoneBlurred)
        ? mobileError(values.phone, { required: false })
        : '';
    const asideNote = t('platform.start_trial.aside_note', '14 days free, no card needed, instant access. We set you up on our recommended plan; change it any time.');

    if (provisioning) {
        return (
            <SignupShell asideNote={asideNote}>
                <ProvisioningProgress name={provisioning.name} steps={steps} done={provisioning.done} />
            </SignupShell>
        );
    }

    if (result) {
        return (
            <SignupShell asideNote={asideNote}>
                <ApplicationReceived result={result} showConfirm={showConfirm} onCloseConfirm={() => setShowConfirm(false)} />
            </SignupShell>
        );
    }

    const signInLink = (
        <Link to="/staff-login" className="font-bold underline underline-offset-2 text-[#B42318] hover:text-[#912018]">
            {t('platform.start_trial.sign_in', 'Sign in')}
        </Link>
    );

    return (
        <SignupShell asideNote={asideNote}>
            <div className="bg-white rounded-3xl border border-[#EAECF0] shadow-[0_12px_40px_rgba(16,24,40,0.08)] overflow-hidden">
                <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-5 border-b border-[#F2F4F7]">
                    <h1 className="text-[24px] sm:text-[26px] font-extrabold tracking-tight text-[#101828]">
                        {t('platform.start_trial.title', 'Start your 14-day free trial')}
                    </h1>
                    <p className="mt-1 text-[14px] text-[#667085]">
                        {t('platform.start_trial.subtitle', 'One short form. No card, no plan to pick — you get instant access to every feature.')}
                    </p>
                </div>

                <div className="px-5 sm:px-8 py-6">
                    <FormErrorBanner innerRef={formErrorRef} message={formError} />

                    <form onSubmit={handleSubmit} noValidate className="space-y-5" data-testid="start-trial-form">
                        <div>
                            <label htmlFor="orgName" className={labelCls}>{t('platform.start_trial.org_name', 'Restaurant name')}</label>
                            <IconInput
                                icon={Building2} id="orgName" error={errors.orgName}
                                value={values.orgName} onChange={setField('orgName')}
                                maxLength={80} autoComplete="organization" required
                                placeholder={t('platform.start_trial.org_name_ph', 'e.g. Spice Garden')}
                            />
                            <FieldError id="orgName-error" message={errors.orgName} />
                        </div>

                        <div>
                            <label htmlFor="adminName" className={labelCls}>{t('platform.start_trial.admin_name', 'Your name')}</label>
                            <IconInput
                                icon={User} id="adminName" error={errors.adminName}
                                value={values.adminName} onChange={setField('adminName')}
                                maxLength={80} autoComplete="name" required
                            />
                            <FieldError id="adminName-error" message={errors.adminName} />
                        </div>

                        <div>
                            <label htmlFor="email" className={labelCls}>{t('platform.start_trial.email', 'Email')}</label>
                            <IconInput
                                icon={Mail} id="email" type="email" error={errors.email}
                                value={values.email} onChange={setField('email')}
                                maxLength={120} autoComplete="email" required inputMode="email"
                                placeholder="you@yourrestaurant.com"
                            />
                            {!errors.email && (
                                <p className="mt-1.5 text-[12px] text-[#667085]">{t('platform.start_trial.email_hint', 'You’ll use this to sign in.')}</p>
                            )}
                            {errors.email && (
                                <p id="email-error" role="alert" className="mt-1.5 text-[12px] text-red-600 flex flex-wrap items-center gap-1">
                                    <span>{errors.email}</span>
                                    {emailInUse && signInLink}
                                </p>
                            )}
                        </div>

                        <div>
                            <label htmlFor="phone" className={labelCls}>{t('platform.start_trial.phone', 'Mobile number')}</label>
                            <IconInput
                                icon={Phone} id="phone" {...mobileInputAttrs}
                                error={errors.phone || livePhoneError}
                                value={values.phone}
                                onChange={(e) => { setValues(prev => ({ ...prev, phone: sanitizeMobileInput(e.target.value) })); clearError('phone'); }}
                                onBlur={() => setPhoneBlurred(true)}
                                placeholder="98765 43210"
                            />
                            {!(errors.phone || livePhoneError) && (
                                <p className="mt-1.5 text-[12px] text-[#667085] tabular-nums">
                                    {t('platform.start_trial.phone_hint', '10-digit Indian mobile (optional)')} · {values.phone.length}/10
                                </p>
                            )}
                            <FieldError id="phone-error" message={errors.phone || livePhoneError} />
                        </div>

                        <div>
                            <label htmlFor="adminPassword" className={labelCls}>{t('platform.start_trial.password', 'Password')}</label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#98A2B3] pointer-events-none" aria-hidden="true" />
                                <input
                                    id="adminPassword" name="adminPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password" required
                                    value={values.adminPassword}
                                    onChange={setField('adminPassword')}
                                    aria-invalid={errors.adminPassword ? 'true' : 'false'}
                                    aria-describedby={errors.adminPassword ? 'adminPassword-error' : undefined}
                                    placeholder={t('platform.start_trial.password_ph', 'At least {{n}} characters', { n: MIN_LENGTH })}
                                    className={`${errors.adminPassword ? inputErr : inputOk} pl-10 pr-11`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    aria-label={showPassword ? t('platform.start_trial.hide_pw', 'Hide password') : t('platform.start_trial.show_pw', 'Show password')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#667085] hover:text-[#FE8301]"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <PasswordStrengthMeter password={values.adminPassword} />
                            <FieldError id="adminPassword-error" message={errors.adminPassword} />
                        </div>

                        <p className="text-[13px] text-[#344054] leading-relaxed">
                            {t('platform.start_trial.terms_line', 'By starting your trial you agree to our')}{' '}
                            <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FE8301] underline underline-offset-2">{t('platform.start_trial.terms', 'Terms')}</a>
                            {' '}{t('platform.start_trial.terms_and', '&')}{' '}
                            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FE8301] underline underline-offset-2">{t('platform.start_trial.privacy', 'Privacy Policy')}</a>.
                        </p>

                        <button
                            type="submit"
                            disabled={submitting}
                            aria-busy={submitting ? 'true' : 'false'}
                            className={`${primaryBtn} w-full`}
                        >
                            {submitting
                                ? <><Loader2 size={17} className="animate-spin" /> {t('platform.start_trial.submitting', 'Starting your trial…')}</>
                                : <><BadgeCheck size={17} /> {t('platform.start_trial.submit', 'Start free trial')}</>}
                        </button>
                    </form>
                </div>
            </div>
            <p className="mt-5 text-center text-[13px] text-[#667085]">
                {t('platform.start_trial.have_account', 'Already have an account?')}{' '}
                <Link to="/staff-login" className="font-semibold text-[#FE8301] hover:underline">{t('platform.nav.staff_login', 'Staff login')}</Link>
                {' · '}
                {t('platform.start_trial.want_plan', 'Want to pick a plan first?')}{' '}
                <Link to="/register-restaurant" className="font-semibold text-[#FE8301] hover:underline">{t('platform.start_trial.register_link', 'Register with a plan')}</Link>
            </p>
        </SignupShell>
    );
};

export default StartTrial;
