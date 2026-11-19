import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu as MenuIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BestoDineMark from '../../../assets/BestoDineMark';
import AuthContext from '../../../Context/AuthContext';
import { staffHomePath } from '../../../utils/roleRouting';
import DesktopDownloadLink from '../../../Components/Common/DesktopDownloadLink';

/** Height (px) of the sticky platform header; pages pad / scroll-margin by this. */
export const PLATFORM_HEADER_HEIGHT = 64;

/**
 * Brand lockup — mark + wordmark. Links to the signed-in user's own
 * workspace (staffHomePath) when there is one, else the platform home.
 * Reads the context directly (not useAuth) so the chrome also renders
 * outside an AuthProvider, e.g. in isolated page tests.
 */
export function PlatformBrand({ className = '' }) {
    const auth = useContext(AuthContext);
    const home = (auth?.isLoggedIn && auth.user && staffHomePath(auth.user)) || '/';
    return (
        <Link to={home} className={`inline-flex items-center gap-2.5 shrink-0 ${className}`} aria-label="BestoDine home">
            <span className="w-9 h-9 rounded-xl bg-[#FE8301] flex items-center justify-center">
                <BestoDineMark className="w-5 h-5 text-white" title="" />
            </span>
            <span className="text-[18px] font-extrabold tracking-tight text-[#101828]">BestoDine</span>
        </Link>
    );
}

function useAnchors(t) {
    return [
        ['features', t('platform.nav.features', 'Features')],
        ['how-it-works', t('platform.nav.how', 'How it works')],
        ['pricing', t('platform.nav.pricing', 'Pricing')],
        ['faq', t('platform.nav.faq', 'FAQ')],
    ];
}

function useEscape(enabled, onEscape) {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onEscape(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled, onEscape]);
}

/**
 * Platform header: one light sticky bar for every platform page. Brand left,
 * section anchors centre, "Staff login" text link + one orange "Start free
 * trial" button right. On the home page (`onHome`) the anchors are in-page
 * (`#section`); elsewhere they point back at `/#section`. The mobile menu is
 * a simple dropdown that pushes the page down. `slot` (optional ReactNode,
 * the home page's scroll-driven clock) renders right after the brand in the
 * desktop bar and above the anchors in the mobile menu.
 */
