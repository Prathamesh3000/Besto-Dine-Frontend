import React, { useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { publicAPI } from '../../utils/api';

/**
 * "Request a demo" lead form — shared by the staff-login modal
 * (Pages/Login.jsx) and the standalone page (Pages/Platform/RequestDemo.jsx).
 *
 * Posts to the unauthenticated POST /public/lead (rate-limited 5/hour/IP on
 * the server → Super Admin "Leads"). Validation mirrors
 * publicController.submitLead so the user sees the problem inline instead
 * of a round-trip 400.
 *
 * Props:
 *   source    — lead source tag stored with the lead ('staff-login', 'request-demo', …)
 *   onDone    — optional; when set, the success state shows a button calling it
 *   doneLabel — label for that button (default "Done")
 *   idPrefix  — prefix for input ids so two instances never collide
 */
const DEMO_INITIAL = { name: '', restaurantName: '', phone: '', email: '', message: '' };

export default function RequestDemoForm({ source = 'staff-login', onDone, doneLabel, idPrefix = 'demo', initialValues }) {
    const { t } = useTranslation();
    const [values, setValues] = useState({ ...DEMO_INITIAL, ...(initialValues || {}) });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState('');

    const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const name = values.name.trim();
        const restaurantName = values.restaurantName.trim();
        const phoneDigits = values.phone.replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
        const emailVal = values.email.trim();
        if (name.length < 2) return setError(t('demo.err_name', 'Please enter your name.'));
        if (restaurantName.length < 2) return setError(t('demo.err_restaurant', 'Please enter your restaurant name.'));
        if (!/^[6-9]\d{9}$/.test(phoneDigits)) return setError(t('demo.err_phone', 'Please enter a valid 10-digit mobile number.'));
        if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) return setError(t('demo.err_email', 'Please enter a valid email address.'));

        setSubmitting(true);
        try {
            const res = await publicAPI.submitLead({
                name,
                restaurantName,
                phone: phoneDigits,
                email: emailVal || undefined,
                message: values.message.trim() || undefined,
                source,
            });
            setDone(res.data?.message || t('demo.thanks', "Thanks! We'll reach out within 24 hours."));
        } catch (err) {
            if (err.response?.status === 429) {
                setError(t('demo.err_rate_limit', 'Too many requests from this network — please try again in a little while.'));
            } else {
                setError(err.response?.data?.message || t('demo.err_generic', 'Could not submit right now — please try again.'));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FE8301]/30 focus:border-[#FE8301] transition-all text-sm bg-white placeholder:text-[#7D7380] text-[#1A181B]';
    const labelCls = 'block text-[13px] font-semibold text-[#1A181B] mb-1';
    const id = (f) => `${idPrefix}-${f}`;

    if (done) {
        return (
            <div className="px-6 py-10 flex flex-col items-center text-center gap-3" role="status">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                    <CalendarCheck className="w-7 h-7 text-emerald-600" />
                </div>
                <p className="text-[15px] font-semibold text-[#1A181B]">{done}</p>
                {onDone && (
                    <button
                        type="button"
                        onClick={onDone}
                        className="mt-2 bg-[#FE8301] hover:bg-[#E57501] text-white font-semibold py-2.5 px-6 rounded-xl text-[14px] transition-colors"
                    >
                        {doneLabel || t('demo.done', 'Done')}
                    </button>
                )}
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3.5" noValidate>
            {error && (
                <p role="alert" className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 text-sm text-red-700 font-medium">
                    {error}
                </p>
            )}
            <div>
                <label htmlFor={id('name')} className={labelCls}>{t('demo.name', 'Your name')} <span className="text-red-500">*</span></label>
                <input id={id('name')} className={inputCls} value={values.name} onChange={set('name')} maxLength={100} autoComplete="name" />
            </div>
            <div>
                <label htmlFor={id('restaurant')} className={labelCls}>{t('demo.restaurant', 'Restaurant name')} <span className="text-red-500">*</span></label>
                <input id={id('restaurant')} className={inputCls} value={values.restaurantName} onChange={set('restaurantName')} maxLength={100} autoComplete="organization" />
            </div>
            <div>
                <label htmlFor={id('phone')} className={labelCls}>{t('demo.phone', 'Mobile number')} <span className="text-red-500">*</span></label>
                <input id={id('phone')} type="tel" inputMode="tel" className={inputCls} value={values.phone} onChange={set('phone')} maxLength={16} placeholder="98765 43210" autoComplete="tel" />
            </div>
            <div>
                <label htmlFor={id('email')} className={labelCls}>{t('demo.email', 'Email')}</label>
                <input id={id('email')} type="email" className={inputCls} value={values.email} onChange={set('email')} maxLength={120} autoComplete="email" />
            </div>
            <div>
                <label htmlFor={id('message')} className={labelCls}>{t('demo.message', 'Anything we should know?')}</label>
                <textarea id={id('message')} rows={3} className={`${inputCls} resize-none`} value={values.message} onChange={set('message')} maxLength={500} />
            </div>
            <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#FE8301] hover:bg-[#E57501] text-white font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-[14px]"
            >
                {submitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <CalendarCheck className="w-4 h-4" />
                )}
                <span>{submitting ? t('demo.submitting', 'Submitting…') : t('demo.submit', 'Request demo')}</span>
            </button>
        </form>
    );
}
