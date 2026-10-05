/**
 * LAN-aware backend URL resolution.
 *
 * Dev `.env` files usually carry VITE_API_URL=http://localhost:5000/api/v1.
 * That works on the dev machine, but a phone that opens the app via the
 * machine's LAN address (http://192.168.x.x:5173 — `vite --host`) would
 * then call ITS OWN localhost for the API and get nothing. When the
 * configured host is loopback but the page is served from a different
 * host, swap in window.location.hostname, keeping protocol/port/path —
 * the backend runs on the same machine that served the page.
 *
 * Production builds point VITE_API_URL at a real host, so this is a no-op
 * there.
 */
const LOOPBACK = (h) => {
    const host = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
    return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0' || /^127\./.test(host);
};

export function swapLoopbackHost(url) {
    if (!url || typeof window === 'undefined' || !window.location?.hostname) return url;
    const pageHost = window.location.hostname;
    if (LOOPBACK(pageHost)) return url; // page itself is local — localhost API is reachable
    let u;
    try {
        u = new URL(url);
    } catch {
        return url; // relative URL ('/api/v1') — already same-origin
    }
    if (!LOOPBACK(u.hostname)) return url;
    u.hostname = pageHost;
    // URL() appends a trailing '/' to a bare origin; keep the caller's shape.
    const out = u.toString();
    return url.endsWith('/') ? out : out.replace(/\/$/, '');
}

/** VITE_API_URL with the loopback→LAN swap applied (raw, unversioned). */
export function configuredApiUrl(fallback = '') {
    return swapLoopbackHost(import.meta.env.VITE_API_URL || fallback);
}

/** Backend origin for /uploads/... assets (VITE_API_URL minus its /api path). */
export function backendOrigin() {
    return configuredApiUrl('').replace(/\/api.*$/, '');
}
