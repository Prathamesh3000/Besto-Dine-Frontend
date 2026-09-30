import React from 'react';
import {
    AlertTriangle,
    PlayCircle,
    CheckCircle2,
    Loader2,
    MoreVertical,
    Package,
    Utensils,
    Sparkles,
    Hourglass,
    Clock,
} from 'lucide-react';
import ChefItemCard from './ChefItemCard';
import useOrderTimer from '../../../hooks/useOrderTimer';

/**
 * ChefOrderCard — single order tile in the Kanban board.
 *
 * Admin-themed (cream/white surface, #FE8301 primary accent). Four
 * labelled sections separated by horizontal dividers so a chef can
 * scan it top-to-bottom:
 *
 *   ┌────────────────────────────────────┐
 *   │ ORDER                          ⋮  │  ← top label + view button
 *   │ #1234        ▶ Table 5             │  ← BIG id + table on baseline
 *   ├────────────────────────────────────┤
 *   │ TIMER                              │
 *   │ 00:42  waiting                     │
 *   ├────────────────────────────────────┤
 *   │ ITEMS · 3                          │
 *   │ ×2 Margherita Pizza         ●veg  │
 *   │    ↳ no olives                     │
 *   │ ×1 Garlic Bread             ●veg  │
 *   ├────────────────────────────────────┤
 *   │ ⚠ Allergen alert (only if any)     │
 *   │ [   ▶  START PREPARATION       ]   │
 *   └────────────────────────────────────┘
 */

// ─── Per-status visual config — admin palette ───────────────────────
const STATUS_CONFIG = {
    new: {
        accent:        'bg-amber-500',
        accentText:    'text-amber-700',
        accentRing:    'ring-amber-200',
        action:        'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-[0_6px_20px_rgba(245,158,11,0.25)]',
        actionLabel:   'Start Preparation',
        ActionIcon:    PlayCircle,
        timerLabel:    'Waiting',
        progressBar:   'bg-amber-500',
    },
    preparing: {
        accent:        'bg-[#FE8301]',
        accentText:    'text-[#FE8301]',
        accentRing:    'ring-orange-200',
        action:        'bg-[#FE8301] hover:bg-orange-600 active:bg-orange-700 text-white shadow-[0_6px_20px_rgba(254,131,1,0.3)]',
        actionLabel:   'Mark as Ready',
        ActionIcon:    CheckCircle2,
        timerLabel:    'Cooking',
        progressBar:   'bg-[#FE8301]',
    },
    ready: {
        accent:        'bg-emerald-500',
        accentText:    'text-emerald-700',
        accentRing:    'ring-emerald-200',
        action:        '',
        actionLabel:   'Awaiting waiter',
        ActionIcon:    CheckCircle2,
        timerLabel:    'Ready',
        progressBar:   'bg-emerald-500',
    },
};

// Urgency thresholds (minutes) — only applied to NEW orders. Cooking
// long can be intentional, waiting long is always bad.
const URGENT_AFTER = 10;
const COOKING_TARGET_MIN = 15;

