// CUSTOMER login / sign-up (OTP, email, Google) — route /login. Staff login is Pages/Login.jsx.
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Phone, Mail, Lock, User, AlertCircle, ArrowLeft, CheckCircle2, Gift, Wallet, Heart, History, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import { sanitizeMobileInput, mobileError, isValidMobile } from '../../utils/mobile';
import api, { publicAPI } from '../../utils/api';
import { getActiveTenantSlug, activeRestaurantPath } from '../../utils/tenant';
import { resolveImageUrl } from '../../utils/image';
import { staffHomePath } from '../../utils/roleRouting';
import toast from 'react-hot-toast';
import AllergyPicker from '../../Components/Common/AllergyPicker';
import ForgotPasswordModal from '../../Components/Common/ForgotPasswordModal';
import GoogleSignInButton from '../../Components/Common/GoogleSignInButton';
import { isGoogleSignInAvailable } from '../../utils/googleSignIn';
import { passwordError, MIN_LENGTH } from '../../utils/passwordPolicy';
import PasswordStrengthMeter from '../../Components/Common/PasswordStrengthMeter';

const REMEMBER_EMAIL_KEY = 'customer_remembered_email';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Feature toggle for Mobile OTP login. Currently hidden — SMS provider
// integration (msg91 / twilio) isn't wired in production yet, so users
// were hitting "OTP not received" errors. Flip back to `true` once the
// backend SMS pipeline is verified end-to-end. Do not delete the OTP
// form / state — they're kept gated so re-enabling is a one-line flip.
const SHOW_OTP_LOGIN = false;

/* Shared font helpers — mirrors the restaurant pages for brand consistency */
const serif = { fontFamily: 'var(--cormorant-font)' };
const sans  = { fontFamily: 'var(--montserrat-font)' };

/* Password strength + policy now live in utils/passwordPolicy so the
   registration form, the reset-password page and the server all agree
   on one definition. The meter used to be purely decorative here: it
   could read "Good" while validateRegisterStep1 checked only length. */

