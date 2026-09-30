import { useState, useEffect } from 'react';

/**
 * Live mm:ss elapsed timer for an order card.
 *
 * `serverOffsetMs` = (clientNow - serverTime) at the moment the last
 * /orders/kitchen response arrived. Subtracting it from Date.now() on
 * every tick gives a drift-corrected "server now" — a kitchen tablet
 * with a clock that's 5 min fast no longer shows every order as 5 min
 * older than it really is.
 *
 *   elapsed = (Date.now() - serverOffsetMs) - new Date(startDateStr)
 *
 * When the caller hasn't resolved an offset yet (first render, offline
 * start) the default of 0 just means "trust the local clock" — same
 * behaviour as before this hook existed.
 */
export default function useOrderTimer(startDateStr, serverOffsetMs = 0) {
    // Force a rerender once per second; the elapsed value itself is
    // derived from the current args on each render so it stays in sync
    // when `startDateStr` or `serverOffsetMs` change without needing a
    // re-initialising setState inside useEffect.
    const [, forceTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => forceTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [startDateStr, serverOffsetMs]);

    return formatElapsed(startDateStr, serverOffsetMs);
}

function formatElapsed(startDateStr, serverOffsetMs) {
    const correctedNow = Date.now() - (serverOffsetMs || 0);
    const diffSec = Math.floor((correctedNow - new Date(startDateStr).getTime()) / 1000);
    if (!Number.isFinite(diffSec) || diffSec < 0) {
        return { text: '00:00', minutes: 0, totalSec: 0 };
    }
    const minutes = Math.floor(diffSec / 60);
    return {
        text: formatElapsedText(diffSec),
        minutes,
        totalSec: diffSec,
    };
}

// Scales the label to the longest meaningful unit so the chef can read
// it at a glance:
//   < 1 min   → "12s"
//   < 1 hr    → "MM:SS"  (familiar kitchen timer format)
//   < 1 day   → "2h 05m"
//   ≥ 1 day   → "1d 03h"
// Without the scale, an order parked overnight would show "1440:00" or
// worse, which nobody can parse at a glance.
function formatElapsedText(diffSec) {
    const SEC = 1;
    const MIN = 60;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;

    if (diffSec < MIN) {
        return `${diffSec}s`;
    }
    if (diffSec < HOUR) {
        const m = Math.floor(diffSec / MIN);
        const s = diffSec % MIN;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    if (diffSec < DAY) {
        const h = Math.floor(diffSec / HOUR);
        const m = Math.floor((diffSec % HOUR) / MIN);
        return `${h}h ${String(m).padStart(2, '0')}m`;
    }
    const d = Math.floor(diffSec / DAY);
    const h = Math.floor((diffSec % DAY) / HOUR);
    return `${d}d ${String(h).padStart(2, '0')}h`;
}
