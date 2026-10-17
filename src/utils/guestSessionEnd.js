/**
 * Guest session end — a guest (QR scan, no login) is done once their
 * visit is complete: every order they placed is PAID and has been
 * COMPLETED (served / delivered). Then the app shows "guest mode is over"
 * and sends them to the login page.
 *
 *  - Dine-in: customers pay after eating, so this fires as soon as the
 *    final bill is settled — online or by staff at the counter.
 *  - Takeaway / pay-first: payment comes before the food, so it waits
 *    until the order is handed over and the guest can still track it.
 *  - No live tracking (operations profile: no kitchen screen / no served
 *    step — `orderFlow.customerTracking:false` in the customer blob): the
 *    server marks orders served the moment they are created, so "paid +
 *    served" says nothing about the food having arrived. There the visit
 *    is complete only once the most recent payment is GUEST_END_GRACE_MS
 *    (20 minutes) old. Tenants without such a profile keep the rule above.
 *
 * Cancelled orders don't count. A visit with no live orders isn't over
 * (they haven't ordered yet).
 *
 * `guest_session_ended` persists the result so a reload still shows the
 * popup instead of dropping the guest back into a finished session.
 */
import { getCustomerOperations } from './operations';

export const GUEST_SESSION_ENDED_KEY = 'guest_session_ended';

/** How long after the last payment a no-tracking visit is considered over. */
export const GUEST_END_GRACE_MS = 20 * 60 * 1000;

const PAID = new Set(['Paid', 'Refunded']);

function isCancelled(order) {
    const st = String(order?.status || '').toLowerCase();
    return st === 'cancelled' || st === 'canceled';
}

function isCompleted(order) {
    const st = String(order?.status || '').toLowerCase();
    if (st === 'served' || st === 'delivered' || st === 'completed') return true;
    // Home delivery tracks its own lifecycle.
    return String(order?.delivery?.status || '').toLowerCase() === 'delivered';
}

/**
 * True when the guest has no live order status to follow: the customer
 * profile says tracking is off (the backend derives it from the kitchen
 * screen; the full staff flags are honoured too if ever present).
 * Design doc §5.4: in that mode the server completes orders straight away.
 */
export function isGuestTrackingOff(ops) {
    const flow = ops?.orderFlow;
    if (!flow || typeof flow !== 'object') return false;
    return flow.customerTracking === false || flow.kitchenDisplay === false || flow.servedStep === false;
}

/** When the order was settled, as epoch ms (paidAt, else servedAt /
 *  updatedAt / createdAt from `/orders/:id/detail`); null if unknown. */
function settledAt(order) {
    for (const key of ['paidAt', 'servedAt', 'updatedAt', 'createdAt']) {
        const raw = order?.[key];
        if (!raw) continue;
        const ms = new Date(raw).getTime();
        if (Number.isFinite(ms)) return ms;
    }
    return null;
}

/**
 * Evaluate the guest's visit (see file header).
 * Returns `{ complete, recheckInMs }`: `recheckInMs` is set only when the
 * visit is settled but still inside the no-tracking grace period — the
 * caller should look again after that many ms.
 */
export function evaluateGuestVisit(orders, ops = getCustomerOperations(), now = Date.now()) {
    const live = (orders || []).filter((o) => o && !isCancelled(o));
    if (live.length === 0) return { complete: false, recheckInMs: null };
    const settled = live.every((o) => PAID.has(o.paymentStatus) && isCompleted(o));
    if (!settled) return { complete: false, recheckInMs: null };
    if (!isGuestTrackingOff(ops)) return { complete: true, recheckInMs: null };

    const times = live.map(settledAt).filter((t) => t != null);
    if (times.length === 0) return { complete: true, recheckInMs: null };
    const remaining = Math.max(...times) + GUEST_END_GRACE_MS - now;
    if (remaining <= 0) return { complete: true, recheckInMs: null };
    return { complete: false, recheckInMs: remaining };
}

/** True when the guest's visit is complete (see file header). */
export function isGuestVisitComplete(orders, ops, now) {
    return evaluateGuestVisit(orders, ops, now).complete;
}

export function readGuestSessionEnded() {
    try { return localStorage.getItem(GUEST_SESSION_ENDED_KEY) === '1'; } catch { return false; }
}

export function markGuestSessionEnded() {
    try { localStorage.setItem(GUEST_SESSION_ENDED_KEY, '1'); } catch { /* ignore */ }
}

export function clearGuestSessionEnded() {
    try { localStorage.removeItem(GUEST_SESSION_ENDED_KEY); } catch { /* ignore */ }
}