export function PlatformHeader({ onHome = false, slot = null }) {
    const { t } = useTranslation();
    const anchors = useAnchors(t);
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(() => (typeof window !== 'undefined' ? window.scrollY > 8 : false));

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onScroll = () => setScrolled(window.scrollY > 8);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);
    useEscape(open, () => setOpen(false));

    const hrefFor = (id) => (onHome ? `#${id}` : `/#${id}`);
    const close = () => setOpen(false);

    return (
        <header
            className={`sticky top-0 z-40 h-16 transition-[background-color,box-shadow] duration-200 ${
                scrolled || open ? 'bg-white/90 backdrop-blur-md shadow-[0_1px_0_#EAECF0]' : 'bg-[#FCFCFD]'
            }`}
            data-variant="light"
        >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                <PlatformBrand />
                {slot}
                <nav className="hidden md:flex items-center gap-7 text-[14px] font-semibold text-[#475467]" aria-label={t('platform.nav.label', 'Main')}>
                    {anchors.map(([id, label]) => (
                        <a key={id} href={hrefFor(id)} className="hover:text-[#101828] transition-colors">{label}</a>
                    ))}
                </nav>
                <div className="hidden md:flex items-center gap-5">
                    <DesktopDownloadLink className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#475467] hover:text-[#FE8301] transition-colors">
                        {t('platform.cta.download_short', 'Desktop app')}
                    </DesktopDownloadLink>
                    <Link to="/staff-login" className="text-[14px] font-semibold text-[#101828] hover:text-[#FE8301] transition-colors">
                        {t('platform.nav.staff_login', 'Staff login')}
                    </Link>
                    <Link
                        to="/start-trial"
                        className="px-4 py-2 rounded-xl text-[14px] font-semibold text-white bg-[#FE8301] hover:bg-[#E57501] transition-colors"
                    >
                        {t('platform.cta.trial_short', 'Start free trial')}
                    </Link>
                </div>
                <button
                    type="button"
                    className="md:hidden w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-[#101828] hover:bg-[#F2F4F7]"
                    onClick={() => setOpen((v) => !v)}
                    aria-expanded={open}
                    aria-controls="platform-mobile-nav"
                    aria-label={open ? t('platform.nav.close', 'Close menu') : t('platform.nav.open', 'Open menu')}
                >
                    {open ? <X size={22} /> : <MenuIcon size={22} />}
                </button>
            </div>
            {open && (
                <div id="platform-mobile-nav" className="md:hidden border-t border-[#EAECF0] bg-white px-4 pb-4">
                    {slot && <div className="pt-3">{slot}</div>}
                    <nav className="flex flex-col py-2" aria-label={t('platform.nav.label', 'Main')}>
                        {anchors.map(([id, label]) => (
                            <a
                                key={id}
                                href={hrefFor(id)}
                                onClick={close}
                                className="py-3 text-[15px] font-semibold text-[#101828] border-b border-[#F2F4F7]"
                            >
                                {label}
                            </a>
                        ))}
                    </nav>
                    <DesktopDownloadLink className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-[#EAECF0] py-3 text-[14px] font-semibold text-[#101828]">
                        {t('platform.cta.download', 'Download desktop app')}
                    </DesktopDownloadLink>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <Link to="/staff-login" onClick={close} className="text-center py-3 rounded-xl text-[14px] font-semibold text-[#101828] border border-[#EAECF0]">
                            {t('platform.nav.staff_login', 'Staff login')}
                        </Link>
                        <Link to="/start-trial" onClick={close} className="text-center py-3 rounded-xl text-[14px] font-semibold text-white bg-[#FE8301]">
                            {t('platform.cta.trial_short', 'Start free trial')}
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}

/**
 * Footer: light, three columns at most — brand + tagline, Product anchors,
 * and Get started + Legal links together — then the © line and the
 * "made for" line.
 */
export function PlatformFooter() {
    const { t } = useTranslation();
    const linkCls = 'text-[14px] text-[#475467] hover:text-[#101828] transition-colors';
    const headCls = 'text-[13px] font-semibold text-[#101828] mb-4';
    const colCls = 'flex flex-col gap-2.5';

    return (
        <footer className="bg-[#F9FAFB] text-[#101828] border-t border-[#EAECF0]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
                <div className="max-w-sm sm:col-span-2 lg:col-span-1">
                    <PlatformBrand />
                    <p className="mt-4 text-[14px] text-[#475467] leading-relaxed">
                        {t('platform.footer.tagline', 'Restaurant management and QR ordering for hotels, restaurants and cafés.')}
                    </p>
                </div>

                <nav className={colCls} aria-label={t('platform.footer.product', 'Product')}>
                    <h3 className={headCls}>{t('platform.footer.product', 'Product')}</h3>
                    <a href="/#features" className={linkCls}>{t('platform.nav.features', 'Features')}</a>
                    <a href="/#pricing" className={linkCls}>{t('platform.nav.pricing', 'Pricing')}</a>
                    <a href="/#how-it-works" className={linkCls}>{t('platform.nav.how', 'How it works')}</a>
                    <a href="/#faq" className={linkCls}>{t('platform.nav.faq', 'FAQ')}</a>
                </nav>

                <div className="flex flex-col gap-8">
                    <nav className={colCls} aria-label={t('platform.footer.get_started', 'Get started')}>
                        <h3 className={headCls}>{t('platform.footer.get_started', 'Get started')}</h3>
                        <Link to="/start-trial" className={linkCls}>{t('platform.cta.trial', 'Start 14-day free trial')}</Link>
                        <Link to="/register-restaurant" className={linkCls}>{t('platform.cta.register', 'Register your hotel')}</Link>
                        <Link to="/request-demo" className={linkCls}>{t('platform.cta.demo', 'Request a demo')}</Link>
                        <DesktopDownloadLink icon={false} className={linkCls}>{t('platform.cta.download', 'Download desktop app')}</DesktopDownloadLink>
                        <Link to="/staff-login" className={linkCls}>{t('platform.nav.staff_login', 'Staff login')}</Link>
                    </nav>
                    <nav className={colCls} aria-label={t('platform.footer.legal', 'Legal')}>
                        <h3 className={headCls}>{t('platform.footer.legal', 'Legal')}</h3>
                        <Link to="/terms" className={linkCls}>{t('platform.footer.terms', 'Terms')}</Link>
                        <Link to="/privacy" className={linkCls}>{t('platform.footer.privacy', 'Privacy')}</Link>
                    </nav>
                </div>
            </div>

            <div className="border-t border-[#EAECF0]">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[12px] text-[#667085]">
                    <p>© {new Date().getFullYear()} BestoDine. {t('platform.footer.rights', 'All rights reserved.')}</p>
                    <p>{t('platform.footer.made_for', 'Made for restaurants in India')}</p>
                </div>
            </div>
        </footer>
    );
}
