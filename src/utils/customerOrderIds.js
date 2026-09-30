/**
 * Customer order list — session identity + guest recovery IDs (#22).
 *
 * The customer "Your Order" screen renders SERVER data only (React Query
 * key ['customer', 'orders', sessionKey]). The browser keeps nothing but
 * a short list of order IDs so a guest (no account → no /my-orders) can
 * find their orders again after a reload. Every ID is re-fetched through
 * an endpoint that enforces ownership (logged-in owner or matching scan
 * session), so a stale / foreign ID simply 404s and is dropped — nothing
 * cached on the phone is ever displayed as-is.
 *
 * The ID list is stamped with the scan session and user it belongs to and
 * is ignored (and overwritten) the moment neither matches, so a shared
 * phone never carries one diner's list into the next diner's session.
 */

const IDS_KEY = 'customer_order_ids_v1';
const LEGACY_ORDERS_KEY = 'cafe_orders_v2';
const MAX_IDS = 30;

export const CUSTOMER_ORDERS_ROOT = ['customer', 'orders'];

function decodeJwtPayload(token) {
    try {
        const part = String(token).split('.')[1];
        if (!part) return null;
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

function readTableId() {
    try {
        const dt = JSON.parse(localStorage.getItem('dineInTable') || '{}');
        return dt?._id || dt?.id || null;
    } catch {
        return null;
    }
}

/** The scan session this browser currently holds (guest QR flow). */
export function readScanSessionId() {
    try {
        const token = localStorage.getItem('scanToken');
        if (!token) return null;
        const payload = decodeJwtPayload(token);
        return payload?.sessionId ? String(payload.sessionId) : `tok:${token.slice(-24)}`;
    } catch {
        return null;
    }
}

/**
 * Who the order list belongs to right now. `key` is null when there is
 * nobody to fetch orders for (logged out, guest without a table scan).
 */
export function getCustomerOrderSession(user, isLoggedIn) {
    const userId = isLoggedIn ? (user?._id || user?.id || null) : null;
    const scanSession = readScanSessionId();
    const tableId = readTableId();
    let key = null;
    if (userId) key = `user:${userId}`;
    else if (scanSession) key = `guest:${scanSession}`;
    else if (tableId) key = `table:${tableId}`;
    return { key, userId: userId ? String(userId) : null, scanSession, tableId, isLoggedIn: !!userId };
}

function readStore() {
    try {
        const raw = JSON.parse(localStorage.getItem(IDS_KEY) || 'null');
        return raw && Array.isArray(raw.ids) ? raw : null;
    } catch {
        return null;
    }
}

function storeBelongsTo(store, session) {
    if (!store) return false;
    if (store.scanSession && session.scanSession && store.scanSession === session.scanSession) return true;
    if (store.userId && session.userId && store.userId === session.userId) return true;
    return false;
}

/**
 * Order IDs to recover for this session: our own stamped list plus the
 * IDs (only) of the legacy `cafe_orders_v2` cache left behind by older
 * app versions. Newest first, de-duplicated, capped.
 */
export function readRecoveryOrderIds(session) {
    const ids = [];
    const store = readStore();
    if (storeBelongsTo(store, session)) ids.push(...store.ids);
    try {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_ORDERS_KEY) || '[]');
        if (Array.isArray(legacy)) {
            for (const o of legacy) {
                const id = o?.orderId || o?.id;
                if (typeof id === 'string' && id) ids.push(id);
            }
        }
    } catch { /* ignore corrupt cache */ }
    return [...new Set(ids)].slice(0, MAX_IDS);
}

/** Remember order IDs for this session (replaces a foreign session's list). */
export function rememberOrderIds(session, newIds) {
    if (!session?.scanSession && !session?.userId) return;
    const clean = (newIds || []).filter((id) => typeof id === 'string' && id);
    if (!clean.length) return;
    try {
        const store = readStore();
        const prev = storeBelongsTo(store, session) ? store.ids : [];
        const ids = [...new Set([...clean, ...prev])].slice(0, MAX_IDS);
        localStorage.setItem(IDS_KEY, JSON.stringify({
            scanSession: session.scanSession || store?.scanSession || null,
            userId: session.userId || (storeBelongsTo(store, session) ? store.userId : null) || null,
            ids,
        }));
    } catch { /* storage best-effort */ }
}

/** Drop IDs the server no longer lets this session see. */
export function forgetOrderIds(session, deadIds) {
    if (!deadIds?.length) return;
    try {
        const store = readStore();
        if (!storeBelongsTo(store, session)) return;
        const dead = new Set(deadIds);
        localStorage.setItem(IDS_KEY, JSON.stringify({ ...store, ids: store.ids.filter((id) => !dead.has(id)) }));
    } catch { /* ignore */ }
}

export function clearOrderIds() {
    try { localStorage.removeItem(IDS_KEY); } catch { /* ignore */ }
}
