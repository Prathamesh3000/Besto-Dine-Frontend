import { io } from 'socket.io-client';
import { getToken, identityMismatch } from './authStorage';

// Derive the Socket.io server URL from the API URL (strip /api/v1 suffix)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const SOCKET_URL = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');

let socket = null;

// Per-resource rooms (order:<id>, table:<id>, t:<rid>:menu) to re-request
// after every (re)connect. Staff role rooms are NOT tracked here — the
// server auto-joins those from the authenticated identity on connect.
const _rooms = new Set();

// ── Connection state (for useSocketConnected / reconnect resync) ────────
// `connectCount` increments on every successful connect, so consumers can
// tell a first connect (1) from a reconnect (>1) and resync their data.
let _connected = false;
let _connectCount = 0;
const _listeners = new Set();
const _reconnectListeners = new Set();

function notify() {
    _listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function subscribeSocketState(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

export function isSocketConnected() {
    return _connected;
}

/**
 * Register a callback fired on every RE-connect (not the first connect).
 * Use it to invalidate live queries so events missed while offline are
 * picked up. Returns an unsubscribe fn.
 */
export function onSocketReconnect(fn) {
    _reconnectListeners.add(fn);
    return () => _reconnectListeners.delete(fn);
}

// When a refresh attempt says the session is gone, connect as a guest
// (scan token only) instead of looping on a dead access token.
let _skipUserToken = false;

function tokenExpMs(token) {
    try {
        const part = token.split('.')[1];
        const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
        return typeof json.exp === 'number' ? json.exp * 1000 : null;
    } catch {
        return null;
    }
}

function readSocketAuth() {
    // Pass both credentials — the server verifies whichever is present.
    // Staff users have a JWT; QR guests only have a scan token. The token
    // is this tab's audience (platform / staff / customer — see
    // authStorage); if another tab has since signed a different account
    // into that audience, don't hand the server that account's token.
    const token = (_skipUserToken || identityMismatch()) ? null : (getToken() || null);
    return {
        token,
        scanToken: localStorage.getItem('scanToken') || null,
    };
}

/**
 * Access tokens are short-lived (30 min). Before a (re)connect handshake,
 * refresh the stored token if it's expired / within 60 s of expiry so the
 * server doesn't reject the handshake.
 */
async function ensureFreshToken({ force = false } = {}) {
    if (identityMismatch()) return null;
    const token = getToken();
    if (!token) return null;
    const exp = tokenExpMs(token);
    if (!force && (!exp || exp - Date.now() > 60 * 1000)) return token;
    try {
        const { refreshSession } = await import('./api');
        const fresh = await refreshSession();
        return fresh || null;
    } catch {
        return token; // network error — keep the session, retry later
    }
}

async function readSocketAuthFresh() {
    if (!_skipUserToken) await ensureFreshToken();
    return readSocketAuth();
}

// Always assign THIS function to socket.auth (never a static object), so
// every handshake reads — and if needed refreshes — the current token.
function socketAuthFn(cb) {
    readSocketAuthFresh().then(cb, () => cb(readSocketAuth()));
}

/**
 * Get or create the singleton socket connection.
 * Call this from components/contexts that need real-time updates.
 */
export function getSocket() {
    if (!socket) {
        socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            // Keep trying forever (capped backoff) — a kitchen tablet that
            // lost Wi-Fi for 5 minutes must come back on its own.
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionDelayMax: 15000,
            autoConnect: true,
            // Server-side `io.use` reads these from socket.handshake.auth to
            // populate socket.data.{userId,role,branchId,restaurant,scan},
            // then auto-joins the tenant-scoped rooms for that identity.
            // The auth callback runs on EVERY handshake (first connect and
            // each reconnect), so a near-expiry access token is refreshed
            // before it's presented.
            auth: socketAuthFn,
        });

        // Server rejects expired / revoked user tokens with AUTH_EXPIRED /
        // AUTH_REVOKED (a middleware rejection does NOT auto-reconnect).
        // First failure: refresh the access token and reconnect. If that
        // fails again (or the session is gone), reconnect as a guest
        // (scan-token-only) so customer/table rooms keep working.
        let authFailures = 0;
        socket.on('connect_error', async (err) => {
            const code = err?.data?.code || err?.message;
            if (code !== 'AUTH_EXPIRED' && code !== 'AUTH_REVOKED') return;
            authFailures += 1;
            if (authFailures === 1) {
                const fresh = await ensureFreshToken({ force: true });
                if (!fresh) _skipUserToken = true;
            } else {
                _skipUserToken = true;
            }
            setTimeout(() => { try { socket.connect(); } catch { /* ignore */ } }, 500);
        });

        // BUG #12 — socket.io-client v4's Socket never emits 'reconnect'
        // (only the Manager does). 'connect' fires on the first connect
        // AND on every reconnect, so re-request per-resource rooms here.
        socket.on('connect', () => {
            authFailures = 0;
            _rooms.forEach((room) => socket.emit('join', room));
            _connected = true;
            _connectCount += 1;
            notify();
            if (_connectCount > 1) {
                _reconnectListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
            }
        });
        socket.on('disconnect', () => {
            _connected = false;
            notify();
        });
        socket.on('connect_error', () => {
            if (_connected) { _connected = false; notify(); }
        });

        // CRIT-24 — server pushes `auth:reload` after role/branch/status
        // changes. Bounce the socket so the next handshake carries the
        // current token and the new identity takes effect on every gate.
        socket.on('auth:reload', () => {
            try {
                socket.disconnect();
                socket.auth = socketAuthFn;
                socket.connect();
            } catch { /* ignore */ }
        });
    }
    return socket;
}

