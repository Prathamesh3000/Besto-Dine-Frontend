import { useEffect, useRef, useState, useCallback } from 'react';

// useExitConfirmation
// ───────────────────────────────────────────────────────────────────────
// Intercepts the browser back button (and the Android hardware back
// button — same popstate event) on whatever page mounts this hook, and
// asks the user to confirm before letting them leave.
//
// Why it's needed: customers land on /customer/home from a QR scan or
// branch pick and there's nothing meaningful behind it. A single
// accidental back tap currently dumps them out of the cafe flow with
// no warning — they have to re-scan / re-pick to recover. This hook
// pops a "Exit? Stay / Exit" sheet first.
//
// Pattern (a.k.a. the "sentinel" trick — there's no native API to
// cancel a popstate, so we work around it):
//   1. On mount we push a sentinel history entry. The URL doesn't
//      change, but the browser's back stack now has an extra step.
//   2. The first back-press pops the sentinel. popstate fires while
//      the URL is still our page. We re-push another sentinel (so
//      the next back will also fire popstate) and open the modal.
//   3. If the user picks Stay → close the modal; the new sentinel is
//      already in place for the next back-press.
//   4. If the user picks Exit → detach our popstate listener so the
//      next pop doesn't re-open the modal, then go(-2) to skip both
//      the sentinel AND the real page entry, landing on whatever was
//      in history before this page (or doing nothing if this was the
//      first entry — browsers silently no-op in that case).
//
// Disable the guard temporarily (e.g. while another modal is open and
// you want the user's back to close THAT first) by passing `enabled=false`.
export function useExitConfirmation(enabled = true) {
  const [isOpen, setIsOpen] = useState(false);
  const handlerRef = useRef(null);
  // Mirror `enabled` into a ref so the popstate handler — which is
  // installed once and never re-bound — always sees the latest value
  // without us needing to re-attach on every toggle.
  const enabledRef = useRef(enabled);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  useEffect(() => {
    // Sentinel goes on the stack the moment the page is reachable so a
    // user who taps back immediately is still caught.
    window.history.pushState({ __exitGuard: true }, '', window.location.href);

    const onPop = () => {
      if (!enabledRef.current) return;
      // Re-push so the URL stays put and the next back-press lands here too.
      window.history.pushState({ __exitGuard: true }, '', window.location.href);
      setIsOpen(true);
    };
    handlerRef.current = onPop;
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []); // install once; enabled changes use the ref

  // User confirmed they want to leave: detach the guard, then jump back
  // past both the sentinel we just pushed AND the current page entry so
  // they land where they were before this page.
  const confirmExit = useCallback(() => {
    setIsOpen(false);
    if (handlerRef.current) {
      window.removeEventListener('popstate', handlerRef.current);
      handlerRef.current = null;
    }
    window.history.go(-2);
  }, []);

  const cancelExit = useCallback(() => setIsOpen(false), []);

  return { isOpen, confirmExit, cancelExit };
}

export default useExitConfirmation;
