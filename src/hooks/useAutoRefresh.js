import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Keep a live screen fresh when the realtime socket can't be trusted.
 *
 * Sockets + a backup poll already cover the "app open and in front" case.
 * What they miss is a tab/phone that was in the BACKGROUND: browsers throttle
 * or freeze timers there and a mobile socket silently dies, so the kitchen /
 * waiter / admin screen shows an old snapshot until someone reloads. This hook
 * re-runs `refresh` when:
 *   - the tab becomes visible again after being hidden >= `minHiddenMs`
 *   - the window regains focus after being away >= `minHiddenMs`
 *   - the browser comes back online
 *   - the page is restored from the back/forward cache (`pageshow`)
 *   - every `intervalMs` while the tab is VISIBLE (paused while hidden).
 *     Omit `intervalMs` when the screen already has its own poll.
 *
 * Refreshes are throttled (`throttleMs`) so a burst of focus/visibility events
 * makes one request. The callback is held in a ref, so an inline function is
 * fine and never re-subscribes the listeners.
 *
 *   useAutoRefresh(() => refetchOrders(), { intervalMs: 60_000 });
 *
 * @param {() => void} refresh
 * @param {{ intervalMs?: number, minHiddenMs?: number, throttleMs?: number, enabled?: boolean }} [opts]
 */
export default function useAutoRefresh(refresh, opts = {}) {
    const { intervalMs = 0, minHiddenMs = 15_000, throttleMs = 3_000, enabled = true } = opts;
    const refreshRef = useRef(refresh);
    useLayoutEffect(() => { refreshRef.current = refresh; });

    useEffect(() => {
        if (!enabled || typeof document === 'undefined') return undefined;

        let lastRun = 0;
        let awaySince = document.visibilityState === 'hidden' ? Date.now() : null;

        const run = () => {
            const now = Date.now();
            if (now - lastRun < throttleMs) return;
            lastRun = now;
            try { refreshRef.current?.(); } catch { /* a failing refresh must not break the page */ }
        };
        const away = () => { if (awaySince == null) awaySince = Date.now(); };
        const back = () => {
            const wasAway = awaySince != null ? Date.now() - awaySince : 0;
            awaySince = null;
            if (wasAway >= minHiddenMs) run();
        };

        const onVisibility = () => (document.visibilityState === 'hidden' ? away() : back());
        const onBlur = () => away();
        const onFocus = () => back();
        const onOnline = () => run();
        const onPageShow = (e) => { if (e && e.persisted) run(); };

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', onOnline);
        window.addEventListener('pageshow', onPageShow);

        let timer = null;
        if (intervalMs > 0) {
            timer = setInterval(() => {
                if (document.visibilityState === 'visible') run();
            }, intervalMs);
        }

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('pageshow', onPageShow);
            if (timer) clearInterval(timer);
        };
    }, [enabled, intervalMs, minHiddenMs, throttleMs]);
}
