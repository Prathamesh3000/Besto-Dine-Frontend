// Auth storage partitioned by "audience" (platform vs staff vs customer).
//
// localStorage is shared across every tab of the same origin. The app
// used a single `token` / `user` key for both the customer and the
// staff flow, so logging a chef in (tab B) overwrote the customer's
// token (tab A) — the customer tab then silently "became" the chef on
// its next /auth/me refresh, and a logout in one flow tore down the
// other (the cross-tab BroadcastChannel made that worse).
//
// The same collision later bit the Super Admin: it shared the staff keys
// with every tenant role, so a Super Admin who signed in as a freshly
// approved hotel admin in tab B turned tab A's platform console into a
// hotel-admin session (every /superadmin call → 403 "Super Admin only").
//
// Fix: a customer, a tenant staff member and a Super Admin can all be
// logged in side-by-side in the same browser. Three audiences:
//   - 'platform' (/superadmin/*)              → `platform_token` / `platform_user` / `platform_refresh_token`
//   - 'staff'    (/admin, /waiter, /chef, …)  → `staff_token` / `staff_user` / `staff_refresh_token`
//   - 'customer' (everything else)            → legacy `token` / `user` / `refresh_token`
// Customer keeps the legacy keys on purpose so existing customer
// sessions survive the upgrade and every customer-only file
// (OTP, ScanTable, kiosk) keeps working untouched.
//
// Shared entry pages (/staff-login, /force-change-password) serve both
// the Super Admin and tenant staff, so their path alone can't name the
// audience. There the audience is the tab's "entry audience" (see
// below): the staff-side workspace this tab last used, or the one the
// login response's role picked (audienceForUser). Default: 'staff'.

export const AUDIENCES = ['platform', 'staff', 'customer'];
/** Audiences that sign in via /staff-login (everything but customers). */
export const STAFF_SIDE_AUDIENCES = ['platform', 'staff'];

const PLATFORM_PREFIXES = ['/superadmin'];

const TENANT_STAFF_PREFIXES = [
    '/admin',
    '/chef',
    '/waiter',
    '/captain',
    '/kitchen',
];

// Pages both the Super Admin and tenant staff land on.
export const SHARED_STAFF_ENTRY_PATHS = ['/staff-login', '/force-change-password'];

const KEYS = {
    platform: { token: 'platform_token', user: 'platform_user', refresh: 'platform_refresh_token' },
    staff:    { token: 'staff_token',    user: 'staff_user',    refresh: 'staff_refresh_token' },
    customer: { token: 'token',          user: 'user',          refresh: 'refresh_token' },
};

/** Storage key names for an audience (unknown audiences → customer). */
export function storageKeysFor(aud) {
    return KEYS[aud] || KEYS.customer;
}

const matches = (path, prefixes) => prefixes.some(p => path === p || path.startsWith(`${p}/`));

export function isSharedStaffEntryPath(pathname) {
    const path = typeof pathname === 'string' ? pathname : '';
    return matches(path, SHARED_STAFF_ENTRY_PATHS);
}

/**
 * Pure path → audience mapping. Shared entry pages map to 'staff' here;
 * use currentAudience() for the tab-aware answer on those pages.
 */
export function audienceForPath(pathname) {
    const path = typeof pathname === 'string' ? pathname : '';
    if (matches(path, PLATFORM_PREFIXES)) return 'platform';
    if (matches(path, TENANT_STAFF_PREFIXES) || matches(path, SHARED_STAFF_ENTRY_PATHS)) return 'staff';
    return 'customer';
}

/** Which audience a signed-in user's session belongs to. */
export function audienceForUser(user) {
    const role = user?.role;
    if (!role) return null;
    if (role === 'superadmin') return 'platform';
    if (role === 'customer') return 'customer';
    return 'staff';
}

/** Login page for an audience. */
export function loginPathForAudience(aud) {
    return STAFF_SIDE_AUDIENCES.includes(aud) ? '/staff-login' : '/login';
}

// ─── Tab entry audience (shared entry pages) ────────────────────────────────
// sessionStorage is per-tab, which is exactly the scope we need: tab A
// (Super Admin) and tab B (hotel admin) can each sit on /staff-login or
// /force-change-password and still read their own session.
const ENTRY_AUDIENCE_KEY = 'bd_entry_audience';

export function getEntryAudience() {
    try {
        const v = sessionStorage.getItem(ENTRY_AUDIENCE_KEY);
        return STAFF_SIDE_AUDIENCES.includes(v) ? v : null;
    } catch { return null; }
}

export function setEntryAudience(aud) {
    if (!STAFF_SIDE_AUDIENCES.includes(aud)) return;
    try {
        if (sessionStorage.getItem(ENTRY_AUDIENCE_KEY) !== aud) sessionStorage.setItem(ENTRY_AUDIENCE_KEY, aud);
    } catch { /* ignore */ }
}

