import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Clock, Info, MapPin, Store, Sparkles, Images, Share2, Building2, RefreshCw, Phone, Mail, UtensilsCrossed } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { publicAPI } from '../../utils/api';
import { isReservedSlug } from '../../utils/reservedSlugs';
import { getPublicAppOrigin } from '../../utils/customerLinks';
import { enterRestaurant, resolveBranchChoice, landingActionTarget } from '../../utils/enterRestaurant';
import { resolveImageUrl, sizedImage } from '../../utils/image';
import { useAuth } from '../../Context/AuthContext';
import { Skeleton } from '../../Components/Common/Skeleton';
import CoverCarousel from './components/CoverCarousel';
import LandingActions from './components/LandingActions';
import LandingSection from './components/LandingSection';
import FeaturedDishes from './components/FeaturedDishes';
import HoursCard from './components/HoursCard';
import LocationCard from './components/LocationCard';
import BranchLinks from './components/BranchLinks';
import SocialLinks from './components/SocialLinks';
import BranchPickerSheet from './components/BranchPickerSheet';
import { DEFAULT_ACCENT, normalizeAccent, readableOn, telHref } from './components/landingUtils';

/**
 * Public restaurant landing page — /:slug and /:slug/:branchSlug.
 *
 * "Showcase + actions": a branded hero (cover carousel, logo, tagline,
 * open-now pill) with the ways into the customer app — View Menu, Order
 * Takeaway, Book a Table — followed by the sections the restaurant
 * enabled in admin Settings → Landing Page (featured dishes, about,
 * hours, location, branches, gallery, social).
 *
 * The actions reuse the customer entry flow (utils/enterRestaurant.js,
 * shared with BranchSelection): persist the tenant (+ branch), wipe the
 * previous restaurant's session when switching, then hand off to the
 * same routes the tenant home page uses. A multi-branch restaurant
 * opened without a branch asks which branch first.
 */

const NOT_FOUND_CODES = new Set(['RESTAURANT_NOT_FOUND', 'RESTAURANT_UNAVAILABLE', 'BRANCH_NOT_FOUND']);

/** Set document.title + meta description while mounted; restore after. */
function useDocumentMeta(title, description) {
    useEffect(() => {
        if (!title) return undefined;
        const prevTitle = document.title;
        let meta = document.querySelector('meta[name="description"]');
        const created = !meta;
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'description');
            document.head.appendChild(meta);
        }
        const prevDescription = meta.getAttribute('content');
        document.title = title;
        if (description) meta.setAttribute('content', description);
        return () => {
            document.title = prevTitle;
            if (created) meta.remove();
            else if (prevDescription == null) meta.removeAttribute('content');
            else meta.setAttribute('content', prevDescription);
        };
    }, [title, description]);
}

const LandingSkeleton = () => (
    <div className="min-h-screen bg-[#FBFBFF]" aria-busy="true">
        <div className="max-w-3xl mx-auto">
            <Skeleton className="w-full aspect-[4/3] sm:aspect-[21/9] rounded-none" />
            <div className="-mt-10 relative bg-[#FBFBFF] rounded-t-[32px] px-5 pt-5 space-y-4">
                <div className="flex items-end gap-4 -mt-14">
                    <Skeleton className="w-20 h-20 rounded-2xl border-4 border-white" />
                </div>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-12 w-full rounded-2xl" />
                <div className="grid grid-cols-2 gap-2.5">
                    <Skeleton className="h-11 rounded-2xl" />
                    <Skeleton className="h-11 rounded-2xl" />
                </div>
                <div className="flex gap-3 pt-4 overflow-hidden">
                    {[0, 1, 2].map(i => <Skeleton key={i} className="h-52 w-[172px] shrink-0 rounded-2xl" />)}
                </div>
            </div>
        </div>
    </div>
);

const StatusScreen = ({ icon = Store, title, message, children }) => {
    const Icon = icon;
    return (
    <div className="min-h-screen bg-[#FBFBFF] flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center bg-white rounded-3xl border border-[#F2F4F7] shadow-sm p-8">
            <div className="w-16 h-16 rounded-2xl bg-[#FFF8F0] text-[#FE8301] flex items-center justify-center mx-auto mb-4">
                <Icon size={30} />
            </div>
            <h1 className="text-[20px] font-bold text-[#101828] font-nunito mb-2">{title}</h1>
            <p className="text-[14px] leading-[20px] text-[#667085] font-varela mb-6">{message}</p>
            <div className="flex flex-col gap-2.5">{children}</div>
        </div>
    </div>
    );
};

