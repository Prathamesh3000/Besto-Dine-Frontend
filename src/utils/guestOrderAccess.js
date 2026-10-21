/**
 * Guest order-access tokens (OPERATIONS_CONTROL_PANEL_DESIGN.md §12.2,
 * token-number mode).
 *
 * A guest who orders through the counter QR has no table and so no scan
 * session: the server cannot recognise them on GET /orders/:id/detail,
 * the tracking poll, the pay endpoints or the `order:<id>` socket room
 * the way it recognises a table guest (X-Scan-Token). POST /orders
 * therefore answers such an order with a one-off `guestAccessToken`
 * (+ `guestAccessExpiresAt`, 24 h). This module keeps those tokens, keyed
 * by order id (both the human `orderId` and the Mongo `_id`), in
 * localStorage under `guest_order_access_v1`, and tells the api client
 * (`X-Guest-Access` header) and the socket client (`join { room,
 * guestAccess }`) which token a request / room needs.
 *
 * Nothing here runs for a tenant with tables: no token is ever issued, so
 * every lookup answers null and the header / join shape stay as before.
 */

const KEY = 'guest_order_access_v1';
// Belt-and-braces mirror of the server's 24 h; the server decides.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function readAll() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function writeAll(map) {
    try {
        if (Object.keys(map).length === 0) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, JSON.stringify(map));
    } catch { /* storage unavailable — the token just is not remembered */ }
}

function isLive(entry, now = Date.now()) {
    if (!entry || typeof entry.token !== 'string' || !entry.token) return false;
    const exp = typeof entry.expiresAt === 'number' ? entry.expiresAt : Date.parse(entry.expiresAt);
    return Number.isFinite(exp) && exp > now;
}

/** Drop expired entries; returns the live map. */
function pruned(now = Date.now()) {
    const all = readAll();
    const live = {};
    let dropped = false;
    for (const [id, entry] of Object.entries(all)) {
        if (isLive(entry, now)) live[id] = entry;
        else dropped = true;
    }
    if (dropped) writeAll(live);
    return live;
}

/**
 * Remember `token` for every id in `ids` (orderId strings and/or _ids —
 * pass both so URL-by-_id and URL-by-orderId both resolve). `expiresAt`
 * is the server's ISO date / Date; missing → 24 h from now.
 */
export function rememberGuestOrderAccess(ids, token, expiresAt) {
    if (typeof token !== 'string' || !token) return;
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String);
    if (!list.length) return;
    const exp = expiresAt ? Date.parse(expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt)) : NaN;
    const expiresAtMs = Number.isFinite(exp) ? exp : Date.now() + DEFAULT_TTL_MS;
    const map = pruned();
    for (const id of list) map[id] = { token, expiresAt: expiresAtMs };
    writeAll(map);
}

/** The live token stored for an order id (orderId or _id), or null. */
export function guestOrderAccessFor(id) {
    if (id == null || id === '') return null;
    const entry = pruned()[String(id)];
    return entry ? entry.token : null;
}

/** Forget every token (guest session ended / tenant left). */
export function clearGuestOrderAccess() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Order-scoped customer endpoints: /orders/<id>/detail, /orders/track/<id>,
// /orders/<id>/payment, /orders/<id>/request-counter-payment, /orders/<id>/cancel …
const ORDER_URL_RE = /^\/orders\/(?:track\/)?([^/?#]+)/;
// Razorpay checkout calls name the order in the body instead.
const RAZORPAY_URL_RE = /^\/razorpay\/(?:create-order|verify-payment|orphan-refund)(?:[?#]|$)/;

/** The order id an api call is about (URL segment, or `cafeOrderId` in a Razorpay body), or null. */
export function orderIdOfRequest(url, data) {
    const path = typeof url === 'string' ? url.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v1(?=\/)/, '') : '';
    const m = ORDER_URL_RE.exec(path);
    if (m) {
        try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    if (RAZORPAY_URL_RE.test(path)) {
        let body = data;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { body = null; }
        }
        const id = body && typeof body === 'object' ? body.cafeOrderId : null;
        return id && id !== 'none' ? String(id) : null;
    }
    return null;
}

/** The `X-Guest-Access` value an api request needs, or null (the usual case). */
export function guestAccessForRequest(url, data) {
    const id = orderIdOfRequest(url, data);
    return id ? guestOrderAccessFor(id) : null;
}

/**
 * What to send with a socket `join`: the plain room name, or
 * `{ room, guestAccess }` for the `order:<id>` room of a remembered order.
 */
export function guestAccessJoinPayload(room) {
    if (typeof room !== 'string' || !room.startsWith('order:')) return room;
    const token = guestOrderAccessFor(room.slice('order:'.length));
    return token ? { room, guestAccess: token } : room;
}

export { KEY as GUEST_ORDER_ACCESS_KEY };