function parseUser(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/**
 * Resolve the audience of a shared entry page. Pure (storage passed in)
 * so scripts/auth-audience-test.mjs can exercise it.
 *   1. the tab's remembered entry audience, else
 *   2. on /force-change-password: whichever staff-side audience holds a
 *      user that must change password (staff first), else
 *   3. 'staff'.
 */
export function resolveEntryAudience(pathname, entryAudience, storage) {
    if (STAFF_SIDE_AUDIENCES.includes(entryAudience)) return entryAudience;
    if (matches(pathname || '', ['/force-change-password']) && storage) {
        for (const aud of ['staff', 'platform']) {
            let u = null;
            try { u = parseUser(storage.getItem(KEYS[aud].user)); } catch { /* ignore */ }
            if (u?.mustChangePassword === true) return aud;
        }
    }
    return 'staff';
}

export function currentAudience() {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (isSharedStaffEntryPath(path)) {
        let storage = null;
        try { storage = localStorage; } catch { /* ignore */ }
        return resolveEntryAudience(path, getEntryAudience(), storage);
    }
    const aud = audienceForPath(path);
    // Remember the staff-side workspace this tab is on, so a later hop to
    // a shared entry page (logout → /staff-login, ProtectedRoute →
    // /force-change-password) keeps reading the same session.
    if (aud !== 'customer') setEntryAudience(aud);
    return aud;
}

const tokenKey = (aud = currentAudience()) => storageKeysFor(aud).token;
const userKey = (aud = currentAudience()) => storageKeysFor(aud).user;
// #28 — rotating refresh token, partitioned by audience like the access token.
const refreshKey = (aud = currentAudience()) => storageKeysFor(aud).refresh;

/** localStorage key holding the user blob for `aud` (storage-event matching). */
export function userStorageKey(aud = currentAudience()) {
    return userKey(aud);
}

export function getToken(aud = currentAudience()) {
    try { return localStorage.getItem(tokenKey(aud)); } catch { return null; }
}

export function getStoredUser(aud = currentAudience()) {
    try { return localStorage.getItem(userKey(aud)); } catch { return null; }
}

/** Parsed user for `aud`, or null. */
export function getStoredUserObject(aud = currentAudience()) {
    return parseUser(getStoredUser(aud));
}

export function getRefreshToken(aud = currentAudience()) {
    try { return localStorage.getItem(refreshKey(aud)); } catch { return null; }
}

// `refreshToken` is optional: callers that only have an access token
// (legacy responses) leave any stored refresh token untouched.
export function setAuth(token, user, aud = currentAudience(), refreshToken) {
    try {
        localStorage.setItem(tokenKey(aud), token);
        localStorage.setItem(userKey(aud), typeof user === 'string' ? user : JSON.stringify(user));
        if (refreshToken) localStorage.setItem(refreshKey(aud), refreshToken);
    } catch { /* storage unavailable — nothing we can do */ }
}

/** Replace the token pair after /auth/refresh or a password change. */
export function setTokens(token, refreshToken, aud = currentAudience()) {
    try {
        if (token) localStorage.setItem(tokenKey(aud), token);
        if (refreshToken) localStorage.setItem(refreshKey(aud), refreshToken);
    } catch { /* ignore */ }
}

export function setStoredUser(user, aud = currentAudience()) {
    try {
        localStorage.setItem(userKey(aud), typeof user === 'string' ? user : JSON.stringify(user));
    } catch { /* ignore */ }
}

export function clearAuth(aud = currentAudience()) {
    try {
        localStorage.removeItem(tokenKey(aud));
        localStorage.removeItem(userKey(aud));
        localStorage.removeItem(refreshKey(aud));
    } catch { /* ignore */ }
}

// ─── Tab identity (cross-tab account switches) ──────────────────────────────
// The user id this tab's UI was rendered for, per audience. When another
// tab signs a DIFFERENT account into the same audience, localStorage now
// holds that account's token; this tab must not keep sending it under
// the old UI. api.js / socket.js check identityMismatch() before using a
// stored token, and AuthContext shows the "signed in elsewhere" overlay.
//
// Only the staff-side audiences are pinned: several customer flows
// (OTP, ScanTable, kiosk, guest mode) rewrite the legacy customer keys
// directly in the same tab, which would otherwise read as a "switch".
// Customer tabs still get the overlay (via the storage event, which only
// fires for OTHER tabs' writes).
const _tabIdentity = {};

const idOf = (u) => (u && (u._id || u.id)) || null;

export function setTabIdentity(aud, user) {
    if (!STAFF_SIDE_AUDIENCES.includes(aud)) return;
    const id = idOf(user);
    if (id) _tabIdentity[aud] = String(id);
    else delete _tabIdentity[aud];
}

export function clearTabIdentity(aud) {
    if (aud) delete _tabIdentity[aud];
}

/** True when the stored session for `aud` no longer belongs to this tab's user. */
export function identityMismatch(aud = currentAudience()) {
    const mine = _tabIdentity[aud];
    if (!mine) return false;
    const stored = idOf(getStoredUserObject(aud));
    return !stored || String(stored) !== mine;
}

// ─── One-time migration ─────────────────────────────────────────────────────
// Before the 'platform' audience existed, a Super Admin's session lived
// under the staff_* keys. Move it so already-signed-in Super Admins stay
// signed in (their /superadmin pages now read platform_*). Idempotent;
// returns true when something was moved/cleared.
export function migrateLegacyPlatformSession(storage) {
    let s = storage;
    if (!s) {
        try { s = localStorage; } catch { return false; }
    }
    try {
        const staffUser = parseUser(s.getItem(KEYS.staff.user));
        if (staffUser?.role !== 'superadmin') return false;
        // A platform session written by the new code wins; otherwise adopt
        // the legacy one.
        if (!s.getItem(KEYS.platform.token)) {
            const token = s.getItem(KEYS.staff.token);
            const refresh = s.getItem(KEYS.staff.refresh);
            if (token) s.setItem(KEYS.platform.token, token);
            s.setItem(KEYS.platform.user, s.getItem(KEYS.staff.user));
            if (refresh) s.setItem(KEYS.platform.refresh, refresh);
        }
        s.removeItem(KEYS.staff.token);
        s.removeItem(KEYS.staff.user);
        s.removeItem(KEYS.staff.refresh);
        return true;
    } catch {
        return false;
    }
}
