// BestoDine PLATFORM home — route `/`. Marketing page for restaurant owners
// plus a "find a restaurant" search for diners. Each restaurant's own page
// lives at /:slug (Pages/Restaurant/RestaurantLandingPage.jsx).
import React, { useId, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion as Motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
    QrCode, ChefHat, Users, CalendarDays, Wallet, CreditCard, Building2, Boxes, BarChart3,
    MonitorSmartphone, Globe, Languages, Search, MapPin, ArrowRight, CheckCircle2, ChevronDown,
    ClipboardEdit, BadgeCheck, UtensilsCrossed, Printer, Sparkles, Loader2, Store,
} from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import { staffHomePath } from '../../utils/roleRouting';
import { publicAPI } from '../../utils/api';
import { resolveImageUrl } from '../../utils/image';
import { getPublicAppOrigin } from '../../utils/customerLinks';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { PlatformHeader, PlatformFooter } from './components/PlatformChrome';
import {
    PLATFORM_TITLE, PLATFORM_DESCRIPTION, usePageMeta, usePublicPlans, formatPlanPrice, planHighlights,
} from './platformShared';

const primaryBtn = 'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] shadow-[0_6px_20px_rgba(254,131,1,0.35)] transition-colors';
const secondaryBtn = 'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-[15px] font-bold text-[#1A181B] bg-white border border-[#EAECF0] hover:border-[#D0D5DD] hover:bg-[#F9FAFB] transition-colors';

const fadeUp = {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.45, ease: 'easeOut' },
};

