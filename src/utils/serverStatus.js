/**
 * serverStatus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-JS module (no React) that tracks whether the backend is reachable.
 *
 * Why a plain module instead of React Context?
 *   api.js needs to write to this state without importing React, so it must be
 *   a regular JS singleton. React components read it via useServerStatus().
 *
 * Flow:
 *   api.js response interceptor → reportNetworkFailure() / reportNetworkSuccess()
 *   → debouncer flips `_isDown` only after FAIL_THRESHOLD consecutive failures
 *   → notifies all subscribers (React hook state setters)
 *   → ServerStatusBanner in App.jsx shows/hides the offline bar
 *
 * Why a threshold? A single 30s timeout used to flash the red banner even
 * when React Query was about to retry and succeed — a false alarm. We now
 * wait for two consecutive failures (~the second retry exhausting) before
 * declaring the server down, and any successful response immediately clears
 * the counter. The legacy `setServerDown(boolean)` API is preserved so
 * older callers still work.
 */

const FAIL_THRESHOLD = 2;

let _isDown = false;
let _consecutiveFailures = 0;
const _listeners = new Set();
// Browser connectivity — see the online/offline section at the bottom.
let _isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

function _set(next) {
    if (_isDown === next) return;
    _isDown = next;
    _listeners.forEach(fn => fn(next));
}

/**
 * Increment the failure counter. Banner only flips on after we cross the
 * threshold — a transient timeout that React Query immediately retries
 * and succeeds will not flash the bar.
 */
export function reportNetworkFailure() {
    // Offline device: failures are expected, the offline banner covers it.
    if (_isOffline) return;
    _consecutiveFailures += 1;
    if (_consecutiveFailures >= FAIL_THRESHOLD) _set(true);
}

/**
 * A successful response — reset the counter and hide the banner.
 */
export function reportNetworkSuccess() {
    if (_consecutiveFailures === 0 && !_isDown) return;
    _consecutiveFailures = 0;
    _set(false);
}

/**
 * Legacy boolean API. Kept so existing callers compile; routes through
 * the new debouncer so the threshold still applies.
 */
export function setServerDown(isDown) {
    if (isDown) reportNetworkFailure();
    else reportNetworkSuccess();
}

/** Read current status synchronously (used to initialise React state). */
export function isServerDown() {
    return _isDown;
}

/**
 * Subscribe to status changes. Returns an unsubscribe function.
 * Used by the useServerStatus() React hook.
 */
export function subscribeServerStatus(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

// ── Browser connectivity (#29) ────────────────────────────────────────────
// navigator.onLine + the window online/offline events. Tracked here next
// to the server-reachability state so the banners share one module.
// While the device is offline, request failures are expected and must not
// flip the "server unreachable" banner; coming back online clears it.

const _onlineListeners = new Set();

function _setOffline(next) {
    if (_isOffline === next) return;
    _isOffline = next;
    if (!next) {
        // Back online — forget the failures we racked up while offline.
        _consecutiveFailures = 0;
        _set(false);
    }
    _onlineListeners.forEach(fn => fn(next));
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => _setOffline(false));
    window.addEventListener('offline', () => _setOffline(true));
}

/** True when the browser reports no network connection. */
export function isOffline() {
    return _isOffline;
}

/**
 * Subscribe to connectivity changes: fn(isOffline). Returns unsubscribe.
 */
export function subscribeOnlineStatus(fn) {
    _onlineListeners.add(fn);
    return () => _onlineListeners.delete(fn);
}
