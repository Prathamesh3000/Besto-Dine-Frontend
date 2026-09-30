import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/AuthContext';
import { chefAPI, settingsAPI } from '../../utils/api';
import { useNotifications } from '../../Context/NotificationContext';
import useSocketEvent, { useSocketConnected, useSocketReconnect } from '../../hooks/useSocketEvent';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    Inbox,
    Flame,
    CheckCircle2,
    Search,
    ChefHat,
    WifiOff,
    Sparkles,
    Utensils,
    Package,
    Leaf,
    Drumstick,
    AlertTriangle,
    Layers,
    Hourglass,
    ChevronRight,
} from 'lucide-react';

import ChefHeader from './components/ChefHeader';
import CompletedOrdersDrawer from './components/CompletedOrdersDrawer';
import ChefOrderCard from './components/ChefOrderCard';
import OrderDetailModal from './components/OrderDetailModal';

/**
 * ChefDashboard — Kitchen Display System (KDS).
 *
 * Light cream / orange theme matching the Admin panel (#FAF5F0 bg,
 * white cards, #FE8301 primary). Column accents stay semantic:
 *
 *   ┌─────────────┬─────────────┬─────────────┐
 *   │ NEW ORDERS  │ PREPARING   │ READY       │
 *   │   amber     │   orange    │  emerald    │
 *   ├─────────────┼─────────────┼─────────────┤
 *   │  cards      │   cards     │   cards     │
 *   └─────────────┴─────────────┴─────────────┘
 *
 * On `< md` the board collapses to a single visible column controlled
 * by a segmented switcher so the same screen still works on a phone.
 */

// ─── Filter helpers ──────────────────────────────────────────────────
// Urgent threshold matches ChefOrderCard — orders waiting > 10 min in
// 'new' are escalated, plus any server-flagged isUrgent (ready > 10 min).
const URGENT_WAIT_MIN = 10;

const isTakeawayOrder = (o) =>
    o.type === 'takeaway' || o.tableId === 'TA';

const orderVegType = (o) => {
    const items = o.items || [];
    if (items.length === 0) return 'unknown';
    const hasNonVeg = items.some((i) => i.vegType === 'non-veg');
    const hasVeg = items.some((i) => i.vegType === 'veg');
    if (hasNonVeg && hasVeg) return 'mixed';
    if (hasNonVeg) return 'non-veg';
    if (hasVeg) return 'veg';
    return 'unknown';
};

const isOrderUrgent = (o, serverOffsetMs = 0) => {
    if (o.isUrgent) return true;
    if (o.status !== 'new') return false;
    const createdMs = new Date(o.createdAt).getTime();
    if (!Number.isFinite(createdMs)) return false;
    const nowServer = Date.now() - serverOffsetMs;
    return (nowServer - createdMs) / 60000 >= URGENT_WAIT_MIN;
};

// ─── Column visual configuration — admin (light) palette ─────────────
// Four-column kanban driven by the backend's `queueBucket` field:
//   upcoming         scheduled takeaway, prep window hasn't started
//   prepare_now      ready to start cooking (takeaway in prep window
//                    OR any dine-in 'new' order)
//   preparing        chef accepted, cooking in progress
//   ready_for_pickup cooking done, awaiting customer / waiter
const COLUMNS = [
    {
        key: 'upcoming',
        title: 'Upcoming Orders',
        sub: 'Scheduled · prep later',
        icon: Hourglass,
        accent: 'bg-slate-400',
        accentText: 'text-slate-700',
        accentSoft: 'bg-slate-50',
        accentRing: 'ring-slate-200',
        countBadge: 'bg-slate-500 text-white',
        emptyTitle: 'No scheduled orders',
        emptyHint: 'Future-pickup takeaways will queue here until their prep window opens.',
        EmptyIcon: Hourglass,
    },
    {
        key: 'prepare_now',
        title: 'Prepare Now',
        sub: 'Start cooking',
        icon: Inbox,
        accent: 'bg-amber-500',
        accentText: 'text-amber-700',
        accentSoft: 'bg-amber-50',
        accentRing: 'ring-amber-200',
        countBadge: 'bg-amber-500 text-white',
        emptyTitle: 'Nothing waiting',
        emptyHint: 'Orders ready to cook will appear here.',
        EmptyIcon: Sparkles,
    },
    {
        key: 'preparing',
        title: 'Preparing',
        sub: 'In progress',
        icon: Flame,
        accent: 'bg-[#FE8301]',
        accentText: 'text-[#FE8301]',
        accentSoft: 'bg-orange-50',
        accentRing: 'ring-orange-200',
        countBadge: 'bg-[#FE8301] text-white',
        emptyTitle: 'Kitchen is calm',
        emptyHint: 'Tap "Start Preparation" on a new order to move it here.',
        EmptyIcon: Flame,
    },
    {
        key: 'ready_for_pickup',
        title: 'Ready for Pickup',
        sub: 'Awaiting waiter',
        icon: CheckCircle2,
        accent: 'bg-emerald-500',
        accentText: 'text-emerald-700',
        accentSoft: 'bg-emerald-50',
        accentRing: 'ring-emerald-200',
        countBadge: 'bg-emerald-500 text-white',
        emptyTitle: 'Pass is empty',
        emptyHint: 'Completed orders will queue here until the waiter collects them.',
        EmptyIcon: CheckCircle2,
    },
];

