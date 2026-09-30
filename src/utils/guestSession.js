/**
 * Guest-session validity helpers.
 *
 * A guest's table session is bounded by two layers:
 *
 *   1. Backend (authoritative). The signed X-Scan-Token JWT has a 4h
 *      TTL (SCAN_TOKEN_TTL). POST /orders rejects with 401
 *      SCAN_TOKEN_EXPIRED past that. The browser can do nothing to
 *      revive a real expired token; the customer must re-scan the QR.
 *
 *   2. Frontend (UX-only). A 24h cap on `guest_session_start` clears
 *      stale guest state in the browser. Without it, a tester (or a
 *      real customer) who closes the tab and re-opens it the next day
 *      lands on the customer cart with isGuest=true and an old
 *      dineInTable / scanToken — every action 401s with no recovery
 *      path. The 24h cap forces a clean fall-through to /branch-
 *      selection so the user is re-pointed at the QR.
 *
 * GST-005 — without this 24h cap, a guest with guest_session_start
 * older than a day can still tap through to Place Order. The backend
 * accepts the order if their scanToken is still in its 4h window
 * (e.g. they opened the page only minutes ago), or 401s confusingly
 * if not. Either way the UX is broken.
 */

const GUEST_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SESSION_EVENT = 'guestSessionChange';

/** True when isGuest is on AND guest_session_start is older than 24h. */
export function isGuestSessionExpired() {
    try {
        if (localStorage.getItem('isGuest') !== 'true') return false;
        const start = parseInt(localStorage.getItem('guest_session_start') || '0', 10);
        // No anchor means the session was never explicitly started (e.g.
        // an older client). Treat as fresh — don't punish users on the
        // first roll-out.
        if (!start) return false;
        return (Date.now() - start) > GUEST_SESSION_MAX_AGE_MS;
    } catch {
        return false;
    }
}

/**
 * Clear EVERY localStorage key tied to a guest table session. Mirrors
 * the keys that ScanTable.clearStaleSession + AuthContext.exitGuestMode
 * remove so the next ScanTable load (or branch-selection redirect)
 * starts from a clean slate.
 */
export function clearGuestSession() {
    try {
        localStorage.removeItem('scanToken');
        localStorage.removeItem('scanSessionStart');
        localStorage.removeItem('isGuest');
        localStorage.removeItem('guest_session_start');
        localStorage.removeItem('guest_cart_reset');
        localStorage.removeItem('guest_bill_paid_at');
        localStorage.removeItem('dineInTable');
        localStorage.removeItem('tableNumber');
        localStorage.removeItem('fromQrScan');
        localStorage.removeItem('cart');
        localStorage.removeItem('orderType');
        localStorage.removeItem('cafe_orders_v2');
    } catch { /* ignore */ }
    try { window.dispatchEvent(new Event(SESSION_EVENT)); } catch { /* ignore */ }
    try { window.dispatchEvent(new Event('storage_sync')); } catch { /* ignore */ }
}

export { GUEST_SESSION_MAX_AGE_MS, SESSION_EVENT };
