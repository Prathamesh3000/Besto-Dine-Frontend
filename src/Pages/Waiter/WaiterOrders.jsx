import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import BottomNav from '../../Components/Waiter/BottomNav';
import Sidebar from '../../Components/Waiter/Sidebar';
import WaiterEmptyState from '../../Components/Waiter/WaiterEmptyState';
import StaffProfileMenu from '../../Components/Waiter/StaffProfileMenu';
import NotificationBell from '../../Components/Waiter/NotificationBell';
import { Menu, CircleAlert, Clock3, Check, Loader2, CheckCircle2, Clock, User, X, RotateCw } from 'lucide-react';
import api, { waiterAPI, settingsAPI } from '../../utils/api';
import useSocketEvent, { useSocketConnected, useSocketReconnect } from '../../hooks/useSocketEvent';
import { useAuth } from '../../Context/AuthContext';
import { resolveImageUrl } from '../../utils/image';
import { getWaiterScope, inWaiterScope } from '../../utils/waiterScope';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';


// Split items into the original round vs anything appended later.
// Baseline = earliest item.addedAt among the order's items (NOT
// order.createdAt), so a retroactive Mongoose default that stamps
// pre-existing items with `now` during an append-triggered save() can't
// misclassify the whole original round as "added later".
const ADDED_LATER_GRACE_MS = 60_000;
const splitOrderItems = (items, orderCreatedAt) => {
    const list = items || [];
    const addedTimes = list
        .map(i => i?.addedAt ? new Date(i.addedAt).getTime() : null)
        .filter(Number.isFinite);
    const baselineMs = addedTimes.length
        ? Math.min(...addedTimes)
        : (orderCreatedAt ? new Date(orderCreatedAt).getTime() : 0);
    const original = [];
    const added = [];
    for (const it of list) {
        const addedMs = it?.addedAt ? new Date(it.addedAt).getTime() : baselineMs;
        if (Number.isFinite(addedMs) && addedMs - baselineMs > ADDED_LATER_GRACE_MS) {
            added.push(it);
        } else {
            original.push(it);
        }
    }
    return { original, added };
};

