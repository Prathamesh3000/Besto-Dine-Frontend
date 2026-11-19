// BestoDine PLATFORM home — route `/`. Marketing page for restaurant owners
// plus a "find a restaurant" search for diners. Each restaurant's own page
// lives at /:slug (Pages/Restaurant/RestaurantLandingPage.jsx).
//
// Concept A, "One evening": a light, editorial page that walks the buyer —
// the owner of a single independent restaurant, cafe or hotel restaurant in
// India, often with a party hall, often in a Tier 2/3 city — through one
// evening of service. The evening rush is where their money leaks (waiting
// guests, wrong or late orders, lost paper KOTs, bookings in a register, five
// separate tools), and they distrust vendors (hidden add-ons, lock-in, support
// that vanishes). Every section below answers one of those worries.
//
// Layout (third pass), "the clock runs the page": a small clock in the header
// advances as the reader scrolls (6:45 PM at the hero, the stop times through
// the evening band, 10:00 PM at "what you stopped doing", 10:30 PM at the
// three differentiators, 11:45 PM at pricing, "After close" at the answers,
// "Tomorrow, 7:00 PM" at the closing). Sections change shape the way an
// evening changes pace, and no two neighbours share a column count:
//   1. hero, 5/7 split — copy left, a device cluster bleeding off the right
//      (owner's report at the back, guest's phone in front, waiter's phone
//      behind), the ticking clock card pinned to the laptop's corner;
//   2. the evening, a full-bleed warm band — hour ruler | captions | one
//      sticky frame cross-fading the five real screens;
//   3. what you stopped doing — one centred column, the struck list set at
//      display size, then the four steps as one thin horizontal strip;
//   4. three things — the "stair": three cards overlapping on a 12-col grid;
//   5. pricing — the receipt sticky on the left, plan rows stacked right;
//   6. straight answers — one narrow column, grouped accordion;
//   7. closing — a warm band, the clock set for tomorrow.
//
// Motion budget: Lenis smooth scroll, GSAP ScrollTrigger reveals (fade + 24px
// rise, once), the ruler line drawing on scroll, the strike-throughs, the
// clock digit flips (anime.js), the header clock's 200 ms fade, the 400 ms
// screen cross-fade, 2px hover lifts. All off under prefers-reduced-motion
// and guarded for jsdom.
import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { animate } from 'animejs';
import {
    QrCode, ChefHat, Users, CalendarDays, Wallet, CreditCard, Building2, Boxes, BarChart3,
    MonitorSmartphone, Globe, Languages, Search, MapPin, ArrowRight, CheckCircle2,
    ClipboardEdit, BadgeCheck, UtensilsCrossed, Printer, Loader2, Store, ChevronDown,
} from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';
import { staffHomePath } from '../../utils/roleRouting';
import { publicAPI } from '../../utils/api';
import { resolveImageUrl } from '../../utils/image';
import { getPublicAppOrigin } from '../../utils/customerLinks';
import { getCTA, hasTrial, trialDaysOf } from '../../utils/planCta';
import { cycleSuffix, formatINR, rowForCycle } from '../../utils/billingCycles';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import { PlatformHeader, PlatformFooter } from './components/PlatformChrome';
import DesktopDownloadLink from '../../Components/Common/DesktopDownloadLink';
import {
    PLATFORM_TITLE, PLATFORM_DESCRIPTION, usePageMeta, usePublicPlans, formatPlanCyclePrice, publicCycleOptions, planHighlights,
} from './platformShared';
import useSmoothScroll, { prefersReducedMotion } from './motion/useSmoothScroll';
import './evening.css';

try { gsap.registerPlugin(ScrollTrigger); } catch { /* ScrollTrigger unavailable — reveals stay static */ }

// ── Palette + type tokens ─────────────────────────────────────────────────
// Light theme: page #FCFCFD, cards #FFFFFF, ink #101828, muted #475467,
// hairlines #EAECF0, warm paper #FFF8F0. Brand orange #FE8301 is an accent only.
const INK = 'text-[#101828]';
const MUTED = 'text-[#475467]';
const HAIR = 'border-[#EAECF0]';
const display = 'font-display font-medium tracking-[-0.01em] leading-[1.05]';
const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-xl bg-[#FE8301] px-5 py-3 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-[transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-[#E57501] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]/40';
const textLink = 'inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#101828] underline decoration-[#EAECF0] underline-offset-4 transition-colors hover:decoration-[#FE8301]';
const card = `rounded-2xl border ${HAIR} bg-white transition-transform duration-200 hover:-translate-y-0.5`;

/** The timeline's stop times, in order; the hero clock flips through them. */
const CLOCK_TIMES = [['7', '00'], ['7', '02'], ['7', '40'], ['8', '15'], ['9', '00'], ['11', '30']];

// ── Motion helpers (jsdom + reduced-motion safe) ──────────────────────────

/** Fade + 24px rise, once, for every `[data-reveal]` under `rootRef`. */
function useReveal(rootRef) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root || typeof window === 'undefined' || prefersReducedMotion()) return undefined;
        let ctx;
        try {
            ctx = gsap.context(() => {
                root.querySelectorAll('[data-reveal]').forEach((el) => {
                    gsap.from(el, {
                        y: 24, opacity: 0, duration: 0.6, ease: 'power2.out', immediateRender: false,
                        scrollTrigger: { trigger: el, start: 'top 85%', once: true },
                    });
                });
            }, root);
        } catch { return undefined; }
        return () => { try { ctx?.revert(); } catch { /* ignore */ } };
    }, [rootRef]);
}

// ── Clock: the page's signature visual ────────────────────────────────────
/**
 * A large time drawn as text in Fraunces. When `ticking`, the minute (and,
 * when it changes, hour) numerals flip every few seconds through the
 * timeline's stop times via anime.js. Static under reduced motion.
 */
function Clock({ ticking = false, prefix = '', className = '', size = 'text-[clamp(4.5rem,14vw,9rem)]' }) {
    const [idx, setIdx] = useState(0);
    const hourRef = useRef(null);
    const minRef = useRef(null);
    const prevIdx = useRef(0);

    useEffect(() => {
        if (!ticking || typeof window === 'undefined' || prefersReducedMotion()) return undefined;
        const id = window.setInterval(() => setIdx((i) => (i + 1) % CLOCK_TIMES.length), 2600);
        return () => window.clearInterval(id);
    }, [ticking]);

    useEffect(() => {
        const from = prevIdx.current;
        prevIdx.current = idx;
        if (from === idx || typeof window === 'undefined' || prefersReducedMotion()) return undefined;
        const hourChanged = CLOCK_TIMES[from][0] !== CLOCK_TIMES[idx][0];
        const targets = [minRef.current, hourChanged ? hourRef.current : null].filter(Boolean);
        if (!targets.length) return undefined;
        let anim;
        try {
            anim = animate(targets, { translateY: [16, 0], opacity: [0, 1], duration: 420, ease: 'outCubic' });
        } catch { return undefined; }
        return () => { try { anim?.pause?.(); anim?.cancel?.(); anim?.revert?.(); } catch { /* ignore */ } };
    }, [idx]);

    const [h, m] = CLOCK_TIMES[idx];
    return (
        <p className={`bd-clock ${INK} ${size} ${className}`} aria-live="off" data-testid="evening-clock">
            {prefix && <span className="block text-[0.28em] font-normal tracking-normal text-[#475467]">{prefix}</span>}
            <span className="inline-block overflow-hidden align-baseline">
                <span ref={hourRef} className="inline-block text-[#FE8301]">{h}</span>
            </span>
            <span className="text-[#FE8301]">:</span>
            <span className="inline-block overflow-hidden align-baseline">
                <span ref={minRef} className="inline-block text-[#FE8301]">{m}</span>
            </span>
            {' '}<span className="text-[0.42em] font-normal text-[#475467]">PM</span>
        </p>
    );
}

/**
 * The header's scroll-driven clock (home only): the time of the section in
 * the reading band. Re-keyed on every change so the digits fade in over
 * 200 ms (CSS, `.bd-header-clock-digits`; none under reduced motion).
 */
