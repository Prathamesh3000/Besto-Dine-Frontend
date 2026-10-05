import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Clock } from 'lucide-react';
import useSocketEvent, { useSocketConnected, useSocketReconnect } from '../../hooks/useSocketEvent';
import { useAuth } from '../../Context/AuthContext';
import api from '../../utils/api';
import { activeRestaurantPath } from '../../utils/tenant';
import {
    SCAN_TABLE_PATH,
    SCAN_REQUIRED_EVENT,
    needsTableScan,
    clearDineInTable,
    requestTableScan,
} from '../../utils/dineInSession';
import { getCustomerOrderSession, readRecoveryOrderIds } from '../../utils/customerOrderIds';

/**
 * CustomerLayout — wrapper for every /loggedin and QR-guest page.
 *
 * Hosts the "session ended due to inactivity" overlay. Two trigger
 * paths, so this works even if one fails:
 *
 *   (a) Socket push — the backend sweeper auto-frees the table at
 *       the GRACE window and emits `session:ended` to the
 *       `table:<id>` room the guest joined on scan.
 *
 *   (b) Client-side watchdog — a 60-second setInterval checks
 *       "scanSessionStart" (stamped by ScanTable.jsx on QR scan)
 *       and fires locally if the guest has been here past the
 *       grace window with no order placed, independent of the
 *       socket delivery.
 *
 * (a) is faster and also syncs the admin side; (b) is the reliable
 * backup when sockets are flaky or the server event is missed.
 *
 * The whole system only runs for a QR-scan session (scanToken +
 * dineInTable in localStorage). A logged-in customer or an
 * unauthenticated browser at `/` is untouched.
 */
const GRACE_MINUTES_DEFAULT = 30;
const WATCHDOG_INTERVAL_MS = 60 * 1000;

