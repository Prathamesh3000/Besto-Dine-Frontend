import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu as MenuIcon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import BestoDineMark from '../../../assets/BestoDineMark';

/** Brand lockup — mark + wordmark, links to the platform home. */
export function PlatformBrand({ className = '' }) {
    return (
        <Link to="/" className={`inline-flex items-center gap-2.5 shrink-0 ${className}`} aria-label="BestoDine home">
            <span className="w-9 h-9 rounded-xl bg-linear-to-br from-[#FE8301] to-[#FF6B00] flex items-center justify-center shadow-[0_4px_14px_rgba(254,131,1,0.3)]">
                <BestoDineMark className="w-5 h-5 text-white" title="" />
            </span>
            <span className="text-[18px] font-extrabold tracking-tight text-[#1A181B]">BestoDine</span>
        </Link>
    );
}

/**
 * Sticky platform header. `anchors` are in-page section links (home page
 * only); on other platform pages they point back at `/#section`.
 */
export function PlatformHeader({ onHome = false }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(() => window.scrollY > 8);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const anchors = [
        ['features', t('platform.nav.features', 'Features')],
        ['how-it-works', t('platform.nav.how', 'How it works')],
        ['pricing', t('platform.nav.pricing', 'Pricing')],
        ['faq', t('platform.nav.faq', 'FAQ')],
    ];
    const hrefFor = (id) => (onHome ? `#${id}` : `/#${id}`);

    return (
        <header
            className={`sticky top-0 z-40 transition-all ${
                scrolled || open ? 'bg-white/90 backdrop-blur-md shadow-[0_1px_0_rgba(16,24,40,0.06)]' : 'bg-transparent'
            }`}
        >
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                <PlatformBrand />
                <nav className="hidden md:flex items-center gap-6 text-[14px] font-semibold text-[#475467]" aria-label={t('platform.nav.label', 'Main')}>
                    {anchors.map(([id, label]) => (
                        <a key={id} href={hrefFor(id)} className="hover:text-[#FE8301] transition-colors">{label}</a>
                    ))}
                </nav>
                <div className="hidden md:flex items-center gap-2">
                    <Link to="/staff-login" className="px-3.5 py-2 rounded-xl text-[14px] font-semibold text-[#1A181B] hover:bg-[#F2F4F7] transition-colors">
                        {t('platform.nav.staff_login', 'Staff login')}
                    </Link>
                    <Link
                        to="/register-restaurant"
                        className="px-4 py-2 rounded-xl text-[14px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] shadow-[0_4px_14px_rgba(254,131,1,0.3)] transition-colors"
                    >
                        {t('platform.cta.register', 'Register your hotel')}
                    </Link>
                </div>
                <button
                    type="button"
                    className="md:hidden w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-[#1A181B] hover:bg-[#F2F4F7]"
                    onClick={() => setOpen(v => !v)}
                    aria-expanded={open}
                    aria-controls="platform-mobile-nav"
                    aria-label={open ? t('platform.nav.close', 'Close menu') : t('platform.nav.open', 'Open menu')}
                >
                    {open ? <X size={22} /> : <MenuIcon size={22} />}
                </button>
            </div>
            {open && (
                <div id="platform-mobile-nav" className="md:hidden border-t border-[#EAECF0] bg-white px-4 pb-4">
                    <nav className="flex flex-col py-2" aria-label={t('platform.nav.label', 'Main')}>
                        {anchors.map(([id, label]) => (
                            <a
                                key={id}
                                href={hrefFor(id)}
                                onClick={() => setOpen(false)}
                                className="py-3 text-[15px] font-semibold text-[#344054] border-b border-[#F2F4F7]"
                            >
                                {label}
                            </a>
                        ))}
                    </nav>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <Link to="/staff-login" className="text-center py-3 rounded-xl text-[14px] font-semibold text-[#1A181B] border border-[#EAECF0]">
                            {t('platform.nav.staff_login', 'Staff login')}
                        </Link>
                        <Link to="/register-restaurant" className="text-center py-3 rounded-xl text-[14px] font-bold text-white bg-[#FE8301]">
                            {t('platform.cta.register_short', 'Register')}
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}

export function PlatformFooter() {
    const { t } = useTranslation();
    const linkCls = 'text-[14px] text-[#D0D5DD] hover:text-white transition-colors';
    return (
        <footer className="bg-[#101828] text-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row md:items-start md:justify-between gap-8">
                <div className="max-w-sm">
                    <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-[#FE8301] flex items-center justify-center">
                            <BestoDineMark className="w-5 h-5 text-white" title="" />
                        </span>
                        <span className="text-[18px] font-extrabold tracking-tight">BestoDine</span>
                    </div>
                    <p className="mt-3 text-[13px] text-[#98A2B3] leading-relaxed">
                        {t('platform.footer.tagline', 'Restaurant management and QR ordering for hotels, restaurants and cafés.')}
                    </p>
                </div>
                <nav className="grid grid-cols-2 gap-x-10 gap-y-3" aria-label={t('platform.footer.label', 'Footer')}>
                    <Link to="/register-restaurant" className={linkCls}>{t('platform.cta.register', 'Register your hotel')}</Link>
                    <Link to="/request-demo" className={linkCls}>{t('platform.cta.demo', 'Request a demo')}</Link>
                    <Link to="/staff-login" className={linkCls}>{t('platform.nav.staff_login', 'Staff login')}</Link>
                    <Link to="/terms" className={linkCls}>{t('platform.footer.terms', 'Terms')}</Link>
                    <Link to="/privacy" className={linkCls}>{t('platform.footer.privacy', 'Privacy')}</Link>
                </nav>
            </div>
            <div className="border-t border-white/10">
                <p className="max-w-6xl mx-auto px-4 sm:px-6 py-5 text-[12px] text-[#98A2B3]">
                    © {new Date().getFullYear()} BestoDine. {t('platform.footer.rights', 'All rights reserved.')}
                </p>
            </div>
        </footer>
    );
}
