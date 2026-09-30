import axios from 'axios';
import { toast } from 'react-hot-toast';
import { setServerDown } from './serverStatus';
import { getActiveTenantSlug, getActiveBranchId, clearActiveTenant, setActiveBranch } from './tenant';
import { openUpgradePrompt } from './upgradePromptBus';
import {
    getToken, getStoredUser, getStoredUserObject, clearAuth, currentAudience, getRefreshToken, setTokens,
    AUDIENCES, identityMismatch, loginPathForAudience,
} from './authStorage';
import { clearDineInTable, requestTableScan } from './dineInSession';
import { isReservedSlug } from './reservedSlugs';

// ─── Axios instance ───────────────────────────────────────────────────────────
//
// Mixed-content guard: when the page is served over HTTPS but
// VITE_API_URL still points at a `http://` host (common in dev .env
// files that get accidentally shipped, or behind a reverse proxy that
// terminates TLS), the browser silently blocks every API call as
// "Mixed Content". Auto-upgrade the protocol so the kiosk and customer
// app keep working in HTTPS deployments without rebuilding the bundle.
function resolveApiBaseUrl() {
    let base = import.meta.env.VITE_API_URL || '';
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && base.startsWith('http://')) {
        base = base.replace(/^http:\/\//, 'https://');
    }
    // Strip any trailing slash so the version check below is stable.
    base = base.replace(/\/+$/, '');
    // Version guard: the backend retired the unversioned `/api` mount and
    // now returns a 410 ("The unversioned /api endpoint has been retired.
    // Please use /api/v1.") for anything under `/api/<x>` that isn't
    // `/api/v1/...`. On production deploys where VITE_API_URL was set to
    // `https://<host>/api` (missing the version suffix), every request
    // 410s. Auto-append `/v1` when the configured URL ends at `/api` so
    // the bundle keeps working without a redeploy.
    if (/\/api$/.test(base)) {
        base = `${base}/v1`;
    }
    return base;
}

const api = axios.create({
    baseURL: resolveApiBaseUrl(),
    timeout: 30000, // 30 s — generous enough to absorb MongoDB Atlas cold-start handshake on hard refresh; React Query handles retries on top.
    headers: { 'Content-Type': 'application/json' }
});

// ─── Session refresh (#28) ────────────────────────────────────────────────────
//
// Access tokens are short-lived (~30 min). Instead of bouncing staff to the
// login page when one expires, we swap the stored refresh token for a new
// pair at POST /auth/refresh:
//   * proactively, in the request interceptor, when the token is about to
//     expire, and
//   * reactively, on a 401 — the failed request is retried once.
// Concurrent callers share ONE in-flight refresh per audience (requests
// that 401 while it runs are queued behind it). Across tabs, the Web Locks
// API serialises refreshes so two tabs don't race the same token; a tab
// that finds the token already rotated by another tab just reuses it.
// Only when the refresh itself is rejected do we fall through to logout.
const refreshClient = axios.create({
    baseURL: resolveApiBaseUrl(),
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
});

const _refreshInFlight = {};

// Endpoints that must never trigger a refresh/retry on 401: the refresh
// itself, credential checks, and login flows.
const NO_REFRESH_URL = /\/auth\/(login|register|refresh|verify-otp|send-otp|google|logout|change-password|forgot-password|reset-password)(\b|$|\?)/;

function tokenExpiresAtMs(token) {
    try {
        const part = token.split('.')[1];
        const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
        return typeof json.exp === 'number' ? json.exp * 1000 : null;
    } catch {
        return null;
    }
}

async function doRefresh(aud) {
    const presented = getRefreshToken(aud);
    if (!presented) return null;
    try {
        const res = await refreshClient.post('/auth/refresh', { refreshToken: presented });
        const { token, refreshToken } = res.data || {};
        if (!token) return null;
        setTokens(token, refreshToken, aud);
        return token;
    } catch (err) {
        // Network failure / timeout: keep the session, let the caller fail
        // normally — flaky Wi-Fi must not log a waiter out.
        if (!err.response) throw err;
        // Another tab rotated the token while we were in flight.
        const current = getRefreshToken(aud);
        if (current && current !== presented) return getToken(aud);
        return null;
    }
}

/**
 * Refresh the session for `aud` ('platform' | 'staff' | 'customer'). Each
 * audience has its own in-flight promise and its own Web Lock name, so a
 * Super Admin tab and a hotel-admin tab never serialise on (or reuse)
 * each other's refresh. Resolves to the new
 * access token, or null when the session is gone (caller should log out).
 * Rejects only on network errors.
 */
