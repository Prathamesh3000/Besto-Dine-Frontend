/**
 * useCustomerSession — one reactive view of "where is this customer in
 * their visit, and what are they allowed to do right now?"
 *
 * Why this exists
 * ---------------
 * Twenty files read the raw localStorage visit keys directly
 * (`dineInTable`, `tableNumber`, `orderType`, `scanToken`, `isGuest`,
 * `guest_bill_paid_at`, `dineInBillSettled`). Each one re-derived what
 * those keys MEAN, and they disagreed. The post-payment state is the
 * clearest example: `dineInLocked` disabled the Add-to-Cart and
 * Ask-for-Water buttons and relabelled them "🔒 Locked", while the
 * table number in the header — read from a different key, in a
 * different file — carried on displaying as though the meal were still
 * running. A customer who had already paid saw a half-live screen.
 *
 * Components should ask this hook a QUESTION ("may I order?") rather
 * than reading a key and inferring an answer. The inference lives here,
 * once.
 *
 * Phases
 * ------
 *   'browsing'  no table — takeaway, or a logged-in customer browsing
 *   'seated'    a scanned table with a live session; ordering allowed
 *   'settled'   bill paid; the visit is over until a fresh QR scan
 */

import { useEffect, useState, useCallback } from 'react';
import { isDineInLocked } from '../utils/dineInSession';
import { isGuestSessionExpired } from '../utils/guestSession';

/** Every key whose change should re-derive the session. */
const WATCHED_KEYS = new Set([
    'dineInTable',
    'tableNumber',
    'orderType',
    'scanToken',
    'isGuest',
    'guest_bill_paid_at',
    'dineInBillSettled',
]);

function readLS(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function readTable() {
    try {
        const raw = localStorage.getItem('dineInTable');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const id = parsed?._id || parsed?.id;
        if (!id) return null;
        return { id, name: parsed.name || readLS('tableNumber') || null };
    } catch {
        return null;
    }
}

/** Derive the whole session snapshot from storage. Pure + synchronous. */
export function readCustomerSession() {
    const table = readTable();
    const isGuest = readLS('isGuest') === 'true';
    const orderType = readLS('orderType') || (table ? 'dine-in' : 'takeaway');
    const settled = isDineInLocked();
    const guestExpired = isGuest && isGuestSessionExpired();

    const phase = settled ? 'settled' : (table ? 'seated' : 'browsing');

    // A guest whose 24h window has lapsed has no usable session left —
    // the backend will 401 every action — so treat them as unable to
    // act rather than letting them fill a cart that cannot be placed.
    const sessionUsable = !guestExpired;

    return {
        phase,
        table,
        orderType,
        isGuest,
        isDineIn: orderType === 'dine-in',

        /** May they add items / place an order? */
        canOrder: sessionUsable && phase !== 'settled'
            && (orderType !== 'dine-in' || Boolean(table)),

        /** May they call a waiter / ask for water? Dine-in only. */
        canRequestService: sessionUsable && phase === 'seated',

        /**
         * Should table-bound chrome (the table pill, service buttons)
         * render at all? After settling, the visit is over — hiding
         * these is the difference between "your meal is finished" and
         * a screen full of dead controls.
         */
        showTableChrome: phase === 'seated',

        /** True once the bill is paid and before a fresh QR scan. */
        isSettled: phase === 'settled',
        guestExpired,
    };
}

export default function useCustomerSession() {
    const [session, setSession] = useState(readCustomerSession);

    const resync = useCallback(() => setSession(readCustomerSession()), []);

    useEffect(() => {
        // `storage` covers other tabs; the two custom events cover
        // same-tab writes, which `storage` does NOT fire for. Both
        // dineInSession and guestSession already broadcast these.
        const onStorage = (e) => {
            if (!e.key || WATCHED_KEYS.has(e.key)) resync();
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener('dineInLockChange', resync);
        window.addEventListener('guestSessionChange', resync);
        // A tab returning to the foreground may have missed events
        // while backgrounded (e.g. staff settled the bill meanwhile).
        window.addEventListener('focus', resync);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('dineInLockChange', resync);
            window.removeEventListener('guestSessionChange', resync);
            window.removeEventListener('focus', resync);
        };
    }, [resync]);

    return session;
}