function SectionHeading({ eyebrow, title, subtitle }) {
    return (
        <div className="max-w-2xl mx-auto text-center mb-10">
            {eyebrow && <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#FE8301]">{eyebrow}</p>}
            <h2 className="mt-2 text-[28px] sm:text-[34px] leading-tight font-extrabold tracking-tight text-[#101828]">{title}</h2>
            {subtitle && <p className="mt-3 text-[15px] sm:text-[16px] text-[#475467] leading-relaxed">{subtitle}</p>}
        </div>
    );
}

// ── Hero illustration: a stylised phone showing a QR table order ──────────
function HeroVisual() {
    const { t } = useTranslation();
    const rows = [
        [t('platform.hero.mock_item1', 'Paneer Tikka'), '₹280'],
        [t('platform.hero.mock_item2', 'Masala Dosa'), '₹160'],
        [t('platform.hero.mock_item3', 'Cold Coffee'), '₹120'],
    ];
    return (
        <div className="relative mx-auto w-full max-w-[340px]" aria-hidden="true">
            <div className="absolute -inset-6 bg-linear-to-br from-[#FE8301]/25 to-amber-300/20 blur-3xl rounded-full" />
            <div className="relative rounded-[36px] bg-[#101828] p-3 shadow-2xl">
                <div className="rounded-[28px] bg-white overflow-hidden">
                    <div className="px-5 pt-5 pb-4 bg-linear-to-br from-[#FE8301] to-[#FF6B00] text-white">
                        <p className="text-[11px] font-semibold opacity-85">{t('platform.hero.mock_table', 'Table 7 · Dine-in')}</p>
                        <p className="text-[18px] font-extrabold mt-0.5">{t('platform.hero.mock_title', 'Your order')}</p>
                    </div>
                    <ul className="px-5 py-3 divide-y divide-[#F2F4F7]">
                        {rows.map(([name, price]) => (
                            <li key={name} className="flex items-center justify-between py-2.5 text-[13px]">
                                <span className="flex items-center gap-2 text-[#344054] font-semibold">
                                    <span className="w-3 h-3 rounded-[3px] border-2 border-green-600 flex items-center justify-center">
                                        <span className="w-1 h-1 rounded-full bg-green-600" />
                                    </span>
                                    {name}
                                </span>
                                <span className="text-[#101828] font-bold">{price}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="px-5 pb-5">
                        <div className="rounded-xl bg-[#FFF3E6] px-3.5 py-2.5 flex items-center gap-2 text-[12px] font-semibold text-[#B54708]">
                            <ChefHat size={14} /> {t('platform.hero.mock_status', 'Sent to kitchen — preparing')}
                        </div>
                        <div className="mt-3 rounded-xl bg-[#FE8301] text-white text-center py-2.5 text-[13px] font-bold">
                            {t('platform.hero.mock_pay', 'Pay ₹560')}
                        </div>
                    </div>
                </div>
            </div>
            <div className="absolute -left-4 sm:-left-10 top-24 bg-white rounded-2xl shadow-xl px-3.5 py-3 flex items-center gap-2.5 border border-[#F2F4F7]">
                <span className="w-9 h-9 rounded-xl bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center"><QrCode size={18} /></span>
                <span className="text-[12px] font-bold text-[#101828] leading-tight">{t('platform.hero.mock_scan', 'Scan.')}<br />{t('platform.hero.mock_order', 'Order. Pay.')}</span>
            </div>
        </div>
    );
}

// ── Find a restaurant ─────────────────────────────────────────────────────
function RestaurantSearch() {
    const { t } = useTranslation();
    const inputId = useId();
    const [q, setQ] = useState('');
    const debounced = useDebouncedValue(q.trim(), 350);
    const enabled = debounced.length >= 2;

    const { data: results = [], isFetching, isError } = useQuery({
        queryKey: ['public', 'restaurant-search', debounced],
        queryFn: async ({ signal }) => {
            const res = await publicAPI.searchRestaurants(debounced, 8, { signal });
            const body = res.data;
            return Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);
        },
        enabled,
        staleTime: 60 * 1000,
    });

    const showPanel = q.trim().length >= 2;
    const pending = showPanel && (debounced !== q.trim() || isFetching);

    return (
        <div className="w-full max-w-xl">
            <label htmlFor={inputId} className="block text-[13px] font-bold text-[#344054] mb-2">
                {t('platform.search.label', 'Hungry? Find a restaurant on BestoDine')}
            </label>
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#98A2B3]" aria-hidden="true" />
                <input
                    id={inputId}
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('platform.search.placeholder', 'Search by restaurant name or city')}
                    autoComplete="off"
                    className="w-full pl-12 pr-11 py-3.5 rounded-2xl border border-[#EAECF0] bg-white text-[15px] text-[#101828] placeholder:text-[#98A2B3] shadow-[0_4px_16px_rgba(16,24,40,0.06)] focus:outline-none focus:ring-2 focus:ring-[#FE8301]/30 focus:border-[#FE8301]"
                    aria-describedby={`${inputId}-status`}
                />
                {pending && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#FE8301] animate-spin" aria-hidden="true" />}
            </div>
            <div id={`${inputId}-status`} aria-live="polite" className="sr-only">
                {showPanel && !pending ? t('platform.search.count', '{{n}} restaurants found', { n: results.length }) : ''}
            </div>
            {showPanel && (
                <div className="mt-2 rounded-2xl border border-[#EAECF0] bg-white shadow-lg overflow-hidden">
                    {isError ? (
                        <p className="px-4 py-4 text-[14px] text-[#B42318]">{t('platform.search.error', "Couldn't search right now — please try again.")}</p>
                    ) : pending && results.length === 0 ? (
                        <p className="px-4 py-4 text-[14px] text-[#667085]">{t('platform.search.searching', 'Searching…')}</p>
                    ) : results.length === 0 ? (
                        <p className="px-4 py-4 text-[14px] text-[#667085]">
                            {t('platform.search.empty', 'No restaurants match "{{q}}".', { q: q.trim() })}
                        </p>
                    ) : (
                        <ul className="divide-y divide-[#F2F4F7] max-h-80 overflow-y-auto">
                            {results.filter(r => r?.slug).map((r) => {
                                const logo = resolveImageUrl(r.logo);
                                return (
                                    <li key={r.slug}>
                                        <Link to={`/${encodeURIComponent(r.slug)}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[#FFF8F0] transition-colors">
                                            <span className="w-10 h-10 rounded-xl bg-[#F2F4F7] overflow-hidden flex items-center justify-center shrink-0">
                                                {logo ? <img src={logo} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Store size={18} className="text-[#98A2B3]" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[14px] font-bold text-[#101828] truncate">{r.name}</span>
                                                {r.city && (
                                                    <span className="flex items-center gap-1 text-[12px] text-[#667085]">
                                                        <MapPin size={11} /> {r.city}
                                                    </span>
                                                )}
                                            </span>
                                            <ArrowRight size={16} className="text-[#98A2B3] shrink-0" />
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Pricing ───────────────────────────────────────────────────────────────
function Pricing() {
    const { t } = useTranslation();
    const { data: plans = [], isLoading, isError } = usePublicPlans();

    if (isLoading) {
        return (
            <div className="grid gap-5 md:grid-cols-3">
                {[0, 1, 2].map(i => (
                    <div key={i} className="rounded-3xl border border-[#EAECF0] bg-white p-6 animate-pulse">
                        <div className="h-4 w-24 bg-[#F2F4F7] rounded" />
                        <div className="h-8 w-32 bg-[#F2F4F7] rounded mt-4" />
                        <div className="space-y-2 mt-6">
                            {[0, 1, 2, 3].map(j => <div key={j} className="h-3 bg-[#F2F4F7] rounded" />)}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (isError || plans.length === 0) {
        return (
            <div className="max-w-xl mx-auto rounded-3xl border border-[#EAECF0] bg-white p-8 text-center shadow-sm">
                <p className="text-[20px] font-extrabold text-[#101828]">{t('platform.pricing.contact_title', 'Contact us for pricing')}</p>
                <p className="mt-2 text-[15px] text-[#475467]">
                    {t('platform.pricing.contact_body', "Tell us about your restaurant and we'll recommend the right plan.")}
                </p>
                <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                    <Link to="/request-demo" className={primaryBtn}>{t('platform.cta.demo', 'Request a demo')}</Link>
                    <Link to="/register-restaurant" className={secondaryBtn}>{t('platform.cta.register', 'Register your hotel')}</Link>
                </div>
            </div>
        );
    }

    const cols = plans.length >= 3 ? 'md:grid-cols-2 lg:grid-cols-3' : plans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'max-w-md mx-auto';
    return (
        <div className={`grid gap-5 ${cols}`}>
            {plans.map((plan) => {
                const { amount, per } = formatPlanPrice(plan);
                const highlights = planHighlights(plan);
                const trial = Number(plan.trialDays) || 0;
                const popular = Boolean(plan.highlight);
                return (
                    <Motion.div
                        key={plan._id || plan.name}
                        {...fadeUp}
                        className={`relative rounded-3xl border bg-white p-6 flex flex-col ${
                            popular
                                ? 'border-[#FE8301] ring-1 ring-[#FE8301] shadow-[0_12px_32px_rgba(254,131,1,0.16)]'
                                : 'border-[#EAECF0] shadow-[0_4px_20px_rgba(16,24,40,0.05)]'
                        }`}
                    >
                        {popular && (
                            <span className="absolute -top-3 left-6 text-[11px] font-bold uppercase tracking-wide text-white bg-[#FE8301] px-3 py-1 rounded-full shadow">
                                {t('platform.pricing.popular', 'Most popular')}
                            </span>
                        )}
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-[18px] font-extrabold text-[#101828] capitalize">{plan.name}</h3>
                            {trial > 0 && (
                                <span className="text-[11px] font-bold uppercase tracking-wide text-[#067647] bg-[#ECFDF3] px-2.5 py-1 rounded-full">
                                    {t('platform.pricing.trial', '{{days}}-day free trial', { days: trial })}
                                </span>
                            )}
                        </div>
                        {plan.description && <p className="mt-1.5 text-[13px] text-[#667085]">{plan.description}</p>}
                        <p className="mt-4 flex items-baseline gap-1.5">
                            <span className="text-[34px] font-extrabold tracking-tight text-[#101828]">{amount}</span>
                            {per && <span className="text-[14px] font-semibold text-[#667085]">{per}</span>}
                        </p>
                        {highlights.length > 0 && (
                            <ul className="mt-5 space-y-2.5 flex-1">
                                {highlights.map(h => (
                                    <li key={h} className="flex items-start gap-2 text-[14px] text-[#344054]">
                                        <CheckCircle2 size={16} className="text-[#FE8301] shrink-0 mt-0.5" /> {h}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Link
                            to={plan._id ? `/register-restaurant?plan=${encodeURIComponent(plan._id)}` : '/register-restaurant'}
                            className={`${primaryBtn} mt-6 w-full`}
                        >
                            {t('platform.pricing.choose', 'Start with {{name}}', { name: plan.name })}
                        </Link>
                    </Motion.div>
                );
            })}
        </div>
    );
}

// ── FAQ accordion ─────────────────────────────────────────────────────────
function Faq({ items }) {
    const [open, setOpen] = useState(0);
    const baseId = useId();
    return (
        <div className="max-w-3xl mx-auto divide-y divide-[#EAECF0] rounded-3xl border border-[#EAECF0] bg-white overflow-hidden">
            {items.map(([q, a], i) => {
                const expanded = open === i;
                const panelId = `${baseId}-panel-${i}`;
                const btnId = `${baseId}-btn-${i}`;
                return (
                    <div key={q}>
                        <h3>
                            <button
                                id={btnId}
                                type="button"
                                onClick={() => setOpen(expanded ? -1 : i)}
                                aria-expanded={expanded}
                                aria-controls={panelId}
                                className="w-full flex items-center justify-between gap-4 text-left px-5 sm:px-6 py-4 text-[15px] font-bold text-[#101828] hover:bg-[#F9FAFB]"
                            >
                                {q}
                                <ChevronDown size={18} className={`shrink-0 text-[#667085] transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                        </h3>
                        <div id={panelId} role="region" aria-labelledby={btnId} hidden={!expanded} className="px-5 sm:px-6 pb-5 -mt-1 text-[14px] leading-relaxed text-[#475467]">
                            {a}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

const PlatformHome = () => {
    const { t } = useTranslation();
    const { isLoggedIn, user, isLoading } = useAuth();
    usePageMeta(PLATFORM_TITLE, PLATFORM_DESCRIPTION);

    // Signed-in staff (waiter / chef / admin / superadmin) visiting `/` go
    // straight to their workspace, as before. Customers and visitors see
    // the platform page.
    const staffRedirect = !isLoading && isLoggedIn ? staffHomePath(user) : null;
    if (staffRedirect) return <Navigate to={staffRedirect} replace />;

    const exampleHost = `${getPublicAppOrigin().replace(/^https?:\/\//, '')}/your-restaurant`;

    const features = [
        [QrCode, t('platform.features.qr_title', 'QR table ordering'), t('platform.features.qr_body', 'Guests scan the QR on their table, browse your menu and order from their phone — no app to install. Orders land with the right table automatically.')],
        [ChefHat, t('platform.features.kds_title', 'Kitchen display for chefs'), t('platform.features.kds_body', 'A live kitchen screen shows every ticket as it arrives, with status updates back to the floor, recipes and stock at hand.')],
        [Users, t('platform.features.waiter_title', 'Waiter & captain apps'), t('platform.features.waiter_body', 'Waiters take orders, answer table requests and collect bills; captains get a floor overview to assign tables and spot delayed orders.')],
        [CalendarDays, t('platform.features.booking_title', 'Table & hall bookings'), t('platform.features.booking_body', 'Accept advance table reservations and hall/event bookings with packages, decoration, cake and parking add-ons.')],
        [Wallet, t('platform.features.wallet_title', 'Wallet, loyalty & offers'), t('platform.features.wallet_body', 'Customer wallets, loyalty points, coupons and promotions that bring guests back.')],
        [CreditCard, t('platform.features.payments_title', 'Razorpay payments'), t('platform.features.payments_body', 'Take UPI, card and net-banking payments online through Razorpay, alongside cash at the counter — with refunds tracked in one place.')],
        [Building2, t('platform.features.branch_title', 'Multi-branch'), t('platform.features.branch_body', 'Run several locations from one account, each with its own tables, menu items, staff and QR codes.')],
        [Boxes, t('platform.features.inventory_title', 'Inventory & CRM'), t('platform.features.inventory_body', 'Track stock and recipes, see which dishes are affected by low stock, and keep a customer list for repeat business.')],
        [BarChart3, t('platform.features.analytics_title', 'Analytics & reports'), t('platform.features.analytics_body', 'Dashboards for sales, orders, payments and staff performance, with exports for your accountant.')],
        [MonitorSmartphone, t('platform.features.kiosk_title', 'Self-order kiosk'), t('platform.features.kiosk_body', 'Put a tablet at the counter and let walk-in guests order and pay by themselves.')],
        [Globe, t('platform.features.page_title', 'Your own restaurant page'), t('platform.features.page_body', 'Every restaurant gets a shareable page with its menu, hours, takeaway and booking — at {{host}}.', { host: exampleHost })],
        [Languages, t('platform.features.lang_title', 'Speaks your guests’ language'), t('platform.features.lang_body', 'The customer app is available in English, Hindi and Marathi.')],
    ];

    const steps = [
        [ClipboardEdit, t('platform.how.s1_title', 'Register your hotel'), t('platform.how.s1_body', 'Tell us your hotel name, city and pick your web address. Takes about two minutes.')],
        [BadgeCheck, t('platform.how.s2_title', 'Get approved'), t('platform.how.s2_body', 'Our team reviews every signup — usually within one business day — and emails you when you’re live.')],
        [UtensilsCrossed, t('platform.how.s3_title', 'Set up menu & tables'), t('platform.how.s3_body', 'Sign in to the admin panel, add your menu, tables and staff accounts.')],
        [Printer, t('platform.how.s4_title', 'Print QR codes'), t('platform.how.s4_body', 'Download a QR code for each table, stick them up, and start taking orders.')],
    ];

    const faqs = [
        [t('platform.faq.q1', 'Do my guests need to install an app?'), t('platform.faq.a1', 'No. Guests scan the QR code on their table and order in their phone’s browser. Your staff use BestoDine in the browser too — on a phone, tablet or computer.')],
        [t('platform.faq.q2', 'How long does approval take?'), t('platform.faq.a2', 'We review new registrations within about one business day. You’ll get an email as soon as your account is approved, and you can then sign in from the staff login page.')],
        [t('platform.faq.q3', 'Is there a free trial?'), t('platform.faq.a3', 'Plans that include a trial show the number of free days on their pricing card. If you’re unsure which plan fits, request a demo and we’ll help you choose.')],
        [t('platform.faq.q4', 'Can I accept online payments?'), t('platform.faq.a4', 'Yes. BestoDine integrates with Razorpay for UPI, cards and net-banking, and your waiters can still settle cash bills at the table or counter.')],
        [t('platform.faq.q5', 'I have more than one outlet. Is that supported?'), t('platform.faq.a5', 'Yes — plans with multi-branch support let you manage several locations from one account, each with its own tables, staff and QR codes.')],
        [t('platform.faq.q6', 'What is my restaurant’s web address?'), t('platform.faq.a6', 'You choose it during registration, for example {{host}}. It becomes your public page with your menu, takeaway and booking options.', { host: exampleHost })],
    ];

    return (
        <div className="min-h-screen bg-[#FCFCFD] text-[#101828]">
            <PlatformHeader onHome />

            <main>
                {/* ── Hero ───────────────────────────────────────────────── */}
                <section id="top" className="relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_70%_60%_at_70%_0%,#FFE7CC_0%,transparent_70%)] pointer-events-none" />
                    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-14 sm:pb-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
                        <Motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF3E6] text-[#B54708] px-3 py-1.5 text-[12px] font-bold">
                                <Sparkles size={13} /> {t('platform.hero.badge', 'Restaurant management & QR ordering')}
                            </span>
                            <h1 className="mt-4 text-[34px] sm:text-[48px] lg:text-[54px] leading-[1.08] font-extrabold tracking-tight">
                                {t('platform.hero.title_a', 'Run your whole restaurant')}{' '}
                                <span className="text-[#FE8301]">{t('platform.hero.title_b', 'from one place.')}</span>
                            </h1>
                            <p className="mt-5 text-[16px] sm:text-[18px] text-[#475467] leading-relaxed max-w-xl">
                                {t('platform.hero.subtitle', 'QR ordering at the table, a live kitchen display, waiter and captain apps, table and hall bookings, and online payments — all connected, all in real time.')}
                            </p>
                            <div className="mt-7 flex flex-col sm:flex-row gap-3">
                                <Link to="/register-restaurant" className={primaryBtn}>
                                    {t('platform.cta.register', 'Register your hotel')} <ArrowRight size={18} />
                                </Link>
                                <Link to="/request-demo" className={secondaryBtn}>{t('platform.cta.demo', 'Request a demo')}</Link>
                            </div>
                            <div className="mt-10">
                                <RestaurantSearch />
                            </div>
                        </Motion.div>
                        <Motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }}>
                            <HeroVisual />
                        </Motion.div>
                    </div>
                </section>

                {/* ── Features ───────────────────────────────────────────── */}
                <section id="features" className="scroll-mt-20 py-16 sm:py-20 bg-white border-y border-[#F2F4F7]">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6">
                        <SectionHeading
                            eyebrow={t('platform.features.eyebrow', 'Features')}
                            title={t('platform.features.title', 'Everything your restaurant runs on')}
                            subtitle={t('platform.features.subtitle', 'From the guest’s first scan to the end-of-day report, every part of service stays in sync.')}
                        />
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {features.map((feature) => { const [Icon, title, body] = feature; return (
                                <Motion.div key={title} {...fadeUp} className="rounded-2xl border border-[#EAECF0] bg-[#FCFCFD] p-5 hover:border-[#FED7AA] hover:shadow-[0_8px_24px_rgba(254,131,1,0.08)] transition">
                                    <span className="w-11 h-11 rounded-xl bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center">
                                        <Icon size={20} />
                                    </span>
                                    <h3 className="mt-4 text-[16px] font-extrabold text-[#101828]">{title}</h3>
                                    <p className="mt-1.5 text-[14px] text-[#475467] leading-relaxed">{body}</p>
                                </Motion.div>
                            ); })}
                        </div>
                    </div>
                </section>

                {/* ── How it works ───────────────────────────────────────── */}
                <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-20">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6">
                        <SectionHeading
                            eyebrow={t('platform.how.eyebrow', 'How it works')}
                            title={t('platform.how.title', 'Live in four steps')}
                        />
                        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {steps.map((stepItem, i) => { const [Icon, title, body] = stepItem; return (
                                <Motion.li key={title} {...fadeUp} className="relative rounded-2xl bg-white border border-[#EAECF0] p-5">
                                    <span className="absolute top-4 right-5 text-[40px] font-extrabold text-[#F2F4F7] leading-none select-none" aria-hidden="true">{i + 1}</span>
                                    <span className="relative w-11 h-11 rounded-xl bg-[#101828] text-white flex items-center justify-center">
                                        <Icon size={20} />
                                    </span>
                                    <h3 className="relative mt-4 text-[16px] font-extrabold">
                                        <span className="sr-only">{t('platform.how.step', 'Step {{n}}:', { n: i + 1 })} </span>{title}
                                    </h3>
                                    <p className="relative mt-1.5 text-[14px] text-[#475467] leading-relaxed">{body}</p>
                                </Motion.li>
                            ); })}
                        </ol>
                    </div>
                </section>

                {/* ── Pricing ────────────────────────────────────────────── */}
                <section id="pricing" className="scroll-mt-20 py-16 sm:py-20 bg-white border-y border-[#F2F4F7]">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6">
                        <SectionHeading
                            eyebrow={t('platform.pricing.eyebrow', 'Pricing')}
                            title={t('platform.pricing.title', 'Simple plans that grow with you')}
                            subtitle={t('platform.pricing.subtitle', 'Pick a plan when you register — you can change it later from your admin panel.')}
                        />
                        <Pricing />
                    </div>
                </section>

                {/* ── FAQ ────────────────────────────────────────────────── */}
                <section id="faq" className="scroll-mt-20 py-16 sm:py-20">
                    <div className="max-w-6xl mx-auto px-4 sm:px-6">
                        <SectionHeading eyebrow={t('platform.faq.eyebrow', 'FAQ')} title={t('platform.faq.title', 'Questions, answered')} />
                        <Faq items={faqs} />
                    </div>
                </section>

                {/* ── Final CTA ──────────────────────────────────────────── */}
                <section className="px-4 sm:px-6 pb-16 sm:pb-20">
                    <div className="max-w-6xl mx-auto rounded-3xl bg-linear-to-br from-[#FE8301] to-[#FF6B00] text-white px-6 py-12 sm:px-12 text-center relative overflow-hidden">
                        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                        <h2 className="relative text-[26px] sm:text-[34px] font-extrabold tracking-tight">
                            {t('platform.final.title', 'Ready to take orders the modern way?')}
                        </h2>
                        <p className="relative mt-3 text-[15px] sm:text-[17px] text-white/90 max-w-xl mx-auto">
                            {t('platform.final.body', 'Register your hotel today — we’ll review it within a business day and help you get set up.')}
                        </p>
                        <div className="relative mt-7 flex flex-col sm:flex-row gap-3 justify-center">
                            <Link to="/register-restaurant" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[15px] font-bold text-[#B54708] bg-white hover:bg-[#FFF8F0] transition-colors">
                                {t('platform.cta.register', 'Register your hotel')} <ArrowRight size={18} />
                            </Link>
                            <Link to="/request-demo" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[15px] font-bold text-white border border-white/50 hover:bg-white/10 transition-colors">
                                {t('platform.cta.demo', 'Request a demo')}
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            <PlatformFooter />
        </div>
    );
};

export default PlatformHome;
