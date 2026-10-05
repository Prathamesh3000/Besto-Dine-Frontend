/**
 * Shareable customer entry links — /<restaurant-slug>[/<branch-slug>].
 *
 * Opening one shows that restaurant's public landing page
 * (Pages/Restaurant/RestaurantLandingPage.jsx), whose actions drop the
 * customer straight into that restaurant (and branch) without ever
 * showing the platform-wide restaurant list. Legacy /r/... links
 * redirect there. Super Admin and the tenant admin panel
 * hand these out as copyable links and QR posters.
 *
 * VITE_PUBLIC_APP_URL pins the host baked into links and QR codes, so a
 * link generated while browsing on localhost (or an admin-only host)
 * still points customers at the real app. Falls back to the current
 * origin when unset.
 */
export function getPublicAppOrigin() {
    const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    return configured || window.location.origin;
}

/** True for hostnames only this machine can reach (localhost, 127.x, ::1, 0.0.0.0). */
export function isLoopbackHostname(hostname) {
    const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0' || /^127\./.test(h);
}

/** True when `origin` (a URL string) points at the local machine. */
export function isLoopbackOrigin(origin) {
    try {
        return isLoopbackHostname(new URL(origin).hostname);
    } catch {
        return false;
    }
}

/**
 * Validate + normalise a user-typed base URL: must be http(s), no
 * credentials/query/hash. Returns the origin (+ optional path prefix, no
 * trailing slash) or null when invalid.
 */
export function normalizeBaseUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    let u;
    try {
        u = new URL(raw);
    } catch {
        return null;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || u.username || u.password || u.search || u.hash) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

// Per-browser override for the host baked into printed table QR codes —
// lets an admin browsing on localhost print codes that point at the
// machine's LAN address (or the real domain) without rebuilding.
const QR_BASE_KEY = 'bd.qrBaseUrl';

export function getQrBaseOverride() {
    try {
        return normalizeBaseUrl(window.localStorage.getItem(QR_BASE_KEY));
    } catch {
        return null;
    }
}

export function setQrBaseOverride(url) {
    try {
        if (url) window.localStorage.setItem(QR_BASE_KEY, url);
        else window.localStorage.removeItem(QR_BASE_KEY);
    } catch { /* storage blocked — override lasts for this modal only */ }
}

/** Base URL for table QR codes: per-browser override, else the public app origin. */
export function getQrBaseUrl() {
    return getQrBaseOverride() || getPublicAppOrigin();
}

/** Full URL a table QR encodes. */
export function tableScanLink(qrToken, base = getQrBaseUrl()) {
    if (!qrToken) return '';
    return `${String(base).replace(/\/+$/, '')}/scan/${encodeURIComponent(qrToken)}`;
}

/** Full customer URL for a restaurant, optionally pinned to one branch. */
export function restaurantLink(slug, branchSlug = null) {
    if (!slug) return '';
    let path = `/${encodeURIComponent(slug)}`;
    if (branchSlug) path += `/${encodeURIComponent(branchSlug)}`;
    return `${getPublicAppOrigin()}${path}`;
}