export function refreshSession(aud = currentAudience()) {
    if (_refreshInFlight[aud]) return _refreshInFlight[aud];
    const before = getRefreshToken(aud);
    const run = async () => {
        // Inside the cross-tab lock: if another tab already rotated the
        // pair while we waited, use its fresh access token.
        const now = getRefreshToken(aud);
        if (before && now && now !== before) {
            const t = getToken(aud);
            const exp = t && tokenExpiresAtMs(t);
            if (t && (!exp || exp - Date.now() > 30 * 1000)) return t;
        }
        return doRefresh(aud);
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    const p = (locks?.request
        ? locks.request(`bestodine-auth-refresh-${aud}`, run)
        : run()
    ).finally(() => { delete _refreshInFlight[aud]; });
    _refreshInFlight[aud] = p;
    return p;
}

// Where to send a customer whose request couldn't resolve a tenant/branch.
//
// A DINE-IN customer scanned a table QR and is physically AT that branch —
// the branch is implicit in the table, so the branch picker is the wrong
// recovery (it's a TAKEAWAY concern: "which location do you want to order
// from?"). Re-scan the table QR instead: ScanTable re-establishes the
// tenant AND the table's branch in one step, with no picker. Only fall
// back to /branch-selection when there's no dine-in table context
// (takeaway / deep-link / cleared storage).
function tenantRecoveryHref() {
    const next = window.location.pathname + window.location.search;
    try {
        if (localStorage.getItem('orderType') === 'dine-in') {
            const dineIn = JSON.parse(localStorage.getItem('dineInTable') || 'null');
            if (dineIn?.qrToken) return `/scan/${dineIn.qrToken}`;
        }
    } catch { /* fall through to the picker */ }
    return `/branch-selection?next=${encodeURIComponent(next)}`;
}

// True while the browser is on a page that itself re-establishes tenant
// context (the branch picker, a /r/<slug> restaurant link, or the QR scan
// landing). Redirecting away from these on a transient 400 would loop —
// the scan page clears the tenant on mount, so a poll that races the
// re-fetch must NOT bounce it; and bouncing a /r/ link to the generic
// picker would lose the restaurant the link named.
function onTenantRecoveryPage() {
    const p = window.location.pathname;
    // Restaurant landing pages (/<slug>[/<branch>]) name their own tenant
    // and handle BRANCH_NOT_FOUND etc. themselves — never bounce them.
    const first = p.split('/').filter(Boolean)[0];
    const onRestaurantLanding = Boolean(first) && !isReservedSlug(first);
    return p === '/branch-selection' || p.startsWith('/r/') || p.startsWith('/scan/') || p === '/scan' || onRestaurantLanding;
}

// True when a /superadmin API was called from a /superadmin page but the
// stored platform session doesn't belong to a Super Admin.
let _platformBounceScheduled = false;
function isPlatformSessionInvalid(cfg) {
    if (!window.location.pathname.startsWith('/superadmin')) return false;
    if ((cfg?._aud || currentAudience()) !== 'platform') return false;
    const url = String(cfg?.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1/, '');
    if (!url.startsWith('/superadmin')) return false;
    const u = getStoredUserObject('platform');
    return u?.role !== 'superadmin';
}

// ─── Toast deduplication ──────────────────────────────────────────────────────
// Prevents a wave of simultaneous failures (e.g. 5 components mount at once)
// from firing 5 identical toasts for the same message.
// Uses a per-message Map so different errors can still show independently.
const _errorToastLastShown = new Map();
const ERROR_COOLDOWN_MS = 3000;

function showErrorToast(message) {
    const now = Date.now();
    const lastShown = _errorToastLastShown.get(message) || 0;
    if (now - lastShown < ERROR_COOLDOWN_MS) return;
    _errorToastLastShown.set(message, now);
    toast.error(message, { duration: 4000 });
    // Prune stale entries to avoid unbounded memory growth
    if (_errorToastLastShown.size > 50) {
        const cutoff = now - ERROR_COOLDOWN_MS * 2;
        _errorToastLastShown.forEach((ts, key) => { if (ts < cutoff) _errorToastLastShown.delete(key); });
    }
}

// ─── Request interceptor — attach auth token + tenant slug ──────────────────
api.interceptors.request.use(
    async (config) => {
        // Audience-scoped token: /superadmin reads `platform_token`, a
        // tenant-staff route reads `staff_token`, a customer route reads
        // `token`, so simultaneous sessions in the same browser don't
        // cross-authenticate each other's calls. A caller may pin the
        // audience (`_aud`) — e.g. /force-change-password acting on the
        // session that must change its password.
        const aud = AUDIENCES.includes(config._aud) ? config._aud : currentAudience();
        config._aud = aud;

        // Another tab signed a different account into this audience. Don't
        // send that account's token under this tab's UI — AuthContext shows
        // the "signed in elsewhere" overlay; fail the call quietly.
        if (identityMismatch(aud)) {
            const err = new Error('Session changed in another tab');
            err.code = 'ERR_SESSION_CHANGED';
            err.config = config;
            throw err;
        }

        let token = getToken(aud);

        // #28 — proactive refresh when the access token is (nearly) expired.
        if (token && !NO_REFRESH_URL.test(config.url || '') && getRefreshToken(aud)) {
            const exp = tokenExpiresAtMs(token);
            if (exp && exp - Date.now() < 30 * 1000) {
                try {
                    const fresh = await refreshSession(aud);
                    if (fresh) token = fresh;
                } catch { /* offline — send as-is; the 401 path handles it */ }
            }
        }
        if (token) config.headers.Authorization = `Bearer ${token}`;

        // Phase 1 SaaS: customer & guest requests carry the active tenant
        // slug so the backend `attachTenant` middleware can scope every
        // query to the right restaurant. Staff users have their tenant
        // baked into the JWT and the `restaurant` field on their User
        // record — they don't need this header — but sending it is
        // harmless because backend resolution prefers `req.user.restaurant`.
        const slug = getActiveTenantSlug();
        if (slug) config.headers['X-Restaurant-Slug'] = slug;

        // Phase 6 step 5: customer/guest requests at a multi-branch
        // tenant carry the picked branch id. Backend `attachTenant`
        // validates it against the tenant + sets req.branch so the
        // menu/category endpoints can scope by branch. Harmless on
        // single-location tenants (header just isn't sent) and on
        // staff requests (backend prefers req.user.branch when set).
        //
        // Callers that want a tenant-level read (e.g. the public
        // landing page showing admin-configured hours/contact before
        // any branch is picked) can pass `_skipBranchHeader: true` to
        // suppress X-Branch-Id for that one request.
        const branchId = getActiveBranchId();
        if (branchId && !config._skipBranchHeader) config.headers['X-Branch-Id'] = branchId;

        // Admin branch switcher — for STAFF requests (logged-in admin /
        // manager who's not branch-pinned), inject `?branch=<id>` from
        // the AdminBranchContext switcher into every GET. Without this
        // every admin page that lists branch-scoped data (Bookings,
        // Offers, CRM, Menu, Inventory, Halls, etc.) ignored the picker
        // and silently showed every branch merged together — which
        // looked like a FC Road → Main leak. Persisted to localStorage
        // by AdminBranchContext so a refresh keeps the same scope and
        // this interceptor can read it without React.
        //
        // Skip if:
        //   - caller already passed `?branch=...` (they know better)
        //   - caller opted out via `_skipAdminBranchParam: true`
        //   - request method isn't GET (mutations don't need this)
        //   - the user is the customer flow (no JWT token)
        try {
            if (token
                && (config.method || 'get').toLowerCase() === 'get'
                && !config._skipAdminBranchParam) {
                const adminBranchRaw = localStorage.getItem('adminActiveBranch');
                let adminBranchId = null;
                if (adminBranchRaw) {
                    try {
                        const parsed = JSON.parse(adminBranchRaw);
                        adminBranchId = typeof parsed === 'string' ? parsed : (parsed?._id || null);
                    } catch { /* legacy plain-string value */ adminBranchId = adminBranchRaw; }
                }
                if (adminBranchId) {
                    // Don't override an explicit caller-provided branch.
                    const alreadyHasParam = (config.params && config.params.branch != null)
                        || (typeof config.url === 'string' && /[?&]branch=/.test(config.url));
                    if (!alreadyHasParam) {
                        // `branchScope=auto` tells the backend to apply
                        // the customer-facing scope — that branch's
                        // items PLUS tenant-level (shared) items. Without
                        // this the admin sees ONLY items directly
                        // assigned to the selected branch, hiding every
                        // shared/tenant-level item (e.g. the entire
                        // master menu CSV which imports as branch:null).
                        // The Branches list endpoint, telemetry stats,
                        // etc. ignore branchScope so it's safe to send
                        // globally on every authed admin GET.
                        config.params = { ...(config.params || {}), branch: adminBranchId, branchScope: 'auto' };
                    }
                }
            }
        } catch { /* localStorage unavailable — harmless, page will just see all-branch data */ }

        // Scan-session token — signed JWT bound to the physical table
        // the guest scanned. Backend requires this on guest dine-in
        // POST /orders so an anonymous caller can't hijack a tableId
        // they never scanned. Staff tokens override this on the server.
        const scanToken = localStorage.getItem('scanToken');
        if (scanToken) config.headers['X-Scan-Token'] = scanToken;

        return config;
    },
    (error) => Promise.reject(error)
);

// ─── Response interceptor — centralised error handling ────────────────────────
api.interceptors.response.use(
    (response) => {
        // A successful response means the server is reachable.
        // If it was previously marked as down, clear that state now.
        // The serverStatus module handles idempotency (no-op if already up).
        setServerDown(false);
        // #15 — a password change revokes every session and hands this
        // device a fresh pair; store it so the tab stays signed in.
        if (/\/auth\/change-password/.test(response.config?.url || '')
            && response.data?.token && response.data?.refreshToken) {
            setTokens(response.data.token, response.data.refreshToken, response.config._aud || currentAudience());
        }
        return response;
    },
    async (error) => {
        // Blocked in the request interceptor (account switched in another
        // tab) — never reached the server, so no toast / server-down banner.
        if (error?.code === 'ERR_SESSION_CHANGED') return Promise.reject(error);

        const hasResponse = Boolean(error.response);   // false = network/timeout error
        const status      = error.response?.status;
        // Flag set by callers that want silent background behaviour:
        //   api.get('/url', { _isBackground: true })
        const isBackground = Boolean(error.config?._isBackground);

        // ── Network error / timeout ─────────────────────────────────────────
        // No HTTP response at all means the server is unreachable or the
        // request timed out. Show a single persistent banner (handled in App.jsx
        // via ServerStatusBanner) instead of one toast per failed request.
        if (!hasResponse) {
            setServerDown(true);
            // Do NOT call showErrorToast — the banner covers this globally.
            return Promise.reject(error);
        }

        // ── Server responded — it is reachable ─────────────────────────────
        setServerDown(false);

        // Phase 3 hardening — backend rejects any request it can't
        // associate with a restaurant with `400 { code: TENANT_REQUIRED }`.
        // This happens in practice when:
        //   - the customer deep-linked into a protected route without
        //     going through BranchSelection / ScanTable first
        //   - localStorage was cleared (new device, cleared cookies)
        //   - the slug became stale (tenant was renamed or deleted)
        //
        // None of those are actionable as a raw error toast. Instead:
        // clear any stale tenant, suppress the toast, and hand the
        // user off to the branch picker so they can recover. Skip the
        // redirect entirely when we're already on /branch-selection
        // (that page calls publicAPI.listRestaurants, which is exempt
        // from tenant gating — so a 400 there is a different bug).
        if (status === 400 && error.response?.data?.code === 'TENANT_REQUIRED') {
            if (!onTenantRecoveryPage()) {
                // Dine-in sessions recover by re-scanning the table (branch
                // comes from the QR); only takeaway/no-table sessions get
                // bounced to the branch picker. See tenantRecoveryHref.
                const href = tenantRecoveryHref();
                // Re-scanning re-establishes the tenant itself, so only
                // hard-clear when we're falling back to the picker.
                if (href.startsWith('/branch-selection')) clearActiveTenant();
                setTimeout(() => { window.location.href = href; }, 0);
            }
            return Promise.reject(error);
        }

        // Stale-branch recovery — backend returns
        // `404 { code: BRANCH_NOT_FOUND }` when the X-Branch-Id header
        // points at a branch that no longer exists or has been
        // deactivated (admin removed it, tenant restructured, etc.).
        // The frontend's localStorage still carries the dead id, so
        // every subsequent call fails the same way until the user
        // re-picks. Clear just the branch (keep the tenant) and bounce
        // to /branch-selection so the picker can hand them a valid
        // branch — same UX pattern as TENANT_REQUIRED above. Skip
        // when we're already on the picker so we don't loop.
        if (status === 404 && error.response?.data?.code === 'BRANCH_NOT_FOUND') {
            if (!onTenantRecoveryPage()) {
                // Dine-in: re-scan to pull a fresh, valid branch from the
                // table. Takeaway/no-table: clear the dead branch and let
                // the picker hand them a valid one.
                const href = tenantRecoveryHref();
                if (href.startsWith('/branch-selection')) setActiveBranch(null);
                setTimeout(() => { window.location.href = href; }, 0);
            }
            return Promise.reject(error);
        }

        // Customer dine-in table problems. TABLE_UNAVAILABLE = the admin
        // deleted the table this customer is bound to; TABLE_REQUIRED
        // for a guest = they tried to order dine-in without scanning a
        // table. Either way the only way forward is scanning a table QR,
        // so drop the dead binding and hand off to the scan screen
        // (CustomerLayout listens for the event), which explains why.
        // Staff screens are left alone — they pick tables themselves.
        {
            const tableCode = error.response?.data?.code;
            // The scan page renders its own error for a dead QR.
            const onCustomerSide = currentAudience() === 'customer'
                && !window.location.pathname.startsWith('/scan');
            if (onCustomerSide && tableCode === 'TABLE_UNAVAILABLE') {
                clearDineInTable();
                requestTableScan('table_removed');
                return Promise.reject(error);
            }
            if (onCustomerSide && tableCode === 'TABLE_REQUIRED' && localStorage.getItem('isGuest') === 'true') {
                requestTableScan('no_table');
                return Promise.reject(error);
            }
        }

        // 401 — token expired or invalid.
        // Skip redirect for guest users and intentional logouts (handled by the component).
        // Also skip for `_isBackground` polls (notifications, profile sync, etc.) —
        // a polling failure should not yank the customer out of their checkout
        // mid-flow. The next foreground action (place order, view bill) will
        // hit 401 and trigger the redirect normally.
        if (status === 401) {
            const cfg = error.config || {};
            const aud = cfg._aud || currentAudience();
            const url = cfg.url || '';
            // #28 — try one silent refresh + retry before giving up.
            if (!cfg._retried && !NO_REFRESH_URL.test(url)
                && cfg.headers?.Authorization && getRefreshToken(aud)) {
                cfg._retried = true;
                try {
                    const fresh = await refreshSession(aud);
                    if (fresh) {
                        cfg.headers.Authorization = `Bearer ${fresh}`;
                        return api(cfg);
                    }
                } catch {
                    // Network error during refresh — don't log out.
                    return Promise.reject(error);
                }
            }
            // A wrong "current password" is a credential check, not an
            // expired session — let the page show the error.
            if (/\/auth\/change-password/.test(url)) return Promise.reject(error);

            const isGuestSession = localStorage.getItem('isGuest') === 'true';
            const isIntentionalLogout = sessionStorage.getItem('intentional_logout') === 'true';
            if (!isGuestSession && !isIntentionalLogout && !isBackground) {
                clearAuth(aud);
                // Defer redirect so React finishes the current render cycle first
                setTimeout(() => {
                    // Single source of truth for which login page: authStorage's
                    // audiences ('platform' + 'staff' → /staff-login, customer →
                    // /login). A hardcoded list here previously omitted
                    // /superadmin, so an expired super-admin session bounced to
                    // the CUSTOMER login.
                    const loginPath = loginPathForAudience(currentAudience());
                    if (window.location.pathname !== loginPath && window.location.pathname !== '/login' && window.location.pathname !== '/staff-login') {
                        window.location.href = loginPath;
                    }
                }, 0);
            }
            return Promise.reject(error);
        }

        // 403 from a /superadmin API on a /superadmin page while the stored
        // platform session isn't a Super Admin (or is gone). Repeating
        // "Access denied. Super Admin only." toasts helps nobody — send
        // them to sign in as Super Admin, once.
        if (status === 403 && isPlatformSessionInvalid(error.config)) {
            if (!_platformBounceScheduled) {
                _platformBounceScheduled = true;
                const notice = 'Please sign in as Super Admin';
                showErrorToast(notice);
                try { sessionStorage.setItem('bd_auth_notice', notice); } catch { /* ignore */ }
                setTimeout(() => { window.location.href = '/staff-login?switch=1'; }, 0);
            }
            return Promise.reject(error);
        }

        // Background requests (polling, silent prefetches) — no toast.
        if (isBackground) return Promise.reject(error);

        // Callers that handle errors themselves can set _silent to suppress the
        // global toast:  api.delete('/url', { _silent: true })
        const isSilent = Boolean(error.config?._silent);
        if (isSilent) return Promise.reject(error);

        // Phase 5 step 1 — staff hit a plan-gated feature. Replace the
        // raw "Your current plan does not include X" toast with the
        // friendly UpgradePrompt modal that names the feature and
        // surfaces a contact path. Customer-role users also get a
        // FEATURE_LOCKED code but with a different message ("This
        // restaurant doesn't offer X") — for them, the correct UX is
        // to hide the UI entirely (handled in Phase 2.5) or show the
        // normal toast as a last-ditch fallback, NOT an upgrade modal
        // they can't act on.
        if (status === 403 && error.response?.data?.code === 'FEATURE_LOCKED') {
            let userRole = null;
            try {
                const u = JSON.parse(getStoredUser() || 'null');
                userRole = u?.role || null;
            } catch { /* malformed blob — treat as anonymous */ }
            const isStaffRole = ['admin', 'waiter', 'captain', 'chef'].includes(userRole);
            if (isStaffRole) {
                openUpgradePrompt({
                    feature: error.response.data.feature,
                    currentPlan: error.response.data.currentPlan,
                    message: error.response.data.message,
                });
                return Promise.reject(error);
            }
            // customer/guest/anonymous — fall through to the regular
            // toast path below so they at least see the message. The
            // BranchSelection redirect from Phase 3 step 6 handles
            // the deeper recovery for these users on TENANT_REQUIRED.
        }

        // ── Regular API error (4xx / 5xx with a response body) ─────────────
        // Translate a small set of developer-facing error codes into
        // user-friendly toasts. These messages were written for the
        // API client (curl, dev console) and assume technical context
        // — e.g. "No route matched GET /api/v1/foo" or "The
        // unversioned /api endpoint has been retired." End-users
        // shouldn't see either; the original message stays visible to
        // engineers in the DevTools network tab.
        const code = error.response?.data?.code;
        const friendlyByCode = code && DEV_FACING_ERROR_CODES[code];
        const message =
            friendlyByCode ||
            error.response?.data?.message ||
            error.message ||
            'Something went wrong';
        showErrorToast(message);

        return Promise.reject(error);
    }
);

// Codes whose backend message is developer-oriented and should never
// reach a real end-user. Keep this list small — most backend codes
// already carry a perfectly readable message that the user should
// see verbatim (SAME_PLAN, DOWNGRADE_NOT_SUPPORTED, REASON_REQUIRED,
// PAYMENT_NOT_CAPTURED, etc.).
const DEV_FACING_ERROR_CODES = {
    // Frontend hit a URL the backend doesn't have a handler for.
    // Almost always a build / deploy mismatch — apologise and ask
    // the user to refresh so they pick up the latest bundle.
    ROUTE_NOT_FOUND: "Something went wrong on our end. Please refresh the page and try again.",
    // Hitting a long-retired unversioned API. Same root cause as
    // ROUTE_NOT_FOUND from the user's perspective.
    GONE: "Something went wrong on our end. Please refresh the page and try again.",
};

// ─── Named API helpers ────────────────────────────────────────────────────────

// Waiter & Order APIs
export const waiterAPI = {
    // Area & Tables
    getAreas:            ()           => api.get('/areas'),
    getTablesByArea:     (areaId)     => api.get(`/tables?area=${areaId}`),
    mergeTables:         (tableIds)   => api.post('/tables/merge', { tableIds }),
    unmergeTables:       (tableId)    => api.post('/tables/unmerge', { tableId }),
    // CAP-008 — captain/admin free a table. Backend will 400 if there's
    // an active order on the table; the caller surfaces that to the UI.
    freeTable:           (tableId)    => api.post(`/tables/${tableId}/free`),
    // CAP-009 — toggle table status (alert / free / etc). PUT /tables/:id
    // accepts a status field; backend enum allows free / occupied /
    // reserved / merged / alert / disabled.
    setTableStatus:      (tableId, status) => api.put(`/tables/${tableId}`, { status }),

    // Menu & Categories
    getCategories:          ()           => api.get('/categories'),
    getMenuItemsByCategory: (categoryId) => api.get(`/menu?category=${categoryId}`),

    // Orders
    createOrder:           (orderData)              => api.post('/orders', orderData),
    getLiveOrders:         (floor)                  => api.get(`/orders/live${floor ? `?floor=${floor}` : ''}`),
    getPastOrders:         ()                       => api.get('/orders/past'),
    getRefunds:            (params)                 => api.get('/orders/refunds', { params }),
    getActiveOrderByTable: (tableId)                => api.get(`/orders/active/table/${tableId}`),
    pickupOrder:           (orderId)                => api.patch(`/orders/${orderId}/pickup`),
    repeatItem:            (orderId, itemId, qty)   => api.post(`/orders/${orderId}/repeat/${itemId}`, { quantity: qty }),
    // Append a second / third KOT round to an already-active order
    appendItems:           (orderId, items)         => api.post(`/orders/${orderId}/append`, { items }),

    // Requests
    getRequests:         (params)                    => api.get('/requests', { params }),
    updateRequestStatus: (requestId, status, waiterId) => api.put(`/requests/${requestId}/status`, { status, waiterId }),
    createRequest:       (requestData)               => api.post('/requests', requestData),
    // Guest/customer: poll request status for this table so the UI can
    // surface "waiter is on the way" / "request completed" feedback.
    getActiveRequestsByTable: (tableId)              => api.get(`/requests/active/table/${tableId}`, { _isBackground: true }),
};

// Captain (Head Waiter) floor-control APIs. Backed by /captain/* — guarded
// captainOrAdmin on the server. Waiters get 403; the UI also hides the entry
// point for non-captains.
export const captainAPI = {
    getFloorOverview: ()                  => api.get('/captain/floor-overview'),
    getWaiters:       ()                  => api.get('/captain/waiters'),
    assignWaiter:     (tableId, waiterId) => api.put(`/tables/${tableId}/assign`, { waiterId }),
    escalate:         (payload)           => api.post('/captain/escalate', payload),
};

// Chef / Kitchen APIs
// updateStatus uses _silent so the Chef dashboard's mutation can own the
// error message (the handler distinguishes INVALID_TRANSITION / BRANCH_MISMATCH
// for contextual toasts). Without this, the axios interceptor fires a generic
// toast first and the UI double-toasts.
export const chefAPI = {
    getKitchenOrders:  ()                => api.get('/orders/kitchen'),
    // Backs the chef dashboard's Completed drawer. `days` defaults to
    // today on the server; widen it for a lookback.
    getCompletedKitchenOrders: (days = 1)  => api.get(`/orders/kitchen/completed?days=${days}`),
    updateStatus:      (orderId, status) => api.patch(`/orders/${orderId}/status`, { status }, { _silent: true }),
};

export const shiftAPI = {
    getMyShifts: () => api.get('/shifts/my'),
    clockIn:     () => api.post('/shifts/clock-in'),
    clockOut:    (note) => api.post('/shifts/clock-out', { note }),
};

export const walletAPI = {
    getWallet:        (opts = {}) => api.get('/wallet', opts),
    redeemPoints:     (points) => api.post('/wallet/points/redeem', { points }),
    payWithWallet:    (amount, orderId) => api.post('/wallet/pay', { amount, orderId }),
    getAdminStats:    ()       => api.get('/wallet/admin/stats'),
    searchCustomers:  (q)      => api.get('/wallet/admin/customers', { params: { q } }),
    adjustWallet:     (data)   => api.post('/wallet/admin/adjust', data),
    setWalletStatus:  (data)   => api.post('/wallet/admin/set-status', data),
    getManualHistory: (params) => api.get('/wallet/admin/manual-history', { params }),
    getReports:       (params) => api.get('/wallet/admin/reports', { params }),
};

export const campaignAPI = {
    getAll:    ()           => api.get('/campaigns'),
    getStats:  ()           => api.get('/campaigns/stats'),
    create:    (data)       => api.post('/campaigns', data),
    toggle:    (id)         => api.patch(`/campaigns/${id}/toggle`),
    update:    (id, data)   => api.put(`/campaigns/${id}`, data),
    remove:    (id)         => api.delete(`/campaigns/${id}`),
};

export const promotionsAPI = {
    getActivePromotions: ()                    => api.get('/promotions'),
    getActiveCoupons:    (opts = {})           => api.get('/promotions/coupons/active', opts),
    // ADM-064 — `items` is optional, but coupons with scope='food'/'beverages'
    // refuse on the server when it's missing because they can't compute the
    // eligible slice without item-level prepStation hints.
    applyCoupon:         (code, orderValue, opts = {}, items = null) =>
        api.post('/promotions/apply-coupon', items ? { code, orderValue, items } : { code, orderValue }, opts),
};

export const settingsAPI = {
    getSettings: (opts = {}) => api.get('/settings', opts),
    updateSettings: (data) => api.put('/settings', data),
    updateSection: (section, data) => api.patch(`/settings/${section}`, data),
};

export const inventoryAPI = {
    getAll:          (params) => api.get('/inventory', { params }),
    getSummary:      (params) => api.get('/inventory/summary', { params }),
    getAlerts:       (params) => api.get('/inventory/alerts', { params }),
    getNextId:       ()       => api.get('/inventory/next-id'),
    getById:         (id)     => api.get(`/inventory/${id}`),
    create:          (data)   => api.post('/inventory', data),
    update:          (id, data) => api.put(`/inventory/${id}`, data),
    adjustStock:     (id, data) => api.patch(`/inventory/${id}/adjust`, data),
    delete:          (id)     => api.delete(`/inventory/${id}`),
    // Recipe management
    getRecipes:          ()             => api.get('/inventory/recipes'),
    getRecipe:           (menuItemId)   => api.get(`/inventory/recipes/${menuItemId}`),
    saveRecipe:          (data)         => api.post('/inventory/recipes', data),
    deleteRecipe:        (menuItemId)   => api.delete(`/inventory/recipes/${menuItemId}`),
    // Analytics
    getFoodCostReport:   (params)       => api.get('/inventory/food-cost', { params }),
    getActualVsTheoretical: (params)    => api.get('/inventory/actual-vs-theoretical', { params }),
    getMenuIssues:       ()             => api.get('/inventory/menu-issues', { _silent: true }),
    // Reports (10.8.1 / 10.8.2)
    getStockReport:      (params)       => api.get('/inventory/reports/stock', { params }),
    getConsumptionReport:(params)       => api.get('/inventory/reports/consumption', { params }),
};

// ── Supplier / Vendor master (10.3.2) ──────────────────────────────────
export const supplierAPI = {
    getAll:    (params) => api.get('/suppliers', { params }),
    getById:   (id)     => api.get(`/suppliers/${id}`),
    nextCode:  ()       => api.get('/suppliers/next-code'),
    create:    (data)   => api.post('/suppliers', data),
    update:    (id, data) => api.put(`/suppliers/${id}`, data),
    delete:    (id)     => api.delete(`/suppliers/${id}`),
};

// ── Purchase Orders + GRN + Payments (10.4 / 10.9) ─────────────────────
export const purchaseAPI = {
    getAll:        (params) => api.get('/purchase-orders', { params }),
    getById:       (id)     => api.get(`/purchase-orders/${id}`),
    getSummary:    ()       => api.get('/purchase-orders/summary'),
    nextNumber:    ()       => api.get('/purchase-orders/next-number'),
    create:        (data)   => api.post('/purchase-orders', data),
    update:        (id, data) => api.put(`/purchase-orders/${id}`, data),
    receive:       (id, data) => api.post(`/purchase-orders/${id}/receive`, data),
    recordPayment: (id, data) => api.post(`/purchase-orders/${id}/payment`, data),
    cancel:        (id)     => api.patch(`/purchase-orders/${id}/cancel`),
    purchaseReport:(params) => api.get('/purchase-orders/reports/purchase', { params }),
    paymentReport: ()       => api.get('/purchase-orders/reports/payments'),
};

// ── Production / Batch cooking (10.6.2) ────────────────────────────────
export const productionAPI = {
    getAll:     (params) => api.get('/production', { params }),
    getSummary: ()       => api.get('/production/summary'),
    create:     (data)   => api.post('/production', data),
};

export const razorpayAPI = {
    createOrder:   (amount, cafeOrderId) => api.post('/razorpay/create-order', { amount, cafeOrderId }),
    verifyPayment: (data)                => api.post('/razorpay/verify-payment', data),
    refund:        (data)                => api.post('/razorpay/refund', data),
    // Customer-facing safety net. Called from the payment handler's
    // catch block when POST /orders rejects AFTER Razorpay captured —
    // refunds the payment automatically and pushes an admin alert so
    // staff know to investigate the underlying cause (stock, total
    // tampering, expired coupon, etc.).
    orphanRefund:  (data)                => api.post('/razorpay/orphan-refund', data, { _silent: true }),
    createWalletRecharge:  (amount)      => api.post('/razorpay/create-wallet-recharge', { amount }),
    verifyWalletRecharge:  (data)        => api.post('/razorpay/verify-wallet-recharge', data),
    reconcile:     (minutes)             => api.get('/razorpay/reconcile', { params: { minutes } }),
};

// ADM-049 — customer-initiated refund-request workflow.
export const refundRequestAPI = {
    // Customer
    create:        (data)        => api.post('/refund-requests', data),
    listMine:      ()            => api.get('/refund-requests/mine'),
    // Admin
    list:          (params = {}) => api.get('/refund-requests', { params }),
    approve:       (id, data)    => api.post(`/refund-requests/${id}/approve`, data),
    reject:        (id, data)    => api.post(`/refund-requests/${id}/reject`, data),
};

export const advanceBookingAPI = {
    createBooking:  (bookingData)       => api.post('/advance-booking/create', bookingData),
    // Customer-facing table list + booking. These deliberately do NOT
    // reuse waiterAPI.getTablesByArea / the staff reservation route:
    // those are staffOnly and returned 403 "Access denied. Staff only."
    // to every customer who reached the Book a Table step.
    getBookableTables: (areaId)         => api.get(`/tables/bookable${areaId ? `?area=${areaId}` : ''}`),
    createCustomerReservation: (data)   => api.post('/reservations/customer', data),
    getAllBookings:  ()                  => api.get('/advance-booking/all'),
    getEventTypes:  ()                  => api.get('/booking-info/event-types'),
    updateStatus:   (id, status)        => api.patch(`/advance-booking/${id}/status`, { status }),
    deleteBooking:  (id)                => api.delete(`/advance-booking/${id}`),
    // Second-leg "pay remaining balance" flow — Razorpay-backed.
    // createRemainingPayment returns a Razorpay order the customer's
    // checkout popup consumes; the verify call lands the receipt and
    // marks the booking fully paid on the backend.
    createRemainingPayment: (id)         => api.post(`/advance-booking/${id}/create-remaining-payment`),
    verifyRemainingPayment: (id, data)   => api.post(`/advance-booking/${id}/verify-remaining-payment`, data),
    // CUS-075 — customer self-cancel + refund-policy preview.
    getMyBookings:          ()           => api.get('/advance-booking/my-bookings'),
    previewCancel:          (id)         => api.get(`/advance-booking/${id}/cancel-preview`),
    cancelBooking:          (id, reason) => api.post(`/advance-booking/${id}/cancel`, { reason }),
};

export const menuSearchAPI = {
    search:             (q, params = {}) => api.get('/menu/search', { params: { q, ...params } }),
    list:               (params = {})    => api.get('/menu', { params }),
    getTrending:        (limit)          => api.get('/menu/trending', { params: { limit } }),
    getCustomizations:  (id, opts = {})  => api.get(`/menu/${id}/customizations`, opts),
};

export const bookingInfoAPI = {
    getParkingRates: () => api.get('/booking-info/parking'),
};

// ── Public (unauthenticated) endpoints ─────────────────────────────────
// These are served before the customer has picked a tenant or logged in.
// Used by the landing / branch selection flow.
export const publicAPI = {
    listRestaurants:  ()       => api.get('/public/restaurants'),
    getRestaurantBySlug: (slug, config) => api.get(`/public/restaurants/${encodeURIComponent(slug)}`, config),
    // Phase 6 step 5 — list of a tenant's branches for the customer
    // branch picker. Returns [] for single-location tenants.
    getRestaurantBranches: (slug) => api.get(`/public/restaurants/${slug}/branches`),
    // Public restaurant landing page (/:slug[/:branchSlug]). 404 codes:
    // RESTAURANT_NOT_FOUND / RESTAURANT_UNAVAILABLE / BRANCH_NOT_FOUND.
    getLanding: (slug, branchSlug, config = {}) => api.get(
        `/public/restaurants/${encodeURIComponent(slug)}/landing`,
        {
            // The visitor's active branch (maybe another restaurant's) is
            // irrelevant here — the URL names the restaurant + branch.
            _skipBranchHeader: true,
            ...config,
            params: { ...(config.params || {}), ...(branchSlug ? { branch: branchSlug } : {}) },
        },
    ),
    // ── Platform home + hotel self-signup (Pages/Platform/*) ──
    // Searchable restaurant directory for the "Find a restaurant" box.
    searchRestaurants: (q, limit = 8, config = {}) => api.get('/public/restaurants', {
        _silent: true, _skipBranchHeader: true, ...config, params: { q, limit },
    }),
    // Active subscription plans — pricing cards + signup plan picker.
    getPlans: (config = {}) => api.get('/public/plans', { _silent: true, ...config }),
    // { slug?, name? } → { slug, available, reason, suggestions }.
    checkSlugAvailability: (params, config = {}) => api.get('/public/slug-availability', {
        _silent: true, ...config, params,
    }),
    // Hotel self-signup → 202 { restaurant, signupStatus:'pending', pageUrl, message }.
    // Errors (400 field/TERMS_REQUIRED/SLUG_*, 409 SLUG_TAKEN/EMAIL_IN_USE,
    // 429) are rendered inline by the form, hence _silent.
    registerRestaurant: (data) => api.post('/public/register-restaurant', data, { _silent: true, _skipBranchHeader: true }),
    // Request-a-demo lead (Super Admin → Leads).
    submitLead: (data) => api.post('/public/lead', data, { _silent: true }),
};

export default api;
