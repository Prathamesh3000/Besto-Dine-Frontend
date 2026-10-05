import React, { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Tag, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { settingsAPI, promotionsAPI } from "../../utils/api";
import { resolveImageUrl } from "../../utils/image";
import useSocketEvent from "../../hooks/useSocketEvent";
import { joinRoom } from "../../utils/socket";
import toast from "react-hot-toast";
import { billFromOrder, orderAmountDue, toTaxConfig } from "../../utils/billing";

export default function BillPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tableId, tableName, activeOrder } = location.state || {};

    const [order, setOrder] = useState(activeOrder || null);
    const [loading, setLoading] = useState(!activeOrder);
    const [settings, setSettings] = useState(null);
    const [couponCode, setCouponCode] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState(null);
    const [couponLoading, setCouponLoading] = useState(false);

    // Fetch settings for cafe name + tax rates
    useEffect(() => {
        settingsAPI.getSettings().then(res => {
            if (res.data) setSettings(res.data);
        }).catch(() => {});
    }, []);

    // Single-source fetch — used by the initial load and the socket
    // refresh handlers below. Prefer the tableId passed via route state,
    // otherwise fall back to the order's own _id (so socket-triggered
    // refetches still work after the order is already loaded).
    const refetchOrder = async () => {
        try {
            if (tableId) {
                const res = await api.get(`/orders/active/table/${tableId}`);
                if (res.data?.success && res.data.order) setOrder(res.data.order);
            } else if (order?._id) {
                const res = await api.get(`/orders/${order._id}/detail`);
                if (res.data?.success && res.data.order) setOrder(res.data.order);
            }
        } catch (err) {
            console.error('Failed to refetch order:', err);
        }
    };

    // Fetch order from API if not passed via route state
    useEffect(() => {
        if (activeOrder) { setLoading(false); return; }
        if (!tableId) { setLoading(false); return; }

        (async () => {
            await refetchOrder();
            setLoading(false);
        })();
    }, [tableId, activeOrder]);

    // Live sync — when admin/waiter/customer applies a coupon, appends
    // an item, or the customer pays, the server fires `order:updated` /
    // `order:appended` and this page silently refetches so the total
    // stays consistent across screens.
    useEffect(() => {
        if (!order?.orderId) return;
        joinRoom(`order:${order.orderId}`);
    }, [order?.orderId]);

    // Mirror any server-side coupon into the local UI state so the badge
    // + code input reflect what's actually persisted — crucial for the
    // case where admin or another waiter applied the coupon first.
    useEffect(() => {
        if (order?.couponCode && order?.couponDiscount > 0) {
            setAppliedCoupon({ code: order.couponCode, discount: order.couponDiscount });
            setCouponCode(order.couponCode);
        } else if (order && !order.couponCode) {
            setAppliedCoupon(null);
        }
    }, [order?.couponCode, order?.couponDiscount]);
    useSocketEvent('order:updated', (payload) => {
        if (!payload?.orderId || !order?.orderId) return;
        if (String(payload.orderId) !== String(order.orderId)) return;
        refetchOrder();
    });
    useSocketEvent('order:appended', (payload) => {
        if (!payload?.orderId || !order?.orderId) return;
        if (String(payload.orderId) !== String(order.orderId)) return;
        refetchOrder();
    });

    // Rates are 0 until /settings lands (toTaxConfig(null)) so no stale
    // 5/10 defaults paint between mount and the response.
    const taxConfig = toTaxConfig(settings?.taxes);
    const cafeName = settings?.general?.cafeName || 'Cafe';

    // Split bill items into "original order" vs "added later" so the
    // waiter / printed bill clearly shows what was appended mid-meal.
    // Baseline is min(items.addedAt), not order.createdAt, to self-heal
    // legacy rows whose addedAt got retroactively stamped by a Mongoose
    // default during an append-triggered save.
    const ADDED_LATER_GRACE_MS = 60_000;
    const rawItems = order?.items || [];
    const addedTimes = rawItems
        .map(i => i?.addedAt ? new Date(i.addedAt).getTime() : null)
        .filter(Number.isFinite);
    const baselineMs = addedTimes.length
        ? Math.min(...addedTimes)
        : (order?.createdAt ? new Date(order.createdAt).getTime() : 0);
    const formatItem = (item, idx, isLate) => ({
        id: item._id || `${isLate ? 'late' : 'orig'}-${idx}`,
        name: item.name,
        desc: item.instructions || (item.selectedSizes?.[0]?.name ? `${item.selectedSizes[0].name}` : 'Regular'),
        qty: item.quantity || 1,
        price: item.price || 0,
        image: item.image || 'https://placehold.co/200x200?text=Item',
        isLate,
    });
    const originalItems = [];
    const appendedItems = [];
    rawItems.forEach((item, idx) => {
        const addedMs = item?.addedAt ? new Date(item.addedAt).getTime() : baselineMs;
        const isLate = Number.isFinite(addedMs) && addedMs - baselineMs > ADDED_LATER_GRACE_MS;
        (isLate ? appendedItems : originalItems).push(formatItem(item, idx, isLate));
    });

    // The coupon shown is the one persisted on the order (synced across
    // admin / waiter / customer) — only a persisted coupon is part of
    // order.total, which is what gets settled.
    const effectiveCouponCode = order?.couponCode || '';
    // The bill is the order's STORED bill (utils/billing.billFromOrder):
    // the breakdown and order.total the server stamped when the order was
    // placed / appended / couponed. It is never re-priced from the
    // current tax settings — marking Paid cannot change order.total, and
    // the server rejects an amount below what is due (AMOUNT_TOO_LOW), so
    // a live re-price would break settlement as soon as an admin edits a
    // rate. taxConfig is only the fallback for legacy orders with no
    // stored total / breakdown.
    const bill = billFromOrder(order, taxConfig);
    const { subtotal, gst, gstPct, serviceCharge: service } = bill;
    const servicePct = bill.serviceChargePct;
    const discount = bill.couponDiscount;
    const effectiveCouponDiscount = discount;
    // Manual discount applied from the admin table drawer (persisted on
    // the order, outside order.total) — taken off the final figure,
    // matching the server's due = total − manualDiscount − amountPaid.
    const manualDiscount = bill.manualDiscount;
    const tipAmount = bill.tipAmount;
    const pointsRedeemed = bill.pointsRedeemed;

    const isPaid = order?.paymentStatus === 'Paid';
    const paidAmount = Number(order?.amountPaid) || 0;
    // Bill total after the staff discount.
    const billTotal = Math.max(0, Math.round((bill.total - manualDiscount) * 100) / 100);
    // What the waiter collects (sent on as the settle amount): the
    // stored bill less anything already paid (e.g. a wallet portion).
    const amountDue = orderAmountDue(order, taxConfig);
    // Already-paid orders show the amount actually collected.
    const total = isPaid && paidAmount > 0 ? paidAmount : billTotal;

    // Apply coupon by persisting it on the order (PATCH /orders/:id/coupon).
    // The server validates, saves couponCode + couponDiscount on the order,
    // and emits `order:updated` so the admin drawer and customer bill
    // preview re-render to the new total without any extra plumbing.
    const handleApplyCoupon = async () => {
        if (!couponCode.trim() || !order?._id) return;
        setCouponLoading(true);
        try {
            const res = await api.patch(`/orders/${order._id}/coupon`, { code: couponCode.trim() });
            if (res.data?.success) {
                // The bill is read from the stored order, so make sure we
                // hold the re-priced one.
                if (res.data.order) setOrder(res.data.order);
                else refetchOrder();
                setAppliedCoupon({ code: res.data.coupon?.code || couponCode.trim(), discount: res.data.discount || 0 });
                toast.success(res.data.message || 'Coupon applied!');
            } else {
                toast.error(res.data?.message || 'Invalid coupon');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to apply coupon');
        } finally {
            setCouponLoading(false);
        }
    };

    const handleRemoveCoupon = async () => {
        if (!order?._id) return;
        try {
            const res = await api.patch(`/orders/${order._id}/coupon`, { code: '' });
            if (res.data?.success && res.data.order) setOrder(res.data.order);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to remove coupon');
        }
        setAppliedCoupon(null);
        setCouponCode('');
    };

    if (loading) {
        return (
            <div className="max-w-[420px] mx-auto min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    if (!order) {
        return (
            <div className="max-w-[420px] mx-auto min-h-screen flex flex-col items-center justify-center gap-4">
                <p className="text-gray-500 text-lg">No active order found</p>
                <button onClick={() => navigate(-1)} className="text-orange-500 font-semibold">Go Back</button>
            </div>
        );
    }

    return (
        <div className="max-w-160 md:max-w-180 mx-auto bg-gray-100 min-h-screen flex flex-col">

            {/* Header — sticky, tablet-sized back button */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 pt-6 pb-4 bg-gray-100/95 backdrop-blur">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={() => navigate('/waiter/details', { state: { tableId, tableName } })}
                        aria-label="Back"
                        className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-200/60 flex items-center justify-center transition shrink-0"
                    >
                        <ArrowLeft size={22} />
                    </button>
                    <span className="text-sm font-semibold text-gray-700 truncate">
                        Order ID: {order.orderId || order._id}
                    </span>
                </div>
                <span className="text-sm font-semibold text-gray-600 shrink-0">
                    Table {tableName || '—'}
                </span>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 sm:px-6 pb-32">

                {/* Logo */}
                <div className="flex flex-col items-center mb-4 text-center">
                    {/* When a real logo exists render it full-size on a white
                        backing so wordmarks / non-square logos aren't cropped.
                        Fall back to the orange circle only when there is no
                        logo uploaded yet. */}
                    {resolveImageUrl(settings?.general?.logoUrl) ? (
                        <div className="w-24 h-24 rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden p-2 flex items-center justify-center">
                            <img
                                src={resolveImageUrl(settings.general.logoUrl)}
                                alt="Logo"
                                className="max-w-full max-h-full object-contain"
                                onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
                            />
                        </div>
                    ) : (
                        <div className="w-20 h-20 rounded-full bg-orange-500" />
                    )}
                    <p className="mt-2 text-lg font-bold text-gray-800">{cafeName}</p>
                    {settings?.general?.address && <p className="text-sm text-gray-500 mt-1 px-4">{settings.general.address}</p>}
                    {(settings?.general?.contactNumber || settings?.general?.email) && (
                        <p className="text-xs text-gray-400 mt-1">
                            {settings.general.contactNumber} {settings.general.contactNumber && settings.general.email && '| '}
                            {settings.general.email}
                        </p>
                    )}
                </div>

                {/* Bill Card */}
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4">Bill Summary</h2>

                    {/* Items — split into original order + items added
                        later so the customer / waiter can tell what was
                        appended mid-meal. */}
                    <div className="space-y-4">
                        {originalItems.length > 0 && (
                            <>
                                {appendedItems.length > 0 && (
                                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
                                        Original order · {originalItems.length}
                                    </div>
                                )}
                                {originalItems.map((item) => (
                                    <div key={item.id} className="flex gap-3">
                                        <img
                                            src={item.image}
                                            alt={item.name}
                                            className="w-16 h-16 rounded-xl object-cover"
                                            onError={(e) => { e.target.src = 'https://placehold.co/200x200?text=Item'; }}
                                        />
                                        <div className="flex-1">
                                            <h3 className="text-sm font-medium">{item.name}</h3>
                                            <p className="text-xs text-gray-500">{item.desc}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-xs bg-gray-100 px-2 py-1 rounded-full text-gray-600">
                                                    Qty:{item.qty}
                                                </span>
                                                <span className="text-sm font-medium">₹{item.price}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                        {appendedItems.length > 0 && (
                            <>
                                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#FE8301] flex items-center gap-1.5 pt-2 border-t border-dashed border-[#FE8301]/30">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FE8301]" />
                                    Added later · {appendedItems.length}
                                </div>
                                {appendedItems.map((item) => (
                                    <div key={item.id} className="flex gap-3 bg-[#FFF4E8] rounded-xl p-2 -mx-1 ring-1 ring-[#FE8301]/20">
                                        <img
                                            src={item.image}
                                            alt={item.name}
                                            className="w-16 h-16 rounded-xl object-cover"
                                            onError={(e) => { e.target.src = 'https://placehold.co/200x200?text=Item'; }}
                                        />
                                        <div className="flex-1">
                                            <h3 className="text-sm font-medium">{item.name}</h3>
                                            <p className="text-xs text-gray-500">{item.desc}</p>
                                            <div className="flex items-center justify-between mt-1">
                                                <span className="text-xs bg-[#FFE4CC] px-2 py-1 rounded-full text-[#FE8301] font-bold">
                                                    Qty:{item.qty}
                                                </span>
                                                <span className="text-sm font-medium">₹{item.price}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Coupon Section */}
                    <div className="my-4 border border-dashed border-[#CCCAC8] rounded-xl p-3">
                        {appliedCoupon ? (
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Tag size={16} className="text-[#22C55E]" />
                                    <span className="text-[13px] font-[600] text-[#22C55E]">
                                        {appliedCoupon.code} — ₹{appliedCoupon.discount} off
                                    </span>
                                </div>
                                <button onClick={handleRemoveCoupon} className="p-1 hover:bg-gray-100 rounded-full">
                                    <X size={16} className="text-[#FF3B30]" />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Tag size={16} className="text-[#8D848F]" />
                                <input
                                    type="text"
                                    value={couponCode}
                                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                    placeholder="Enter coupon code"
                                    className="flex-1 text-[13px] outline-none bg-transparent text-[#1A181B] placeholder:text-[#CCCAC8]"
                                    onKeyDown={(e) => e.key === 'Enter' && handleApplyCoupon()}
                                />
                                <button
                                    onClick={handleApplyCoupon}
                                    disabled={couponLoading || !couponCode.trim()}
                                    className="text-[12px] font-[600] text-[#FE8301] disabled:text-[#CCCAC8] px-2 py-1"
                                >
                                    {couponLoading ? 'Applying...' : 'Apply'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <hr className="my-4 border-dashed border-green-400" />

                    {/* Totals */}
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-gray-500">
                            <span>Subtotal</span>
                            <span>₹{subtotal.toFixed(2)}</span>
                        </div>
                        {effectiveCouponDiscount > 0 && (
                            <div className="flex justify-between text-[#22C55E]">
                                <span>Discount{effectiveCouponCode ? ` (${effectiveCouponCode})` : ''}</span>
                                <span>-₹{discount.toFixed(2)}</span>
                            </div>
                        )}
                        {/* CAP-018 — per-rate breakdown so the waiter and
                            customer can both reconcile the bill against the
                            admin Settings tab. Tax / service rows render
                            ONLY when their rate is > 0 — a tenant with
                            GST disabled shouldn't see a "GST (0%) ₹0.00"
                            row cluttering the bill. */}
                        {(gstPct > 0 || gst > 0) && (
                            <div className="flex justify-between text-gray-500">
                                <span>GST{gstPct > 0 ? ` (${gstPct}%)` : ''}</span>
                                <span>₹{gst.toFixed(2)}</span>
                            </div>
                        )}
                        {(servicePct > 0 || service > 0) && (
                            <div className="flex justify-between text-gray-500">
                                <span>Service Charge{servicePct > 0 ? ` (${servicePct}%)` : ''}</span>
                                <span>₹{service.toFixed(2)}</span>
                            </div>
                        )}
                        {bill.additionalCharges.map((charge, idx) => (
                            <div key={idx} className="flex justify-between text-gray-500">
                                <span>{charge.name} {charge.type === 'Percentage' ? `(${charge.value}%)` : ''}</span>
                                <span>₹{charge.amount.toFixed(2)}</span>
                            </div>
                        ))}
                        {manualDiscount > 0 && (
                            <div className="flex justify-between text-[#22C55E]">
                                <span>Manual Discount</span>
                                <span>-₹{manualDiscount.toFixed(2)}</span>
                            </div>
                        )}
                        {pointsRedeemed > 0 && (
                            <div className="flex justify-between text-[#027A48]">
                                <span>Wallet Points</span>
                                <span>-₹{pointsRedeemed.toFixed(2)}</span>
                            </div>
                        )}
                        {tipAmount > 0 && (
                            <div className="flex justify-between text-gray-500">
                                <span>Tip</span>
                                <span>+₹{tipAmount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between font-semibold text-base pt-1 border-t border-gray-100">
                            <span>Total Payment</span>
                            <span>₹{total.toFixed(2)}</span>
                        </div>
                        {/* Part already collected (e.g. a wallet portion) —
                            the remainder is what the Pay Bill button settles. */}
                        {!isPaid && paidAmount > 0 && (
                            <>
                                <div className="flex justify-between text-[#027A48]">
                                    <span>Already Paid</span>
                                    <span>-₹{paidAmount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-semibold text-base">
                                    <span>Amount Due</span>
                                    <span>₹{amountDue.toFixed(2)}</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* CAP-018 — Barcode strip. The original implementation
                        produced one ragged bar per character of the order id
                        (with random heights) so a 12-char orderId rendered
                        a stubby, ladder-looking strip instead of a barcode.
                        This generates a Code 128–style strip of uniform-
                        height bars alternating with white gaps; widths
                        come from a deterministic hash of the orderId so the
                        same bill always prints the same pattern. */}
                    <div className="mt-6 flex flex-col items-center">
                        {(() => {
                            const seedRaw = String(order.orderId || order._id || '0');
                            // Stable per-bill PRNG — mulberry32 seeded by a
                            // small FNV-1a hash so the bar pattern is
                            // identical across renders of the same order.
                            let h = 2166136261;
                            for (let i = 0; i < seedRaw.length; i++) {
                                h ^= seedRaw.charCodeAt(i);
                                h = Math.imul(h, 16777619);
                            }
                            let state = h >>> 0;
                            const rand = () => {
                                state |= 0; state = (state + 0x6D2B79F5) | 0;
                                let t = Math.imul(state ^ (state >>> 15), 1 | state);
                                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                            };
                            const BAR_COUNT = 84; // Code-128-ish density
                            const widthPx = (r) => (r < 0.55 ? 1 : r < 0.85 ? 2 : 3);
                            return (
                                <div className="flex items-stretch h-12">
                                    {Array.from({ length: BAR_COUNT }).map((_, i) => {
                                        const w = widthPx(rand());
                                        const isBar = i % 2 === 0;
                                        return (
                                            <div
                                                key={i}
                                                className={isBar ? 'bg-black' : 'bg-white'}
                                                style={{ width: `${w}px` }}
                                            />
                                        );
                                    })}
                                </div>
                            );
                        })()}
                        <p className="text-xs mt-2 tracking-widest">{order.orderId || order._id}</p>
                    </div>
                </div>
            </div>

            {/* Bottom Button — flips to a green "Paid" state when the
                order's paymentStatus transitions (cash paid here, Razorpay
                via customer, or admin-recorded payment). The socket
                listener above silently refetches the order and this
                conditional picks up the new status without a reload. */}
            <div className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto bg-gray-100 p-4">
                {order?.paymentStatus === 'Paid' ? (
                    <button
                        disabled
                        className="w-full bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6] rounded-[16px] py-[14px] px-[16px] flex items-center justify-center gap-3 text-[14px] font-[700] cursor-default"
                    >
                        ✓ Paid — ₹{total.toFixed(2)}
                    </button>
                ) : (
                    <button
                        onClick={() => navigate('/waiter/payment', {
                            // Settle amount = stored total − manualDiscount −
                            // amountPaid (PaymentOption sends it as amountPaid).
                            state: { tableId, tableName, orderId: order._id, orderDisplayId: order.orderId, amount: amountDue }
                        })}
                        className="w-full bg-[#FF7A00] text-white rounded-[16px] py-[14px] px-[16px] flex items-center justify-center gap-3 text-[14px] font-[600] shadow-xl shadow-orange-100 active:scale-[0.98] transition-all"
                    >
                        Pay Bill — ₹{amountDue.toFixed(2)}
                    </button>
                )}
            </div>
        </div>
    );
}