function HeaderClock({ time }) {
    return (
        <p className="bd-clock shrink-0 text-[15px] text-[#FE8301]" aria-live="off" data-testid="header-clock">
            <span key={time} className="bd-header-clock-digits">{time}</span>
        </p>
    );
}

// ── Device frames for the real product screenshots ────────────────────────
function BrowserFrame({ children, className = '' }) {
    return (
        <div className={`overflow-hidden rounded-xl border ${HAIR} bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] ${className}`}>
            <div className={`flex items-center gap-1.5 border-b ${HAIR} bg-[#F9FAFB] px-3 py-2`} aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-[#D0D5DD]" />
                <span className="h-2 w-2 rounded-full bg-[#D0D5DD]" />
                <span className="h-2 w-2 rounded-full bg-[#D0D5DD]" />
                <span className="ml-2 h-3 flex-1 rounded-sm bg-[#EAECF0]" />
            </div>
            {children}
        </div>
    );
}

function PhoneFrame({ children, width = 'max-w-[280px]', className = '' }) {
    return (
        <div className={`mx-auto w-full ${width} overflow-hidden rounded-[28px] border-[6px] border-[#EAECF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06)] ${className}`}>
            {children}
        </div>
    );
}

/** A real staging screenshot in a thin light frame (stacked / mobile use). */
function Screen({ kind, src, alt }) {
    const img = kind === 'phone'
        ? <img src={src} alt={alt} width={820} height={1775} loading="lazy" decoding="async" className="block h-auto w-full" />
        : <img src={src} alt={alt} width={1920} height={1080} loading="lazy" decoding="async" className="block h-auto w-full" />;
    return kind === 'phone'
        ? <div className="rounded-2xl bg-[#F2F4F7] px-6 py-8"><PhoneFrame>{img}</PhoneFrame></div>
        : <BrowserFrame>{img}</BrowserFrame>;
}

// ── Find a restaurant (diners) ────────────────────────────────────────────
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
            <label htmlFor={inputId} className={`mb-2 block text-[13px] font-semibold ${MUTED}`}>
                {t('platform.search.label', 'Hungry? Find a restaurant on BestoDine')}
            </label>
            <div className="relative">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#98A2B3]" aria-hidden="true" />
                <input
                    id={inputId}
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('platform.search.placeholder', 'Search by restaurant name or city')}
                    autoComplete="off"
                    className={`w-full rounded-xl border ${HAIR} bg-white py-3.5 pl-12 pr-11 text-[15px] ${INK} placeholder:text-[#98A2B3] transition-colors focus:border-[#FE8301]/60 focus:outline-none focus:ring-2 focus:ring-[#FE8301]/20`}
                    aria-describedby={`${inputId}-status`}
                />
                {pending && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#FE8301]" aria-hidden="true" />}
            </div>
            <div id={`${inputId}-status`} aria-live="polite" className="sr-only">
                {showPanel && !pending ? t('platform.search.count', '{{n}} restaurants found', { n: results.length }) : ''}
            </div>
            {showPanel && (
                <div className={`mt-2 overflow-hidden rounded-xl border ${HAIR} bg-white shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)]`}>
                    {isError ? (
                        <p className="px-4 py-4 text-[14px] text-[#B42318]">{t('platform.search.error', "Couldn't search right now — please try again.")}</p>
                    ) : pending && results.length === 0 ? (
                        <p className={`px-4 py-4 text-[14px] ${MUTED}`}>{t('platform.search.searching', 'Searching…')}</p>
                    ) : results.length === 0 ? (
                        <p className={`px-4 py-4 text-[14px] ${MUTED}`}>
                            {t('platform.search.empty', 'No restaurants match "{{q}}".', { q: q.trim() })}
                        </p>
                    ) : (
                        <ul className="max-h-80 divide-y divide-[#EAECF0] overflow-y-auto" data-lenis-prevent>
                            {results.filter(r => r?.slug).map((r) => {
                                const logo = resolveImageUrl(r.logo);
                                return (
                                    <li key={r.slug}>
                                        <Link to={`/${encodeURIComponent(r.slug)}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#F9FAFB]">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F2F4F7]">
                                                {logo ? <img src={logo} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Store size={18} className="text-[#98A2B3]" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className={`block truncate text-[14px] font-semibold ${INK}`}>{r.name}</span>
                                                {r.city && (
                                                    <span className={`flex items-center gap-1 text-[12px] ${MUTED}`}>
                                                        <MapPin size={11} /> {r.city}
                                                    </span>
                                                )}
                                            </span>
                                            <ArrowRight size={16} className="shrink-0 text-[#98A2B3]" />
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

// ── The evening: pinned timeline ──────────────────────────────────────────
/**
 * Two stops have no screenshot of their own yet (7:02 "scans the QR, orders
 * and pays" and 7:40 "bill, UPI, tip"). The frame never shows a placeholder:
 * each holds a neighbouring real screen. 7:02 keeps the 6:45 restaurant page
 * (it literally says "Dining in? Scan the QR code"); 7:40 shows the 8:15
 * waiter app (the waiter settles bills there).
 */
const HELD_SCREEN = { 1: 0, 3: 4 };

/** The screen ({ kind, src, alt }) the frame shows for stop `i`: its own, or the held neighbour. */
function screenFor(stops, i) {
    const own = stops[i];
    if (own?.src) return own;
    const held = stops[HELD_SCREEN[i]];
    if (held?.src) return held;
    return stops.find((s) => s.src) || null;
}

function EveningTimeline({ stops, onActiveTime }) {
    const rootRef = useRef(null);
    const lineRef = useRef(null);
    const [active, setActive] = useState(0);
    useReveal(rootRef);

    // The stop in the reading band is active: full ink on its caption, its
    // tick lit on the ruler, its screen visible in the sticky frame, its time
    // in the frame's corner and (via onActiveTime) in the header clock.
    useEffect(() => {
        const root = rootRef.current;
        if (!root || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') return undefined;
        let observer;
        try {
            observer = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setActive(Number(entry.target.dataset.stop) || 0);
                }
            }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
            root.querySelectorAll('[data-stop]').forEach((el) => observer.observe(el));
        } catch { return undefined; }
        return () => { try { observer?.disconnect(); } catch { /* ignore */ } };
    }, []);

    const activeTime = stops[active]?.time;
    useEffect(() => { onActiveTime?.(activeTime); }, [activeTime, onActiveTime]);

    // The ruler's line draws itself as you scroll (scrubbed); full line otherwise.
    useEffect(() => {
        const root = rootRef.current;
        const line = lineRef.current;
        if (!root || !line || typeof window === 'undefined' || prefersReducedMotion()) return undefined;
        let ctx;
        try {
            ctx = gsap.context(() => {
                gsap.fromTo(line, { scaleY: 0 }, {
                    scaleY: 1, ease: 'none', immediateRender: false,
                    scrollTrigger: { trigger: root, start: 'top 60%', end: 'bottom 75%', scrub: 0.4 },
                });
            }, root);
        } catch { return undefined; }
        return () => { try { ctx?.revert(); } catch { /* ignore */ } };
    }, []);

    const screens = stops.map((_, i) => screenFor(stops, i));
    // One layer per distinct screen; a held screen is the same layer as its owner.
    const layers = [];
    for (const s of screens) if (s && !layers.some((l) => l.src === s.src)) layers.push(s);
    const activeSrc = screens[active]?.src;
    const fade = 'will-change-[opacity,transform] transition-[opacity,transform] duration-[400ms] ease-out motion-reduce:transition-none';

    // lg: three columns — hour ruler | captions | sticky frame. The ruler and
    // the captions are subgrids over the same seven rows, so each tick sits
    // level with its caption without measuring anything.
    return (
        <div ref={rootRef} className="lg:grid lg:grid-cols-[64px_minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-[repeat(7,auto)] lg:gap-x-10 lg:gap-y-32">
            <ol className="relative hidden lg:row-span-7 lg:grid lg:grid-rows-subgrid" aria-hidden="true" data-testid="evening-ruler">
                <span className="absolute bottom-0 left-0 top-0 w-px bg-[#EAD9C6]" />
                <span ref={lineRef} className="bd-timeline-line absolute bottom-0 left-0 top-0 w-px bg-[#FE8301]/70" />
                {stops.map((stop, i) => (
                    <li key={stop.time} className="relative pl-4" data-testid="evening-ruler-tick">
                        <span className={`absolute left-0 top-[0.55em] h-px w-2.5 ${i === active ? 'bg-[#FE8301]' : 'bg-[#D0D5DD]'}`} />
                        <span className={`bd-clock block text-[12px] transition-colors duration-300 motion-reduce:transition-none ${i === active ? 'text-[#FE8301]' : 'text-[#98A2B3]'}`}>
                            {stop.time}
                        </span>
                    </li>
                ))}
            </ol>

            <ol className="space-y-20 sm:space-y-24 lg:row-span-7 lg:grid lg:grid-rows-subgrid lg:space-y-0">
                {stops.map((stop, i) => {
                    const screen = screens[i];
                    const isActive = i === active;
                    // The reveal tween lives on an inner div: GSAP leaves an inline opacity
                    // behind, which must not fight the active/dim classes on the <li>.
                    return (
                        <li
                            key={stop.time}
                            data-stop={i}
                            data-screen-src={screen?.src || ''}
                            className={`relative transition-opacity duration-300 motion-reduce:transition-none ${isActive ? 'opacity-100' : 'lg:opacity-50'}`}
                        >
                            <div data-reveal>
                            <p className="bd-clock text-[15px] text-[#FE8301]" data-testid="evening-stop-time">{stop.time}</p>
                            <h3 className={`${display} mt-3 text-2xl sm:text-3xl ${INK}`}>{stop.title}</h3>
                            <p className={`mt-4 text-[16px] leading-relaxed ${MUTED}`}>{stop.body}</p>
                            {stop.bullets.length > 0 && (
                                <ul className="mt-5 space-y-2">
                                    {stop.bullets.map((bullet) => {
                                        const [Icon, title] = bullet;
                                        return (
                                            <li key={title} className={`flex items-center gap-2.5 text-[14px] font-medium ${INK}`}>
                                                <Icon size={16} className="shrink-0 text-[#FE8301]" aria-hidden="true" /> {title}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {/* Below lg: the (held) screen sits under its caption; the sticky frame is hidden. */}
                            {screen && (
                                <div className="mt-8 lg:hidden">
                                    <Screen kind={screen.kind} src={screen.src} alt={screen.alt} />
                                </div>
                            )}
                            </div>
                        </li>
                    );
                })}
            </ol>

            <div className="hidden lg:row-span-7 lg:block">
                <div className="sticky top-28 h-[min(68vh,620px)]">
                    <div className="relative h-full" data-testid="evening-screen-stack">
                        {layers.map((layer) => {
                            const visible = layer.src === activeSrc;
                            const state = visible ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-[0.99]';
                            return layer.kind === 'phone' ? (
                                <div key={layer.src} data-screen-src={layer.src} aria-hidden={!visible} className={`absolute inset-0 flex items-center justify-center rounded-2xl bg-[#F2F4F7] p-6 ${fade} ${state}`}>
                                    <PhoneFrame width="max-w-[340px]" className="max-h-full">
                                        <img src={layer.src} alt={layer.alt} width={820} height={1775} loading="lazy" decoding="async" className="block h-auto w-full" />
                                    </PhoneFrame>
                                </div>
                            ) : (
                                <div key={layer.src} data-screen-src={layer.src} aria-hidden={!visible} className={`absolute inset-0 flex items-center ${fade} ${state}`}>
                                    <BrowserFrame className="w-full">
                                        <img src={layer.src} alt={layer.alt} width={1920} height={1080} loading="lazy" decoding="async" className="block h-auto w-full" />
                                    </BrowserFrame>
                                </div>
                            );
                        })}
                        <p
                            className="bd-clock absolute left-4 top-4 z-10 rounded-lg bg-white/90 px-2.5 py-1.5 text-[15px] text-[#FE8301] shadow-[0_1px_2px_rgba(16,24,40,0.08)] backdrop-blur-sm"
                            data-testid="evening-sticky-time"
                            aria-hidden="true"
                        >
                            {activeTime}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── What you stopped doing: five struck-through tools ─────────────────────
function StruckList({ items }) {
    const rootRef = useRef(null);
    useEffect(() => {
        const root = rootRef.current;
        if (!root || typeof window === 'undefined' || prefersReducedMotion()) return undefined;
        let ctx;
        try {
            ctx = gsap.context(() => {
                root.querySelectorAll('.bd-strike').forEach((el, i) => {
                    gsap.fromTo(el, { '--strike': 0 }, {
                        '--strike': 1, duration: 0.7, delay: i * 0.08, ease: 'power2.inOut', immediateRender: false,
                        scrollTrigger: { trigger: el, start: 'top 80%', once: true },
                    });
                });
            }, root);
        } catch { return undefined; }
        return () => { try { ctx?.revert(); } catch { /* ignore */ } };
    }, []);
    return (
        <ul ref={rootRef} className="space-y-4 text-center" data-testid="stopped-list">
            {items.map((item) => (
                <li key={item} className={`${display} text-4xl leading-[1.05] sm:text-5xl lg:text-6xl ${INK}`}>
                    <span className="bd-strike">{item}</span>
                </li>
            ))}
        </ul>
    );
}

// ── Three things only BestoDine does: the tips visual ─────────────────────
/** A typographic bill line, not a screenshot: the tip, in full, to staff. */
function TipsVisual() {
    const { t } = useTranslation();
    return (
        <div className="flex min-h-[22rem] flex-col justify-center rounded-3xl bg-[#FFF8F0] px-8 py-14 sm:min-h-[26rem] sm:px-12" data-testid="tips-visual">
            <div className="border-t border-dashed border-[#EAD9C6]" aria-hidden="true" />
            <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                <span className={`font-display text-2xl ${MUTED}`}>{t('platform.only.tips_visual_label', 'Tip to staff')}</span>
                <span className="bd-clock text-6xl text-[#FE8301] sm:text-7xl">{t('platform.only.tips_visual_amount', '₹50')}</span>
            </div>
            <p className={`mt-6 text-[14px] ${MUTED}`}>{t('platform.only.tips_visual_note', '100% to staff · pooled by shift')}</p>
        </div>
    );
}

// ── Pricing ───────────────────────────────────────────────────────────────
/**
 * The receipt that frames pricing: the lowest price for the active cycle plus
 * the lines a wary owner wants to see at ₹0. "Prices exclude GST" is shown
 * here only when the plan cards (and their own GST note) are not rendering.
 */
function Receipt({ plans, activeCycle, showGstNote, gstRate }) {
    const { t } = useTranslation();
    const prices = plans
        .map((p) => rowForCycle(p, activeCycle, gstRate)?.price)
        .filter((v) => Number.isFinite(v) && v > 0);
    const lowest = prices.length ? Math.min(...prices) : null;
    const fromLine = lowest
        ? t('platform.receipt.from', 'from {{amount}} {{per}}', { amount: formatINR(lowest), per: cycleSuffix(activeCycle) })
        : t('platform.receipt.from_contact', 'ask us');
    const zero = t('platform.receipt.zero', '₹0');
    const rows = [
        [t('platform.receipt.plan', 'Your plan'), fromLine],
        [t('platform.receipt.commission', 'Commission on your own orders'), zero],
        [t('platform.receipt.devices', 'Per-device fees'), zero],
        [t('platform.receipt.renewal', 'Renewal increase'), zero],
        [t('platform.receipt.export', 'Data export'), t('platform.receipt.export_value', 'any time')],
    ];
    return (
        <div className="bd-receipt mx-auto w-full max-w-md px-6 pb-9 pt-6 sm:px-8" data-testid="pricing-receipt">
            <p className={`bd-clock text-center text-[13px] tracking-[0.08em] ${MUTED}`}>{t('platform.receipt.title', 'BestoDine · receipt')}</p>
            <dl className="mt-5">
                {rows.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-[#EAD9C6] py-2.5 text-[14px]">
                        <dt className={MUTED}>{label}</dt>
                        <dd className={`bd-clock shrink-0 text-[17px] ${INK}`}>{value}</dd>
                    </div>
                ))}
            </dl>
            {showGstNote && (
                <p className={`mt-4 text-center text-[12px] ${MUTED}`}>
                    {t('platform.receipt.gst', 'Prices exclude {{rate}}% GST', { rate: gstRate })}
                </p>
            )}
        </div>
    );
}

/**
 * `layout`: 'grid' (default) lays the cards out side by side; 'stack' renders
 * them as full-width rows (name + price left, highlights + CTA right on md+).
 * Only wrapper classes differ — content order, test ids and strings are the same.
 */
function Pricing({ plans, isLoading, isError, options, activeCycle, onCycle, gstRate, layout = 'grid' }) {
    const { t } = useTranslation();
    const stack = layout === 'stack';

    if (isLoading) {
        return (
            <div className="grid gap-5 md:grid-cols-3">
                {[0, 1, 2].map(i => (
                    <div key={i} className={`animate-pulse rounded-2xl border ${HAIR} bg-white p-6`}>
                        <div className="h-4 w-24 rounded bg-[#F2F4F7]" />
                        <div className="mt-4 h-8 w-32 rounded bg-[#F2F4F7]" />
                        <div className="mt-6 space-y-2">
                            {[0, 1, 2, 3].map(j => <div key={j} className="h-3 rounded bg-[#F2F4F7]" />)}
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (isError || plans.length === 0) {
        return (
            <div className={`mx-auto max-w-xl rounded-2xl border ${HAIR} bg-white p-8 text-center`}>
                <p className={`${display} text-[24px] ${INK}`}>{t('platform.pricing.contact_title', 'Contact us for pricing')}</p>
                <p className={`mt-2 text-[15px] ${MUTED}`}>
                    {t('platform.pricing.contact_body', "Tell us about your restaurant and we'll recommend the right plan.")}
                </p>
                <div className="mt-6 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    <Link to="/request-demo" className={primaryBtn}>{t('platform.cta.demo', 'Request a demo')}</Link>
                    <Link to="/start-trial" className={textLink}>{t('platform.cta.trial', 'Start 14-day free trial')}</Link>
                </div>
            </div>
        );
    }

    const cycleName = {
        monthly: t('platform.pricing.cycle_monthly', 'Monthly'),
        annual: t('platform.pricing.cycle_annual', 'Annual'),
        biennial: t('platform.pricing.cycle_biennial', '2-year'),
    };
    const cols = plans.length >= 3 ? 'md:grid-cols-2 lg:grid-cols-3' : plans.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'max-w-md mx-auto';
    // "N-day free trial on every plan" only when it is true for every plan
    // (free and enterprise tiers usually have none); longest trial wins.
    const trialPlans = plans.filter(hasTrial);
    const trialAllDays = trialPlans.length === plans.length ? Math.max(...plans.map(trialDaysOf)) : 0;
    return (
        <>
        <div className="mb-10 flex flex-col items-center gap-3">
            {trialAllDays > 0 ? (
                <p className="text-[14px] font-semibold text-[#067647]">
                    {t('platform.pricing.trial_all', '{{days}}-day free trial on every plan', { days: trialAllDays })}
                </p>
            ) : trialPlans.length > 0 && (
                <p className="text-[14px] font-semibold text-[#067647]">
                    {t('platform.pricing.trial_some', 'Free trial available on selected plans')}
                </p>
            )}
            {options.length > 1 && (
                <div role="group" aria-label={t('platform.pricing.cycle_label', 'Billing period')} className={`inline-flex items-center gap-1 rounded-full border ${HAIR} bg-white p-1`}>
                    {options.map(({ cycle: c, savings }) => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => onCycle(c)}
                            aria-pressed={activeCycle === c}
                            data-testid={`pricing-cycle-${c}`}
                            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold transition ${
                                activeCycle === c ? 'bg-[#101828] text-white' : `${MUTED} hover:bg-[#F9FAFB] hover:text-[#101828]`
                            }`}
                        >
                            {cycleName[c]}
                            {savings > 0 && (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${activeCycle === c ? 'bg-white/15 text-white' : 'bg-[#ECFDF3] text-[#067647]'}`}>
                                    {t('platform.pricing.save', 'Save {{pct}}%', { pct: savings })}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
            <p className={`text-[13px] ${MUTED}`}>
                {t('platform.pricing.gst_note', 'Prices exclude {{rate}}% GST, added at checkout. Same price at renewal. Cancel monthly plans any time.', { rate: gstRate })}
            </p>
        </div>
        {/* 'grid': the receipt may overlap the top-left of the first card, so the grid and
            that card carry extra top padding. 'stack': one full-width row per plan. */}
        <div className={stack ? 'grid grid-cols-1 gap-5' : `grid gap-5 lg:pt-24 ${cols}`} data-layout={layout}>
            {plans.map((plan) => {
                const { amount, per, perMonth, savingsPct: planSavings, fellBack } = formatPlanCyclePrice(plan, activeCycle);
                // Super Admin-authored bullets win; otherwise derive them from limits + features.
                const ownHighlights = Array.isArray(plan.highlights)
                    ? plan.highlights.filter(h => typeof h === 'string' && h.trim()).map(h => h.trim())
                    : [];
                const highlights = ownHighlights.length ? ownHighlights : planHighlights(plan);
                const trial = trialDaysOf(plan);
                const popular = Boolean(plan.highlight);
                // Ribbon text: the plan's own badge, else the "Most popular" ribbon.
                const badge = (typeof plan.badge === 'string' && plan.badge.trim())
                    || (popular ? t('platform.pricing.popular', 'Most popular') : '');
                const cta = getCTA(plan, activeCycle);
                // Enterprise-style plans are stored at price 0 and sold through "Contact
                // sales"; printing "Free" on them is a wrong price. A genuinely free plan
                // (CTA is not "contact") still reads "Free".
                const priceOnRequest = cta.kind === 'contact' && amount === 'Free';
                const slugKey = plan.slug || plan._id;
                return (
                    <div
                        key={plan._id || plan.name}
                        data-reveal
                        className={`${card} relative ${stack ? 'p-6 sm:p-8 md:grid md:grid-cols-[1fr_auto] md:items-start md:gap-x-10' : 'flex flex-col p-6 lg:first:pt-20'} ${popular ? 'ring-2 ring-[#FE8301]/40' : ''}`}
                    >
                        {badge && (
                            <span
                                className="absolute -top-3 left-6 z-20 rounded-full bg-[#FE8301] px-3 py-1 text-[11px] font-semibold text-white"
                                data-testid={`pricing-badge-${slugKey}`}
                            >
                                {badge}
                            </span>
                        )}
                        <div className={stack ? 'md:max-w-sm' : 'contents'}>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className={`${display} text-[22px] capitalize ${INK}`}>{plan.name}</h3>
                            {trial > 0 && (
                                <span className="rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[11px] font-semibold text-[#067647]">
                                    {t('platform.pricing.trial', '{{days}}-day free trial', { days: trial })}
                                </span>
                            )}
                        </div>
                        {plan.description && <p className={`mt-1.5 text-[13px] ${MUTED}`}>{plan.description}</p>}
                        <p className="mt-4 flex items-baseline gap-1.5">
                            <span className={`bd-clock text-[38px] ${INK}`}>{priceOnRequest ? t('platform.pricing.custom', 'Custom') : amount}</span>
                            {per && <span className={`text-[14px] font-semibold ${MUTED}`}>{per}</span>}
                        </p>
                        {amount !== 'Free' && (
                            <p className={`mt-1 text-[13px] tabular-nums ${MUTED}`} data-testid={`pricing-note-${plan.slug || plan._id}`}>
                                {t('platform.pricing.plus_gst', '+ {{rate}}% GST', { rate: gstRate })}
                                {perMonth && !fellBack && <> · {t('platform.pricing.per_month_eq', '{{amount}}/month', { amount: perMonth })}</>}
                                {planSavings > 0 && !fellBack && <> · <span className="font-semibold text-[#067647]">{t('platform.pricing.save', 'Save {{pct}}%', { pct: planSavings })}</span></>}
                            </p>
                        )}
                        </div>
                        <div className={stack ? 'md:min-w-[18rem] md:max-w-md' : 'contents'}>
                        {highlights.length > 0 && (
                            <ul className="mt-5 flex-1 space-y-2.5" data-testid={`pricing-highlights-${slugKey}`}>
                                {highlights.map(h => (
                                    <li key={h} className={`flex items-start gap-2 text-[14px] ${MUTED}`}>
                                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#FE8301]" /> {h}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Link
                            to={cta.to}
                            data-testid={`pricing-cta-${slugKey}`}
                            data-cta-kind={cta.kind}
                            className={cta.kind === 'contact'
                                ? `mt-6 inline-flex w-full items-center justify-center rounded-xl border ${HAIR} bg-white px-5 py-3 text-[15px] font-semibold ${INK} transition-colors hover:bg-[#F9FAFB]`
                                : `${primaryBtn} mt-6 w-full`}
                        >
                            {t(cta.labelKey, cta.label)}
                        </Link>
                        </div>
                    </div>
                );
            })}
        </div>
        </>
    );
}

/**
 * Owns the billing cycle so the receipt and the plan cards share it. Two
 * columns on lg: the receipt sticky on the left (flat, drop shadow), the
 * heading (`children`) and the plans stacked as full-width rows on the right.
 * Below lg the receipt sits above the plans. The receipt carries the GST note
 * only when the plan cards (with their own note) are not rendering.
 */
function PricingSection({ children }) {
    const { data: plans = [], isLoading, isError } = usePublicPlans();
    // Annual is the default; falls back to what the catalogue actually sells.
    const [cycle, setCycle] = useState('annual');
    const options = publicCycleOptions(plans);
    const gstRate = Number.isFinite(Number(plans[0]?.gstRate)) ? Number(plans[0].gstRate) : 18;
    const activeCycle = options.some(o => o.cycle === cycle) ? cycle : (options[0]?.cycle || 'monthly');
    const cardsRender = !isLoading && !isError && plans.length > 0;
    return (
        <div className="grid gap-12 lg:grid-cols-[22rem_1fr] lg:items-start">
            <div className="lg:sticky lg:top-28 lg:drop-shadow-xl" data-testid="pricing-receipt-wrap">
                <Receipt plans={plans} activeCycle={activeCycle} showGstNote={!cardsRender} gstRate={gstRate} />
            </div>
            <div className="min-w-0">
                {children}
                <div className="mt-10">
                    <Pricing
                        plans={plans}
                        isLoading={isLoading}
                        isError={isError}
                        options={options}
                        activeCycle={activeCycle}
                        onCycle={setCycle}
                        gstRate={gstRate}
                        layout="stack"
                    />
                </div>
            </div>
        </div>
    );
}

// ── Straight answers: a grouped accordion ─────────────────────────────────
function Answers({ groups }) {
    const { t } = useTranslation();
    const baseId = useId();
    const rootRef = useRef(null);
    const [open, setOpen] = useState('0-0');

    const buttons = () => Array.from(rootRef.current?.querySelectorAll('button[aria-expanded]') || []);
    const onKeyDown = (e) => {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
        if (!keys.includes(e.key)) return;
        const all = buttons();
        const i = all.indexOf(e.currentTarget);
        if (i < 0 || all.length === 0) return;
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? (i + 1) % all.length
            : e.key === 'ArrowUp' ? (i - 1 + all.length) % all.length
            : e.key === 'Home' ? 0 : all.length - 1;
        all[next].focus();
    };

    return (
        <div ref={rootRef} className="max-w-3xl space-y-12" data-testid="answers-accordion">
            {groups.map(({ label, items }, g) => (
                <div key={label} data-reveal>
                    <p className={`text-[13px] font-semibold ${MUTED}`}>{label}</p>
                    <div className={`mt-3 border-t ${HAIR}`}>
                        {items.map(({ q, a, soon }, i) => {
                            const key = `${g}-${i}`;
                            const isOpen = open === key;
                            const btnId = `${baseId}-b-${key}`;
                            const panelId = `${baseId}-p-${key}`;
                            return (
                                <div key={q} className={`border-b ${HAIR}`}>
                                    <h3 className={`${display} text-[20px] ${INK}`}>
                                        <button
                                            type="button"
                                            id={btnId}
                                            aria-expanded={isOpen}
                                            aria-controls={panelId}
                                            onClick={() => setOpen(isOpen ? null : key)}
                                            onKeyDown={onKeyDown}
                                            className="flex w-full items-center gap-3 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]/40"
                                        >
                                            <span className="flex-1">
                                                {q}
                                                {soon && (
                                                    <span className="ml-2 inline-block rounded-full bg-[#F2F4F7] px-2.5 py-0.5 align-middle font-sans text-[11px] font-semibold tracking-normal text-[#475467]" data-testid="coming-soon-pill">
                                                        {t('platform.answers.coming_soon', 'Coming soon')}
                                                    </span>
                                                )}
                                            </span>
                                            <ChevronDown
                                                size={18}
                                                className={`shrink-0 text-[#98A2B3] transition-transform duration-300 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </h3>
                                    <div
                                        id={panelId}
                                        role="region"
                                        aria-labelledby={btnId}
                                        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                                    >
                                        <div className="overflow-hidden" aria-hidden={!isOpen}>
                                            <p className={`pb-5 text-[15px] leading-relaxed ${MUTED}`}>{a}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────
const PlatformHome = () => {
    const { t } = useTranslation();
    const { isLoggedIn, user, isLoading } = useAuth();
    usePageMeta(PLATFORM_TITLE, PLATFORM_DESCRIPTION);
    useSmoothScroll();

    const heroRef = useRef(null);
    const stoppedRef = useRef(null);
    const onlyRef = useRef(null);
    const pricingRef = useRef(null);
    const faqRef = useRef(null);
    const finalRef = useRef(null);
    useReveal(heroRef);
    useReveal(stoppedRef);
    useReveal(onlyRef);
    useReveal(pricingRef);
    useReveal(faqRef);
    useReveal(finalRef);

    // The header clock: every section carries `data-clock`; the one in the
    // reading band (40% from the top) sets the time. Inside the evening band
    // the active stop's time wins (EveningTimeline reports it).
    const mainRef = useRef(null);
    const [clockSection, setClockSection] = useState({ id: 'top', time: '6:45 PM' });
    const [eveningTime, setEveningTime] = useState(null);
    useEffect(() => {
        const root = mainRef.current;
        if (!root || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') return undefined;
        let observer;
        try {
            observer = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const time = entry.target.getAttribute('data-clock');
                    if (time) setClockSection({ id: entry.target.id, time });
                }
            }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
            root.querySelectorAll('[data-clock]').forEach((el) => observer.observe(el));
        } catch { return undefined; }
        return () => { try { observer?.disconnect(); } catch { /* ignore */ } };
    }, []);
    const headerTime = clockSection.id === 'features' && eveningTime ? eveningTime : clockSection.time;

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
    const [fQr, fKds, fWaiter, fBooking, fWallet, fPay, fBranch, fInventory, fAnalytics, , fPage, fLang] = features;

    const steps = [
        [ClipboardEdit, t('platform.how.s1_title', 'Start your free trial'), t('platform.how.s1_body', 'Tell us your restaurant name, city and pick your web address. Takes about two minutes, no card needed.')],
        [BadgeCheck, t('platform.how.s2_title', 'Get instant access'), t('platform.how.s2_body', 'Your 14-day free trial starts right away — you’re signed in and live as soon as you register.')],
        [UtensilsCrossed, t('platform.how.s3_title', 'Set up menu & tables'), t('platform.how.s3_body', 'Sign in to the admin panel, add your menu, tables and staff accounts.')],
        [Printer, t('platform.how.s4_title', 'Print QR codes'), t('platform.how.s4_body', 'Download a QR code for each table, stick them up, and start taking orders.')],
    ];

    const faqs = [
        [t('platform.faq.q1', 'Do my guests need to install an app?'), t('platform.faq.a1', 'No. Guests scan the QR code on their table and order in their phone’s browser. Your staff use BestoDine in the browser too — on a phone, tablet or computer.')],
        [t('platform.faq.q2', 'How quickly can I start?'), t('platform.faq.a2', 'Right away. Register your restaurant and your 14-day free trial begins instantly — you’re signed in and can set up your menu and tables in minutes.')],
        [t('platform.faq.q3', 'Is there a free trial?'), t('platform.faq.a3', 'Yes — every new restaurant gets 14 days free with all Gold plan features, and no card is needed. Your data is kept safe when the trial ends, and you can choose a plan any time to continue. Not sure which plan fits? Request a demo and we’ll help you choose.')],
        [t('platform.faq.q4', 'Can I accept online payments?'), t('platform.faq.a4', 'Yes. BestoDine integrates with Razorpay for UPI, cards and net-banking, and your waiters can still settle cash bills at the table or counter.')],
        [t('platform.faq.q5', 'I have more than one outlet. Is that supported?'), t('platform.faq.a5', 'Yes — plans with multi-branch support let you manage several locations from one account, each with its own tables, staff and QR codes.')],
        [t('platform.faq.q6', 'What is my restaurant’s web address?'), t('platform.faq.a6', 'You choose it during registration, for example {{host}}. It becomes your public page with your menu, takeaway and booking options.', { host: exampleHost })],
    ];

    // The seven stops of one evening, each tied to a real screen where one exists.
    const stops = [
        {
            time: t('platform.evening.s1_time', '6:45 PM'),
            title: t('platform.evening.s1_title', 'A guest finds your page and books a table'),
            body: t('platform.evening.s1_body', 'Your restaurant has its own web page with the menu, hours and a booking button. The guest books from the phone; the table is held and nobody wrote anything in a register.'),
            kind: 'phone', src: '/landing/restaurant-page.webp',
            alt: t('platform.evening.s1_alt', 'A restaurant’s public BestoDine page on a phone, with menu, hours and a booking button'),
            bullets: [fPage, fBooking, fLang],
        },
        {
            time: t('platform.evening.s2_time', '7:02 PM'),
            title: t('platform.evening.s2_title', 'The table scans the QR, orders and pays from the phone'),
            body: t('platform.evening.s2_body', 'No app, no waiter waved down. The order lands against the right table with no KOT to rewrite, and the guest can pay by UPI before they leave.'),
            kind: 'phone', src: null,
            placeholder: [
                t('platform.evening.s2_ph1', 'The guest sees the menu in their own language, adds items to a cart and sends the order.'),
                t('platform.evening.s2_ph2', 'They can pay now by UPI or ask for the bill at the end.'),
            ],
            bullets: [fQr, fPay, fWallet],
        },
        {
            time: t('platform.evening.s3_time', '7:03 PM'),
            title: t('platform.evening.s3_title', 'The kitchen sees it'),
            body: t('platform.evening.s3_body', 'Every ticket appears on the kitchen screen the moment it is placed, with a timer per item. The floor sees the status change, so nobody walks back to ask.'),
            kind: 'desktop', src: '/landing/kitchen-display.webp',
            alt: t('platform.evening.s3_alt', 'The BestoDine kitchen display with live tickets and timers'),
            bullets: [fKds, fInventory],
        },
        {
            time: t('platform.evening.s4_time', '7:40 PM'),
            title: t('platform.evening.s4_title', 'The bill, UPI, and a tip that goes to staff'),
            body: t('platform.evening.s4_body', 'The GST bill is ready when the guest is. They pay by UPI, card or cash and can add a voluntary tip; tips are pooled by shift and paid out to your staff.'),
            kind: 'phone', src: null,
            placeholder: [
                t('platform.evening.s4_ph1', 'The guest sees the itemised bill with GST and taps to pay by UPI, card or at the counter.'),
                t('platform.evening.s4_ph2', 'A tip, if they wish, goes to the staff pool for that shift.'),
            ],
            bullets: [fPay, fWallet],
        },
        {
            time: t('platform.evening.s5_time', '8:15 PM'),
            title: t('platform.evening.s5_title', 'A waiter answers a table request'),
            body: t('platform.evening.s5_body', 'A table asks for water from the phone; the waiter’s app shows which table and who is on it. The captain sees every table by status and spots the one that has waited too long.'),
            kind: 'phone', src: '/landing/waiter-tables.webp',
            alt: t('platform.evening.s5_alt', 'The BestoDine waiter app showing tables by status on a phone'),
            bullets: [fWaiter, fQr],
        },
        {
            time: t('platform.evening.s6_time', '9:00 PM'),
            title: t('platform.evening.s6_title', 'A party-hall booking, with the advance taken'),
            body: t('platform.evening.s6_body', 'A family books the hall for Saturday: package, decoration, cake, parking. The advance is collected and the balance is due on the day, all inside the same system as the tables.'),
            kind: 'desktop', src: '/landing/admin-bookings.webp',
            alt: t('platform.evening.s6_alt', 'The BestoDine bookings dashboard with hall and table bookings'),
            bullets: [fBooking, fPay],
        },
        {
            time: t('platform.evening.s7_time', '11:30 PM'),
            title: t('platform.evening.s7_title', 'The owner reads the day’s numbers on the phone'),
            body: t('platform.evening.s7_body', 'Sales, orders, payments by method, what sold and what ran low, in one view before bed. Exports for the accountant are a tap away.'),
            kind: 'desktop', src: '/landing/admin-dashboard.webp',
            alt: t('platform.evening.s7_alt', 'The BestoDine owner dashboard with the day’s sales and orders'),
            bullets: [fAnalytics, fInventory, fBranch],
        },
    ];

    const stopped = [
        t('platform.stopped.i1', 'Billing software'),
        t('platform.stopped.i2', 'Booking register'),
        t('platform.stopped.i3', 'Stock sheet'),
        t('platform.stopped.i4', 'Loyalty card'),
        t('platform.stopped.i5', 'WhatsApp threads'),
    ];

    const only = [
        {
            title: t('platform.only.tips_title', 'Tips to staff'),
            body: t('platform.only.tips_body', 'Guests can add a voluntary tip when they pay, on the phone or at the counter. Tips are pooled by shift and paid out to the staff who worked it, with a record you can show. It is the legal substitute for the mandatory service charge that is no longer allowed.'),
            why: t('platform.only.tips_why', 'Why it matters: staff earn more and stay longer, and you stay on the right side of the rules.'),
        },
        {
            title: t('platform.only.banquet_title', 'Banquet and advance booking inside the POS'),
            body: t('platform.only.banquet_body', 'Halls, packages and add-ons live next to your tables, not in a separate diary. Take the deposit when the booking is made and the balance on the day. The kitchen and the floor see the event the same way they see a table.'),
            why: t('platform.only.banquet_why', 'Why it matters: the hall is often the most profitable room in the building, and it deserves the same system.'),
        },
        {
            title: t('platform.only.ops_title', 'The Operations Control Panel'),
            body: t('platform.only.ops_body', 'Tick how your restaurant actually works: no waiters, pay-first at the counter, self-service, token numbers instead of tables. The whole app follows, from the guest’s phone to the kitchen screen. Change it any evening without calling anyone.'),
            why: t('platform.only.ops_why', 'Why it matters: the product adapts to your service, not the other way round.'),
        },
    ];
    // One visual per differentiator: the tip as a bill line, then two real screens.
    const onlyVisuals = [
        <TipsVisual key="tips" />,
        <BrowserFrame key="banquet">
            <img src="/landing/admin-bookings.webp" alt={t('platform.evening.s6_alt', 'The BestoDine bookings dashboard with hall and table bookings')} width={1920} height={1080} loading="lazy" decoding="async" className="block h-auto w-full" />
        </BrowserFrame>,
        <BrowserFrame key="ops">
            <img src="/landing/ops-panel.webp" alt={t('platform.only.ops_title', 'The Operations Control Panel')} width={1374} height={724} loading="lazy" decoding="async" className="block h-auto w-full" />
        </BrowserFrame>,
    ];

    const answers = [
        ...faqs.map(([q, a]) => ({ q, a })),
        { q: t('platform.answers.q1', 'What if the internet drops?'), a: t('platform.answers.a1', 'Short drops are fine: printing catches up when the connection returns. In a long outage, fall back to paper slips and enter them afterwards. Full offline billing is not available yet.') },
        { q: t('platform.answers.q2', 'Do you take a commission?'), a: t('platform.answers.a2', 'No. 0% on your own orders, always. The only charge on online payments is the payment gateway’s own fee.') },
        { q: t('platform.answers.q3', 'Can I get Zomato/Swiggy orders in it?'), a: t('platform.answers.a3', 'Coming soon, it is on the roadmap. Today those orders stay in the aggregator apps.'), soon: true },
        { q: t('platform.answers.q4', 'Do you export to Tally?'), a: t('platform.answers.a4', 'Coming soon. Today you get full Excel/CSV exports of sales, payments and GST for your accountant.'), soon: true },
        { q: t('platform.answers.q5', 'Can I leave and take my data?'), a: t('platform.answers.a5', 'Yes. One-click export of your menu, orders, customers and bookings. Monthly plans cancel any time.') },
        { q: t('platform.answers.q6', 'Which languages?'), a: t('platform.answers.a6', 'English, Hindi and Marathi for guests today.') },
    ];
    // The twelve answers in three groups (indices into `answers` above):
    // running = guests app, start speed, multi-outlet, web address, internet drops, languages;
    // money = free trial, online payments, commission, data export; integrations = the two "soon" items.
    const answerGroups = [
        { label: t('platform.answers.group_running', 'Running the restaurant'), items: [0, 1, 4, 5, 6, 11].map((i) => answers[i]) },
        { label: t('platform.answers.group_money', 'Money'), items: [2, 3, 7, 10].map((i) => answers[i]) },
        { label: t('platform.answers.group_integrations', 'Integrations'), items: [8, 9].map((i) => answers[i]) },
    ];

    // The three differentiators step down the 12-column grid, each overlapping
    // the previous card's corner (the "stair"); later cards sit on top.
    const stair = [
        'lg:col-span-7 lg:col-start-1 lg:z-0',
        'lg:col-span-8 lg:col-start-5 lg:-mt-16 lg:z-10',
        'lg:col-span-7 lg:col-start-2 lg:-mt-16 lg:z-20',
    ];

    return (
        <div className={`min-h-screen overflow-x-clip bg-[#FCFCFD] ${INK} antialiased`}>
            <PlatformHeader onHome slot={<HeaderClock time={headerTime} />} />

            <main ref={mainRef}>
                {/* Hero, 6:45 PM — the promise in a narrow left column with the
                    quiet trust row under the buttons; on the right the device
                    cluster bleeding off the edge: the owner's report at the
                    back (the thing an owner cares about), the guest's phone in
                    front over its lower-left corner, the waiter's phone behind
                    its right edge, and the ticking clock card pinned to the
                    laptop's top-left corner. The diner search sits alone in a
                    row under the grid. */}
                <section id="top" ref={heroRef} className="scroll-mt-20 overflow-x-clip" data-clock="6:45 PM">
                    <div className={`${container} pb-16 pt-10 sm:pt-14`}>
                        <div className="grid gap-14 lg:grid-cols-[5fr_7fr] lg:items-center lg:gap-10">
                            <div className="max-w-xl" data-reveal>
                                <h1 className={`${display} text-5xl sm:text-6xl ${INK}`}>
                                    {t('platform.hero.title_a', 'Run your whole restaurant')}{' '}
                                    {t('platform.hero.title_b', 'from one place.')}
                                </h1>
                                <p className={`mt-6 text-[17px] leading-relaxed ${MUTED}`}>
                                    {t('platform.hero.subtitle', 'QR ordering at the table, a live kitchen display, waiter and captain apps, table and hall bookings, and online payments — all connected, all in real time.')}
                                </p>
                                <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                                    <Link to="/start-trial" className={primaryBtn}>
                                        {t('platform.cta.trial', 'Start 14-day free trial')} <ArrowRight size={18} aria-hidden="true" />
                                    </Link>
                                    <Link to="/request-demo" className={textLink}>{t('platform.cta.demo', 'Request a demo')}</Link>
                                </div>
                                <p className={`mt-6 text-[13px] ${MUTED}`}>
                                    {t('platform.hero.trial_note', '14 days free · No card needed · Start in minutes')}
                                    {' · '}
                                    {t('platform.hero.proof', 'No app for guests. No new hardware.')}
                                </p>
                                <DesktopDownloadLink className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold underline-offset-4 hover:underline ${MUTED}`}>
                                    {t('platform.hero.desktop_note', 'Counter or kitchen PC? Download the Windows desktop app')}
                                </DesktopDownloadLink>
                            </div>

                            <div className="relative mt-14 mb-12 pt-8 lg:my-0 lg:-mr-10 lg:pb-12 lg:pt-10 xl:-mr-16" data-reveal data-testid="hero-cluster">
                                {/* Waiter's phone: behind-right, slightly rotated, partly behind the laptop (lg only). */}
                                <div className="absolute -right-4 top-4 z-0 hidden w-[170px] rotate-[2.5deg] lg:block xl:w-[190px]">
                                    <PhoneFrame width="max-w-none">
                                        <img src={stops[4].src} alt={stops[4].alt} width={820} height={1775} loading="lazy" decoding="async" className="block h-auto w-full" />
                                    </PhoneFrame>
                                </div>
                                {/* Owner's report: the laptop at the back; cropped below lg. */}
                                <div className="relative z-10 ml-12 sm:ml-24 lg:ml-16">
                                    <div className="max-h-[300px] overflow-hidden rounded-xl sm:max-h-[420px] lg:max-h-none lg:overflow-visible">
                                        <BrowserFrame className="shadow-[0_24px_48px_-24px_rgba(16,24,40,0.25)]">
                                            <img
                                                src={stops[6].src}
                                                alt={stops[6].alt}
                                                width={1920}
                                                height={1080}
                                                loading="eager"
                                                fetchPriority="high"
                                                decoding="async"
                                                className="block h-auto w-full"
                                            />
                                        </BrowserFrame>
                                    </div>
                                </div>
                                {/* Ticking clock card on the laptop's top-left corner, above every device. */}
                                <div className="absolute left-4 top-0 z-30 sm:left-12 lg:left-4 lg:top-0">
                                    <div className={`rounded-2xl border ${HAIR} bg-white px-5 py-3 shadow-[0_8px_24px_-12px_rgba(16,24,40,0.18)]`}>
                                        <Clock ticking size="text-3xl sm:text-4xl" />
                                    </div>
                                </div>
                                {/* Guest's phone: in front, over the laptop's lower-left corner. */}
                                <div className="absolute bottom-0 left-0 z-20 w-[130px] translate-y-6 sm:w-[170px] lg:bottom-6 lg:w-[190px] lg:translate-y-8 xl:w-[230px]">
                                    <PhoneFrame width="max-w-none" className="max-h-[260px] sm:max-h-[340px] lg:max-h-[300px] xl:max-h-[380px] shadow-[0_16px_40px_-20px_rgba(16,24,40,0.35)]">
                                        <img src={stops[0].src} alt={stops[0].alt} width={820} height={1775} loading="lazy" decoding="async" className="block h-auto w-full" />
                                    </PhoneFrame>
                                </div>
                            </div>
                        </div>
                        <div className="mt-16 lg:mt-24" data-reveal>
                            <RestaurantSearch />
                        </div>
                    </div>
                </section>

                {/* The evening, 7:02–11:30 — a full-bleed warm band. The pain lives
                    in the rush, so the product is shown as one evening, stop by
                    stop: an hour ruler, the captions, and one sticky frame that
                    cross-fades to the real screen each person sees. Keeps
                    id=features so the header's "Features" anchor lands here. */}
                <section id="features" className="scroll-mt-20 border-y border-[#EAD9C6] bg-[#FFF8F0] py-20 sm:py-28" data-clock={eveningTime || stops[0].time}>
                    <div className={container}>
                        <div className="max-w-2xl">
                            <h2 className={`${display} text-4xl sm:text-5xl ${INK}`}>{t('platform.evening.title', 'One evening, start to finish')}</h2>
                            <p className={`mt-4 text-[17px] leading-relaxed ${MUTED}`}>
                                {t('platform.evening.intro', 'Seven moments in a normal evening, and what each person sees. Guest, kitchen, waiter, owner: one system, no retyping.')}
                            </p>
                        </div>
                        <div className="mt-16">
                            <EveningTimeline stops={stops} onActiveTime={setEveningTime} />
                        </div>
                    </div>
                </section>

                {/* What you stopped doing, 10:00 PM — one centred column: the five
                    names set huge and struck through one by one over a ghost of
                    the owner dashboard; then the four live-in steps as one thin
                    horizontal strip. Keeps id=how-it-works. */}
                <section id="how-it-works" ref={stoppedRef} className="scroll-mt-20 bg-white py-20 sm:py-28" data-clock="10:00 PM">
                    <div className={container}>
                        <div className={`relative overflow-hidden rounded-3xl border ${HAIR} bg-[#FCFCFD]`} data-reveal>
                            <img
                                src="/landing/admin-dashboard.webp"
                                alt=""
                                aria-hidden="true"
                                width={1920}
                                height={1080}
                                loading="lazy"
                                decoding="async"
                                className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover object-top opacity-[0.06] blur-sm"
                            />
                            <div className="relative mx-auto max-w-4xl px-6 py-14 text-center sm:px-10 sm:py-20">
                                <h2 className={`${display} text-2xl ${INK}`}>{t('platform.stopped.title', 'What you stopped doing')}</h2>
                                <div className="mt-8">
                                    <StruckList items={stopped} />
                                </div>
                                <p className={`mx-auto mt-10 max-w-md text-[17px] leading-relaxed ${MUTED}`}>
                                    {t('platform.stopped.intro', 'Five tools the owner kept before. One system now, and nothing to copy from one to the other.')}
                                </p>
                            </div>
                        </div>
                        <div className="mt-14" data-reveal>
                            <h3 className={`${display} text-2xl ${INK}`}>{t('platform.how.title', 'Live in four steps')}</h3>
                            <ol
                                className={`mt-6 grid grid-cols-2 divide-x divide-[#EAECF0] border-y ${HAIR} lg:grid-cols-4 max-lg:[&>*:nth-child(2)]:border-e-0 max-lg:[&>*:nth-child(n+3)]:border-t max-lg:[&>*:nth-child(n+3)]:border-t-[#EAECF0] max-lg:[&>*:nth-child(odd)]:pl-0`}
                                data-testid="steps-strip"
                            >
                                {steps.map(([, title, body], i) => (
                                    <li key={title} className="px-5 py-6 lg:px-6 lg:first:pl-0">
                                        <span className="bd-clock text-[20px] text-[#FE8301]" aria-hidden="true">{i + 1}</span>
                                        <p className={`mt-3 text-[15px] font-semibold ${INK}`}>
                                            <span className="sr-only">{t('platform.how.step', 'Step {{n}}:', { n: i + 1 })} </span>{title}
                                        </p>
                                        <p className={`mt-1 text-[14px] leading-relaxed ${MUTED}`}>{body}</p>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    </div>
                </section>

                {/* Three things only BestoDine does, 10:30 PM — the "stair": three
                    cards stepping down a 12-column grid, each overlapping the
                    last one's corner. Tips to staff (a typographic bill line),
                    banquet booking inside the POS, and the Operations Control
                    Panel that bends the product to each restaurant. */}
                <section ref={onlyRef} className={`overflow-x-clip border-t ${HAIR} bg-[#F9FAFB] py-20 sm:py-28`} aria-labelledby="only-title" data-clock="10:30 PM">
                    <div className={container}>
                        <h2 id="only-title" className={`${display} max-w-2xl text-4xl sm:text-5xl ${INK}`}>{t('platform.only.title', 'Three things only BestoDine does')}</h2>
                        <div className="mt-14 space-y-6 lg:mt-20 lg:grid lg:grid-cols-12 lg:space-y-0" data-testid="only-stair">
                            {only.map(({ title, body, why }, i) => (
                                <div
                                    key={title}
                                    data-testid="only-card"
                                    data-reveal
                                    className={`relative grid overflow-hidden rounded-3xl border ${HAIR} bg-white shadow-[0_12px_32px_-16px_rgba(16,24,40,0.18)] md:grid-cols-[1fr_1.1fr] ${stair[i]}`}
                                >
                                    <div className={`p-8 sm:p-10 ${i === 1 ? 'md:order-last' : ''}`}>
                                        <h3 className={`${display} text-2xl sm:text-3xl ${INK}`}>{title}</h3>
                                        <p className={`mt-4 text-[15px] leading-relaxed ${INK}`}>{body}</p>
                                        <p className={`mt-4 text-[14px] leading-relaxed ${MUTED}`}>{why}</p>
                                    </div>
                                    <div className={`${i === 0 ? 'p-3' : 'flex items-center bg-[#F2F4F7] p-4 sm:p-5'} ${i === 1 ? 'md:order-first' : ''}`}>
                                        {onlyVisuals[i]}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Pricing, 11:45 PM — objection 2 (what will it cost next year)
                    answered as a receipt: flat published price, ₹0 commission,
                    ₹0 per device, ₹0 renewal increase, export any time. The
                    receipt stays put on the left while the plan rows scroll. */}
                <section id="pricing" ref={pricingRef} className={`scroll-mt-20 border-t ${HAIR} bg-white py-20 sm:py-28`} data-clock="11:45 PM">
                    <div className={container}>
                        <PricingSection>
                            <div className="max-w-2xl" data-reveal>
                                <h2 className={`${display} text-4xl sm:text-5xl ${INK}`}>{t('platform.pricing.title', 'Simple plans that grow with you')}</h2>
                                <p className={`mt-4 text-[17px] leading-relaxed ${MUTED}`}>
                                    {t('platform.pricing.subtitle', 'Pick a plan when you register — you can change it later from your admin panel.')}
                                </p>
                            </div>
                        </PricingSection>
                    </div>
                </section>

                {/* Straight answers, after close — the distrust pain: internet
                    drops, commission, lock-in, languages, and objection 3
                    (Zomato/Swiggy and Tally) answered honestly as "coming soon".
                    One narrow column, three groups, one open at a time. */}
                <section id="faq" ref={faqRef} className={`scroll-mt-20 border-t ${HAIR} bg-white py-20 sm:py-28`} data-clock={t('platform.clock.after_close', 'After close')}>
                    <div className={container}>
                        <div className="mx-auto max-w-3xl">
                            <h2 className={`${display} text-5xl sm:text-6xl ${INK}`} data-reveal>{t('platform.answers.title', 'Straight answers')}</h2>
                            <div className="mt-12">
                                <Answers groups={answerGroups} />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Closing, tomorrow 7:00 PM — a warm band: the same clock, set
                    for tomorrow's service, beside the same two CTAs. */}
                <section ref={finalRef} className="w-full overflow-x-clip border-t border-[#EAD9C6] bg-[#FFF8F0] py-20 sm:py-28" aria-labelledby="final-title" data-clock={t('platform.clock.tomorrow', 'Tomorrow, 7:00 PM')}>
                    <div className={`${container} grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]`} data-reveal>
                        <Clock prefix={t('platform.final.clock', 'Tomorrow,')} size="text-[clamp(4rem,11vw,8rem)]" />
                        <div>
                            <h2 id="final-title" className={`${display} max-w-2xl text-4xl sm:text-5xl ${INK}`}>
                                {t('platform.final.title', 'Ready to take orders the modern way?')}
                            </h2>
                            <p className={`mt-5 max-w-xl text-[17px] leading-relaxed ${MUTED}`}>
                                {t('platform.final.body', 'Start your 14-day free trial today — no card needed, and we’ll help you get set up.')}
                            </p>
                            <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                                <Link to="/start-trial" className={primaryBtn}>
                                    {t('platform.cta.trial', 'Start 14-day free trial')} <ArrowRight size={18} aria-hidden="true" />
                                </Link>
                                <Link to="/request-demo" className={textLink}>{t('platform.cta.demo', 'Request a demo')}</Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <PlatformFooter />
        </div>
    );
};

export default PlatformHome;
