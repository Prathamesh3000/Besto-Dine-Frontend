import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearKioskSession } from './kioskState';

// Activity events that should reset the idle clock. We listen on
// `window` in capture phase so a child component's stopPropagation
// can't accidentally suppress the reset.
//
// `mousemove` deliberately omitted — it fires hundreds of times per
// second on any cursor motion, which (a) does nothing useful on a
// touch kiosk and (b) hammered the activity ref and re-render path.
// pointerdown / touchstart cover real interaction; keydown handles
// the rare connected-keyboard case; wheel handles trackpad scroll.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

// Only push the secondsLeft update to React state when the customer
// is in the visible-countdown window (last 30s). For the first 90s
// of a 120s timeout we skip setState entirely — same behaviour, but
// instead of forcing the parent (Menu page with 50+ item cards) to
// re-render every second, it stays still.
const COUNTDOWN_VISIBLE_BELOW = 30;

/**
 * Drop a customer back to /kiosk after `timeoutSeconds` of no
 * interaction. Used by Menu, Cart and OrderType so a half-built cart
 * doesn't sit on the screen waiting for the next person.
 *
 * Returns the seconds remaining so the caller can render a small
 * countdown if it wants to (Menu shows it when ≤ 30s left). Returns
 * the full timeout when outside that window so the caller's threshold
 * check (e.g. `secondsLeft <= 30`) reads false without re-rendering.
 */
export function useKioskIdleReset(timeoutSeconds = 120) {
    const navigate = useNavigate();
    const [secondsLeft, setSecondsLeft] = useState(timeoutSeconds);
    // Init to 0; the mount effect below stamps the real timestamp once
    // we're past render. Keeps the hook pure (no Date.now() during render).
    const lastActivityRef = useRef(0);

    useEffect(() => {
        lastActivityRef.current = Date.now();
        const onActivity = () => { lastActivityRef.current = Date.now(); };
        ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, onActivity, { capture: true, passive: true }));
        return () => {
            ACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, onActivity, { capture: true }));
        };
    }, []);

    useEffect(() => {
        const tick = setInterval(() => {
            const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
            const remaining = Math.max(0, timeoutSeconds - elapsed);

            if (remaining === 0) {
                clearInterval(tick);
                clearKioskSession();
                navigate('/kiosk', { replace: true });
                return;
            }

            // Outside the visible countdown window — skip the setState
            // so we don't re-render the parent every second. setState
            // with the same value still bails out, but using the
            // functional updater + early-return is clearer.
            setSecondsLeft((prev) => {
                if (remaining > COUNTDOWN_VISIBLE_BELOW) {
                    // Keep prev so React bails out of the re-render.
                    return prev > COUNTDOWN_VISIBLE_BELOW ? prev : remaining;
                }
                return remaining;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [timeoutSeconds, navigate]);

    return secondsLeft;
}