const CustomerLayout = () => {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    // ── Table-scan gate ─────────────────────────────────────────────
    // Dine-in ordering must be bound to a scanned table. Anything that
    // discovers the table is missing (add-to-cart without a table, a
    // TABLE_UNAVAILABLE / TABLE_REQUIRED API error) fires
    // SCAN_REQUIRED_EVENT; route to the scan screen, which explains why.
    useEffect(() => {
        const onScanRequired = (e) => {
            if (window.location.pathname.startsWith('/scan')) return;
            navigate(SCAN_TABLE_PATH, { replace: true, state: { reason: e?.detail?.reason || 'no_table' } });
        };
        window.addEventListener(SCAN_REQUIRED_EVENT, onScanRequired);
        return () => window.removeEventListener(SCAN_REQUIRED_EVENT, onScanRequired);
    }, [navigate]);

    // Checkout pages are unreachable for a table-less dine-in guest
    // (deep link, back button, stale cart from before the table was
    // removed) — send them to scan instead of a doomed Place Order.
    useEffect(() => {
        const CHECKOUT_PATHS = ['/customer/cart', '/customer/payment'];
        if (CHECKOUT_PATHS.includes(pathname) && needsTableScan()) {
            navigate(SCAN_TABLE_PATH, { replace: true, state: { reason: 'no_table' } });
        }
    }, [pathname, navigate]);
    const { exitGuestMode, user, isLoggedIn } = useAuth();
    const [expired, setExpired] = useState(false);
    const [countdown, setCountdown] = useState(10);
    const [graceMinutes, setGraceMinutes] = useState(GRACE_MINUTES_DEFAULT);

    // ── Safety net: claim the dine-in table for the logged-in user ──
    // Login.jsx and OTP.jsx fire POST /tables/:id/claim on the happy
    // path, but a customer can land here through other routes too —
    // ProtectedRoute redirect-back, deep links, browser refresh on a
    // claimed session, etc. Without this re-trigger, those paths would
    // still show "Walk-in Guest" on the admin Live Feed drawer.
    //
    // The claim endpoint is idempotent for the same user and refuses
    // (409) for a different user, so calling it on every entry to the
    // customer layout is safe. We track per-table-id+user-id pairs in
    // a ref to avoid re-firing on every re-render.
    const claimedRef = useRef(new Set());
    const userIdForClaim = user?._id || user?.id || null;
    useEffect(() => {
        if (!isLoggedIn || !userIdForClaim) return;
        if (user?.role && user.role !== 'customer') return;   // only customers
        let tableId = null;
        try {
            const t = JSON.parse(localStorage.getItem('dineInTable') || 'null');
            tableId = t?._id || null;
        } catch { /* ignore */ }
        if (!tableId) return;

        const key = `${tableId}:${userIdForClaim}`;
        if (claimedRef.current.has(key)) return;
        claimedRef.current.add(key);

        api.post(`/tables/${tableId}/claim`).catch((err) => {
            // 409 = another diner already owns it — leave their snapshot
            // alone. Anything else is logged so a misconfigured tenant /
            // expired token shows up in the console without spamming the
            // user.
            if (err?.response?.status !== 409) {
                console.warn('[CustomerLayout] table claim failed:', err?.response?.data || err.message);
            }
        });
    }, [isLoggedIn, userIdForClaim, user?.role]);

    // Does this browser currently hold a QR scan session?
    const hasScanSession = useCallback(() => {
        if (typeof window === 'undefined') return false;
        const token = localStorage.getItem('scanToken');
        let table = null;
        try { table = JSON.parse(localStorage.getItem('dineInTable') || 'null'); } catch { /* ignore */ }
        return Boolean(token && table?._id);
    }, []);

    const currentTableId = useCallback(() => {
        try {
            const t = JSON.parse(localStorage.getItem('dineInTable') || 'null');
            return t?._id || null;
        } catch { return null; }
    }, []);

    // Returns true if this guest has remembered order IDs for the current
    // session — a rough proxy for "placed something since scanning".
    // The admin-side sweeper uses the authoritative Mongo check; this
    // is just the client-side fallback, so a coarse check is fine.
    const hasPlacedAnyOrder = useCallback(() => {
        try {
            return readRecoveryOrderIds(getCustomerOrderSession(user, isLoggedIn)).length > 0;
        } catch { return false; }
    }, [user, isLoggedIn]);

    // ── Path (a): socket push from the backend sweeper ────────────
    useSocketEvent('session:ended', (payload = {}) => {
        if (!hasScanSession()) return;
        const myTableId = currentTableId();
        if (payload.tableId && myTableId && String(payload.tableId) !== String(myTableId)) return;
        if (payload.graceMinutes) setGraceMinutes(Number(payload.graceMinutes));
        setExpired(true);
    });

    // ── QA #14: the admin deleted / disabled this table ───────────
    // Lock ordering the moment it happens instead of letting the diner
    // build a cart that fails at Place Order. Same hand-off the API
    // layer uses for a TABLE_UNAVAILABLE response: drop the dead table
    // binding and route to the scan screen, which explains why.
    const tableGone = useCallback(() => {
        clearDineInTable();
        requestTableScan('table_removed');
    }, []);
    useSocketEvent('table:unavailable', (payload = {}) => {
        const myTableId = currentTableId();
        if (!myTableId || String(payload.tableId) !== String(myTableId)) return;
        tableGone();
    });
    // A push can be missed (screen off, network drop): re-check when the
    // socket reconnects or the page becomes visible again.
    const checkTableStillAvailable = useCallback(() => {
        const myTableId = currentTableId();
        if (!myTableId) return;
        api.get(`/tables/${myTableId}/availability`, { _silent: true, _isBackground: true })
            .then((res) => { if (res?.data?.available === false) tableGone(); })
            .catch(() => { /* offline / transient — the next check or Place Order catches it */ });
    }, [currentTableId, tableGone]);
    useSocketReconnect(checkTableStillAvailable);
    useEffect(() => {
        const onVisible = () => { if (document.visibilityState === 'visible') checkTableStillAvailable(); };
        checkTableStillAvailable();
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [checkTableStillAvailable]);

    // ── Path (b): client-side watchdog ────────────────────────────
    // BUG #23 — while the socket is live, the server's session:ended
    // push (table:<id> room, auto-joined from the scan token) is the
    // source of truth, so the 60s ticker only runs while disconnected.
    // One check still runs on mount / whenever connectivity flips so a
    // push missed while offline is caught.
    const socketLive = useSocketConnected();
    useEffect(() => {
        if (expired) return;
        const check = () => {
            if (expired) return;
            if (!hasScanSession()) return;
            const start = Number(localStorage.getItem('scanSessionStart') || 0);
            if (!start) return;
            const elapsedMin = (Date.now() - start) / 60000;
            if (elapsedMin < graceMinutes) return;
            if (hasPlacedAnyOrder()) return;   // they're a real active guest
            setExpired(true);
        };
        check();                                        // run once immediately
        if (socketLive) return undefined;
        const id = setInterval(check, WATCHDOG_INTERVAL_MS);
        return () => clearInterval(id);
    }, [expired, graceMinutes, hasScanSession, currentTableId, hasPlacedAnyOrder, socketLive]);

    // Countdown + redirect once the overlay is up.
    useEffect(() => {
        if (!expired) return;
        if (countdown <= 0) {
            exitGuestMode();
            try { localStorage.removeItem('scanSessionStart'); } catch { /* ignore */ }
            navigate(activeRestaurantPath(), { replace: true });
            return;
        }
        const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
        return () => clearTimeout(t);
    }, [expired, countdown, exitGuestMode, navigate]);

    const handleLeaveNow = () => {
        exitGuestMode();
        try { localStorage.removeItem('scanSessionStart'); } catch { /* ignore */ }
        navigate(activeRestaurantPath(), { replace: true });
    };

    return (
        <div className="w-full min-h-screen xl:px-[300px] bg-white">
            <Outlet />

            {expired && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 font-manrope">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
                        <div className="mx-auto w-16 h-16 rounded-full bg-[#FFF3E6] flex items-center justify-center mb-5">
                            <Clock size={28} className="text-[#FE8301]" strokeWidth={1.75} />
                        </div>
                        <h2 className="text-[20px] font-[700] text-gray-900">Session ended</h2>
                        <p className="text-[14px] text-gray-500 mt-2 leading-relaxed">
                            No order was placed for {graceMinutes} minutes, so your dine-in session has ended.
                            Scan the QR code again when you're ready.
                        </p>
                        <p className="text-[12px] text-gray-400 mt-4">
                            Redirecting in {countdown}…
                        </p>
                        <button
                            onClick={handleLeaveNow}
                            className="w-full mt-5 py-3 bg-[#FE8301] text-white rounded-[10px] font-[600] text-[15px] hover:bg-[#DC6803] transition-colors"
                        >
                            Leave now
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerLayout;
