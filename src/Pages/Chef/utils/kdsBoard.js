/**
 * Pure helpers for the Kitchen Display System board (ChefDashboard).
 *
 * Kept free of React so they can be unit-tested directly and so the
 * dashboard's render path stays thin.
 */

/**
 * Hard ceiling on the number of order cards mounted at once across all
 * four columns.
 *
 * Why: a desktop soak (2026-10-13, staging) measured ~3 MB of renderer
 * memory per mounted card — every card ran its own 1 s `setInterval`
 * re-render and rebuilt its item lists on each tick, so 282 open orders
 * pushed the renderer to ~950 MB. A real kitchen tops out around 60–100
 * live tickets in a rush, and the KDS runs for 12 h on cheap hardware,
 * so the board must have a bounded DOM regardless of what the API returns.
 */
export const KDS_MAX_CARDS = 60;

/**
 * Column keys in the order they appear on the board. Exported so the
 * cap rule and the dashboard agree on the bucket list.
 */
export const BUCKET_KEYS = ['upcoming', 'prepare_now', 'preparing', 'ready_for_pickup'];

const toMs = (v) => {
    const ms = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(ms) ? ms : Infinity;
};

/**
 * Within a bucket, which cards survive the cap. Each bucket's DISPLAY
 * order is already "most urgent first" except `ready_for_pickup`, which
 * displays newest-ready first (the pass reads top-down as a FIFO the
 * waiter drains from the bottom). For `ready` we therefore rank by
 * urgency flag, then OLDEST first, so the tickets going cold on the
 * pass are never the ones that get hidden. Display order is restored
 * after selection, so the column still reads exactly as before.
 */
function keepPriority(bucketKey) {
    if (bucketKey !== 'ready_for_pickup') return null; // display order == priority
    return (a, b) => {
        if (!!a.isUrgent !== !!b.isUrgent) return a.isUrgent ? -1 : 1;
        return toMs(a.preparationCompletedAt || a.updatedAt || a.createdAt)
            - toMs(b.preparationCompletedAt || b.updatedAt || b.createdAt);
    };
}

function takeTop(list, n, bucketKey) {
    if (n >= list.length) return list;
    if (n <= 0) return [];
    const prio = keepPriority(bucketKey);
    if (!prio) return list.slice(0, n);
    const keep = new Set(list.slice().sort(prio).slice(0, n));
    return list.filter((o) => keep.has(o)); // original display order
}

/**
 * Apply the render cap to the bucketed board.
 *
 * Rule (documented here, asserted in __tests__/Pages/Chef/kdsBoard.test.js):
 *   1. The cap is on the TOTAL number of cards across all buckets.
 *   2. `upcoming` is trimmed first, all the way to zero if needed —
 *      nothing in it can be cooked yet, so hiding it loses no work.
 *   3. If the three active buckets still exceed the budget, the budget
 *      is split between them proportionally to their sizes (largest
 *      remainder), so every busy column keeps showing its head instead
 *      of one column swallowing the whole board.
 *   4. Inside a bucket the most urgent tickets are kept (see
 *      keepPriority); display order is preserved.
 *   5. Column badge counts and the banner report the TRUE totals, so
 *      nothing is silently lost — it is just not mounted yet.
 *
 * @param {Record<string, object[]>} buckets  keyed by BUCKET_KEYS
 * @param {number} max                        cap (default KDS_MAX_CARDS)
 * @returns {{ shown: Record<string, object[]>, hiddenByBucket: Record<string, number>, hiddenTotal: number, total: number }}
 */
export function capBuckets(buckets, max = KDS_MAX_CARDS) {
    const sizes = Object.fromEntries(BUCKET_KEYS.map((k) => [k, (buckets[k] || []).length]));
    const total = BUCKET_KEYS.reduce((n, k) => n + sizes[k], 0);

    const budget = Math.max(0, Math.floor(max));
    const allowance = { ...sizes };

    if (total > budget) {
        const activeKeys = BUCKET_KEYS.filter((k) => k !== 'upcoming');
        const activeTotal = activeKeys.reduce((n, k) => n + sizes[k], 0);

        if (activeTotal >= budget) {
            // Step 2: upcoming goes entirely; step 3: share the budget.
            allowance.upcoming = 0;
            let assigned = 0;
            const fractions = [];
            for (const k of activeKeys) {
                const exact = activeTotal ? (sizes[k] / activeTotal) * budget : 0;
                const floor = Math.floor(exact);
                allowance[k] = floor;
                assigned += floor;
                fractions.push({ k, frac: exact - floor });
            }
            // Largest-remainder: hand out the leftover slots, never above
            // a bucket's real size.
            fractions.sort((a, b) => b.frac - a.frac);
            let left = budget - assigned;
            for (const { k } of fractions) {
                if (left <= 0) break;
                if (allowance[k] < sizes[k]) { allowance[k] += 1; left -= 1; }
            }
            // Any slots still unassigned (because a bucket was full) go to
            // whichever active bucket still has hidden cards.
            for (const k of activeKeys) {
                while (left > 0 && allowance[k] < sizes[k]) { allowance[k] += 1; left -= 1; }
            }
        } else {
            // Only `upcoming` needs trimming.
            allowance.upcoming = budget - activeTotal;
        }
    }

    const shown = {};
    const hiddenByBucket = {};
    let hiddenTotal = 0;
    for (const k of BUCKET_KEYS) {
        const list = buckets[k] || [];
        shown[k] = takeTop(list, allowance[k], k);
        hiddenByBucket[k] = list.length - shown[k].length;
        hiddenTotal += hiddenByBucket[k];
    }
    return { shown, hiddenByBucket, hiddenTotal, total };
}

/**
 * Elapsed time between `startDateStr` and `nowMs` in the shape the
 * card renders ({ text, minutes, totalSec }). Mirrors
 * hooks/useOrderTimer's output, but takes the clock as an argument so
 * ONE shared ticker in the dashboard can drive every card instead of
 * each card owning a setInterval.
 */
export function formatElapsed(startDateStr, nowMs) {
    const startMs = new Date(startDateStr).getTime();
    const diffSec = Math.floor((nowMs - startMs) / 1000);
    if (!Number.isFinite(diffSec) || diffSec < 0) {
        return { text: '00:00', minutes: 0, totalSec: 0 };
    }
    return { text: formatElapsedText(diffSec), minutes: Math.floor(diffSec / 60), totalSec: diffSec };
}

// Same scale ladder as hooks/useOrderTimer: "12s" → "MM:SS" → "2h 05m" → "1d 03h".
function formatElapsedText(diffSec) {
    const MIN = 60;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    if (diffSec < MIN) return `${diffSec}s`;
    if (diffSec < HOUR) {
        return `${String(Math.floor(diffSec / MIN)).padStart(2, '0')}:${String(diffSec % MIN).padStart(2, '0')}`;
    }
    if (diffSec < DAY) {
        return `${Math.floor(diffSec / HOUR)}h ${String(Math.floor((diffSec % HOUR) / MIN)).padStart(2, '0')}m`;
    }
    return `${Math.floor(diffSec / DAY)}d ${String(Math.floor((diffSec % DAY) / HOUR)).padStart(2, '0')}h`;
}
