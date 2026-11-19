import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

/**
 * Lenis smooth scroll driven by the GSAP ticker, wired into ScrollTrigger.
 *
 * Mounted once by the landing page. Everything is guarded so that the hook
 * is a no-op (and never throws) when:
 *   - `enabled` is false,
 *   - window / matchMedia are missing (SSR, jsdom),
 *   - the visitor prefers reduced motion.
 *
 * Inner scrollable panels opt out of smoothing with `data-lenis-prevent`.
 * Clicks on `a[href^="#"]` are delegated to `lenis.scrollTo` so the header
 * anchors glide to their sections (offset for the fixed header) and the
 * hash is updated without the native jump.
 */

let currentLenis = null;

/** The live Lenis instance (or null when smooth scroll is off). */
export function getLenis() {
    return currentLenis;
}

export function prefersReducedMotion() {
    try {
        return typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && !!window.matchMedia('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
        return false;
    }
}

function registerScrollTrigger() {
    try {
        gsap.registerPlugin(ScrollTrigger);
    } catch {
        /* already registered or unavailable — harmless */
    }
}

export default function useSmoothScroll(enabled = true) {
    useEffect(() => {
        if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
        if (prefersReducedMotion()) return undefined;

        let lenis;
        try {
            registerScrollTrigger();
            lenis = new Lenis({ duration: 1.15, lerp: 0.1, smoothWheel: true });
        } catch {
            return undefined;
        }
        currentLenis = lenis;

        const previousRestoration = (() => {
            try { return window.history?.scrollRestoration; } catch { return undefined; }
        })();
        try { if (window.history) window.history.scrollRestoration = 'manual'; } catch { /* ignore */ }

        const onLenisScroll = () => { try { ScrollTrigger.update(); } catch { /* ignore */ } };
        lenis.on('scroll', onLenisScroll);

        const tick = (time) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);

        const onClick = (event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            const anchor = event.target?.closest?.('a[href^="#"]');
            if (!anchor) return;
            const href = anchor.getAttribute('href') || '';
            if (href.length < 2) return; // bare "#" – leave it alone
            let target;
            try { target = document.querySelector(href); } catch { target = null; }
            if (!target) return;
            event.preventDefault();
            lenis.scrollTo(target, { offset: -72, duration: 1.2 });
            try { window.history.replaceState(window.history.state, '', href); } catch { /* ignore */ }
        };
        document.addEventListener('click', onClick);

        return () => {
            document.removeEventListener('click', onClick);
            gsap.ticker.remove(tick);
            try { lenis.off('scroll', onLenisScroll); } catch { /* ignore */ }
            try { lenis.destroy(); } catch { /* ignore */ }
            if (currentLenis === lenis) currentLenis = null;
            try {
                if (window.history && previousRestoration) window.history.scrollRestoration = previousRestoration;
            } catch { /* ignore */ }
        };
    }, [enabled]);
}
