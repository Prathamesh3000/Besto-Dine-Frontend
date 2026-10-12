import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { clearGuestSession } from '../../utils/guestSession';
import { clearOrderIds, getCustomerOrderSession, readRecoveryOrderIds } from '../../utils/customerOrderIds';
import {
    isGuestVisitComplete, readGuestSessionEnded, markGuestSessionEnded, clearGuestSessionEnded,
} from '../../utils/guestSessionEnd';

const POLL_MS = 30 * 1000;

/**
 * GuestSessionEnd — mounted once at app root.
 *
 * While the visitor is a GUEST (QR scan, no login) it watches their
 * orders. Once the visit is complete — every order paid and served
 * (utils/guestSessionEnd) — it shows "guest mode is over" with a single
 * OK button; OK ends the guest session and opens the login page.
 *
 * Checks run on mount, on any live order update (online payment, staff
 * settling at the counter, kitchen marking served), when the tab comes
 * back into view, and every 30s as a fallback for a dropped socket.
 */
export default function GuestSessionEnd() {
    const { isGuest, isLoggedIn, exitGuestMode } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [open, setOpen] = useState(() => readGuestSessionEnded());
    const checking = useRef(false);

    const onKiosk = location.pathname.startsWith('/kiosk');
    const active = isGuest && !isLoggedIn && !onKiosk;

    const check = useCallback(async () => {
        if (!active || checking.current) return;
        if (readGuestSessionEnded()) { setOpen(true); return; }
        const ids = readRecoveryOrderIds(getCustomerOrderSession(null, false));
        if (!ids.length) return;
        checking.current = true;
        try {
            const results = await Promise.allSettled(ids.map((id) =>
                api.get(`/orders/${encodeURIComponent(id)}/detail`, { _silent: true, _isBackground: true })));
            const orders = results
                .filter((r) => r.status === 'fulfilled' && r.value?.data?.order)
                .map((r) => r.value.data.order);
            if (isGuestVisitComplete(orders)) {
                markGuestSessionEnded();
                setOpen(true);
            }
        } finally {
            checking.current = false;
        }
    }, [active]);

    useEffect(() => {
        if (!active) return undefined;
        check();
        const timer = setInterval(check, POLL_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') check(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('dineInLockChange', check);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('dineInLockChange', check);
        };
    }, [active, check]);

    useSocketEvent('order:updated', () => { if (active) check(); });

    const finish = () => {
        setOpen(false);
        clearGuestSessionEnded();
        clearOrderIds();
        clearGuestSession();
        exitGuestMode();
        navigate('/login', { replace: true });
    };

    if (!open || !active) return null;

    return (
        <div
            className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-session-end-title"
            data-testid="guest-session-end"
        >
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={28} className="text-emerald-600" />
                </div>
                <h2 id="guest-session-end-title" className="text-lg font-bold text-slate-800 mb-2">
                    Guest mode is over
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    You are in guest mode, and guest mode ends once your final bill is paid.
                    Thank you for dining with us!
                </p>
                <button
                    type="button"
                    onClick={finish}
                    autoFocus
                    className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition"
                >
                    OK
                </button>
            </div>
        </div>
    );
}