const primaryLinkCls = 'inline-flex items-center justify-center gap-2 bg-[#FE8301] text-white px-6 py-3 rounded-2xl font-semibold text-[14px] font-nunito active:scale-[0.97] transition-all';
const secondaryLinkCls = 'inline-flex items-center justify-center gap-2 border border-[#E4E7EC] text-[#344054] px-6 py-3 rounded-2xl font-semibold text-[14px] font-nunito';

const RestaurantLandingPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { isLoggedIn, isGuest, user } = useAuth();
    const params = useParams();
    const slug = String(params.slug || '').trim().toLowerCase();
    const branchSlug = params.branchSlug ? String(params.branchSlug).trim().toLowerCase() : null;
    const reserved = isReservedSlug(slug);

    const [busyAction, setBusyAction] = useState(null);
    // { action, opts, branches } while the branch picker is open
    const [picker, setPicker] = useState(null);

    const { data, error, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['public-landing', slug, branchSlug],
        queryFn: () => publicAPI.getLanding(slug, branchSlug, { _silent: true })
            .then(res => res.data?.data ?? res.data),
        enabled: !reserved && Boolean(slug),
        staleTime: 60 * 1000,
        // A 404 is an answer, not a blip — don't retry it.
        retry: (count, err) => err?.response?.status !== 404 && count < 1,
    });

    const restaurant = data?.restaurant;
    const landing = data?.landing || {};
    const pageTitle = restaurant?.name
        ? `${data?.branch?.name && data.branch.name !== restaurant.name ? `${restaurant.name} – ${data.branch.name}` : restaurant.name} | BestoDine`
        : '';
    useDocumentMeta(pageTitle, landing.tagline || (restaurant?.name ? t('restaurant_landing.meta_fallback', 'Menu, hours and location for {{name}}.', { name: restaurant.name }) : ''));

    // Enter the restaurant (+ branch) and hand off to the customer app.
    const go = useCallback((branch, action, opts) => {
        if (!data?.restaurant) return;
        enterRestaurant(
            { ...data.restaurant, features: data.features || {}, phone: data.contact?.phone || '' },
            branch,
        );
        const { to, state } = landingActionTarget(action, { isLoggedIn, isGuest, role: user?.role }, opts);
        navigate(to, state ? { state } : undefined);
    }, [data, isLoggedIn, isGuest, user?.role, navigate]);

    const handleAction = useCallback(async (action, opts = {}) => {
        if (!data?.restaurant || busyAction) return;
        // The URL named a branch (and the API resolved it) — no choice to make.
        if (data.branch?._id) { go(data.branch, action, opts); return; }
        setBusyAction(action);
        try {
            // Same rules as BranchSelection: 0–1 branches auto-select,
            // 2+ ask. The branch list carries the _ids the landing
            // payload's summary omits.
            const list = await queryClient.fetchQuery({
                queryKey: ['public-branches', data.restaurant.slug],
                queryFn: () => publicAPI.getRestaurantBranches(data.restaurant.slug).then(res => res.data?.data || []),
                staleTime: 60 * 1000,
            });
            const choice = resolveBranchChoice(list);
            if (choice.needsPick) setPicker({ action, opts, branches: list });
            else go(choice.branch, action, opts);
        } catch {
            // Branch list unavailable — enter tenant-wide, like BranchSelection.
            go(null, action, opts);
        } finally {
            setBusyAction(null);
        }
    }, [data, busyAction, queryClient, go]);

    const closePicker = useCallback(() => setPicker(null), []);

    const handleShare = async () => {
        // Public origin (VITE_PUBLIC_APP_URL) so a share from a localhost
        // or admin host still hands out a link other devices can open.
        const url = `${getPublicAppOrigin()}${window.location.pathname}${window.location.search}`;
        try {
            if (navigator.share) {
                await navigator.share({ title: restaurant?.name, text: landing.tagline || restaurant?.name, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            toast.success(t('restaurant_landing.link_copied', 'Link copied'));
        } catch { /* share sheet dismissed / clipboard blocked */ }
    };

    if (reserved) return <Navigate to="/unauthorized" replace />;
    if (isLoading) return <LandingSkeleton />;

    if (error || !restaurant) {
        const code = error?.response?.data?.code;
        const is404 = error?.response?.status === 404 || NOT_FOUND_CODES.has(code) || (!error && !restaurant);
        if (!is404) {
            return (
                <StatusScreen
                    icon={RefreshCw}
                    title={t('restaurant_landing.load_failed_title', "Couldn't load this page")}
                    message={t('restaurant_landing.load_failed', 'Please check your connection and try again.')}
                >
                    <button type="button" onClick={() => refetch()} disabled={isFetching} className={primaryLinkCls}>
                        <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                        {t('restaurant_landing.retry', 'Try again')}
                    </button>
                    <Link to="/" className={secondaryLinkCls}>{t('restaurant_landing.go_home', 'Go to BestoDine')}</Link>
                </StatusScreen>
            );
        }
        if (code === 'BRANCH_NOT_FOUND') {
            return (
                <StatusScreen
                    icon={Building2}
                    title={t('restaurant_landing.branch_not_found_title', 'Branch not found')}
                    message={t('restaurant_landing.branch_not_found', "This branch doesn't exist or is no longer open.")}
                >
                    <Link to={`/${encodeURIComponent(slug)}`} className={primaryLinkCls}>{t('restaurant_landing.see_restaurant', 'See the restaurant')}</Link>
                    <Link to="/" className={secondaryLinkCls}>{t('restaurant_landing.go_home', 'Go to BestoDine')}</Link>
                </StatusScreen>
            );
        }
        return (
            <StatusScreen
                title={code === 'RESTAURANT_UNAVAILABLE'
                    ? t('restaurant_landing.unavailable_title', 'Restaurant unavailable')
                    : t('restaurant_landing.not_found_title', 'Restaurant not found')}
                message={code === 'RESTAURANT_UNAVAILABLE'
                    ? t('restaurant_landing.unavailable', "This restaurant isn't taking visitors online right now. Please check back later.")
                    : t('restaurant_landing.not_found', "We couldn't find a restaurant at this address. Check the link and try again.")}
            >
                <Link to="/" className={primaryLinkCls}>{t('restaurant_landing.go_home', 'Go to BestoDine')}</Link>
            </StatusScreen>
        );
    }

    const accent = normalizeAccent(landing.accentColor, DEFAULT_ACCENT);
    const themeStyle = { '--accent': accent, '--accent-fg': readableOn(accent) };
    const branch = data.branch;
    const sections = landing.sections || {};
    const show = (key) => sections[key] !== false;
    const actions = data.actions || {};
    const contact = data.contact || {};
    const address = data.address || {};
    const logo = resolveImageUrl(restaurant.logo);
    const coverImages = Array.isArray(landing.coverImages) ? landing.coverImages.filter(Boolean) : [];
    const featured = Array.isArray(data.featuredItems) ? data.featuredItems : [];
    const hours = Array.isArray(data.operatingHours) ? data.operatingHours : [];
    const branches = Array.isArray(data.branches) ? data.branches : [];
    const openNow = data.openNow;
    const place = branch
        ? [branch.name !== restaurant.name ? branch.name : null, branch.city].filter(Boolean).join(' · ')
        : (address.city || restaurant.city || '');
    const hasLocation = Boolean(address.full || address.line1 || address.city || contact.phone);
    // googleMapsUrl feeds "Get directions", not the social row.
    const hasSocial = ['instagram', 'facebook', 'website', 'whatsapp']
        .some(k => String(landing.social?.[k] || '').trim());

    const pickerEl = (
        <BranchPickerSheet
            open={Boolean(picker)}
            restaurantName={restaurant.name}
            branches={picker?.branches || []}
            onClose={closePicker}
            onPick={(b) => { const p = picker; setPicker(null); go(b, p.action, p.opts); }}
        />
    );

    const footer = (
        <footer className="mt-10 px-5 pb-10 pt-6 border-t border-[#F2F4F7] text-center">
            <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-[#667085] font-varela hover:text-[var(--accent)]">
                {t('restaurant_landing.powered_by', 'Powered by')}
                <span className="font-bold font-nunito text-[#101828]">BestoDine</span>
            </Link>
            <nav className="mt-2 flex items-center justify-center gap-4 text-[12px] text-[#98A2B3] font-varela">
                <Link to="/terms" className="hover:text-[#475467] hover:underline underline-offset-2">{t('restaurant_landing.terms', 'Terms')}</Link>
                <span aria-hidden="true">·</span>
                <Link to="/privacy" className="hover:text-[#475467] hover:underline underline-offset-2">{t('restaurant_landing.privacy', 'Privacy')}</Link>
            </nav>
        </footer>
    );

    // ── Landing page switched off: a plain contact card + View Menu ─────
    if (landing.enabled === false) {
        return (
            <div className="min-h-screen bg-[#FBFBFF] flex flex-col" style={themeStyle}>
                <main className="flex-1 flex items-center justify-center px-5 py-10">
                    <div className="w-full max-w-sm bg-white rounded-3xl border border-[#F2F4F7] shadow-sm p-6 text-center">
                        {logo ? (
                            <img src={sizedImage(logo, { w: 96 })} alt={restaurant.name} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 border border-[#F2F4F7]" />
                        ) : (
                            <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-[32px] font-bold font-nunito bg-[var(--accent)] text-[var(--accent-fg)]">
                                {restaurant.name?.[0]?.toUpperCase() || 'R'}
                            </div>
                        )}
                        <h1 className="text-[22px] font-bold text-[#101828] font-nunito">{restaurant.name}</h1>
                        {place && <p className="text-[13px] text-[#667085] font-varela mt-0.5">{place}</p>}
                        <div className="mt-5 space-y-2 text-left">
                            {(address.full || address.line1) && (
                                <p className="flex items-start gap-2 text-[13px] text-[#475467] font-varela">
                                    <MapPin size={14} className="shrink-0 mt-0.5 text-[#98A2B3]" />
                                    {address.full || [address.line1, address.line2, address.city].filter(Boolean).join(', ')}
                                </p>
                            )}
                            {contact.phone && (
                                <a href={telHref(contact.phone)} className="flex items-center gap-2 text-[13px] text-[#475467] font-varela hover:text-[var(--accent)]">
                                    <Phone size={14} className="shrink-0 text-[#98A2B3]" />{contact.phone}
                                </a>
                            )}
                            {contact.email && (
                                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-[13px] text-[#475467] font-varela hover:text-[var(--accent)] break-all">
                                    <Mail size={14} className="shrink-0 text-[#98A2B3]" />{contact.email}
                                </a>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => handleAction('menu')}
                            disabled={Boolean(busyAction)}
                            className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[15px] font-nunito bg-[var(--accent)] text-[var(--accent-fg)] active:scale-[0.98] transition-all disabled:opacity-70"
                        >
                            <UtensilsCrossed size={17} />
                            {t('restaurant_landing.view_menu', 'View Menu')}
                        </button>
                    </div>
                </main>
                {footer}
                {pickerEl}
            </div>
        );
    }

    // ── Full landing page ───────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#FBFBFF]" style={themeStyle}>
            <div className="max-w-3xl mx-auto bg-[#FBFBFF] min-h-screen md:shadow-[0_0_0_1px_#F2F4F7]">
                {/* Hero cover */}
                <header className="relative w-full aspect-[4/3] sm:aspect-[21/9] max-h-[440px] overflow-hidden bg-[#101828]">
                    <CoverCarousel images={coverImages} alt={restaurant.name} />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/25 pointer-events-none" />
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-end">
                        <button
                            type="button"
                            onClick={handleShare}
                            aria-label={t('restaurant_landing.share', 'Share')}
                            className="p-2.5 rounded-xl bg-white/90 backdrop-blur-sm text-[#344054] shadow-sm active:scale-90 transition-transform"
                        >
                            <Share2 size={18} />
                        </button>
                    </div>
                </header>

                {/* Identity + actions sheet */}
                <div className="relative -mt-10 bg-[#FBFBFF] rounded-t-[32px] px-5 pt-4">
                    <div className="-mt-14 mb-3 flex items-end justify-between gap-3">
                        {logo ? (
                            <img
                                src={sizedImage(logo, { w: 96 })}
                                alt={t('restaurant_landing.logo_alt', '{{name}} logo', { name: restaurant.name })}
                                className="w-20 h-20 rounded-2xl object-cover bg-white border-4 border-white shadow-md"
                            />
                        ) : (
                            <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-[30px] font-bold font-nunito bg-[var(--accent)] text-[var(--accent-fg)]">
                                {restaurant.name?.[0]?.toUpperCase() || 'R'}
                            </div>
                        )}
                        {openNow?.label && (
                            <span
                                className={`mb-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold font-nunito border ${openNow.isOpen
                                    ? 'bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]'
                                    : 'bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]'}`}
                            >
                                <span className={`w-2 h-2 rounded-full ${openNow.isOpen ? 'bg-[#12B76A] animate-pulse' : 'bg-[#F04438]'}`} />
                                {openNow.label}
                            </span>
                        )}
                    </div>

                    <h1 className="text-[26px] leading-[32px] font-extrabold text-[#101828] font-nunito tracking-tight">{restaurant.name}</h1>
                    {place && (
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#667085] font-varela">
                            <MapPin size={13} className="shrink-0" />
                            {place}
                        </p>
                    )}
                    {landing.tagline && (
                        <p className="mt-2.5 text-[15px] leading-[22px] text-[#475467] font-varela">{landing.tagline}</p>
                    )}

                    <div className="mt-5">
                        <LandingActions actions={actions} busyAction={busyAction} onAction={handleAction} />
                    </div>
                </div>

                <div className="mt-8 space-y-8">
                    {show('featured') && featured.length > 0 && (
                        <LandingSection
                            id="featured"
                            // featuredSource: 'chosen' | 'featured' | 'popular' (bestseller fallback)
                            title={data.featuredSource === 'popular'
                                ? t('restaurant_landing.popular', 'Popular dishes')
                                : t('restaurant_landing.featured', 'Featured dishes')}
                            icon={Sparkles}
                            flush
                        >
                            <FeaturedDishes items={featured} onSelect={(item) => handleAction('item', { itemId: item._id })} />
                        </LandingSection>
                    )}

                    {show('about') && landing.about && (
                        <LandingSection id="about" title={t('restaurant_landing.about', 'About us')} icon={Info}>
                            <p className="text-[14px] leading-[22px] text-[#475467] font-varela whitespace-pre-line">{landing.about}</p>
                        </LandingSection>
                    )}

                    {show('gallery') && coverImages.length > 1 && (
                        <LandingSection id="gallery" title={t('restaurant_landing.gallery', 'Gallery')} icon={Images} flush>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {coverImages.map((src, i) => {
                                    const url = resolveImageUrl(src);
                                    return url ? (
                                        <img
                                            key={`${i}-${src}`}
                                            src={sizedImage(url, { w: 260 })}
                                            alt={t('restaurant_landing.gallery_alt', '{{name}} photo {{n}}', { name: restaurant.name, n: i + 1 })}
                                            loading="lazy"
                                            decoding="async"
                                            className={`w-full object-cover rounded-2xl bg-[#F2F4F7] ${i === 0 ? 'col-span-2 aspect-[2/1]' : 'aspect-square'}`}
                                        />
                                    ) : null;
                                })}
                            </div>
                        </LandingSection>
                    )}

                    {show('hours') && hours.length > 0 && (
                        <LandingSection id="hours" title={t('restaurant_landing.hours', 'Opening hours')} icon={Clock}>
                            <HoursCard operatingHours={hours} />
                        </LandingSection>
                    )}

                    {show('location') && hasLocation && (
                        <LandingSection id="location" title={t('restaurant_landing.location', 'Location & contact')} icon={MapPin}>
                            <LocationCard
                                address={address}
                                phone={contact.phone}
                                email={contact.email}
                                mapUrl={address.mapUrl || landing.social?.googleMapsUrl}
                            />
                        </LandingSection>
                    )}

                    {show('branches') && branches.length >= 2 && (
                        <LandingSection id="branches" title={t('restaurant_landing.branches', 'Our branches')} icon={Building2} flush>
                            <BranchLinks restaurantSlug={restaurant.slug || slug} branches={branches} currentBranchSlug={branch?.slug || branchSlug} />
                        </LandingSection>
                    )}

                    {hasSocial && (
                        <LandingSection id="social" title={t('restaurant_landing.follow', 'Find us online')} icon={Share2} flush>
                            <SocialLinks social={landing.social} />
                        </LandingSection>
                    )}
                </div>

                {footer}
            </div>
            {pickerEl}
        </div>
    );
};

export default RestaurantLandingPage;
