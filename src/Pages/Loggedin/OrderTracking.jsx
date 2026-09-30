import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Check,
  Calendar,
  MapPin,
  Phone,
  Clock,
  Loader2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import api from "../../utils/api";
import { getSocket, joinRoom } from "../../utils/socket";
import { useSocketConnected, useSocketReconnect } from "../../hooks/useSocketEvent";

const OrderTracking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const passedOrder = location.state?.order;
  const [order, setOrder] = useState(passedOrder || null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [cafeContact, setCafeContact] = useState('');
  const [cafeName, setCafeName] = useState('');

  // Stable orderId ref — survives across renders and closures
  const orderIdRef = useRef(params.orderId || passedOrder?.orderId || passedOrder?.id || passedOrder?._id);

  // Keep ref in sync when order state updates
  useEffect(() => {
    if (order?.orderId) orderIdRef.current = order.orderId;
    else if (order?.id) orderIdRef.current = order.id;
  }, [order?.orderId, order?.id]);

  // Fetch cafe contact from tenant-level settings as a fallback for
  // when the order's branch has no contactPhone of its own. The
  // settings doc carries the number under general.contactNumber —
  // older code looked for `contactPhone` here, which never resolved
  // and left the page stuck on "Contact info loading...".
  useEffect(() => {
    import('../../utils/api').then(({ settingsAPI }) => {
      settingsAPI.getSettings().then(res => {
        const general = res.data?.general || res.data?.data?.general || {};
        const phone = general.contactNumber
          || res.data?.contactPhone
          || res.data?.data?.contactPhone
          || '';
        if (phone) setCafeContact(phone);
        if (general.cafeName) setCafeName(general.cafeName);
      }).catch(() => {});
    });
  }, []);

  // Stable refetch function using ref (avoids stale closure)
  const refetchOrder = useCallback(async () => {
    const id = orderIdRef.current;
    if (!id) return;
    try {
      const res = await api.get(`/orders/${id}/detail`);
      if (res.data.success && res.data.order) {
        setOrder(res.data.order);
      }
    } catch (_) {}
  }, []);

  // Initial fetch — ALWAYS fetch from backend for fresh data, even if order was passed via state
  useEffect(() => {
    window.scrollTo(0, 0);
    const id = orderIdRef.current;
    if (id) {
      const fetchOrder = async () => {
        try {
          const res = await api.get(`/orders/${id}/detail`);
          if (res.data.success) setOrder(res.data.order);
          else setFetchError('Order not found');
        } catch (err) {
          console.error('Failed to fetch order:', err);
          // If we have passedOrder, keep showing it even if API fails
          if (!passedOrder) {
            setFetchError(err.response?.data?.message || 'Failed to load order details. Please try again.');
          }
        } finally {
          setLoading(false);
        }
      };
      fetchOrder();
    } else {
      setLoading(false);
      setFetchError('No order ID provided');
    }
  }, []);

  // Live connection indicator — when the socket drops we fall back to
  // 15s polling and tell the user they're in degraded mode.
  const socketLive = useSocketConnected();

  // BUG #23 — coalesce bursts of events into one detail refetch.
  const refetchTimerRef = useRef(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      refetchOrder();
    }, 300);
  }, [refetchOrder]);
  useEffect(() => () => { if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current); }, []);

  // BUG #12 — after a reconnect, resync (events may have been missed).
  // The order room is re-joined automatically by utils/socket on connect.
  useSocketReconnect(scheduleRefetch);

  // Real-time: listen for socket events and refetch when THIS order changes.
  // Backend emits order events only to staff rooms, the owning customer's
  // userId room, and a per-order room `order:<orderId>` — so guests must
  // explicitly join that room or they'll never see the event.
  useEffect(() => {
    const socket = getSocket();
    const id = orderIdRef.current;
    if (id) joinRoom(`order:${id}`);

    const makeHandler = (forcedStatus) => (data) => {
      const myId = orderIdRef.current;
      // Only act if the event is for THIS order, or if no orderId in event
      if (!data?.orderId || data.orderId === myId) {
        // Optimistic apply from the payload so the timeline flips
        // immediately, before the (debounced) refetch round-trip.
        const status = data?.status || (data?.orderId ? forcedStatus : null);
        if (status) {
          setOrder((prev) => prev ? {
            ...prev,
            status,
            paymentStatus: data.paymentStatus || prev.paymentStatus,
            servedAt: data.servedAt || prev.servedAt,
          } : prev);
        }
        scheduleRefetch();
      }
    };
    const onUpdated = makeHandler(null);
    const onReady = makeHandler('ready');
    const onCancelled = makeHandler('cancelled');

    socket.on('order:updated', onUpdated);
    socket.on('order:ready', onReady);
    socket.on('order:cancelled', onCancelled);
    socket.on('notification:new', onUpdated);

    return () => {
      socket.off('order:updated', onUpdated);
      socket.off('order:ready', onReady);
      socket.off('order:cancelled', onCancelled);
      socket.off('notification:new', onUpdated);
    };
  }, [scheduleRefetch]);

  // BUG #23 — fallback polling only while the socket is disconnected.
  useEffect(() => {
    if (socketLive) return undefined;
    const interval = setInterval(refetchOrder, 15000);
    return () => clearInterval(interval);
  }, [refetchOrder, socketLive]);

  const orderTime = order?.timestamp
    ? new Date(order.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    : null;

  const branch = (() => {
    try {
      return JSON.parse(localStorage.getItem("selectedBranch") || "null");
    } catch {
      return null;
    }
  })();

  const [cafeAddress, setCafeAddress] = React.useState('');
  React.useEffect(() => {
    import('../../utils/api').then(({ settingsAPI }) => {
      settingsAPI.getSettings().then(res => {
        // settings doc may be returned at the top level or under .data,
        // depending on which controller path serves the request — check both.
        const general = res.data?.general || res.data?.data?.general || {};
        const flat = general.address;
        const ad = general.addressDetails;
        const structured = ad
          ? [ad.line1, ad.line2, ad.city, ad.state, ad.pincode]
              .filter(Boolean)
              .join(', ')
          : '';
        setCafeAddress(structured || flat || '');
      }).catch(() => {});
    });
  }, []);

  // Prefer the order's own branch (populated by the backend) over the
  // localStorage selectedBranch — the order's branch is what was actually
  // billed, while localStorage may have shifted since the order was placed.
  const orderBranch = order?.branch && typeof order.branch === 'object' ? order.branch : null;
  const branchName = orderBranch?.name || branch?.name || '';
  const pickupAddress = (() => {
    if (orderBranch) {
      return [
        orderBranch.addressLine1,
        orderBranch.addressLine2,
        orderBranch.city,
        orderBranch.state,
        orderBranch.postalCode,
      ].filter(Boolean).join(', ');
    }
    if (branch) {
      return [branch.addressLine1, branch.addressLine2].filter(Boolean).join(' ');
    }
    return cafeAddress || '';
  })();

  // Branch contact wins over the tenant-level cafe contact when present —
  // a multi-branch tenant typically has a per-location number on the receipt.
  const pickupContact = orderBranch?.contactPhone || cafeContact || '';

  // Helper to get formatted time relative to now
  const getRelativeTime = (minutesOffset) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + minutesOffset);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Use backend pickupTime, then selectedTime from state, then fallback.
  // pickupTime is stored as a pre-formatted string ("02:30 PM") on the order.
  const pickupTime = order?.pickupTime || order?.selectedTime || getRelativeTime(20);

  // Friendly date qualifier ("Today" if the order was placed today,
  // otherwise the actual date) so a customer who placed an order
  // yesterday but only opens the tracking page now sees the right context.
  const pickupDateLabel = (() => {
    if (!order?.createdAt) return 'Today';
    const created = new Date(order.createdAt);
    const now = new Date();
    const sameDay = created.toDateString() === now.toDateString();
    if (sameDay) return 'Today';
    return created.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  })();

  // Home delivery — a takeaway with `delivery.requested`. Flips the whole
  // tracking page (timeline, details card, instructions, QR) into a
  // delivery-shaped view instead of the counter-pickup one.
  const delivery = (order?.delivery && order.delivery.requested) ? order.delivery : null;
  const isDelivery = !!delivery;
  const deliveryStatus = (delivery?.status || 'pending').toLowerCase();

  const orderTypeLabel = isDelivery ? 'Delivery' : order?.type === 'takeaway' ? 'Takeaway' : 'Dine-in';

  // Refund banner — fires whenever the admin has issued a partial or
  // full refund. Without this the customer's tracking page had no
  // indication that their refund had been processed (paymentStatus
  // flipped to 'Refunded' silently). Picks the latest refunds[] entry
  // for the timestamp and renders the channel (wallet vs original
  // payment method) so the customer knows where to look for the money.
  const refundedAmount = Number(order?.refundedAmount) || 0;
  const refunds = Array.isArray(order?.refunds) ? order.refunds : [];
  const latestRefund = refunds.length
    ? [...refunds].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
    : null;
  const isFullyRefunded = order?.paymentStatus === 'Refunded';
  const showRefundBanner = refundedAmount > 0 || isFullyRefunded;
  const refundChannel = (() => {
    if (latestRefund?.hasGatewayRefund) return 'original payment method';
    if (order?.paymentMethod === 'Wallet') return 'wallet';
    if (order?.paymentMethod === 'cash') return 'cash (collect at counter)';
    return 'wallet';
  })();
  const refundDateLabel = latestRefund?.createdAt
    ? new Date(latestRefund.createdAt).toLocaleString('en-US', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
      })
    : '';

  // Scheduled-takeaway hint — when the customer placed an "order
  // ahead" with pickup hours away, the chef KDS holds the order
  // until ~30 min before pickup. The tracking page swaps the active
  // "Preparing Order" step text for a clearer "Kitchen starts at
  // X PM" message so the customer doesn't see a stuck Pending state.
  const isScheduled = !!order?.isScheduled;
  const kitchenStartLabel = (() => {
    if (!order?.kitchenStartAt) return '';
    const d = new Date(order.kitchenStartAt);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  })();

  // Group items into batches by `addedAt` timestamp. Items placed in
  // the same minute stay in one batch; items added later (when the
  // customer placed a "second order" on the same table → backend
  // auto-appends) form a new batch. This is the customer-facing
  // story for "I placed a 2nd order — track it separately, but show
  // me one final bill". Cheap UX win: group + label, no schema
  // changes required because the backend already stamps addedAt.
  const itemBatches = (() => {
    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) return [];
    // Bucket by addedAt minute (precision is enough — same Place
    // Order tap typically lands within a second).
    const buckets = new Map();
    for (const it of items) {
      const ts = it.addedAt ? new Date(it.addedAt) : (order?.createdAt ? new Date(order.createdAt) : new Date());
      // Round down to the minute as the bucket key
      ts.setSeconds(0, 0);
      const key = ts.toISOString();
      if (!buckets.has(key)) buckets.set(key, { ts, items: [] });
      buckets.get(key).items.push(it);
    }
    // Sort oldest → newest, attach a label
    const arr = Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
    return arr.map((b, idx) => ({
      ...b,
      index: idx + 1,
      label: idx === 0 ? 'Order #1 — Original' : `Order #${idx + 1} — Added later`,
      time: b.ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      subtotal: b.items.reduce((sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0),
      itemCount: b.items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0),
    }));
  })();
  const hasMultipleBatches = itemBatches.length > 1;

  // Derive timeline from real order status
  const currentStatus = (order?.status || 'new').toLowerCase();
  const statusMap = { new: 0, preparing: 1, ready: 2, served: 3, cancelled: -1 };
  const currentStep = statusMap[currentStatus] ?? 0;

  // Counter-only orders (water, packaged ice cream, etc.) skip the chef
  // workflow — the backend saves them as `status: 'ready'` from the
  // start. For the customer's timeline, we collapse the "Preparing
  // Order" step entirely so the chain reads:
  //   Order Placed → Ready for Pickup → Enjoy your meal!
  // That matches what actually happened (no preparation occurred) and
  // avoids a misleading "Preparing — completed" tick on a step that
  // was never entered.
  const isCounterOnly = Array.isArray(order?.items) && order.items.length > 0
    && order.items.every(i => (i?.prepStation || 'kitchen') === 'counter');

  // Format any ISO timestamp to a 12-hour clock label ("08:44 PM").
  // Returns '' for nullish input so unfinished steps stay blank.
  const formatStepTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Each step's timestamp. Order-placed uses createdAt (or paidAt as a
  // fallback for takeaway, which is created post-payment so they're the
  // same moment). Served uses the dedicated `servedAt` field stamped by
  // pickupOrder / updateOrderStatus when the waiter marks the order
  // picked up — falls back to updatedAt for legacy orders saved before
  // the field was added.
  const placedAt = formatStepTime(order?.createdAt || order?.paidAt) || orderTime || '';
  const preparingAt = formatStepTime(order?.preparationStartedAt);
  const readyAt = formatStepTime(order?.preparationCompletedAt);
  const servedAt = currentStatus === 'served'
    ? formatStepTime(order?.servedAt || order?.updatedAt)
    : '';

  // Delivery timeline — kitchen steps then the delivery lifecycle
  // (out-for-delivery → delivered) instead of counter pickup.
  const outForDeliveryAt = formatStepTime(delivery?.outForDeliveryAt);
  const deliveredAt = formatStepTime(delivery?.deliveredAt);
  const isDelivered = deliveryStatus === 'delivered';
  const isOnTheWay = deliveryStatus === 'out-for-delivery';
  const isDispatched = isOnTheWay || deliveryStatus === 'assigned';

  const orderStatus = isDelivery
    ? [
        {
          time: placedAt,
          title: "Order Placed",
          desc: "We've received your order.",
          status: currentStep >= 0 ? "completed" : "pending",
        },
        {
          time: preparingAt,
          title: "Preparing Order",
          desc: "Chefs are preparing your food.",
          status: currentStep > 1 ? "completed" : currentStep === 1 ? "active" : "pending",
        },
        {
          time: outForDeliveryAt,
          title: "Out for Delivery",
          desc: isOnTheWay
            ? `On the way to you${delivery?.partnerName ? ` · ${delivery.partnerName}` : ''}.`
            : isDispatched
              ? "Assigned to a delivery partner."
              : "Your order will be dispatched once it's ready.",
          status: isDelivered ? "completed" : (isDispatched || currentStep >= 2) ? "active" : "pending",
        },
        {
          time: deliveredAt,
          title: isDelivered ? "Delivered" : "Delivery",
          desc: isDelivered ? "Order delivered — enjoy your meal!" : "Waiting to be delivered.",
          status: isDelivered ? "completed" : "pending",
        },
      ]
    : isCounterOnly
    ? [
        {
          time: placedAt,
          title: "Order Placed",
          desc: "We've received your order.",
          status: currentStep >= 0 ? "completed" : "pending",
        },
        {
          time: readyAt || placedAt,
          title: "Ready for Pickup",
          desc: "No preparation needed — please collect it from the counter.",
          status: currentStep > 2 ? "completed" : currentStep >= 0 ? "active" : "pending",
        },
        {
          time: servedAt,
          title: currentStatus === 'served' ? "Served" : "Enjoy your meal!",
          desc: currentStatus === 'served' ? "Your order has been served." : "Waiting to be served.",
          status: currentStep >= 3 ? "completed" : "pending",
        },
      ]
    : [
        {
          time: placedAt,
          title: "Order Placed",
          desc: isScheduled
            ? `Scheduled — pickup at ${pickupTime}.`
            : "We've received your order.",
          status: currentStep >= 0 ? "completed" : "pending",
        },
        {
          time: preparingAt,
          title: "Preparing Order",
          // Scheduled-takeaway: customer ordered hours ahead → chef
          // KDS won't pick this up until ~30 min before pickup. Show
          // the exact start moment so the customer isn't staring at
          // a stuck "preparing" step for two hours.
          desc: isScheduled && currentStep < 1
            ? `Kitchen starts at ${kitchenStartLabel || 'pickup time'}.`
            : "Chefs are preparing your food.",
          status: currentStep > 1 ? "completed" : currentStep === 1 ? "active" : "pending",
        },
        {
          time: readyAt,
          title: "Ready for Pickup",
          desc: "Please collect it from the counter.",
          status: currentStep > 2 ? "completed" : currentStep === 2 ? "active" : "pending",
        },
        {
          time: servedAt,
          title: currentStatus === 'served' ? "Served" : "Enjoy your meal!",
          desc: currentStatus === 'served' ? "Your order has been served." : "Waiting to be served.",
          status: currentStep >= 3 ? "completed" : "pending",
        },
      ];

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#FE8301]" />
      </div>
    );
  }

  if (fetchError || !order) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
        <p className="text-[16px] font-semibold text-gray-700 mb-2">{fetchError || 'Order not found'}</p>
        <p className="text-[13px] text-gray-400 mb-6">We couldn't load your order details.</p>
        <button
          onClick={() => navigate('/customer/orders', { replace: true })}
          className="px-6 py-2.5 bg-[#FE8301] text-white rounded-xl text-[14px] font-semibold active:scale-95 transition-transform"
        >
          Go to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-10 transition-colors duration-200 lg:max-w-3xl mx-auto font-nunito">
      {/* Header */}
      {/* Header — back points explicitly to /customer/orders (not
          navigate(-1)) because this page is typically reached AFTER a
          chain of replace-navigations (Payment → OrderConfirmed →
          OrderTracking). In that case history is already collapsed and
          a -1 would pop back to pre-cart pages like /bill-preview. */}
      <header className="sticky top-0 z-40 bg-white px-4 md:px-8 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/customer/orders', { replace: true })}
          className="p-1 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-transform"
          aria-label="Back to orders"
        >
          <ChevronLeft size={24} className="text-[#1A181B]" />
        </button>
        <h1 className="text-[18px] font-semibold text-[#1A181B]">
          Order ID: {order?.orderId || order?.id || "#TW24876"}
        </h1>
      </header>

      {/* Scheduled-takeaway banner — visible while the order is in
          its "ordered ahead" holding window (chef KDS hides it until
          ~30 min before pickup). Tells the customer the exact moment
          their food will start being prepared so they're not
          confused by the "Preparing" timeline step staying inactive. */}
      {isScheduled && (
        <div className="mx-4 md:mx-8 mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <Clock size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-nunito font-semibold text-amber-800 leading-tight">
              Scheduled order · pickup {pickupTime}
            </p>
            <p className="text-[11px] font-varela text-amber-700 leading-snug mt-0.5">
              The kitchen will start preparing at <span className="font-semibold">{kitchenStartLabel || 'pickup time'}</span> so your food is fresh when you collect it.
            </p>
          </div>
        </div>
      )}

      {/* Degraded-mode banner — shown while the live socket is dropped.
          Polling still runs every 15s, so data isn't frozen, just slower. */}
      {!socketLive && !loading && (
        <div className="mx-4 md:mx-8 mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Live updates paused — reconnecting. Status may be delayed by up to 15 seconds.</span>
        </div>
      )}

      <main className="px-4 md:px-8 space-y-6">
        {/* Refund banner — surfaces admin-issued refunds so the customer
            sees the status change on the same page they're tracking. */}
        {showRefundBanner && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <Check size={18} className="text-emerald-700 stroke-[3]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-nunito font-bold text-emerald-900 leading-tight">
                {isFullyRefunded ? 'Refund processed' : 'Partial refund processed'}
              </p>
              <p className="text-[13px] font-varela text-emerald-800 leading-snug mt-1">
                ₹{refundedAmount.toFixed(2)} has been refunded to your{' '}
                <span className="font-semibold">{refundChannel}</span>
                {refundDateLabel && <> on <span className="font-semibold">{refundDateLabel}</span></>}.
              </p>
              {latestRefund?.reason && (
                <p className="text-[12px] font-varela text-emerald-700 leading-snug mt-1">
                  Reason: {latestRefund.reason}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Order Status Timeline Card */}
        <div className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]">
          <div className="space-y-4">
            {orderStatus.map((step, index) => (
              <div key={index} className="flex relative items-start gap-4">
                {/* Time — wider column so 12-hour timestamps like
                    "08:44 PM" don't wrap. Pending steps render blank,
                    keeping the timeline visually aligned. */}
                <span className="text-[13px] text-[#1A181B] font-medium w-[68px] pt-1 tabular-nums shrink-0">
                  {step.time}
                </span>

                {/* Timeline Node */}
                <div className="flex flex-col items-center">
                  <div className="relative z-10">
                    {step.status === "completed" ? (
                      <div className="w-6 h-6 rounded-full bg-[#FE8301] flex items-center justify-center">
                        <Check size={14} className="text-white stroke-3" />
                      </div>
                    ) : step.status === "active" ? (
                      <div className="relative flex items-center justify-center">
                        {/* Layer 3: Outer Pulse */}
                        <div
                          className="absolute w-6 h-6 rounded-full bg-[#FE8301]/10 animate-pulse-slow"
                          style={{ animationDelay: "0s" }}
                        ></div>
                        {/* Layer 2: Middle Pulse */}
                        <div
                          className="absolute w-6 h-6 rounded-full bg-[#FE8301]/20 animate-pulse-slow"
                          style={{ animationDelay: "0.6s" }}
                        ></div>
                        {/* Layer 1: Inner Pulse */}
                        <div
                          className="absolute w-6 h-6 rounded-full bg-[#FE8301]/30 animate-pulse-slow"
                          style={{ animationDelay: "1.2s" }}
                        ></div>
                        {/* Core with Checkmark */}
                        <div className="w-6 h-6 rounded-full bg-[#FE8301] flex items-center justify-center relative z-10 shadow-[0_0_10px_rgba(254,131,1,0.5)]">
                          <Check size={14} className="text-white stroke-3" />
                        </div>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-gray-200 bg-white" />
                    )}
                  </div>
                  {index < orderStatus.length - 1 && (
                    <div
                      className={`w-0.5 h-12 -my-1 ${step.status === "completed" || step.status === "active"
                          ? "bg-[#FE8301]"
                          : "bg-gray-100"
                        }`}
                    />
                  )}
                </div>

                {/* Status Text */}
                <div className="pt-0.5">
                  <h3
                    className={`text-[15px] font-semibold mb-0.5 ${step.status === "pending" ? "text-gray-900" : "text-[#1A181B]"}`}
                  >
                    {step.title}
                  </h3>
                  <p className="text-[12px] text-gray-400 font-varela leading-tight">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Multi-batch order summary — shown only when the customer
            placed additional items on the same active order. Each
            batch reads as a "sub-order" with its own Placed-at time
            so the customer can mentally track each separately even
            though it's one bill at the end. */}
        {hasMultipleBatches && (
          <div className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]">
            <div className="flex items-baseline justify-between mb-4 gap-2">
              <h2 className="text-[18px] font-bold text-[#1A181B]">
                Your Orders
              </h2>
              <span className="text-[11px] font-varela text-[#8D848F]">
                {itemBatches.length} batches · single bill
              </span>
            </div>
            <p className="text-[12px] font-varela text-[#645E66] mb-4 leading-snug">
              You added items in {itemBatches.length} batches. The kitchen prepares them in order — your final bill combines everything below.
            </p>
            <div className="space-y-3">
              {itemBatches.map((batch) => (
                <div key={batch.ts.toISOString()} className="border border-[#F2F2F2] rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-nunito font-semibold text-[#1A181B]">
                        {batch.label}
                      </p>
                      <p className="text-[11px] font-varela text-[#8D848F] mt-0.5">
                        Placed at {batch.time} · {batch.itemCount} {batch.itemCount === 1 ? 'item' : 'items'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-nunito font-semibold uppercase tracking-wide text-[#FE8301] bg-[#FFF9F2] px-2 py-0.5 rounded-full">
                      {currentStatus === 'served' ? 'Served'
                        : currentStatus === 'ready' ? 'Ready'
                        : currentStatus === 'preparing' ? 'Preparing'
                        : currentStatus === 'cancelled' ? 'Cancelled'
                        : 'Placed'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {batch.items.map((it, idx) => {
                      const qty = Number(it.quantity) || 1;
                      const unitPrice = Number(it.price) || 0;
                      return (
                        <div key={idx} className="flex justify-between text-[13px] font-varela text-[#1A181B]">
                          <span className="truncate min-w-0 mr-2">
                            <span className="text-[#645E66]">{qty}× </span>
                            {it.name}
                          </span>
                          <span className="tabular-nums shrink-0">₹{(unitPrice * qty).toFixed(2)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-3 border-t border-dashed border-[#EEEEEE] flex justify-between items-center">
                    <span className="text-[12px] font-varela text-[#8D848F]">Batch subtotal</span>
                    <span className="text-[13px] font-nunito font-semibold text-[#1A181B] tabular-nums">
                      ₹{batch.subtotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] font-varela text-[#027A48] mt-4 text-center bg-[#ECFDF3] border border-[#ABEFC6] rounded-lg py-2">
              💡 One combined bill on payment — no need to settle each batch separately
            </p>
          </div>
        )}

        {/* Pickup / Delivery Details Card */}
        <div className="bg-white rounded-[24px] border border-gray-100 p-6 space-y-5 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold text-[#1A181B]">
              {isDelivery ? 'Delivery Details' : 'Pickup Details'}
            </h2>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#FE8301] bg-[#FFF9F2] px-2.5 py-1 rounded-full">
              {orderTypeLabel}
            </span>
          </div>

          <div className="space-y-4">
            {/* First row — Delivering To (address) for delivery, else Pickup Time */}
            {isDelivery ? (
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF9F2] flex items-center justify-center shrink-0">
                  <MapPin size={20} className="text-[#FE8301]" />
                </div>
                <div className="pt-1 min-w-0">
                  <h4 className="text-[15px] font-semibold text-[#1A181B]">Delivering To</h4>
                  <p className="text-[14px] text-gray-500 font-varela leading-snug">
                    {delivery?.address || 'Address on file'}
                  </p>
                  {(delivery?.slab?.fromKm != null || delivery?.fee > 0) && (
                    <p className="text-[12px] text-gray-400 font-varela mt-0.5">
                      {delivery?.slab?.fromKm != null ? `${delivery.slab.fromKm}–${delivery.slab.toKm} km` : ''}
                      {delivery?.fee > 0 ? `${delivery?.slab?.fromKm != null ? ' · ' : ''}Delivery ₹${Number(delivery.fee).toFixed(0)}` : ''}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF9F2] flex items-center justify-center shrink-0">
                  <Calendar size={20} className="text-[#FE8301]" />
                </div>
                <div className="pt-1">
                  <h4 className="text-[15px] font-semibold text-[#1A181B]">
                    Pickup Time
                  </h4>
                  <p className="text-[14px] text-gray-500 font-varela">
                    {pickupDateLabel}, {pickupTime}
                  </p>
                </div>
              </div>
            )}

            {/* Delivery partner — only when assigned */}
            {isDelivery && delivery?.partnerName && (
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF9F2] flex items-center justify-center shrink-0">
                  <span className="text-[20px] leading-none">🛵</span>
                </div>
                <div className="pt-1 min-w-0">
                  <h4 className="text-[15px] font-semibold text-[#1A181B]">Delivery Partner</h4>
                  <p className="text-[14px] text-gray-500 font-varela">{delivery.partnerName}</p>
                </div>
              </div>
            )}

            {/* Location — restaurant the order is coming FROM (delivery) or
                pickup point. Branch name only renders when distinct from the
                cafe name so single-location tenants don't see "Foo / Foo". */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF9F2] flex items-center justify-center shrink-0">
                <MapPin size={20} className="text-[#FE8301]" />
              </div>
              <div className="pt-1 min-w-0">
                <h4 className="text-[15px] font-semibold text-[#1A181B]">
                  {isDelivery ? 'From' : 'Location'}
                </h4>
                {(cafeName || branchName) && (
                  <p className="text-[14px] font-semibold text-[#1A181B] font-nunito">
                    {cafeName || branchName}
                    {cafeName && branchName && branchName !== cafeName && (
                      <span className="text-gray-500 font-varela font-normal">
                        {' '}— {branchName}
                      </span>
                    )}
                  </p>
                )}
                <p className="text-[14px] text-gray-500 font-varela leading-snug">
                  {pickupAddress || 'Address coming soon…'}
                </p>
              </div>
            </div>

            {/* Contact */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#FFF9F2] flex items-center justify-center shrink-0">
                <Phone size={20} className="text-[#FE8301]" />
              </div>
              <div className="pt-1">
                <h4 className="text-[15px] font-semibold text-[#1A181B]">
                  Contact
                </h4>
                {pickupContact ? (
                  <a
                    href={`tel:${pickupContact}`}
                    className="text-[14px] text-[#FE8301] font-varela font-semibold hover:underline"
                  >
                    {pickupContact}
                  </a>
                ) : (
                  <p className="text-[14px] text-gray-400 font-varela italic">
                    Not available
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Important Instructions Section */}
        <div className="bg-[#FAF5FF] rounded-[24px] p-6 space-y-4 border border-purple-50">
          <h2 className="text-[18px] font-bold text-[#1A181B]">
            Important Instructions
          </h2>
          <ul className="space-y-3">
            {(isDelivery
              ? [
                  "Keep your phone reachable — our delivery partner may call you on arrival",
                  "Track this page for live updates on your order's status",
                  "You'll be notified when your order is out for delivery",
                  `For any issues, contact us at ${pickupContact || 'the restaurant'}`,
                ]
              : [
                  "Please arrive at the pickup location 5 minutes before your selected time",
                  "Show your Order ID or QR code to the staff at the pickup counter",
                  "You'll receive a notification when your order is ready",
                  `For any issues, contact us at ${pickupContact || 'the restaurant'}`,
                ]
            ).map((instruction, i) => (
              <li
                key={i}
                className="flex gap-3 text-[14px] text-gray-500 font-varela leading-tight"
              >
                <span className="text-[20px] leading-none pt-1">•</span>
                <span>{instruction}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Pickup QR Card — pinned to the bottom of the page so it's the
            last thing the customer scrolls to before showing it at the
            counter. Mirrors the QR from OrderConfirmed; takeaway only,
            since dine-in orders are served at the table. */}
        {order?.type === 'takeaway' && !isDelivery && (order?.orderId || order?.id) && (
          <div className="bg-white rounded-[24px] border border-gray-100 p-6 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07),0_10px_20px_-2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-4">
              <div className="min-w-0">
                <h2 className="text-[18px] font-bold text-[#1A181B]">
                  Pickup QR
                </h2>
                <p className="text-[12px] text-[#8D848F] font-varela mt-0.5">
                  Show this at the pickup counter.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[#FE8301] bg-[#FFF9F2] px-3 py-1.5 rounded-full">
                <Clock size={13} />
                <span className="tabular-nums">{pickupTime}</span>
              </div>
            </div>
            <div className="flex flex-col items-center py-2">
              <div className="p-4 bg-white border border-[#EEEEEE] rounded-2xl">
                <QRCodeSVG
                  value={String(order?.orderId || order?.id || '')}
                  size={180}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#101828"
                />
              </div>
              <span className="mt-3 text-[13px] font-varela text-[#1A181B] tabular-nums">
                Order ID:{' '}
                <span className="font-nunito font-semibold">
                  #{order?.orderId || order?.id}
                </span>
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default OrderTracking;
