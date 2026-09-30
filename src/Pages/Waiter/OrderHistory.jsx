import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Clock3, Check, XCircle, Loader2, Calendar, Download } from 'lucide-react';
import { waiterAPI } from '../../utils/api';
import WaiterEmptyState from '../../Components/Waiter/WaiterEmptyState';
import toast from 'react-hot-toast';

// WAI-015 — date-range presets. Same labels and semantics as the admin
// PastOrders panel, so a tester can pick "Last 7 Days" and see exactly
// what they'd see in the admin view (orders with createdAt in the window).
const DATE_RANGES = [
    { id: 'all', label: 'All time' },
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
];

// Resolve a date-range id into a { from, to } range (both Date or null).
// Returns { from: null, to: null } for "all time" so the filter is a no-op.
const resolveDateRange = (id) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    switch (id) {
        case 'today':     return { from: startOfToday, to: startOfTomorrow };
        case 'yesterday': {
            const start = new Date(startOfToday); start.setDate(start.getDate() - 1);
            return { from: start, to: startOfToday };
        }
        case '7d': {
            const start = new Date(startOfToday); start.setDate(start.getDate() - 6);
            return { from: start, to: startOfTomorrow };
        }
        case '30d': {
            const start = new Date(startOfToday); start.setDate(start.getDate() - 29);
            return { from: start, to: startOfTomorrow };
        }
        default: return { from: null, to: null };
    }
};

