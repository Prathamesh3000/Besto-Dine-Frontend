import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    Boxes,
    Search,
    ArrowLeft,
    LogOut,
    Lock,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    XCircle,
    PackageCheck,
} from 'lucide-react';

import { useAuth } from '../../Context/AuthContext';
import { inventoryAPI } from '../../utils/api';

/**
 * ChefStock — READ-ONLY inventory stock view for chefs.
 *
 * A chef needs to see what's running low while cooking, so this shows live
 * stock levels + low-stock / out-of-stock alerts. It is intentionally
 * read-only: changing quantities (stock adjustments) is reserved for
 * admins / managers (PATCH /:id/adjust is adminOnly). A chef monitors;
 * an admin mutates.
 *
 * Gated by the granular `manageStock` permission (backend enforces it on
 * GET /, /summary and /alerts).
 */

const PER_PAGE = 12;

const FILTERS = [
    { key: 'all',           label: 'All' },
    { key: 'low-stock',     label: 'Low stock' },
    { key: 'out-of-stock',  label: 'Out of stock' },
];

const ChefStock = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const canManage = user?.permissions?.manageStock === true;

    const [items, setItems] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    // Debounce the search box so we don't fire a request per keystroke.
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => { setPage(1); }, [search, status]);

    const fetchStock = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, limit: PER_PAGE };
            if (search.trim()) params.search = search.trim();
            if (status !== 'all') params.status = status;
            const [itemsRes, summaryRes] = await Promise.all([
                inventoryAPI.getAll(params),
                inventoryAPI.getSummary(),
            ]);
            if (itemsRes.data.success) {
                setItems(itemsRes.data.items || []);
                setTotalPages(itemsRes.data.pagination?.pages || 1);
                setTotalItems(itemsRes.data.pagination?.total || 0);
            }
            if (summaryRes.data.success) setSummary(summaryRes.data.summary);
        } catch {
            toast.error('Failed to load stock');
        } finally {
            setLoading(false);
        }
    }, [page, search, status]);

    useEffect(() => {
        if (canManage) fetchStock();
        else setLoading(false);
    }, [canManage, fetchStock]);

    const handleLogout = () => {
        logout();
        navigate('/staff-login');
    };

    // ── Permission-blocked fallback ────────────────────────────────────
    if (!canManage) {
        return (
            <div className="min-h-screen bg-[#FAF5F0] font-manrope flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-4 text-gray-400">
                    <Lock size={28} />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Stock not enabled</h2>
                <p className="text-sm text-[#7D7380] mt-1.5 max-w-sm">
                    Your account doesn&apos;t have stock viewing turned on. Ask your manager to
                    enable the &quot;View Stock&quot; permission.
                </p>
                <button
                    onClick={() => navigate('/chef/dashboard')}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
                >
                    <ArrowLeft size={16} />
                    Back to Kitchen
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FAF5F0] text-gray-800 font-manrope">
            {/* ── Header ─────────────────────────────────────────── */}
            <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-[0px_2px_8px_0px_#00000014]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center gap-4">
                    <button
                        onClick={() => navigate('/chef/dashboard')}
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50 transition shrink-0"
                        title="Back to Kitchen Display"
                        aria-label="Back to Kitchen Display"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-linear-to-br from-[#FE8301] to-orange-600 text-white flex items-center justify-center shadow-[0_4px_16px_rgba(254,131,1,0.25)] shrink-0">
                        <Boxes size={20} strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-gray-900 tracking-tight leading-none">
                            Stock
                        </h1>
                        <p className="text-[11px] text-[#7D7380] font-medium mt-1 truncate">
                            {user?.name || 'Chef'} · Live stock levels &amp; alerts
                        </p>
                    </div>

                    <div className="flex-1" />

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="h-11 px-3 sm:px-4 bg-white hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-xl font-semibold text-sm flex items-center gap-2 border border-gray-200 hover:border-red-200 transition"
                        title="Sign out"
                    >
                        <LogOut size={15} />
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* ── Alert / summary cards ───────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                    <SummaryCard
                        icon={<PackageCheck size={18} />}
                        value={summary?.inStock ?? '—'}
                        label="In stock"
                        tone="emerald"
                        onClick={() => setStatus('all')}
                    />
                    <SummaryCard
                        icon={<AlertTriangle size={18} />}
                        value={summary?.lowStock ?? '—'}
                        label="Low stock"
                        tone="amber"
                        onClick={() => setStatus('low-stock')}
                        active={status === 'low-stock'}
                    />
                    <SummaryCard
                        icon={<XCircle size={18} />}
                        value={summary?.outOfStock ?? '—'}
                        label="Out of stock"
                        tone="rose"
                        onClick={() => setStatus('out-of-stock')}
                        active={status === 'out-of-stock'}
                    />
                </div>

                {/* ── Search + filter toolbar ─────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7D7380]" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search items by name or code…"
                            className="w-full h-12 bg-white border border-gray-200 hover:border-gray-300 focus:border-[#FE8301] rounded-xl pl-10 pr-3 text-sm font-medium text-gray-800 placeholder:text-[#7D7380] focus:outline-none focus:ring-2 focus:ring-[#FE8301]/20 transition shadow-[0px_1px_3px_0px_#0000000F]"
                        />
                    </div>
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-[0px_1px_3px_0px_#0000000F]">
                        {FILTERS.map((f) => {
                            const active = status === f.key;
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setStatus(f.key)}
                                    aria-pressed={active}
                                    className={`h-10 px-3 sm:px-4 rounded-lg text-xs font-bold tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] ${
                                        active
                                            ? 'bg-[#FE8301] text-white shadow-sm'
                                            : 'text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Table ───────────────────────────────────────── */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 py-20 text-center">
                        <Boxes size={40} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-[15px] font-semibold text-gray-500">
                            {search.trim() || status !== 'all' ? 'No items match your filters' : 'No stock items found'}
                        </p>
                        <p className="text-[13px] text-gray-400 mt-1">
                            {search.trim() || status !== 'all' ? 'Try a different search or filter.' : 'Inventory items will appear here once added.'}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Monitoring grid — each item is a level gauge, not a
                            table row, so this reads as a glanceable stock board
                            distinct from the Recipes data table. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {items.map((it) => (
                                <StockCard key={it._id} item={it} />
                            ))}
                        </div>

                        <div className="mt-2">
                            <TablePager
                                page={page}
                                totalPages={totalPages}
                                totalItems={totalItems}
                                perPage={PER_PAGE}
                                onChange={setPage}
                            />
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

// ─── Stock card — item with a level gauge ────────────────────────────
const StockCard = ({ item: it }) => {
    const st = stockStatus(it);
    // Gauge scale: prefer the configured max; otherwise reference 2× the
    // min level so the min marker sits mid-bar and "healthy" stock reads
    // comfortably full. Always at least the current value so a big stock
    // never overflows the track.
    const denom = Math.max(it.maxStock > 0 ? it.maxStock : it.minStock * 2, it.currentStock, 1);
    const pct = Math.max(it.currentStock <= 0 ? 0 : 4, Math.min(100, (it.currentStock / denom) * 100));
    const minPct = Math.min(100, (it.minStock / denom) * 100);

    return (
        <div className={`rounded-2xl bg-white border p-4 sm:p-5 shadow-[0px_2px_8px_0px_#00000010] transition hover:shadow-[0px_6px_18px_0px_#00000014] ${st.cardBorder}`}>
            {/* Top row — name + status */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-bold text-gray-900 leading-snug truncate">{it.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{it.itemId} · {it.category}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${st.cls}`}>
                    {st.dot}
                    {st.label}
                </span>
            </div>

            {/* Current level */}
            <div className="flex items-end justify-between mt-4 mb-1.5">
                <div className="leading-none">
                    <span className="text-2xl font-black text-gray-900 tabular-nums">{it.currentStock}</span>
                    <span className="text-sm font-semibold text-gray-400 ml-1">{it.unit}</span>
                </div>
                <span className="text-[11px] font-medium text-gray-400">min {it.minStock} {it.unit}</span>
            </div>

            {/* Gauge track with min marker */}
            <div className="relative h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${st.bar}`} style={{ width: `${pct}%` }} />
                {minPct > 0 && minPct < 100 && (
                    <span
                        className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-gray-400/70 rounded"
                        style={{ left: `${minPct}%` }}
                        title={`Min ${it.minStock} ${it.unit}`}
                    />
                )}
            </div>
        </div>
    );
};

// ─── Helpers ─────────────────────────────────────────────────────────
const dotEl = (color) => <span className={`w-1.5 h-1.5 rounded-full ${color}`} />;
const stockStatus = (it) => {
    if (it.currentStock <= 0) return {
        label: 'Out', cls: 'bg-rose-50 text-rose-700',
        bar: 'bg-rose-500', cardBorder: 'border-rose-200', dot: dotEl('bg-rose-500'),
    };
    if (it.currentStock <= it.minStock) return {
        label: 'Low', cls: 'bg-amber-50 text-amber-700',
        bar: 'bg-amber-500', cardBorder: 'border-amber-200', dot: dotEl('bg-amber-500'),
    };
    return {
        label: 'OK', cls: 'bg-emerald-50 text-emerald-700',
        bar: 'bg-emerald-500', cardBorder: 'border-gray-200', dot: dotEl('bg-emerald-500'),
    };
};

// ─── Summary / alert card ────────────────────────────────────────────
const SummaryCard = ({ icon, value, label, tone, onClick, active }) => {
    const tones = {
        emerald: 'text-emerald-700 bg-emerald-50 ring-emerald-100',
        amber: 'text-amber-700 bg-amber-50 ring-amber-100',
        rose: 'text-rose-700 bg-rose-50 ring-rose-100',
    };
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-3 p-4 rounded-2xl bg-white border text-left transition shadow-[0px_2px_8px_0px_#00000010] hover:shadow-[0px_6px_18px_0px_#00000014] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] ${
                active ? 'border-[#FE8301]' : 'border-gray-200'
            }`}
        >
            <span className={`w-11 h-11 rounded-xl ring-1 flex items-center justify-center shrink-0 ${tones[tone]}`}>
                {icon}
            </span>
            <div className="leading-none">
                <div className="text-2xl font-black text-gray-900 tabular-nums">{value}</div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#7D7380] mt-1">{label}</div>
            </div>
        </button>
    );
};

// ─── Numbered pager (mirrors Admin > Inventory) ──────────────────────
const buildPageList = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', current - 1, current, current + 1, '…', total];
};

const TablePager = ({ page, totalPages, totalItems, perPage, onChange }) => {
    if (totalItems === 0) return null;
    const from = (page - 1) * perPage + 1;
    const to = Math.min(totalItems, page * perPage);
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Showing {from}–{to} of {totalItems}</span>
            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onChange(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    {buildPageList(page, totalPages).map((p, i) => (
                        p === '…' ? (
                            <span key={`e${i}`} className="px-2 text-xs text-gray-400 select-none">…</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => onChange(p)}
                                aria-current={p === page ? 'page' : undefined}
                                className={`min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition ${
                                    p === page ? 'bg-[#FE8301] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {p}
                            </button>
                        )
                    ))}
                    <button
                        onClick={() => onChange(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        aria-label="Next page"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ChefStock;
