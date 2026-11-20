import { useSyncExternalStore } from 'react';

/**
 * Server-synchronised clock + shared ticker for the table timer.
 *
 * The device clock can be wrong (hours off), so elapsed time is always
 * computed against the SERVER's clock: every tables response carries
 * `serverTime`; we keep offset = serverTime - deviceNow (module level, so
 * every card shares it) and expose serverNow() = Date.now() + offset.
 *
 * One setInterval drives every subscribed timer (not one per card). It only
 * bumps a version number; nothing touches the network on a tick.
 */

export const DEFAULT_TABLE_TIMER = Object.freeze({ amberMinutes: 60, redMinutes: 90 });
export const TICK_MS = 30_000;
export const TABLE_TIMER_ROLES = ['admin', 'manager', 'captain'];

let offsetMs = 0;
let config = { ...DEFAULT_TABLE_TIMER };
let version = 0;
const listeners = new Set();
let intervalId = null;

const emit = () => { version += 1; listeners.forEach((l) => l()); };

/** Whether this role is allowed to see table timers at all. */
export const canSeeTableTimer = (role) => TABLE_TIMER_ROLES.includes(role);

/**
 * Record the server/device clock offset from a response's `serverTime`.
 * `sentAt` / `receivedAt` (device ms) optionally compensate for half the
 * round trip. Invalid / missing serverTime leaves the offset untouched.
 */
export function syncServerClock(serverTime, sentAt, receivedAt) {
    const server = Date.parse(serverTime);
    if (!Number.isFinite(server)) return;
    const local = (Number.isFinite(sentAt) && Number.isFinite(receivedAt))
        ? (sentAt + receivedAt) / 2
        : Date.now();
    offsetMs = server - local;
    emit();
}

export const getServerOffset = () => offsetMs;
export const serverNow = () => Date.now() + offsetMs;

const validInt = (n) => Number.isInteger(n) && n >= 1 && n <= 1440;

/** Adopt thresholds from the API; invalid input is ignored (defaults stay). */
export function setTableTimerConfig(cfg) {
    const amber = Number(cfg?.amberMinutes);
    const red = Number(cfg?.redMinutes);
    if (!validInt(amber) || !validInt(red) || red <= amber) return;
    if (amber === config.amberMinutes && red === config.redMinutes) return;
    config = { amberMinutes: amber, redMinutes: red };
    emit();
}
export const getTableTimerConfig = () => config;

/** Convenience: feed it any response body carrying serverTime / tableTimer. */
export function ingestTableTimerMeta(body, sentAt, receivedAt) {
    if (!body || typeof body !== 'object') return;
    if (body.serverTime) syncServerClock(body.serverTime, sentAt, receivedAt);
    if (body.tableTimer) setTableTimerConfig(body.tableTimer);
}

/** Test helper. */
export function resetServerClock() {
    offsetMs = 0;
    config = { ...DEFAULT_TABLE_TIMER };
    emit();
}

const onVisible = () => { if (document.visibilityState === 'visible') emit(); };

function subscribe(listener) {
    listeners.add(listener);
    if (listeners.size === 1) {
        intervalId = setInterval(emit, TICK_MS);
        document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            clearInterval(intervalId);
            intervalId = null;
            document.removeEventListener('visibilitychange', onVisible);
        }
    };
}

/** Subscribe to the shared ticker; returns the current server time (ms). */
export default function useServerClock() {
    useSyncExternalStore(subscribe, () => version);
    return serverNow();
}
