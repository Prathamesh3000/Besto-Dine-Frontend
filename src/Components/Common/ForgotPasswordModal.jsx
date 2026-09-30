import React, { useEffect, useRef, useState } from 'react';
import { Mail, X, AlertCircle, CheckCircle2, KeyRound, ArrowLeft } from 'lucide-react';
import api from '../../utils/api';

/**
 * Forgot-password dialog for the customer login screen.
 *
 * Replaces the old flow where "Forgot password?" silently read the
 * email out of the login form and fired a toast. Users didn't know
 * which address the link went to, whether anything happened, or what
 * to do if it never arrived. This dialog:
 *   • asks for (and lets them correct) the email explicitly,
 *   • shows a clear "check your inbox" state naming the address,
 *   • explains expiry + spam folder,
 *   • offers a rate-limited "Resend" instead of re-opening the dialog.
 *
 * The server answers 200 whether or not the account exists (so the
 * endpoint can't be used to discover customers), so the success copy
 * stays conditional: "if an account exists…".
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 30;
const sans = { fontFamily: 'var(--montserrat-font)' };
const serif = { fontFamily: 'var(--cormorant-font)' };

export default function ForgotPasswordModal({ initialEmail = '', onClose }) {
    const [email, setEmail] = useState(initialEmail);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const [sentTo, setSentTo] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 50);
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        document.addEventListener('keydown', onKey);
        return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
    }, [onClose]);

    useEffect(() => {
        if (cooldown <= 0) return undefined;
        const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [cooldown]);

    const send = async (target) => {
        const clean = String(target || '').trim();
        if (!clean) { setError('Please enter your email address.'); return; }
        if (!EMAIL_REGEX.test(clean)) { setError('Enter a valid email address.'); return; }
        setError('');
        setSending(true);
        try {
            await api.post('/auth/forgot-password', { email: clean }, { _silent: true });
            setSentTo(clean);
            setCooldown(RESEND_COOLDOWN_SECONDS);
        } catch (err) {
            const status = err.response?.status;
            if (status === 429) {
                setError(err.response?.data?.message || 'Too many reset requests. Please try again in 15 minutes.');
            } else if (status === 400) {
                setError(err.response?.data?.message || 'Enter a valid email address.');
            } else {
                setError("We couldn't reach the server. Check your connection and try again.");
            }
        } finally {
            setSending(false);
        }
    };

    const onSubmit = (e) => { e.preventDefault(); send(email); };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-[2px] animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-password-title"
            onClick={onClose}
            style={sans}
        >
            <div
                className="relative w-full sm:max-w-[420px] bg-white rounded-t-[24px] sm:rounded-[24px] shadow-[0_20px_60px_rgba(0,0,0,0.25)]"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute right-4 top-4 w-9 h-9 rounded-full bg-[#F6F7F1] hover:bg-[#ECEEE5] flex items-center justify-center text-[#645E66] transition-colors z-10"
                >
                    <X size={18} />
                </button>

                <div className="px-6 pt-7 pb-5 bg-linear-to-br from-[#FFF6E8] to-[#FFFCF5] rounded-t-[24px]">
                    <div className="w-14 h-14 rounded-[18px] bg-white shadow-[0_4px_14px_rgba(255,155,11,0.25)] flex items-center justify-center mb-3">
                        {sentTo
                            ? <CheckCircle2 size={26} className="text-green-600" />
                            : <KeyRound size={26} className="text-[#FF9B0B]" />}
                    </div>
                    <h2 id="forgot-password-title" className="text-[24px] font-bold text-[#1A181B] leading-[1.2]" style={serif}>
                        {sentTo ? 'Check your inbox' : 'Forgot your password?'}
                    </h2>
                    <p className="mt-1.5 text-[13px] text-[#645E66] leading-snug">
                        {sentTo
                            ? 'If an account exists for this email, we’ve sent a link to reset your password.'
                            : 'Enter the email you registered with and we’ll send you a secure link to set a new password.'}
                    </p>
                </div>

                <div className="px-6 py-5">
                    {!sentTo ? (
                        <form onSubmit={onSubmit} noValidate className="space-y-4">
                            <div>
                                <label htmlFor="forgot-email" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                                    Email address
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A3A3A3]" />
                                    <input
                                        ref={inputRef}
                                        id="forgot-email"
                                        type="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
                                        aria-invalid={!!error}
                                        aria-describedby={error ? 'forgot-email-error' : undefined}
                                        placeholder="you@yourdomain.com"
                                        className={`w-full pl-11 pr-4 py-3 bg-[#F6F7F1] border rounded-[12px] text-[14px] focus:outline-none focus:ring-2 transition-colors placeholder-[#A3A3A3] ${
                                            error
                                                ? 'border-red-400 focus:ring-red-300/40 focus:border-red-500'
                                                : 'border-[#E6E8DF] focus:ring-[#FF9B0B]/40 focus:border-[#FF9B0B]'
                                        }`}
                                    />
                                </div>
                                {error && (
                                    <p id="forgot-email-error" role="alert" className="mt-1.5 text-[12px] text-red-600 flex items-center gap-1.5">
                                        <AlertCircle size={13} /> {error}
                                    </p>
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={sending}
                                aria-busy={sending ? 'true' : 'false'}
                                className="w-full bg-[#FF9B0B] text-white font-semibold py-3 rounded-[12px] shadow-[0_6px_18px_rgba(255,155,11,0.28)] hover:bg-[#E07E00] disabled:opacity-60 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
                            >
                                {sending ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Sending link…</span>
                                    </>
                                ) : (
                                    <span>Send reset link</span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full inline-flex items-center justify-center gap-1.5 text-[13px] text-[#645E66] hover:text-[#1A181B] font-medium transition-colors"
                            >
                                <ArrowLeft size={14} /> Back to sign in
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 bg-[#F6F7F1] border border-[#E6E8DF] rounded-[12px] px-4 py-3">
                                <Mail size={16} className="text-[#FF9B0B] shrink-0" />
                                <span className="text-[14px] font-semibold text-[#1A181B] break-all">{sentTo}</span>
                            </div>
                            <ul className="text-[12.5px] text-[#645E66] space-y-1.5 leading-snug">
                                <li>• The link expires in 30 minutes and can be used once.</li>
                                <li>• Don’t see it? Check your Spam / Promotions folder.</li>
                                <li>• Registered with a different email? Go back and try that one.</li>
                            </ul>
                            {error && (
                                <p role="alert" className="text-[12px] text-red-600 flex items-center gap-1.5">
                                    <AlertCircle size={13} /> {error}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full bg-[#FF9B0B] text-white font-semibold py-3 rounded-[12px] shadow-[0_6px_18px_rgba(255,155,11,0.28)] hover:bg-[#E07E00] transition-all"
                            >
                                Back to sign in
                            </button>
                            <div className="flex items-center justify-between text-[13px]">
                                <button
                                    type="button"
                                    onClick={() => { setSentTo(''); setError(''); }}
                                    className="text-[#645E66] hover:text-[#1A181B] font-medium transition-colors"
                                >
                                    Use a different email
                                </button>
                                <button
                                    type="button"
                                    onClick={() => send(sentTo)}
                                    disabled={sending || cooldown > 0}
                                    className="text-[#FF9B0B] hover:text-[#E07E00] font-semibold transition-colors disabled:text-[#A3A3A3] disabled:cursor-not-allowed"
                                >
                                    {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
