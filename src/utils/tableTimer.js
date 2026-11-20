// Pure helpers for the table timer (kept out of component files so fast refresh works).

/** Whole minutes between a start timestamp and `nowMs`, never below 0; null if the start is invalid. */
export function elapsedMinutes(startedAt, nowMs) {
    const start = Date.parse(startedAt);
    if (!Number.isFinite(start)) return null;
    return Math.max(0, Math.floor((nowMs - start) / 60000));
}

/** 42 -> "42 min"; 65 -> "1 h 05 min". */
export function formatDuration(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h} h ${String(m).padStart(2, '0')} min`;
}

/** 'ok' below amber, 'amber' from amberMinutes, 'red' from redMinutes. */
export function timerLevel(minutes, amberMinutes, redMinutes) {
    if (minutes >= redMinutes) return 'red';
    if (minutes >= amberMinutes) return 'amber';
    return 'ok';
}

// Mirrors the server rule: whole minutes 1..1440, red strictly after amber.
export const TIMER_MIN = 1;
export const TIMER_MAX = 1440;

export function validateTableTimer(amberRaw, redRaw) {
    const errors = {};
    const amber = Number(amberRaw);
    const red = Number(redRaw);
    const bad = (raw, n) => String(raw).trim() === '' || !Number.isInteger(n) || n < TIMER_MIN || n > TIMER_MAX;
    if (bad(amberRaw, amber)) errors.amber = `Enter whole minutes between ${TIMER_MIN} and ${TIMER_MAX}`;
    if (bad(redRaw, red)) errors.red = `Enter whole minutes between ${TIMER_MIN} and ${TIMER_MAX}`;
    if (!errors.amber && !errors.red && red <= amber) errors.red = 'Red must be later than amber';
    return errors;
}
