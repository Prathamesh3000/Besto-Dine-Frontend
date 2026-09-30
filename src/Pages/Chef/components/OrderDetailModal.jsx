import React, { useEffect } from 'react';
import {
    X,
    AlertTriangle,
    User,
    Clock,
    Hash,
    Package,
    Utensils,
    MessageSquare,
} from 'lucide-react';

/**
 * OrderDetailModal — admin-themed read-only deep-dive into a kitchen order.
 *
 * Triggered from the eye-icon on ChefOrderCard. Surfaces everything a
 * chef might need to verify *before* hitting the action button:
 * customer name, exact item list, per-item instructions and the
 * order-level chef note.
 */

const STATUS_BADGE = {
    new:       { label: 'New',       cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
    preparing: { label: 'Preparing', cls: 'bg-orange-50 text-[#FE8301] ring-orange-200' },
    ready:     { label: 'Ready',     cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    served:    { label: 'Served',    cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
};

const OrderDetailModal = ({ order, onClose }) => {
    // ESC closes the modal — common kitchen muscle memory.
    useEffect(() => {
        if (!order) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [order, onClose]);

    if (!order) return null;

    const isTakeaway = order.tableId === 'TA' || order.type === 'takeaway';
    // Match ChefOrderCard's table-label resolution — name + area so
    // the modal header reads "Table 05 · Garden" instead of just
    // "Table 05" with no area context.
    const rawTableName = order.table?.name || (order.tableId !== 'TA' ? order.tableId : '') || '—';
    const areaName = order.table?.area?.name || '';
    const tableLabel = isTakeaway
        ? 'TAKEAWAY'
        : `Table ${rawTableName}${areaName ? ` · ${areaName}` : ''}`;
    const displayId = (() => {
        if (!order.id) return '—';
        const parts = String(order.id).split('-');
        return parts.length > 1 ? parts[parts.length - 1] : String(order.id).slice(-4);
    })();
    const statusBadge = STATUS_BADGE[order.status] || STATUS_BADGE.new;

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6 font-manrope animate-fadeIn"
            onClick={onClose}
        >
            <div
                className="relative w-full sm:max-w-2xl bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-[0px_20px_50px_0px_#00000025] flex flex-col max-h-[92vh] animate-slideUp"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Header ─────────────────────────────────────── */}
                <header className="px-5 sm:px-6 py-5 border-b border-gray-100 flex items-start gap-4">
                    <div className={`shrink-0 w-14 h-14 rounded-xl ring-1 flex items-center justify-center ${
                        isTakeaway
                            ? 'bg-violet-50 text-violet-600 ring-violet-200'
                            : 'bg-orange-50 text-[#FE8301] ring-orange-200'
                    }`}>
                        {isTakeaway
                            ? <Package size={24} strokeWidth={2.25} />
                            : <Utensils size={24} strokeWidth={2.25} />
                        }
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <Hash size={14} className="text-[#7D7380]" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#7D7380]">Order</span>
                        </div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight tabular-nums leading-none mt-1">
                            #{displayId}
                        </h2>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider ring-1 ring-gray-200">
                                {tableLabel}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ring-1 ${statusBadge.cls}`}>
                                {statusBadge.label}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="w-10 h-10 rounded-xl bg-gray-50 hover:bg-gray-100 text-[#7D7380] hover:text-gray-900 ring-1 ring-gray-200 flex items-center justify-center transition shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]"
                    >
                        <X size={18} />
                    </button>
                </header>

                {/* ── Body ───────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-5 bg-[#FAF5F0]/40">
                    {/* Quick info grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <InfoTile
                            icon={User}
                            label="Customer"
                            value={order.user || 'Guest'}
                        />
                        <InfoTile
                            icon={Clock}
                            label="Placed at"
                            value={new Date(order.createdAt).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                            })}
                        />
                    </div>

                    {/* Chef note — most important callout */}
                    {order.note && (
                        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4 flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-amber-100 ring-1 ring-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                                <AlertTriangle size={16} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                    Chef instruction
                                </div>
                                <p className="text-sm font-semibold text-amber-900 mt-1 leading-relaxed">
                                    "{order.note}"
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Items list */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7D7380]">
                                Items ({order.items?.length || 0})
                            </h3>
                            <span className="h-px flex-1 mx-3 bg-gray-200" />
                        </div>
                        <div className="space-y-2">
                            {order.items?.map((item, i) => (
                                <DetailItem key={i} item={item} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────── */}
                <footer className="px-5 sm:px-6 py-4 border-t border-gray-100 bg-white">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full h-12 rounded-xl bg-[#FE8301] hover:bg-orange-600 text-white font-bold text-sm shadow-[0_6px_20px_rgba(254,131,1,0.25)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FE8301]"
                    >
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

// ─── Internal helpers ────────────────────────────────────────────────
const InfoTile = ({ icon, label, value }) => {
    const Icon = icon;
    return (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-3.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#7D7380]">
                <Icon size={11} />
                {label}
            </div>
            <div className="text-sm font-bold text-gray-900 mt-1.5 truncate">{value}</div>
        </div>
    );
};

const DetailItem = ({ item }) => {
    const isVeg = item.vegType === 'veg';
    return (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-3.5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    {item.vegType && (
                        <div
                            className={`mt-1 w-4 h-4 border-[2.5px] rounded-sm flex items-center justify-center shrink-0 ${
                                isVeg ? 'border-emerald-500' : 'border-red-500'
                            }`}
                        >
                            <div className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-base font-bold text-gray-900 truncate">{item.name}</p>
                        {item.category && (
                            <p className="text-xs text-[#7D7380] mt-0.5">{item.category}</p>
                        )}
                        {/* Size / topping snapshot — without it two lines of
                            the same dish looked identical in this modal. */}
                        {((item.selectedSizes || []).length > 0 || (item.selectedToppings || []).length > 0) && (
                            <p className="text-xs text-[#FE8301] font-semibold mt-0.5 wrap-break-word">
                                {[...(item.selectedSizes || []), ...(item.selectedToppings || [])]
                                    .map((x) => x?.name)
                                    .filter(Boolean)
                                    .join(' · ')}
                            </p>
                        )}
                    </div>
                </div>
                <span className="shrink-0 px-2.5 py-1 rounded-lg bg-[#FAF5F0] ring-1 ring-gray-200 text-sm font-black text-gray-900 tabular-nums">
                    ×{item.quantity}
                </span>
            </div>
            {item.instructions && (
                <div className="mt-3 pl-3 border-l-2 border-amber-300 flex items-start gap-2">
                    <MessageSquare size={12} className="text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 italic font-medium leading-snug">"{item.instructions}"</p>
                </div>
            )}
        </div>
    );
};

export default OrderDetailModal;