// Map backend queueBucket → column key. The backend names track the
// spec ('scheduled', 'ready_to_prepare'), the columns are named for
// the chef ('upcoming', 'prepare_now') — this aliases the two so
// orders actually land in a column instead of falling through every
// filter. Without this alias every `queueBucket === 'scheduled'`
// card was dropped because no column key matched, which made the
// chef KDS look empty even when a scheduled order existed.
//
// Older API responses (before the takeaway-queue change) won't
// carry queueBucket, so fall back to the legacy status mapping so
// the dashboard still renders during a staggered deploy.
const BUCKET_ALIAS = {
    scheduled: 'upcoming',
    ready_to_prepare: 'prepare_now',
    preparing: 'preparing',
    ready_for_pickup: 'ready_for_pickup',
};
function bucketKeyFor(order) {
    if (order.queueBucket && BUCKET_ALIAS[order.queueBucket]) {
        return BUCKET_ALIAS[order.queueBucket];
    }
    if (order.status === 'preparing') return 'preparing';
    if (order.status === 'ready') return 'ready_for_pickup';
    return 'prepare_now';
}

const TYPE_FILTERS = [
    { value: 'all', label: 'All', Icon: Layers },
    { value: 'dine-in', label: 'Dine-In', Icon: Utensils },
    { value: 'takeaway', label: 'Takeaway', Icon: Package },
];

const DIET_FILTERS = [
    { value: 'all', label: 'All', Icon: Layers },
    { value: 'veg', label: 'Veg', Icon: Leaf },
    { value: 'non-veg', label: 'Non-Veg', Icon: Drumstick },
];

