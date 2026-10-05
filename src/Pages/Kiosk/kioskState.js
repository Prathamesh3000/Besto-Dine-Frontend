import { publicAPI } from '../../utils/api';
import { getActiveTenant, setActiveTenant } from '../../utils/tenant';
import { storageKeysFor } from '../../utils/authStorage';
import { kioskLineKey, upsertLine, changeLineQty, countDistinctLines } from '../../utils/cart';
import { round2 } from '../../utils/pricing';

// ─── localStorage keys (single source of truth) ─────────────────────────
export const KIOSK_KEYS = {
    ORDER_TYPE:       'kiosk_order_type',
    CART:             'kiosk_cart',
    LAST_ORDER:       'kiosk_last_order',
    CUSTOMER_INFO:    'kiosk_customer_info',
    // Idempotency key for the in-flight checkout. Generated when the
    // user enters PayOption and reused across every retry until the
    // order is successfully created. Cleared on success or session reset.
    IDEMPOTENCY_KEY:  'kiosk_idempotency_key',
    // Short-lived JWT issued by the backend at order create time so the
    // OrderToken screen can poll status without auth.
    TRACKING_TOKEN:   'kiosk_tracking_token',
};

// ─── Cart persistence ───────────────────────────────────────────────────
export function readCart() {
    try {
        const raw = localStorage.getItem(KIOSK_KEYS.CART);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function writeCart(cart) {
    try {
        localStorage.setItem(KIOSK_KEYS.CART, JSON.stringify(cart));
    } catch { /* quota / private mode — in-memory is fine for kiosk */ }
}

export function clearCart() {
    try { localStorage.removeItem(KIOSK_KEYS.CART); } catch { /* ignore */ }
}

export function clearKioskSession() {
    try {
        localStorage.removeItem(KIOSK_KEYS.CART);
        localStorage.removeItem(KIOSK_KEYS.ORDER_TYPE);
        localStorage.removeItem(KIOSK_KEYS.CUSTOMER_INFO);
        localStorage.removeItem(KIOSK_KEYS.IDEMPOTENCY_KEY);
        localStorage.removeItem(KIOSK_KEYS.TRACKING_TOKEN);
        // Defensive cleanup: a kiosk device may have been used as a
        // staff/customer terminal before being repurposed. Stale token /
        // branch / cart keys from those flows would otherwise:
        //   - flip MenuContext out of bootstrap mode (token present →
        //     isAnonymousCustomer = false → kiosk Menu stuck on spinner)
        //   - inject the wrong X-Branch-Id header (adminActiveBranch
        //     leaks into kiosk requests)
        //   - leak previous customer's cart into the kiosk grid
        // Kiosk is a dedicated public terminal — clearing these on
        // every landing matches CLAUDE.md's "kiosk routes are guest-only
        // and shared between many customers" rule.
        // Every customer auth key api.js reads — including the refresh
        // token, which customerSessionTick would otherwise use to mint a
        // fresh access token for the previous customer on this kiosk.
        const customerKeys = storageKeysFor('customer');
        localStorage.removeItem(customerKeys.token);
        localStorage.removeItem(customerKeys.user);
        localStorage.removeItem(customerKeys.refresh);
        localStorage.removeItem('adminActiveBranch');
        localStorage.removeItem('adminBranchPicked');
        localStorage.removeItem('activeBranchId');
        localStorage.removeItem('isGuest');
        localStorage.removeItem('cart_by_table');
    } catch { /* ignore */ }
}

// ─── Cart line helpers ──────────────────────────────────────────────────
// Pure wrappers over utils/cart so the kiosk agrees with every other cart
// on line identity (item + size + add-ons, order-insensitive) and on
// totals. Kiosk lines: { menuItemId, unitPrice, qty, size, addons }.
// Storage stays kiosk-only (KIOSK_KEYS.CART above).
export { kioskLineKey };

/** Add `qty` of `line` to the cart, merging into an identical line. */
export function addKioskLine(cart, line, qty) {
    return upsertLine(cart, line, qty, { keyOf: kioskLineKey, qtyField: 'qty' });
}

/** Change the quantity of the line with this identity; drops it at 0. */
export function changeKioskLineQty(cart, line, delta) {
    return changeLineQty(cart, kioskLineKey(line), delta, { keyOf: kioskLineKey, qtyField: 'qty' });
}

/**
 * Per-unit add-on money on a kiosk line: each picked add-on's price ×
 * its count. ProductPopup quotes (unitPrice + this) × qty, so the cart
 * and the amount charged must include it too.
 */
export function kioskAddonsTotal(line) {
    return round2((Array.isArray(line?.addons) ? line.addons : [])
        .reduce((sum, a) => sum + (Number(a?.price) || 0) * (Number(a?.qty) || 0), 0));
}

/** Per-unit price of a kiosk line: size price + its add-ons. */
export function kioskLineUnitPrice(line) {
    return round2((Number(line?.unitPrice) || 0) + kioskAddonsTotal(line));
}

/** Pre-tax subtotal ((unitPrice + add-ons) × qty per line, rounded to paise). */
export function kioskSubtotal(cart) {
    return round2((Array.isArray(cart) ? cart : [])
        .reduce((sum, line) => sum + kioskLineUnitPrice(line) * (Number(line?.qty) || 0), 0));
}

/** Distinct products in the cart (the badge count), not total quantity. */
export function kioskItemCount(cart) {
    return countDistinctLines(cart);
}

// ─── Customer info (optional) ───────────────────────────────────────────
// Captured before payment when the kiosk operator wants to call the
// customer by name at pickup or send an SMS receipt. Stays opt-in.
export function readCustomerInfo() {
    try {
        const raw = localStorage.getItem(KIOSK_KEYS.CUSTOMER_INFO);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function writeCustomerInfo(info) {
    try {
        localStorage.setItem(KIOSK_KEYS.CUSTOMER_INFO, JSON.stringify(info || {}));
    } catch { /* ignore */ }
}

export function clearCustomerInfo() {
    try { localStorage.removeItem(KIOSK_KEYS.CUSTOMER_INFO); } catch { /* ignore */ }
}

// ─── Idempotency key for checkout ───────────────────────────────────────
// Cryptographically random (UUIDv4-ish) — survives a refresh, a Razorpay
// modal close, and a network retry, so the backend can deduplicate.
function generateIdempotencyKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `kiosk-${crypto.randomUUID()}`;
    }
    // Fallback for very old browsers — not crypto-quality but unique
    // enough for client-side dedup; backend still validates the format.
    const rand = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return `kiosk-${Date.now()}-${rand}`.slice(0, 80);
}

export function getOrCreateIdempotencyKey() {
    try {
        const existing = localStorage.getItem(KIOSK_KEYS.IDEMPOTENCY_KEY);
        if (existing && existing.length >= 16) return existing;
        const fresh = generateIdempotencyKey();
        localStorage.setItem(KIOSK_KEYS.IDEMPOTENCY_KEY, fresh);
        return fresh;
    } catch {
        return generateIdempotencyKey();
    }
}

export function clearIdempotencyKey() {
    try { localStorage.removeItem(KIOSK_KEYS.IDEMPOTENCY_KEY); } catch { /* ignore */ }
}

// ─── Tracking token ─────────────────────────────────────────────────────
export function writeTrackingToken(token) {
    try {
        if (token) localStorage.setItem(KIOSK_KEYS.TRACKING_TOKEN, token);
    } catch { /* ignore */ }
}

export function readTrackingToken() {
    try {
        return localStorage.getItem(KIOSK_KEYS.TRACKING_TOKEN) || null;
    } catch {
        return null;
    }
}

export function clearTrackingToken() {
    try { localStorage.removeItem(KIOSK_KEYS.TRACKING_TOKEN); } catch { /* ignore */ }
}

// ─── Last-placed order (bridges pay → success → token screens) ──────────
export function writeLastOrder(order) {
    try {
        localStorage.setItem(KIOSK_KEYS.LAST_ORDER, JSON.stringify(order));
    } catch { /* ignore */ }
}

export function readLastOrder() {
    try {
        const raw = localStorage.getItem(KIOSK_KEYS.LAST_ORDER);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearLastOrder() {
    try { localStorage.removeItem(KIOSK_KEYS.LAST_ORDER); } catch { /* ignore */ }
}

// ─── Tenant bootstrap ───────────────────────────────────────────────────
// A kiosk is a physical device pinned to one restaurant. We resolve the
// tenant in this order:
//   1. ?slug=<slug> in the current URL — one-time bootstrap for a fresh
//      kiosk install. Persists into activeTenant so refreshes keep working.
//   2. Existing activeTenant blob in localStorage — re-fetched from the
//      server every load so feature-flag changes (e.g. Super Admin
//      enabling the Kiosk add-on) propagate to a paired kiosk without
//      needing to re-launch with ?slug=.
// Returns the resolved tenant blob, or null if neither source exists.
//
// In-flight dedup: React StrictMode (dev) double-mounts every component,
// firing this function twice. Without the guard we issue two identical
// /public/restaurants/<slug> requests back-to-back. The dedup window also
// catches any future caller that triggers a re-mount within ~500ms (e.g.
// a parent context update during the landing page load). Production
// without StrictMode hits this once anyway, so the guard is pure
// defense — no behaviour change for the single-fire path.
let _bootstrapInFlight = null;
export async function bootstrapKioskTenant() {
    if (_bootstrapInFlight) return _bootstrapInFlight;
    _bootstrapInFlight = _bootstrapKioskTenantImpl().finally(() => {
        // Clear after a short tick so a legitimate re-fetch (e.g. user
        // re-launches with a new slug) isn't blocked by the cached
        // promise — but back-to-back StrictMode mounts collapse.
        setTimeout(() => { _bootstrapInFlight = null; }, 500);
    });
    return _bootstrapInFlight;
}

async function _bootstrapKioskTenantImpl() {
    const url = new URL(window.location.href);
    const slugParam = url.searchParams.get('slug') || url.searchParams.get('restaurant');

    // Source slug — URL param wins, otherwise reuse the cached tenant's slug.
    const cached = getActiveTenant();
    const targetSlug = (slugParam || cached?.slug || '').toLowerCase().trim();

    if (targetSlug) {
        try {
            const { data } = await publicAPI.getRestaurantBySlug(targetSlug);
            if (data?.success && data.data?.slug) {
                const r = data.data;
                setActiveTenant({
                    slug: r.slug,
                    name: r.name,
                    _id: r._id,
                    features: r.features || {},
                    branch: r.branch || cached?.branch || null,
                    branding: r.branding || cached?.branding || null,
                });
                if (slugParam) {
                    // Clean the slug param from the URL so the address bar stays tidy.
                    url.searchParams.delete('slug');
                    url.searchParams.delete('restaurant');
                    window.history.replaceState({}, '', url.pathname + (url.search || ''));
                }
                return getActiveTenant();
            }
        } catch {
            // Network blip / bad slug — fall back to the cached blob so
            // the kiosk stays usable offline. Feature flags may be stale
            // but the device keeps serving customers.
        }
    }

    return cached;
}
