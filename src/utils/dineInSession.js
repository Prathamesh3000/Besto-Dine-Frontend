/**
 * Dine-in session lock — once the bill is settled, the customer's
 * UI freezes until they physically re-scan the table QR. Without this
 * a customer who paid then kept browsing could place a SECOND order
 * on the same table without staff knowledge, breaking the table's
 * settle/release lifecycle.
 *
 * State lives in localStorage under `dineInBillSettled` so it
 * survives page reloads + tab switches in the same session. Re-
 * scanning the QR clears the flag (see ScanTable.jsx).
 *
 * The lock only applies when the customer is in a dine-in session
 * (has `dineInTable` in localStorage). Takeaway / logged-in browsing
 * is unaffected — those flows have their own session model.
 */
import { useEffect, useState } from 'react';

const FLAG = 'dineInBillSettled';
const EVT  = 'dineInLockChange';

function readFlag() {
    try { return localStorage.getItem(FLAG) === '1'; } catch { return false; }
}

function readDineInActive() {
    try {
        const raw = localStorage.getItem('dineInTable');
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!(parsed && (parsed._id || parsed.id));
    } catch { return false; }
}

// A guest's bill counts as settled as soon as `guest_bill_paid_at` is
// stamped — that happens not only on their own Payment page (which also
// sets the flag above) but when staff settle at the counter and the
// Orders / Bill pages pick the Paid status up from the server. Those
// paths only stamped the timestamp, so the session never flipped to
// "settled" and Ask-for-Water / Call-a-Waiter / the table pill stayed
// live after the visit was over.
function readGuestBillPaid() {
    try {
        return localStorage.getItem('isGuest') === 'true'
            && Boolean(localStorage.getItem('guest_bill_paid_at'));
    } catch { return false; }
}

/** Check the current lock state (synchronous). */
export function isDineInLocked() {
    return (readFlag() || readGuestBillPaid()) && readDineInActive();
}

/** Flag the dine-in bill as settled. Idempotent. */
export function markDineInBillSettled() {
    try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
    try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
}

/** Route that asks the customer to scan their table's QR code. */
export const SCAN_TABLE_PATH = '/scan';
/** Fired when an action needs a scanned table; CustomerLayout routes to SCAN_TABLE_PATH. */
export const SCAN_REQUIRED_EVENT = 'dineInScanRequired';

/**
 * True when a GUEST is in a dine-in visit but no table is bound to the
 * session — they skipped the QR, or the restaurant removed their table.
 * A guest must scan a table QR before dine-in ordering (the backend
 * also refuses guest dine-in orders without a scan token). Staff and
 * logged-in customers never match: staff pick tables in their own
 * flow, and logged-in browsing (bookings, takeaway) has no table.
 */
export function needsTableScan() {
    try {
        if (readDineInActive()) return false;
        if (localStorage.getItem('isGuest') !== 'true') return false;
        return localStorage.getItem('orderType') !== 'takeaway';
    } catch { return false; }
}

/** Ask the app to send the customer to the scan screen. */
export function requestTableScan(reason = 'no_table') {
    try { window.dispatchEvent(new CustomEvent(SCAN_REQUIRED_EVENT, { detail: { reason } })); } catch { /* ignore */ }
}

/**
 * Drop the table binding (table deleted / disabled by the restaurant).
 * Keeps auth + tenant so the customer only has to scan a table again.
 */
export function clearDineInTable() {
    try {
        localStorage.removeItem('dineInTable');
        localStorage.removeItem('tableNumber');
        localStorage.removeItem('scanToken');
        localStorage.removeItem('scanSessionStart');
        localStorage.removeItem('fromQrScan');
        localStorage.removeItem(FLAG);
        localStorage.setItem('orderType', 'dine-in');
    } catch { /* ignore */ }
    try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
    try { window.dispatchEvent(new Event('guestSessionChange')); } catch { /* ignore */ }
    try { window.dispatchEvent(new Event('storage_sync')); } catch { /* ignore */ }
}

/** Clear the lock — called by ScanTable on a fresh scan. */
export function clearDineInLock() {
    try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
    try { window.dispatchEvent(new Event(EVT)); } catch { /* ignore */ }
}

/**
 * React hook — reactive lock flag. Re-renders subscribers when the
 * flag is set / cleared in any tab + when the dine-in session
 * itself changes.
 */
export function useDineInLock() {
    const [locked, setLocked] = useState(isDineInLocked);
    useEffect(() => {
        const sync = () => setLocked(isDineInLocked());
        window.addEventListener(EVT, sync);
        window.addEventListener('storage', sync);
        // Re-evaluate on focus too — some browsers don't fire
        // 'storage' for same-tab writes which the dispatched event
        // covers, but a focus return is a good belt-and-braces hook.
        window.addEventListener('focus', sync);
        return () => {
            window.removeEventListener(EVT, sync);
            window.removeEventListener('storage', sync);
            window.removeEventListener('focus', sync);
        };
    }, []);
    return locked;
}