const ChefDashboard = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const { soundEnabled, toggleSound } = useNotifications();
    const queryClient = useQueryClient();
    const [showCompleted, setShowCompleted] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [dietFilter, setDietFilter] = useState('all');
    const [urgentOnly, setUrgentOnly] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [viewOrder, setViewOrder] = useState(null);
    const [mobileColumn, setMobileColumn] = useState('prepare_now');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    // Socket-level liveness, distinct from navigator.onLine. Lan can be up
    // while the socket is reconnecting — we want the banner either way.
    const socketConnected = useSocketConnected();
    // (clientNow - serverTime) captured on every /orders/kitchen response,
    // piped to each order card so the elapsed timer is drift-corrected.
    const [serverOffsetMs, setServerOffsetMs] = useState(0);

    // Network state — kitchens often have flaky wifi.
    useEffect(() => {
        const onUp = () => setIsOnline(true);
        const onDown = () => setIsOnline(false);
        window.addEventListener('online', onUp);
        window.addEventListener('offline', onDown);
        return () => {
            window.removeEventListener('online', onUp);
            window.removeEventListener('offline', onDown);
        };
    }, []);

    // ── Settings query ─────────────────────────────────────────
    const { data: settingsData } = useQuery({
        queryKey: ['settings'],
        queryFn: () => settingsAPI.getSettings().then((res) => res.data),
        staleTime: 10 * 60 * 1000,
    });

    const cafeName = settingsData?.general?.cafeName || '';
    const isCafeClosed = useMemo(() => {
        if (!settingsData) return false;
        const operatingHours = settingsData.operatingHours || [];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayHours = operatingHours.find((h) => h.day === days[new Date().getDay()]);
        if (!todayHours) return false;
        if (!todayHours.isOpen) return true;
        const now = new Date();
        const nowTime = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = (todayHours.start || '00:00').split(':').map(Number);
        const [eh, em] = (todayHours.end || '23:59').split(':').map(Number);
        const startTime = sh * 60 + sm;
        let endTime = eh * 60 + em;
        if (endTime < startTime) endTime += 24 * 60;
        let adjusted = nowTime;
        if (nowTime < startTime && endTime > 24 * 60) adjusted += 24 * 60;
        return adjusted < startTime || adjusted >= endTime;
    }, [settingsData]);

    // ── Kitchen orders query ───────────────────────────────────
    const {
        data: ordersData,
        isLoading: loading,
        isRefetching: refreshing,
    } = useQuery({
        queryKey: ['kitchenOrders'],
        queryFn: async () => {
            const res = await chefAPI.getKitchenOrders();
            // Anchor the timer clocks to the server's wall-time. Doing it
            // inside queryFn (not onSuccess) guarantees the offset is set
            // before the data that depends on it renders.
            const clientNow = Date.now();
            if (res.data?.serverTime) {
                const serverMs = new Date(res.data.serverTime).getTime();
                if (Number.isFinite(serverMs)) setServerOffsetMs(clientNow - serverMs);
            }
            if (res.data?.success) {
                // Defensive strict filter: the Kanban only renders
                // new / preparing / ready. Keeping 'served' (or any
                // other status) in this list created a class of bugs
                // where a stale cached response inflated column counts
                // without matching any visible card.
                return {
                    orders: res.data.orders.filter((o) =>
                        ['new', 'preparing', 'ready'].includes(o.status)
                    ),
                    completedToday: res.data.completedToday || 0,
                };
            }
            return { orders: [], completedToday: 0 };
        },
        // Socket events are the primary path; this poll is the safety
        // net for the times the socket drops on flaky kitchen Wi-Fi.
        // 60 s was too slow — chefs reported orders showing up almost a
        // minute late on dropped sockets. 15 s mirrors what the
        // notification poller does and keeps the worst-case latency
        // bounded without a meaningful traffic increase (one cheap GET
        // per chef per 15 s).
        // BUG #23 — while the socket is live, keep only a slow safety poll.
        refetchInterval: socketConnected ? 90_000 : 15_000,
        refetchOnReconnect: true,
        // Tab/foreground focus is a strong "user is paying attention
        // again" signal — refetch immediately so a chef returning from
        // another app sees the current board, not a stale snapshot.
        refetchOnWindowFocus: true,
    });

    const orders = useMemo(() => ordersData?.orders || [], [ordersData]);
    const completedCount = ordersData?.completedToday || 0;

    // Completed-orders drawer. Fetched on open rather than alongside
    // the board: it's a lookback the chef asks for occasionally, and
    // polling it every 15s with the live board would be pure waste.
    // Kitchen rooms (t:<restaurantId>:kitchen[:<branchId>]) are joined by
    // the server on connect from the chef's JWT (BUG #6).

    // BUG #23 — coalesce bursts of socket events into one refetch.
    const invalidateTimerRef = useRef(null);
    const invalidateOrders = useCallback(() => {
        if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = setTimeout(() => {
            invalidateTimerRef.current = null;
            queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] });
        }, 300);
    }, [queryClient]);
    useEffect(() => () => {
        if (invalidateTimerRef.current) clearTimeout(invalidateTimerRef.current);
    }, []);

    // Dedup ring buffer — a 10s window keyed by (orderId|status|paymentStatus)
    // swallows duplicate socket events that arrive from multiple emit
    // paths (same transition fanning out through emitToStaff + waiter/admin
    // rooms) before they each invalidate the query.
    const seenEventsRef = useRef(new Map());
    const handleOrderEvent = useCallback((payload) => {
        const now = Date.now();
        const key = `${payload?.orderId || ''}|${payload?.status || ''}|${payload?.paymentStatus || ''}`;
        // Prune expired entries opportunistically so the map can't grow
        // unbounded on a long-lived session.
        for (const [k, exp] of seenEventsRef.current) {
            if (exp < now) seenEventsRef.current.delete(k);
        }
        if (key !== '||' && seenEventsRef.current.has(key)) return;
        seenEventsRef.current.set(key, now + 10_000);
        invalidateOrders();
    }, [invalidateOrders]);

    useSocketEvent('order:new', handleOrderEvent);
    useSocketEvent('order:updated', handleOrderEvent);
    useSocketEvent('order:cancelled', handleOrderEvent);

    // ── Append highlight ──────────────────────────────────────────────
    // When admin / waiter appends items to an active order (`POST
    // /orders/:id/append`), the backend fires `order:appended` to the
    // kitchen room carrying just the delta. We toast the chef with the
    // item names and flag the card so it renders a pulsing orange ring
    // + "+New items" badge for 15 s — enough for the chef to glance up
    // and catch the change without interrupting their flow.
    const [appendedIds, setAppendedIds] = useState(() => new Set());
    const appendedTimersRef = useRef(new Map());
    const handleAppendedEvent = useCallback((payload) => {
        const { orderId, addedItems = [] } = payload || {};
        if (!orderId) return;

        const names = (addedItems || []).map(i => i?.name).filter(Boolean);
        const shortId = String(orderId).split('-').pop();
        const preview = names.slice(0, 3).join(', ');
        const extra = names.length > 3 ? ` +${names.length - 3} more` : '';
        toast.success(
            `New item${names.length === 1 ? '' : 's'} added to #${shortId}${preview ? `: ${preview}${extra}` : ''}`,
            { icon: '🍳', duration: 5000 }
        );

        setAppendedIds(prev => {
            const next = new Set(prev);
            next.add(orderId);
            return next;
        });
        const existing = appendedTimersRef.current.get(orderId);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
            setAppendedIds(prev => {
                const next = new Set(prev);
                next.delete(orderId);
                return next;
            });
            appendedTimersRef.current.delete(orderId);
        }, 15_000);
        appendedTimersRef.current.set(orderId, t);

        invalidateOrders();
    }, [invalidateOrders]);
    useSocketEvent('order:appended', handleAppendedEvent);

    // ── KOT reprint ────────────────────────────────────────────────────
    // Admin "KOT" drawer button on TablesDashboard fires this event via
    // POST /orders/:id/reprint-kot. The order itself is not mutated; we
    // just re-alert the chef so they know to look at the card again
    // (e.g. the tablet rebooted, the kitchen missed the ticket). Reuses
    // the same pulsing-orange highlight as the append path because the
    // visual goal is identical — "this card needs your attention". We
    // also play the new-order role sound so a chef mid-task hears it.
    const handleReprintEvent = useCallback((payload) => {
        const { orderId, items = [] } = payload || {};
        if (!orderId) return;

        const shortId = String(orderId).split('-').pop();
        const count = items.reduce((n, it) => n + (Number(it?.quantity) || 0), 0);
        toast(
            `KOT reprint #${shortId}${count ? ` — ${count} item${count === 1 ? '' : 's'}` : ''}`,
            { icon: '🧾', duration: 6000 }
        );

        setAppendedIds(prev => {
            const next = new Set(prev);
            next.add(orderId);
            return next;
        });
        const existing = appendedTimersRef.current.get(orderId);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
            setAppendedIds(prev => {
                const next = new Set(prev);
                next.delete(orderId);
                return next;
            });
            appendedTimersRef.current.delete(orderId);
        }, 15_000);
        appendedTimersRef.current.set(orderId, t);

        invalidateOrders();
    }, [invalidateOrders]);
    useSocketEvent('order:kot-reprint', handleReprintEvent);

    useEffect(() => {
        const timers = appendedTimersRef.current;
        return () => {
            for (const t of timers.values()) clearTimeout(t);
            timers.clear();
        };
    }, []);

    // Refresh cafe branding live when the admin uploads a new logo /
    // renames the cafe. The useQuery below has a 10-min staleTime, so
    // without an explicit invalidate the chef would see the old logo
    // for up to 10 minutes after an admin update.
    useSocketEvent('settings:updated', () => {
        queryClient.invalidateQueries({ queryKey: ['settings'] });
    });

    // Socket connect/disconnect → banner + resync. On reconnect we may
    // have missed events during the gap; a fresh GET /kitchen is the
    // cheapest way to guarantee the board matches the server. Initial
    // state is seeded in useState above, so we only subscribe here.
    useSocketReconnect(invalidateOrders);

    // ── Status mutation ────────────────────────────────────────
    // Optimistic: move the card across columns the instant the chef taps,
    // so the action feels zero-latency. If the server rejects (409
    // INVALID_TRANSITION from the atomic filter, or 403 BRANCH_MISMATCH),
    // the onError rolls the cache back and onSettled re-syncs.
    const statusMutation = useMutation({
        mutationFn: ({ orderId, newStatus }) => chefAPI.updateStatus(orderId, newStatus),
        onMutate: async ({ orderId, newStatus }) => {
            setActionLoading(orderId);
            await queryClient.cancelQueries({ queryKey: ['kitchenOrders'] });
            const prev = queryClient.getQueryData(['kitchenOrders']);
            const nowIso = new Date().toISOString();
            queryClient.setQueryData(['kitchenOrders'], (old) => {
                if (!old?.orders) return old;
                // Keep the optimistic queueBucket in lock-step with the
                // new status so the card moves to the right column the
                // instant the chef taps, instead of waiting for the
                // next fetch to re-bucket it.
                const optimisticBucket =
                    newStatus === 'preparing' ? 'preparing' :
                        newStatus === 'ready' ? 'ready_for_pickup' :
                            undefined;
                return {
                    ...old,
                    orders: old.orders.map((o) =>
                        o._id === orderId
                            ? {
                                ...o,
                                status: newStatus,
                                updatedAt: nowIso,
                                // Stamp the per-status anchor too so the
                                // card's timer restarts from 0 immediately
                                // instead of briefly showing order age.
                                ...(newStatus === 'preparing' && !o.preparationStartedAt ? { preparationStartedAt: nowIso } : {}),
                                ...(newStatus === 'ready' ? { preparationCompletedAt: nowIso } : {}),
                                ...(optimisticBucket ? { queueBucket: optimisticBucket } : {}),
                            }
                            : o
                    ),
                };
            });
            return { prev };
        },
        onSuccess: (res, { newStatus }) => {
            if (res.data?.success) {
                toast.success(
                    newStatus === 'preparing'
                        ? 'Preparation started'
                        : 'Order ready for pickup',
                    {
                        icon: newStatus === 'preparing' ? '🔥' : '✅',
                        style: {
                            borderRadius: '10px',
                            fontWeight: '600',
                            fontSize: '14px',
                            background: '#fff',
                            color: '#1f2937',
                            border: '1px solid #e5e7eb',
                            boxShadow: '0px 4px 16px rgba(0,0,0,0.08)',
                        },
                    }
                );
            } else {
                toast.error(res.data?.message || 'Update failed');
            }
        },
        onError: (err, _vars, ctx) => {
            // Roll back the optimistic column-move.
            if (ctx?.prev) queryClient.setQueryData(['kitchenOrders'], ctx.prev);
            const code = err?.response?.data?.code;
            const msg = err?.response?.data?.message;
            if (code === 'INVALID_TRANSITION') {
                toast.error(msg || 'Order already moved. Refreshing…');
            } else if (code === 'BRANCH_MISMATCH') {
                toast.error(msg || 'This order belongs to another branch.');
            } else {
                toast.error(msg || 'Failed to update order status');
            }
        },
        onSettled: () => {
            setActionLoading(null);
            queryClient.invalidateQueries({ queryKey: ['kitchenOrders'] });
        },
    });

    const handleStatusUpdate = (orderId, newStatus) =>
        statusMutation.mutate({ orderId, newStatus });

    const handleLogout = () => {
        logout();
        navigate('/staff-login');
    };

    // ── Bucket orders into columns ─────────────────────────────
    const buckets = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        const matchesSearch = (o) => {
            if (!term) return true;
            return (
                (o.id && o.id.toLowerCase().includes(term)) ||
                (o.tableId && String(o.tableId).toLowerCase().includes(term)) ||
                (o.user && o.user.toLowerCase().includes(term)) ||
                (o.items && o.items.some((it) => it.name.toLowerCase().includes(term)))
            );
        };

        const matchesType = (o) => {
            if (typeFilter === 'all') return true;
            const takeaway = isTakeawayOrder(o);
            return typeFilter === 'takeaway' ? takeaway : !takeaway;
        };

        // Veg filter keeps mixed orders visible under both filters so a
        // mixed plate doesn't disappear from either station's board.
        const matchesDiet = (o) => {
            if (dietFilter === 'all') return true;
            const v = orderVegType(o);
            if (v === 'mixed' || v === 'unknown') return true;
            return v === dietFilter;
        };

        const matchesUrgent = (o) => !urgentOnly || isOrderUrgent(o, serverOffsetMs);

        const keep = (o) =>
            matchesSearch(o) && matchesType(o) && matchesDiet(o) && matchesUrgent(o);

        // Sort key for takeaways: nearest pickup first (urgent already
        // pushed to top by the backend's secondary sort). Falls back to
        // creation time for dine-in / pickup-less rows.
        const pickupAscThenCreated = (a, b) => {
            const aPick = a.pickupAt ? new Date(a.pickupAt).getTime() : Infinity;
            const bPick = b.pickupAt ? new Date(b.pickupAt).getTime() : Infinity;
            if (aPick !== bPick) return aPick - bPick;
            return new Date(a.createdAt) - new Date(b.createdAt);
        };

        const filtered = orders.filter(keep);

        const upcoming = filtered
            .filter((o) => bucketKeyFor(o) === 'upcoming')
            .sort(pickupAscThenCreated);

        const prepareNow = filtered
            .filter((o) => bucketKeyFor(o) === 'prepare_now')
            .sort((a, b) => {
                // Urgent first inside Prepare Now (sticky urgent section
                // requirement). Within urgency tier, nearest pickup wins,
                // then earliest creation for dine-in.
                if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
                return pickupAscThenCreated(a, b);
            });

        const preparing = filtered
            .filter((o) => bucketKeyFor(o) === 'preparing')
            .sort(pickupAscThenCreated);

        const readyForPickup = filtered
            .filter((o) => bucketKeyFor(o) === 'ready_for_pickup')
            .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

        return {
            upcoming,
            prepare_now: prepareNow,
            preparing,
            ready_for_pickup: readyForPickup,
        };
    }, [orders, searchTerm, typeFilter, dietFilter, urgentOnly, serverOffsetMs]);

    const urgentTotal = useMemo(
        () => orders.filter((o) => isOrderUrgent(o, serverOffsetMs)).length,
        [orders, serverOffsetMs]
    );
    const filtersActive =
        typeFilter !== 'all' || dietFilter !== 'all' || urgentOnly || searchTerm.trim() !== '';

    const counts = {
        upcoming: buckets.upcoming.length,
        prepare_now: buckets.prepare_now.length,
        preparing: buckets.preparing.length,
        ready_for_pickup: buckets.ready_for_pickup.length,
    };
    // Kitchen-load is "what the chef actually has on their hands right
    // now" — upcoming/scheduled doesn't count because nobody's cooking
    // it yet, and ready_for_pickup is waiting on the waiter.
    const activeCount = counts.prepare_now + counts.preparing;

    const kitchenLoad = useMemo(() => {
        if (activeCount >= 15) return 'Maxed';
        if (activeCount >= 8) return 'High';
        if (activeCount >= 4) return 'Medium';
        return 'Low';
    }, [activeCount]);

    // ── Loading state ──────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAF5F0] text-gray-800 font-manrope flex flex-col items-center justify-center p-6">
                <div className="w-20 h-20 rounded-2xl bg-linear-to-br from-[#FE8301] to-orange-600 flex items-center justify-center shadow-[0_8px_32px_rgba(254,131,1,0.25)] mb-6 animate-pulse text-white">
                    <ChefHat size={36} strokeWidth={2.25} />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-gray-900">Syncing kitchen…</h2>
                <p className="text-sm text-[#7D7380] mt-2">Loading active orders</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FAF5F0] text-gray-800 font-manrope selection:bg-[#FE8301]/20">
            <ChefHeader
                user={user}
                cafeName={cafeName}
                logoUrl={settingsData?.general?.logoUrl || ''}
                isCafeClosed={isCafeClosed}
                soundEnabled={soundEnabled}
                toggleSound={toggleSound}
                fetchOrders={invalidateOrders}
                refreshing={refreshing}
                handleLogout={handleLogout}
                activeCount={activeCount}
                kitchenLoad={kitchenLoad}
                isOnline={isOnline}
            />

            {/* Connectivity banner — LAN offline wins over socket-only drop,
                and a socket-only drop still shows "Reconnecting…" so the
                chef knows the board may be a few seconds behind. */}
            {!isOnline ? (
                <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2 text-red-600 text-sm font-semibold">
                    <WifiOff size={16} />
                    Offline — orders may be stale until the connection is restored.
                </div>
            ) : !socketConnected ? (
                <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-2 text-amber-700 text-sm font-semibold">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    Reconnecting — live updates will resume shortly.
                </div>
            ) : null}

            {/* ─── SUB-HEADER · Search + filters + summary ──────── */}
            <div className="max-w-480 mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-2">
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">

                    {/* Search */}
                    <div className="relative flex-1 lg:max-w-md">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7D7380]" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by order #, table or item…"
                            className="w-full h-11 bg-white border border-gray-200 hover:border-gray-300 focus:border-[#FE8301] rounded-xl pl-10 pr-3 text-sm font-medium text-gray-800 placeholder:text-[#7D7380] focus:outline-none focus:ring-2 focus:ring-[#FE8301]/20 transition shadow-[0px_1px_3px_0px_#0000000F]"
                        />
                    </div>

                    {/* Filter row — horizontally scrolls on mobile so the
                        diet + urgent + clear chips don't wrap onto a
                        second row below the type filter. */}
                    <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
                        <FilterSegment
                            options={TYPE_FILTERS}
                            value={typeFilter}
                            onChange={setTypeFilter}
                            ariaLabel="Filter by order type"
                        />

                        <FilterSegment
                            options={DIET_FILTERS}
                            value={dietFilter}
                            onChange={setDietFilter}
                            ariaLabel="Filter by diet"
                        />

                        <button
                            type="button"
                            onClick={() => setUrgentOnly((v) => !v)}
                            aria-pressed={urgentOnly}
                            title="Show only orders flagged urgent or waiting over 10 minutes"
                            className={`h-11 px-3 rounded-xl text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 border transition shadow-[0px_1px_3px_0px_#0000000F] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] shrink-0 ${urgentOnly
                                ? 'bg-red-500 text-white border-red-500 shadow-[0_4px_16px_rgba(239,68,68,0.25)]'
                                : 'bg-white text-[#7D7380] border-gray-200 hover:text-red-600 hover:border-red-200 hover:bg-red-50'
                                }`}
                        >
                            <AlertTriangle size={14} strokeWidth={2.5} />
                            <span className="hidden sm:inline">Urgent</span>
                            <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums ${urgentOnly ? 'bg-white/25 text-white' : 'bg-red-50 text-red-600'
                                }`}>
                                {urgentTotal}
                            </span>
                        </button>

                        {filtersActive && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchTerm('');
                                    setTypeFilter('all');
                                    setDietFilter('all');
                                    setUrgentOnly(false);
                                }}
                                className="h-11 px-3 rounded-xl text-xs font-bold uppercase tracking-wider text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] shrink-0"
                            >
                                Clear
                            </button>
                        )}

                        {/* Completed-today summary.
                            This was a read-only <div>: it reported that
                            34 orders had gone out but gave no way to see
                            WHICH, so a chef checking whether table 7's
                            order actually left had nowhere to look. Now
                            a button that opens the list. */}
                        <button
                            type="button"
                            onClick={() => setShowCompleted(true)}
                            aria-haspopup="dialog"
                            title="View completed orders"
                            // Was `hidden sm:flex` — on a phone-sized KDS the
                            // only entry point to the completed list simply
                            // didn't exist, so tapping "Completed" was impossible.
                            className="flex items-center gap-2 h-11 text-xs bg-white border border-gray-200 rounded-xl px-3 shadow-[0px_1px_3px_0px_#0000000F] shrink-0 hover:border-emerald-300 hover:bg-emerald-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition"
                        >
                            <span className="text-[#7D7380] uppercase tracking-wider font-bold">Completed</span>
                            <span className="font-black text-emerald-600 text-base tabular-nums">{completedCount}</span>
                            <ChevronRight size={14} className="text-[#7D7380]" />
                        </button>
                    </div>
                </div>

                {/* Mobile column switcher — short labels and tight
                    spacing so all four buckets fit a 360-380px phone
                    without overflow. Active label is hidden on the
                    tiniest screens so the count + icon still fit even
                    on the longest bucket ("Preparing"). */}
                <div className="md:hidden mt-4 flex items-stretch bg-white border border-gray-200 rounded-xl p-1 shadow-[0px_1px_3px_0px_#0000000F] gap-0.5">
                    {COLUMNS.map((col) => {
                        const ColIcon = col.icon;
                        const active = mobileColumn === col.key;
                        // Per-bucket short label — picks a 6-char-max word
                        // instead of `title.split(' ')[0]` so the chip text
                        // doesn't read "Ready" for "Ready for Pickup" while
                        // sibling "Preparing" gets the full word.
                        const shortLabel = {
                            upcoming: 'Next',
                            prepare_now: 'Cook',
                            preparing: 'Now',
                            ready_for_pickup: 'Done',
                        }[col.key] || col.title.split(' ')[0];
                        return (
                            <button
                                key={col.key}
                                type="button"
                                onClick={() => setMobileColumn(col.key)}
                                aria-pressed={active}
                                aria-label={col.title}
                                className={`flex-1 min-w-0 h-11 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 sm:gap-1.5 transition px-1 sm:px-2 ${active
                                    ? `${col.accentSoft} ${col.accentText}`
                                    : 'text-[#7D7380] hover:bg-gray-50'
                                    }`}
                            >
                                <ColIcon size={14} className="shrink-0" />
                                <span className="uppercase tracking-wider truncate">{shortLabel}</span>
                                <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${active ? col.countBadge : 'bg-gray-100 text-[#7D7380]'
                                    }`}>
                                    {counts[col.key]}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═══ KANBAN BOARD ════════════════════════════════════
                Responsive ladder:
                  <md  : 1 col (switcher selects which bucket is visible)
                  md   : 2×2 grid (tablet portrait)
                  lg   : 3 cols (tablet landscape — was 2, too cramped)
                  xl+  : full 4-col layout */}
            <main className="max-w-480 mx-auto px-4 sm:px-6 lg:px-8 pb-12 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
                    {COLUMNS.map((col) => (
                        <KanbanColumn
                            key={col.key}
                            col={col}
                            orders={buckets[col.key]}
                            count={counts[col.key]}
                            actionLoading={actionLoading}
                            serverOffsetMs={serverOffsetMs}
                            onAction={(orderId) => {
                                if (col.key === 'prepare_now') handleStatusUpdate(orderId, 'preparing');
                                else if (col.key === 'preparing') handleStatusUpdate(orderId, 'ready');
                            }}
                            onView={setViewOrder}
                            hiddenOnMobile={mobileColumn !== col.key}
                            appendedIds={appendedIds}
                        />
                    ))}
                </div>
            </main>

            <OrderDetailModal order={viewOrder} onClose={() => setViewOrder(null)} />
            <CompletedOrdersDrawer
                open={showCompleted}
                onClose={() => setShowCompleted(false)}
            />
        </div>
    );
};