// --- ReadyOrderCard Component ---
const ReadyOrderCard = ({
    tableId = "T1",
    orderId = "0001",
    items = [],
    time = "Just now",
    isUrgent = false,
    glowSpeed = "2s",
    createdAt,
    customerName,
    note = '',
    onCancel,
    onPickUp,
    onOpenDetails,
    isPending = false,
}) => {
    const { original: originalItems, added: appendedItems } = splitOrderItems(items, createdAt);
    // A repeat placed after the previous round was served lands as its OWN
    // new order (so the kitchen doesn't re-cook the served items). Flag it
    // so the waiter knows this is a fresh repeat round on a table that may
    // already have a served/billed round, not a duplicate.
    const isRepeat = /^repeated from/i.test(note || '');
    // Format the order time on the CLIENT (viewer's timezone) rather than
    // trusting the server-formatted `time` string. getLiveOrders formats
    // createdAt with the SERVER's timezone — UTC on the hosted deployment —
    // so an 11:00 IST order rendered as ~05:30. The waiter's device sits at
    // the cafe, so browser-local time is the correct wall clock. Falls back
    // to the passed `time` when createdAt is missing (legacy rows).
    const displayTime = createdAt
        ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
        : time;
    // Don't trip the action buttons when the surrounding card is clicked
    // to open the details modal — let the explicit click + scale-95
    // animation belong to the Cancel / Pick up buttons.
    const stopBubble = (handler) => (e) => { e.stopPropagation(); handler?.(); };
    return (
        <div
            style={{ '--glow-speed': glowSpeed }}
            onClick={onOpenDetails}
            role={onOpenDetails ? 'button' : undefined}
            tabIndex={onOpenDetails ? 0 : undefined}
            onKeyDown={onOpenDetails ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetails(); } } : undefined}
            className={`bg-[#FFFFFF] mb-3 rounded-[16px] p-4 gap-2 transition-all flex flex-col h-full ${isUrgent ? 'border-[0.5px] border-[#FF3B30] animate-blinking-glow shadow-none' : 'shadow-[0px_2px_8px_0px_rgba(0,0,0,0.12)]'} ${onOpenDetails ? 'cursor-pointer hover:shadow-[0px_4px_12px_0px_rgba(112,32,131,0.18)]' : ''}`}
        >
            {/* Header */}
            <div className="flex justify-between items-start mb-2 gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div
                        title={String(tableId ?? '')}
                        className={`shrink-0 min-w-10 h-10 px-2 max-w-[96px] bg-[#702083] rounded-[8px] flex items-center justify-center text-[#FFFFFF] font-semibold truncate ${String(tableId ?? '').length > 3 ? 'text-[12px]' : 'text-[18px]'}`}
                    >
                        {tableId}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h3 title={orderId} className="text-[#645E66] font-extrabold text-[16px] truncate">
                                Order ID: {orderId || '—'}
                            </h3>
                            {/* Repeat round — a re-order placed after the
                                previous round was served. Lands as its own
                                order; this chip tells the waiter it's a fresh
                                repeat (the table may already have a served
                                round on the bill). */}
                            {isRepeat && (
                                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FFF4E8] text-[#FE8301] text-[10px] font-extrabold uppercase tracking-wide">
                                    <RotateCw size={10} strokeWidth={3} />
                                    Repeat
                                </span>
                            )}
                        </div>
                        {/* WAI-013 — surface customer name on the card so the
                            waiter can announce by name on pick up. Falls back
                            to "Guest" for unauthenticated QR orders. */}
                        <p title={customerName || 'Guest'} className="text-[#8D848F] text-[12px] font-semibold truncate flex items-center gap-1 mt-0.5">
                            <User size={11} strokeWidth={2.4} />
                            {customerName || 'Guest'}
                        </p>
                    </div>
                </div>

                {isUrgent ? (
                    <div className="flex items-center gap-2 text-[#FF3B30] font-extrabold">
                        <CircleAlert size={20} strokeWidth={1.5} />
                        <span className="text-[12px]">Urgent</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-[#645E66] font-extrabold">
                        <Clock3 size={20} strokeWidth={1.5} />
                        <span className="text-[12px]">{displayTime}</span>
                    </div>
                )}
            </div>

            {/* Items List — split into "Added later" / "Original order" so
                the waiter sees the delta instead of a merged list. */}
            {appendedItems.length > 0 && (
                <div className="mb-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FE8301] mb-1 flex items-center gap-1.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FE8301] animate-pulse" />
                        Added later · {appendedItems.length}
                    </div>
                    <div className="rounded-[10px] ring-1 ring-[#FE8301]/30 bg-[#FFF4E8] px-2 divide-y divide-[#FE8301]/15">
                        {appendedItems.map((item, index) => (
                            <div key={`appended-${index}`} className="flex justify-between items-center py-2">
                                <span className="text-[#1A181B] font-bold text-[16px]">{item.name}</span>
                                <span className="text-[#FE8301] font-bold text-[14px]">x{item.quantity}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="space-y-1">
                {appendedItems.length > 0 && (
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#8D848F] mb-1">
                        Original order · {originalItems.length}
                    </div>
                )}
                <div className={appendedItems.length > 0 ? 'opacity-70' : ''}>
                    {originalItems.map((item, index) => (
                        <div key={`original-${index}`} className="flex justify-between items-center p-2 border-b border-[#CCCAC8] last:border-0">
                            <span className="text-[#1A181B] font-bold text-[16px]">{item.name}</span>
                            <span className="text-[#645E66] font-bold text-[14px]">x{item.quantity}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions — disabled while a pickup/cancel request is in
                flight so a double-tap can't fire two API calls or fight
                the optimistic state. */}
            <div className="grid grid-cols-2 gap-4">
                <button
                    onClick={stopBubble(onCancel)}
                    disabled={isPending}
                    className="py-2 px-6 gap-2 rounded-[12px] border-1 border-[#FE8301] text-[#FE8301] font-bold text-[16px] transition-colors active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    Cancel
                </button>
                <button
                    onClick={stopBubble(onPickUp)}
                    disabled={isPending}
                    className="py-2 px-6 gap-2 rounded-[12px] bg-[#FE8301] border border-[#FE8301] text-[#FFFFFF] font-bold text-[16px] transition-colors active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    {isPending ? <Loader2 size={18} className="animate-spin" /> : 'Pick up'}
                </button>
            </div>
        </div>
    );
};

// --- ServedOrderCard Component ---
const ServedOrderCard = ({
    tableId = "T1",
    orderId = "0001",
    totalItems = 1,
    customerName,
    note = '',
    onOpenDetails,
}) => {
    const isRepeat = /^repeated from/i.test(note || '');
    return (
        <div
            onClick={onOpenDetails}
            role={onOpenDetails ? 'button' : undefined}
            tabIndex={onOpenDetails ? 0 : undefined}
            onKeyDown={onOpenDetails ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetails(); } } : undefined}
            className={`bg-[#FFFFFF] rounded-[16px] p-4 mb-2 shadow-[0px_2px_8px_0px_#70208329] transition-all h-full ${onOpenDetails ? 'cursor-pointer hover:shadow-[0px_4px_12px_0px_rgba(112,32,131,0.22)]' : ''}`}
        >
            <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-3 min-[375px]:gap-4 min-w-0 flex-1">
                    <div
                        title={String(tableId ?? '')}
                        className={`shrink-0 min-w-10 h-10 px-2 max-w-[96px] bg-[#A979B5] text-[#FFFFFF] rounded-[8px] flex items-center justify-center font-semibold truncate ${String(tableId ?? '').length > 3 ? 'text-[12px]' : 'text-[18px]'}`}
                    >
                        {tableId}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h3 title={orderId} className="text-[#645E66] font-extrabold text-[16px] truncate">
                                Order ID: {orderId || '—'}
                            </h3>
                            {isRepeat && (
                                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FFF4E8] text-[#FE8301] text-[10px] font-extrabold uppercase tracking-wide">
                                    <RotateCw size={10} strokeWidth={3} />
                                    Repeat
                                </span>
                            )}
                        </div>
                        <p title={customerName || 'Guest'} className="text-[#8D848F] text-[12px] font-semibold truncate flex items-center gap-1 mt-0.5">
                            <User size={11} strokeWidth={2.4} />
                            {customerName || 'Guest'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-[#34C759] flex-shrink-0">
                    <Check size={20} strokeWidth={1.5} />
                    <span className="text-[12px] font-extrabold">Completed</span>
                </div>
            </div>

            {/* Summary Section with strike-through line */}
            <div className="relative flex items-center justify-between gap-1 p-2">
                <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-[#666666] opacity-40"></div>
                <span className="relative z-10 text-[#B6AEB8] text-[16px] font-bold">
                    Total item
                </span>
                <span className="relative z-10 text-[#645E66] text-[14px] font-bold">
                    {totalItems}
                </span>
            </div>
        </div>
    );
};

// --- OrderDetailsModal — WAI-014 ---
// Click any card row in /waiter/orders → this modal opens with the
// full item list + a vertical status timeline. Status events are
// derived from order timestamps (createdAt, preparationStartedAt,
// preparationCompletedAt → "Ready", updatedAt when status === 'served'),
// so the timeline reflects whatever the backend has recorded without
// needing a separate audit-log endpoint.
const OrderDetailsModal = ({ order, onClose }) => {
    if (!order) return null;
    const items = Array.isArray(order.items) ? order.items : [];
    // Timeline event derivation — keep step nodes consistent across
    // orders even when timestamps are missing (legacy rows). A node
    // is "done" if its timestamp exists and is <= now.
    const fmt = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    const readyAt = order.preparationCompletedAt
        || (order.status === 'ready' || order.status === 'served' ? order.updatedAt : null);
    const servedAt = order.status === 'served' ? order.updatedAt : null;
    const timeline = [
        { label: 'Placed', at: order.createdAt, done: !!order.createdAt },
        { label: 'Preparing', at: order.preparationStartedAt, done: !!order.preparationStartedAt || ['preparing','ready','served'].includes(order.status) },
        { label: 'Ready', at: readyAt, done: !!readyAt || order.status === 'served' },
        { label: 'Served', at: servedAt, done: order.status === 'served' },
    ];
    return (
        <div
            className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Order details"
        >
            <div
                className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
                    <div className="min-w-0">
                        <h2 className="text-[18px] font-bold text-[#1A181B] truncate">Order Details</h2>
                        <p className="text-[12px] text-[#8D848F] truncate">Order ID: {order.id || order.orderId || '—'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="shrink-0 w-9 h-9 rounded-full hover:bg-gray-100 active:scale-95 flex items-center justify-center text-gray-500 hover:text-gray-800 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Customer + table summary */}
                <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-100">
                    <div>
                        <p className="text-[11px] uppercase font-bold text-[#8D848F] tracking-wider">Table</p>
                        <p className="text-[15px] font-semibold text-[#1A181B] mt-0.5">
                            {order.table?.name || (order.type === 'takeaway' ? 'Takeaway' : 'TA')}
                        </p>
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase font-bold text-[#8D848F] tracking-wider">Customer</p>
                        <p title={order.user || 'Guest'} className="text-[15px] font-semibold text-[#1A181B] mt-0.5 truncate flex items-center gap-1">
                            <User size={13} />
                            {order.user || 'Guest'}
                        </p>
                        {order.phone && (
                            <p className="text-[12px] text-[#645E66] mt-0.5 truncate">{order.phone}</p>
                        )}
                    </div>
                </div>

                {/* Items */}
                <div className="px-5 py-4 border-b border-gray-100">
                    <p className="text-[11px] uppercase font-bold text-[#8D848F] tracking-wider mb-3">Items ({items.length})</p>
                    <div className="space-y-2">
                        {items.length === 0 ? (
                            <p className="text-[13px] text-[#8D848F] italic">No items on this order.</p>
                        ) : items.map((item, i) => (
                            <div key={i} className="flex justify-between items-start gap-3 py-1.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[14px] font-semibold text-[#1A181B] truncate">{item.name || 'Unknown item'}</p>
                                    {item.instructions && (
                                        <p className="text-[11px] text-[#8D848F] italic mt-0.5 line-clamp-2">{item.instructions}</p>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    <p className="text-[13px] font-bold text-[#1A181B] tabular-nums">x{item.quantity}</p>
                                    <p className="text-[12px] text-[#645E66] tabular-nums">₹{Number(item.price || 0).toFixed(2)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    {Number(order.total) > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
                            <span className="text-[14px] font-bold text-[#1A181B]">Total</span>
                            <span className="text-[16px] font-extrabold text-[#702083] tabular-nums">₹{Number(order.total).toFixed(2)}</span>
                        </div>
                    )}
                </div>

                {/* Status timeline */}
                <div className="px-5 py-4">
                    <p className="text-[11px] uppercase font-bold text-[#8D848F] tracking-wider mb-3">Status Timeline</p>
                    <ol className="relative">
                        {timeline.map((step, i) => (
                            <li key={step.label} className="flex gap-3 pb-4 last:pb-0 relative">
                                {i < timeline.length - 1 && (
                                    <span aria-hidden="true" className={`absolute left-[11px] top-6 bottom-0 w-px ${step.done ? 'bg-[#702083]' : 'bg-gray-200'}`} />
                                )}
                                <div className={`relative shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${step.done ? 'bg-[#702083] text-white' : 'bg-gray-100 text-gray-400'}`}>
                                    {step.done ? <Check size={14} strokeWidth={3} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                                </div>
                                <div className="flex-1 -mt-0.5">
                                    <p className={`text-[14px] font-semibold ${step.done ? 'text-[#1A181B]' : 'text-[#B6AEB8]'}`}>
                                        {step.label}
                                    </p>
                                    {step.at && (
                                        <p className="text-[12px] text-[#8D848F]">{fmt(step.at)}</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
        </div>
    );
};

// --- Main WaiterOrders Component ---
const WaiterOrders = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navArea = location.state?.area || null;
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('ready');
    const [activeFloor, setActiveFloor] = useState(null);
    const [areas, setAreas] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [cafeConfig, setCafeConfig] = useState({ name: 'Cafe Name', logo: '' });
    // In-flight pickup/cancel actions. Used to disable buttons during
    // the request and to skip rendering optimistically-removed cards.
    const [pendingActions, setPendingActions] = useState(() => new Set());
    // WAI-014 — order whose card the waiter tapped to inspect.
    const [selectedOrder, setSelectedOrder] = useState(null);

    // CAP-010 — waiter scope. Narrows the floor pills and the order list
    // to the waiter's assigned areas/tables so the Orders tab matches the
    // Home tab. Empty assignment = catch-all waiter (whole branch).
    const scope = useMemo(() => getWaiterScope(user), [user]);

    useEffect(() => {
        settingsAPI.getSettings().then(res => {
            if (res.data) setCafeConfig({
                name: res.data.general?.cafeName || 'Cafe Name',
                logo: res.data.general?.logoUrl || ''
            });
        }).catch(() => {});
    }, []);

    // `silent: true` skips the full-page loader. Used by socket-driven
    // refreshes so the waiter doesn't see a flash of "Loading…" every
    // time chef ticks a card.
    const fetchData = useCallback(async ({ silent = false } = {}) => {
        try {
            if (!silent) setLoading(true);
            const areaRes = await waiterAPI.getAreas();
            if (areaRes.data.success) {
                // CAP-010 — narrow the floor pills to the waiter's assigned
                // areas (if any). /areas is the tenant-wide list; assignments
                // live on the user record, so the filter applies here — same
                // as the Home tab.
                const allAreas = areaRes.data.areas;
                const scopedAreas = scope.hasAreaScope
                    ? allAreas.filter(a => scope.assignedAreaIds.has(String(a._id)))
                    : allAreas;
                setAreas(scopedAreas);
                // Deep-link from a notification (router state `area`, a
                // name or id) opens on that section; otherwise first floor.
                const linked = navArea
                    ? scopedAreas.find(a => String(a._id) === String(navArea) || a.name === navArea)
                    : null;
                setActiveFloor(prev => prev || (linked?._id ?? scopedAreas[0]?._id ?? null));
            }

            const ordersRes = await waiterAPI.getLiveOrders();
            if (ordersRes.data.success) {
                setOrders(ordersRes.data.orders);
            }
        } catch (err) {
            console.error('Failed to fetch orders data', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [scope, navArea]);

    // Waiter rooms (t:<restaurantId>:waiter[:<branchId>]) are joined by the
    // server on connect from the JWT (BUG #6).
    // BUG #23 — slow safety poll while the socket is live, faster while down.
    const socketLive = useSocketConnected();
    useEffect(() => {
        fetchData();
    }, [user?.branch?._id, fetchData]);
    useEffect(() => {
        const interval = setInterval(() => fetchData({ silent: true }), socketLive ? 120_000 : 20_000);
        return () => clearInterval(interval);
    }, [socketLive, fetchData]);

    // Real-time: re-fetch silently when order/table events fire so the
    // list refreshes in place without flashing the loading screen.
    // `order:appended` covers the case where a customer adds items to
    // their existing active order (auto-append flow on the backend).
    // Bursts of events are coalesced into one fetch 300 ms later.
    const refetchTimerRef = useRef(null);
    const refetchSilent = useCallback(() => {
        if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = setTimeout(() => {
            refetchTimerRef.current = null;
            fetchData({ silent: true });
        }, 300);
    }, [fetchData]);
    useEffect(() => () => { if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current); }, []);
    // BUG #12 — resync after a reconnect.
    useSocketReconnect(refetchSilent);
    useSocketEvent('order:new', refetchSilent);
    useSocketEvent('order:updated', refetchSilent);
    useSocketEvent('order:cancelled', refetchSilent);
    useSocketEvent('order:ready', refetchSilent);
    useSocketEvent('order:appended', refetchSilent);
    useSocketEvent('table:updated', refetchSilent);

    // Optimistically transition a card to a new status so the Ready /
    // Served counts and lists update the instant the waiter taps —
    // no waiting for the server roundtrip or a tab switch. If the API
    // rejects, the catch block reverts the local state and a silent
    // fetch reconciles whatever else may have changed.
    const updateOrderStatusLocal = (orderId, nextStatus) => {
        setOrders(prev => prev.map(o => (
            o.id === orderId ? { ...o, status: nextStatus } : o
        )));
    };
    const removeOrderLocal = (orderId) => {
        setOrders(prev => prev.filter(o => o.id !== orderId));
    };

    const handlePickUp = async (orderId) => {
        if (pendingActions.has(orderId)) return;
        const previous = orders;
        setPendingActions(prev => new Set(prev).add(orderId));
        // Optimistic: ready → served immediately so the Ready count
        // drops and the card disappears from the Ready tab in the same
        // frame as the tap.
        updateOrderStatusLocal(orderId, 'served');
        try {
            const res = await waiterAPI.pickupOrder(orderId);
            if (res.data?.success) {
                toast.success('Order marked as served');
                fetchData({ silent: true });
            } else {
                throw new Error(res.data?.message || 'Pickup failed');
            }
        } catch (err) {
            console.error('Pickup failed', err);
            toast.error('Failed to mark as served');
            setOrders(previous);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                next.delete(orderId);
                return next;
            });
        }
    };

    // Cancelling an order that is already 'ready' or 'served' writes
    // off food that was actually cooked, so the server demands a
    // reason and a captain/manager role for those. Collect the reason
    // up front rather than firing a request we know will 400.
    const handleCancel = async (orderId, orderStatus) => {
        if (pendingActions.has(orderId)) return;

        const needsReason = orderStatus === 'ready' || orderStatus === 'served';
        let cancellationReason = '';
        if (needsReason) {
            const entered = window.prompt(
                `This order is already ${orderStatus}. The food has been prepared — give a reason for cancelling it:`,
            );
            // null = the waiter backed out of the prompt. Abort silently;
            // an empty-string entry is a real (invalid) answer and is
            // reported below.
            if (entered === null) return;
            cancellationReason = entered.trim();
            if (cancellationReason.length < 3) {
                toast.error('Enter a reason of at least 3 characters to cancel a prepared order.');
                return;
            }
        }

        const previous = orders;
        setPendingActions(prev => new Set(prev).add(orderId));
        // Optimistic: cancelled orders aren't shown on either tab, so
        // remove from the local list immediately.
        removeOrderLocal(orderId);
        try {
            const res = await api.patch(
                `/orders/${orderId}/status`,
                { status: 'cancelled', ...(cancellationReason ? { cancellationReason } : {}) },
                { _silent: true },
            );
            if (res.data?.success) {
                toast.success('Order cancelled');
                fetchData({ silent: true });
            } else {
                toast.error(res.data?.message || 'Failed to cancel order');
                setOrders(previous);
            }
        } catch (err) {
            // Surface the server's specific refusal — "ask a captain"
            // is actionable; "Failed to cancel order" is not.
            const code = err.response?.data?.code;
            const msg = err.response?.data?.message;
            if (code === 'CANCEL_REQUIRES_PRIVILEGE') {
                toast.error(msg || 'Only a captain or manager can cancel a prepared order.', { duration: 5000 });
            } else if (code === 'CANCEL_REASON_REQUIRED') {
                toast.error(msg || 'A reason is required to cancel a prepared order.');
            } else {
                console.error('Cancel failed', err);
                toast.error(msg || 'Failed to cancel order');
            }
            setOrders(previous);
        } finally {
            setPendingActions(prev => {
                const next = new Set(prev);
                next.delete(orderId);
                return next;
            });
        }
    };

    // `o.table?.area` may arrive as a raw ObjectId string OR a populated
    // `{ _id, name }` object depending on which backend endpoint served
    // the row. Normalise before comparing so a nested-populate change on
    // the backend can't silently break the floor filter.
    const matchesActiveFloor = (o) => {
        if (!activeFloor) return true;
        if (!o.table) return true; // takeaway has no floor — always keep
        const areaId = typeof o.table.area === 'object' ? o.table.area?._id : o.table.area;
        return String(areaId || '') === String(activeFloor);
    };

    // CAP-010 — restrict to the waiter's assigned areas/tables (takeaway
    // stays visible to all). See utils/waiterScope.
    const visibleOrders = orders.filter(o => inWaiterScope(scope, o));
    const filteredReadyOrders = visibleOrders.filter(o => o.status === 'ready' && matchesActiveFloor(o));
    const filteredServedOrders = visibleOrders.filter(o => o.status === 'served' && matchesActiveFloor(o));

    // Per-area ready counts for the floor pills so a waiter can see at a
    // glance which floor actually has orders waiting. Previously the
    // "Ready 3" badge lived only on the ChefDashboard, making a waiter
    // pick an empty floor tab with no hint that the 3 orders are sitting
    // on a different floor.
    const readyCountByArea = visibleOrders.reduce((acc, o) => {
        if (o.status !== 'ready' || !o.table) return acc;
        const areaId = typeof o.table.area === 'object' ? o.table.area?._id : o.table.area;
        const key = String(areaId || '');
        if (!key) return acc;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const totalReadyCount = visibleOrders.filter(o => o.status === 'ready').length;

    // Pretty name for the currently-selected floor — used in the empty
    // state message so the user never sees a 24-char hex ObjectId.
    const activeFloorName = (areas.find(a => String(a._id) === String(activeFloor))?.name) || '';

    return (
        <div className="bg-[#F9FAFB] min-h-screen font-sans transition-all duration-300 pb-24">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                {/* Top Header — sticky so the area chips + tab control stay
                    in reach while scrolling a long list of ready orders. */}
                <header className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 bg-[#F9FAFB]/95 backdrop-blur pt-6 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3 mb-5">
                        {resolveImageUrl(cafeConfig.logo) && (
                            <img
                                src={resolveImageUrl(cafeConfig.logo)}
                                alt="Logo"
                                className="h-11 sm:h-12 w-auto max-w-[150px] object-contain shrink-0 mix-blend-multiply"
                                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                            />
                        )}
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{cafeConfig.name}</h1>
                        <div className="ml-auto flex items-center gap-2">
                            <NotificationBell />
                            <StaffProfileMenu />
                        </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open menu"
                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <Menu size={28} strokeWidth={1.75} />
                        </button>

                        <div className="flex-1 flex gap-2 text-[13px] font-bold overflow-x-auto no-scrollbar py-1">
                            {areas.map((area) => {
                                const readyHere = readyCountByArea[String(area._id)] || 0;
                                const isActive = activeFloor === area._id;
                                return (
                                    <button
                                        key={area._id}
                                        onClick={() => setActiveFloor(area._id)}
                                        className={`min-h-11 px-4 rounded-xl border transition-all duration-200 min-w-[max-content] flex items-center gap-2 ${isActive
                                            ? 'border-[#7C3AED] text-[#7C3AED] bg-[#F9F1FB]'
                                            : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
                                            }`}
                                    >
                                        <span>{area.name}</span>
                                        {readyHere > 0 && (
                                            <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-black tabular-nums ${
                                                isActive ? 'bg-[#7C3AED] text-white' : 'bg-red-100 text-red-600'
                                            }`}>
                                                {readyHere}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </header>

                {/* Tabs — counts are live (driven by `orders` state, scoped
                    to the active floor) so an optimistic pickup drops the
                    Ready badge in the same frame as the tap. */}
                <div className="bg-[#ECECF0] rounded-full flex p-1 my-4">
                    <button
                        onClick={() => setActiveTab('ready')}
                        className={`flex-1 min-h-11 px-4 rounded-full font-bold transition-all text-base flex items-center justify-center gap-2 ${activeTab === 'ready'
                            ? 'bg-[#702083] text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Ready
                        <span className={`inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full text-xs font-black tabular-nums ${
                            activeTab === 'ready' ? 'bg-white/25 text-white' : 'bg-[#702083]/10 text-[#702083]'
                        }`}>
                            {filteredReadyOrders.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('served')}
                        className={`flex-1 min-h-11 px-4 rounded-full font-bold transition-all text-base flex items-center justify-center gap-2 ${activeTab === 'served'
                            ? 'bg-[#702083] text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Served
                        <span className={`inline-flex items-center justify-center min-w-6 h-5 px-1.5 rounded-full text-xs font-black tabular-nums ${
                            activeTab === 'served' ? 'bg-white/25 text-white' : 'bg-[#702083]/10 text-[#702083]'
                        }`}>
                            {filteredServedOrders.length}
                        </span>
                    </button>
                </div>

                {/* Content. Two-column grid on tablet+ so the waiter can
                    scan 6-8 cards at a glance instead of one per row. */}
                <div className="animate-in fade-in duration-300">
                    {activeTab === 'ready' ? (
                        filteredReadyOrders.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                {filteredReadyOrders.map(order => (
                                    <ReadyOrderCard
                                        key={order.id}
                                        orderId={order.id}
                                        tableId={order.tableId}
                                        items={order.items}
                                        time={order.time}
                                        isUrgent={order.isUrgent}
                                        createdAt={order.createdAt}
                                        customerName={order.user}
                                        note={order.note}
                                        onCancel={() => handleCancel(order.id, order.status)}
                                        onPickUp={() => handlePickUp(order.id)}
                                        onOpenDetails={() => setSelectedOrder(order)}
                                        isPending={pendingActions.has(order.id)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <WaiterEmptyState
                                icon={CheckCircle2}
                                title={`No ready orders${activeFloorName ? ` for ${activeFloorName}` : ''}`}
                                hint={totalReadyCount > 0
                                    ? `${totalReadyCount} ready on other floor${totalReadyCount > 1 ? 's' : ''} — tap a pill with a red badge.`
                                    : 'Cards land here the moment the kitchen marks an order ready.'}
                            />
                        )
                    ) : (
                        filteredServedOrders.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                {filteredServedOrders.map(order => (
                                    <ServedOrderCard
                                        key={order.id}
                                        orderId={order.id}
                                        tableId={order.tableId}
                                        totalItems={order.totalItems}
                                        customerName={order.user}
                                        note={order.note}
                                        onOpenDetails={() => setSelectedOrder(order)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <WaiterEmptyState
                                icon={Clock}
                                title={`No served orders${activeFloorName ? ` for ${activeFloorName}` : ''}`}
                                hint="Orders move here once you mark them picked up from this tab."
                            />
                        )
                    )}
                </div>
            </div>
            <BottomNav />
            {/* WAI-014 — Order Details modal. Opens when the waiter taps
                any Ready/Served card; closes on backdrop click or X. */}
            <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
        </div>
    );
};

export default WaiterOrders;