function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, register, loginWithGoogle, isLoggedIn, user, setGuestMode, logout } = useAuth();

    const isFromQrScan = location.state?.from === 'qr-scan' || localStorage.getItem('fromQrScan') === 'true';

    /* ── Tenant profile for the header/hero ───────────────────────── */
    const [tenant, setTenant] = useState({ logo: '', name: '' });

    /* ── Mode + step state ────────────────────────────────────────── */
    const [isRegister, setIsRegister] = useState(false);
    const [step, setStep] = useState(1);

    /* ── Form state ───────────────────────────────────────────────── */
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', confirmPassword: '',
        mobile: '', allergy: '',
    });
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [showForgotModal, setShowForgotModal] = useState(false);
    const [googleBusy, setGoogleBusy] = useState(false);
    // Evaluated once: the client id is a build-time constant, so this
    // can't change while the page is open.
    const googleAvailable = isGoogleSignInAvailable();
    const [rememberEmail, setRememberEmail] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [errors, setErrors] = useState({});
    // Form-level error (wrong credentials, network, server). Field-level
    // errors live in `errors` above and render under each input.
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    /* ── Login method tab (email | otp) ────────────────────────────── */
    const [loginMethod, setLoginMethod] = useState('email');
    const [otpPhone, setOtpPhone] = useState('');
    const [otpSending, setOtpSending] = useState(false);

    /* ── Benefits-of-Login confirmation modal (QR-scan guest path) ──── */
    const [showGuestBenefitsModal, setShowGuestBenefitsModal] = useState(false);

    const emailRef = useRef(null);

    /* ── Redirect helper (preserves original behavior) ─────────────── */
    const redirectAfterAuth = () => {
        if (location.state?.next) {
            navigate(location.state.next, { state: location.state.nextState });
            return;
        }
        if (isFromQrScan) {
            // Claim the QR-scanned table for this user so the admin's
            // Live Feed drawer renders the real diner instead of "Walk-in
            // Guest" while the customer browses the menu (no order has
            // been created yet at this point). Best-effort — a 4xx here
            // shouldn't block the customer from entering the menu.
            try {
                const dineInTable = JSON.parse(localStorage.getItem('dineInTable') || '{}');
                if (dineInTable?._id) {
                    api.post(`/tables/${dineInTable._id}/claim`).catch(() => {});
                }
            } catch { /* ignore malformed localStorage */ }
            navigate('/customer/home');
            return;
        }
        // Branch is chosen BEFORE login (landing gate / branch picker),
        // never after. Head straight to the menu — if the slug is somehow
        // missing, ProtectedRoute bounces to /branch-selection on its own.
        localStorage.setItem('orderType', 'takeaway');
        localStorage.removeItem('dineInTable');
        localStorage.removeItem('tableNumber');
        navigate('/customer/home');
    };

    /* ── Stale-session cleanup on mount ───────────────────────────── */
    const hasCleanedUp = useRef(false);
    useEffect(() => {
        if (hasCleanedUp.current) return;
        hasCleanedUp.current = true;

        if (isFromQrScan && isLoggedIn) {
            logout();
        } else if (!isFromQrScan) {
            localStorage.removeItem('dineInTable');
            localStorage.removeItem('tableNumber');
            localStorage.setItem('orderType', 'takeaway');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Restore remembered email + focus field ───────────────────── */
    useEffect(() => {
        try {
            const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
            if (saved) {
                setFormData(prev => ({ ...prev, email: saved }));
                setRememberEmail(true);
            }
        } catch { /* ignore */ }
        setTimeout(() => emailRef.current?.focus(), 250);
    }, []);

    /* ── Already-logged-in redirect ────────────────────────────────── */
    useEffect(() => {
        if (!isLoggedIn || !user?.role) return;
        // If a non-customer (waiter / captain / chef / admin / superadmin)
        // hits the customer login because of a stale session, send them to
        // their own workspace instead of running them through the customer
        // branch-selection flow that redirectAfterAuth() defaults to.
        const staffDest = staffHomePath(user);
        if (staffDest) {
            navigate(staffDest, { replace: true });
            return;
        }
        if (!isFromQrScan) redirectAfterAuth();
    }, [isLoggedIn, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Fetch tenant public profile for the branded header/hero ───── */
    useEffect(() => {
        const slug = getActiveTenantSlug();
        const applyData = (r) => {
            if (!r) return;
            setTenant({ logo: r.logo || '', name: r.name || '' });
        };
        (async () => {
            try {
                if (slug) {
                    const res = await publicAPI.getRestaurantBySlug(slug);
                    applyData(res.data?.data);
                    return;
                }
                const list = await publicAPI.listRestaurants();
                applyData(list.data?.data?.[0]);
            } catch { /* fall back to generic branding */ }
        })();
    }, []);

    /* ── Field helpers ─────────────────────────────────────────────── */
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    };

    /* ── Validation (returns map of field→error or empty {}) ───────── */
    // Focus the first invalid field. Looks up by the input's `id`, which
    // matches the error key (e.g. errors.email → #email). Keeps refs out
    // of every field while still getting proper focus-on-fail behavior.
    const focusFirstError = (errs) => {
        const first = Object.keys(errs)[0];
        if (!first) return;
        const el = document.getElementById(first);
        if (el && typeof el.focus === 'function') {
            setTimeout(() => {
                try { el.focus(); el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
                catch { /* noop */ }
            }, 0);
        }
    };

    const validateLogin = () => {
        const e = {};
        if (!formData.email.trim()) e.email = 'Email is required';
        else if (!EMAIL_REGEX.test(formData.email.trim())) e.email = 'Enter a valid email address';
        if (!formData.password) e.password = 'Password is required';
        return e;
    };
    const validateRegisterStep1 = () => {
        const e = {};
        if (!formData.name.trim()) e.name = 'Name is required';
        if (!formData.email.trim()) e.email = 'Email is required';
        else if (!EMAIL_REGEX.test(formData.email.trim())) e.email = 'Enter a valid email address';
        // Enforce the FULL policy here on step 1, where the password
        // field actually is. Previously only length was checked, so a
        // password the server would reject (and that the meter itself
        // labelled "Good") passed step 1 and failed at submit on step
        // 2 — after the user had entered their mobile and accepted the
        // terms, with no indication which field was wrong.
        const pwError = passwordError(formData.password);
        if (pwError) e.password = pwError;
        if (!formData.confirmPassword) e.confirmPassword = 'Please confirm your password';
        else if (formData.password !== formData.confirmPassword) e.confirmPassword = 'Passwords do not match';
        return e;
    };
    const validateRegisterStep2 = () => {
        const e = {};
        if (!formData.mobile.trim()) e.mobile = 'Mobile number is required';
        else if (!isValidMobile(formData.mobile.trim())) e.mobile = mobileError(formData.mobile.trim());
        if (!acceptTerms) e.terms = 'Please accept the terms to continue';
        return e;
    };

    /* ── Handlers ──────────────────────────────────────────────────── */
    const handleLogin = async (e) => {
        e.preventDefault();
        setFormError('');
        const v = validateLogin();
        setErrors(v);
        if (Object.keys(v).length) { focusFirstError(v); return; }

        setSubmitting(true);
        try {
            if (rememberEmail) localStorage.setItem(REMEMBER_EMAIL_KEY, formData.email.trim());
            else localStorage.removeItem(REMEMBER_EMAIL_KEY);

            // AuthContext.login passes _silent: true so the axios
            // interceptor doesn't toast. We surface the message inline.
            const result = await login(formData.email.trim(), formData.password, 'customer');
            if (result.success) redirectAfterAuth();
            else setFormError(result.message || 'Login failed. Please check your credentials.');
        } catch (err) {
            setFormError(err.response?.data?.message || 'An error occurred during login. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleNext = (e) => {
        e.preventDefault();
        setFormError('');
        const v = validateRegisterStep1();
        setErrors(v);
        if (Object.keys(v).length) { focusFirstError(v); return; }
        setStep(2);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setFormError('');
        const v = validateRegisterStep2();
        setErrors(v);
        if (Object.keys(v).length) { focusFirstError(v); return; }

        setSubmitting(true);
        try {
            // AuthContext.register passes _silent: true — we own the
            // error display (formError banner + EMAIL_TAKEN routing).
            const result = await register({
                name: formData.name.trim(),
                email: formData.email.trim(),
                password: formData.password,
                mobile: formData.mobile.trim(),
                allergy: formData.allergy.trim(),
            });
            if (result.success) {
                // The sheet recorded this as done; it wasn't. A
                // successful registration navigated away silently, so
                // the customer never got told their account existed.
                toast.success(`Registration confirmed! Welcome, ${formData.name.trim().split(' ')[0]} — your account is ready.`, {
                    duration: 4500,
                    icon: '🎉',
                });
                redirectAfterAuth();
            } else {
                // Route email-conflict back onto the email field on step 1
                // so the user knows exactly what to fix instead of a vague
                // top-of-form banner.
                const msg = result.message || '';
                if (/password/i.test(msg)) {
                    // Server rejected the password (policy) — send the
                    // user back to step 1 where the field lives.
                    setStep(1);
                    setErrors((prev) => ({ ...prev, password: msg }));
                    focusFirstError({ password: msg });
                } else if (/email/i.test(msg) && /(already|exist|taken|registered)/i.test(msg)) {
                    setStep(1);
                    setErrors((prev) => ({ ...prev, email: msg }));
                    focusFirstError({ email: msg });
                } else {
                    setFormError(msg || 'Registration failed. Please try again.');
                }
            }
        } catch (err) {
            setFormError(err.response?.data?.message || 'An error occurred during registration. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSendOtp = async () => {
        setFormError('');
        setOtpSending(true);
        try {
            // _silent so this page owns the error message via formError.
            await api.post('/auth/send-otp', { mobile: `+91${otpPhone}` }, { _silent: true });
            navigate('/otp', { state: { phoneNumber: otpPhone, countryCode: '+91' } });
        } catch (err) {
            setFormError(err.response?.data?.message || 'Failed to send OTP. Please try again.');
        } finally {
            setOtpSending(false);
        }
    };

    /**
     * Google handed us an ID token. Exchange it for a session.
     *
     * The token is verified server-side (signature, audience, issuer)
     * before any account is read or written — nothing here trusts it.
     */
    const handleGoogleCredential = async (credential) => {
        setFormError('');
        setGoogleBusy(true);
        try {
            const result = await loginWithGoogle(credential);
            if (!result.success) {
                // The server answers every rejection with one generic
                // message on purpose — distinguishing "that's a staff
                // account" from "that email isn't verified" would let
                // anyone probe which addresses exist here.
                setFormError(result.message || 'Could not sign you in with Google.');
                return;
            }
            // Google never supplies a phone number, and an order needs
            // one. Say so now rather than letting them hit it at
            // checkout — but don't block entry over it.
            if (result.needsMobile) {
                toast('Add your mobile number so we can reach you about orders.', {
                    icon: '📱',
                    duration: 5000,
                });
            }
            redirectAfterAuth();
        } catch (err) {
            setFormError(err?.message || 'Could not sign you in with Google.');
        } finally {
            setGoogleBusy(false);
        }
    };

    const handleForgotPassword = () => {
        // Opens a dedicated dialog (email field prefilled from the login
        // form) instead of silently firing a request + toast, so the
        // customer sees exactly which address the link goes to, what to
        // expect, and can resend. See Components/Common/ForgotPasswordModal.
        setShowForgotModal(true);
    };

    // Step 1: opening "Continue as Guest" surfaces the benefits modal
    // first so the customer sees what they lose by skipping login. They
    // can still proceed — confirmGuestMode below performs the actual
    // guest-mode hand-off after they tap through the modal.
    const handleSkipAsGuest = () => {
        setShowGuestBenefitsModal(true);
    };

    const confirmGuestMode = () => {
        setShowGuestBenefitsModal(false);
        setGuestMode();

        // A guest has no account, so their ONLY claim to a table is the
        // signed scan token issued by the QR. Previously this dropped
        // every guest straight onto /customer/home with no table bound:
        // they browsed the full dine-in menu, filled a cart, and only
        // hit the wall at Place Order, where the backend 401s with
        // SCAN_TOKEN_REQUIRED and offers no way forward.
        //
        // Resolve the table situation HERE instead, where we can still
        // explain it.
        let hasTable = false;
        try {
            const raw = localStorage.getItem('dineInTable');
            const parsed = raw ? JSON.parse(raw) : null;
            hasTable = Boolean(parsed?._id || parsed?.id);
        } catch { /* malformed — treat as no table */ }

        if (hasTable || isFromQrScan) {
            // Bound to a physical table: dine-in is genuinely available.
            navigate('/customer/home', { replace: true });
            return;
        }

        // No table and no scan. Rather than blocking the guest outright
        // — takeaway needs no table and is a legitimate thing to do —
        // pin them to takeaway and say plainly what dine-in requires.
        localStorage.setItem('orderType', 'takeaway');
        localStorage.removeItem('dineInTable');
        localStorage.removeItem('tableNumber');
        toast(
            'Browsing as a takeaway guest. To order to your table, scan the QR code on it.',
            { icon: '📷', duration: 5000 },
        );
        navigate('/customer/home', { replace: true });
    };

    const switchMode = (toRegister) => {
        setIsRegister(toRegister);
        setStep(1);
        setErrors({});
        setFormError('');
    };

    /* ── Shared class strings ──────────────────────────────────────── */
    const inputBase =
        'w-full pl-11 pr-4 py-3 bg-[#F6F7F1] border rounded-[12px] text-[14px] ' +
        'focus:outline-none focus:ring-2 focus:ring-[#FF9B0B]/40 focus:border-[#FF9B0B] ' +
        'transition-colors placeholder-[#A3A3A3]';
    const inputOk    = `${inputBase} border-[#E6E8DF]`;
    const inputErr   = `${inputBase} border-red-400 focus:ring-red-300/40 focus:border-red-500`;
    const labelClass = 'block text-[13px] font-semibold text-[#1A181B] mb-1.5';

    const FieldError = ({ id, message }) =>
        message ? (
            <p id={id} role="alert" className="mt-1.5 text-[12px] text-red-600 flex items-center gap-1.5" style={sans}>
                <AlertCircle size={13} /> {message}
            </p>
        ) : null;

    // Form-level error banner — for wrong credentials, network failures,
    // server errors. Inline field issues use <FieldError /> above.
    const FormErrorBanner = () =>
        formError ? (
            <div
                role="alert"
                className="mb-4 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-[12px] px-3.5 py-3"
            >
                <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-[13px] text-red-700 leading-snug" style={sans}>{formError}</p>
            </div>
        ) : null;

    const resolvedLogo = resolveImageUrl(tenant.logo);

    /* ────────────────────────────────────────────────────────────────
       Render
    ──────────────────────────────────────────────────────────────── */
    return (
        <div className="min-h-screen flex bg-white" style={sans}>
            {/* ── Left: form panel ──────────────────────────────── */}
            <div className="w-full lg:w-[48%] xl:w-[42%] px-6 md:px-12 lg:px-16 min-h-screen overflow-y-auto flex flex-col">

                {/* Top bar — tenant brand + back link */}
                <div className="pt-8 flex items-center justify-between">
                    <button
                        onClick={() => navigate(activeRestaurantPath())}
                        className="inline-flex items-center gap-2 text-[12px] text-[#645E66] hover:text-[#FF9B0B] transition-colors"
                    >
                        <ArrowLeft size={14} /> Back to site
                    </button>
                    <div className="flex items-center gap-2">
                        {resolvedLogo && (
                            <img src={resolvedLogo} alt="" className="h-8 w-8 rounded-full object-cover" />
                        )}
                        <span className="text-[#1A181B] tracking-[2px] uppercase text-[11px] sm:text-[13px] font-semibold">
                            {tenant.name || 'BestoDine'}
                        </span>
                    </div>
                </div>

                {/* Center the card */}
                <div className="flex-1 flex items-center justify-center">
                    <div className="w-full max-w-[420px] py-10">

                        {/* ── LOGIN MODE ─────────────────────────────── */}
                        {!isRegister && (
                            <div className="animate-fadeIn">
                                <h1 className="text-[32px] lg:text-[40px] font-bold text-[#1A181B] leading-[1.1] mb-2" style={serif}>
                                    Welcome Back
                                </h1>
                                <p className="text-[13px] text-[#645E66] mb-6">
                                    Sign in to book tables, place orders, and track your loyalty rewards.
                                </p>

                                {/* Method tabs — Email | Mobile OTP. Hidden when
                                    SHOW_OTP_LOGIN is off; users go straight to the
                                    email form with no visual hint that OTP exists. */}
                                {SHOW_OTP_LOGIN && (
                                <div className="mb-6 flex items-center gap-1 p-1 bg-[#F6F7F1] border border-[#E6E8DF] rounded-[12px]" role="tablist">
                                    <button
                                        type="button" role="tab"
                                        aria-selected={loginMethod === 'email'}
                                        onClick={() => { setLoginMethod('email'); setErrors({}); setFormError(''); }}
                                        className={`flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-[9px] text-[13px] font-semibold transition-all ${
                                            loginMethod === 'email'
                                                ? 'bg-white text-[#FF9B0B] shadow-[0_2px_8px_rgba(255,155,11,0.08)]'
                                                : 'text-[#645E66] hover:text-[#1A181B]'
                                        }`}
                                    >
                                        <Mail size={14} /> Email
                                    </button>
                                    <button
                                        type="button" role="tab"
                                        aria-selected={loginMethod === 'otp'}
                                        onClick={() => { setLoginMethod('otp'); setErrors({}); setFormError(''); }}
                                        className={`flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-[9px] text-[13px] font-semibold transition-all ${
                                            loginMethod === 'otp'
                                                ? 'bg-white text-[#FF9B0B] shadow-[0_2px_8px_rgba(255,155,11,0.08)]'
                                                : 'text-[#645E66] hover:text-[#1A181B]'
                                        }`}
                                    >
                                        <Phone size={14} /> Mobile OTP
                                    </button>
                                </div>
                                )}

                                {loginMethod === 'email' && (
                                <form onSubmit={handleLogin} className="space-y-4 animate-fadeIn" noValidate>
                                    <FormErrorBanner />
                                    {/* Email */}
                                    <div>
                                        <label htmlFor="email" className={labelClass}>Email address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
                                            <input
                                                ref={emailRef}
                                                id="email" name="email" type="email"
                                                autoComplete="email" required
                                                value={formData.email}
                                                onChange={handleChange}
                                                aria-invalid={!!errors.email}
                                                aria-describedby={errors.email ? 'email-error' : undefined}
                                                aria-required="true"
                                                placeholder="you@yourdomain.com"
                                                className={errors.email ? inputErr : inputOk}
                                            />
                                        </div>
                                        <FieldError id="email-error" message={errors.email} />
                                    </div>

                                    {/* Password */}
                                    <div>
                                        <label htmlFor="password" className={labelClass}>Password</label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
                                            <input
                                                id="password" name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                autoComplete="current-password" required
                                                value={formData.password}
                                                onChange={handleChange}
                                                aria-invalid={!!errors.password}
                                                aria-describedby={errors.password ? 'password-error' : undefined}
                                                aria-required="true"
                                                placeholder="Your password"
                                                className={`${errors.password ? inputErr : inputOk} pr-11`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(v => !v)}
                                                tabIndex={-1}
                                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#645E66] hover:text-[#FF9B0B] transition-colors"
                                            >
                                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                            </button>
                                        </div>
                                        <FieldError id="password-error" message={errors.password} />
                                    </div>

                                    {/* Remember + Forgot */}
                                    <div className="flex items-center justify-between">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={rememberEmail}
                                                onChange={(e) => setRememberEmail(e.target.checked)}
                                                className="w-4 h-4 rounded border-[#D4D7CE] text-[#FF9B0B] focus:ring-[#FF9B0B] cursor-pointer"
                                            />
                                            <span className="text-[13px] text-[#645E66]">Remember me</span>
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handleForgotPassword}
                                            className="text-[13px] text-[#FF9B0B] hover:text-[#E07E00] font-medium transition-colors"
                                        >
                                            Forgot password?
                                        </button>
                                    </div>

                                    {/* Submit */}
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        aria-busy={submitting ? 'true' : 'false'}
                                        className="w-full bg-[#FF9B0B] text-white font-semibold py-3 rounded-[12px]
                                            shadow-[0_6px_18px_rgba(255,155,11,0.28)]
                                            hover:bg-[#E07E00] hover:-translate-y-0.5
                                            hover:shadow-[0_8px_22px_rgba(224,126,0,0.4)]
                                            active:translate-y-0
                                            focus:outline-none focus:ring-2 focus:ring-[#FF9B0B] focus:ring-offset-2
                                            disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0
                                            transition-all duration-200
                                            inline-flex items-center justify-center gap-2"
                                    >
                                        {submitting ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>Signing in…</span>
                                            </>
                                        ) : (
                                            <span>Sign In</span>
                                        )}
                                    </button>
                                </form>
                                )}

                                {SHOW_OTP_LOGIN && loginMethod === 'otp' && (
                                    <div className="space-y-4 animate-fadeIn">
                                        <FormErrorBanner />
                                        <div>
                                            <label htmlFor="otpPhone" className={labelClass}>Mobile number</label>
                                            <div className="flex gap-2">
                                                <span className="flex items-center px-3 bg-[#F6F7F1] border border-[#E6E8DF] rounded-[12px] text-[14px] text-[#645E66] font-medium">+91</span>
                                                <input
                                                    id="otpPhone" type="tel" inputMode="numeric"
                                                    autoComplete="tel-national"
                                                    value={otpPhone}
                                                    onChange={(e) => setOtpPhone(sanitizeMobileInput(e.target.value))}
                                                    placeholder="98765 43210"
                                                    aria-label="10-digit mobile number"
                                                    className={`flex-1 ${inputOk.replace('pl-11', 'pl-4')} tabular-nums`}
                                                />
                                            </div>
                                            <p className="mt-1.5 text-[11px] text-[#8D848F]">
                                                We'll send a one-time code to this number.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={otpPhone.length !== 10 || otpSending}
                                            aria-busy={otpSending ? 'true' : 'false'}
                                            onClick={handleSendOtp}
                                            className={`w-full py-3 rounded-[12px] font-semibold text-[14px] transition-all inline-flex items-center justify-center gap-2 ${
                                                otpPhone.length !== 10 || otpSending
                                                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                                    : 'bg-[#FF9B0B] text-white hover:bg-[#E07E00] hover:-translate-y-0.5 shadow-[0_6px_18px_rgba(255,155,11,0.28)] hover:shadow-[0_8px_22px_rgba(224,126,0,0.4)]'
                                            }`}
                                        >
                                            {otpSending ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    <span>Sending…</span>
                                                </>
                                            ) : (
                                                <span>Send OTP</span>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Google Sign-In. Placed below the password
                                    form so the primary path stays primary, and
                                    outside the password/OTP conditional so it's
                                    reachable from either method. Renders
                                    nothing when VITE_GOOGLE_CLIENT_ID is unset,
                                    so the divider is conditional too. */}
                                {googleAvailable && (
                                    <div className="mt-6">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="flex-1 h-px bg-[#E6E8DF]" />
                                            <span className="text-[11px] uppercase tracking-wider text-[#8D848F]">or</span>
                                            <span className="flex-1 h-px bg-[#E6E8DF]" />
                                        </div>
                                        <GoogleSignInButton
                                            onCredential={handleGoogleCredential}
                                            disabled={googleBusy || submitting}
                                            text="continue_with"
                                        />
                                        {googleBusy && (
                                            <p className="mt-2 text-center text-[12px] text-[#645E66]">
                                                Signing you in…
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Switch to Register */}
                                <p className="mt-6 text-center text-[13px] text-[#645E66]">
                                    Don't have an account?{' '}
                                    <button
                                        type="button"
                                        onClick={() => switchMode(true)}
                                        className="text-[#FF9B0B] font-semibold hover:text-[#FF9B0B] transition-colors"
                                    >
                                        Create account
                                    </button>
                                </p>

                                {/* Swap to the staff portal — mirrors the
                                    "Customer Portal" link on /staff-login. */}
                                <p className="mt-2 text-center text-[12px] text-[#8D848F]">
                                    Restaurant staff?{' '}
                                    <button
                                        type="button"
                                        onClick={() => navigate('/staff-login')}
                                        className="text-[#1A181B] font-semibold underline underline-offset-4 decoration-[#D4D7CE] hover:text-[#FF9B0B] hover:decoration-[#FF9B0B]/60 transition-colors"
                                    >
                                        Staff Login
                                    </button>
                                </p>

                                {/* Guest skip (QR only) */}
                                {isFromQrScan && (
                                    <button
                                        type="button"
                                        onClick={handleSkipAsGuest}
                                        className="mt-4 w-full border border-[#E6E8DF] text-[#645E66] py-3 rounded-[12px] font-semibold text-[14px] hover:bg-[#F6F7F1] hover:text-[#1A181B] transition-colors"
                                    >
                                        Continue as Guest
                                    </button>
                                )}
                            </div>
                        )}

                        {/* ── REGISTER MODE ───────────────────────────── */}
                        {isRegister && (
                            <div className="animate-fadeIn">
                                {/* Step progress */}
                                <div className="mb-6 flex items-center gap-3">
                                    {[1, 2].map(n => (
                                        <React.Fragment key={n}>
                                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
                                                step >= n ? 'bg-[#FF9B0B] text-white' : 'bg-[#F6F7F1] text-[#645E66] border border-[#E6E8DF]'
                                            }`}>
                                                {step > n ? <CheckCircle2 size={15} /> : n}
                                            </div>
                                            {n === 1 && (
                                                <div className={`flex-1 h-[2px] transition-colors ${step > 1 ? 'bg-[#FF9B0B]' : 'bg-[#E6E8DF]'}`} />
                                            )}
                                        </React.Fragment>
                                    ))}
                                    <span className="text-[11px] text-[#645E66] tracking-[1px] uppercase ml-2">Step {step} of 2</span>
                                </div>

                                {/* Google on the SIGNUP view too. For someone
                                    without an account, "Continue with Google"
                                    IS the signup — offering it only on the
                                    login tab hides the fastest path from the
                                    exact people who need it most. Shown on
                                    step 1 only; by step 2 they've committed to
                                    the manual form. */}
                                {googleAvailable && step === 1 && (
                                    <div className="mb-6">
                                        <GoogleSignInButton
                                            onCredential={handleGoogleCredential}
                                            disabled={googleBusy || submitting}
                                            text="signup_with"
                                        />
                                        <div className="flex items-center gap-3 mt-5">
                                            <span className="flex-1 h-px bg-[#E6E8DF]" />
                                            <span className="text-[11px] uppercase tracking-wider text-[#8D848F]">
                                                or sign up with email
                                            </span>
                                            <span className="flex-1 h-px bg-[#E6E8DF]" />
                                        </div>
                                    </div>
                                )}

                                {step === 1 && (
                                    <>
                                        <h1 className="text-[30px] lg:text-[36px] font-bold text-[#1A181B] leading-[1.1] mb-2" style={serif}>
                                            Create Your Account
                                        </h1>
                                        <p className="text-[13px] text-[#645E66] mb-7">
                                            We'll use your details to sign you in and send booking updates.
                                        </p>

                                        <form onSubmit={handleNext} className="space-y-4" noValidate>
                                            <FormErrorBanner />
                                            {/* Name */}
                                            <div>
                                                <label htmlFor="name" className={labelClass}>Full name</label>
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
                                                    <input
                                                        id="name" name="name" type="text" required
                                                        autoComplete="name"
                                                        value={formData.name}
                                                        onChange={handleChange}
                                                        aria-invalid={!!errors.name}
                                                        aria-describedby={errors.name ? 'name-error' : undefined}
                                                        aria-required="true"
                                                        placeholder="Full name as on documents"
                                                        className={errors.name ? inputErr : inputOk}
                                                    />
                                                </div>
                                                <FieldError id="name-error" message={errors.name} />
                                            </div>

                                            {/* Email */}
                                            <div>
                                                <label htmlFor="email" className={labelClass}>Email address</label>
                                                <div className="relative">
                                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
                                                    <input
                                                        id="email" name="email" type="email" required
                                                        autoComplete="email"
                                                        value={formData.email}
                                                        onChange={handleChange}
                                                        aria-invalid={!!errors.email}
                                                        aria-describedby={errors.email ? 'email-error' : undefined}
                                                        aria-required="true"
                                                        placeholder="you@yourdomain.com"
                                                        className={errors.email ? inputErr : inputOk}
                                                    />
                                                </div>
                                                <FieldError id="email-error" message={errors.email} />
                                            </div>

                                            {/* Password + strength */}
                                            <div>
                                                <label htmlFor="password" className={labelClass}>Password</label>
                                                <div className="relative">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
                                                    <input
                                                        id="password" name="password"
                                                        type={showPassword ? 'text' : 'password'}
                                                        autoComplete="new-password" required
                                                        value={formData.password}
                                                        onChange={handleChange}
                                                        onBlur={() => {
                                                            // Validate as soon as the user leaves the
                                                            // field on step 1 — don't wait for "Next".
                                                            if (!formData.password) return;
                                                            const pwErr = passwordError(formData.password);
                                                            if (pwErr) setErrors(prev => ({ ...prev, password: pwErr }));
                                                        }}
                                                        aria-invalid={!!errors.password}
                                                        aria-describedby={errors.password ? 'password-error' : 'password-strength'}
                                                        aria-required="true"
                                                        placeholder={`At least ${MIN_LENGTH} characters`}
                                                        className={`${errors.password ? inputErr : inputOk} pr-11`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(v => !v)}
                                                        tabIndex={-1}
                                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#645E66] hover:text-[#FF9B0B]"
                                                    >
                                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                                <PasswordStrengthMeter password={formData.password} />
                                                <FieldError id="password-error" message={errors.password} />
                                            </div>

                                            {/* Confirm password */}
                                            <div>
                                                <label htmlFor="confirmPassword" className={labelClass}>Confirm password</label>
                                                <div className="relative">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
                                                    <input
                                                        id="confirmPassword" name="confirmPassword"
                                                        type={showConfirm ? 'text' : 'password'}
                                                        autoComplete="new-password" required
                                                        value={formData.confirmPassword}
                                                        onChange={handleChange}
                                                        aria-invalid={!!errors.confirmPassword}
                                                        aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
                                                        aria-required="true"
                                                        placeholder="Re-enter password"
                                                        className={`${errors.confirmPassword ? inputErr : inputOk} pr-11`}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConfirm(v => !v)}
                                                        tabIndex={-1}
                                                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-[#645E66] hover:text-[#FF9B0B]"
                                                    >
                                                        {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                                <FieldError id="confirm-error" message={errors.confirmPassword} />
                                            </div>

                                            <button
                                                type="submit"
                                                className="w-full bg-[#FF9B0B] text-white font-semibold py-3 rounded-[12px]
                                                    shadow-[0_6px_18px_rgba(255,155,11,0.28)]
                                                    hover:bg-[#E07E00] hover:-translate-y-0.5
                                                    hover:shadow-[0_8px_22px_rgba(224,126,0,0.4)]
                                                    active:translate-y-0
                                                    focus:outline-none focus:ring-2 focus:ring-[#FF9B0B] focus:ring-offset-2
                                                    transition-all duration-200
                                                    inline-flex items-center justify-center gap-2"
                                            >
                                                <span>Next</span>
                                                <span aria-hidden="true">→</span>
                                            </button>
                                        </form>

                                        <p className="mt-6 text-center text-[13px] text-[#645E66]">
                                            Already have an account?{' '}
                                            <button
                                                type="button"
                                                onClick={() => switchMode(false)}
                                                className="text-[#FF9B0B] font-semibold hover:text-[#FF9B0B] transition-colors"
                                            >
                                                Sign in
                                            </button>
                                        </p>
                                    </>
                                )}

                                {step === 2 && (
                                    <>
                                        <h1 className="text-[28px] lg:text-[34px] font-bold text-[#1A181B] leading-[1.1] mb-2" style={serif}>
                                            Tell Us About You
                                        </h1>
                                        <p className="text-[13px] text-[#645E66] mb-7">
                                            Just a couple more details so we can personalize your experience.
                                        </p>

                                        <form onSubmit={handleRegister} className="space-y-4" noValidate>
                                            <FormErrorBanner />
                                            {/* Mobile */}
                                            <div>
                                                <label htmlFor="mobile" className={labelClass}>Mobile number</label>
                                                <div className="flex gap-2">
                                                    <span className="flex items-center px-3 bg-[#F6F7F1] border border-[#E6E8DF] rounded-[12px] text-[14px] text-[#645E66] font-medium">+91</span>
                                                    <input
                                                        id="mobile" name="mobile" type="tel" inputMode="numeric" required
                                                        autoComplete="tel-national"
                                                        value={formData.mobile}
                                                        onChange={(e) => {
                                                            const v = sanitizeMobileInput(e.target.value);
                                                            setFormData(prev => ({ ...prev, mobile: v }));
                                                            // Live feedback once 10 digits are in; clear otherwise.
                                                            const liveErr = v.length === 10 ? mobileError(v) : '';
                                                            if (errors.mobile || liveErr) setErrors(prev => ({ ...prev, mobile: liveErr }));
                                                        }}
                                                        aria-invalid={!!errors.mobile}
                                                        aria-describedby={errors.mobile ? 'mobile-error' : undefined}
                                                        aria-required="true"
                                                        placeholder="98765 43210"
                                                        className={`flex-1 ${errors.mobile ? inputErr : inputOk} pl-4 tabular-nums`}
                                                    />
                                                </div>
                                                <FieldError id="mobile-error" message={errors.mobile} />
                                            </div>

                                            {/* Allergy */}
                                            <div>
                                                <label htmlFor="allergy" className={labelClass}>
                                                    Allergy information <span className="text-[#8D848F] font-normal">(optional)</span>
                                                </label>
                                                {/* Was a bare text input. Free text is a poor fit
                                                    for a safety field — "penuts" / "Peanut" /
                                                    "nuts" are three strings the kitchen can't
                                                    match against a dish. Suggestions steer people
                                                    onto canonical names while still accepting
                                                    anything typed. */}
                                                <AllergyPicker
                                                    id="allergy"
                                                    value={formData.allergy}
                                                    onChange={(next) => setFormData(prev => ({ ...prev, allergy: next }))}
                                                    className={`${inputOk} pl-4`}
                                                />
                                                <p className="mt-1.5 text-[11px] text-[#8D848F]">
                                                    We'll flag these when you view menus.
                                                </p>
                                            </div>

                                            {/* T&C */}
                                            <div>
                                                <label className="flex items-start gap-2 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={acceptTerms}
                                                        onChange={(e) => {
                                                            setAcceptTerms(e.target.checked);
                                                            if (errors.terms) setErrors(prev => ({ ...prev, terms: '' }));
                                                        }}
                                                        aria-invalid={!!errors.terms}
                                                        className="mt-1 w-4 h-4 rounded border-[#D4D7CE] text-[#FF9B0B] focus:ring-[#FF9B0B]"
                                                    />
                                                    <span className="text-[12px] text-[#645E66] leading-[1.5]">
                                                        I agree to the{' '}
                                                        <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-[#FF9B0B] font-medium hover:text-[#FF9B0B] underline underline-offset-2">Terms of Service</Link>
                                                        {' '}and{' '}
                                                        <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#FF9B0B] font-medium hover:text-[#FF9B0B] underline underline-offset-2">Privacy Policy</Link>.
                                                    </span>
                                                </label>
                                                <FieldError id="terms-error" message={errors.terms} />
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setStep(1)}
                                                    className="w-1/3 bg-[#F6F7F1] hover:bg-[#E6E8DF] text-[#1A181B] py-3 rounded-[12px] font-semibold text-[14px] transition-colors"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={submitting}
                                                    aria-busy={submitting ? 'true' : 'false'}
                                                    className="w-2/3 bg-[#FF9B0B] text-white font-semibold py-3 rounded-[12px]
                                                        shadow-[0_6px_18px_rgba(255,155,11,0.28)]
                                                        hover:bg-[#E07E00] hover:-translate-y-0.5
                                                        hover:shadow-[0_8px_22px_rgba(224,126,0,0.4)]
                                                        active:translate-y-0
                                                        disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0
                                                        transition-all duration-200
                                                        inline-flex items-center justify-center gap-2"
                                                >
                                                    {submitting ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                            <span>Creating…</span>
                                                        </>
                                                    ) : (
                                                        <span>Create Account</span>
                                                    )}
                                                </button>
                                            </div>

                                            <p className="pt-3 text-center text-[11px] text-[#8D848F]">
                                                Your data is encrypted and only used to improve your experience.
                                            </p>
                                        </form>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Right: hero image panel (desktop only) ──────────────── */}
            <div className="hidden lg:block lg:w-[52%] xl:w-[58%] p-5 min-h-screen">
                <div className="w-full h-full relative rounded-[24px] overflow-hidden">
                    <img src="/Login.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-linear-to-br from-black/55 via-black/20 to-transparent" />
                    <div className="absolute inset-0 flex flex-col justify-end p-10 xl:p-14 text-white">
                        <h2
                            className="font-bold uppercase leading-[1.1] drop-shadow-lg max-w-[460px]"
                            style={{ ...serif, fontSize: 'clamp(28px, 2.8vw, 44px)' }}
                        >
                            Dine Better.<br />Celebrate Bigger.
                        </h2>
                        <p className="mt-4 text-[14px] text-white/90 max-w-[420px]" style={sans}>
                            Reserve tables, host events, and order takeaway from{' '}
                            <span className="font-semibold text-[#FF9B0B]">{tenant.name || 'your favorite restaurant'}</span>{' '}
                            — all in one place.
                        </p>
                        <div className="mt-8 flex items-center gap-3 text-[12px] tracking-[1px] uppercase text-white/70">
                            <div className="h-px w-10 bg-[#FF9B0B]" />
                            <span>Powered by BestoDine</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Forgot-password dialog ─────────────────────────────── */}
            {showForgotModal && (
                <ForgotPasswordModal
                    initialEmail={formData.email.trim()}
                    onClose={() => setShowForgotModal(false)}
                />
            )}

            {/* ── Benefits-of-Login modal (QR-scan guest path only) ──────── */}
            {showGuestBenefitsModal && (
                <GuestBenefitsModal
                    onClose={() => setShowGuestBenefitsModal(false)}
                    onContinueAsGuest={confirmGuestMode}
                />
            )}
        </div>
    );
}

/* ── Guest-mode confirmation modal ──────────────────────────────────────
 * Shown when a QR-scanned customer taps "Continue as Guest" on the login
 * screen. Lists the benefits they'd unlock by signing in (loyalty,
 * history, favorites, faster checkout) and gives them one last nudge
 * toward Login before letting them proceed in guest mode.
 */
function GuestBenefitsModal({ onClose, onContinueAsGuest }) {
    const benefits = [
        { icon: History, title: 'Track Your Orders', desc: 'Full order history and live status updates across visits.' },
        { icon: Wallet, title: 'Wallet & Loyalty', desc: 'Earn points on every order and redeem them as wallet credit.' },
        { icon: Gift, title: 'Exclusive Rewards', desc: 'Member-only coupons, birthday offers, and surprise perks.' },
        { icon: Heart, title: 'Save Favorites', desc: 'One-tap reorder of your most-loved dishes.' },
        { icon: ShieldCheck, title: 'Faster Checkout', desc: 'Saved details mean fewer taps next time you order.' },
    ];

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-[2px] animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-benefits-title"
            onClick={onClose}
        >
            <div
                className="relative w-full sm:max-w-[440px] bg-white rounded-t-[24px] sm:rounded-[24px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] sm:shadow-[0_20px_60px_rgba(0,0,0,0.25)] max-h-[92vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute right-4 top-4 w-9 h-9 rounded-full bg-[#F6F7F1] hover:bg-[#ECEEE5] flex items-center justify-center text-[#645E66] transition-colors z-10"
                >
                    <X size={18} />
                </button>

                {/* Hero / header */}
                <div className="px-6 pt-7 pb-5 bg-linear-to-br from-[#FFF6E8] to-[#FFFCF5] rounded-t-[24px]">
                    <div className="w-14 h-14 rounded-[18px] bg-white shadow-[0_4px_14px_rgba(255,155,11,0.25)] flex items-center justify-center mb-3">
                        <Gift size={26} className="text-[#FF9B0B]" />
                    </div>
                    <h2
                        id="guest-benefits-title"
                        className="text-[22px] font-bold text-[#1A181B] leading-[1.2]"
                        style={{ fontFamily: 'var(--cormorant-font)' }}
                    >
                        Unlock more by signing in
                    </h2>
                    <p className="mt-1.5 text-[13px] text-[#645E66] leading-snug">
                        You can keep ordering as a guest, but here's what a free account adds.
                    </p>
                </div>

                {/* Benefits list */}
                <div className="px-6 py-5 overflow-y-auto">
                    <ul className="space-y-3.5">
                        {benefits.map((b) => {
                            const BenefitIcon = b.icon;
                            return (
                                <li key={b.title} className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-[12px] bg-[#FFF6E8] flex items-center justify-center flex-shrink-0">
                                        <BenefitIcon size={17} className="text-[#FF9B0B]" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-semibold text-[#1A181B] leading-[1.3]">{b.title}</p>
                                        <p className="text-[12.5px] text-[#645E66] mt-0.5 leading-snug">{b.desc}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Actions */}
                <div className="px-6 pt-2 pb-6 sm:pb-7 border-t border-[#F2F4F0] bg-white rounded-b-[24px] flex flex-col gap-2.5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full py-3.5 rounded-[14px] bg-[#FF9B0B] text-white font-semibold text-[14px] hover:bg-[#E07E00] active:scale-[0.99] shadow-[0_6px_18px_rgba(255,155,11,0.28)] transition-all"
                    >
                        Login / Sign Up
                    </button>
                    <button
                        type="button"
                        onClick={onContinueAsGuest}
                        className="w-full py-3 rounded-[14px] bg-[#F6F7F1] text-[#645E66] font-semibold text-[13.5px] hover:bg-[#ECEEE5] hover:text-[#1A181B] transition-colors"
                    >
                        Continue as Guest
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Login;