// ─── KanbanColumn ────────────────────────────────────────────────────
const KanbanColumn = ({ col, orders, count, actionLoading, serverOffsetMs, onAction, onView, hiddenOnMobile, appendedIds }) => {
    const ColIcon = col.icon;
    const EmptyIcon = col.EmptyIcon;
    return (
        <section
            // Min-height scales: a phone-sized 1-col layout doesn't need
            // the 400px floor desktop columns use — that just leaves a
            // long blank below the header when a bucket is empty.
            className={[
                'flex flex-col rounded-2xl bg-white border border-gray-200 min-h-72 md:min-h-96 lg:min-h-100 overflow-hidden shadow-[0px_2px_8px_0px_#00000014]',
                hiddenOnMobile ? 'hidden md:flex' : 'flex',
            ].join(' ')}
            aria-label={col.title}
        >
            {/* Column accent bar — top */}
            <div className={`h-1 w-full ${col.accent}`} />

            {/* Column header */}
            <header className="px-4 sm:px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg ring-1 flex items-center justify-center shrink-0 ${col.accentSoft} ${col.accentRing} ${col.accentText}`}>
                        <ColIcon size={16} strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-gray-900 tracking-tight">
                                {col.title}
                            </h2>
                            <span className={`min-w-6 h-5 px-2 rounded-full text-[11px] font-black flex items-center justify-center tabular-nums ${col.countBadge}`}>
                                {count}
                            </span>
                        </div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#7D7380] mt-0.5">
                            {col.sub}
                        </p>
                    </div>
                </div>
            </header>

            {/* Cards */}
            <div className="p-3 sm:p-4 flex-1 space-y-3 sm:space-y-4 bg-[#FAF5F0]/40">
                {orders.length === 0 ? (
                    <ColumnEmpty
                        icon={EmptyIcon}
                        title={col.emptyTitle}
                        hint={col.emptyHint}
                        accent={col.accentText}
                        accentSoft={col.accentSoft}
                        accentRing={col.accentRing}
                    />
                ) : (
                    orders.map((order) => (
                        <ChefOrderCard
                            key={order._id}
                            order={order}
                            actionLoading={actionLoading}
                            serverOffsetMs={serverOffsetMs}
                            onAction={onAction}
                            onView={onView}
                            justAppended={appendedIds?.has(order.id) || false}
                        />
                    ))
                )}
            </div>
        </section>
    );
};

