import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Menu, Loader2, AlertTriangle, Clock, Users, LayoutGrid, UserPlus, ArrowUpRight, X, Check } from 'lucide-react';
import SeatedCount from '../../Components/Common/SeatedCount';
import Sidebar from '../../Components/Waiter/Sidebar';
import BottomNav from '../../Components/Waiter/BottomNav';
import WaiterEmptyState from '../../Components/Waiter/WaiterEmptyState';
import StaffProfileMenu from '../../Components/Waiter/StaffProfileMenu';
import NotificationBell from '../../Components/Waiter/NotificationBell';
import { captainAPI } from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import useSocketEvent, { useSocketConnected, useSocketReconnect } from '../../hooks/useSocketEvent';
import toast from 'react-hot-toast';

// Captain Floor Overview — the "head of waiters" command screen.
//   • View all tables & sessions (grouped by area)
//   • Monitor waiter workload
//   • Catch delayed orders
//   • Assign / reassign tables to waiters
//   • Escalate billing / service issues to admin
//
// Captain shares the waiter chrome (Sidebar + BottomNav) on purpose — there's
// no separate captain shell. This is a captain-only ROUTE (CAPTAIN_ROLES),
// linked from the waiter sidebar for captains/admins.
const CaptainFloor = () => {
    const { user } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    // Assign-waiter modal state
    const [assignTable, setAssignTable] = useState(null);
    const [waiters, setWaiters] = useState([]);
    const [assignBusy, setAssignBusy] = useState(false);

    // Escalation modal state
    const [escalateFor, setEscalateFor] = useState(null); // { tableName, orderId } | true
    const [escalateReason, setEscalateReason] = useState('');
    const [escalateSeverity, setEscalateSeverity] = useState('high');
    const [escalateBusy, setEscalateBusy] = useState(false);

    const load = useCallback(async (showSpinner = false) => {
        if (showSpinner) setLoading(true);
        try {
            const res = await captainAPI.getFloorOverview();
            if (res.data?.success) setData(res.data);
        } catch (err) {
            if (showSpinner) toast.error(err?.response?.data?.message || 'Failed to load floor');
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, []);

    useEffect(() => { load(true); }, [load]);

    // Live refresh — any floor/kitchen event shifts the numbers. Cheap full
    // re-pull (single aggregated endpoint), debounced by the natural event
    // cadence. Also poll every 30s so a dropped socket doesn't stale the view.
    // BUG #23 — coalesce event bursts into one re-pull 300 ms later, and
    // keep only a slow safety poll while the socket is live.
    const reloadTimerRef = useRef(null);
    const scheduleLoad = useCallback(() => {
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => {
            reloadTimerRef.current = null;
            load();
        }, 300);
    }, [load]);
    useEffect(() => () => { if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current); }, []);
    useSocketEvent('order:new', scheduleLoad);
    useSocketEvent('order:updated', scheduleLoad);
    useSocketEvent('order:ready', scheduleLoad);
    useSocketEvent('order:cancelled', scheduleLoad);
    useSocketEvent('order:appended', scheduleLoad);
    useSocketEvent('table:updated', scheduleLoad);
    // BUG #12 — resync after a reconnect.
    useSocketReconnect(scheduleLoad);
    const socketLive = useSocketConnected();
    useEffect(() => {
        const id = setInterval(() => load(), socketLive ? 120_000 : 30_000);
        return () => clearInterval(id);
    }, [load, socketLive]);

    const areasById = useMemo(() => {
        const m = new Map();
        (data?.areas || []).forEach(a => m.set(String(a._id), a.name));
        return m;
    }, [data?.areas]);

    // Areas in their configured order (data.areas is name-sorted by the
    // API), tables naturally sorted inside each ("T2" before "T10").
    const areaGroups = useMemo(() => {
        const byArea = new Map();
        (data?.tables || []).forEach(t => {
            const key = t.area || 'none';
            if (!byArea.has(key)) byArea.set(key, []);
            byArea.get(key).push(t);
        });
        const natural = (x, y) => String(x.name).localeCompare(String(y.name), undefined, { numeric: true, sensitivity: 'base' });
        const ordered = [];
        (data?.areas || []).forEach(a => {
            const id = String(a._id);
            if (byArea.has(id)) ordered.push({ id, name: a.name, tables: byArea.get(id).sort(natural) });
        });
        for (const [id, tables] of byArea) {
            if (!ordered.some(g => g.id === id)) {
                ordered.push({ id, name: areasById.get(id) || 'Unassigned area', tables: tables.sort(natural) });
            }
        }
        return ordered;
    }, [data?.tables, data?.areas, areasById]);
    const [areaFilter, setAreaFilter] = useState('all');

    // Workload by waiter id — shown in the assign picker so the captain
    // can balance tables instead of picking a name blind.
    const workloadById = useMemo(() => {
        const m = new Map();
        (data?.workload || []).forEach(w => m.set(String(w._id), w));
        return m;
    }, [data?.workload]);
    const tablesPerWaiter = useMemo(() => {
        const m = new Map();
        (data?.tables || []).forEach(t => {
            if (!t.assignedWaiter) return;
            const k = String(t.assignedWaiter._id);
            m.set(k, (m.get(k) || 0) + 1);
        });
        return m;
    }, [data?.tables]);

    // ── Assign / reassign waiter ────────────────────────────────────────
    const openAssign = async (table) => {
        setAssignTable(table);
        if (!waiters.length) {
            try {
                const res = await captainAPI.getWaiters();
                if (res.data?.success) setWaiters(res.data.waiters || []);
            } catch { /* dropdown just stays empty; toast not worth it */ }
        }
    };

    const doAssign = async (waiterId) => {
        if (!assignTable || assignBusy) return;
        setAssignBusy(true);
        try {
            await captainAPI.assignWaiter(assignTable._id, waiterId);
            toast.success(waiterId ? 'Waiter assigned' : 'Waiter cleared');
            setAssignTable(null);
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to assign waiter');
        } finally {
            setAssignBusy(false);
        }
    };

    // ── Escalate to admin ───────────────────────────────────────────────
    const submitEscalation = async () => {
        if (!escalateReason.trim() || escalateBusy) return;
        setEscalateBusy(true);
        try {
            const ctx = typeof escalateFor === 'object' ? escalateFor : {};
            await captainAPI.escalate({
                reason: escalateReason.trim(),
                severity: escalateSeverity,
                tableName: ctx.tableName || undefined,
                orderId: ctx.orderId || undefined,
            });
            toast.success('Escalated to admin');
            setEscalateFor(null);
            setEscalateReason('');
            setEscalateSeverity('high');
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to escalate');
        } finally {
            setEscalateBusy(false);
        }
    };

    const summary = data?.summary || {};
    const delayed = data?.delayedOrders || [];
    const workload = data?.workload || [];

    if (loading && !data) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] pb-32 font-sans overflow-x-hidden">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-4 sm:px-6 pt-6 pb-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Open menu"
                            className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <Menu size={26} strokeWidth={1.75} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">Floor Overview</h1>
                            <p className="text-xs font-semibold text-gray-500 truncate">
                                Captain · {user?.name || 'Floor'}{user?.branch?.name ? ` · ${user.branch.name}` : ''}
                            </p>
                        </div>
                        <button
                            onClick={() => { setEscalateFor(true); }}
                            className="ml-auto shrink-0 inline-flex items-center gap-1.5 min-h-10 px-3.5 rounded-full bg-[#FF3B30] text-white text-sm font-bold shadow-sm active:scale-95 transition"
                        >
                            <ArrowUpRight size={16} strokeWidth={2.5} /> Escalate
                        </button>
                        {/* Notifications + profile — same admin-style cluster. */}
                        <NotificationBell />
                        <StaffProfileMenu />
                    </div>
                </header>

                {/* Summary stat cards */}
                <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 my-5 px-4 sm:px-6">
                    <StatCard label="Tables" value={`${summary.occupied || 0}/${summary.totalTables || 0}`} sub="occupied" color="#702083" />
                    <StatCard label="Active" value={summary.activeOrders || 0} sub="in kitchen" color="#FF7A00" />
                    <StatCard label="Ready" value={summary.readyOrders || 0} sub="to serve" color="#10B981" />
                    <StatCard label="Delayed" value={summary.delayedOrders || 0} sub="need attention" color="#FF3B30" />
                </section>

                {/* Delayed orders rail */}
                <section className="px-4 sm:px-6 mb-6">
                    <SectionTitle icon={<Clock size={16} strokeWidth={2.4} />} title="Delayed Orders" count={delayed.length} accent="#FF3B30" />
                    {delayed.length === 0 ? (
                        <p className="text-sm text-gray-400 font-medium py-3">No delayed orders. Floor is on time. 🎉</p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {delayed.map(o => (
                                <div key={o._id} className="rounded-2xl border border-[#FFD2CF] bg-[#FFF5F4] p-4 flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-[#FFE3E0] text-[#FF3B30] flex items-center justify-center shrink-0">
                                        <AlertTriangle size={20} strokeWidth={2.2} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-[#1A181B] truncate">
                                            {o.table} · #{o.orderId}
                                        </p>
                                        <p className="text-xs font-semibold text-[#FF3B30] mt-0.5">
                                            {o.minutesLate} min late · {o.status === 'ready' ? 'waiting pickup' : 'in kitchen'}
                                            {o.waiter ? ` · ${o.waiter}` : ' · unassigned'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setEscalateFor({ tableName: o.table, orderId: o._id })}
                                        className="shrink-0 inline-flex items-center gap-1 min-h-9 px-3 rounded-full border border-[#FF3B30] text-[#FF3B30] text-xs font-bold active:scale-95 transition"
                                    >
                                        <ArrowUpRight size={14} strokeWidth={2.5} /> Escalate
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Waiter workload */}
                <section className="px-4 sm:px-6 mb-6">
                    <SectionTitle icon={<Users size={16} strokeWidth={2.4} />} title="Waiter Workload" count={workload.length} accent="#7C3AED" />
                    {workload.length === 0 ? (
                        <p className="text-sm text-gray-400 font-medium py-3">No active waiters on the floor.</p>
                    ) : (
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {workload.map(w => (
                                <div key={w._id} className="rounded-2xl border border-gray-200 bg-white p-3.5 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[#F3E8FF] text-[#7C3AED] flex items-center justify-center font-extrabold shrink-0">
                                        {(w.name || 'W').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-[#1A181B] truncate capitalize">{w.name}</p>
                                        <p className="text-[11px] font-semibold text-gray-400 truncate">{w.staffId || '—'}</p>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        <Pill value={w.activeOrders} label="active" color="#FF7A00" />
                                        <Pill value={w.readyOrders} label="ready" color="#10B981" />
                                        {w.delayedOrders > 0 && <Pill value={w.delayedOrders} label="late" color="#FF3B30" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Tables by area.
                    UI pass: area filter chips, areas in their configured
                    order (was table-insertion order), natural table sort
                    (T2 before T10), a colour-coded status chip instead of
                    a grey "free · cap 4" caption, and the assigned waiter
                    shown as its own row with a clear Assign / Change
                    action — previously the assign button doubled as the
                    waiter label, so it wasn't obvious it was tappable. */}
                <section className="px-4 sm:px-6">
                    <SectionTitle icon={<LayoutGrid size={16} strokeWidth={2.4} />} title="Tables & Sessions" count={summary.totalTables || 0} accent="#FE8301" />
                    {(data?.tables || []).length === 0 ? (
                        <WaiterEmptyState
                            icon={LayoutGrid}
                            title="No tables in your areas yet"
                            hint="An admin can add tables and assign you to areas under the admin dashboard."
                        />
                    ) : (
                        <>
                            {areaGroups.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 -mx-1 px-1">
                                    {[{ id: 'all', name: 'All', count: (data?.tables || []).length }, ...areaGroups.map(g => ({ id: g.id, name: g.name, count: g.tables.length }))].map(chip => (
                                        <button
                                            key={chip.id}
                                            onClick={() => setAreaFilter(chip.id)}
                                            aria-pressed={areaFilter === chip.id}
                                            className={`shrink-0 min-h-9 px-3.5 rounded-xl border text-[13px] font-bold transition flex items-center gap-1.5 ${areaFilter === chip.id
                                                ? 'border-[#7C3AED] text-[#7C3AED] bg-[#F9F1FB]'
                                                : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'}`}
                                        >
                                            {chip.name}
                                            <span className="text-[11px] tabular-nums opacity-70">{chip.count}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {areaGroups
                                .filter(g => areaFilter === 'all' || g.id === areaFilter)
                                .map(group => {
                                    const unassigned = group.tables.filter(t => !t.assignedWaiter).length;
                                    return (
                                        <div key={group.id} className="mb-6">
                                            <div className="flex items-center justify-between gap-2 mb-2.5">
                                                <h3 className="text-sm font-bold text-[#1A181B]">
                                                    {group.name}
                                                    <span className="ml-1.5 text-xs font-semibold text-gray-400 tabular-nums">
                                                        {group.tables.length} table{group.tables.length === 1 ? '' : 's'}
                                                    </span>
                                                </h3>
                                                {unassigned > 0 && (
                                                    <span className="text-[11px] font-bold text-[#B45309] bg-[#FFF7ED] px-2 py-0.5 rounded-full">
                                                        {unassigned} unassigned
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                                                {group.tables.map(t => {
                                                    const st = tableStatusMeta(t);
                                                    return (
                                                        <div
                                                            key={t._id}
                                                            className={`rounded-2xl border p-3 flex flex-col gap-2 ${t.delayed ? 'border-[#FFD2CF] bg-[#FFF5F4]' : `${st.card}`}`}
                                                        >
                                                            <div className="flex items-start justify-between gap-2">
                                                                <p className="text-lg font-extrabold text-[#1A181B] leading-tight truncate" title={t.name}>{t.name}</p>
                                                                {t.delayed
                                                                    ? <AlertTriangle size={16} className="text-[#FF3B30] shrink-0 mt-0.5" strokeWidth={2.5} />
                                                                    : <SeatedCount taken={t.seatsTaken || 0} capacity={t.seatCapacity || t.capacity} size={11} className="text-[10px] font-bold text-gray-400 shrink-0 mt-1" />}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${st.chip}`}>
                                                                    {st.label}
                                                                </span>
                                                                {t.activeOrders > 0 && (
                                                                    <span className="text-[10px] font-bold text-[#FF7A00] bg-[#FFF4E8] px-1.5 py-0.5 rounded-md">
                                                                        {t.activeOrders} order{t.activeOrders > 1 ? 's' : ''}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => openAssign(t)}
                                                                className={`mt-auto w-full flex items-center gap-2 min-h-10 px-2.5 rounded-xl text-left transition active:scale-[0.98] ${t.assignedWaiter
                                                                    ? 'bg-white border border-[#E9D5FF] hover:bg-[#FAF5FF]'
                                                                    : 'bg-[#F5F3FF] border border-dashed border-[#C4B5FD] hover:bg-[#EDE9FE]'}`}
                                                                aria-label={t.assignedWaiter ? `Change waiter for ${t.name}` : `Assign waiter to ${t.name}`}
                                                            >
                                                                {t.assignedWaiter ? (
                                                                    <>
                                                                        <span className="w-6 h-6 rounded-lg bg-[#F3E8FF] text-[#7C3AED] text-[11px] font-extrabold flex items-center justify-center shrink-0">
                                                                            {(t.assignedWaiter.name || 'W').charAt(0).toUpperCase()}
                                                                        </span>
                                                                        <span className="flex-1 min-w-0 text-xs font-bold text-[#1A181B] truncate capitalize">{t.assignedWaiter.name}</span>
                                                                        <span className="text-[10px] font-bold text-[#7C3AED] shrink-0">Change</span>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <UserPlus size={14} strokeWidth={2.4} className="text-[#7C3AED] shrink-0" />
                                                                        <span className="flex-1 min-w-0 text-xs font-bold text-[#7C3AED] truncate">Assign waiter</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                        </>
                    )}
                </section>
            </div>

            {/* ── Assign waiter sheet ─────────────────────────────────────── */}
            {assignTable && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
                    onClick={() => !assignBusy && setAssignTable(null)}
                >
                    <div
                        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="min-w-0">
                                <h3 className="text-lg font-bold text-[#1A181B] truncate">Assign · {assignTable.name}</h3>
                                <p className="text-xs font-semibold text-gray-500 mt-0.5">
                                    {assignTable.assignedWaiter ? `Current: ${assignTable.assignedWaiter.name}` : 'No waiter assigned'}
                                </p>
                            </div>
                            <button onClick={() => !assignBusy && setAssignTable(null)} aria-label="Close"
                                className="w-10 h-10 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto -mx-1 px-1 flex flex-col gap-2">
                            {waiters.length === 0 ? (
                                <p className="text-sm text-gray-400 py-6 text-center">No active waiters found.</p>
                            ) : waiters.map(w => {
                                const isCurrent = assignTable.assignedWaiter && String(assignTable.assignedWaiter._id) === String(w._id);
                                return (
                                    <button
                                        key={w._id}
                                        onClick={() => doAssign(w._id)}
                                        disabled={assignBusy}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition active:scale-[0.98] disabled:opacity-60 ${isCurrent ? 'bg-[#F3E8FF] border border-[#D8B4FE]' : 'bg-gray-50 hover:bg-gray-100'}`}
                                    >
                                        <div className="w-9 h-9 rounded-xl bg-white text-[#7C3AED] flex items-center justify-center font-extrabold shrink-0">
                                            {(w.name || 'W').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-[#1A181B] truncate capitalize">{w.name}</p>
                                            <p className="text-[11px] font-semibold text-gray-400 truncate">
                                                {w.staffId || '—'}
                                                {' · '}{tablesPerWaiter.get(String(w._id)) || 0} table{(tablesPerWaiter.get(String(w._id)) || 0) === 1 ? '' : 's'}
                                                {workloadById.get(String(w._id))?.activeOrders ? ` · ${workloadById.get(String(w._id)).activeOrders} active` : ''}
                                            </p>
                                        </div>
                                        {isCurrent && <Check size={18} className="text-[#7C3AED] shrink-0" strokeWidth={2.5} />}
                                    </button>
                                );
                            })}
                        </div>

                        {assignTable.assignedWaiter && (
                            <button
                                onClick={() => doAssign(null)}
                                disabled={assignBusy}
                                className="mt-3 w-full min-h-11 rounded-2xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 active:scale-[0.98] transition disabled:opacity-60"
                            >
                                Clear assignment
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Escalate to admin sheet ─────────────────────────────────── */}
            {escalateFor && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
                    onClick={() => !escalateBusy && setEscalateFor(null)}
                >
                    <div
                        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-[#1A181B]">
                                Escalate to admin
                                {typeof escalateFor === 'object' && escalateFor.tableName ? ` · ${escalateFor.tableName}` : ''}
                            </h3>
                            <button onClick={() => !escalateBusy && setEscalateFor(null)} aria-label="Close"
                                className="w-10 h-10 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                                <X size={20} />
                            </button>
                        </div>

                        <label className="block text-xs font-bold text-gray-500 mb-1.5">What's the issue?</label>
                        <textarea
                            value={escalateReason}
                            onChange={(e) => setEscalateReason(e.target.value)}
                            rows={3}
                            placeholder="e.g. Billing dispute on this table — customer contests the total."
                            className="w-full rounded-2xl border border-gray-200 p-3 text-sm focus:outline-none focus:border-[#FF7A00] resize-none"
                        />

                        <label className="block text-xs font-bold text-gray-500 mt-4 mb-1.5">Severity</label>
                        <div className="flex gap-2">
                            {['medium', 'high', 'urgent'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setEscalateSeverity(s)}
                                    className={`flex-1 min-h-10 rounded-xl text-sm font-bold capitalize transition active:scale-95 ${escalateSeverity === s
                                        ? 'bg-[#FF3B30] text-white'
                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={submitEscalation}
                            disabled={escalateBusy || !escalateReason.trim()}
                            className="mt-5 w-full min-h-12 rounded-2xl bg-[#FF3B30] text-white font-bold text-base shadow-lg shadow-red-100 active:scale-[0.98] transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
                        >
                            {escalateBusy ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={18} strokeWidth={2.5} />}
                            Send to admin
                        </button>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
};

// Table status → card tint + chip. Merged tables report status 'merged'
// or carry mergedWith; 'alert' = a guest is waiting on something.
const tableStatusMeta = (t) => {
    if (t.merged || t.status === 'merged') return { label: 'Merged', chip: 'bg-[#EDE9FE] text-[#6D28D9]', card: 'border-[#DDD6FE] bg-[#FAF5FF]' };
    switch (t.status) {
        case 'occupied': return { label: 'Occupied', chip: 'bg-[#F3E8FF] text-[#7C3AED]', card: 'border-[#EED3F5] bg-[#FDF5FF]' };
        case 'alert':    return { label: 'Needs attention', chip: 'bg-[#FFE3E0] text-[#FF3B30]', card: 'border-[#FF8E8E] bg-[#FFF3F3]' };
        case 'reserved': return { label: 'Reserved', chip: 'bg-[#E0F2FE] text-[#0369A1]', card: 'border-[#BAE6FD] bg-[#F0F9FF]' };
        case 'disabled': return { label: 'Disabled', chip: 'bg-gray-100 text-gray-500', card: 'border-gray-200 bg-gray-50 opacity-70' };
        default:         return { label: 'Free', chip: 'bg-[#DCFCE7] text-[#15803D]', card: 'border-gray-200 bg-white' };
    }
};

const StatCard = ({ label, value, sub, color }) => (
    <div className="bg-white border border-gray-200 rounded-2xl px-3 py-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <p className="text-2xl sm:text-3xl font-extrabold tabular-nums leading-none" style={{ color }}>{value}</p>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mt-2">{label}</p>
        <p className="text-[10px] font-semibold text-gray-400 mt-0.5">{sub}</p>
    </div>
);

// `icon` is a rendered JSX node (lucide element). It inherits `accent` via
// currentColor from the wrapper — matches the icon-as-node pattern used in
// BottomNav. Passing a node (not a component) sidesteps the lint rule that
// doesn't track capitalized components handed in through props.
const SectionTitle = ({ icon, title, count, accent }) => (
    <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1A`, color: accent }}>
            {icon}
        </div>
        <h2 className="text-base font-bold text-[#1A181B]">{title}</h2>
        <span className="text-xs font-bold text-gray-400 tabular-nums">({count})</span>
    </div>
);

const Pill = ({ value, label, color }) => (
    <div className="px-2 py-1 rounded-lg text-center min-w-[42px]" style={{ backgroundColor: `${color}14` }}>
        <p className="text-sm font-extrabold tabular-nums leading-none" style={{ color }}>{value}</p>
        <p className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color }}>{label}</p>
    </div>
);

export default CaptainFloor;