const OrderHistory = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [activeTab, setActiveTab] = useState('all');
    // WAI-015 — date-range filter, defaults to "Last 7 days" (the most
    // common waiter ask: "what did I serve this week"). Set on the
    // dropdown; resolveDateRange() converts to a {from, to} window
    // applied client-side over the already-fetched orders list.
    const [dateRangeId, setDateRangeId] = useState('7d');
    const [dateMenuOpen, setDateMenuOpen] = useState(false);

    useEffect(() => {
        fetchPastOrders();
    }, []);

    const fetchPastOrders = async () => {
        setLoading(true);
        try {
            const res = await waiterAPI.getPastOrders();
            if (res.data?.success) {
                setOrders(res.data.orders || []);
            }
        } catch (err) {
            console.error('Failed to fetch past orders:', err);
            toast.error('Failed to load order history');
        } finally {
            setLoading(false);
        }
    };

    // Apply date range first — same window feeds the tab counts AND the
    // visible list so a tester switching from "All time" to "Last 7
    // days" sees the badge counts update too (not just the list).
    const dateRange = useMemo(() => resolveDateRange(dateRangeId), [dateRangeId]);
    const dateScopedOrders = useMemo(() => {
        if (!dateRange.from && !dateRange.to) return orders;
        const fromMs = dateRange.from ? dateRange.from.getTime() : -Infinity;
        const toMs   = dateRange.to   ? dateRange.to.getTime()   : +Infinity;
        return orders.filter(o => {
            const ts = new Date(o.createdAt || o.orderDate || 0).getTime();
            if (!Number.isFinite(ts)) return false;
            return ts >= fromMs && ts < toMs;
        });
    }, [orders, dateRange]);

    const filteredOrders = activeTab === 'all'
        ? dateScopedOrders
        : activeTab === 'served'
            ? dateScopedOrders.filter(o => o.status === 'served')
            : dateScopedOrders.filter(o => o.status === 'cancelled');

    const tabs = [
        { id: 'all', label: `All (${dateScopedOrders.length})` },
        { id: 'served', label: `Served (${dateScopedOrders.filter(o => o.status === 'served').length})` },
        { id: 'cancelled', label: `Cancelled (${dateScopedOrders.filter(o => o.status === 'cancelled').length})` },
    ];

    const activeRangeLabel = (DATE_RANGES.find(r => r.id === dateRangeId)?.label) || 'All time';

    // WAI-016 — receipt download. Opens a printable HTML receipt in a
    // new tab and triggers the browser's "Save as PDF" via window.print().
    // No PDF library involved — the customer Bill page uses the same
    // approach (BillReceipt.jsx → window.print() with `@media print`),
    // so output styling is consistent across the app.
    const handleDownloadReceipt = (order) => {
        try {
            const items = Array.isArray(order.items) ? order.items : [];
            const fmt = (n) => `₹${Number(n || 0).toFixed(2)}`;
            const subtotal = items.reduce((s, it) => s + Number(it.price || 0) * Number(it.quantity || 0), 0);
            const tableLabel = order.type === 'takeaway' ? 'Takeaway' : `Table ${order.table || order.tableId || '—'}`;
            const orderIdSafe = String(order.id || order.orderId || '');
            const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>Receipt ${orderIdSafe}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#1A181B; max-width: 380px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .muted { color:#8D848F; font-size: 12px; }
  .row { display:flex; justify-content:space-between; gap:8px; margin: 4px 0; }
  .items { border-top:1px dashed #ccc; border-bottom:1px dashed #ccc; padding: 8px 0; margin: 12px 0; }
  .item { display:flex; justify-content:space-between; gap:8px; margin: 4px 0; }
  .item .name { font-weight:600; }
  .total { font-weight:800; font-size:16px; border-top:2px solid #1A181B; padding-top:8px; margin-top:8px; }
  .footer { text-align:center; margin-top:16px; font-size: 11px; color:#8D848F; }
</style></head><body>
<h1>Receipt</h1>
<div class="muted">Order ID: ${orderIdSafe || '—'}</div>
<div class="muted">${tableLabel}${order.user ? ' · ' + order.user : ''}</div>
<div class="muted">${new Date(order.createdAt || Date.now()).toLocaleString()}</div>
<div class="items">
${items.map(it => `<div class="item"><span class="name">${(it.name || 'Item').replace(/</g,'&lt;')}</span><span>x${it.quantity} · ${fmt(it.price)}</span></div>`).join('')}
${items.length === 0 ? '<div class="muted">No items recorded for this order.</div>' : ''}
</div>
<div class="row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
${Number(order.tipAmount) > 0 ? `<div class="row"><span>Tip</span><span>${fmt(order.tipAmount)}</span></div>` : ''}
<div class="row total"><span>Total</span><span>${fmt(order.total != null ? order.total : subtotal)}</span></div>
<div class="footer">Thank you for dining with us.</div>
<script>window.onload = () => { setTimeout(() => window.print(), 200); };</script>
</body></html>`;
            const w = window.open('', '_blank', 'noopener,width=420,height=640');
            if (!w) {
                toast.error('Allow pop-ups to download the receipt.');
                return;
            }
            w.document.open();
            w.document.write(html);
            w.document.close();
        } catch (err) {
            console.error('Receipt download failed', err);
            toast.error('Could not generate receipt');
        }
    };

    const getStatusBadge = (status) => {
        if (status === 'served') {
            return (
                <span className="text-[10px] font-bold px-[6px] py-[4px] rounded-[8px] flex items-center gap-1 bg-[#E8F5E9] text-[#22C55E]">
                    <Check size={12} /> Served
                </span>
            );
        }
        if (status === 'cancelled') {
            return (
                <span className="text-[10px] font-bold px-[6px] py-[4px] rounded-[8px] flex items-center gap-1 bg-[#FFEBEE] text-[#FF3B30]">
                    <XCircle size={12} /> Cancelled
                </span>
            );
        }
        return (
            <span className="text-[10px] font-bold px-[6px] py-[4px] rounded-[8px] flex items-center gap-1 bg-[#FFF3E0] text-[#FE8301]">
                <Clock3 size={12} /> {status}
            </span>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FBFBFF] pb-10">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="px-4 sm:px-6 pt-6 pb-4 flex items-center gap-3 bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
                    <button
                        onClick={() => navigate(-1)}
                        aria-label="Back"
                        className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <h1 className="text-xl sm:text-2xl font-bold text-[#1A181B] tracking-tight">Order History</h1>
                </header>

                <main className="px-4 sm:px-6 py-4">
                    {/* WAI-015 — Date range filter. Dropdown sits above the
                        status tabs because the date scope feeds the tab
                        counts. */}
                    <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-sm font-bold text-[#1A181B]">
                            Showing <span className="text-[#8B26A5]">{filteredOrders.length}</span> order{filteredOrders.length === 1 ? '' : 's'}
                        </p>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setDateMenuOpen(v => !v)}
                                aria-haspopup="listbox"
                                aria-expanded={dateMenuOpen}
                                aria-label={`Date range: ${activeRangeLabel}`}
                                className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 min-h-11 text-sm font-semibold text-[#1A181B] hover:border-[#8B26A5] active:scale-95 transition shadow-sm"
                            >
                                <Calendar size={16} className="text-[#8B26A5]" />
                                <span>{activeRangeLabel}</span>
                            </button>
                            {dateMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setDateMenuOpen(false)} aria-hidden="true" />
                                    <ul
                                        role="listbox"
                                        aria-label="Date range options"
                                        className="absolute right-0 top-full mt-2 z-40 bg-white rounded-2xl shadow-lg border border-gray-100 py-2 min-w-[180px]"
                                    >
                                        {DATE_RANGES.map(r => (
                                            <li key={r.id}>
                                                <button
                                                    type="button"
                                                    role="option"
                                                    aria-selected={dateRangeId === r.id}
                                                    onClick={() => { setDateRangeId(r.id); setDateMenuOpen(false); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm font-semibold transition ${
                                                        dateRangeId === r.id
                                                            ? 'bg-[#F9F1FB] text-[#8B26A5]'
                                                            : 'text-[#1A181B] hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {r.label}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Tab Switcher */}
                    <div className="bg-[#ECECF0] mb-5 p-1 rounded-full flex gap-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 min-h-11 px-3 sm:px-4 rounded-full text-sm font-semibold transition-all ${activeTab === tab.id
                                    ? 'bg-[#8B26A5] text-white shadow-sm'
                                    : 'text-gray-700 hover:text-gray-900'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Orders List */}
                    {filteredOrders.length === 0 ? (
                        <WaiterEmptyState
                            icon={Clock3}
                            title="No orders found"
                            hint="Past orders for the selected status will show here."
                        />
                    ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        {filteredOrders.map((order, idx) => {
                            // Backend returns `table` (the table's display name)
                            // or the literal string 'Takeaway'. The old code
                                // read `order.tableId` which doesn't exist on
                            // this response — so every avatar fell back to
                            // the same "TA" placeholder. Detect takeaway via
                            // either the type field or the sentinel name.
                            const tableRaw = String(order.table || order.tableId || '').trim();
                            const isTakeaway = order.type === 'takeaway'
                                || tableRaw === 'Takeaway'
                                || tableRaw === 'TA'
                                || tableRaw === '';
                            const tableLabel = isTakeaway ? 'Takeaway' : `Table ${tableRaw}`;
                            // Strip leading "T" so a table named "T05" doesn't
                            // produce "TT05" in the avatar; cap to 4 chars.
                            const avatarRaw = !isTakeaway
                                ? tableRaw.replace(/^T(?=\d|-|$)/i, '')
                                : '';
                            const avatarText = isTakeaway
                                ? 'TA'
                                : (avatarRaw.length <= 4 ? avatarRaw : avatarRaw.slice(0, 4));
                            // Format on the client (viewer's timezone). The
                            // backend `orderTime`/`time` strings are formatted
                            // in the SERVER's timezone (UTC on the hosted
                            // deployment) so they render an 11:00 IST order as
                            // ~05:30. Fall back to the backend string only when
                            // createdAt is absent (legacy rows).
                            const timeLabel = order.createdAt
                                ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
                                : (order.orderTime || order.time);
                            return (
                                <div key={order._id || order.id || idx} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                    {/* Order Header */}
                                    <div className="flex items-center justify-between mb-2 gap-2">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                                                isTakeaway
                                                    ? 'bg-[#FFF1E3] text-[#FE8301] ring-1 ring-[#FE8301]/20'
                                                    : 'bg-[#702083] text-white'
                                            }`}>
                                                {avatarText}
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-bold text-[#1A181B] truncate">{tableLabel}</h3>
                                                <p className="text-xs text-gray-500 truncate">
                                                    {order.id || order.orderId || '—'}
                                                    {timeLabel && (
                                                        <span> · {timeLabel}</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="shrink-0">
                                            {getStatusBadge(order.status)}
                                        </div>
                                    </div>

                                    {/* Items Summary */}
                                    <div className="border-t border-gray-100 pt-2 mt-1">
                                        {(order.items || []).slice(0, 3).map((item, i) => (
                                            <div key={i} className="flex justify-between items-center py-1 gap-2">
                                                <span className="text-sm text-[#1A181B] font-medium truncate">{item.name}</span>
                                                <span className="text-sm text-gray-500 font-medium tabular-nums shrink-0">x{item.quantity} · ₹{Number(item.price || 0).toFixed(2)}</span>
                                            </div>
                                        ))}
                                        {(order.items || []).length > 3 && (
                                            <p className="text-xs text-gray-500 mt-1">+{order.items.length - 3} more items</p>
                                        )}
                                    </div>

                                    {/* Total + WAI-016 Download */}
                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 gap-3">
                                        <div className="flex items-baseline gap-2 min-w-0">
                                            <span className="text-sm font-semibold text-[#1A181B]">Total</span>
                                            <span className="text-base font-extrabold text-[#702083] tabular-nums">₹{Number(order.total || 0).toFixed(2)}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleDownloadReceipt(order); }}
                                            aria-label={`Download receipt for order ${order.id || order.orderId || ''}`}
                                            className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-[#8B26A5] border border-[#E9D5EF] hover:border-[#8B26A5] hover:bg-[#F9F1FB] rounded-full px-3 py-1.5 active:scale-95 transition"
                                        >
                                            <Download size={14} strokeWidth={2.4} />
                                            Download
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default OrderHistory;
