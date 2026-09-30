import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// useBlockBackNav — prevents the browser back button from returning the
// user to an earlier step of a multi-step flow.
//
// Used on payment-success / order-confirmed screens so that once the
// customer has paid, hitting the device back button (or browser back
// arrow) cannot drop them back into the Payment or Review screen where
// they could re-trigger a charge or edit an already-finalised booking.
//
// How it works:
//   1. On mount we push ONE sentinel history entry (a copy of the current
//      router state tagged with SENTINEL) so the next back press pops the
//      sentinel instead of leaving the page. If the current entry already
//      is our sentinel (StrictMode double-mount, a re-render with a new
//      redirect target, or coming back to this page via forward/back) we
//      don't push again — the old version pushed on every mount AND every
//      popstate, piling up duplicate entries.
//   2. When the user presses back, popstate fires; we `navigate(redirectTo,
//      { replace: true })`, which overwrites the entry we landed on (the
//      guarded previous step) with the safe destination. No extra push.
//   3. On unmount we remove the listener.
//
// Caveats:
//   - Doesn't block JavaScript-initiated navigation (router push). It's
//     a UX guard against the device back button only.
//   - The browser cannot disable back-nav outright; the best we can do
//     is redirect it. This hook does that.
const SENTINEL = '__blockBackNav';

export default function useBlockBackNav(redirectTo = '/') {
    const navigate = useNavigate();
    // Latest target without re-running the effect (and re-pushing) when
    // the caller passes a new string instance each render.
    const targetRef = useRef(redirectTo);
    useEffect(() => { targetRef.current = redirectTo; }, [redirectTo]);

    const active = !!redirectTo;

    useEffect(() => {
        // No-op when the caller doesn't want the guard active (e.g. a
        // shared page that only guards back-nav on its "success" state).
        if (!active) return undefined;

        const current = window.history.state;
        if (!current || !current[SENTINEL]) {
            // Preserve React Router's own state (key / idx / usr) so the
            // router still recognises the entry.
            window.history.pushState({ ...(current || {}), [SENTINEL]: true }, '', window.location.href);
        }

        let redirected = false;
        const onPop = (e) => {
            // Moving forward onto our own sentinel is not a back press.
            if (e.state && e.state[SENTINEL]) return;
            if (redirected) return;
            redirected = true;
            if (targetRef.current) navigate(targetRef.current, { replace: true });
        };

        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [navigate, active]);
}
