import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  Search,
  Star,
  X,
  XCircle,
  Sliders,
  Check,
  Banknote,
  Loader2,
} from "lucide-react";

import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../Context/AuthContext";
import { useCart } from "../../Context/CartContext";
import { useMenu } from "../../Context/MenuContext";
import api, { settingsAPI } from "../../utils/api";
import useSocketEvent from "../../hooks/useSocketEvent";
import { joinRoom } from "../../utils/socket";
import toast from "react-hot-toast";
import BottomNav from "../../Components/Loggedin/BottomNav";
import VoiceSearchButton from "../../Components/Loggedin/VoiceSearchButton";
import NoOrderImg from "/noordersicon.svg";
import CancelOrderIcon from "/cancelOrder.svg";
import { billFromOrder, toTaxConfig } from '../../utils/billing';
import { sizedImage } from '../../utils/image';
import { markDineInBillSettled } from '../../utils/dineInSession';
import useCustomerSession from '../../hooks/useCustomerSession';
import {
  CUSTOMER_ORDERS_ROOT,
  getCustomerOrderSession,
  readRecoveryOrderIds,
  rememberOrderIds,
  forgetOrderIds,
} from '../../utils/customerOrderIds';

// ─── Standalone localStorage helpers ─────────────────────────────────────────

function getTableNumber() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get("table");
    if (table) {
      localStorage.setItem("tableNumber", table);
      return table;
    }
    const dt = localStorage.getItem("dineInTable");
    if (dt) {
      const parsed = JSON.parse(dt);
      if (parsed.name) return parsed.name;
    }
    return localStorage.getItem("tableNumber") || null;
  } catch {
    return null;
  }
}

// Helper: map backend order status to customer-friendly display status
function mapOrderStatus(status) {
  switch (status) {
    case 'served': return 'Delivered';
    case 'new': return 'Order Placed';
    case 'cancelled': return 'Cancelled';
    case 'preparing': return 'Preparing';
    case 'ready': return 'Ready';
    default: return status; // return as-is if already mapped
  }
}

