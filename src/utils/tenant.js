/**
 * Active tenant tracking for the customer-facing app.
 *
 * Phase 1 of the SaaS migration scopes every API call by the current
 * tenant. Customer requests carry that tenant via the
 * `X-Restaurant-Slug` HTTP header (set by the api.js request
 * interceptor). This module is the single source of truth for *which*
 * slug to send.
 *
 * Storage: localStorage key `activeTenant` holds a JSON blob:
 *   { slug, name, _id, features, branch, pickedAt }
 *
 * Phase 2.5: `features` is a flat { key: boolean } map derived from the
 * tenant's current subscription + overrides. Populated at pick-time from
 * the `/public/restaurants/:slug` response so the customer UI can hide
 * buttons (Wallet, Bookings, Coupons) the tenant hasn't paid for —
 * instead of letting the customer tap and hit a 403. The backend gate
 * remains the source of truth; this is a UX optimization, not a
 * security boundary.
 *
 * Phase 6 step 5: `branch` is an optional `{ _id, name, slug }` blob
 * for the chosen physical location within a multi-branch tenant. Set
 * at QR scan time (the table inherits its branch) or via an explicit
 * branch picker. When non-null, the api.js interceptor sends an
 * `X-Branch-Id` header on every customer request and the backend
 * scopes menu/category queries to that branch (PLUS tenant-level
 * shared items).
 *
 * The blob is intentionally tiny — never store sensitive tenant config
 * here, just enough to render the header and submit the right slug.
 */

const STORAGE_KEY = 'activeTenant';

let inMemoryCache = null;
let cacheLoaded = false;

const subscribers = new Set();

function readFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.slug !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}

function notifySubscribers() {
    for (const fn of subscribers) {
        try { fn(inMemoryCache); } catch { /* ignore subscriber errors */ }
    }
}

/** Returns the active tenant blob, or null if none picked yet. */
export function getActiveTenant() {
    if (!cacheLoaded) {
        inMemoryCache = readFromStorage();
        cacheLoaded = true;
    }
    return inMemoryCache;
}

/** Returns just the slug string, or null. Cheap — used by the api.js request interceptor on every request. */
export function getActiveTenantSlug() {
    const t = getActiveTenant();
    return t?.slug || null;
}

/**
 * Where a customer-facing "home" / "back" / exit action should land: the
 * active restaurant's public page (/<slug>) when a tenant is picked, else
 * the BestoDine platform home (`/`). `/` used to render the tenant's home
 * page; it is now the platform marketing page, so customer flows that
 * meant "back to the restaurant" must use this instead of a bare '/'.
 */
export function activeRestaurantPath() {
    const slug = getActiveTenantSlug();
    return slug ? `/${encodeURIComponent(slug)}` : '/';
}

/**
 * Phase 6 step 5 — returns the active branch _id for the customer's
 * current session, or null if no branch has been picked yet (single-
 * location tenants, pre-Phase-6 cached blobs, etc.). Used by the
 * api.js request interceptor to set X-Branch-Id on customer calls.
 */
export function getActiveBranchId() {
    const t = getActiveTenant();
    return t?.branch?._id || null;
}

/** Returns the active branch blob ({_id, name, slug}) or null. */
export function getActiveBranch() {
    const t = getActiveTenant();
    return t?.branch || null;
}

/**
 * Persist a new active tenant. Pass an object that at minimum has a
 * `slug` field — `name`, `_id`, `features`, `branch`, and `branding`
 * are optional but recommended.
 *
 * `branding` (Phase 7.4) is the customer-facing white-label blob:
 *   { logoUrl, primaryColor, faviconUrl, emailFromName, tagline }
 * The active-tenant subscriber in App.jsx applies it as CSS vars
 * and document-level effects.
 */
export function setActiveTenant({ slug, name, _id, features, branch, branding } = {}) {
    if (!slug || typeof slug !== 'string') {
        throw new Error('setActiveTenant requires a string slug');
    }
    const blob = {
        slug: slug.toLowerCase().trim(),
        name: name || '',
        _id: _id || null,
        features: features && typeof features === 'object' ? { ...features } : {},
        // Phase 6 step 5 — branch is optional. When set, downstream
        // customer requests will scope menus to this branch + the
        // tenant-level shared menu.
        branch: branch && branch._id ? {
            _id: branch._id,
            name: branch.name || '',
            slug: branch.slug || '',
        } : null,
        // Phase 7.4 — white-label branding. Stored as-is so the
        // App.jsx tenant-subscriber can apply primary colour, swap
        // favicon, and update <title> when this changes.
        branding: branding && typeof branding === 'object' ? {
            logoUrl: branding.logoUrl || '',
            primaryColor: branding.primaryColor || '',
            faviconUrl: branding.faviconUrl || '',
            emailFromName: branding.emailFromName || '',
            tagline: branding.tagline || '',
        } : null,
        pickedAt: new Date().toISOString(),
    };
    inMemoryCache = blob;
    cacheLoaded = true;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(blob));
    } catch { /* quota / private mode — fall back to in-memory only */ }
    notifySubscribers();
    return blob;
}

/**
 * Update ONLY the branch on the existing tenant blob. Used when the
 * customer changes branches mid-session without re-picking the
 * tenant. No-op if no tenant is currently active.
 */
export function setActiveBranch(branch) {
    const t = getActiveTenant();
    if (!t) return null;
    const next = {
        ...t,
        branch: branch && branch._id ? {
            _id: branch._id,
            name: branch.name || '',
            slug: branch.slug || '',
        } : null,
    };
    inMemoryCache = next;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    notifySubscribers();
    return next;
}

/**
 * Returns the features map for the active tenant, or an empty object
 * if none picked. Callers should treat missing keys as "unknown, allow"
 * — the backend gate is still authoritative.
 */
export function getActiveTenantFeatures() {
    const t = getActiveTenant();
    return (t && t.features) || {};
}

/**
 * Is a given feature enabled for the active tenant?
 *
 * Returns `true` if the flag is explicitly true, OR if we don't yet
 * know about the tenant's features at all (pre-Phase-2.5 cached tenant,
 * or the public endpoint didn't return a `features` object). The
 * "unknown → allow" default keeps legacy UIs working; the backend gate
 * will still reject the actual request if the feature is locked.
 */
export function isFeatureEnabled(key) {
    const t = getActiveTenant();
    if (!t) return true;                       // no tenant picked yet — don't hide anything
    const feats = t.features;
    if (!feats || Object.keys(feats).length === 0) return true;  // legacy blob
    return feats[key] === true;
}

/** Forget the active tenant — used when switching away or signing out. */
export function clearActiveTenant() {
    inMemoryCache = null;
    cacheLoaded = true;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    notifySubscribers();
}

/**
 * Subscribe to active-tenant changes. Returns an unsubscribe function.
 * Used by AuthContext / header components that need to re-render when
 * the tenant changes.
 */
export function subscribeActiveTenant(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
}