/**
 * Join a per-resource room (`order:<orderId>`, `table:<tableId>`,
 * `t:<restaurantId>:menu`). The server authorizes every join against the
 * socket's authenticated identity. Rooms are re-requested on reconnect.
 */
export function joinRoom(room) {
    if (!room) return;
    const s = getSocket();
    _rooms.add(room);
    if (s.connected) s.emit('join', room);
    // else: the 'connect' handler above joins everything in _rooms.
}

/**
 * Leave a room previously joined with joinRoom.
 */
export function leaveRoom(room) {
    if (!room) return;
    _rooms.delete(room);
    if (socket && socket.connected) socket.emit('leave', room);
}

/**
 * Staff role rooms are now tenant-namespaced (`t:<restaurantId>:<role>` /
 * `t:<restaurantId>:<role>:<branchId>`) and joined by the SERVER on
 * connect from the socket's JWT — clients can no longer pick them (BUG #6).
 * Kept for backward compatibility: it just makes sure the socket exists.
 * Returns null (nothing for the caller to leave).
 */
// eslint-disable-next-line no-unused-vars
export function joinStaffRoom(_role, _branchId) {
    getSocket();
    return null;
}

/**
 * Public, tenant-scoped menu-change room (BUG #24). Anyone may listen;
 * the server only sends `menu:updated` pings with public item ids there.
 */
export function joinMenuRoom(restaurantId) {
    if (!restaurantId) return null;
    const room = `t:${restaurantId}:menu`;
    joinRoom(room);
    return room;
}

/**
 * Disconnect socket (call on logout).
 */
export function disconnectSocket() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
    _rooms.clear();
    _skipUserToken = false;
    _connected = false;
    _connectCount = 0;
    notify();
}

/**
 * Force the socket to re-authenticate using the current localStorage token.
 *
 * The singleton socket may have been opened BEFORE login (token was null
 * at handshake time); the server auto-joins rooms only at connection time,
 * so reconnect after login / token refresh so staff rooms take effect.
 */
export function reconnectWithAuth() {
    if (!socket) return;
    try {
        _skipUserToken = false; // fresh login → try the user token again
        socket.auth = socketAuthFn;
        socket.disconnect();
        socket.connect();
    } catch { /* ignore */ }
}