// Order Card Component - Memoized to prevent lag during state updates
const OrderCard = React.memo(
  ({
    order,
    onRepeatOrder,
    onRate,
    rating,
    onCancel,
    isCancelled,
    allowCancellation = true,
    onClick,
    onTrack,
  }) => (
    <div
      onClick={() => onClick && onClick(order)}
      className="bg-white rounded-2xl p-4 shadow-sm border mb-4 cursor-pointer"
      style={{
        border: "0.5px solid #DDDDDD",
        boxShadow: "2px 4px 4px 0px #7020830F",
      }}
    >
      {/* Order header: date + status pill */}
      <div className="flex items-start justify-between mb-3 gap-2">
        <span className="text-[#645E66] text-[12px] font-regular font-varela">
          {order.formattedDate}
        </span>
        {!isCancelled && (
          <span
            className={`flex items-center gap-1 text-[11px] sm:text-[12px] font-varela regular px-2 py-1 rounded-[60px] shrink-0 leading-[14px] ${
              order.status === "Order Placed"
                ? "text-[#FFA601] bg-[#FFEFD0]"
                : order.status === "Preparing"
                ? "text-[#007AFF] bg-[#E5F2FF]"
                : order.status === "Ready"
                ? "text-[#FF6B00] bg-[#FFF3E6]"
                : "text-[#34C759] bg-[#E5FFEB]"
            }`}
          >
            <span className="pt-[1px]">
              <i
                className={`fi ${
                  order.status === "Order Placed"
                    ? "fi-rr-clock-three"
                    : order.status === "Preparing"
                    ? "fi-rr-flame"
                    : order.status === "Ready"
                    ? "fi-rr-bell-ring"
                    : "fi-rr-check-circle"
                }`}
              />
            </span>
            {order.status}
          </span>
        )}
      </div>

      {/* Items list — one row per dish */}
      <div className="space-y-3">
        {(order.items || []).map((item, idx) => {
          const qty = item.quantity || 1;
          const unitPrice = parseFloat(item.unitPrice || item.price || 0);
          const lineTotal = unitPrice * qty;
          return (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-[56px] h-[56px] rounded-[10px] overflow-hidden shrink-0 bg-[#F7F7F7]">
                {item.image ? (
                  <img
                    src={sizedImage(item.image, { w: 56 })}
                    alt={item.title || item.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[#1A181B] truncate text-[14px] sm:text-[15px] font-nunito leading-[20px]">
                  {item.title || item.name}
                </h3>
                <span className="text-[11px] text-[#8D848F] bg-[#F7F7F7] px-2 py-[2px] rounded-[6px] font-varela mt-1 inline-block leading-[14px]">
                  Qty: {qty}
                </span>
              </div>
              <span className="text-[13px] text-[#1A181B] font-varela shrink-0 tabular-nums">
                ₹{lineTotal.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Order total */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#F7F7F7]">
        <span className="text-[13px] text-[#645E66] font-varela">Order Total</span>
        <span className="text-[16px] font-nunito font-semibold text-[#1A181B] tabular-nums">
          ₹{parseFloat(order.total ?? 0).toFixed(2)}
        </span>
      </div>

      {isCancelled && (
        <div className="pt-3.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-[#FF4B4B] flex items-center justify-center shrink-0">
              <X size={12} className="text-white" />
            </div>
            <span className="text-[#FF5F4A] text-[12px] font-varela leading-[14px]">
              Your order has been cancelled successfully.
            </span>
          </div>

          {/* Refund status — derived from the order's payment + refund
              fields. Shows a contextual pill so the customer knows where
              their money is (wallet, card refund in progress, counter
              pickup, or — rare — manual review). */}
          {(() => {
            const paid  = Number(order.amountPaid || 0);
            const back  = Number(order.refundedAmount || 0);
            const wasPaid = (order.paymentStatus === 'Paid' || order.paymentStatus === 'Refunded') && paid > 0;
            if (!wasPaid) return null;

            const method  = (order.paymentMethod || '').toLowerCase();
            const fullyRefunded = back > 0 && back >= paid;
            const partiallyRefunded = back > 0 && back < paid;
            const awaitingRefund = back === 0;

            let tone = 'bg-[#E5FFEB] text-[#2E7D32] border border-[#BBF2C2]';
            let icon = 'fi-rr-check-circle';
            let label;
            if (fullyRefunded) {
              if (method === 'wallet' || order.refundMode === 'wallet') {
                label = `Refunded ₹${back.toFixed(0)} to your wallet`;
                icon  = 'fi-rr-wallet';
              } else if (method === 'online' || order.razorpayPaymentId) {
                label = `Refunded ₹${back.toFixed(0)} to original payment (5-7 business days)`;
                icon  = 'fi-rr-credit-card';
              } else {
                label = `Refund ₹${back.toFixed(0)} — collect at the counter`;
                icon  = 'fi-rr-money-bill-wave';
                tone  = 'bg-[#FFF3E6] text-[#B45309] border border-[#FFE3BE]';
              }
            } else if (partiallyRefunded) {
              label = `Partially refunded ₹${back.toFixed(0)} of ₹${paid.toFixed(0)}`;
              icon  = 'fi-rr-info';
              tone  = 'bg-[#FFF3E6] text-[#B45309] border border-[#FFE3BE]';
            } else if (awaitingRefund) {
              // ADM-049 — cancellation no longer auto-refunds. While
              // refundedAmount stays 0, the request is sitting in the
              // admin's Pending Refunds queue waiting for approval.
              label = `Refund of ₹${paid.toFixed(0)} requested — pending admin approval`;
              icon  = 'fi-rr-hourglass-end';
              tone  = 'bg-[#FFF8E1] text-[#92400E] border border-[#FDE68A]';
            }

            return (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[10px] text-[11px] font-varela leading-[14px] ${tone}`}>
                <i className={`fi ${icon} text-[12px]`} />
                <span>{label}</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Action Buttons — one Rate + one Repeat per order */}
      {!isCancelled &&
        order.status !== "Order Placed" &&
        order.status !== "Paid" && (
          <div className="flex items-center justify-between pt-3 border-t border-[#F7F7F7] mt-4 gap-3">
            {rating ? (
              <div className="flex items-center gap-[6px] h-[40px] px-3">
                <Star size={18} className="text-[#FFCC00] fill-[#FFCC00]" />
                <span className="text-[16px] font-varela text-[#007AFF] leading-[16px] mt-1">
                  {rating.toFixed(1)}
                </span>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRate(order.id);
                }}
                className="flex items-center gap-[6px] text-[#007AFF] active:scale-95 transition-transform h-[40px] px-[4px]"
              >
                <Star
                  size={18}
                  className="text-[#007AFF]"
                  strokeWidth={1.5}
                />
                <span className="font-semibold whitespace-nowrap text-[15px] font-nunito">
                  Rate us Now!
                </span>
              </button>
            )}

            {/* No re-ordering once the dine-in visit is settled — the
                parent passes no handler in that phase. */}
            {onRepeatOrder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRepeatOrder(order);
              }}
              className="flex items-center gap-[8px] bg-[#FE8301] text-white rounded-[10px] font-semibold active:scale-95 transition-all h-[40px] px-[20px] justify-center shrink-0 text-[15px]"
            >
              <i className="fi fi-rr-arrows-repeat text-[14px] mt-1"></i>
              <span className="font-nunito font-semibold">Repeat Order</span>
            </button>
            )}
          </div>
        )}

      {/* Track Order — shown for active orders */}
      {!isCancelled && ["Order Placed", "Preparing", "Ready"].includes(order.status) && (
        <div className="pt-3 border-t border-[#F7F7F7] mt-4">
          <button
            onClick={(e) => { e.stopPropagation(); onTrack && onTrack(order.orderId || order.id); }}
            className="w-full py-2.5 rounded-xl font-semibold font-nunito text-[13px] bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <i className="fi fi-rr-route text-[12px] mt-0.5"></i>
            Track Order
          </button>
        </div>
      )}

      {/* Cancel Order Section for Pending status — hidden when admin disables earlyCancellation */}
      {!isCancelled && allowCancellation && order.status === "Order Placed" && (
        <div className="pt-[13px] border-t border-[#F7F7F7] mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-[12px] font-nunito font-semibold text-[#645E66]">
                Cancel Order
              </h4>
              <p className="text-[10px] font-varela font-regular text-[#8D848F]">
                Cancel before the chef starts preparing.
              </p>
            </div>
            <button
              onClick={() => onCancel(order.id)}
              className="px-7 py-2 border border-[#F2F2F2] rounded-[10px] text-[#645E66] font-nunito font-semibold active:scale-95 transition-transform"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  ),
);

// Past Order Summary Card Component
const OrderSummaryCard = React.memo(({ order, onClick, cancelledOrders, taxConfig = null }) => {
  // The whole-order cancellation flag: either the local cancellation map
  // recorded one, or the saved order's status came back as Cancelled.
  // Past orders that were cancelled need a visually distinct card —
  // not the green "served / completed" tick that everything else gets.
  const isCancelledOrder = !!cancelledOrders[order.id] || order.status === "Cancelled";

  const activeItems = order.items
    .map((item, idx) => ({ ...item, compositeId: `${order.id}-${idx}` }))
    .filter((item) => !cancelledOrders[item.compositeId]);

  // Don't filter line items to zero on a fully-cancelled order — we
  // still want to render the card so the customer can see what was
  // refunded. For partial item-level cancellations, falling through
  // to itemCount === 0 keeps the existing "hide entirely" behaviour.
  const renderItems = isCancelledOrder ? order.items.map((item, idx) => ({ ...item, compositeId: `${order.id}-${idx}` })) : activeItems;
  const itemCount = renderItems.reduce((sum, item) => sum + item.quantity, 0);

  // Total — for cancelled orders we show the original billed total
  // (what was refunded is the same number). For non-cancelled past
  // orders we recompute from items so the figure stays consistent
  // even if a single item was cancelled out post-fact.
  // Placed order: the server's stored total wins; billFromOrder only
  // recomputes (with the server's rounding) when there is none.
  const computedTotal = billFromOrder(order, taxConfig, renderItems).total;
  const refundedAmt = Number(order.refundedAmount) || (isCancelledOrder ? computedTotal : 0);

  const time = new Date(order.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (!isCancelledOrder && itemCount === 0) return null; // Don't show if all items were cancelled

  // Short order id for the card header — full id is long ("ORT-260506-3EC772")
  // and dominates the card. Last 6 chars are unique enough to be useful as a
  // visual reference without overwhelming the layout.
  const shortId = String(order.orderId || order.id || "").split("-").pop()?.slice(-6) || "";
  const paymentMethodLabel = (() => {
    const m = String(order.paymentMethod || "").toLowerCase();
    if (m === "wallet") return "Wallet";
    if (m === "mixed") return "Wallet + Online";
    if (m === "online") return "Online";
    if (m === "cash") return "Cash";
    return null;
  })();

  return (
    <div
      onClick={() => onClick(order)}
      className={`rounded-2xl p-4 border mb-3 cursor-pointer transition-all hover:shadow-[0_4px_15px_-6px_rgba(0,0,0,0.08)] ${
        isCancelledOrder
          ? "bg-[#FFF5F5] border-[#FCE7E7]"
          : "bg-white border-[#F2F1FA]"
      }`}
    >
      {/* Top row — icon, items, status pill */}
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          isCancelledOrder ? "bg-[#FFE2E2]" : "bg-[#E5FFEB]"
        }`}>
          {isCancelledOrder
            ? <XCircle size={22} className="text-[#EF4F5F]" />
            : <Check size={22} className="text-[#34C759]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className={`font-nunito font-semibold text-[14px] sm:text-[15px] truncate ${
              isCancelledOrder ? "text-[#645E66] line-through" : "text-[#101828]"
            }`}>
              {renderItems.map(i => i.title || i.name).join(", ")}
            </h3>
            <span className={`shrink-0 text-[10px] font-nunito font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
              isCancelledOrder
                ? "text-[#EF4F5F] bg-[#FFE2E2]"
                : "text-[#027A48] bg-[#E5FFEB]"
            }`}>
              {isCancelledOrder ? "Cancelled" : "Delivered"}
            </span>
          </div>
          <p className="font-varela text-[11px] sm:text-[12px] text-[#8D848F]">
            #{shortId} <span className="mx-1">•</span>
            {itemCount} {itemCount > 1 ? "items" : "item"} <span className="mx-1">•</span> {time} <span className="mx-1">•</span>
            <span className={`${order.isTakeaway ? 'text-orange-500' : 'text-blue-500'}`}>
              {order.isTakeaway ? "Takeaway" : "Dine-in"}
            </span>
          </p>
        </div>
      </div>

      {/* Bottom row — total + payment method + refund info */}
      <div className="mt-3 pt-3 border-t border-dashed border-[#F0F0F0] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {paymentMethodLabel && !isCancelledOrder && (
            <span className="text-[11px] font-nunito font-medium text-[#645E66] bg-[#F7F7F7] px-2 py-0.5 rounded-full">
              {paymentMethodLabel}
            </span>
          )}
          {isCancelledOrder && refundedAmt > 0 && (
            <span className="text-[11px] font-nunito font-medium text-[#027A48] bg-[#E5FFEB] px-2 py-0.5 rounded-full">
              ₹{Math.round(refundedAmt).toLocaleString()} refunded
            </span>
          )}
        </div>
        <span className={`font-nunito font-bold text-[15px] sm:text-[16px] tabular-nums whitespace-nowrap shrink-0 ${
          isCancelledOrder ? "text-[#8D848F] line-through" : "text-[#101828]"
        }`}>
          ₹{computedTotal.toLocaleString()}
        </span>
      </div>
    </div>
  );
});

// Empty State Component
const EmptyState = ({ onBrowse, image }) => (
  <div className="flex flex-col items-center justify-center pt-10 px-6 animate-fadeIn">
    <div className="mb-2">
      <img
        src={image}
        style={{ width: "182px" }}
        alt="No Orders"
        className="animate-scaleIn"
      />
    </div>
    <h2 className="text-[20px] font-nunito font-semibold text-[#101828] mb-2">
      No Orders Yet!
    </h2>
    <p className="text-center font-varela text-[#8D848F] text-[14px] mb-8 max-w-[240px] font-regular">
      You haven't ordered anything yet. Place your first order.
    </p>
    <button
      onClick={onBrowse}
      className="w-full h-[48px] max-w-[280px] bg-[#FE8301] text-white py-4 rounded-xl font-nunito font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
    >
      <i className="fi fi-rr-holding-hand-dinner text-xl mt-1"></i> Browse Menu
    </button>
  </div>
);

// Order Confirmation View for Takeaway
const OrderConfirmationView = ({ orderData, onTrack, onOpenQR, taxConfig = null }) => {
  const items = orderData?.items || [];
  const itemCount = items.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  // Historical order: show what the server actually charged (stored
  // breakdown + total). billFromOrder falls back to computeBill with the
  // live tax config only for legacy orders that carry no breakdown.
  const bill = billFromOrder(orderData, taxConfig);
  const { subtotal, gst, gstPct, serviceCharge, serviceChargePct: servicePct } = bill;
  const computedAdditionalCharges = bill.additionalCharges;
  const discount = Number(orderData?.couponDiscount) || 0;
  const couponCode = orderData?.couponCode || "";
  const tip = Number(orderData?.tipAmount) || 0;
  const walletAmountPaid = Number(orderData?.walletAmountPaid) || 0;
  const totalPayment = bill.total;
  const amountPaid = Number(orderData?.amountPaid) || totalPayment;
  const razorpayPortion = Math.max(0, Math.round((amountPaid - walletAmountPaid) * 100) / 100);
  const paymentMethod = orderData?.paymentMethod || "online";
  const paymentMethodLabel = (() => {
    if (paymentMethod === "wallet") return "Wallet";
    if (paymentMethod === "mixed") return "Wallet + Online";
    if (paymentMethod === "online") return "Online (UPI / Card)";
    if (paymentMethod === "cash") return "Cash at Counter";
    return paymentMethod;
  })();
  const pickupTime = orderData?.pickupTime || orderData?.selectedTime;

  return (
    <div className="flex flex-col items-center animate-fadeIn">
      {/* Success Icon */}
      <div className="flex flex-col items-center pt-4 pb-4">
        <div className="w-16 h-16 bg-[#34C759] rounded-full flex items-center justify-center mb-4">
          <Check size={32} className="text-white" strokeWidth={3} />
        </div>
        <h2 className="text-[24px] font-bold text-[#1A181B] mb-2 font-nunito">
          Order Confirmed!
        </h2>
        <p className="text-[14px] text-[#645E66] text-center max-w-[280px] font-varela leading-[20px]">
          Thank you! Your takeaway order has been placed successfully.
        </p>
      </div>

      {/* Order Summary Card */}
      <div className="w-full bg-white rounded-[24px] border border-[#F2F2F2] p-5 shadow-[0_2px_15px_-3px_rgba(0,0,0,0.05)] mb-6">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-[18px] font-bold text-[#1A181B] font-nunito">
            Order Summary
          </h3>
          <span className="text-[12px] font-varela text-[#8D848F]">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Pickup time pill */}
        {pickupTime && (
          <div className="mb-4 flex items-center gap-2 bg-[#FFF9F2] border border-[#FFE9D1] rounded-xl px-3 py-2">
            <span className="text-[12px] font-varela text-[#1A181B]">
              🕐 Pickup at <span className="font-nunito font-semibold">{pickupTime}</span>
            </span>
          </div>
        )}

        <div className="space-y-4 mb-6">
          {items.map((item, index) => {
            const qty = Number(item.quantity) || 1;
            const unitPrice = Number(item.price ?? item.unitPrice) || 0;
            const lineTotal = unitPrice * qty;
            // Build a real customisation line from the order doc instead
            // of a hardcoded "Regular with extra lettuce" placeholder.
            const sizeLabel = Array.isArray(item.selectedSizes) && item.selectedSizes[0]?.name
              ? item.selectedSizes[0].name
              : "";
            const toppingsLabel = Array.isArray(item.selectedToppings) && item.selectedToppings.length
              ? item.selectedToppings.map(t => t?.name).filter(Boolean).join(", ")
              : "";
            const customisation = [sizeLabel, toppingsLabel, item.instructions, item.desc]
              .filter(Boolean)
              .join(" · ");
            return (
              <div key={index} className="flex gap-4">
                <div className="w-[68px] h-[68px] rounded-[12px] overflow-hidden shrink-0 bg-[#F7F7F7]">
                  {item.image ? (
                    <img
                      src={sizedImage(item.image, { w: 68 })}
                      alt={item.title || item.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[15px] font-semibold text-[#1A181B] truncate mb-0.5 font-nunito leading-[22px]">
                    {item.title || item.name}
                  </h4>
                  {customisation && (
                    <p className="text-[13px] text-[#645E66] font-varela mb-1 line-clamp-1">
                      {customisation}
                    </p>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-[#8D848F] bg-[#F7F7F7] px-2 py-0.5 rounded-lg font-varela">
                      Qty: {qty} · ₹{unitPrice.toFixed(2)}
                    </span>
                    <span className="text-[14px] font-semibold text-[#1A181B] font-varela tabular-nums">
                      ₹{lineTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bill ledger — subtotal first, taxes, discount, then Total
            at the bottom (the previous layout put Total at the top with
            taxes underneath, which made the math look wrong). */}
        <div className="pt-4 border-t border-[#F2F2F2] space-y-2">
          <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
            <span>Subtotal</span>
            <span className="tabular-nums">₹{subtotal.toFixed(2)}</span>
          </div>
          {gstPct > 0 && (
            <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
              <span>GST ({gstPct}%)</span>
              <span className="tabular-nums">₹{parseFloat(gst).toFixed(2)}</span>
            </div>
          )}
          {servicePct > 0 && (
            <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
              <span>Service Charge ({servicePct}%)</span>
              <span className="tabular-nums">₹{parseFloat(serviceCharge).toFixed(2)}</span>
            </div>
          )}
          {computedAdditionalCharges.map((c, i) => (
            <div key={c.name || i} className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
              <span>{c.name}{c.type === 'Percentage' ? ` (${c.value}%)` : ''}</span>
              <span className="tabular-nums">₹{c.amount.toFixed(2)}</span>
            </div>
          ))}
          {tip > 0 && (
            <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
              <span>Tip</span>
              <span className="tabular-nums">₹{tip.toFixed(2)}</span>
            </div>
          )}
          {discount > 0 && (
            <div className="flex justify-between items-center text-[14px] text-[#027A48] font-varela">
              <span>Coupon{couponCode ? ` (${couponCode})` : ""}</span>
              <span className="tabular-nums">-₹{discount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 mt-1 border-t border-dashed border-[#EEEEEE]">
            <span className="text-[16px] font-bold text-[#1A181B] font-nunito">
              Total Payment
            </span>
            <span className="text-[16px] font-bold text-[#1A181B] font-nunito tabular-nums">
              ₹{parseFloat(totalPayment).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment Breakdown — split-rail receipt. Shown when there's a
            wallet portion so the customer sees how the rails combined. */}
        {walletAmountPaid > 0 ? (
          <div className="mt-3 pt-3 border-t border-dashed border-[#EEEEEE] space-y-2">
            <p className="text-[12px] font-nunito font-semibold text-[#1A181B]">
              Paid by
            </p>
            <div className="flex justify-between items-center text-[13px] text-[#027A48] font-varela">
              <span>From Wallet</span>
              <span className="tabular-nums">₹{walletAmountPaid.toFixed(2)}</span>
            </div>
            {razorpayPortion > 0 && (
              <div className="flex justify-between items-center text-[13px] text-[#1A181B] font-varela">
                <span>Online (Razorpay)</span>
                <span className="tabular-nums">₹{razorpayPortion.toFixed(2)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-dashed border-[#EEEEEE] flex justify-between items-center">
            <span className="text-[12px] font-varela text-[#8D848F]">Paid via</span>
            <span className="text-[12px] font-nunito font-semibold text-[#1A181B]">
              {paymentMethodLabel}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="w-full flex gap-4 mb-6">
        <button
          onClick={onTrack}
          className="flex-1 h-[48px] bg-[#FE8301] text-white rounded-[12px] font-bold font-nunito flex items-center justify-center active:scale-95 transition-transform"
        >
          Track Order
        </button>
        <button
          onClick={onOpenQR}
          className="flex-1 h-[48px] bg-[#F2F2F2] text-[#645E66] rounded-[12px] font-bold font-nunito flex items-center justify-center active:scale-95 transition-transform"
        >
          Open QR
        </button>
      </div>

      {/* Important Instructions Card */}
      <div className="w-full bg-[#FAF5FF] rounded-[24px] p-6 space-y-4 border border-[#F2E7FF]">
        <h2 className="text-[18px] font-bold text-[#1A181B] font-nunito">
          Important Instructions
        </h2>
        <ul className="space-y-3">
          {[
            "Please arrive at the pickup location 5 minutes before your selected time",
            "Show your Order ID or QR code to the staff at the pickup counter",
            "You'll receive a notification when your order is ready",
            "For any issues, contact us at +911234567890",
          ].map((instruction, i) => (
            <li
              key={i}
              className="flex gap-3 text-[14px] text-[#645E66] font-varela leading-tight"
            >
              <span className="text-[18px] leading-none pt-0.5">•</span>
              <span>{instruction}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// QR Code Modal Component — shows the pickup QR plus an interactive
// rating widget. `orderId` is the customer-facing string id used both
// for encoding in the QR and for the PATCH /orders/:id/rating call.
// `initialRating`/`initialFeedback` pre-fill the stars when the order
// was already rated (users can still re-submit to update).
const QRCodeModal = ({ isOpen, onClose, orderId, initialRating = 0, initialFeedback = '', onRated }) => {
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);
  const [feedback, setFeedback] = useState(initialFeedback);
  const [submitting, setSubmitting] = useState(false);

  // Re-sync when the modal opens for a different order.
  useEffect(() => {
    if (isOpen) {
      setRating(initialRating || 0);
      setFeedback(initialFeedback || '');
      setHoverRating(0);
    }
  }, [isOpen, initialRating, initialFeedback]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!rating) {
      toast.error('Please pick a rating before submitting.');
      return;
    }
    if (!orderId) {
      toast.error('Order not found.');
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/orders/${orderId}/rating`, {
        rating,
        feedback: feedback.trim(),
      });
      toast.success('Thanks for your feedback!');
      onRated?.({ orderId, rating, feedback: feedback.trim() });
      onClose();
    } catch (err) {
      // Backend returns friendly messages — "Order must be served
      // before rating", "Not authorized", etc. Surface them so the
      // user understands why the submit failed.
      const msg = err?.response?.data?.message || 'Failed to submit rating. Please try again.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const displayRating = hoverRating || rating;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="bg-white w-full max-w-[360px] rounded-[32px] p-8 relative flex flex-col items-center animate-scaleIn shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          aria-label="Close"
        >
          <X size={20} className="text-[#645E66]" />
        </button>

        <h3 className="text-[18px] font-bold text-[#1A181B] text-center mb-2 font-nunito">
          Show This QR at Pickup Counter
        </h3>
        <p className="text-[14px] text-[#645E66] text-center mb-6 font-varela leading-[20px]">
          Present this QR code to the staff for quick verification and order
          handover.
        </p>

        {/* QR Code — quickchart.io is the primary, falls back to the
            goqr.me API if quickchart is blocked by a corporate network
            / ad-blocker. onError swaps the src once. */}
        <div className="bg-white p-2 border-2 border-gray-50 rounded-2xl mb-4 w-[196px] h-[196px] flex items-center justify-center">
          {orderId ? (
            <img
              src={`https://quickchart.io/qr?size=180&text=${encodeURIComponent(orderId)}`}
              alt="Order QR Code"
              className="w-[180px] h-[180px]"
              onError={(e) => {
                const fb = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(orderId)}`;
                if (e.target.src !== fb) { e.target.onerror = null; e.target.src = fb; }
              }}
            />
          ) : (
            <span className="text-[12px] text-[#8D848F] text-center font-varela">
              QR will appear<br />once order is placed
            </span>
          )}
        </div>

        <p className="text-[16px] font-medium text-[#8D848F] mb-5 font-nunito">
          Order ID: {orderId || '—'}
        </p>

        {/* Rating Stars — click to set, hover for preview */}
        <p className="text-[13px] text-[#1A181B] font-semibold font-nunito mb-2">
          Rate your order
        </p>
        <div
          className="flex gap-2 mb-4"
          role="radiogroup"
          aria-label="Order rating"
          onMouseLeave={() => setHoverRating(0)}
        >
          {[1, 2, 3, 4, 5].map((s) => {
            const active = s <= displayRating;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={rating === s}
                aria-label={`${s} star${s > 1 ? 's' : ''}`}
                onClick={() => setRating(s)}
                onMouseEnter={() => setHoverRating(s)}
                className="active:scale-90 transition-transform"
              >
                <Star
                  size={28}
                  fill={active ? "#FF9B0B" : "none"}
                  className={active ? "text-[#FF9B0B]" : "text-[#D1D1D1]"}
                />
              </button>
            );
          })}
        </div>

        {/* Optional feedback */}
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value.slice(0, 500))}
          placeholder="Tell us what you loved or what we can improve (optional)"
          rows={2}
          className="w-full mb-5 px-3 py-2 rounded-xl border border-[#E5E5EA] text-[13px] font-varela text-[#1A181B] placeholder-[#8D848F] resize-none focus:outline-none focus:border-[#FE8301]"
        />

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-[52px] bg-[#FE8301] text-white rounded-[16px] font-bold font-nunito flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Submitting…</span>
            </>
          ) : (
            <span>{rating > 0 ? `Submit Rating (${rating}★)` : 'Submit'}</span>
          )}
        </button>
      </div>
    </div>
  );
};

// ─── Server data (#22) ───────────────────────────────────────────────────────
// The order list is SERVER data only. Nothing from localStorage is ever
// rendered — the browser keeps just a list of order IDs for guest recovery
// (see utils/customerOrderIds.js) and each one is re-fetched through an
// ownership-checked endpoint.

// Format a backend order (my-orders / detail / active-list shapes) for
// the cards below.
function formatServerOrder(o) {
  return {
    id: o.orderId || o.id,
    orderId: o.orderId || o.id,
    // Mongo _id kept alongside the display id so handlers like
    // "Repeat Order" can hit endpoints that expect the ObjectId.
    _id: o._id || null,
    timestamp: o.createdAt || new Date().toISOString(),
    status: mapOrderStatus(o.status),
    rawStatus: o.status || '',
    type: o.type || 'dine-in',
    isTakeaway: o.type === 'takeaway',
    total: o.total,
    items: (o.items || []).map(item => ({
      // Keep the menuItem ref so a takeaway repeat can rebuild the cart
      // and route through Cart's payment-first flow. Populated docs
      // come back as objects; raw fetches as ObjectId strings — handle
      // both shapes.
      menuItem: item.menuItem && typeof item.menuItem === 'object'
        ? (item.menuItem._id || null)
        : (item.menuItem || null),
      title: item.name,
      name: item.name,
      price: item.price,
      unitPrice: item.price,
      quantity: item.quantity || 1,
      image: item.image || (item.menuItem && typeof item.menuItem === 'object' ? item.menuItem.image : '') || '',
      selectedSizes: item.selectedSizes || [],
      selectedToppings: item.selectedToppings || [],
      instructions: item.instructions || '',
      addedAt: item.addedAt || null,
    })),
    paymentMethod: o.paymentMethod || 'Cash',
    paymentStatus: o.paymentStatus || 'Pending',
    // Refund tracking — surfaced by backend auto-refund on cancel. We
    // show a pill per order so the customer can see exactly where their
    // money went (wallet credit / gateway refund / cash at counter).
    amountPaid: Number(o.amountPaid || 0),
    refundedAmount: Number(o.refundedAmount || 0),
    razorpayPaymentId: o.razorpayPaymentId || null,
    rating: o.rating || null,
    feedback: o.feedback || '',
    // Bill-breakdown fields for the takeaway confirmation view.
    tipAmount: Number(o.tipAmount) || 0,
    couponCode: o.couponCode || '',
    couponDiscount: Number(o.couponDiscount) || 0,
    walletAmountPaid: Number(o.walletAmountPaid) || 0,
    pickupTime: o.pickupTime || null,
    // Server-stamped tax breakdown (see utils/billing billFromOrder) —
    // the bill views display these instead of re-deriving them.
    gst: o.gst,
    gstPercentage: o.gstPercentage,
    serviceCharge: o.serviceCharge,
    serviceChargePercentage: o.serviceChargePercentage,
    additionalCharges: o.additionalCharges || [],
    additionalChargesTotal: o.additionalChargesTotal,
    manualDiscount: Number(o.manualDiscount) || 0,
    pointsRedeemed: Number(o.pointsRedeemed) || 0,
    deliveryFee: Number(o.deliveryFee ?? o.delivery?.fee) || 0,
    delivery: o.delivery || null,
  };
}

// Orders that can no longer change — safe to reuse from the previous
// fetch instead of re-requesting their detail on every refresh.
function isTerminalOrder(o) {
  if (!o) return false;
  if (o.rawStatus === 'cancelled') return true;
  return o.rawStatus === 'served' && (o.paymentStatus === 'Paid' || o.paymentStatus === 'Refunded');
}

async function fetchOrderDetails(ids) {
  const results = await Promise.allSettled(
    ids.map((id) => api.get(`/orders/${encodeURIComponent(id)}/detail`, { _isBackground: true })),
  );
  const found = [];
  const dead = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.data?.success && r.value.data.order) {
      found.push(r.value.data.order);
    } else if (r.status === 'rejected' && r.reason?.response?.status === 404) {
      // Not this session's order (or gone) — forget the ID.
      dead.push(ids[i]);
    }
  });
  return { found, dead };
}

async function fetchCustomerOrders(session, previous) {
  const byId = new Map();
  const add = (o) => { if (o?.id && !byId.has(o.id)) byId.set(o.id, o); };
  const discovered = [];

  if (session.isLoggedIn) {
    // Throws on failure so React Query keeps the last good list.
    const res = await api.get('/orders/my-orders', { params: { limit: 50 }, _isBackground: true });
    (res.data?.orders || []).map(formatServerOrder).forEach(add);
  } else if (session.tableId) {
    // Guest: every unpaid order of THIS scan session on the table, plus
    // the most recent one including paid (so "Make Payment" can flip to
    // paid after staff settle it at the counter). Both are session-scoped
    // on the server — a previous diner's orders never come back.
    const [list, latest] = await Promise.all([
      api.get(`/orders/active-list/table/${session.tableId}`, { _isBackground: true }),
      api.get(`/orders/active/table/${session.tableId}?includePaid=true`, { _isBackground: true }),
    ]);
    const rows = [...(list.data?.orders || []), ...(latest.data?.order ? [latest.data.order] : [])];
    for (const row of rows) {
      const o = formatServerOrder(row);
      add(o);
      discovered.push(o.id);
    }
  }

  // Recovery IDs (guest takeaway orders, orders placed as a guest before
  // logging in, paid orders that dropped off the active lists).
  const prevById = new Map((previous || []).map((o) => [o.id, o]));
  const missing = [];
  for (const id of readRecoveryOrderIds(session)) {
    if (byId.has(id)) continue;
    const cached = prevById.get(id);
    if (isTerminalOrder(cached)) { add(cached); continue; }
    missing.push(id);
  }
  if (missing.length) {
    const { found, dead } = await fetchOrderDetails(missing);
    found.map(formatServerOrder).forEach(add);
    forgetOrderIds(session, dead);
  }
  rememberOrderIds(session, discovered);

  return [...byId.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, isLoggedIn, isGuest } = useAuth();
  // Cart context — used by the takeaway repeat path to pre-load items
  // and bounce the customer through Cart's payment-first checkout
  // (where pickup time / branch / Razorpay all live) rather than
  // creating an unpaid takeaway order in the DB.
  const { updateQuantity: updateCartQty, clearCart: clearCustomerCart } = useCart();
  // Live menu — used to fall back to a name-based lookup when an old order's
  // line item has no menuItem id (legacy data, mock IDs, etc.) so the takeaway
  // repeat doesn't get blocked by the "removed from the menu" toast unless
  // the item really is gone. Also supplies item thumbnails (order payloads
  // don't carry images).
  const { menuItems } = useMenu();
  const [tableNumber, setTableNumber] = useState(getTableNumber);
  const [orderType, setOrderType] = useState(
    () => localStorage.getItem("orderType") || "dine-in",
  );
  // Settled dine-in visit (bill paid, no fresh QR scan yet): hide the
  // table chip and the Repeat Order action — the visit is over.
  const customerSession = useCustomerSession();

  // Who the list belongs to. Re-read on every render (cheap) — a storage
  // event bumps `storageTick` so a new scan / logout re-keys the query.
  const [, setStorageTick] = useState(0);
  const orderSession = getCustomerOrderSession(user, isLoggedIn);
  const sessionKey = orderSession.key;
  const ordersQueryKey = useMemo(() => [...CUSTOMER_ORDERS_ROOT, sessionKey], [sessionKey]);

  const { data: serverOrders } = useQuery({
    queryKey: ordersQueryKey,
    queryFn: () => fetchCustomerOrders(
      orderSession,
      queryClient.getQueryData(ordersQueryKey),
    ),
    enabled: !!sessionKey,
    staleTime: 10_000,
    // Socket events below refresh instantly; this is only a safety net
    // for dropped events.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Different person / session on this device → drop every other
  // session's cached list so nothing leaks between diners.
  useEffect(() => {
    queryClient.removeQueries({
      queryKey: CUSTOMER_ORDERS_ROOT,
      predicate: (q) => q.queryKey[2] !== sessionKey,
    });
  }, [queryClient, sessionKey]);

  const refreshOrders = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ordersQueryKey }),
    [queryClient, ordersQueryKey],
  );

  // Enrich line items with the live menu's thumbnail.
  const historyOrders = useMemo(() => {
    const list = serverOrders || [];
    if (!menuItems?.length) return list;
    const imgById = new Map();
    const imgByName = new Map();
    for (const m of menuItems) {
      const img = m?.image;
      if (!img) continue;
      if (m._id || m.id) imgById.set(String(m._id || m.id), img);
      const n = String(m.name || m.title || '').trim().toLowerCase();
      if (n && !imgByName.has(n)) imgByName.set(n, img);
    }
    return list.map((o) => ({
      ...o,
      items: o.items.map((it) => (it.image ? it : {
        ...it,
        image: imgById.get(String(it.menuItem || '')) || imgByName.get(String(it.name || '').trim().toLowerCase()) || '',
      })),
    }));
  }, [serverOrders, menuItems]);

  const [taxConfig, setTaxConfig] = useState(() => toTaxConfig(null));
  const [allowCancellation, setAllowCancellation] = useState(true);

  // Fetch tax settings and cancellation toggle
  useEffect(() => {
    settingsAPI.getSettings().then(res => {
      if (res.data) {
        const taxes = res.data.taxes;
        if (taxes) setTaxConfig(toTaxConfig(taxes));
        if (res.data.notifications?.earlyCancellation === false) {
          setAllowCancellation(false);
        }
      }
    }).catch(() => {});
  }, []);

  // Guest: when the table's latest dine-in order flips to Paid (admin /
  // waiter / Razorpay settled it), stamp `guest_bill_paid_at` so the Bill
  // page's exit banner + auto-exit countdown fires for guests who didn't
  // pay from their own device.
  useEffect(() => {
    if (isLoggedIn || !serverOrders?.length) return;
    const latestDineIn = serverOrders.find((o) => !o.isTakeaway && o.rawStatus !== 'cancelled');
    if (latestDineIn?.paymentStatus === 'Paid' && !localStorage.getItem('guest_bill_paid_at')) {
      try { localStorage.setItem('guest_bill_paid_at', Date.now().toString()); } catch { /* ignore */ }
      // Session complete — hide table chrome + ordering controls.
      markDineInBillSettled();
    }
  }, [isLoggedIn, serverOrders]);

  // Live payment / status sync — when admin, waiter, or Razorpay flips
  // paymentStatus to 'Paid' (or any other order transition), the server
  // fires `order:updated` on the owner's userId room. We listen here and
  // refetch so the "Make Payment" button flips to "✓ Paid" instantly.
  // Join every known active order room too, so dine-in customer flows
  // that authenticate AFTER placing the order still receive events.
  useEffect(() => {
    const activeIds = (historyOrders || [])
      .filter(o => ['Order Placed', 'Preparing', 'Ready', 'Delivered'].includes(o.status))
      .map(o => o.orderId || o.id)
      .filter(Boolean);
    for (const oid of activeIds) {
      try { joinRoom(`order:${oid}`); } catch { /* noop */ }
    }
  }, [historyOrders]);

  // Socket listeners — instant refresh on payment / status changes.
  useSocketEvent('order:updated', refreshOrders);
  useSocketEvent('order:appended', refreshOrders);

  // Another screen placed an order / a new scan or logout changed the
  // session: re-read table + type and refetch (the query re-keys itself
  // if the session changed).
  useEffect(() => {
    const RELEVANT_KEYS = new Set([
      null, "cafe_orders_v2", "customer_order_ids_v1", "scanToken", "dineInTable", "orderType",
      "tableNumber", "cafeUser", "isGuest",
    ]);
    function onStorageChange(e) {
      // Cross-tab `storage` fires for every key (cart edits included) —
      // only session / order related ones matter here.
      if (e?.type === "storage" && !RELEVANT_KEYS.has(e.key)) return;
      setTableNumber(localStorage.getItem("tableNumber"));
      setOrderType(localStorage.getItem("orderType") || "dine-in");
      setStorageTick((t) => t + 1);
      queryClient.invalidateQueries({ queryKey: CUSTOMER_ORDERS_ROOT });
    }
    const events = ["storage", "storage_sync", "guestSessionChange"];
    events.forEach((e) => window.addEventListener(e, onStorageChange));
    return () => events.forEach((e) => window.removeEventListener(e, onStorageChange));
  }, [queryClient]);

  const [searchQuery, setSearchQuery] = useState("");

  const [activeTab, setActiveTab] = useState(
    location.state?.activeTab || "today",
  ); // 'today' or 'past'
  const [showConfirmation, setShowConfirmation] = useState(
    !!location.state?.showConfirmation,
  );
  const confirmationOrderData = location.state?.orderData;
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingOrderId, setRatingOrderId] = useState(null);
  const [selectedRating, setSelectedRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [localRatings, setOrderRatings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("order_ratings") || "{}") || {}; } catch { return {}; }
  });
  // Server ratings are authoritative; a rating just submitted on this
  // device shows immediately until the next fetch carries it.
  const orderRatings = useMemo(() => {
    const merged = {};
    for (const o of historyOrders) {
      if (o.rating) merged[o.id] = { rating: o.rating, feedback: o.feedback, date: o.timestamp };
    }
    return { ...merged, ...localRatings };
  }, [historyOrders, localRatings]);

  const [cancelledOrders, setCancelledOrders] = useState(() => {
    const saved = localStorage.getItem("cancelled_orders_v1");
    return saved ? JSON.parse(saved) : {};
  });

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [showOtherInput, setShowOtherInput] = useState(false);

  const [showQRCodeModal, setShowQRCodeModal] = useState(false);

  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [filterPeriod, setFilterPeriod] = useState(null);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  // Repeat-order modal state. `repeatSourceOrder` holds the order being
  // repeated; `repeatItems` is the editable list the customer can adjust
  // (one row per source item, with a `quantity` they can dial up/down or
  // set to 0 to drop the item).
  const [showRepeatModal, setShowRepeatModal] = useState(false);
  const [repeatSourceOrder, setRepeatSourceOrder] = useState(null);
  const [repeatItems, setRepeatItems] = useState([]);
  const [repeatSubmitting, setRepeatSubmitting] = useState(false);

  // While any overlay (cancel reasons, order details, repeat, filter,
  // rating, QR feedback) is open: lock the page behind it so it can't
  // scroll under the sheet, and drop the fixed bottom chrome (BottomNav
  // + Make-Payment strip). Those bars are separately composited
  // `position: fixed` layers and on mobile Safari they could paint over
  // the bottom-sheet dialog — the "footer shows over the cancel popup"
  // report.
  const anyOverlayOpen = showCancelModal || showDetailsModal || showRepeatModal
    || showFilterModal || showRatingModal || showQRCodeModal;
  useEffect(() => {
    if (!anyOverlayOpen) return undefined;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [anyOverlayOpen]);

  const clearFilters = () => {
    setFilterPeriod(null);
    setDateRange({ start: "", end: "" });
  };

  const getFilteredHistory = () => {
    // Statuses that are still active — exclude from past tab
    const activeStatuses = ["Order Placed", "Preparing", "Ready", "new", "preparing", "ready"];
    // Anchor for "today" — same calendar day as right now. Used to
    // keep today's orders out of the Past tab (they live in the
    // Today tab, including cancelled ones with the cancel banner).
    // Without this, a cancelled order placed today shows up in BOTH
    // tabs because "Cancelled" isn't an active status, so the past
    // filter accepted it even though it's still on today's date.
    const todayDateStr = new Date().toDateString();

    return historyOrders.filter((order) => {
      if (activeStatuses.includes(order.status)) return false;
      // Today's orders (paid / cancelled / served — anything
      // non-active) belong in the Today tab. The Past tab only
      // shows orders from previous days.
      if (order.timestamp && new Date(order.timestamp).toDateString() === todayDateStr) {
        return false;
      }

      // Apply search query
      const matchesSearch =
        searchQuery === "" ||
        (order.items || []).some((item) =>
          (item.title || item.name || "").toLowerCase().includes(searchQuery.toLowerCase()),
        );
      if (!matchesSearch) return false;

      // If no filters are active, return all past orders
      if (!filterPeriod && !dateRange.start && !dateRange.end) return true;

      const orderDate = new Date(order.timestamp);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Custom date range filter
      if (dateRange.start || dateRange.end) {
        if (dateRange.start && orderDate < new Date(dateRange.start)) return false;
        if (dateRange.end) {
          const endOfDay = new Date(dateRange.end);
          endOfDay.setHours(23, 59, 59, 999);
          if (orderDate > endOfDay) return false;
        }
        return true;
      }

      // Period filter
      switch (filterPeriod) {
        case "today":
          return orderDate >= todayStart;
        case "yesterday": {
          const yest = new Date(todayStart);
          yest.setDate(yest.getDate() - 1);
          return orderDate >= yest && orderDate < todayStart;
        }
        case "this_month":
          return orderDate >= new Date(now.getFullYear(), now.getMonth(), 1);
        case "past_month":
          return (
            orderDate >= new Date(now.getFullYear(), now.getMonth() - 1, 1) &&
            orderDate < new Date(now.getFullYear(), now.getMonth(), 1)
          );
        case "past_3_months":
          return orderDate >= new Date(now.getFullYear(), now.getMonth() - 2, 1);
        default:
          return true;
      }
    });
  };

  const getPeriodLabel = () => {
    if (dateRange.start || dateRange.end) return "Custom Date";
    const labels = {
      today: "Today",
      yesterday: "Yesterday",
      this_month: "This Month",
      past_month: "Past Month",
      past_3_months: "Past 3 Months",
    };
    return labels[filterPeriod] || "All Orders";
  };

  const groupedOrders = useMemo(() => {
    return getFilteredHistory().reduce((groups, order) => {
      const date = new Date(order.timestamp).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(order);
      return groups;
    }, {});
  }, [getFilteredHistory()]);

  const allOrders = useMemo(() => {
    return historyOrders.map((o) => ({
      ...o,
      orderId: o.id,
      date:
        new Date(o.timestamp).toDateString() === new Date().toDateString()
          ? "today"
          : "past",
    }));
  }, [historyOrders]);

  const todayOrders = allOrders.filter((o) => o.date === "today");
  const activeStatuses = ["Order Placed", "Preparing", "Ready", "Delivered"];
  const pendingOrDelivered = todayOrders.filter(
    (o) =>
      !o.isTakeaway &&
      activeStatuses.includes(o.status) &&
      !cancelledOrders[o.id],
  );
  // The customer's action button flips through two visible states:
  //   1. Any order still awaiting kitchen  → "Waiting for Delivery..." (disabled gray)
  //   2. Delivered + still Pending payment → "Make Payment" (orange)
  // Once every delivered order is paid the strip is hidden entirely
  // (showPaymentButton flips to false below) — earlier we kept a
  // disabled "✓ Paid · Thank you!" pill there but customers expected
  // the strip to disappear after payment so the bottom nav can breathe.
  // `paymentStatus` comes from the server on every /orders/my-orders
  // refetch, and the socket listener below triggers that refetch the
  // instant payment lands from ANY surface (razorpay, waiter cash,
  // admin drawer), so the button flips without a page reload.
  const deliveredOrders = pendingOrDelivered.filter((o) => o.status === "Delivered");
  const hasUnpaidDelivered = deliveredOrders.some(
    (o) => o.paymentStatus !== "Paid" && o.paymentStatus !== "Refunded",
  );
  const allDeliveredArePaid =
    deliveredOrders.length > 0 &&
    deliveredOrders.every(
      (o) => o.paymentStatus === "Paid" || o.paymentStatus === "Refunded",
    );
  const isPaymentEnabled = hasUnpaidDelivered;
  // Hide the whole payment strip once everything's paid — keeps the
  // page clean instead of leaving a permanent "Paid · Thank you!" pill
  // glued above the bottom nav.
  const showPaymentButton = pendingOrDelivered.length > 0 && !allDeliveredArePaid;

  // Find the most recent active takeaway order to keep the confirmation view persistent
  const activeTakeawayOrder = historyOrders.find(
    (o) =>
      o.isTakeaway &&
      ["new", "preparing", "ready"].includes((o.rawStatus || o.status || "").toLowerCase()) &&
      new Date(o.timestamp).toDateString() === new Date().toDateString(),
  );

  const effectiveShowConfirmation =
    (showConfirmation || !!activeTakeawayOrder) && orderType === "takeaway";
  const effectiveOrderData = confirmationOrderData || activeTakeawayOrder;

  const handleBack = () => {
    if (showConfirmation) {
      setShowConfirmation(false);
      return;
    }
    navigate("/customer/home");
  };

  // Open the repeat-order modal pre-populated with the source order's
  // items at their original quantities. The customer can then bump the
  // counts up/down or drop items entirely before confirming.
  const handleRepeatOrder = (order) => {
    if (!order || (!order._id && !order.id)) {
      toast.error("Can't repeat this order — missing reference.", { id: 'order-repeat-err' });
      return;
    }
    if (!Array.isArray(order.items) || order.items.length === 0) {
      toast.error("This order has no items to repeat.", { id: 'order-repeat-err' });
      return;
    }
    const seedItems = order.items.map((it, idx) => ({
      index: idx,                           // position in source order (sent to backend)
      menuItem: it.menuItem || null,        // needed for takeaway repeat → Cart's price-revalidation
      name: it.title || it.name || 'Item',
      image: it.image || '',
      unitPrice: Number(it.unitPrice ?? it.price ?? 0),
      originalQty: Number(it.quantity || 1),
      quantity: Number(it.quantity || 1),
    }));
    setRepeatSourceOrder(order);
    setRepeatItems(seedItems);
    setShowRepeatModal(true);
  };

  const adjustRepeatQty = (idx, delta) => {
    setRepeatItems((prev) => prev.map((it) => {
      if (it.index !== idx) return it;
      const next = Math.max(0, Math.min(99, it.quantity + delta));
      return { ...it, quantity: next };
    }));
  };

  const confirmRepeatOrder = async () => {
    if (repeatSubmitting) return;
    if (!repeatSourceOrder) return;
    const picked = repeatItems.filter((it) => it.quantity > 0);
    if (picked.length === 0) {
      toast.error('Please pick at least one item to repeat.', { id: 'order-repeat-empty' });
      return;
    }
    const ref = repeatSourceOrder._id || repeatSourceOrder.id;
    const toastId = `order-repeat-${ref}`;
    const isTakeawaySource = !!repeatSourceOrder.isTakeaway;

    // ── Takeaway: payment-FIRST flow ─────────────────────────────────
    // Cart's takeaway path creates the order only AFTER payment lands
    // (so the kitchen never sees an unpaid takeaway). The repeat must
    // mirror that — calling /repeat-all here would leave a phantom
    // unpaid order in the DB with no way for the customer to settle it.
    // Instead we preload the customer cart with the picked items and
    // bounce them into /customer/cart so they go through pickup-time
    // selection → bill preview → payment exactly like a fresh order.
    if (isTakeawaySource) {
      // Resolve missing menuItem ids by name against the live menu —
      // legacy orders (and ones returned before the backend started
      // including menuItem in the customer endpoint) have no id on
      // the line, so an exact name match is the safest fallback.
      const menuByName = new Map(
        (menuItems || [])
          .filter((m) => m && (m._id || m.id))
          .map((m) => [String(m.name || m.title || '').trim().toLowerCase(), m._id || m.id])
      );
      const resolved = picked.map((it) => {
        if (it.menuItem) return it;
        const key = String(it.name || '').trim().toLowerCase();
        const fallbackId = menuByName.get(key);
        return fallbackId ? { ...it, menuItem: fallbackId } : it;
      });
      const usable  = resolved.filter((it) => !!it.menuItem);
      const dropped = resolved.filter((it) => !it.menuItem);

      if (usable.length === 0) {
        toast.error("Some items can't be repeated — they may have been removed from the menu.", { id: toastId });
        return;
      }
      if (dropped.length > 0) {
        toast(`Skipped ${dropped.length} item${dropped.length > 1 ? 's' : ''} no longer on the menu.`, { id: `${toastId}-skip`, icon: '⚠️' });
      }

      try {
        clearCustomerCart();
        // Flip to takeaway BEFORE filling the cart — the cart refuses
        // dine-in adds when no table is scanned (see needsTableScan).
        try { localStorage.setItem('orderType', 'takeaway'); } catch { /* noop */ }
        for (const it of usable) {
          updateCartQty(it.menuItem, it.quantity, {
            id: it.menuItem,
            _id: it.menuItem,
            name: it.name,
            title: it.name,
            finalPrice: it.unitPrice,
            basePrice: it.unitPrice,
            unitPrice: it.unitPrice,
            price: it.unitPrice,
            image: it.image || '',
            selectedSizes: [],
            selectedToppings: [],
            instructions: '',
          });
        }
        try { localStorage.setItem('orderType', 'takeaway'); } catch { /* noop */ }
        setShowRepeatModal(false);
        setRepeatSourceOrder(null);
        setRepeatItems([]);
        toast.success('Items added — pick a pickup time and pay.', { id: toastId, duration: 3500 });
        navigate('/customer/cart');
      } catch {
        toast.error('Failed to load items into your cart.', { id: toastId });
      }
      return;
    }

    // ── Dine-in: existing repeat-all flow ────────────────────────────
    // Target the customer's CURRENT table (not the source's) so the
    // new/appended order lands where they're sitting today; otherwise
    // the bill-preview poll on their current table finds nothing and
    // shows the old paid order instead of the new bill.
    const selections = picked.map((it) => ({ index: it.index, quantity: it.quantity }));
    let targetTableId = null;
    try {
      const dt = JSON.parse(localStorage.getItem('dineInTable') || '{}');
      targetTableId = dt?._id || null;
    } catch { /* noop */ }
    if (!targetTableId) {
      toast.error('Please scan the table QR code first to place a dine-in repeat.', { id: toastId });
      return;
    }

    setRepeatSubmitting(true);
    try {
      const body = { selections };
      if (targetTableId) body.targetTableId = targetTableId;
      const res = await api.post(`/orders/${ref}/repeat-all`, body);
      if (res.data?.success) {
        // Prefer the backend's message when it exists — it now
        // reflects mixed-cart splits (eg. "counter items ready,
        // kitchen items added…") so the customer understands why
        // they may see two cards on the next refresh instead of one.
        const fallbackMsg = res.data.appended ? 'Items added to your order.' : 'Order repeated.';
        toast.success(res.data.message || fallbackMsg, { id: toastId, duration: res.data.isSplit ? 4500 : 3000 });
        setShowRepeatModal(false);
        setRepeatSourceOrder(null);
        setRepeatItems([]);

        // Pull the freshly created/updated order so the card on screen
        // carries the real backend orderId — that's what the Cancel
        // button needs to target /orders/<id>/cancel against. The
        // refetch also writes localStorage with the live status, so the
        // bill page's fallback path can't pick up a stale "Pending"
        // entry after the kitchen progresses or the customer pays.
        await refreshOrders();
      } else {
        toast.error(res.data?.message || 'Failed to repeat order.', { id: toastId });
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to repeat order.';
      toast.error(msg, { id: toastId });
    } finally {
      setRepeatSubmitting(false);
    }
  };

  const handleRate = (orderId) => {
    setRatingOrderId(orderId);
    setSelectedRating(0);
    setFeedback("");
    setShowRatingModal(true);
  };

  const handleOpenDetails = (order) => {
    setSelectedOrderDetails(order);
    setShowDetailsModal(true);
  };

  const handleCancelOrder = (id) => {
    setCancellingOrderId(id);
    setSelectedCancelReason("");
    setOtherReason("");
    setShowOtherInput(false);
    setShowCancelModal(true);
  };

  const confirmCancelOrder = async () => {
    if (!selectedCancelReason && !otherReason) return;
    const finalReason =
      selectedCancelReason === "Other" ? otherReason : selectedCancelReason;

    // cancellingOrderId is the real backend orderId (e.g. "ORD-0001").
    const realOrderId = cancellingOrderId;

    try {
      const res = await api.patch(`/orders/${realOrderId}/cancel`, { reason: finalReason });
      if (res.data.success) {
        // Also mark in localStorage for immediate UI update
        const newCancelled = {
          ...cancelledOrders,
          [cancellingOrderId]: {
            reason: finalReason,
            timestamp: new Date().toISOString(),
          },
        };
        setCancelledOrders(newCancelled);
        localStorage.setItem("cancelled_orders_v1", JSON.stringify(newCancelled));

        // ADM-049 — cancel no longer auto-refunds. The backend queues a
        // RefundRequest the admin must approve before money moves.
        // Toast must reflect that pending state instead of pretending
        // the money already moved.
        const refundRequest = res.data.refundRequest;
        const cancelToastId = `order-cancel-${realOrderId}`;
        if (refundRequest) {
          const amt = Number(refundRequest.amount || 0).toFixed(0);
          toast.success(`Order cancelled. Refund of ₹${amt} requested — pending admin approval.`, {
            id: cancelToastId, duration: 6000,
          });
        } else {
          toast.success('Order cancelled successfully', { id: cancelToastId });
        }

        // Flip the card right away, then confirm from the server.
        queryClient.setQueryData(ordersQueryKey, (prev) => (prev || []).map((o) =>
          o.id === realOrderId ? { ...o, status: 'Cancelled', rawStatus: 'cancelled' } : o
        ));
        refreshOrders();
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to cancel order';
      toast.error(msg, { id: `order-cancel-err-${realOrderId}` });
    }
    setShowCancelModal(false);
  };

  const handleSubmitRating = async () => {
    if (selectedRating > 0) {
      const newRatings = {
        ...orderRatings,
        [ratingOrderId]: {
          rating: selectedRating,
          feedback,
          date: new Date().toISOString(),
        },
      };
      setOrderRatings(newRatings);
      localStorage.setItem("order_ratings", JSON.stringify(newRatings));

      // Persist to backend
      try {
        await api.patch(`/orders/${ratingOrderId}/rating`, {
          rating: selectedRating,
          feedback,
        });
      } catch {
        // Rating saved locally even if API fails
      }
    }
    setShowRatingModal(false);
  };

  const filteredTodayItems = allOrders.filter((o) => {
    const isToday = o.date === "today";
    const isSearchMatch =
      searchQuery === "" ||
      (o.items || []).some((item) =>
        (item.title || item.name || "")
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      );
    // Show all active orders: Pending (new), Preparing (cooking), Ready, Delivered (served)
    const visibleStatuses = ["Order Placed", "Preparing", "Ready", "Delivered"];
    const isActiveStatus = visibleStatuses.includes(o.status);

    const isShownInConfirmation =
      effectiveShowConfirmation && o.orderId === effectiveOrderData?.id;

    const currentIsTakeaway = orderType === "takeaway";
    const matchesOrderType = !!o.isTakeaway === currentIsTakeaway;
    // Keep cancelled cards visible — the OrderCard renders the
    // "Your order has been cancelled successfully." banner so the
    // customer sees confirmation instead of the card just vanishing.
    const isCancelled = !!cancelledOrders[o.id] || o.status === "Cancelled";

    return (
      isToday &&
      (isActiveStatus || isCancelled) &&
      isSearchMatch &&
      !isShownInConfirmation &&
      matchesOrderType
    );
  });

  return (
    <div
      className={`min-h-screen bg-[#FAFAFA] ${
        showPaymentButton && orderType !== 'takeaway' && !effectiveShowConfirmation
          ? 'pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))] md:pb-[calc(10rem+env(safe-area-inset-bottom,0px))]'
          : 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]'
      }`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <header className="sticky top-0 z-40 bg-white px-4 sm:px-6 md:px-8 py-3 flex items-center justify-between border-b border-gray-100 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:scale-90 transition-all touch-manipulation"
          >
            <ChevronLeft size={22} className="text-[#666666]" />
          </button>
          <h1 className="text-[17px] font-nunito font-semibold text-[#1A181B]">Your Order</h1>
        </div>
        {(() => {
          const isTakeaway = effectiveShowConfirmation || orderType === 'takeaway';
          // Dine-in guest who hasn't scanned a QR yet has no tableNumber —
          // suppress the chip entirely instead of rendering "Table —".
          if (!isTakeaway && (!tableNumber || customerSession.isSettled)) return null;
          return (
            <span className="text-[#8D848F] text-[13px] sm:text-[14px] font-nunito font-medium bg-gray-50 px-3 py-1 rounded-full">
              {isTakeaway ? 'Takeaway' : `Table ${tableNumber}`}
            </span>
          );
        })()}
      </header>

      <div className="px-4 sm:px-6 md:px-8 py-3 bg-white">
        <div className="flex items-center gap-3 h-[48px] bg-[#F7F7F7] border border-gray-200 rounded-full px-4 focus-within:border-[#FE8301] transition-colors">
          <Search size={18} className="text-[#999999] flex-shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by dish name"
            className="flex-1 outline-none text-[14px] font-varela bg-transparent text-[#1A181B] placeholder:text-[#AAAAAA]"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="text-[#AAAAAA] active:scale-90 transition-transform touch-manipulation">
              <X size={16} />
            </button>
          ) : (
            <VoiceSearchButton size={18} onResult={(text) => setSearchQuery(text)} />
          )}
        </div>
      </div>

      {/* Tab toggle — guests only see today's orders, no past orders tab */}
      {!isGuest ? (
        <div className="px-4 sm:px-6 md:px-8 pb-3 bg-white">
          <div className="flex gap-1.5 bg-[#FFF3E6] p-1 rounded-full shadow-inner">
            <button
              onClick={() => setActiveTab('today')}
              className={`flex-1 py-2.5 rounded-full text-[13px] sm:text-[14px] font-varela transition-all duration-200 touch-manipulation ${
                activeTab === 'today'
                  ? 'bg-white text-[#101828] shadow-sm font-semibold'
                  : 'text-[#8D848F] hover:text-[#101828]'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`flex-1 py-2.5 rounded-full text-[13px] sm:text-[14px] font-varela transition-all duration-200 touch-manipulation ${
                activeTab === 'past'
                  ? 'bg-white text-[#101828] shadow-sm font-semibold'
                  : 'text-[#8D848F] hover:text-[#101828]'
              }`}
            >
              Past Orders
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'past' && (
        <div className="px-4 sm:px-6 md:px-8 pb-3 flex items-center gap-3">
          <button
            onClick={() => setShowFilterModal(true)}
            className="w-[36px] h-[36px] rounded-[10px] bg-[#F8F7FA] flex items-center justify-center text-[#666666] active:scale-95 transition-transform touch-manipulation flex-shrink-0 border border-[#F0F0F0]"
          >
            <Sliders size={16} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
            {filterPeriod || dateRange.start ? (
              <span className="bg-[#FFF3E6] text-[#1A181B] px-3 py-1.5 rounded-full flex items-center gap-2 text-[13px] font-nunito font-medium whitespace-nowrap">
                {getPeriodLabel()}
                <button onClick={clearFilters} className="active:scale-90 transition-transform">
                  <X size={14} className="text-[#999]" />
                </button>
              </span>
            ) : null}
          </div>
        </div>
      )}

      <main
        className="px-4 sm:px-6 md:px-8 pb-6 animate-fadeIn"
        key={activeTab}
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        {activeTab === "today" ? (
          <div className="space-y-4">
            {effectiveShowConfirmation && effectiveOrderData && (
              <div className="mt-2 text-left">
                <OrderConfirmationView
                  orderData={effectiveOrderData}
                  onTrack={() => navigate("/customer/order-tracking", { state: { order: effectiveOrderData } })}
                  onOpenQR={() => setShowQRCodeModal(true)}
                  taxConfig={taxConfig}
                />
              </div>
            )}
            {filteredTodayItems.length > 0 ? (
              filteredTodayItems.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  onRepeatOrder={customerSession.isSettled ? null : handleRepeatOrder}
                  onRate={handleRate}
                  rating={orderRatings[o.id]?.rating}
                  onCancel={handleCancelOrder}
                  isCancelled={!!cancelledOrders[o.id] || o.status === "Cancelled"}
                  allowCancellation={allowCancellation}
                  onClick={handleOpenDetails}
                  onTrack={(orderId) => navigate(`/customer/order-tracking/${orderId}`)}
                />
              ))
            ) : !effectiveShowConfirmation ? (
              <EmptyState image={NoOrderImg} onBrowse={() => navigate("/customer/menu")} />
            ) : null}
          </div>
        ) : Object.keys(groupedOrders).length > 0 ? (
          <div className="pt-2">
            {Object.entries(groupedOrders).map(([date, orders]) => {
              // Quick per-day summary so the customer sees how many
              // orders + how much they spent on that day at a glance.
              const dayTotal = orders.reduce(
                (sum, o) => sum + (Number(o.total) || 0),
                0
              );
              return (
                <div key={date} className="mb-6">
                  <div className="flex items-baseline justify-between mb-3 px-1">
                    <h3 className="font-nunito font-semibold text-[13px] text-[#1A181B] uppercase tracking-wide">
                      {date}
                    </h3>
                    <span className="text-[11px] font-varela text-[#8D848F] tabular-nums">
                      {orders.length} {orders.length === 1 ? "order" : "orders"} · ₹{Math.round(dayTotal).toLocaleString()}
                    </span>
                  </div>
                  {orders.map((o) => (
                    <OrderSummaryCard key={o.id} order={o} onClick={handleOpenDetails} cancelledOrders={cancelledOrders} taxConfig={taxConfig} />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState image={NoOrderImg} onBrowse={() => navigate("/customer/menu")} />
        )}
      </main>

      {/* Payment CTA — rendered as a separate fixed strip above the BottomNav.
          Hidden entirely once everything's paid (showPaymentButton handles
          that), so the bottom of the page stays clean. */}
      {showPaymentButton && orderType !== 'takeaway' && !effectiveShowConfirmation && !anyOverlayOpen && (
        <div
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 w-full z-40 bg-white/95 backdrop-blur-sm border-t border-gray-100 px-4 sm:px-6 md:px-8 pt-2.5 pb-2"
        >
          <button
            onClick={() => isPaymentEnabled && navigate('/bill-preview')}
            disabled={!isPaymentEnabled}
            className={`w-full h-[48px] rounded-[16px] font-semibold font-nunito flex items-center justify-center gap-3 transition-all ${
              isPaymentEnabled
                ? 'bg-[#FE8301] text-white active:scale-[0.98] shadow-[0_4px_15px_rgba(254,131,1,0.35)]'
                : 'bg-[#F5F5F5] text-[#B6AEB8] cursor-not-allowed border border-[#EEEEEE]'
            }`}
          >
            <Banknote size={22} className={isPaymentEnabled ? 'text-white' : 'text-[#B6AEB8]'} />
            <span className="font-nunito text-[14px]">
              {isPaymentEnabled ? 'Make Payment' : 'Waiting for Delivery...'}
            </span>
          </button>
        </div>
      )}

      {!anyOverlayOpen && <BottomNav />}

      {showRatingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowRatingModal(false)} />
          <div className="bg-white rounded-[32px] p-8 w-full max-w-[340px] relative z-10 flex flex-col items-center animate-scaleIn">
            <h2 className="text-[26px] font-nunito font-bold mb-2">Thanks!</h2>
            <p className="text-center text-[#645E66] text-[14px] font-varela mb-4">Your feedback helps us deliver an even better dining experience.</p>
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setSelectedRating(s)} className="hover:scale-110 transition-transform">
                  <Star size={28} className={selectedRating >= s ? "text-[#FFCC00] fill-[#FFCC00]" : "text-gray-300"} />
                </button>
              ))}
            </div>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Write your feedback..."
              className="w-full h-[100px] p-4 border border-[#F1F0FC] rounded-2xl mb-4 text-[12px] font-varela resize-none focus:outline-none focus:border-[#FE8301] transition-colors"
            />
            <button onClick={handleSubmitRating} className="w-full py-3.5 bg-[#FE8301] text-white rounded-xl font-nunito font-semibold shadow-lg active:scale-[0.98] transition-all">Submit</button>
          </div>
        </div>
      )}

      {showFilterModal && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilterModal(false)} />
          <div className="bg-white rounded-t-[32px] md:rounded-[32px] w-full max-w-[500px] relative z-10 p-6 animate-slideUp md:animate-scaleIn">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[18px] text-[#101828] font-nunito font-semibold">Filter Orders</h2>
              <button onClick={() => setShowFilterModal(false)} className="p-2 bg-[#F7F7F7] rounded-full active:scale-95 transition-transform"><X size={20} /></button>
            </div>

            {/* Quick Period Filters */}
            <div className="mb-5">
              <h3 className="text-[14px] text-[#8D848F] font-nunito font-semibold mb-3 uppercase tracking-wider">Period</h3>
              <div className="space-y-1">
                {[
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "this_month", label: "This Month" },
                  { id: "past_month", label: "Past Month" },
                  { id: "past_3_months", label: "Past 3 Months" },
                ].map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between cursor-pointer py-3 border-b border-[#F7F7F7] last:border-0 active:bg-gray-50 transition-colors rounded-lg px-1"
                    onClick={() => { setFilterPeriod(filterPeriod === p.id ? null : p.id); setDateRange({ start: "", end: "" }); }}
                  >
                    <span className={`text-[14px] font-varela ${filterPeriod === p.id ? "text-[#FE8301] font-medium" : "text-[#645E66]"}`}>{p.label}</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${filterPeriod === p.id ? "border-[#FE8301] bg-[#FE8301]" : "border-[#D0D0D0]"}`}>
                      {filterPeriod === p.id && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Date Range */}
            <div className="mb-6">
              <h3 className="text-[14px] text-[#8D848F] font-nunito font-semibold mb-3 uppercase tracking-wider">Custom Range</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] text-[#8D848F] mb-1 block font-varela">From</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => { setDateRange({ ...dateRange, start: e.target.value }); setFilterPeriod(null); }}
                    className="w-full border border-[#E5E5EA] rounded-xl p-3 outline-none text-[14px] font-varela focus:border-[#FE8301] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[12px] text-[#8D848F] mb-1 block font-varela">To</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => { setDateRange({ ...dateRange, end: e.target.value }); setFilterPeriod(null); }}
                    className="w-full border border-[#E5E5EA] rounded-xl p-3 outline-none text-[14px] font-varela focus:border-[#FE8301] transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => { clearFilters(); setShowFilterModal(false); }} className="flex-1 h-[48px] bg-[#F5F5F5] rounded-xl font-nunito font-semibold text-[#645E66] active:scale-[0.98] transition-transform">Clear All</button>
              <button onClick={() => setShowFilterModal(false)} className="flex-1 h-[48px] bg-[#FE8301] text-white rounded-xl font-nunito font-semibold active:scale-[0.98] transition-transform">Apply</button>
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && selectedOrderDetails && (() => {
        const activeItems = selectedOrderDetails.items
          .map((item, idx) => ({ ...item, compositeId: `${selectedOrderDetails.id}-${idx}` }))
          .filter(item => !cancelledOrders[item.compositeId]);
        // Placed order — the server's stored breakdown and total. Legacy
        // orders without one are recomputed via computeBill (server rounding).
        const drawerBill = billFromOrder(selectedOrderDetails, taxConfig, activeItems);
        const drawerGst = drawerBill.gst;
        const drawerService = drawerBill.serviceCharge;
        const drawerAdditionalCharges = drawerBill.additionalCharges;
        const payMethod = selectedOrderDetails.paymentMethod || "UPI";
        const payStatus = selectedOrderDetails.paymentStatus || "Paid";

        return (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowDetailsModal(false)} />
            {/* Sheet on mobile (rises from bottom), centred dialog on tablet+.
                max-h + overflow-y-auto guarantees long bills can scroll on
                small phones; safe-area-inset keeps content above the iOS
                home indicator. min-w-0 + shrink-0 on rows prevents long
                item names from pushing the price off-screen. */}
            <div
              className="bg-white rounded-t-[32px] md:rounded-[32px] w-full max-w-[500px] relative z-10 px-5 sm:px-6 pt-5 sm:pt-6 animate-slideUp md:animate-scaleIn max-h-[88vh] md:max-h-[85vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex justify-between items-center mb-4 gap-3">
                <h2 className="text-[17px] sm:text-[18px] font-nunito font-semibold truncate">Bill summary</h2>
                <button onClick={() => setShowDetailsModal(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0"><X size={22} /></button>
              </div>
              <div className="flex justify-between items-center gap-3 text-[12px] sm:text-[14px] text-[#101828] mb-4 font-varela">
                <span className="truncate min-w-0">
                  {new Date(selectedOrderDetails.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                  {' '}
                  {new Date(selectedOrderDetails.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="shrink-0 whitespace-nowrap">{payMethod} · {payStatus}</span>
              </div>
              <div className="border-t border-[#CCCAC8] py-4 space-y-2">
                {activeItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-3 text-[#645E66] text-[13px] sm:text-[14px] font-varela">
                    <span className="min-w-0 break-words">{item.title || item.name} × {item.quantity}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">₹{((item.price || item.unitPrice) * (item.quantity || 1)).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 py-2">
                <div className="flex justify-between items-center gap-3 text-[#645E66] text-[13px] sm:text-[14px] font-varela">
                  <span className="min-w-0 truncate">GST ({drawerBill.gstPct}%)</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">₹{drawerGst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center gap-3 text-[#645E66] text-[13px] sm:text-[14px] font-varela">
                  <span className="min-w-0 truncate">Service Charge ({drawerBill.serviceChargePct}%)</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">₹{drawerService.toFixed(2)}</span>
                </div>
                {drawerAdditionalCharges.map((c, i) => (
                  <div key={i} className="flex justify-between items-center gap-3 text-[#645E66] text-[13px] sm:text-[14px] font-varela">
                    <span className="min-w-0 truncate">{c.name}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">₹{c.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-gray-300 py-3 flex justify-between items-center gap-3 font-nunito font-semibold text-[15px] sm:text-[16px]">
                <span className="min-w-0 truncate">Total Payment</span>
                <span className="shrink-0 whitespace-nowrap tabular-nums">₹{drawerBill.total.toFixed(2)}</span>
              </div>
              <p className="text-center font-nunito font-semibold leading-[22px] text-[15px] sm:text-[16px] text-[#101828] pb-1">Thank You!</p>
            </div>
          </div>
        );
      })()}

      {showRepeatModal && repeatSourceOrder && (() => {
        const repeatTotal = repeatItems.reduce(
          (sum, it) => sum + it.unitPrice * it.quantity, 0,
        );
        const pickedCount = repeatItems.filter((it) => it.quantity > 0).length;
        const closeRepeatModal = () => {
          if (repeatSubmitting) return;
          setShowRepeatModal(false);
          setRepeatSourceOrder(null);
          setRepeatItems([]);
        };
        return (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeRepeatModal} />
            <div
              className="bg-white rounded-t-[32px] md:rounded-[32px] w-full max-w-[480px] relative z-10 px-5 sm:px-6 pt-5 sm:pt-6 animate-slideUp md:animate-scaleIn shadow-2xl flex flex-col max-h-[90vh] md:max-h-[85vh]"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
            >
              <div className="flex justify-between items-center mb-3 gap-3 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-[17px] sm:text-[18px] font-nunito font-semibold text-[#1A181B] truncate">Repeat order</h2>
                  <p className="text-[12px] text-[#8D848F] font-varela mt-0.5 truncate">
                    Adjust quantities or remove items, then confirm.
                  </p>
                </div>
                <button onClick={closeRepeatModal} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto -mx-5 sm:-mx-6 px-5 sm:px-6 py-2 border-y border-[#F2F1FA]">
                {repeatItems.map((it) => {
                  const lineTotal = it.unitPrice * it.quantity;
                  const dimmed = it.quantity === 0;
                  return (
                    <div key={it.index} className={`flex items-center gap-3 py-3 ${dimmed ? 'opacity-50' : ''}`}>
                      <div className="w-[52px] h-[52px] rounded-[10px] overflow-hidden shrink-0 bg-[#F7F7F7]">
                        {it.image ? (
                          <img src={sizedImage(it.image, { w: 52 })} alt={it.name} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                        ) : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-nunito font-semibold text-[14px] text-[#1A181B] truncate leading-[18px]">{it.name}</h3>
                        <p className="text-[12px] text-[#8D848F] font-varela tabular-nums mt-0.5">
                          ₹{it.unitPrice.toFixed(0)}
                          {it.quantity > 0 && (
                            <span className="ml-1.5 text-[#1A181B]">· ₹{lineTotal.toFixed(0)}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => adjustRepeatQty(it.index, -1)}
                          disabled={it.quantity === 0}
                          aria-label="Decrease quantity"
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${it.quantity === 0 ? 'bg-[#F5F5F5] text-[#B6AEB8] cursor-not-allowed' : 'bg-[#FFF3E6] text-[#FE8301] active:scale-90'}`}
                        >
                          <i className="fi fi-rr-minus-small text-[14px] mt-1" />
                        </button>
                        <span className="min-w-[24px] text-center text-[14px] font-nunito font-semibold text-[#1A181B] tabular-nums">{it.quantity}</span>
                        <button
                          onClick={() => adjustRepeatQty(it.index, +1)}
                          disabled={it.quantity >= 99}
                          aria-label="Increase quantity"
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${it.quantity >= 99 ? 'bg-[#F5F5F5] text-[#B6AEB8] cursor-not-allowed' : 'bg-[#FE8301] text-white active:scale-90'}`}
                        >
                          <i className="fi fi-rr-plus-small text-[14px] mt-1" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] text-[#645E66] font-varela">
                    {pickedCount} {pickedCount === 1 ? 'item' : 'items'} · taxes added at checkout
                  </span>
                  <span className="text-[16px] font-nunito font-semibold text-[#1A181B] tabular-nums">
                    ₹{repeatTotal.toFixed(0)}
                  </span>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={closeRepeatModal}
                    disabled={repeatSubmitting}
                    className="flex-1 h-[48px] bg-[#F5F5F5] rounded-2xl font-nunito font-semibold text-[14px] text-[#645E66] active:scale-[0.98] transition-transform disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRepeatOrder}
                    disabled={repeatSubmitting || pickedCount === 0}
                    className={`flex-[1.4] h-[48px] rounded-2xl font-nunito font-semibold text-[14px] transition-all ${
                      repeatSubmitting || pickedCount === 0
                        ? 'bg-[#F5F5F5] text-[#B6AEB8] cursor-not-allowed'
                        : 'bg-[#FE8301] text-white active:scale-[0.98]'
                    }`}
                  >
                    {repeatSubmitting ? 'Placing…' : 'Place Order'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {showCancelModal && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4 overscroll-contain">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCancelModal(false)} />
          <div className="bg-white rounded-t-[32px] md:rounded-[32px] w-full max-w-[420px] relative z-10 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:pb-6 animate-slideUp md:animate-scaleIn shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain">
            <div className="flex flex-col items-center mb-[14px] px-10">
              <img src={CancelOrderIcon} alt="Cancel" className="w-[45px] h-[45px] object-contain mb-[14px]" />
              <h2 className="text-[18px] font-nunito font-semibold text-center text-[#1A181B] leading-[22px]">Why do you want to cancel this dine-in order</h2>
            </div>
            <div className="space-y-0.5 mb-4">
              {["Ordered wrong dish", "Ordered for wrong table", "Long preparation time", "Payment issue", "Spoke to staff already", "Other"].map(reason => (
                <div key={reason} onClick={() => { setSelectedCancelReason(reason); setShowOtherInput(reason === "Other"); }} className="flex items-center justify-between py-3.5 cursor-pointer border-b border-[#F7F7F7] last:border-0 group">
                  <span className={`text-[14px] font-varela ${selectedCancelReason === reason ? "text-[#FE8301]" : "text-[#645E66]"}`}>{reason}</span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedCancelReason === reason ? "border-[#34C759] bg-[#34C759]" : "border-[#B6AEB8]"}`}>
                    {selectedCancelReason === reason && <Check size={20} className="text-white" />}
                  </div>
                </div>
              ))}
            </div>
            {showOtherInput && (
              <textarea value={otherReason} onChange={(e) => setOtherReason(e.target.value)} placeholder="Please tell us your reason..." className="w-full h-[80px] p-4 bg-[#F8F7FA] rounded-[16px] text-[14px] font-varela focus:outline-none mb-4" />
            )}
            <button onClick={confirmCancelOrder} disabled={!selectedCancelReason || (selectedCancelReason === "Other" && !otherReason.trim())} className={`w-full py-3 rounded-2xl font-nunito font-semibold text-[16px] transition-all ${selectedCancelReason && (selectedCancelReason !== "Other" || otherReason.trim()) ? "bg-[#FE8301] text-white" : "bg-[#F5F5F5] text-[#B6AEB8]"}`}>Submit</button>
          </div>
        </div>
      )}
      <QRCodeModal
        isOpen={showQRCodeModal}
        onClose={() => setShowQRCodeModal(false)}
        orderId={effectiveOrderData?.orderId || effectiveOrderData?.id}
        initialRating={effectiveOrderData?.rating || 0}
        initialFeedback={effectiveOrderData?.feedback || ''}
      />
    </div>
  );
}

export default Orders;
