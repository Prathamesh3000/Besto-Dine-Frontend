// STAFF login (admin / manager / waiter / captain / chef) AND Super Admin — route /staff-login.
// Customer login is Pages/Loggedin/Login.jsx. AuthContext.login stores the session under the
// audience implied by the returned role ('platform' for superadmin, 'staff' otherwise — see
// utils/authStorage), so signing in here never overwrites a Super Admin tab with a hotel admin.
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, LogIn, Sparkles, CheckCircle2, X, Hourglass, XCircle, Building2 } from 'lucide-react';
import { useAuth, USER_ROLES } from '../Context/AuthContext';
import { setActiveTenant, clearActiveTenant } from '../utils/tenant';
import BestoDineMark from '../assets/BestoDineMark';
import RequestDemoForm from '../Components/Common/RequestDemoForm';
import {
    useFormValidation,
    combine,
    required,
    email as emailRule,
} from '../hooks/useFormValidation';

const REMEMBER_EMAIL_KEY = 'staff_remembered_email';

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, isLoggedIn, user } = useAuth();
    // `?switch=1` — sent here to sign in with a different account (cross-tab
    // "Sign in again", Super Admin session check). Don't auto-forward the
    // account currently stored for this tab's audience.
    const switchAccount = new URLSearchParams(location.search).get('switch') === '1';

    const form = useFormValidation(
        { email: '', password: '' },
        {
            email:    combine(required('Email'), emailRule()),
            password: required('Password'),
        },
    );

    // Form-level error — wrong credentials, network failure, account locked.
    // Field-level errors (missing/invalid format) live inside the hook.
    const [formError, setFormError] = useState('');
    // SIGNUP_PENDING / SIGNUP_REJECTED from a self-registered hotel owner.
    const [signupStatus, setSignupStatus] = useState(null); // { code, message }
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberEmail, setRememberEmail] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [demoOpen, setDemoOpen] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setMounted(true), 50);
        return () => clearTimeout(t);
    }, []);

    // One-shot notice left by api.js before redirecting here (e.g.
    // "Please sign in as Super Admin").
    useEffect(() => {
        try {
            const notice = sessionStorage.getItem('bd_auth_notice');
            if (notice) {
                sessionStorage.removeItem('bd_auth_notice');
                setFormError(notice);
            }
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        if (switchAccount || !isLoggedIn || !user?.role) return;
        const role = user.role;
        if (role === USER_ROLES.SUPERADMIN) navigate('/superadmin/dashboard', { replace: true });
        else if (role === USER_ROLES.WAITER || role === USER_ROLES.CAPTAIN) navigate('/waiter/home', { replace: true });
        else if (role === USER_ROLES.CHEF) navigate('/chef/dashboard', { replace: true });
        else if (role === USER_ROLES.ADMIN || role === USER_ROLES.MANAGER) navigate('/admin/dashboard', { replace: true });
    }, [switchAccount, isLoggedIn, user?.role, navigate]);

    // Remember-email + mount-focus. Focus password if email is remembered,
    // otherwise focus email.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
            if (saved) {
                form.setValue('email', saved);
                setRememberEmail(true);
                setTimeout(() => form.focusField('password'), 300);
            } else {
                setTimeout(() => form.focusField('email'), 300);
            }
        } catch { /* ignore */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setSignupStatus(null);
        if (!form.validateAll()) return;

        setLoading(true);
        try {
            if (rememberEmail) {
                localStorage.setItem(REMEMBER_EMAIL_KEY, form.values.email.trim());
            } else {
                localStorage.removeItem(REMEMBER_EMAIL_KEY);
            }

            // No restaurant picker — the staff member's tenant is detected
            // server-side from their account. Clear any stale tenant left by
            // a previous customer session so we don't send a misleading
            // X-Restaurant-Slug header on the login request.
            clearActiveTenant();

            // Role + tenant are auto-detected from the user record
            // server-side. We pass only loginType so the staff-vs-customer
            // separation guard still applies.
            const result = await login(form.values.email.trim(), form.values.password, 'staff');

            if (result.success) {
                // Lock the active tenant to the one the authenticated staff
                // member actually belongs to (from the login response), so
                // every subsequent request carries the right slug.
                const tenant = result.user?.tenant;
                if (tenant?.slug) {
                    setActiveTenant({ slug: tenant.slug, name: tenant.name, _id: tenant._id });
                }

                if (result.user?.mustChangePassword) {
                    // Tell the page which audience holds this session.
                    navigate('/force-change-password', { state: { audience: result.audience } });
                    return;
                }

                const userRole = result.role;
                if (userRole === USER_ROLES.SUPERADMIN) navigate('/superadmin/dashboard');
                else if (userRole === USER_ROLES.WAITER || userRole === USER_ROLES.CAPTAIN) navigate('/waiter/home');
                else if (userRole === USER_ROLES.CHEF) navigate('/chef/dashboard');
                else if (userRole === USER_ROLES.ADMIN || userRole === USER_ROLES.MANAGER) navigate('/admin/dashboard');
                else navigate('/');
            } else if (result.code === 'SIGNUP_PENDING' || result.code === 'SIGNUP_REJECTED') {
                setSignupStatus({ code: result.code, message: result.message, reason: result.reason });
            } else {
                setFormError(result.message || 'Login failed. Please check your credentials.');
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Login failed. Please try again.';
            setFormError(msg);
        } finally {
            setLoading(false);
        }
    };

    // ─── Per-field error helpers — keeps JSX below tidy. ───────────────────
    const emailError    = form.touched.email    && form.errors.email;
    const passwordError = form.touched.password && form.errors.password;

    return (
        <div className="min-h-screen bg-[#FAF5F0] font-manrope flex items-stretch relative overflow-hidden">
            {/* Soft ambient blur accents in the background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-48 -right-48 w-96 h-96 bg-[#FE8301]/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-48 -left-48 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl" />
            </div>

            {/* ═══════════ LEFT PANEL — Branding ═══════════ */}
            <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden bg-linear-to-br from-[#FE8301] via-[#FF8A10] to-[#FF6B00]">
                {/* Decorative orbs */}
                <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] bg-amber-300/20 rounded-full blur-3xl" />
                <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-white/5 rounded-full blur-2xl" />

                {/* Subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.08]"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
                        backgroundSize: '48px 48px',
                    }}
                />

                <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full text-white">
                    {/* Brand mark */}
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center ring-1 ring-white/30">
                            <BestoDineMark className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h2 className="text-[20px] font-bold tracking-tight leading-none">BestoDine</h2>
                            <p className="text-white/80 text-[12px] font-medium mt-0.5">Restaurant Management</p>
                        </div>
                    </div>

                    {/* Headline + feature highlights */}
                    <div className="max-w-lg">
                        <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm ring-1 ring-white/25 rounded-full px-3 py-1.5 mb-6">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span className="text-[12px] font-semibold tracking-wide">Staff Workspace</span>
                        </div>
                        <h1 className="text-[40px] xl:text-[48px] leading-[1.1] font-bold tracking-tight mb-5">
                            Run your floor<br />with confidence.
                        </h1>
                        <p className="text-white/85 text-[15px] leading-relaxed mb-8">
                            Take orders, manage tables, and track the kitchen in real time — everything your team needs, in one place.
                        </p>

                        <ul className="space-y-3">
                            {[
                                'Real-time order & table updates',
                                'Role-based access for every team member',
                                'Kitchen display, payments, and reports',
                            ].map((item) => (
                                <li key={item} className="flex items-center gap-3 text-[14px] font-medium">
                                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center ring-1 ring-white/30 shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                                    </span>
                                    <span className="text-white/95">{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Footer tag */}
                    <div className="flex items-center justify-between text-[12px] text-white/70">
                        <span className="font-medium">© {new Date().getFullYear()} BestoDine</span>
                        <span className="font-medium">v1.0</span>
                    </div>
                </div>
            </div>

            {/* ═══════════ RIGHT PANEL — Form ═══════════ */}
            <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10 relative">
                <div className={`relative w-full max-w-md transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    {/* Mobile brand (shown only when left panel is hidden) */}
                    <div className="lg:hidden flex items-center justify-center gap-3 mb-6">
                        <div className="w-11 h-11 bg-linear-to-br from-[#FE8301] to-[#FF6B00] rounded-xl flex items-center justify-center shadow-[0px_4px_14px_0px_#FE830140]">
                            <BestoDineMark className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-bold text-[#1A181B] tracking-tight leading-none">BestoDine</h2>
                            <p className="text-[#7D7380] text-[11px] font-medium mt-0.5">Restaurant Management</p>
                        </div>
                    </div>

                    {/* Main card */}
                    <div className="bg-white rounded-2xl shadow-[0px_8px_32px_0px_#00000014] border border-gray-100 overflow-hidden">
                        {/* Header */}
                        <div className="px-8 pt-8 pb-5 border-b border-gray-100">
                            <div className="inline-flex items-center gap-1.5 bg-[#FFF3E6] text-[#FE8301] rounded-full px-2.5 py-1 mb-3">
                                <LogIn className="w-3 h-3" />
                                <span className="text-[11px] font-bold tracking-wide uppercase">Staff Portal</span>
                            </div>
                            <h1 className="text-[24px] leading-[30px] font-bold text-[#1A181B] tracking-tight">Welcome back</h1>
                            <p className="text-[13px] text-[#7D7380] font-medium mt-1">Sign in to access your workspace</p>
                        </div>

                        <div className="px-8 py-6 space-y-5">
                        {/* Form-level error — wrong credentials, network, etc. */}
                        {formError && (
                            <div
                                role="alert"
                                className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-[shake_0.3s_ease-in-out]"
                            >
                                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                                    <span className="text-red-600 text-xs font-bold">!</span>
                                </div>
                                <p className="text-sm text-red-700 font-medium">{formError}</p>
                            </div>
                        )}

                        {signupStatus && (
                            <SignupStatusPanel
                                code={signupStatus.code}
                                message={signupStatus.message}
                                reason={signupStatus.reason}
                                onDismiss={() => { setSignupStatus(null); form.focusField('email'); }}
                            />
                        )}

                        {/* Login Form */}
                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {/* Email */}
                            <div>
                                <label htmlFor="email" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                                    Email address <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <div className="relative group">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7D7380] group-focus-within:text-[#FE8301] transition-colors" />
                                    <input
                                        ref={form.registerRef('email')}
                                        type="email"
                                        id="email"
                                        name="email"
                                        value={form.values.email}
                                        onChange={form.handleChange}
                                        onBlur={form.handleBlur}
                                        className={
                                            'w-full pl-10 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-sm bg-white placeholder:text-[#7D7380] text-[#1A181B] ' +
                                            (emailError
                                                ? 'border-red-400 focus:ring-red-200 focus:border-red-500'
                                                : 'border-gray-200 focus:ring-[#FE8301]/30 focus:border-[#FE8301]')
                                        }
                                        placeholder="you@yourrestaurant.com"
                                        autoComplete="email"
                                        aria-required="true"
                                        aria-invalid={emailError ? 'true' : 'false'}
                                        aria-describedby={emailError ? 'email-err' : undefined}
                                    />
                                </div>
                                {emailError && (
                                    <p id="email-err" role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                        <span aria-hidden="true">⚠</span>{form.errors.email}
                                    </p>
                                )}
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="password" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                                    Password <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7D7380] group-focus-within:text-[#FE8301] transition-colors" />
                                    <input
                                        ref={form.registerRef('password')}
                                        type={showPassword ? 'text' : 'password'}
                                        id="password"
                                        name="password"
                                        autoComplete="current-password"
                                        value={form.values.password}
                                        onChange={form.handleChange}
                                        onBlur={form.handleBlur}
                                        className={
                                            'w-full pl-10 pr-11 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-sm bg-white placeholder:text-[#7D7380] text-[#1A181B] ' +
                                            (passwordError
                                                ? 'border-red-400 focus:ring-red-200 focus:border-red-500'
                                                : 'border-gray-200 focus:ring-[#FE8301]/30 focus:border-[#FE8301]')
                                        }
                                        placeholder="Your password"
                                        aria-required="true"
                                        aria-invalid={passwordError ? 'true' : 'false'}
                                        aria-describedby={passwordError ? 'password-err' : undefined}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        tabIndex={-1}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7D7380] hover:text-[#FE8301] transition-colors p-0.5"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {passwordError && (
                                    <p id="password-err" role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                        <span aria-hidden="true">⚠</span>{form.errors.password}
                                    </p>
                                )}
                            </div>

                            {/* Remember email */}
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={rememberEmail}
                                    onChange={(e) => setRememberEmail(e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-[#FE8301] focus:ring-[#FE8301]/30 cursor-pointer accent-[#FE8301]"
                                />
                                <span className="text-[13px] text-[#1A181B] font-medium">Remember my email</span>
                            </label>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading}
                                aria-busy={loading ? 'true' : 'false'}
                                className="w-full bg-[#FE8301] hover:bg-[#E57501] text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0px_4px_14px_0px_#FE830140] hover:shadow-[0px_6px_20px_0px_#FE830160] active:scale-[0.98] text-[14px]"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Signing in...</span>
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="w-4 h-4" />
                                        <span>Sign In</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>

                    {/* Footer links */}
                    <div className="mt-5 space-y-2">
                        <div className="text-center">
                            <p className="text-[#1A181B]/70 text-[13px] font-medium">
                                Looking for customer login?{' '}
                                <a href="/login" className="text-[#FE8301] hover:text-[#E57501] font-semibold transition-colors underline underline-offset-4 decoration-[#FE8301]/40 hover:decoration-[#FE8301]">
                                    Customer Portal
                                </a>
                            </p>
                        </div>
                        {/* "Request a demo" — previously rendered only when
                            VITE_MARKETING_URL was configured (and pointed at a
                            separate marketing site), so on most deployments
                            the link simply wasn't there. It now always shows
                            and opens an in-app form that posts to the same
                            public lead endpoint the marketing site uses
                            (POST /public/lead → Super Admin "Leads"). */}
                        <p className="text-center text-[#1A181B]/70 text-[13px] font-medium">
                            New to BestoDine?{' '}
                            <Link
                                to="/register-restaurant"
                                className="inline-flex items-center gap-1 text-[#FE8301] hover:text-[#E57501] font-semibold transition-colors underline underline-offset-4 decoration-[#FE8301]/40 hover:decoration-[#FE8301]"
                            >
                                <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                                Register your hotel
                            </Link>
                            {' · '}
                            <button
                                type="button"
                                onClick={() => setDemoOpen(true)}
                                className="text-[#FE8301] hover:text-[#E57501] font-semibold transition-colors underline underline-offset-4 decoration-[#FE8301]/40 hover:decoration-[#FE8301]"
                            >
                                Request a demo
                            </button>
                        </p>
                    </div>
                </div>
            </div>
            {demoOpen && <RequestDemoModal onClose={() => setDemoOpen(false)} />}
        </div>
    );
};

// ─── Request-a-demo modal ─────────────────────────────────────────────
// Thin modal shell around the shared <RequestDemoForm /> (also used by the
// standalone /request-demo page).
const RequestDemoModal = ({ onClose }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 font-manrope">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="demo-title"
                className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            >
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-linear-to-br from-[#FE8301] to-[#FF6B00] rounded-xl flex items-center justify-center shrink-0">
                            <BestoDineMark className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 id="demo-title" className="text-[18px] font-bold text-[#1A181B] leading-tight">Request a demo</h2>
                            <p className="text-[12px] text-[#7D7380] font-medium">See BestoDine running for your restaurant</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors"
                    >
                        <X className="w-4 h-4 text-[#5A535F]" />
                    </button>
                </div>
                <RequestDemoForm source="staff-login" onDone={onClose} />
            </div>
        </div>
    );
};

// ─── Signup status panel ──────────────────────────────────────────────
// A self-registered hotel's owner can't sign in until a platform operator
// approves the signup. The backend answers 403 SIGNUP_PENDING /
// SIGNUP_REJECTED (with a message) — show that as a status, not an error.
const SignupStatusPanel = ({ code, message, reason, onDismiss }) => {
    const pending = code === 'SIGNUP_PENDING';
    return (
        <div
            role="status"
            className={`rounded-xl border px-4 py-4 ${pending ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}
        >
            <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${pending ? 'bg-amber-100' : 'bg-red-100'}`}>
                    {pending
                        ? <Hourglass className="w-4 h-4 text-amber-700" />
                        : <XCircle className="w-4 h-4 text-red-700" />}
                </div>
                <div className="min-w-0">
                    <p className={`text-[14px] font-bold ${pending ? 'text-amber-900' : 'text-red-900'}`}>
                        {pending ? 'Your hotel is awaiting approval' : 'Your registration was not approved'}
                    </p>
                    <p className={`text-[13px] mt-1 leading-relaxed ${pending ? 'text-amber-800' : 'text-red-800'}`}>
                        {message || (pending
                            ? "We're reviewing your application — usually within one business day. We'll email you as soon as your account is approved."
                            : 'Please contact us if you think this is a mistake.')}
                    </p>
                    {!pending && reason && reason !== message && (
                        <p className="text-[13px] mt-2 text-red-800">
                            <span className="font-semibold">Reason:</span> {reason}
                        </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
                        {!pending && (
                            <Link to="/request-demo" className="text-[#FE8301] hover:text-[#E57501] underline underline-offset-4">
                                Contact us
                            </Link>
                        )}
                        <button type="button" onClick={onDismiss} className="text-[#5A535F] hover:text-[#1A181B]">
                            Try another account
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
