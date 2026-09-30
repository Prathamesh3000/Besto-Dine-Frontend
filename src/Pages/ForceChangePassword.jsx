import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Lock, ShieldCheck, KeyRound, LogOut, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { useAuth, USER_ROLES } from '../Context/AuthContext';
import api from '../utils/api';
import { currentAudience, setEntryAudience, loginPathForAudience, STAFF_SIDE_AUDIENCES } from '../utils/authStorage';
import {
    useFormValidation,
    combine,
    required,
    minLen,
} from '../hooks/useFormValidation';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=<>?]).{8,}$/;

const ForceChangePassword = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, updateProfile, logout, audience: sessionAudience } = useAuth();

    // Shared page (Super Admin + tenant staff): act on the audience that
    // holds the account which must change its password — passed by the
    // login page, else the session AuthContext hydrated, else detected
    // from storage by currentAudience(). The token pair returned by
    // change-password is stored back to this same audience (api.js reads
    // `_aud` from the request config).
    const stateAudience = STAFF_SIDE_AUDIENCES.includes(location.state?.audience) ? location.state.audience : null;
    const audience = stateAudience || sessionAudience || currentAudience();
    useEffect(() => { setEntryAudience(audience); }, [audience]);

    const form = useFormValidation(
        { currentPassword: '', newPassword: '', confirmPassword: '' },
        {
            currentPassword: required('Current password'),
            newPassword: combine(
                required('New password'),
                minLen(8, 'New password'),
                // Composition rule + "must differ from current" — both live
                // here so both errors land on the newPassword field, not
                // bubbled into a generic banner.
                (v) => PASSWORD_REGEX.test(v)
                    ? null
                    : 'Use uppercase, lowercase, number, and a special character',
                (v, all) => v && v === all.currentPassword
                    ? 'New password must be different from your current password'
                    : null,
            ),
            confirmPassword: combine(
                required('Confirm password'),
                (v, all) => v === all.newPassword ? null : 'Passwords do not match',
            ),
        },
    );

    // Form-level error — wrong current password (server-validated),
    // network failure, etc. Field-level errors live in `form.errors`.
    const [formError, setFormError] = useState('');
    const [loading, setLoading] = useState(false);
    const [show, setShow] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });

    const toggleShow = (field) => setShow(prev => ({ ...prev, [field]: !prev[field] }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!form.validateAll()) return;

        setLoading(true);
        try {
            // _silent so the axios interceptor doesn't fire a generic
            // toast — we surface the message inline (or route it onto
            // the currentPassword field for INVALID_CURRENT_PASSWORD).
            const res = await api.put(
                '/auth/change-password',
                {
                    currentPassword: form.values.currentPassword,
                    newPassword: form.values.newPassword,
                },
                { _silent: true, _aud: audience },
            );

            if (res.data.success) {
                updateProfile({ mustChangePassword: false });

                const role = user?.role;
                if (role === USER_ROLES.WAITER || role === USER_ROLES.CAPTAIN) {
                    navigate('/waiter/home', { replace: true });
                } else if (role === USER_ROLES.CHEF) {
                    navigate('/chef/dashboard', { replace: true });
                } else if (role === USER_ROLES.ADMIN || role === USER_ROLES.MANAGER) {
                    navigate('/admin/dashboard', { replace: true });
                } else if (role === USER_ROLES.SUPERADMIN) {
                    navigate('/superadmin/dashboard', { replace: true });
                } else {
                    navigate('/', { replace: true });
                }
            }
        } catch (err) {
            const code = err.response?.data?.code;
            const msg  = err.response?.data?.message;
            // Land "wrong current password" back onto the current field
            // so the user knows exactly what to fix.
            if (code === 'INVALID_CURRENT_PASSWORD' || /current.*password/i.test(msg || '')) {
                form.setServerErrors({ currentPassword: msg || 'Current password is incorrect' });
            } else {
                setFormError(msg || 'Failed to change password. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        const { wasStaff, audience: loggedOut } = logout();
        navigate(wasStaff ? loginPathForAudience(loggedOut || audience) : '/login', { replace: true });
    };

    // Live password-strength meter — drives the visual bar + checklist.
    // Drives off form.values.newPassword so the meter updates as they type.
    const newPw = form.values.newPassword;
    const rules = [
        { label: 'At least 8 characters', pass: newPw.length >= 8 },
        { label: 'One uppercase letter',  pass: /[A-Z]/.test(newPw) },
        { label: 'One lowercase letter',  pass: /[a-z]/.test(newPw) },
        { label: 'One number',            pass: /\d/.test(newPw) },
        { label: 'One special character', pass: /[!@#$%^&*()_\-+=<>?]/.test(newPw) },
    ];
    const strengthScore = rules.filter(r => r.pass).length;
    const strengthLabel = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][strengthScore] || 'Very weak';
    const strengthColor = [
        'bg-red-400',
        'bg-red-400',
        'bg-amber-400',
        'bg-amber-400',
        'bg-lime-500',
        'bg-emerald-500',
    ][strengthScore] || 'bg-red-400';

    // ── Per-field error helpers ─────────────────────────────────────────
    const fieldErr = (name) => form.touched[name] && form.errors[name];
    const currentErr = fieldErr('currentPassword');
    const newErr     = fieldErr('newPassword');
    const confirmErr = fieldErr('confirmPassword');

    // Input class builder — toggles red border on invalid.
    const inputCls = (hasError) =>
        'w-full pl-10 pr-11 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all text-sm bg-white placeholder:text-[#7D7380] text-[#1A181B] ' +
        (hasError
            ? 'border-red-400 focus:ring-red-200 focus:border-red-500'
            : 'border-gray-200 focus:ring-[#FE8301]/30 focus:border-[#FE8301]');

    return (
        <div className="min-h-screen bg-[#FAF5F0] font-manrope flex items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient orange blur accents to match admin theme */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-48 -right-48 w-96 h-96 bg-[#FE8301]/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-48 -left-48 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-orange-200/15 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-[0px_8px_32px_0px_#00000014] border border-gray-100 overflow-hidden">
                    {/* Header — orange gradient to match admin accent */}
                    <div className="bg-linear-to-r from-[#FE8301] to-[#FF9D3D] px-8 pt-7 pb-6 relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                        <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full blur-xl" />
                        <div className="relative flex items-center gap-3">
                            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center ring-1 ring-white/30">
                                <ShieldCheck className="w-6 h-6 text-white" strokeWidth={2.2} />
                            </div>
                            <div>
                                <h1 className="text-[22px] leading-7 font-bold text-white tracking-tight">Change Your Password</h1>
                                <p className="text-white/85 text-[13px] leading-4.5 font-medium">Required for security</p>
                            </div>
                        </div>
                    </div>

                    <div className="px-8 py-6">
                        {/* Info banner */}
                        <div className="bg-[#FFF3E6] border border-orange-200/60 rounded-xl px-4 py-3 flex items-start gap-3 mb-5">
                            <div className="w-5 h-5 rounded-full bg-[#FE8301]/15 flex items-center justify-center shrink-0 mt-0.5">
                                <KeyRound className="w-3 h-3 text-[#FE8301]" />
                            </div>
                            <p className="text-[13px] text-[#1A181B] font-medium leading-relaxed">
                                For security, you must set a new password before continuing.
                            </p>
                        </div>

                        {/* Form-level error — server-side failures only. */}
                        {formError && (
                            <div
                                role="alert"
                                className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3 mb-5 animate-[shake_0.3s_ease-in-out]"
                            >
                                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700 font-medium">{formError}</p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                            {/* Current password */}
                            <div>
                                <label htmlFor="currentPassword" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                                    Current (temporary) password <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7D7380] group-focus-within:text-[#FE8301] transition-colors" />
                                    <input
                                        ref={form.registerRef('currentPassword')}
                                        type={show.currentPassword ? 'text' : 'password'}
                                        id="currentPassword"
                                        name="currentPassword"
                                        autoComplete="current-password"
                                        value={form.values.currentPassword}
                                        onChange={form.handleChange}
                                        onBlur={form.handleBlur}
                                        className={inputCls(currentErr)}
                                        placeholder="The password emailed to you"
                                        aria-required="true"
                                        aria-invalid={currentErr ? 'true' : 'false'}
                                        aria-describedby={currentErr ? 'cur-pw-err' : undefined}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleShow('currentPassword')}
                                        tabIndex={-1}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7D7380] hover:text-[#FE8301] transition-colors p-0.5"
                                        aria-label={show.currentPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {show.currentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {currentErr && (
                                    <p id="cur-pw-err" role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                        <span aria-hidden="true">⚠</span>{form.errors.currentPassword}
                                    </p>
                                )}
                            </div>

                            {/* New password */}
                            <div>
                                <label htmlFor="newPassword" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                                    New password <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7D7380] group-focus-within:text-[#FE8301] transition-colors" />
                                    <input
                                        ref={form.registerRef('newPassword')}
                                        type={show.newPassword ? 'text' : 'password'}
                                        id="newPassword"
                                        name="newPassword"
                                        autoComplete="new-password"
                                        value={form.values.newPassword}
                                        onChange={form.handleChange}
                                        onBlur={form.handleBlur}
                                        className={inputCls(newErr)}
                                        placeholder="At least 8 characters, mix of types"
                                        aria-required="true"
                                        aria-invalid={newErr ? 'true' : 'false'}
                                        aria-describedby={newErr ? 'new-pw-err' : 'new-pw-strength'}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleShow('newPassword')}
                                        tabIndex={-1}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7D7380] hover:text-[#FE8301] transition-colors p-0.5"
                                        aria-label={show.newPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {show.newPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>

                                {/* Strength meter */}
                                {newPw && !newErr && (
                                    <div id="new-pw-strength" className="mt-2">
                                        <div className="flex items-center gap-1.5">
                                            {[0, 1, 2, 3, 4].map(i => (
                                                <div
                                                    key={i}
                                                    className={`h-1 flex-1 rounded-full transition-colors ${
                                                        i < strengthScore ? strengthColor : 'bg-gray-200'
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                        <p className="text-[11px] font-semibold text-[#7D7380] mt-1">
                                            Strength: <span className="text-[#1A181B]">{strengthLabel}</span>
                                        </p>
                                    </div>
                                )}

                                {newErr && (
                                    <p id="new-pw-err" role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                        <span aria-hidden="true">⚠</span>{form.errors.newPassword}
                                    </p>
                                )}
                            </div>

                            {/* Confirm password */}
                            <div>
                                <label htmlFor="confirmPassword" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                                    Confirm new password <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7D7380] group-focus-within:text-[#FE8301] transition-colors" />
                                    <input
                                        ref={form.registerRef('confirmPassword')}
                                        type={show.confirmPassword ? 'text' : 'password'}
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        autoComplete="new-password"
                                        value={form.values.confirmPassword}
                                        onChange={form.handleChange}
                                        onBlur={form.handleBlur}
                                        className={inputCls(confirmErr)}
                                        placeholder="Re-enter new password"
                                        aria-required="true"
                                        aria-invalid={confirmErr ? 'true' : 'false'}
                                        aria-describedby={confirmErr ? 'cnf-pw-err' : undefined}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleShow('confirmPassword')}
                                        tabIndex={-1}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7D7380] hover:text-[#FE8301] transition-colors p-0.5"
                                        aria-label={show.confirmPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {show.confirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                {confirmErr && (
                                    <p id="cnf-pw-err" role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                        <span aria-hidden="true">⚠</span>{form.errors.confirmPassword}
                                    </p>
                                )}
                            </div>

                            {/* Password requirements */}
                            <div className="bg-[#FAF5F0] rounded-xl p-4 border border-gray-100">
                                <p className="text-[12px] font-bold text-[#1A181B] mb-2 tracking-wide uppercase">Password requirements</p>
                                <ul className="space-y-1.5">
                                    {rules.map((rule) => (
                                        <li
                                            key={rule.label}
                                            className={`flex items-center gap-2 text-[12px] font-medium transition-colors ${
                                                rule.pass ? 'text-emerald-600' : 'text-[#7D7380]'
                                            }`}
                                        >
                                            {rule.pass ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                                            ) : (
                                                <Circle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                                            )}
                                            <span>{rule.label}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

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
                                        <span>Changing password…</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="w-4 h-4" />
                                        <span>Set new password</span>
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Logout link */}
                        <button
                            onClick={handleLogout}
                            className="w-full mt-4 text-center text-[13px] text-[#7D7380] hover:text-[#FE8301] font-medium transition-colors flex items-center justify-center gap-1.5"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign out instead
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForceChangePassword;
