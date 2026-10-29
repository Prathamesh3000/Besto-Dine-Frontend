import { paymentsFingerprint } from './tenderLines';

// Idempotency helpers for payment-type calls.
//
// The backend REQUIRES an `Idempotency-Key` header on order create,
// payment, refund, repeat and Razorpay routes. One logical user action
// must use ONE key, and every retry of that same action must REUSE it, so
// a double-tap / flaky-network retry is de-duplicated server-side instead
// of charging or creating twice.

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export function generateIdempotencyKey(prefix = 'web') {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `${prefix}-${crypto.randomUUID()}`;
        }
    } catch { /* insecure context — fall through */ }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}

// Merge the header into an axios request config: withIdempotencyKey(key, { _silent: true }).
// A falsy key returns the config untouched.
export function withIdempotencyKey(key, config = {}) {
    if (!key) return config;
    return { ...config, headers: { ...(config.headers || {}), [IDEMPOTENCY_HEADER]: key } };
}

// Per-action key store. get(name, fingerprint) returns the SAME key until
// the fingerprint (amount, order id, cart hash...) changes or reset(name)
// is called, so retries reuse it and a materially different action gets a
// fresh one. Keep one instance in a ref per screen.
export function createKeyStore() {
    const entries = new Map();
    return {
        get(name, fingerprint = '') {
            const fp = String(fingerprint);
            const hit = entries.get(name);
            if (hit && hit.fp === fp) return hit.key;
            const key = generateIdempotencyKey();
            entries.set(name, { fp, key });
            return key;
        },
        reset(name) {
            if (name === undefined) entries.clear();
            else entries.delete(name);
        },
    };
}

// Synchronous re-entrancy guard (React state updates are async, so two
// taps in the same tick can both read `isProcessing === false`). Use with
// a ref: `if (!guard.enter()) return; try {...} finally { guard.leave(); }`.
export function createActionGuard() {
    let busy = false;
    return {
        enter() { if (busy) return false; busy = true; return true; },
        leave() { busy = false; },
        get busy() { return busy; },
    };
}

// URLs the backend gates with an Idempotency-Key. api.js uses this as a
// safety net: a call that did not pass its own (retry-stable) key still
// gets a fresh one rather than being rejected.
const KEYED_RE = /^\/(?:orders(?:\/[^/?#]+\/(?:payment|repeat-all|repeat\/[^/?#]+))?|razorpay\/(?:create-order|verify-payment|refund|orphan-refund|create-wallet-recharge|verify-wallet-recharge)|wallet\/pay|advance-booking\/(?:create|[^/?#]+\/(?:create-remaining-payment|verify-remaining-payment)))(?:[?#]|$)/;
// PATCH /orders/:id/status is only keyed when the body marks money received.
const ORDER_STATUS_RE = /^\/orders\/[^/?#]+\/status(?:[?#]|$)/;

function parseBody(data) {
    if (data && typeof data === 'object') return data;
    if (typeof data === 'string' && data) {
        try { return JSON.parse(data); } catch { return null; }
    }
    return null;
}

// True when a PATCH /orders/:id/status body records a payment.
export function isOrderPaymentBody(data) {
    const b = parseBody(data);
    return !!b && (b.paymentStatus !== undefined || b.amountPaid !== undefined);
}

// `data` (the request body) is only needed to classify PATCH /orders/:id/status.
export function needsIdempotencyKey(method, url, data) {
    const m = String(method || 'get').toLowerCase();
    if (m !== 'post' && m !== 'patch') return false;
    const path = String(url || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/v\d+/, '');
    if (m === 'patch' && ORDER_STATUS_RE.test(path)) return isOrderPaymentBody(data);
    if (!KEYED_RE.test(path)) return false;
    // GET-only shapes like POST /orders/refunds don't exist; /orders alone is create.
    return true;
}

// Shared module-level stores for admin screens (survive modal unmounts, so a
// retry after closing/reopening the same action still reuses its key).
export const refundKeys = createKeyStore();
export const adminOrderKeys = createKeyStore();
export const repeatKeys = createKeyStore();
// Customer/waiter/kiosk Razorpay + wallet steps (create-order, verify,
// orphan-refund, wallet pay, wallet recharge). Fingerprints are the amount /
// order / payment id, so a retry reuses the key and a different amount or a
// different payment gets a new one. Call paymentKeys.reset() on success.
export const paymentKeys = createKeyStore();

// Staff "mark paid / settle" PATCH /orders/:id/status. One key per
// (orderId + method/amount/discount/tip fingerprint): retries of the same
// settle reuse it, a different amount or method gets a new one.
export const orderPayKeys = createKeyStore();
export function orderPayKey(orderId, body = {}) {
    const fp = [
        body.paymentStatus ?? '', String(body.paymentMethod ?? '').toLowerCase(),
        body.amountPaid ?? '', body.manualDiscount ?? '', body.tip ?? '',
        // Split tender: a different line set is a different settle.
        paymentsFingerprint(body.payments),
    ].join('|');
    return orderPayKeys.get(`pay:${orderId}`, fp);
}
// Axios config carrying the stable settle key: api.patch(url, body, orderPayConfig(id, body)).
export function orderPayConfig(orderId, body, config = {}) {
    return withIdempotencyKey(orderPayKey(orderId, body), config);
}
export function resetOrderPayKey(orderId) { orderPayKeys.reset(`pay:${orderId}`); }
