import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { waiterAPI } from '../utils/api';
import { useAuth } from './AuthContext';
import { getSocket, joinRoom } from '../utils/socket';
import { useSocketConnected, useSocketReconnect } from '../hooks/useSocketEvent';
import { getActiveTenantSlug, subscribeActiveTenant } from '../utils/tenant';
import toast from 'react-hot-toast';

const NotificationContext = createContext();

// Polling intervals (ms)
const POLL_NORMAL   = 15_000;  // 15 s while the socket is DOWN
const POLL_STAFF_SAFETY = 90_000; // slow staff safety poll while the socket is up (BUG #23)
const POLL_GUEST    = 15_000;  // 15 s for guest order status
const POLL_REQUESTS = 15_000;  // 15 s for service requests. Socket.io is the
                               // primary path (instant request:updated event);
                               // this poll is purely a safety net for dropped
                               // sockets. Was 5 s — 720 req/hr per diner — but
                               // 15 s halves traffic without hurting UX since
                               // most state changes arrive via socket anyway.
                               // behind the primary socket path so the customer
                               // still sees status changes if the socket drops.

// ── Web Audio Notification Sounds ──────────────────────────────────────────
// All sounds are generated programmatically — no external files needed.

let audioCtx = null;
let lastSoundTime = 0;
const SOUND_THROTTLE_MS = 2000; // Min 2s between sounds to prevent rapid-fire dings

function getAudioContext() {
    if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) return null;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
}

function playTone(frequency, duration, type = 'sine', volume = 0.3) {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    } catch {
        // Audio not supported or blocked — silently ignore
    }
}

// Chef: urgent double-ding (new order in kitchen)
function playChefAlert() {
    playTone(880, 0.15, 'sine', 0.4);      // A5
    setTimeout(() => playTone(1100, 0.2, 'sine', 0.4), 180); // C#6
}

// Waiter: bright bell chime (order ready / customer request)
function playWaiterChime() {
    playTone(660, 0.12, 'sine', 0.3);      // E5
    setTimeout(() => playTone(880, 0.12, 'sine', 0.3), 140);  // A5
    setTimeout(() => playTone(1100, 0.25, 'sine', 0.3), 280); // C#6
}

// Customer: soft pop (status update)
function playCustomerPop() {
    playTone(520, 0.08, 'sine', 0.2);
    setTimeout(() => playTone(780, 0.15, 'sine', 0.2), 100);
}

// Admin: cash register ding
function playAdminDing() {
    playTone(1200, 0.08, 'triangle', 0.3);
    setTimeout(() => playTone(1500, 0.15, 'triangle', 0.25), 120);
}

function playSoundForRole(role) {
    // Throttle: prevent rapid-fire sounds when multiple notifications arrive at once
    const now = Date.now();
    if (now - lastSoundTime < SOUND_THROTTLE_MS) return;
    lastSoundTime = now;

    switch (role) {
        case 'chef':    playChefAlert();    break;
        case 'waiter':
        case 'captain': playWaiterChime();  break;
        case 'customer': playCustomerPop(); break;
        case 'admin':   playAdminDing();    break;
        default:        playCustomerPop();  break;
    }
}

// ── Provider ───────────────────────────────────────────────────────────────

