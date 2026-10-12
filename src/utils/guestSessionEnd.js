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
 *
 * Cancelled orders don't count. A visit with no live orders isn't over
 * (they haven't ordered yet).
 *
 * `guest_session_ended` persists the result so a reload still shows the
 * popup instead of dropping the guest back into a finished session.
 */

export const GUEST_SESSION_ENDED_KEY = 'guest_session_ended';

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

/** True when the guest's visit is complete (see file header). */
export function isGuestVisitComplete(orders) {
    const live = (orders || []).filter((o) => o && !isCancelled(o));
    if (live.length === 0) return false;
    return live.every((o) => PAID.has(o.paymentStatus) && isCompleted(o));
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
