// Pieces shared by the two self-signup pages (/register-restaurant and
// /start-trial): the page frame, form field primitives and the
// "Application received" screen used when the server answers 202
// (approval mode). Extracted from RegisterRestaurant.jsx so StartTrial
// does not copy them.
import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Globe, MailCheck, LogIn, Clock4, AlertCircle } from 'lucide-react';
import { getPublicAppOrigin } from '../../../utils/customerLinks';
import { PlatformBrand } from './PlatformChrome';

const inputBase = 'w-full py-3 pr-4 border rounded-xl text-[15px] bg-white text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 transition-all';
export const inputOk = `${inputBase} border-[#D0D5DD] focus:ring-[#FE8301]/25 focus:border-[#FE8301]`;
export const inputErr = `${inputBase} border-red-400 focus:ring-red-200 focus:border-red-500`;
export const labelCls = 'block text-[13px] font-bold text-[#344054] mb-1.5';
export const primaryBtn = 'inline-flex items-center justify-center gap-2 py-3.5 rounded-xl text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] shadow-[0_6px_20px_rgba(254,131,1,0.3)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors';

export function FieldError({ id, message }) {
    if (!message) return null;
    return (
        <p id={id} role="alert" className="mt-1.5 text-[12px] text-red-600 flex items-start gap-1">
            <AlertCircle size={13} className="shrink-0 mt-px" /> {message}
        </p>
    );
}

export function IconInput({ icon, id, error, className = '', ...props }) {
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

/** Top-of-form error banner (network / rate limit / unmapped server errors). */
export function FormErrorBanner({ message, children, innerRef }) {
    if (!message && !children) return null;
    return (
        <div ref={innerRef} role="alert" className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2.5 text-[14px] text-red-700 font-medium">
            <AlertCircle size={17} className="shrink-0 mt-0.5" />
            <span>{message}{children}</span>
        </div>
    );
}

/** Page frame: slim brand bar, benefits column on desktop, content column. */
export function SignupShell({ children, asideNote }) {
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
                        {asideNote || t('register_hotel.aside_note', '14 days free, no card needed, instant access — pick a plan only when you are ready.')}
                    </p>
                </aside>
                <div className="w-full max-w-xl mx-auto lg:mx-0">{children}</div>
            </main>
        </div>
    );
}

/** "Registration submitted" confirmation popup (N5) — shown over the success screen. */
export function SubmittedDialog({ name, email, onClose }) {
    const { t } = useTranslation();
    const closeRef = useRef(null);
    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                role="dialog" aria-modal="true" aria-labelledby="register-submitted-title"
                className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 sm:p-7"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="w-14 h-14 rounded-2xl bg-[#ECFDF3] text-[#067647] flex items-center justify-center">
                    <CheckCircle2 size={28} />
                </div>
                <h2 id="register-submitted-title" className="mt-4 text-[22px] font-extrabold tracking-tight text-[#101828]">
                    {t('register_hotel.popup_title', 'Registration submitted 🎉')}
                </h2>
                <p className="mt-1.5 text-[15px] text-[#475467] leading-relaxed">
                    {t('register_hotel.popup_body', "We'll review {{name}} and email you at {{email}}.", { name, email })}
                </p>
                <ol className="mt-4 space-y-2 text-[14px] text-[#344054] list-decimal pl-5">
                    <li>{t('register_hotel.popup_step1', 'Our team reviews your application — usually within one business day.')}</li>
                    <li>{t('register_hotel.popup_step2', 'You get an approval email at {{email}}.', { email })}</li>
                    <li>{t('register_hotel.popup_step3', 'Sign in at Staff login with the email and password you just created.')}</li>
                </ol>
                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <button
                        ref={closeRef} type="button" onClick={onClose}
                        className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-xl text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] transition-colors"
                    >
                        {t('register_hotel.popup_ok', 'Got it')}
                    </button>
                    <Link
                        to="/staff-login"
                        className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[15px] font-bold text-[#1A181B] border border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors"
                    >
                        <LogIn size={17} /> {t('register_hotel.go_login', 'Go to staff login')}
                    </Link>
                </div>
            </div>
        </div>
    );
}

/**
 * Approval-mode (202) outcome: "Application received" + what happens next.
 * `result` = { name, slug, pageUrl, message, email, planName }.
 */
export function ApplicationReceived({ result, showConfirm, onCloseConfirm }) {
    const { t } = useTranslation();
    const origin = getPublicAppOrigin();
    const pageUrl = result.pageUrl || (result.slug ? `${origin}/${result.slug}` : '');
    return (
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
            {showConfirm && (
                <SubmittedDialog name={result.name} email={result.email} onClose={onCloseConfirm} />
            )}
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
    );
}
