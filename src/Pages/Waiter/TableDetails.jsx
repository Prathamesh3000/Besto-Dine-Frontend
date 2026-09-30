import React, { useState, useEffect, useMemo } from 'react';
import { Menu, ChevronLeft, Info, RotateCcw, Clock3, CircleCheckBig, Minus, Plus, Loader2 } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import ProductDetailsPopup from '../../Components/Waiter/ProductDetailsPopup';
import { useCart } from '../../Context/CartContext';
import { waiterAPI, settingsAPI } from '../../utils/api';
import { resolveImageUrl } from '../../utils/image';
import useSocketEvent from '../../hooks/useSocketEvent';
import toast from 'react-hot-toast';
import { useAuth, CAPTAIN_ROLES } from '../../Context/AuthContext';
import { getWaiterScope } from '../../utils/waiterScope';

/**
 * Human labels for Request.type. The model's enum is
 * ['water', 'waiter', 'bill', 'other'] — 'bill' matters here because
 * a customer asking to settle up is a payment request the waiter must
 * see at the table, not just a generic ping.
 */
const REQUEST_LABELS = {
    water: 'Water requested',
    waiter: 'Waiter called',
    bill: 'Bill requested',
    other: 'Assistance requested',
};

/** Compact "how long has this guest been waiting" label. */
function timeAgo(value) {
    if (!value) return '';
    const diffMs = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

const TableDetails = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    // Billing is a captain-only action (per CLAUDE.md: Captain "finalizes
    // a bill" while Waiter cannot). The button used to render for every
    // staff member, but clicking it as a Waiter just bounced back to
    // /waiter/home thanks to the route guard — confusing UX. Hide it
    // entirely for waiters so the screen matches their actual capabilities.
    const canViewBill = CAPTAIN_ROLES.includes(user?.role);
    const [tableId, setTableId] = useState(location.state?.tableId || localStorage.getItem('lastWaiterTableId'));
    const [tableName, setTableName] = useState(location.state?.tableName || localStorage.getItem('lastWaiterTableName'));

    useEffect(() => {
        if (location.state?.tableId) {
            setTableId(location.state.tableId);
            localStorage.setItem('lastWaiterTableId', location.state.tableId);
        }
        if (location.state?.tableName) {
            setTableName(location.state.tableName);
            localStorage.setItem('lastWaiterTableName', location.state.tableName);
        }
    }, [location.state]);

    const [loading, setLoading] = useState(true);
    const [activeOrder, setActiveOrder] = useState(null);
    const [orderList, setOrderList] = useState([]); // Currently active items
    const [deliveredItems, setDeliveredItems] = useState([]); // Past/Served items
    const [areas, setAreas] = useState([]);
    const [activeFloor, setActiveFloor] = useState(null);
    const [cafeConfig, setCafeConfig] = useState({ name: '', logo: '' });

    const [isRepeating, setIsRepeating] = useState(false);
    // Pending service requests for THIS table. The table screen
    // previously showed none at all: a customer could tap "Ask for
    // Water" and the waiter standing at that very table had no way to
    // see it here — the request surfaced only on the separate Requests
    // tab, which is not where you look when you're at the table.
    const [tableRequests, setTableRequests] = useState([]);
    const [requestBusy, setRequestBusy] = useState(null);
    const [repeatQty, setRepeatQty] = useState(1);
    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const { cartItems, totalItems, totalPrice, clearCart, setActiveTable } = useCart();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // CAP-010 — the area chips are scoped to the waiter's assignment the
    // same way the Home grid is, so a private-dining waiter doesn't see
    // the whole floor plan leak into the chip strip here. Empty
    // `assignedAreas` = no restriction (tenant-/branch-wide catch-all).
    const scope = useMemo(() => getWaiterScope(user), [user]);

    // Scope the waiter's cart to this table so items never bleed across tables.
    // Runs on mount AND whenever tableId changes (deep-link / refresh).
    useEffect(() => {
        if (tableId) setActiveTable(tableId);
    }, [tableId, setActiveTable]);

    // Fetch areas and settings on mount
    useEffect(() => {
        waiterAPI.getAreas().then(res => {
            if (res.data?.success) {
                // Narrow the tenant-wide /areas list to the waiter's
                // assigned areas. Mirrors WaiterHomePage so the chip strip
                // is identical on both screens; when the waiter has no
                // area scope (catch-all, or only table-pinned) show all.
                const all = res.data.areas || [];
                setAreas(scope.hasAreaScope
                    ? all.filter(a => scope.assignedAreaIds.has(String(a._id)))
                    : all);
            }
        }).catch(() => {});

        settingsAPI.getSettings().then(res => {
            if (res.data) setCafeConfig({
                name: res.data.general?.cafeName || 'Cafe Name',
                logo: res.data.general?.logoUrl || ''
            });
        }).catch(() => {});
    }, [scope]);

    // Set active floor once we have order + areas
    useEffect(() => {
        if (activeOrder?.table?.area && areas.length > 0) {
            const areaId = typeof activeOrder.table.area === 'object' ? activeOrder.table.area._id : activeOrder.table.area;
            setActiveFloor(areaId);
        }
    }, [activeOrder, areas]);

    const fetchActiveOrder = async () => {
        if (!tableId) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            const res = await waiterAPI.getActiveOrderByTable(tableId);
            if (res.data.success && res.data.order) {
                setActiveOrder(res.data.order);
                const items = res.data.order.items || [];
                setOrderList(items.filter(i => ['new', 'preparing', 'ready'].includes(res.data.order.status)));
                setDeliveredItems(items.filter(i => i.status === 'served' || res.data.order.status === 'served'));
            } else {
                setActiveOrder(null);
                setOrderList([]);
                setDeliveredItems([]);
            }
        } catch (err) {
            console.error('Failed to fetch active order', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTableRequests = async () => {
        if (!tableId) return;
        try {
            // Open requests are BOTH 'pending' and 'accepted'. When the
            // table has an assigned waiter, createRequest auto-accepts
            // every call on arrival (status 'accepted', waiter pre-set),
            // so fetching only 'pending' meant a waiter standing at their
            // own table never saw that table's requests here at all.
            const [pendingRes, acceptedRes] = await Promise.all([
                waiterAPI.getRequests({ status: 'pending' }),
                waiterAPI.getRequests({ status: 'accepted' }),
            ]);
            const all = [
                ...(pendingRes.data?.success ? (pendingRes.data.requests || []) : []),
                ...(acceptedRes.data?.success ? (acceptedRes.data.requests || []) : []),
            ];
            // The endpoint is floor-wide; narrow to this table. Compare
            // as strings because `table` arrives populated on some
            // responses and as a raw ObjectId on others.
            setTableRequests(all
                .filter((r) => {
                    const rid = typeof r.table === 'object' ? r.table?._id : r.table;
                    return String(rid) === String(tableId);
                })
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
        } catch (err) {
            // Non-fatal: the order list is the page's primary job.
            console.warn('Could not load table requests', err?.message);
        }
    };

    const resolveRequest = async (requestId) => {
        setRequestBusy(requestId);
        // Optimistic — the row disappearing IS the confirmation.
        const previous = tableRequests;
        setTableRequests((prev) => prev.filter((r) => r._id !== requestId));
        try {
            await waiterAPI.updateRequestStatus(requestId, 'completed', user?._id || user?.id);
            toast.success('Request marked done');
        } catch (err) {
            setTableRequests(previous);
            toast.error(err.response?.data?.message || 'Could not update the request');
        } finally {
            setRequestBusy(null);
        }
    };

    useEffect(() => {
        fetchActiveOrder();
        fetchTableRequests();
    }, [tableId]);

    // Live: a customer tapping "Ask for Water" while the waiter has
    // this screen open must appear without a manual refresh.
    useSocketEvent('request:new', fetchTableRequests);
    useSocketEvent('request:updated', fetchTableRequests);

    // Real-time: when admin appends an item to this table's order, the
    // backend fires `order:appended` + `order:updated`. Refetch so the
    // "Added later" section lights up without the waiter having to pull
    // the page down.
    useSocketEvent('order:appended', (payload) => {
        if (!payload?.orderId || !activeOrder?.orderId) return;
        if (String(payload.orderId) !== String(activeOrder.orderId)) return;
        const names = (payload.addedItems || []).map(i => i?.name).filter(Boolean).slice(0, 2).join(', ');
        toast.success(`New item${(payload.addedItems || []).length === 1 ? '' : 's'} added${names ? `: ${names}` : ''}`, { icon: '🍽️' });
        fetchActiveOrder();
    });
    useSocketEvent('order:updated', (payload) => {
        if (!payload?.orderId || !activeOrder?.orderId) return;
        if (String(payload.orderId) !== String(activeOrder.orderId)) return;
        fetchActiveOrder();
    });

    const handleOpenPopup = (product) => {
        setSelectedProduct(product);
        setIsPopupOpen(true);
    };

    const handleAddItem = async (itemToRepeat) => {
        if (!activeOrder) {
            toast.error('Place an order first or go to Menu');
            return;
        }

        try {
            const res = await waiterAPI.repeatItem(activeOrder._id, itemToRepeat._id, repeatQty);
            if (res.data.success) {
                toast.success('Item added to order');
                fetchActiveOrder();
                setIsRepeating(false);
                setRepeatQty(1);
            }
        } catch (err) {
            console.error('Failed to repeat item', err);
        }
    };

    const handleOrderNow = async () => {
        if (isSubmitting) return;
        // Item shape varies by where it was added:
        //   - waiter CategoryItemsPage stores { id, name, price, ... }
        //   - customer Home.jsx (mounted at /waiter/category/:id) stores
        //     itemProps with { id, title, price, ... } + ProductDetails
        //     appends unitPrice under `price` and _raw under the spread.
        // Normalise by falling back through every known key so the
        // backend always receives `name` and `price` (both required).
        const items = Object.values(cartItems).map(item => ({
            menuItem: item.menuItem || item._id || item.id,
            name: item.name || item.title || 'Unknown Item',
            price: Number(item.price ?? item.unitPrice ?? item.finalPrice ?? item.basePrice ?? 0),
            quantity: Number(item.quantity) || 1,
            instructions: item.instructions || '',
            selectedToppings: item.selectedToppings || item.toppings || [],
            selectedSizes: item.selectedSizes || [],
        }));
        if (items.length === 0) return;

        // Compute the submission total the same way the backend's
        // price-tampering guard does: (price + sum(topping.price)) * qty.
        // Using CartContext.totalPrice alone was rejecting orders with
        // toppings because the context total doesn't include addon prices,
        // so `total < computedTotal` tripped the 400 ('Order total is less
        // than item prices').
        const computedSubmitTotal = items.reduce((sum, it) => {
            const base = it.price * it.quantity;
            const tops = (Array.isArray(it.selectedToppings) ? it.selectedToppings : [])
                .reduce((s, t) => s + (Number(t?.price) || 0), 0) * it.quantity;
            return sum + base + tops;
        }, 0);

        setIsSubmitting(true);
        try {
            // Branch: append to existing active order, else create a new one.
            // The unique-active-order index would reject a second create on
            // the same table anyway, so appending is the only correct move
            // when there's already an open order.
            if (activeOrder?._id) {
                const res = await waiterAPI.appendItems(activeOrder._id, items);
                if (res.data.success) {
                    toast.success(`${res.data.addedCount} item(s) added to order`);
                    clearCart();
                    fetchActiveOrder();
                }
            } else {
                const orderData = {
                    tableId,
                    type: 'dine-in',
                    items,
                    // Backend requires total >= items-computed sum. Use the
                    // server-equivalent total rather than CartContext.totalPrice
                    // which ignores toppings.
                    total: Number(computedSubmitTotal.toFixed(2)),
                };
                const res = await waiterAPI.createOrder(orderData);
                if (res.data.success) {
                    toast.success('Order placed successfully');
                    clearCart();
                    fetchActiveOrder();
                }
            }
        } catch (err) {
            console.error('Failed to place / append order', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!tableId) return <div className="p-10 text-center">No Table Selected. <button onClick={() => navigate('/waiter/home')}>Go Back</button></div>

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] pb-32 pt-env(safe-area-inset-top)">
            <div className="max-w-7xl mx-auto">
                {/* Header — sticky so the back button + area chips
                    stay reachable while the order list scrolls. */}
                <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-4 sm:px-6 pt-6 pb-4 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3 min-w-0">
                            {resolveImageUrl(cafeConfig.logo) && (
                                <img
                                    src={resolveImageUrl(cafeConfig.logo)}
                                    alt="Logo"
                                    className="h-11 sm:h-12 w-auto max-w-[150px] object-contain shrink-0 mix-blend-multiply"
                                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                                />
                            )}
                            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">{cafeConfig.name}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4">
                        <button
                            onClick={() => navigate('/waiter/home')}
                            aria-label="Back to home"
                            className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <ChevronLeft size={28} strokeWidth={1.75} />
                        </button>

                        <div className="flex-1 flex gap-2 text-[13px] font-bold overflow-x-auto no-scrollbar py-1">
                            {areas.map((area) => (
                                <button
                                    key={area._id}
                                    // Chips used to only toggle a highlight here —
                                    // nothing on this screen is per-section. Open
                                    // that section's table grid instead.
                                    onClick={() => navigate('/waiter/home', { state: { area: area._id } })}
                                    className={`min-h-11 px-4 rounded-xl border transition-all duration-200 min-w-[max-content] ${
                                        activeFloor === area._id
                                            ? 'border-[#7C3AED] text-[#7C3AED] bg-white'
                                            : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'
                                    }`}
                                >
                                    {area.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                {/* Table Branding Strip */}
                <div className="bg-[#F9F1FB] px-4 sm:px-6 py-4 flex justify-between items-center mb-6 gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg sm:text-xl font-semibold text-[#1A181B] truncate">{tableName || 'Unknown Table'}</h2>
                            {activeOrder?.mergedWith?.length > 0 && <span className="text-[11px] font-medium text-[#1A181B] px-2 py-0.5 bg-white rounded-full">Merged</span>}
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-gray-500 mt-0.5 truncate">{activeOrder?.table?.area?.name ? `Floor ${activeOrder.table.area.name}` : ''}</p>
                    </div>
                    <button
                        onClick={() => navigate('/waiter/menu', { state: { tableId, tableName } })}
                        className="min-h-11 px-4 sm:px-5 rounded-full border-2 border-[#FE8301] text-[#FE8301] bg-white font-semibold text-sm hover:bg-orange-50 active:scale-[0.98] transition-all shrink-0"
                    >
                        Menu
                    </button>
                </div>

                {/* Pending requests for this table. Rendered ABOVE the
                    order list because it's the time-sensitive thing: a
                    guest waiting for water is waiting now. */}
                {tableRequests.length > 0 && (
                    <div className="px-4 sm:px-6 mb-4">
                        <h3 className="text-[18px] font-[600] text-[#1A181B] mb-[8px]">
                            Pending requests <span className="text-[#FE8301]">({tableRequests.length})</span>
                        </h3>
                        <ul className="space-y-2">
                            {tableRequests.map((r) => (
                                <li
                                    key={r._id}
                                    className="flex items-center justify-between gap-3 bg-[#FFF5ED] border border-orange-200 rounded-[14px] px-3.5 py-3"
                                >
                                    <div className="min-w-0">
                                        <p className="text-[14px] font-[600] text-[#1A181B] capitalize truncate">
                                            {REQUEST_LABELS[r.type] || r.type}
                                        </p>
                                        {r.items?.length > 0 && (
                                            <p className="text-[12px] text-[#7D7380] truncate">
                                                {r.items.map((i) => i.label).join(', ')}
                                            </p>
                                        )}
                                        <p className="text-[11px] text-[#9A929C]">
                                            {timeAgo(r.createdAt)}
                                            {r.status === 'accepted' && (
                                                <span className="ml-1.5 text-[#8B26A5] font-[600]">
                                                    · Accepted{r.waiter?.name ? ` by ${r.waiter.name}` : ''}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => resolveRequest(r._id)}
                                        disabled={requestBusy === r._id}
                                        className="shrink-0 bg-[#FF7A00] disabled:bg-[#FF7A00]/50 text-white text-[13px] font-[600] px-3.5 py-2 rounded-[10px] transition-colors"
                                    >
                                        {requestBusy === r._id ? '…' : 'Done'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="px-4 sm:px-6">
                <h3 className="text-[18px] font-[600] text-[#1A181B] mb-[8px]">Order List</h3>

                {/* Empty state — no cart, no active order, nothing delivered.
                    Surfaces the waiter's primary action (browse menu) as a
                    big centred CTA instead of leaving them with a blank
                    screen between the T-number strip and the View Bill bar. */}
                {totalItems === 0 && orderList.length === 0 && deliveredItems.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                        <div className="w-20 h-20 rounded-full bg-[#FFF5ED] flex items-center justify-center mb-4">
                            <Menu size={32} className="text-[#FF7A00]" strokeWidth={2} />
                        </div>
                        <h4 className="text-[16px] font-bold text-[#1A181B] mb-1">No items yet</h4>
                        <p className="text-[13px] text-[#645E66] mb-6 max-w-[260px]">
                            Start taking the order by browsing the menu.
                        </p>
                        <button
                            onClick={() => navigate('/waiter/menu', { state: { tableId, tableName } })}
                            className="bg-[#FF7A00] text-white rounded-xl py-3 px-8 font-bold shadow-lg shadow-orange-100 active:scale-[0.98] transition-all flex items-center gap-2"
                        >
                            <Menu size={18} strokeWidth={2.5} />
                            Browse Menu
                        </button>
                    </div>
                )}

                {/* New Items from Cart */}
                {totalItems > 0 && (
                    <div className="mb-[36px] animate-slide-up">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[14px] font-bold text-[#FF7A00] bg-orange-50 px-3 py-1 rounded-full">
                                {activeOrder ? 'Additional items (to be added)' : 'New items (to be ordered)'}
                            </span>
                            <button onClick={clearCart} className="text-[12px] font-bold text-gray-400">Clear all</button>
                        </div>
                        <div className="bg-white rounded-[24px] p-[16px] border-2 border-[#FF7A00]/20 shadow-[0_8px_30px_rgba(255,122,0,0.08)]">
                            {Object.values(cartItems).map((item, idx) => (
                                <div key={item.id} className={`pb-[12px] flex gap-4 ${idx !== Object.values(cartItems).length - 1 ? 'border-b border-gray-50 mb-3' : ''}`}>
                                    <img src={item.image} alt={item.name || item.title || ''} className="w-20 h-20 rounded-2xl object-cover shadow-sm" />
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h4 className="text-[16px] font-bold text-[#1A181B]">{item.name || item.title}</h4>
                                                <p className="text-[13px] text-[#645E66] line-clamp-1">{item.description || item.desc}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-end justify-between">
                                            <div className="bg-[#FFF5ED] px-[8px] py-[4px] rounded-lg text-[12px] font-bold text-[#FF7A00]">
                                                Qty: {item.quantity}
                                            </div>
                                            <p className="text-[15px] font-bold text-[#1A181B]">₹{item.price * item.quantity}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={handleOrderNow}
                                disabled={isSubmitting}
                                className="w-full bg-[#FF7A00] text-white rounded-xl py-3 mt-4 font-bold shadow-lg shadow-orange-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {isSubmitting ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <Plus size={18} />
                                )}
                                {activeOrder ? `Add to Order (₹${totalPrice})` : `Order Now (₹${totalPrice})`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Combined Order Group — Active items, split into
                    "Added later" vs original so the waiter sees what was
                    just appended instead of a merged list. Baseline is
                    min(items.addedAt), not order.createdAt, to self-heal
                    legacy rows whose addedAt got retroactively stamped
                    by a Mongoose default during an append-triggered save. */}
                {orderList.length > 0 && (() => {
                    const GRACE_MS = 60_000;
                    const addedTimes = orderList
                        .map(i => i?.addedAt ? new Date(i.addedAt).getTime() : null)
                        .filter(Number.isFinite);
                    const baselineMs = addedTimes.length
                        ? Math.min(...addedTimes)
                        : (activeOrder?.createdAt ? new Date(activeOrder.createdAt).getTime() : 0);
                    const appendedActive = [];
                    const originalActive = [];
                    for (const it of orderList) {
                        const addedMs = it?.addedAt ? new Date(it.addedAt).getTime() : baselineMs;
                        if (Number.isFinite(addedMs) && addedMs - baselineMs > GRACE_MS) appendedActive.push(it);
                        else originalActive.push(it);
                    }
                    const renderItem = (item, idx, total, isLate) => (
                        <div key={item._id || `${isLate ? 'late' : 'orig'}-${idx}`} className={`pb-[12px] flex gap-4 ${idx !== total - 1 ? 'border-b border-gray-50' : ''}`}>
                            <div className="flex-1 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="text-[16px] font-[600] text-[#1A181B]">{item.name}</h4>
                                        <p className="text-[14px] text-[#645E66]">{item.instructions}</p>
                                    </div>
                                    <div className={`px-[6px] py-[4px] rounded-[60px] gap-[4px] flex items-center shadow-sm ${isLate ? 'bg-[#FFEBDB] text-[#FE8301]' : 'bg-[#FFEFD0] text-[#FFB02E]'}`}>
                                        <Clock3 size={10} strokeWidth={3} />
                                        <span className="text-[11px] font-[600] uppercase">{isLate ? 'New' : activeOrder.status}</span>
                                    </div>
                                </div>
                                <div className="flex items-end justify-between mt-2">
                                    <div className="bg-[#F7F7F7] px-[6px] py-[4px] rounded-lg text-[11px] font-[600] text-[#8D848F]">
                                        Qty: {item.quantity}
                                    </div>
                                    <p className="text-[14px] font-[600] text-[#1A181B]">₹{item.price}</p>
                                </div>
                            </div>
                        </div>
                    );
                    return (
                        <div className="mb-[36px]">
                            {appendedActive.length > 0 && (
                                <>
                                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#FE8301] mb-1 flex items-center gap-1.5 px-1">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FE8301] animate-pulse" />
                                        Added later · {appendedActive.length}
                                    </div>
                                    <div className="bg-[#FFF4E8] rounded-[24px] p-[16px] mb-[12px] ring-1 ring-[#FE8301]/30 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                                        {appendedActive.map((item, idx) => renderItem(item, idx, appendedActive.length, true))}
                                    </div>
                                </>
                            )}
                            {originalActive.length > 0 && (
                                <>
                                    {appendedActive.length > 0 && (
                                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#8D848F] mb-1 px-1">
                                            Original order · {originalActive.length}
                                        </div>
                                    )}
                                    <div className={`bg-white rounded-[24px] p-[16px] mb-[12px] border border-[#DDDDDD] shadow-[0_4px_20px_rgba(0,0,0,0.03)] ${appendedActive.length > 0 ? 'opacity-80' : ''}`}>
                                        {originalActive.map((item, idx) => renderItem(item, idx, originalActive.length, false))}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}

                {/* Delivered/Served Items */}
                {deliveredItems.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-[14px] font-bold text-gray-400 uppercase tracking-widest px-1">Delivered</h4>
                    {deliveredItems.map((item) => (
                    <div key={item._id} className="bg-white rounded-[24px] border border-gray-50 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                        <div className="flex gap-4 mb-4">
                            <div className="flex-1 flex flex-col justify-between">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="text-[15px] font-black leading-tight mb-0.5">{item.name}</h4>
                                    </div>
                                    <div className="bg-[#E5FFEB] text-[#34C759] px-[6px] py-[4px] rounded-[60px] gap-[4px] flex items-center shadow-sm">
                                        <CircleCheckBig size={12} strokeWidth={3} />
                                        <span className="text-[11px] font-black">Served</span>
                                    </div>
                                </div>
                                <div className="flex items-end justify-between mt-2">
                                    <div className="bg-[#F8F9FA] px-2 py-0.5 rounded-lg text-[11px] font-black text-gray-400">
                                        Qty: {item.quantity}
                                    </div>
                                    <p className="text-[16px] font-black">₹{item.price}</p>
                                </div>
                            </div>
                        </div>

                        {!isRepeating ? (
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleOpenPopup(item)}
                                    className="flex items-center justify-center gap-2 bg-white border border-gray-100 rounded-xl py-2.5 text-sm font-bold shadow-sm hover:bg-gray-50 transition-colors"
                                >
                                    <Info size={18} className="text-gray-400" />
                                    <span>Details</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedProduct(item);
                                        setIsRepeating(true);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-white border border-[#FFAC2F] rounded-xl py-2.5 text-sm font-bold text-[#FFAC2F] shadow-sm hover:bg-orange-50 transition-colors"
                                >
                                    <RotateCcw size={18} />
                                    <span>Repeat</span>
                                </button>
                            </div>
                        ) : selectedProduct?._id === item._id && (
                            <div className="flex gap-3">
                                <div className="flex-1 flex items-center justify-between bg-[#FFF5ED] border border-[#FFAC2F] rounded-2xl px-4 py-2">
                                    <button
                                        onClick={() => {
                                            if (repeatQty === 1) {
                                                setIsRepeating(false);
                                            } else {
                                                setRepeatQty(prev => prev - 1);
                                            }
                                        }}
                                        className="text-gray-400 hover:text-[#FF7A00]"
                                    >
                                        <Minus size={20} />
                                    </button>
                                    <span className="text-xl font-black text-[#FF7A00]">{repeatQty}</span>
                                    <button
                                        onClick={() => setRepeatQty(prev => prev + 1)}
                                        className="text-gray-400 hover:text-[#FF7A00]"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => handleAddItem(item)}
                                    className="flex-[1.5] bg-[#FF7A00] text-white rounded-2xl py-3 text-[15px] font-black shadow-lg shadow-orange-100 active:scale-95 transition-all text-center"
                                >
                                    Add item
                                </button>
                            </div>
                        )}
                    </div>
                    ))}
                </div>
                )}
            </div>

            </div>

            {/* Sticky Bottom Action — captain/admin/manager only */}
            {canViewBill && (
                <div className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 pt-4 pb-8 bg-white/90 backdrop-blur-md border-t border-gray-100 z-50">
                    <div className="max-w-7xl mx-auto">
                        <button
                            onClick={() => navigate('/waiter/bill', { state: { tableId, tableName, activeOrder } })}
                            className="w-full min-h-14 bg-[#FF7A00] text-white rounded-2xl px-4 flex items-center justify-center gap-3 text-base font-bold shadow-lg shadow-orange-200 active:scale-[0.98] transition-all disabled:opacity-50"
                            disabled={!activeOrder}
                            >
                            View Bill
                        </button>
                    </div>
                </div>
            )}

            {/* Product Details Popup */}
            <ProductDetailsPopup
                isOpen={isPopupOpen}
                onClose={() => setIsPopupOpen(false)}
                product={selectedProduct}
            />
        </div>
    );
};

export default TableDetails;