export const NotificationProvider = ({ children }) => {
    const { user, isGuest } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [soundEnabled, setSoundEnabled] = useState(true);

    const prevUnreadRef = useRef(-1); // -1 = not yet loaded (skip first fetch)
    const hasInteractedRef = useRef(false);
    const guestPrevStatusRef = useRef(null);
    // requestId → last-seen status. Used by the guest request poller to
    // detect pending → accepted / accepted → completed transitions so we
    // can toast the customer ("Waiter is on the way", etc.).
    const guestRequestStatusRef = useRef(new Map());

    const userId = user?._id || user?.id;
    const role = user?.role || 'admin';
    const isStaffRole = ['admin', 'manager', 'chef', 'waiter', 'captain', 'superadmin'].includes(role);
    // BUG #23 — polls below only run at full speed while the socket is down.
    const socketLive = useSocketConnected();

    // Reactive tenant-slug tracking. Required because /notifications is a
    // tenant-scoped endpoint — Phase 3 STRICT_TENANT_ENFORCEMENT returns
    // 400 TENANT_REQUIRED for any request without X-Restaurant-Slug.
    // Customer email/password login lands on /branch-selection BEFORE
    // picking a tenant, so polling that fires the moment `user` becomes
    // truthy was producing 3+ red 400s per login on a freshly seeded
    // session. Gating `enabled` below on `hasTenantSlug` skips the call
    // until the customer picks a branch. Subscribing here makes the gate
    // reactive — the query auto-resumes the instant setActiveTenant() is
    // called by BranchSelection / ScanTable.
    const [hasTenantSlug, setHasTenantSlug] = useState(() => !!getActiveTenantSlug());
    useEffect(() => {
        const update = () => setHasTenantSlug(!!getActiveTenantSlug());
        const unsub = subscribeActiveTenant(update);
        // Cross-tab login on another window fires the storage event —
        // sync the gate so the picker on one tab unblocks polling here.
        window.addEventListener('storage', update);
        return () => {
            unsub();
            window.removeEventListener('storage', update);
        };
    }, []);

    // Track user interaction so AudioContext can be resumed (browser policy)
    useEffect(() => {
        if (window.__audioInteracted) {
            hasInteractedRef.current = true;
            return;
        }
        const markInteracted = () => {
            hasInteractedRef.current = true;
            window.__audioInteracted = true;
        };
        window.addEventListener('click', markInteracted);
        window.addEventListener('touchstart', markInteracted);
        window.addEventListener('keydown', markInteracted);
        return () => {
            window.removeEventListener('click', markInteracted);
            window.removeEventListener('touchstart', markInteracted);
            window.removeEventListener('keydown', markInteracted);
        };
    }, []);

    // ── Notifications query (replaces manual polling + backoff) ─────────────
    const { data: notifications = [], isLoading: loading } = useQuery({
        queryKey: ['notifications', userId],
        queryFn: async () => {
            const res = await api.get(
                `/notifications?role=${role}&userId=${userId}`,
                { _isBackground: true }
            );
            if (res.data.success) return res.data.notifications;
            return [];
        },
        enabled: !!user && hasTenantSlug,
        refetchInterval: (query) => {
            // Pause polling once the session is invalid — no point hammering
            // /notifications with an expired token until the user logs in again.
            // 400 = TENANT_REQUIRED (request landed before X-Restaurant-Slug
            // was set); the `enabled` gate above should normally prevent it,
            // but treat it as terminal here too so a race doesn't keep
            // retrying.
            const status = query.state.error?.response?.status;
            if (status === 400 || status === 401 || status === 403) return false;
            // BUG #23 — the live socket delivers notification:new instantly.
            // Customers stop polling while connected; staff keep a slow
            // safety poll. Full-speed polling only while disconnected.
            if (socketLive) return isStaffRole ? POLL_STAFF_SAFETY : false;
            return POLL_NORMAL;
        },
        retry: (failureCount, error) => {
            // Auth failures and tenant-context failures are terminal until
            // the user resolves them (re-login / branch pick); retrying
            // just spams the console and the backend.
            const status = error?.response?.status;
            if (status === 400 || status === 401 || status === 403) return false;
            return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000), // exponential backoff on failure
    });

    const unreadCount = useMemo(
        () => notifications.filter(n => n.status === 'unread').length,
        [notifications]
    );

    // ── Sound effect when unread count increases ────────────────────────────
    useEffect(() => {
        if (prevUnreadRef.current >= 0 && soundEnabled && hasInteractedRef.current && unreadCount > prevUnreadRef.current) {
            playSoundForRole(role);
        }
        prevUnreadRef.current = unreadCount;
    }, [unreadCount, soundEnabled, role]);

    // ── Debounced invalidation (BUG #23) ────────────────────────────────────
    // A burst of socket events (e.g. 10 items bumped in one KOT) used to
    // fire 10 refetches. Coalesce per query key into one refetch ~300 ms
    // after the burst settles.
    const invalidateTimersRef = useRef(new Map());
    const scheduleInvalidate = useCallback((queryKey) => {
        const id = JSON.stringify(queryKey);
        const timers = invalidateTimersRef.current;
        if (timers.has(id)) clearTimeout(timers.get(id));
        timers.set(id, setTimeout(() => {
            timers.delete(id);
            queryClient.invalidateQueries({ queryKey });
        }, 300));
    }, [queryClient]);
    useEffect(() => {
        const timers = invalidateTimersRef.current;
        return () => { timers.forEach(clearTimeout); timers.clear(); };
    }, []);

    // ── Invalidate helper (used by socket + mutations) ──────────────────────
    const invalidateNotifications = useCallback(
        () => scheduleInvalidate(['notifications', userId]),
        [scheduleInvalidate, userId]
    );

    // ── Mark as read mutation ───────────────────────────────────────────────
    // Optimistic update so the "new" dot / badge drops the instant the
    // user clicks — don't wait for the roundtrip.
    const markAsReadMutation = useMutation({
        mutationFn: (id) => api.put(`/notifications/${id}/read`, { role, userId }),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['notifications', userId] });
            const prev = queryClient.getQueryData(['notifications', userId]);
            queryClient.setQueryData(['notifications', userId], (old = []) =>
                old.map(n => (id === 'all' || n._id === id) ? { ...n, status: 'read' } : n)
            );
            return { prev };
        },
        onError: (_err, _id, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(['notifications', userId], ctx.prev);
        },
        onSuccess: () => invalidateNotifications(),
    });

    const markAsRead = useCallback(
        (id) => markAsReadMutation.mutate(id),
        [markAsReadMutation]
    );

    // Dedicated "mark all read" mutation — hits /notifications/all/read
    // (route is listed before /:id/read so the path resolves correctly).
    // Kept separate from markAsRead so callers don't pass the magic 'all'
    // string through an id parameter.
    const markAllAsReadMutation = useMutation({
        mutationFn: () => api.put('/notifications/all/read', { role, userId }),
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['notifications', userId] });
            const prev = queryClient.getQueryData(['notifications', userId]);
            queryClient.setQueryData(['notifications', userId], (old = []) =>
                old.map(n => ({ ...n, status: 'read' }))
            );
            return { prev };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(['notifications', userId], ctx.prev);
        },
        onSuccess: () => invalidateNotifications(),
    });

    const markAllAsRead = useCallback(
        () => markAllAsReadMutation.mutate(),
        [markAllAsReadMutation]
    );

    // ── Clear all mutation ──────────────────────────────────────────────────
    const clearAllMutation = useMutation({
        mutationFn: () => api.delete('/notifications/clear', { data: { role, userId } }),
        onSuccess: () => {
            // Optimistic: clear immediately, then refetch
            queryClient.setQueryData(['notifications', userId], []);
            prevUnreadRef.current = 0;
        },
    });

    const clearAll = useCallback(
        () => clearAllMutation.mutate(),
        [clearAllMutation]
    );

    // ── Delete single notification mutation (optimistic) ───────────────
    const deleteOneMutation = useMutation({
        mutationFn: (id) => api.delete(`/notifications/${id}`),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ['notifications', userId] });
            const prev = queryClient.getQueryData(['notifications', userId]);
            queryClient.setQueryData(['notifications', userId], (old = []) =>
                old.filter(n => n._id !== id)
            );
            return { prev };
        },
        onError: (_err, _id, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(['notifications', userId], ctx.prev);
        },
        onSuccess: () => invalidateNotifications(),
    });

    const deleteNotification = useCallback(
        (id) => deleteOneMutation.mutate(id),
        [deleteOneMutation]
    );

    const toggleSound = useCallback(() => setSoundEnabled(prev => !prev), []);

    const testSound = useCallback(() => {
        if (user?.role) playSoundForRole(user.role);
        else playCustomerPop();
    }, [user]);

    // ── Socket Connection ──────────────────────────────────────────────────
    useEffect(() => {
        if (!user) return;

        // BUG #6 — staff role rooms are tenant-namespaced
        // (t:<restaurantId>:<role>[:<branchId>]) and, together with the
        // user's own userId room, are joined by the SERVER on every
        // (re)connect from the socket's JWT. Nothing to join here.
        const socket = getSocket();

        // Titles we deliberately swallow on the customer side. The order
        // confirmation screen + the wallet/loyalty animation already give
        // the customer enough feedback at checkout — a second toast for
        // "Order Placed" and a third for "Payment Confirmed" is just
        // noise on the customer's screen. Staff still see them.
        const CUSTOMER_SUPPRESSED_TITLES = new Set([
            'Order Placed',
            'Payment Confirmed',
            'Payment Confirmed (Webhook)',
        ]);

        const handleNewNotification = (data) => {
            invalidateNotifications();
            if (soundEnabled && hasInteractedRef.current) {
                playSoundForRole(role);
            }
            if (data?.title) {
                if (role === 'customer' && CUSTOMER_SUPPRESSED_TITLES.has(data.title)) {
                    return;
                }
                toast.success(`${data.title}: ${data.description || ''}`, {
                    duration: 5000,
                    icon: '🔔'
                });
            }
        };

        const handleNewOrder = (data) => {
            invalidateNotifications();
            // chef + waiter + captain + manager hear the new-order ping via
            // their kitchen / waiter rooms. (Admin gets the same line via
            // notification:new — it isn't in those rooms, so it's excluded
            // here to avoid a double toast.) Build a glanceable line from
            // the socket payload: order type, the table for dine-in, and a
            // short item list — matching the admin toast's shape. Falls back
            // to the old static text for legacy payloads with no `type`.
            // Manager now listens on the admin room (server auto-join) and
            // gets the admin "New Order" notification:new line instead.
            if (['chef', 'waiter', 'captain'].includes(role)) {
                if (soundEnabled && hasInteractedRef.current) playSoundForRole(role);
                let message = 'New Order Received!';
                if (data?.type) {
                    const typeLabel = data.type === 'dine-in' ? 'Dine-in' : 'Takeaway';
                    const tablePart = (data.type === 'dine-in' && data.tableName) ? ` · Table ${data.tableName}` : '';
                    const itemsPart = data.items ? ` · ${data.items}` : '';
                    message = `New Order: ${typeLabel}${tablePart}${itemsPart}`;
                }
                toast.success(message, { duration: 4000, icon: '🔥' });
            }
        };

        const handleOrderReady = () => {
            invalidateNotifications();
            if (role === 'waiter' || role === 'captain') {
                if (soundEnabled && hasInteractedRef.current) playSoundForRole(role);
                toast.success('An order is READY for pickup!', { duration: 6000, icon: '🍽️' });
            }
        };

        const handleOrderUpdated = (payload) => {
            invalidateNotifications();
            scheduleInvalidate(['liveOrders']);
            // Once anyone settles the bill, drop the sticky "Cash payment
            // requested" popup on every other staff screen too.
            if (payload?.orderId && /^paid$/i.test(String(payload?.paymentStatus || ''))) {
                toast.dismiss(`counter-payment-${payload.orderId}`);
            }
        };

        const handleRequestNew = (data) => {
            invalidateNotifications();
            if (role === 'waiter' || role === 'captain') {
                if (soundEnabled && hasInteractedRef.current) playSoundForRole(role);
                toast.success(data?.message || 'New table request received!', { duration: 5000, icon: '🙋' });
            }
        };

        const handleRequestUpdated = () => {
            invalidateNotifications();
            scheduleInvalidate(['requests']);
        };

        // CUS-037 fix: dine-in customers tap "Cash" → backend fires
        // `counter-payment:requested` to admin + waiter rooms but the
        // frontend had no listener, so no actionable prompt was ever
        // shown and the customer's "waiting for staff" overlay spun
        // forever. Surface a persistent toast with a Settle CTA that
        // deep-links to /waiter/payment with cash preselected.
        //
        // Role gate matches the route guard: /waiter/payment is wrapped
        // by `requiredRole={CAPTAIN_ROLES}` = [captain, admin, manager].
        // Regular waiters get the standard bell notification (via the
        // `notification:new` listener above) but no Settle CTA — they'd
        // bounce off the route guard. Captain handles bill settlement
        // per CLAUDE.md role spec.
        const handleCounterPaymentRequested = (payload) => {
            invalidateNotifications();
            // Any floor/admin staff can collect payment now — the waiter who
            // served the table gets the cash-request popup + Settle CTA too
            // (the /waiter/payment route was opened to STAFF_ROLES). Chef is
            // the only staff role excluded (no billing role).
            const SETTLE_ROLES = ['waiter', 'captain', 'admin', 'manager'];
            if (!SETTLE_ROLES.includes(role)) return;
            if (soundEnabled && hasInteractedRef.current) playSoundForRole(role);

            const tableLabel = payload?.table || 'A table';
            const amount = Number(payload?.amount || 0);
            const orderId = payload?.orderId;
            const tableName = String(tableLabel).replace(/^Table\s+/i, '');

            // Stable id so a rapid re-fire (customer reload) replaces the
            // toast in-place instead of stacking duplicates.
            const toastId = `counter-payment-${orderId || 'unknown'}`;

            toast.custom((t) => (
                <div
                    role="alert"
                    className={`max-w-md w-full bg-white border border-orange-200 shadow-lg rounded-2xl p-4 pointer-events-auto flex flex-col gap-3 transition-opacity ${
                        t.visible ? 'opacity-100' : 'opacity-0'
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                            <span className="text-[18px]">💵</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-nunito font-bold text-[#1A181B]">
                                Cash payment requested
                            </p>
                            <p className="text-[12px] font-varela text-[#645E66] mt-0.5">
                                {tableLabel} — collect ₹{amount.toFixed(0)}
                            </p>
                        </div>
                        <button
                            onClick={() => toast.dismiss(t.id)}
                            aria-label="Dismiss"
                            className="text-gray-300 hover:text-gray-500 shrink-0"
                        >✕</button>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            toast.dismiss(t.id);
                            // Admins / managers settle from their own Tables
                            // screen (the table drawer has a one-tap "Mark
                            // Paid · Cash" for counter requests). Sending them
                            // to /waiter/payment dropped them into the waiter
                            // app, which then landed on the waiter dashboard.
                            if (role === 'admin' || role === 'manager') {
                                navigate('/admin/tables', {
                                    state: { highlightTable: payload?.tableId || tableName },
                                });
                                return;
                            }
                            navigate('/waiter/payment', {
                                state: {
                                    orderId,
                                    orderDisplayId: orderId,
                                    amount,
                                    tableName,
                                    fromCounterRequest: true,
                                },
                            });
                        }}
                        className="w-full bg-[#FE8301] hover:bg-[#E67700] text-white text-[13px] font-nunito font-semibold py-2.5 rounded-xl active:scale-[0.98] transition-all"
                    >
                        Settle Cash for {tableLabel}
                    </button>
                </div>
            ), { id: toastId, duration: Infinity });
        };

        socket.on('notification:new', handleNewNotification);
        socket.on('order:new', handleNewOrder);
        socket.on('order:ready', handleOrderReady);
        socket.on('order:updated', handleOrderUpdated);
        socket.on('request:new', handleRequestNew);
        socket.on('request:updated', handleRequestUpdated);
        socket.on('counter-payment:requested', handleCounterPaymentRequested);

        return () => {
            socket.off('notification:new', handleNewNotification);
            socket.off('order:new', handleNewOrder);
            socket.off('order:ready', handleOrderReady);
            socket.off('order:updated', handleOrderUpdated);
            socket.off('request:new', handleRequestNew);
            socket.off('request:updated', handleRequestUpdated);
            socket.off('counter-payment:requested', handleCounterPaymentRequested);
        };
    }, [user, userId, role, soundEnabled, invalidateNotifications, scheduleInvalidate, navigate]);

    // ── Guest users: poll order status changes and play sound ────────────────
    // Broadened past `isGuest` so a logged-in customer who scanned a QR
    // also receives status feedback. The request poller below — covering
    // water/waiter/bill acks — is the same shape, so we share one gate.
    const STAFF_ROLES_CHECK = ['admin', 'manager', 'chef', 'waiter', 'captain', 'superadmin'];
    const isStaffUser = !!user && STAFF_ROLES_CHECK.includes(user.role);
    const dineInTableId = (!isStaffUser)
        ? JSON.parse(localStorage.getItem('dineInTable') || '{}')._id
        : null;

    const { data: guestActiveOrder } = useQuery({
        queryKey: ['guestOrder', dineInTableId],
        queryFn: async () => {
            const res = await api.get(`/orders/active/table/${dineInTableId}`, { _isBackground: true });
            if (res.data?.success && res.data.order) {
                const newStatus = res.data.order.status;
                if (guestPrevStatusRef.current && newStatus !== guestPrevStatusRef.current && hasInteractedRef.current && soundEnabled) {
                    playCustomerPop();
                }
                guestPrevStatusRef.current = newStatus;
                return res.data.order;
            }
            return null;
        },
        enabled: isGuest && !!dineInTableId,
        // BUG #23 — poll only while the socket is down; when live, the
        // order room below pushes status changes and we refetch on those.
        refetchInterval: socketLive ? false : POLL_GUEST,
    });

    // Listen on the guest's active order room so status changes arrive
    // live (the server authorizes the join via the scan session).
    const guestOrderId = guestActiveOrder?.orderId || null;
    useEffect(() => {
        if (!guestOrderId) return;
        joinRoom(`order:${guestOrderId}`);
    }, [guestOrderId]);
    useEffect(() => {
        if (!isGuest || !dineInTableId) return;
        const socket = getSocket();
        const refresh = () => scheduleInvalidate(['guestOrder', dineInTableId]);
        socket.on('order:updated', refresh);
        socket.on('order:ready', refresh);
        return () => {
            socket.off('order:updated', refresh);
            socket.off('order:ready', refresh);
        };
    }, [isGuest, dineInTableId, scheduleInvalidate]);

    // BUG #12 — after a reconnect, catch up on anything missed offline.
    useSocketReconnect(() => {
        scheduleInvalidate(['notifications']);
        scheduleInvalidate(['liveOrders']);
        scheduleInvalidate(['requests']);
        if (dineInTableId) {
            scheduleInvalidate(['guestOrder', dineInTableId]);
            scheduleInvalidate(['guestRequests', dineInTableId]);
        }
    });

    // Customer request-status tracking. Two paths, both feeding one
    // transition detector so only one toast fires per change:
    //   1. Primary — socket `request:updated` event from the backend on
    //      create/accept/complete (instant, requires the `table:<id>`
    //      room join below).
    //   2. Fallback — 5 s poll of /requests/active/table/:tableId in case
    //      the socket is disconnected or the room join race-lost.
    const REQUEST_TYPE_LABEL = { water: 'water', waiter: 'waiter', bill: 'bill', other: 'request' };
    const applyRequestUpdate = useCallback((r) => {
        if (!r || !r._id || !r.status) return;
        const id = String(r._id);
        const prevStatus = guestRequestStatusRef.current.get(id);
        guestRequestStatusRef.current.set(id, r.status);
        if (!prevStatus || prevStatus === r.status) return;   // first-seen or no change
        const label = REQUEST_TYPE_LABEL[r.type] || 'request';
        if (prevStatus === 'pending' && r.status === 'accepted') {
            toast.success(`A waiter is on the way with your ${label}!`, { duration: 4500, icon: '🙋' });
            if (hasInteractedRef.current && soundEnabled) playCustomerPop();
        } else if (r.status === 'completed') {
            toast.success(`Your ${label} request has been completed.`, { duration: 4500, icon: '✅' });
            if (hasInteractedRef.current && soundEnabled) playCustomerPop();
        }
    }, [soundEnabled]);

    // Reconnect + join the table room when a dine-in session appears. The
    // singleton socket may have opened at app boot — BEFORE the QR scan
    // wrote scanToken to localStorage — so the server has no
    // `socket.data.scan` and `canJoin` would silently reject the join.
    // Force one reconnect so the handshake picks up the fresh scanToken
    // via `auth: cb => cb(readSocketAuth())`. Scoped to [dineInTableId]
    // so toggling sound doesn't churn the socket.
    useEffect(() => {
        if (!dineInTableId) return;
        const socket = getSocket();
        const scanToken = typeof window !== 'undefined' ? localStorage.getItem('scanToken') : null;
        if (scanToken) {
            try { socket.disconnect(); socket.connect(); } catch { /* ignore */ }
        }
        joinRoom(`table:${dineInTableId}`);
    }, [dineInTableId]);

    // Subscribe to request updates for this table. Separate from the
    // reconnect effect so a soundEnabled toggle doesn't cycle the socket.
    useEffect(() => {
        if (!dineInTableId) return;
        const socket = getSocket();
        const onRequestUpdated = (r) => applyRequestUpdate(r);
        socket.on('request:updated', onRequestUpdated);
        return () => { socket.off('request:updated', onRequestUpdated); };
    }, [dineInTableId, applyRequestUpdate]);

    // Polling fallback — shorter interval so a dropped socket still feels live.
    useQuery({
        queryKey: ['guestRequests', dineInTableId],
        queryFn: async () => {
            const res = await waiterAPI.getActiveRequestsByTable(dineInTableId);
            const list = res.data?.requests || [];
            list.forEach(applyRequestUpdate);
            return list;
        },
        enabled: !!dineInTableId,
        // BUG #23 — the table room delivers request:updated live; only
        // poll while the socket is disconnected.
        refetchInterval: socketLive ? false : POLL_REQUESTS,
    });

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        refresh: invalidateNotifications,
        soundEnabled,
        toggleSound,
        testSound,
    }), [notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification, clearAll, invalidateNotifications, soundEnabled, toggleSound, testSound]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => useContext(NotificationContext);
