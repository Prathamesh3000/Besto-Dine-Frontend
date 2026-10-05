/**
 * Customer inactivity tracking (QA N14).
 *
 * Customer logins end after CUSTOMER_IDLE_TIMEOUT_MINUTES (server, default
 * 60) without use. The customer app polls the API in the background, so
 * "a request happened" is not the same as "the customer used the app":
 * this module records real interaction (tap, key, scroll-wheel) and
 * api.js sends `idleMs` with every customer token refresh so the server
 * can tell the difference. Shared across tabs via localStorage.
 *
 * Focus / visibility changes are deliberately NOT activity — coming back
 * to a tab after two hours must not count as having used it.
 */
const KEY = 'bd_last_activity';
const WRITE_THROTTLE_MS = 10 * 1000;

/** Client-side mirror of the server default (only used to decide when to check). */
export const CUSTOMER_IDLE_TIMEOUT_MS =
    (Number(import.meta.env?.VITE_CUSTOMER_IDLE_TIMEOUT_MINUTES) > 0
        ? Number(import.meta.env.VITE_CUSTOMER_IDLE_TIMEOUT_MINUTES)
        : 60) * 60 * 1000;

// Page load counts as activity only when nothing is recorded yet (first
// visit); otherwise the stored timestamp from the last interaction wins.
let _last = Date.now();
let _lastWrite = 0;
try {
    const stored = Number(localStorage.getItem(KEY));
    if (Number.isFinite(stored) && stored > 0) _last = stored;
    else localStorage.setItem(KEY, String(_last));
} catch { /* storage blocked */ }

export function markActivity() {
    const now = Date.now();
    _last = now;
    if (now - _lastWrite > WRITE_THROTTLE_MS) {
        _lastWrite = now;
        try { localStorage.setItem(KEY, String(now)); } catch { /* ignore */ }
    }
}

/** Milliseconds since the customer last interacted (any tab). */
export function msSinceActivity() {
    let last = _last;
    try {
        const stored = Number(localStorage.getItem(KEY));
        if (Number.isFinite(stored) && stored > last) last = stored;
    } catch { /* ignore */ }
    return Math.max(0, Date.now() - last);
}

let _started = false;
export function startActivityTracking() {
    if (_started || typeof window === 'undefined') return;
    _started = true;
    const opts = { passive: true, capture: true };
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
        window.addEventListener(ev, markActivity, opts);
    }
}
