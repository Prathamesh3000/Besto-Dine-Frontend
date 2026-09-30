import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Menu, Link, AlertCircle, FileText, Check, X, Loader2, LayoutGrid, MoreVertical, Unlink, BellRing, ShoppingBag } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../../Components/Waiter/Sidebar';
import BottomNav from '../../Components/Waiter/BottomNav';
import WaiterEmptyState from '../../Components/Waiter/WaiterEmptyState';
import StaffProfileMenu from '../../Components/Waiter/StaffProfileMenu';
import NotificationBell from '../../Components/Waiter/NotificationBell';
import { getWaiterScope, inWaiterScope } from '../../utils/waiterScope';
import api, { waiterAPI, settingsAPI } from '../../utils/api';
import { resolveImageUrl } from '../../utils/image';
import { useCart } from '../../Context/CartContext';
import { getSocket, joinStaffRoom } from '../../utils/socket';
import { useAuth } from '../../Context/AuthContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import toast from 'react-hot-toast';

const WaiterHomePage = () => {
    const navigate = useNavigate();
    // Deep-link: `{ area: <name|id> }` in router state (from a
    // notification or the table screen's section chips) opens the grid
    // on that section instead of always the first one.
    const location = useLocation();
    const navArea = location.state?.area || null;
    const { setActiveTable } = useCart();
    const { user, hasPermission } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [activeFloor, setActiveFloor] = useState(null); // Will store area ID
    const [areas, setAreas] = useState([]);
    const [tablesData, setTablesData] = useState([]);
    const [loading, setLoading] = useState(true);

    // Stats
    const [stats, setStats] = useState({ total: 0, occupied: 0, pending: 0, ready: 0, takeaway: 0 });
    const [cafeConfig, setCafeConfig] = useState({ name: 'Cafe Name', logo: '' });

    // Takeaway orders behind the Takeaway stat card. Counter/takeaway
    // orders have no table tile to drill into, so the card opens this
    // list instead — otherwise the waiter sees a count with no way to
    // view the actual orders.
    const [takeawayOrders, setTakeawayOrders] = useState([]);
    const [showTakeaway, setShowTakeaway] = useState(false);
    const [takeawayActionId, setTakeawayActionId] = useState(null);

    // Merging State
    const [isMergingMode, setIsMergingMode] = useState(false);
    const [selectedTables, setSelectedTables] = useState([]);
    const [showMergeConfirm, setShowMergeConfirm] = useState(false);

    // CAP-007/008/009 — Table Actions sheet. Opens when the waiter taps
    // the ⋯ icon on a tile; closes on backdrop click / X / after a
    // successful action.
    const [actionsTable, setActionsTable] = useState(null);
    const [actionInFlight, setActionInFlight] = useState(false);

    // CAP-010 — waiter scope. Empty arrays = no restriction (tenant-wide
    // / branch-wide). Non-empty arrays narrow the visible floor pills
    // and table grid so a waiter only sees what they've been assigned.
    // Captains use `assignedAreas` only; waiters can use either.
    const assignedAreaIds = useMemo(
        () => new Set((user?.assignedAreas || []).map(a => String(a?._id || a))),
        [user?.assignedAreas]
    );
    const assignedTableIds = useMemo(
        () => new Set((user?.assignedTables || []).map(t => String(t?._id || t))),
        [user?.assignedTables]
    );

    // Captain-assigned tables (table.assignedWaiter === me) are always
    // mine, even outside my configured area/table pins. `extraAreaIds`
    // are sections that only show up because of such an assignment —
    // in those, the grid is narrowed to just the assigned tables.
    const myUserId = String(user?._id || user?.id || '');
    const [extraAreaIds, setExtraAreaIds] = useState(() => new Set());
    const scopeTables = useCallback((all) => {
        const mine = (t) => myUserId && String(t.assignedWaiter?._id || t.assignedWaiter || '') === myUserId;
        if (extraAreaIds.has(String(activeFloor))) return all.filter(mine);
        return assignedTableIds.size > 0
            ? all.filter(t => assignedTableIds.has(String(t._id)) || mine(t))
            : all;
    }, [assignedTableIds, extraAreaIds, activeFloor, myUserId]);

    // CAP-010 — the Pending / Ready stat cards must respect the SAME
    // area/table scope as the grid below, the Orders/Requests tabs, and the
    // BottomNav badges. Without this, an area-pinned captain/waiter saw
    // branch-wide pending counts (e.g. "03") while their floor only had the
    // in-scope orders. Takeaway has no table → stays visible to everyone.
    const scope = useMemo(() => getWaiterScope(user), [user]);

    // Refresh just the live-orders driven counters. Split out so socket
    // events can re-pull without spinning the full page loader.
    const refreshOrderStats = useCallback(async () => {
        try {
            const liveOrdersRes = await waiterAPI.getLiveOrders();
            if (liveOrdersRes.data?.success) {
                const orders = (liveOrdersRes.data.orders || []).filter(o => inWaiterScope(scope, o));
                // Takeaway/counter orders have no table → no area. They're
                // shown to all floor staff, but they shouldn't inflate an
                // area-pinned staffer's dine-in Pending/Ready counts. Split
                // them out so the area cards stay "my tables" and takeaway
                // gets its own line below (user pref 2026-06-06).
                const dineIn = orders.filter(o => o.table);
                const takeaway = orders.filter(o => !o.table && ['new', 'preparing', 'ready'].includes(o.status));
                setTakeawayOrders(takeaway);
                setStats(prev => ({
                    ...prev,
                    pending: dineIn.filter(o => o.status === 'new' || o.status === 'preparing').length,
                    ready: dineIn.filter(o => o.status === 'ready').length,
                    takeaway: takeaway.length,
                }));
            }
        } catch { /* keep last counters on transient failure */ }
    }, [scope]);

    // Re-pull just the table grid for the current floor — used by socket
    // events that change a table's status (occupied / free / merged) so
    // the grid colors don't lag behind reality.
    const refreshTables = useCallback(async () => {
        if (!activeFloor) return;
        try {
            const res = await waiterAPI.getTablesByArea(activeFloor);
            if (res.data?.success) {
                // CAP-010 — narrow the grid to the waiter's assigned
                // tables when the assignment is set. If only
                // `assignedAreas` is set, the area-pill filter already
                // does the work — every table in this area is in-scope.
                const all = res.data.tables;
                const scoped = scopeTables(all);
                setTablesData(scoped);
                setStats(prev => ({
                    ...prev,
                    total: scoped.length,
                    occupied: scoped.filter(t => t.status === 'occupied').length
                }));
            }
        } catch { /* ignore */ }
    }, [activeFloor, scopeTables]);

    // Fetch Areas on mount
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setLoading(true);
                // Fetch settings
                const settingsRes = await settingsAPI.getSettings();
                if (settingsRes.data) {
                    setCafeConfig({
                        name: settingsRes.data.general?.cafeName || 'Cafe Name',
                        logo: settingsRes.data.general?.logoUrl || ''
                    });
                }
                const areaRes = await waiterAPI.getAreas();
                if (areaRes.data.success) {
                    // CAP-010 — narrow to assigned areas if the waiter has
                    // any. We do this server-blind because /areas is the
                    // tenant-wide list; backend assignments live on the
                    // user record so the filter has to apply here.
                    const allAreas = areaRes.data.areas;
                    // assignedTables also implies a set of areas (each
                    // table belongs to one). When only `assignedTables`
                    // is set (no `assignedAreas`), we use the tables'
                    // areas to derive the visible-area set in the next
                    // effect; for now show all areas so the table-area
                    // resolution can do its thing.
                    let scoped = assignedAreaIds.size > 0
                        ? allAreas.filter(a => assignedAreaIds.has(String(a._id)))
                        : allAreas;
                    // Add the sections of any table a captain assigned to
                    // me that my area pin would otherwise hide.
                    const extra = new Set();
                    if (assignedAreaIds.size > 0 && myUserId) {
                        try {
                            const tRes = await api.get('/tables', { _silent: true });
                            for (const t of (tRes.data?.tables || [])) {
                                const aw = String(t.assignedWaiter?._id || t.assignedWaiter || '');
                                const aid = String(t.area?._id || t.area || '');
                                if (aw === myUserId && aid && !assignedAreaIds.has(aid)) extra.add(aid);
                            }
                        } catch { /* non-fatal — fall back to configured areas */ }
                        if (extra.size) scoped = [...scoped, ...allAreas.filter(a => extra.has(String(a._id)))];
                    }
                    setExtraAreaIds(extra);
                    setAreas(scoped);
                    if (scoped.length > 0) {
                        const linked = navArea
                            ? scoped.find(a => String(a._id) === String(navArea) || a.name === navArea)
                            : null;
                        setActiveFloor((linked || scoped[0])._id);
                    }
                }

                // Fetch orders for stats
                await refreshOrderStats();
            } catch (err) {
                console.error('Failed to load initial data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();

        // Make sure this waiter is in the right room. NotificationContext
        // already does this on user change, but join is idempotent and
        // guards against the rare case where the socket reconnected
        // between login and reaching this page.
        joinStaffRoom('waiter', user?.branch?._id || null);

        // Live-refresh cafe branding (name + logo) when the admin
        // updates settings — backend emits `settings:updated` on every
        // save. Without this the waiter sees the old logo until they
        // hard-refresh the page.
        const socket = getSocket();
        const onSettingsUpdated = () => {
            settingsAPI.getSettings().then(res => {
                if (!res.data) return;
                setCafeConfig({
                    name: res.data.general?.cafeName || 'Cafe Name',
                    logo: res.data.general?.logoUrl || ''
                });
            }).catch(() => {});
        };
        socket.on('settings:updated', onSettingsUpdated);
        return () => socket.off('settings:updated', onSettingsUpdated);
    }, [refreshOrderStats, user?.branch?._id, assignedAreaIds, navArea, myUserId]);

    // Bump the area that received the latest dine-in order to the first
    // position in the area chips strip so the waiter's eye lands on it
    // first. Backend includes `area` in the order:new payload only for
    // dine-in orders (takeaway has no table → no area).
    const bumpAreaToFront = useCallback((payload) => {
        const areaId = payload?.area;
        if (!areaId) return;
        setAreas(prev => {
            const target = String(areaId);
            const idx = prev.findIndex(a => String(a._id) === target);
            if (idx <= 0) return prev; // already first, or unknown area
            const reordered = [...prev];
            const [moved] = reordered.splice(idx, 1);
            reordered.unshift(moved);
            return reordered;
        });
    }, []);

    // Real-time: keep the Pending / Ready stat cards live without waiting
    // for the next polled refresh. Triggers on every kitchen-state event
    // that can shift those counters: customer places a new order, chef
    // moves it through new → preparing → ready, waiter picks it up,
    // anyone cancels, or a customer adds items mid-meal.
    useSocketEvent('order:new', refreshOrderStats);
    useSocketEvent('order:new', bumpAreaToFront);
    useSocketEvent('order:updated', refreshOrderStats);
    useSocketEvent('order:ready', refreshOrderStats);
    useSocketEvent('order:cancelled', refreshOrderStats);
    useSocketEvent('order:appended', refreshOrderStats);

    // Table grid follow-up — reservations, merges, occupancy flips.
    useSocketEvent('table:updated', refreshTables);

    // Fetch Tables whenever activeFloor changes
    useEffect(() => {
        if (!activeFloor) return;

        const fetchTables = async () => {
            try {
                setLoading(true);
                const res = await waiterAPI.getTablesByArea(activeFloor);
                if (res.data.success) {
                    // Same per-table assignment filter as refreshTables.
                    const all = res.data.tables;
                    const scoped = scopeTables(all);
                    setTablesData(scoped);
                    setStats(prev => ({
                        ...prev,
                        total: scoped.length,
                        occupied: scoped.filter(t => t.status === 'occupied').length
                    }));
                }
            } catch (err) {
                console.error('Failed to fetch tables', err);
            } finally {
                setLoading(false);
            }
        };
        fetchTables();
    }, [activeFloor, scopeTables]);

    const isTableDisabled = (table) => {
        return table.status === 'reserved' || table.status === 'alert' || (table.mergedWith && table.mergedWith.length > 0);
    };

    const getTableStyles = (table, isSelected) => {
        if (isSelected) return 'bg-orange-50 border-[#FF7A00] border-2';

        if (isMergingMode && isTableDisabled(table)) {
            return 'bg-[#F2F2F2] border-transparent opacity-40 grayscale pointer-events-none';
        }

        switch (table.status) {
            case 'occupied':
                return 'bg-[#FDF5FF] border-transparent';
            case 'alert':
                return 'bg-[#FFF3F3] border-[#FF3B30] border';
            case 'reserved':
                return 'bg-[#DFDCE0] border-transparent';
            case 'merged':
                return 'bg-[#F3EBF5] border-[#EED3F5] border';
            default:
                return 'bg-[#F9FAFB] border-transparent';
        }
    };

    const handleMergeToggle = () => {
        // Permission gate — admins can revoke `mergeTables` per staff
        // member from the Add Staff modal. Toast on block so the waiter
        // knows the click registered but they're not allowed.
        if (!isMergingMode && !hasPermission('mergeTables')) {
            toast.error("You don't have permission to merge tables. Please contact your admin.");
            return;
        }
        if (!isMergingMode) {
            setIsMergingMode(true);
        } else if (selectedTables.length >= 2) {
            setShowMergeConfirm(true);
        } else {
            setIsMergingMode(false);
            setSelectedTables([]);
        }
    };

    const confirmMerge = async () => {
        try {
            const tableIds = selectedTables.map(tId => {
                const table = tablesData.find(t => t.name === tId || t._id === tId);
                return table?._id;
            }).filter(id => !!id);

            const res = await waiterAPI.mergeTables(tableIds);
            if (res.data.success || res.status === 200) {
                toast.success('Tables merged successfully');
                // Refresh tables
                const tableRes = await waiterAPI.getTablesByArea(activeFloor);
                setTablesData(tableRes.data.tables);
            }
        } catch (err) {
            console.error('Merge failed', err);
        } finally {
            setIsMergingMode(false);
            setSelectedTables([]);
            setShowMergeConfirm(false);
        }
    };

    // ─── CAP-007 Unmerge / CAP-008 Free / CAP-009 Alert ────────────────────
    // All three actions share the same gated pattern:
    //  • require `tables` permission (admins can revoke per-staff)
    //  • disable while a previous request is in flight
    //  • optimistically toast on success, refetch the grid, close the sheet
    //  • on 4xx, surface the backend message (e.g. "active order — settle first")
    const runTableAction = async (label, action) => {
        if (actionInFlight) return;
        if (!hasPermission('tables')) {
            toast.error("You don't have permission for table actions. Please contact your admin.");
            return;
        }
        setActionInFlight(true);
        try {
            await action();
            toast.success(label);
            await refreshTables();
            setActionsTable(null);
        } catch (err) {
            const msg = err?.response?.data?.message || `Failed to ${label.toLowerCase()}`;
            toast.error(msg);
        } finally {
            setActionInFlight(false);
        }
    };

    const handleUnmerge = (table) => runTableAction(
        'Tables unmerged',
        () => waiterAPI.unmergeTables(table._id),
    );

    const handleFree = (table) => runTableAction(
        'Table freed',
        () => waiterAPI.freeTable(table._id),
    );

    const handleMarkAlert = (table) => runTableAction(
        'Table marked Alert',
        () => waiterAPI.setTableStatus(table._id, 'alert'),
    );

    const handleClearAlert = (table) => runTableAction(
        'Alert cleared',
        () => waiterAPI.setTableStatus(table._id, 'free'),
    );

    // Pick up / serve a takeaway order — same flow as a dine-in ready
    // order (ready → served, tip attributed to the picker). Takeaway has
    // no table tile, so this is driven from the Takeaway sheet instead of
    // the Orders tab. Backend pickup route allows waiter + captain.
    const handleTakeawayPickup = async (orderId) => {
        if (takeawayActionId) return;
        // Optimistic: drop the card immediately so the sheet + count update
        // in the same frame; a failed request reconciles on the next refresh.
        setTakeawayActionId(orderId);
        setTakeawayOrders(prev => prev.filter(o => (o._id || o.id) !== orderId));
        try {
            await waiterAPI.pickupOrder(orderId);
            toast.success('Takeaway served');
            await refreshOrderStats();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Failed to serve takeaway');
            await refreshOrderStats(); // restore the card if the call failed
        } finally {
            setTakeawayActionId(null);
        }
    };

    const toggleTableSelection = (table) => {
        if (!isMergingMode) return;
        if (isTableDisabled(table)) return;

        const idToSelect = table._id;
        setSelectedTables(prev =>
            prev.includes(idToSelect) ? prev.filter(t => t !== idToSelect) : [...prev, idToSelect]
        );
    };

    const getTotalCapacity = () => {
        return tablesData
            .filter(t => selectedTables.includes(t._id))
            .reduce((acc, t) => acc + t.capacity, 0);
    };

    if (loading && !areas.length) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] pb-32 font-sans overflow-x-hidden pt-env(safe-area-inset-top)">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <div className="max-w-7xl mx-auto">
                {/* Top Header — sticky so area chips stay reachable while
                    the waiter scans the long table grid on tablets. */}
                <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-4 sm:px-6 pt-6 pb-4 border-b border-gray-100">
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
                        {/* Action cluster — notifications + profile, mirrors the admin topbar. */}
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
                            {areas.map((area) => (
                                <button
                                    key={area._id}
                                    onClick={() => setActiveFloor(area._id)}
                                    className={`min-h-11 px-4 rounded-xl border transition-all duration-200 min-w-[max-content] ${activeFloor === area._id
                                        ? 'border-[#7C3AED] text-[#7C3AED] bg-[#F9F1FB]'
                                        : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
                                        }`}
                                >
                                    {area.name}
                                </button>
                            ))}
                        </div>

                        {/* Takeaway chip — counter orders aren't area-bound.
                            Tap to view + serve them. Hidden when none active. */}
                        {stats.takeaway > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowTakeaway(true)}
                                className="shrink-0 inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl border border-[#FFD8A8] bg-[#FFF7ED] text-[#C2410C] text-[13px] font-bold active:scale-95 hover:border-[#FF7A00] transition"
                            >
                                <ShoppingBag size={16} strokeWidth={2.2} />
                                <span className="hidden sm:inline">Takeaway</span>
                                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#FF7A00] text-white text-[11px] tabular-nums">{stats.takeaway}</span>
                            </button>
                        )}
                    </div>
                </header>

                {/* Summary Stats Cards. Takeaway is NOT here — it lives as a
                    chip beside the area pills in the header (counter orders
                    aren't area/table bound). Keeps these three about the
                    dine-in floor only. */}
                <section className="grid grid-cols-3 gap-3 sm:gap-4 my-5 sm:my-6 px-4 sm:px-6">
                    <div className="bg-white border border-gray-200 rounded-2xl px-3 py-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                        <p className="text-2xl sm:text-3xl font-extrabold text-[#702083] tabular-nums leading-none">
                            {stats.occupied}<span className="text-gray-400 font-bold">/{stats.total}</span>
                        </p>
                        <p className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mt-2">Tables</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl px-3 py-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                        <p className="text-2xl sm:text-3xl font-extrabold text-[#FF4D4D] tabular-nums leading-none">{stats.pending.toString().padStart(2, '0')}</p>
                        <p className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mt-2">Pending</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl px-3 py-4 text-center shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                        <p className="text-2xl sm:text-3xl font-extrabold text-[#10B981] tabular-nums leading-none">{stats.ready.toString().padStart(2, '0')}</p>
                        <p className="text-[11px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider mt-2">Ready</p>
                    </div>
                </section>

                {/* Table Status Section Title */}
                <div className="py-3 sm:py-4 px-4 sm:px-6 flex justify-between items-center bg-[#FAF5F0] mb-4 gap-3">
                    <div className="min-w-0">
                        <h2 className="text-lg sm:text-xl font-semibold text-[#1A181B]">Table Status</h2>
                        <p className="text-xs sm:text-sm font-semibold text-gray-500 truncate">
                            {areas.find(a => a._id === activeFloor)?.name || 'Loading...'}
                        </p>
                    </div>
                    <button
                        onClick={handleMergeToggle}
                        className="min-h-11 px-4 sm:px-5 rounded-full border-2 font-semibold text-sm transition-all bg-white text-[#FE8301] border-[#FE8301] hover:bg-orange-50 active:scale-[0.98] shrink-0"
                    >
                        {isMergingMode ? (selectedTables.length >= 2 ? 'Confirm Merge' : 'Cancel') : 'Merge Tables'}
                    </button>
                </div>

                {/* Status Legend */}
                {!isMergingMode && (
                    <div className="flex items-center px-4 sm:px-6 flex-wrap gap-x-5 gap-y-3 mb-5">
                        <LegendItem color="bg-[#F9FAFB] border border-[#DDDDDD]" label="Free" />
                        <LegendItem color="bg-[#F3EBF5] border border-[#EED3F5]" label="Occupied" />
                        <LegendItem color="bg-[#FFF3F3] border border-[#FF8E8E]" label="Alert" />
                        <LegendItem color="bg-[#DFDCE0] border border-[#CCCCCC]" label="Reserved" />
                    </div>
                )}

                {isMergingMode && (
                    <div className="mb-5 px-4 sm:px-6">
                        <p className="text-sm font-semibold text-gray-500 leading-relaxed">Tables that are already merged, reserved, or in alert cannot be selected.</p>
                    </div>
                )}

                {/* Interactive Table Grid */}
                {tablesData.length === 0 ? (
                    <WaiterEmptyState
                        icon={LayoutGrid}
                        title="No tables in this area yet"
                        hint="An admin can add tables under Tables & QR in the admin dashboard."
                    />
                ) : (
                <main className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4 pb-12 px-4 sm:px-6">
                {tablesData.map((table) => {
                    const isSelected = selectedTables.includes(table._id);
                    const isDisabled = isMergingMode && isTableDisabled(table);
                    const isOccupied = table.status === 'occupied' || table.status === 'merged';

                    return (
                        <div
                            key={table._id}
                            onClick={() => {
                                if (isMergingMode) {
                                    toggleTableSelection(table);
                                    return;
                                }
                                // Permission gate — admins can toggle off
                                // `viewTableDetails` on a per-staff basis from
                                // the Add Staff modal. Block + toast so the
                                // waiter knows why the click did nothing.
                                if (!hasPermission('viewTableDetails')) {
                                    toast.error("You don't have permission to view table details. Please contact your admin.");
                                    return;
                                }
                                // Scope the cart to THIS table so any items the waiter adds
                                // on the menu / cart pages stay isolated from other tables.
                                setActiveTable(table._id);
                                navigate(`/waiter/details`, { state: { tableId: table._id, tableName: table.name } });
                            }}
                            className={`relative p-[16px] rounded-[16px] flex flex-col transition-all duration-200 shadow-[0_4px_12px_rgba(0,0,0,0.02)] ${(isMergingMode && !isDisabled) || !isMergingMode ? 'cursor-pointer active:scale-95' : ''
                                } ${getTableStyles(table, isSelected)}`}
                        >
                            {/* Contextual Status Icons */}
                            <div className="absolute top-4 right-4 flex items-center gap-1.5">
                                {isMergingMode && !isDisabled ? (
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-[#FF7A00] border-[#FF7A00]' : 'bg-white border-gray-200'
                                        }`}>
                                        {isSelected && <Check size={14} className="text-white" strokeWidth={4} />}
                                    </div>
                                ) : (
                                    <>
                                        {(table.status === 'alert' || table.status === 'help') && (
                                            <div className="bg-[#FF4D4D] rounded-full p-0.5 shadow-md">
                                                <AlertCircle size={18} className="text-white" strokeWidth={3} />
                                            </div>
                                        )}
                                        {/* CAP-007/008/009 — Actions menu trigger. Don't show
                                            during merge mode (the row click is reserved for
                                            tile-selection) or for reserved tables (the
                                            admin owns reservation lifecycle). */}
                                        {table.status !== 'reserved' && (
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setActionsTable(table); }}
                                                aria-label={`Actions for table ${table.name}`}
                                                className="w-7 h-7 rounded-full text-gray-500 hover:text-gray-900 hover:bg-black/5 active:scale-95 flex items-center justify-center"
                                            >
                                                <MoreVertical size={16} strokeWidth={2.4} />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>

                            <h3 className="text-[18px] font-[600] text-[#1A181B]">{table.name}</h3>
                            <p className="text-[11px] font-[500] text-[#645E66]">Capacity: {table.capacity}</p>

                            <div className="mt-[8px] flex items-center justify-between">
                                {(isOccupied) && (
                                    <p className="text-[12px] font-[600] text-[#1A181B] leading-tight">
                                        {table.mergedWith?.length > 0 ? `Merged (${table.mergedWith.length + 1})` : 'Occupied'}
                                    </p>
                                )}
                                {table.mergedWith?.length > 0 && <Link size={18} className="text-[#9333EA]" strokeWidth={2.5} />}
                            </div>

                            {!isMergingMode && table.status === 'reserved' && (
                                <div className="absolute bottom-4 right-4 text-gray-400">
                                    <FileText size={20} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </main>
                )}
            </div>

            {/* Merge Confirmation Popup */}
            {showMergeConfirm && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10 bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-white rounded-[40px] p-8 shadow-2xl relative animate-in fade-in slide-in-from-bottom-10 duration-300">
                        <button
                            onClick={() => setShowMergeConfirm(false)}
                            className="absolute top-6 right-6 w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <h3 className="text-xl font-black mb-6">Confirm Table Merge</h3>

                        <div className="bg-[#FAF5FF] border border-[#D8B4FE] rounded-[24px] p-5 flex items-center gap-4 mb-6">
                            <div className="w-14 h-14 bg-[#F3E8FF] rounded-2xl flex items-center justify-center text-[#9333EA]">
                                <Link size={28} strokeWidth={2.5} />
                            </div>
                            <div className="flex-1">
                                <p className="text-lg font-black text-[#9333EA] leading-tight">
                                    {selectedTables.length} Tables selected
                                </p>
                            </div>
                            <div className="bg-white border border-[#D8B4FE] px-3 py-1.5 rounded-full text-[11px] font-black text-[#9333EA] whitespace-nowrap">
                                Total Cap: {getTotalCapacity()}
                            </div>
                        </div>

                        <p className="text-[14px] font-bold text-gray-500 mb-8 leading-relaxed">
                            Combine {selectedTables.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1))).join(' & ')} Table
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => {
                                    setShowMergeConfirm(false);
                                    setIsMergingMode(false);
                                    setSelectedTables([]);
                                }}
                                className="py-4 rounded-2xl border-2 border-[#FF7A00] text-[#FF7A00] font-black text-base hover:bg-orange-50 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmMerge}
                                className="py-4 rounded-2xl bg-[#FF7A00] text-white font-black text-base shadow-lg shadow-orange-100 hover:bg-[#E66E00] transition-all active:scale-95"
                            >
                                Merge Now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CAP-007/008/009 — Table Actions bottom sheet */}
            {actionsTable && (() => {
                const t = actionsTable;
                const isMerged = (t.mergedWith && t.mergedWith.length > 0) || t.status === 'merged';
                const canMarkAlert = t.status === 'free' || t.status === 'occupied';
                const canClearAlert = t.status === 'alert';
                // Don't gate the Free button on FE state — let the backend
                // decide whether the table has an active order (it 400s
                // with a helpful message we surface in the catch block).
                const canFree = t.status !== 'free';

                return (
                    <div
                        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end justify-center sm:items-center"
                        onClick={() => !actionInFlight && setActionsTable(null)}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Actions for table ${t.name}`}
                    >
                        <div
                            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-5">
                                <div className="min-w-0">
                                    <h3 className="text-lg font-bold text-[#1A181B] truncate">
                                        Table {t.name}
                                    </h3>
                                    <p className="text-xs font-semibold text-gray-500 capitalize mt-0.5">
                                        Status: {t.status}{isMerged ? ` · Merged (${t.mergedWith.length + 1})` : ''}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !actionInFlight && setActionsTable(null)}
                                    aria-label="Close"
                                    disabled={actionInFlight}
                                    className="w-10 h-10 rounded-full bg-gray-50 hover:bg-gray-100 active:scale-95 flex items-center justify-center text-gray-500 disabled:opacity-50"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-2.5">
                                {isMerged && (
                                    <button
                                        type="button"
                                        onClick={() => handleUnmerge(t)}
                                        disabled={actionInFlight}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#F3EBF5] hover:bg-[#EED3F5] active:scale-[0.98] text-[#702083] font-bold text-sm transition disabled:opacity-60"
                                    >
                                        <Unlink size={18} strokeWidth={2.4} />
                                        Unmerge group
                                    </button>
                                )}
                                {canMarkAlert && (
                                    <button
                                        type="button"
                                        onClick={() => handleMarkAlert(t)}
                                        disabled={actionInFlight}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#FFF3F3] hover:bg-[#FFE5E5] active:scale-[0.98] text-[#FF3B30] font-bold text-sm transition disabled:opacity-60"
                                    >
                                        <BellRing size={18} strokeWidth={2.4} />
                                        Mark Alert
                                    </button>
                                )}
                                {canClearAlert && (
                                    <button
                                        type="button"
                                        onClick={() => handleClearAlert(t)}
                                        disabled={actionInFlight}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#F9FAFB] hover:bg-gray-100 active:scale-[0.98] text-gray-700 font-bold text-sm transition disabled:opacity-60"
                                    >
                                        <Check size={18} strokeWidth={2.4} />
                                        Clear Alert
                                    </button>
                                )}
                                {canFree && (
                                    <button
                                        type="button"
                                        onClick={() => handleFree(t)}
                                        disabled={actionInFlight}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#F9FAFB] hover:bg-gray-100 active:scale-[0.98] text-gray-700 font-bold text-sm transition disabled:opacity-60"
                                    >
                                        <Check size={18} strokeWidth={2.4} />
                                        Free Table
                                    </button>
                                )}
                                {!isMerged && !canMarkAlert && !canClearAlert && !canFree && (
                                    <p className="text-sm text-gray-500 text-center py-4">
                                        No actions available for this table.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Takeaway orders sheet — opened from the Takeaway stat card.
                Counter orders have no table tile, so this is how floor staff
                view them (id, items, status, amount). */}
            {showTakeaway && (
                <div
                    className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
                    onClick={() => setShowTakeaway(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Takeaway orders"
                >
                    <div
                        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <ShoppingBag size={20} className="text-[#FF7A00]" strokeWidth={2.2} />
                                <h3 className="text-lg font-bold text-[#1A181B]">Takeaway Orders ({takeawayOrders.length})</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowTakeaway(false)}
                                aria-label="Close"
                                className="w-10 h-10 rounded-full bg-gray-50 hover:bg-gray-100 active:scale-95 flex items-center justify-center text-gray-500"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto -mx-1 px-1 flex flex-col gap-3">
                            {takeawayOrders.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-8">No active takeaway orders.</p>
                            ) : takeawayOrders.map((o) => (
                                <div key={o._id || o.id} className="rounded-2xl border border-gray-200 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-[#1A181B] truncate">#{o.id}</p>
                                            <p className="text-[11px] font-semibold text-gray-400">{o.time} · {o.user || 'Guest'}</p>
                                        </div>
                                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full capitalize shrink-0 ${
                                            o.status === 'ready' ? 'bg-[#DCFCE7] text-[#15803D]'
                                            : o.status === 'preparing' ? 'bg-[#FEF3C7] text-[#B45309]'
                                            : 'bg-[#FEE2E2] text-[#B91C1C]'}`}>{o.status}</span>
                                    </div>
                                    {(o.items || []).length > 0 && (
                                        <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                                            {(o.items || []).slice(0, 5).map((it, i, arr) => (
                                                `${it.quantity}× ${it.name}${i < arr.length - 1 ? ', ' : ''}`
                                            ))}
                                            {(o.items || []).length > 5 && ` +${o.items.length - 5} more`}
                                        </p>
                                    )}
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <span className="text-sm font-extrabold text-[#1A181B]">₹{o.total}</span>
                                        {o.status === 'ready' ? (
                                            <button
                                                type="button"
                                                onClick={() => handleTakeawayPickup(o._id || o.id)}
                                                disabled={takeawayActionId === (o._id || o.id)}
                                                className="inline-flex items-center gap-1.5 min-h-9 px-4 rounded-full bg-[#10B981] text-white text-xs font-bold active:scale-95 transition disabled:opacity-60"
                                            >
                                                {takeawayActionId === (o._id || o.id)
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : <Check size={14} strokeWidth={2.5} />}
                                                Serve / Hand over
                                            </button>
                                        ) : (
                                            <span className="text-[11px] font-semibold text-gray-400">In kitchen…</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
};

const LegendItem = ({ color, label }) => (
    <div className="flex items-center gap-2">
        <div className={`w-5 h-5 rounded-[6px] ${color}`} />
        <span className="text-[13px] font-bold text-gray-500">{label}</span>
    </div>
);

export default WaiterHomePage;
