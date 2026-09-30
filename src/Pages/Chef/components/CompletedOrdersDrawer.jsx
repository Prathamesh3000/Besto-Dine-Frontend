import React, { useEffect, useState, useCallback } from 'react';
import { X, CheckCircle2, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { chefAPI } from '../../../utils/api';

/**
 * Completed-orders drawer for the chef dashboard.
 *
 * The dashboard previously showed "Completed 34" as a dead badge — the
 * count was the whole feature. A chef who wanted to confirm that a
 * particular order had actually gone out, or see what was sent earlier
 * in the shift, had nowhere to look.
 *
 * Fetched on open rather than polled with the live board: this is an
 * occasional lookback, and refreshing it every 15 seconds alongside
 * the Kanban would be wasted traffic on a kitchen tablet's Wi-Fi.
 */

const RANGES = [
    { days: 1, label: 'Today' },
    { days: 3, label: '3 days' },
    { days: 7, label: 'Week' },
];

export default function CompletedOrdersDrawer({ open, onClose }) {
    const [days, setDays] = useState(1);
    const [state, setState] = useState({ loading: false, error: null, orders: [], total: 0 });

    const load = useCallback(async (rangeDays) => {
        setState((s) => ({ ...s, loading: true, error: null }));
        try {
            const res = await chefAPI.getCompletedKitchenOrders(rangeDays);
            if (res.data?.success) {
                setState({
                    loading: false,
                    error: null,
                    orders: res.data.orders || [],
                    total: res.data.total || 0,
                });
            } else {
                setState((s) => ({ ...s, loading: false, error: res.data?.message || 'Could not load completed orders.' }));
            }
        } catch (err) {
            setState((s) => ({
                ...s,
                loading: false,
                error: err.response?.data?.message || 'Could not load completed orders.',
            }));
        }
    }, []);

    useEffect(() => {
        if (open) load(days);
    }, [open, days, load]);

    // Escape closes — a chef with flour on their hands shouldn't have
    // to hit a small target to dismiss this.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                role="dialog"
                aria-modal="true"
                aria-label="Completed orders"
                className="relative w-full max-w-[460px] h-full bg-[#F6F6F7] shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]"
            >
                <header className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                        <h2 className="text-[16px] font-bold text-[#1A181B] truncate">Completed orders</h2>
                        {!state.loading && (
                            <span className="text-[12px] text-[#7D7380] tabular-nums shrink-0">({state.total})</span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center shrink-0 transition-colors"
                    >
                        <X size={18} className="text-[#5A535F]" />
                    </button>
                </header>

                <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex gap-1.5 shrink-0">
                    {RANGES.map((r) => (
                        <button
                            key={r.days}
                            onClick={() => setDays(r.days)}
                            aria-pressed={days === r.days}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition ${
                                days === r.days
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-gray-100 text-[#7D7380] hover:bg-gray-200'
                            }`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {state.loading && (
                        <div className="flex items-center justify-center py-16 text-[#7D7380] gap-2">
                            <Loader2 size={18} className="animate-spin" />
                            <span className="text-[13px]">Loading…</span>
                        </div>
                    )}

                    {!state.loading && state.error && (
                        <div className="flex flex-col items-center py-14 px-6 text-center gap-3">
                            <AlertTriangle size={26} className="text-amber-500" />
                            <p className="text-[13px] text-[#7D7380]">{state.error}</p>
                            <button
                                onClick={() => load(days)}
                                className="text-[13px] font-bold text-emerald-700 hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {!state.loading && !state.error && state.orders.length === 0 && (
                        <div className="flex flex-col items-center py-16 px-6 text-center gap-2">
                            <CheckCircle2 size={26} className="text-gray-300" />
                            <p className="text-[13px] text-[#7D7380]">
                                Nothing completed {days === 1 ? 'yet today' : `in the last ${days} days`}.
                            </p>
                        </div>
                    )}

                    {!state.loading && !state.error && state.orders.map((o) => (
                        <article
                            key={o._id}
                            className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-[0px_1px_3px_0px_#0000000F]"
                        >
                            <div className="flex items-start justify-between gap-3 mb-1.5">
                                <div className="min-w-0">
                                    <p className="font-bold text-[14px] text-[#1A181B] truncate">
                                        {o.orderId}
                                    </p>
                                    <p className="text-[12px] text-[#7D7380] truncate">
                                        {o.tableName ? `Table ${o.tableName}` : 'Takeaway'}
                                        {o.areaName ? ` · ${o.areaName}` : ''}
                                        {o.customerName ? ` · ${o.customerName}` : ''}
                                    </p>
                                </div>
                                <span className="text-[12px] text-[#7D7380] tabular-nums shrink-0">
                                    {formatTime(o.servedAt)}
                                </span>
                            </div>

                            <p className="text-[12px] text-[#5A535F] leading-relaxed">
                                {(o.items || []).map((it) => `${it.name}${it.quantity > 1 ? ` ×${it.quantity}` : ''}`).join(', ')}
                            </p>

                            {/* Only rendered when the order carries a real
                                preparationCompletedAt. Orders predating
                                per-status timestamps show nothing rather
                                than a number derived from updatedAt,
                                which any unrelated save would have skewed. */}
                            {o.prepMinutes != null && (
                                <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#7D7380] bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5">
                                    <Clock size={10} />
                                    {o.prepMinutes} min to prepare
                                </p>
                            )}
                        </article>
                    ))}
                </div>
            </aside>
        </div>
    );
}

function formatTime(value) {
    if (!value) return '';
    try {
        return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}