const ChefOrderCard = ({ order, onAction, onView, actionLoading, serverOffsetMs = 0, justAppended = false }) => {
    const status = order.status || 'new';
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
    const ActionIcon = cfg.ActionIcon;

    // Each column's timer answers a different question, so each needs
    // its own anchor:
    //
    //   new       → how long has this been waiting to be started?
    //   preparing → how long has it been cooking?
    //   ready     → how long has it sat on the pass?
    //
    // `ready` previously fell back to createdAt, so it showed total
    // order age rather than time-since-ready — the number the chef
    // actually needs when deciding what's going cold. It now reads the
    // dedicated preparationCompletedAt stamp that updateOrderStatus
    // writes on the new→ready transition. updatedAt remains a fallback
    // for orders created before that stamp existed, but it is only a
    // fallback: ANY save bumps it, so it drifts.
    const timerAnchor =
        status === 'preparing' ? (order.preparationStartedAt || order.updatedAt || order.createdAt)
        : status === 'ready'   ? (order.preparationCompletedAt || order.updatedAt || order.createdAt)
        : order.createdAt;

    const elapsed = useOrderTimer(timerAnchor, serverOffsetMs);

    const isUrgent = (status === 'new' && elapsed.minutes >= URGENT_AFTER) || order.isUrgent;

    // Takeaway-queue extras. queueBucket is 'scheduled' when prep
    // shouldn't start yet — we surface that in the action area so the
    // chef can't accidentally cook a 3 PM pickup at 11 AM. pickupAt /
    // prepStartAt drive the small pills next to the table label.
    const queueBucket = order.queueBucket || null;
    const isScheduled = queueBucket === 'scheduled';
    const pickupAtMs = order.pickupAt ? new Date(order.pickupAt).getTime() : null;
    const prepStartAtMs = order.prepStartAt ? new Date(order.prepStartAt).getTime() : null;
    const nowMs = Date.now() - serverOffsetMs;
    const minsToPickup = pickupAtMs ? Math.round((pickupAtMs - nowMs) / 60000) : null;
    const minsToPrep = prepStartAtMs ? Math.round((prepStartAtMs - nowMs) / 60000) : null;
    const formatTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const formatCountdown = (mins) => {
        if (mins === null || mins === undefined) return '';
        if (mins < 0) return `${-mins}m late`;
        if (mins < 60) return `in ${mins}m`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `in ${h}h ${m}m`;
    };
    const cookingProgress = status === 'preparing'
        ? Math.min((elapsed.totalSec / 60 / COOKING_TARGET_MIN) * 100, 100)
        : 0;

    const hasAllergen =
        order.note?.toLowerCase()?.match(/allerg|nut|gluten|lactose|dairy/) ||
        (order.items || []).some(i => i.allergen || (i.instructions || '').toLowerCase().match(/allerg|nut/));

    const isTakeaway = order.tableId === 'TA' || order.type === 'takeaway';
    // Use the populated table name + area object directly. The
    // previous `.replace(/\D/g, '')` stripped non-digits from the
    // table id which broke alphanumeric / merged-group names ("5, 6,
    // 7" turned into "567") and didn't surface the area at all.
    // Now: "Table 05 · Garden" — clear at a glance which floor /
    // section the order belongs to, which matters once a kitchen
    // services multiple seating zones.
    const rawTableName = order.table?.name || (order.tableId !== 'TA' ? order.tableId : '') || '—';
    const areaName = order.table?.area?.name || '';
    const tableLabel = isTakeaway
        ? 'Takeaway'
        : `Table ${rawTableName}${areaName ? ` · ${areaName}` : ''}`;

    const displayId = (() => {
        if (!order.id) return '—';
        const parts = String(order.id).split('-');
        return parts.length > 1 ? parts[parts.length - 1] : String(order.id).slice(-4);
    })();

    const isActionLoading = actionLoading === order._id;

    // Split items into the original round vs anything appended later.
    // Baseline = earliest item.addedAt among the order's items (NOT
    // order.createdAt). Why: Mongoose's `default: Date.now` on the
    // addedAt field can retroactively stamp pre-existing items with
    // `now` during any save(), so a naive `order.createdAt` baseline
    // would misclassify the entire original round as "added later" on
    // orders that were first touched after the schema change. Using
    // the min item timestamp as the baseline self-heals that case and
    // still correctly flags genuine appends (which come in a later
    // explicit batch). 60 s grace absorbs clock skew.
    const ADDED_LATER_GRACE_MS = 60_000;
    const allItems = order.items || [];
    const addedTimes = allItems
        .map(i => i?.addedAt ? new Date(i.addedAt).getTime() : null)
        .filter(Number.isFinite);
    const baselineMs = addedTimes.length
        ? Math.min(...addedTimes)
        : (order.createdAt ? new Date(order.createdAt).getTime() : 0);
    const originalRaw = [];
    const appendedRaw = [];
    for (const it of allItems) {
        const addedMs = it.addedAt ? new Date(it.addedAt).getTime() : baselineMs;
        if (Number.isFinite(addedMs) && addedMs - baselineMs > ADDED_LATER_GRACE_MS) {
            appendedRaw.push(it);
        } else {
            originalRaw.push(it);
        }
    }

    // De-duplicate when the same item appears in BOTH buckets — e.g.
    // customer originally ordered 2× Pineapple, then added 2× more
    // Pineapple later. The naive split would render two cards: a 2×
    // Pineapple in "Original" and another 2× Pineapple in "Added
    // later", so the chef has to mentally add 2+2 to know they need
    // 4 Pineapples total.
    //
    // Smarter rendering: merge the appended qty into the original
    // line and stamp `addedLaterQty` so we can still show the "+2
    // added later" hint inline. Only items not already present in
    // the original round stay in the appendedItems list — those are
    // the truly NEW dishes the chef hasn't started on yet.
    //
    // The merge key includes toppings + instructions + size so a
    // "Pineapple, extra cheese" stays separate from a plain
    // "Pineapple" — chef would otherwise lose the topping info on
    // half the units when we collapsed them into one line.
    const keyOf = (it) => {
        const base = String(it.menuItem || it.name || '').trim().toLowerCase();
        const toppings = Array.isArray(it.selectedToppings)
            ? it.selectedToppings.map(t => String(t?.name || '').trim().toLowerCase()).filter(Boolean).sort().join(',')
            : '';
        const sizes = Array.isArray(it.selectedSizes)
            ? it.selectedSizes.map(s => String(s?.name || '').trim().toLowerCase()).filter(Boolean).sort().join(',')
            : '';
        const instr = String(it.instructions || '').trim().toLowerCase();
        return `${base}|${sizes}|${toppings}|${instr}`;
    };
    // Step 1 — collapse same-key items WITHIN each bucket. Customer
    // re-ordering Crispy Corn twice (two separate Place Order taps)
    // used to render as "×1 Crispy Corn" appearing twice in a row;
    // chef has to mentally add them up. After this, it reads as
    // a single "×2 Crispy Corn" line.
    const collapseSameKeys = (list) => {
        const byKey = new Map();
        for (const it of list) {
            const k = keyOf(it);
            if (!k) {
                // Items without a stable key (legacy / mock ids) bypass
                // the merge — push each one through as-is so we don't
                // collapse genuinely-different items by accident.
                byKey.set(`__nokey-${byKey.size}`, { ...it });
                continue;
            }
            const existing = byKey.get(k);
            if (existing) {
                existing.quantity = (Number(existing.quantity) || 0) + (Number(it.quantity) || 0);
            } else {
                byKey.set(k, { ...it });
            }
        }
        return Array.from(byKey.values());
    };

    const originalItems = collapseSameKeys(originalRaw);
    const appendedDeduped = collapseSameKeys(appendedRaw);

    // Step 2 — merge appended items into matching original items.
    // Customer originally ordered 2× Pineapple, then added 2× more
    // Pineapple later. The naive split would render two cards: a 2×
    // Pineapple in "Original" and another 2× Pineapple in "Added
    // later", so the chef has to mentally add 2+2 to know they need
    // 4 Pineapples total.
    //
    // Smarter rendering: merge the appended qty into the original
    // line and stamp `addedLaterQty` so we can still show the "+2
    // added later" hint inline. Only items not already present in
    // the original round stay in the appendedItems list — those are
    // the truly NEW dishes the chef hasn't started on yet.
    const appendedItems = [];
    for (const ap of appendedDeduped) {
        const apKey = keyOf(ap);
        if (!apKey) {
            appendedItems.push(ap);
            continue;
        }
        const match = originalItems.find(orig => keyOf(orig) === apKey);
        if (match) {
            const apQty = Number(ap.quantity) || 0;
            match.quantity = (Number(match.quantity) || 0) + apQty;
            match.addedLaterQty = (Number(match.addedLaterQty) || 0) + apQty;
        } else {
            appendedItems.push(ap);
        }
    }

    return (
        <article
            className={[
                'relative bg-white rounded-xl border transition-all flex flex-col font-manrope overflow-hidden',
                isUrgent
                    ? 'border-red-300 shadow-[0_0_0_1px_rgba(239,68,68,0.4),0_8px_24px_rgba(239,68,68,0.12)]'
                    : justAppended
                        ? 'border-orange-300 shadow-[0_0_0_2px_rgba(254,131,1,0.45),0_8px_24px_rgba(254,131,1,0.15)]'
                        : 'border-gray-200 shadow-[0px_2px_8px_0px_#00000014]',
            ].join(' ')}
        >
            {/* Top accent bar — single source of column color */}
            <div className={`h-1 w-full ${cfg.accent}`} />

            {/* ═══ SECTION 1 · ORDER IDENTITY ══════════════════════ */}
            <section className="px-4 sm:px-5 pt-4 pb-4">
                <div className="flex items-start justify-between gap-3 mb-2 sm:mb-3">
                    <SectionLabel>Order</SectionLabel>
                    <button
                        type="button"
                        onClick={() => onView?.(order)}
                        aria-label="View order details"
                        title="View details"
                        className="-mt-1 -mr-1 w-9 h-9 rounded-lg text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50 flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]"
                    >
                        <MoreVertical size={16} />
                    </button>
                </div>

                <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap">
                    <h3 className="text-3xl sm:text-4xl font-black text-gray-900 leading-none tracking-tight tabular-nums">
                        #{displayId}
                    </h3>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ring-1 ${
                        isTakeaway
                            ? 'bg-violet-50 text-violet-700 ring-violet-200'
                            : 'bg-gray-50 text-gray-700 ring-gray-200'
                    }`}>
                        {isTakeaway
                            ? <Package size={12} strokeWidth={2.5} />
                            : <Utensils size={12} strokeWidth={2.5} />
                        }
                        {tableLabel}
                    </span>
                    {justAppended && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-orange-500 text-white animate-pulse">
                            <Sparkles size={11} strokeWidth={3} />
                            New items
                        </span>
                    )}
                </div>

                {/* Full order reference. The big "#id" above is only the short
                    suffix (last segment) for quick calling across the pass —
                    but two orders can share a suffix (e.g. same daily counter
                    on different prefixes), so surface the complete order id
                    too. Matches the "Order ID:" label the waiter + customer
                    apps show, so staff are all reading the same reference. */}
                {order.id && (
                    <p className="mt-1 text-[11px] font-semibold text-[#7D7380] tracking-wide">
                        Order ID: {order.id}
                    </p>
                )}

                {/* Takeaway pickup pill — prominent so the chef can see at
                    a glance when the customer needs the food. The countdown
                    reads live from `nowMs` so it refreshes on every parent
                    tick. */}
                {isTakeaway && pickupAtMs && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 ring-1 ring-violet-200 text-violet-700 text-[11px] font-bold tabular-nums">
                        <Clock size={12} strokeWidth={2.5} />
                        Pickup {formatTime(pickupAtMs)}
                        <span className={`font-black ${minsToPickup !== null && minsToPickup <= 10 ? 'text-red-600' : 'text-violet-900'}`}>
                            · {formatCountdown(minsToPickup)}
                        </span>
                    </div>
                )}
                {isScheduled && prepStartAtMs && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 ring-1 ring-slate-200 text-slate-700 text-[11px] font-bold tabular-nums">
                        <Hourglass size={12} strokeWidth={2.5} />
                        Start cooking {formatTime(prepStartAtMs)}
                        <span className="font-black text-slate-900">· {formatCountdown(minsToPrep)}</span>
                    </div>
                )}

                {isUrgent && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500 text-white text-[10px] font-black uppercase tracking-widest animate-pulse">
                        <AlertTriangle size={11} strokeWidth={3} />
                        {isTakeaway && minsToPickup !== null
                            ? (minsToPickup < 0 ? 'Urgent · Pickup overdue' : 'Urgent · Pickup soon')
                            : 'Urgent · Waiting too long'}
                    </div>
                )}
            </section>

            {/* ═══ SECTION 2 · TIMER ════════════════════════════════ */}
            <section className="px-4 sm:px-5 py-3 sm:py-4 border-t border-gray-100">
                <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <SectionLabel>{cfg.timerLabel}</SectionLabel>
                        <div className={`mt-1.5 text-3xl font-black tabular-nums leading-none ${
                            isUrgent ? 'text-red-600' : cfg.accentText
                        }`}>
                            {elapsed.text}
                        </div>
                    </div>
                    {status === 'preparing' && (
                        <div className="text-right shrink-0">
                            <SectionLabel>Target {COOKING_TARGET_MIN}m</SectionLabel>
                            <div className="text-sm font-bold text-[#FE8301] tabular-nums mt-1.5">
                                {Math.round(cookingProgress)}%
                            </div>
                        </div>
                    )}
                </div>

                {status === 'preparing' && (
                    <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${
                                cookingProgress >= 100 ? 'bg-red-500' : cfg.progressBar
                            }`}
                            style={{ width: `${cookingProgress}%` }}
                        />
                    </div>
                )}
            </section>

            {/* ═══ SECTION 3 · ITEMS ════════════════════════════════ */}
            {/* Split into "Original order" and "Added later" so the chef
                sees exactly what's new instead of the appended item
                disappearing into the merged list. */}
            <section className="px-4 sm:px-5 pt-4 pb-2 border-t border-gray-100 flex-1 min-h-0">
                {appendedItems.length > 0 && (
                    <div className="mb-3">
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-widest text-orange-700">
                            <Sparkles size={11} strokeWidth={3} />
                            Added later · <span className="text-orange-800">{appendedItems.length}</span>
                        </div>
                        <div className="rounded-lg ring-1 ring-orange-200 bg-orange-50/60 px-1 divide-y divide-orange-100">
                            {appendedItems.map((item, i) => (
                                <ChefItemCard key={`appended-${i}`} item={item} />
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between mb-1">
                    <SectionLabel>
                        {appendedItems.length > 0 ? 'Original order · ' : 'Items · '}
                        <span className="text-gray-700">{originalItems.length}</span>
                    </SectionLabel>
                </div>
                <div className={`divide-y divide-gray-100 max-h-72 overflow-y-auto custom-scrollbar -mx-1 px-1 ${appendedItems.length > 0 ? 'opacity-70' : ''}`}>
                    {originalItems.map((item, i) => (
                        <ChefItemCard key={`original-${i}`} item={item} />
                    ))}
                </div>
            </section>

            {/* ═══ SECTION 4 · ALERTS + ACTION ══════════════════════ */}
            <section className="px-4 sm:px-5 pt-3 pb-4 sm:pb-5 border-t border-gray-100 space-y-3">
                {/* Allergen warning */}
                {hasAllergen && (
                    <div className="px-3 py-2.5 rounded-lg bg-red-50 ring-1 ring-red-200 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-red-700 leading-none">
                                Allergen alert
                            </div>
                            <p className="text-xs text-red-700 font-semibold mt-1 leading-snug">
                                Verify ingredients before plating
                            </p>
                        </div>
                    </div>
                )}

                {/* Order-level chef note */}
                {order.note && (
                    <div className="px-3 py-2.5 rounded-lg bg-amber-50 ring-1 ring-amber-200 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2.5} />
                        <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 leading-none">
                                Chef note
                            </div>
                            <p className="text-xs text-amber-800 font-semibold mt-1 leading-snug">
                                {order.note}
                            </p>
                        </div>
                    </div>
                )}

                {/* Primary action button — full width, single source of truth */}
                {isScheduled ? (
                    <div className="w-full h-14 sm:h-16 bg-slate-50 ring-1 ring-slate-200 text-slate-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-default">
                        <Hourglass size={20} strokeWidth={2.5} />
                        {prepStartAtMs
                            ? `Start cooking at ${formatTime(prepStartAtMs)}`
                            : 'Scheduled for later'}
                    </div>
                ) : status === 'ready' ? (
                    <div className="w-full h-14 sm:h-16 bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 cursor-default">
                        <CheckCircle2 size={20} strokeWidth={2.5} />
                        Awaiting waiter pickup
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => onAction?.(order._id)}
                        disabled={isActionLoading}
                        className={`w-full h-14 sm:h-16 rounded-xl font-bold text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white focus-visible:ring-[#FE8301] ${cfg.action}`}
                    >
                        {isActionLoading ? (
                            <Loader2 size={22} className="animate-spin" />
                        ) : (
                            <>
                                <ActionIcon size={22} strokeWidth={2.5} />
                                <span className="tracking-tight">{cfg.actionLabel}</span>
                            </>
                        )}
                    </button>
                )}
            </section>
        </article>
    );
};

// ─── Internal helpers ────────────────────────────────────────────────
const SectionLabel = ({ children, className = '' }) => (
    <div className={`text-[10px] font-bold uppercase tracking-widest text-[#7D7380] ${className}`}>
        {children}
    </div>
);

export default ChefOrderCard;