// ─── Filter segment — shared by type + diet pickers ─────────────────
const FilterSegment = ({ options, value, onChange, ariaLabel }) => (
    <div
        role="group"
        aria-label={ariaLabel}
        className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-[0px_1px_3px_0px_#0000000F] shrink-0"
    >
        {options.map((opt) => {
            const Icon = opt.Icon;
            const active = value === opt.value;
            return (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    aria-pressed={active}
                    aria-label={opt.label}
                    title={opt.label}
                    className={`h-9 px-2 sm:px-3 rounded-lg text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 sm:gap-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] ${active
                        ? 'bg-[#FE8301] text-white shadow-sm'
                        : 'text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50'
                        }`}
                >
                    {Icon && <Icon size={13} strokeWidth={2.5} />}
                    {/* Hide the label on the smallest phones — three
                        filter groups + Urgent + Clear couldn't fit a
                        375px screen even with horizontal scroll once
                        each chip had a 5-7 char label. Active chips
                        keep their label so the user can still read
                        the current selection. */}
                    <span className={active ? '' : 'hidden sm:inline'}>{opt.label}</span>
                </button>
            );
        })}
    </div>
);

// ─── Column empty state ──────────────────────────────────────────────
const ColumnEmpty = ({ icon, title, hint, accent, accentSoft, accentRing }) => {
    const Icon = icon;
    return (
        <div className="flex flex-col items-center justify-center text-center py-10 sm:py-16 px-5 sm:px-6 rounded-xl border-2 border-dashed border-gray-200 bg-white/60">
            <div className={`w-14 h-14 rounded-2xl ring-1 flex items-center justify-center mb-4 ${accentSoft} ${accentRing} ${accent}`}>
                <Icon size={22} strokeWidth={1.75} />
            </div>
            <p className="text-sm font-bold text-gray-900">{title}</p>
            <p className="text-xs text-[#7D7380] mt-1.5 max-w-60 leading-relaxed">{hint}</p>
        </div>
    );
};

export default ChefDashboard;
