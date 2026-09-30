import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { scorePassword, STRENGTH_LABELS, STRENGTH_COLORS, MIN_PASSWORD_SCORE, MIN_LENGTH, passwordRuleFailures } from '../../utils/passwordPolicy';

/**
 * Landing page for the emailed password-reset link.
 *
 * Pairs with POST /auth/reset-password. The token arrives in the query
 * string; it is single-use, 30-minute TTL, and only its SHA-256 hash
 * is stored server-side.
 */
export default function ResetPassword() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const token = params.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [formError, setFormError] = useState('');

    const score = useMemo(() => scorePassword(password), [password]);
    const failures = useMemo(() => passwordRuleFailures(password), [password]);

    const submit = async (e) => {
        e.preventDefault();
        setFormError('');

        if (failures.length) {
            setFormError('Your password does not meet the requirements below.');
            return;
        }
        if (password !== confirm) {
            setFormError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post(
                '/auth/reset-password',
                { token, newPassword: password },
                { _silent: true },
            );
            if (res.data?.success) {
                setDone(true);
                toast.success('Password updated');
            } else {
                setFormError(res.data?.message || 'Could not reset your password.');
            }
        } catch (err) {
            // TOKEN_INVALID covers missing / used / expired — the server
            // deliberately does not distinguish them, so offer the one
            // action that always helps: request a fresh link.
            setFormError(
                err.response?.data?.message
                || 'This reset link is invalid or has expired. Please request a new one.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (!token) {
        return (
            <Shell>
                <h1 className="text-[20px] font-bold text-[#1A181B] mb-2">Link incomplete</h1>
                <p className="text-[14px] text-[#645E66] mb-6">
                    This page needs the reset link from your email. Open the link again, or ask for a new one.
                </p>
                <Link to="/login" className="text-[#FE8301] font-semibold text-[14px]">Back to login</Link>
            </Shell>
        );
    }

    if (done) {
        return (
            <Shell>
                <div className="flex items-center gap-2 mb-3 text-green-600">
                    <CheckCircle2 size={22} />
                    <h1 className="text-[20px] font-bold text-[#1A181B]">Password updated</h1>
                </div>
                <p className="text-[14px] text-[#645E66] mb-6">
                    You can now log in with your new password.
                </p>
                <button
                    onClick={() => navigate('/login', { replace: true })}
                    className="w-full bg-[#FE8301] text-white font-semibold py-3 rounded-[12px]"
                >
                    Go to login
                </button>
            </Shell>
        );
    }

    return (
        <Shell>
            <h1 className="text-[20px] font-bold text-[#1A181B] mb-1">Choose a new password</h1>
            <p className="text-[14px] text-[#645E66] mb-6">
                Pick something you haven't used here before.
            </p>

            {formError && (
                <div role="alert" className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-[12px] p-3">
                    <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                    <p className="text-[13px] text-red-700">{formError}</p>
                </div>
            )}

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <label htmlFor="new-password" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                        New password
                    </label>
                    <div className="relative">
                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
                        <input
                            id="new-password"
                            type={showPw ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            className="w-full pl-11 pr-11 py-3 bg-[#F6F7F1] border border-[#E6E8DF] rounded-[12px] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FF9B0B]/40"
                            placeholder="Enter a new password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPw((v) => !v)}
                            aria-label={showPw ? 'Hide password' : 'Show password'}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A3A3A3]"
                        >
                            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    {password && (
                        <>
                            <div className="mt-2 flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all ${STRENGTH_COLORS[score]}`}
                                        style={{ width: `${(score / 4) * 100}%` }}
                                    />
                                </div>
                                <span className="text-[11px] text-[#645E66] w-16">{STRENGTH_LABELS[score]}</span>
                            </div>
                            <PasswordRules failures={failures} />
                        </>
                    )}
                </div>

                <div>
                    <label htmlFor="confirm-password" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                        Confirm password
                    </label>
                    <div className="relative">
                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A3A3A3]" />
                        <input
                            id="confirm-password"
                            type={showPw ? 'text' : 'password'}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            className="w-full pl-11 pr-4 py-3 bg-[#F6F7F1] border border-[#E6E8DF] rounded-[12px] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#FF9B0B]/40"
                            placeholder="Re-enter your password"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={submitting || score < MIN_PASSWORD_SCORE || !confirm}
                    className="w-full bg-[#FE8301] disabled:bg-[#FE8301]/40 text-white font-semibold py-3 rounded-[12px] transition-colors"
                >
                    {submitting ? 'Updating…' : 'Update password'}
                </button>
            </form>
        </Shell>
    );
}

/** Shared centred card so the three states don't each re-lay it out. */
function Shell({ children }) {
    return (
        <div className="min-h-screen bg-[#F6F6F7] flex items-center justify-center p-4">
            <div className="w-full max-w-[420px] bg-white rounded-[20px] p-7 shadow-[0px_8px_32px_0px_#00000014]">
                {children}
            </div>
        </div>
    );
}

/**
 * The requirements list, shown live rather than as an error after
 * submit. A rule you can see yourself satisfying beats a rejection
 * that tells you what you should have typed.
 */
function PasswordRules({ failures }) {
    const RULES = [
        ['length', `At least ${MIN_LENGTH} characters`],
        ['case', 'Upper and lower case letters'],
        ['digit', 'A number'],
        ['special', 'A special character (!@#$…)'],
    ];
    return (
        <ul className="mt-2 space-y-1">
            {RULES.map(([key, label]) => {
                const failed = failures.includes(key);
                return (
                    <li key={key} className={`text-[12px] flex items-center gap-1.5 ${failed ? 'text-[#8D848F]' : 'text-green-600'}`}>
                        {failed
                            ? <span className="w-3 h-3 rounded-full border border-current inline-block shrink-0" />
                            : <CheckCircle2 size={12} className="shrink-0" />}
                        {label}
                    </li>
                );
            })}
        </ul>
    );
}
