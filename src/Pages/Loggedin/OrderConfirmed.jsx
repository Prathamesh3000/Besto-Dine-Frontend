import React, { useEffect, useState, useMemo } from "react";
import { CheckCircle, Clock, Home, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import api, { settingsAPI } from "../../utils/api";
import useBlockBackNav from "../../hooks/useBlockBackNav";
import { billFromOrder, toTaxConfig } from '../../utils/billing';

function OrderConfirmed() {
  const navigate = useNavigate();
  const location = useLocation();

  // After a paid order, back-nav must NOT return to Payment / Cart —
  // it would let the customer re-checkout the same items or re-trigger
  // a charge. Redirect to the orders list, which is the natural next
  // step from a confirmation screen.
  useBlockBackNav('/customer/orders');

  const {
    orderId = "",
    items: stateItems = [],
    total: stateTotal = 0,
    isTakeaway = false,
    selectedTime,
    paymentMethod: statePaymentMethod,
  } = location.state || {};

  const [cafePhone, setCafePhone] = useState("");
  const [taxConfig, setTaxConfig] = useState({ gstPct: 5, servicePct: 10, additionalCharges: [] });
  const [showQRModal, setShowQRModal] = useState(false);
  // Authoritative order from the backend — has the real breakdown
  // (couponDiscount, walletAmountPaid, paymentMethod after verify) that
  // location.state doesn't carry. Falls back to state if fetch fails.
  const [order, setOrder] = useState(null);

  useEffect(() => {
    settingsAPI.getSettings().then((res) => {
      if (res.data) {
        const general = res.data.general || res.data.data?.general || {};
        const phone = general.contactNumber || res.data.phone || res.data.contactNumber || "";
        if (phone) setCafePhone(phone);
        const taxes = res.data.taxes || res.data.data?.taxes;
        if (taxes) {
          setTaxConfig(toTaxConfig(taxes));
        }
      }
    }).catch(() => {});
  }, []);

  // Fetch authoritative order details so the summary reflects what the
  // backend actually saved (including the wallet/Razorpay split that
  // location.state doesn't know about).
  useEffect(() => {
    if (!orderId) return;
    api.get(`/orders/${orderId}/detail`)
      .then((res) => {
        if (res.data?.success && res.data.order) setOrder(res.data.order);
      })
      .catch(() => { /* keep state-based fallback */ });
  }, [orderId]);

  // Prefer authoritative order data; fall back to location.state.
  const items = order?.items?.length ? order.items : stateItems;
  const grandTotal = Number(order?.total ?? stateTotal) || 0;
  const couponCode = order?.couponCode || "";
  const couponDiscount = Number(order?.couponDiscount) || 0;
  const walletAmountPaid = Number(order?.walletAmountPaid) || 0;
  const tipAmount = Number(order?.tipAmount) || 0;
  const paymentMethod = order?.paymentMethod || statePaymentMethod || "online";
  const amountPaid = Number(order?.amountPaid) || grandTotal;
  const paymentStatus = order?.paymentStatus || "Paid";
  const pickupTime = order?.pickupTime || selectedTime;

  // Placed order: show the breakdown the server stamped on it. Only a
  // legacy order without one (or the pre-fetch state fallback) is
  // recomputed — via computeBill, so rounding and the takeaway
  // no-service-charge rule match the server.
  const bill = useMemo(
    () => billFromOrder(
      order || { items, total: stateTotal, type: isTakeaway ? 'takeaway' : 'dine-in' },
      taxConfig,
      items,
    ),
    [order, items, stateTotal, isTakeaway, taxConfig],
  );
  const { subtotal, gst, serviceCharge } = bill;

  // Razorpay portion = total - wallet portion. Used for the breakdown
  // display when paymentMethod is mixed.
  const razorpayPortion = Math.max(0, Math.round((amountPaid - walletAmountPaid) * 100) / 100);

  const paymentMethodLabel = (() => {
    if (paymentMethod === "wallet") return "Wallet";
    if (paymentMethod === "mixed") return "Wallet + Online";
    if (paymentMethod === "online") return "Online (UPI / Card)";
    if (paymentMethod === "cash") return "Cash at Counter";
    return paymentMethod;
  })();

  return (
    <div className="min-h-screen bg-white flex flex-col pb-6">
      {/* Header — no back arrow: this is a terminal success screen.
          Navigation back into the payment flow is intentionally removed
          since that page is already replaced in history on success. */}
      <header className="px-4 py-4 flex items-center justify-between gap-2 sticky top-0 bg-white z-40">
        <span className="text-[16px] font-medium text-[#1A181B] font-nunito">
          Order ID: #{orderId}
        </span>
      </header>

      {/* Success Icon */}
      <div className="flex flex-col items-center pt-4 pb-6">
        <div className="w-16 h-16 rounded-full bg-[#34C759] flex items-center justify-center mb-3">
          <CheckCircle size={36} className="text-white" />
        </div>
        <h1 className="text-[20px] font-nunito font-bold text-[#101828] mb-1">
          Order Confirmed!
        </h1>
        <p className="text-[14px] font-varela text-[#645E66] text-center px-8">
          Thank you! Your {isTakeaway ? "takeaway" : "dine-in"} order has been
          placed successfully.
        </p>
      </div>

      {/* Order Summary */}
      <div className="mx-4 bg-white rounded-2xl border border-[#EEEEEE] px-4 pt-4 pb-5 mb-4">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[18px] font-nunito font-semibold text-[#101828]">
            Order Summary
          </h2>
          <span className="text-[12px] font-varela text-[#8D848F]">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>

        {/* Pickup time pill — visible when we have it (takeaway only) */}
        {pickupTime && (
          <div className="mb-4 flex items-center gap-2 bg-[#FFF9F2] border border-[#FFE9D1] rounded-xl px-3 py-2">
            <Clock size={14} className="text-[#FE8301]" />
            <span className="text-[12px] font-varela text-[#1A181B]">
              Pickup at <span className="font-nunito font-semibold">{pickupTime}</span>
            </span>
          </div>
        )}

        {/* Line items */}
        <div className="space-y-4 mb-4">
          {items.map((item, idx) => {
            const qty = Number(item.quantity) || 1;
            const unitPrice = Number(item.price ?? item.unitPrice) || 0;
            const lineTotal = unitPrice * qty;
            return (
              <div key={idx} className="flex gap-3 items-center">
                <div className="w-[56px] h-[56px] rounded-xl overflow-hidden shrink-0 bg-[#F7F7F7]">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name || item.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-nunito font-semibold text-[#101828] truncate">
                    {item.name || item.title}
                  </h3>
                  {(item.customization || item.note) && (
                    <p className="text-[12px] text-[#8D848F] font-varela line-clamp-1">
                      {item.customization || item.note}
                    </p>
                  )}
                  <span className="inline-block mt-1 px-2 py-0.5 bg-[#F7F7F7] rounded text-[11px] text-[#8D848F] font-varela">
                    Qty: {qty} · ₹{unitPrice.toFixed(2)}
                  </span>
                </div>
                <span className="text-[14px] font-varela text-[#101828] shrink-0 tabular-nums">
                  ₹{lineTotal.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="border-t border-[#EEEEEE] mb-3" />

        {/* Bill ledger — subtotal first, taxes, discounts, then Total. */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-[13px] text-[#645E66] font-varela">Subtotal</span>
            <span className="text-[13px] text-[#645E66] font-varela tabular-nums">
              ₹{subtotal.toFixed(2)}
            </span>
          </div>
          {bill.gstPct > 0 && (
            <div className="flex justify-between">
              <span className="text-[13px] text-[#645E66] font-varela">
                GST ({bill.gstPct}%)
              </span>
              <span className="text-[13px] text-[#645E66] font-varela tabular-nums">
                ₹{gst.toFixed(2)}
              </span>
            </div>
          )}
          {bill.serviceChargePct > 0 && (
            <div className="flex justify-between">
              <span className="text-[13px] text-[#645E66] font-varela">
                Service Charge ({bill.serviceChargePct}%)
              </span>
              <span className="text-[13px] text-[#645E66] font-varela tabular-nums">
                ₹{serviceCharge.toFixed(2)}
              </span>
            </div>
          )}
          {bill.additionalCharges.map((c, i) => {
            const amount = c.amount;
            const suffix = c.type === 'Percentage' ? ` (${c.value}%)` : '';
            return (
              <div key={c._id || c.name || i} className="flex justify-between">
                <span className="text-[13px] text-[#645E66] font-varela">
                  {c.name}{suffix}
                </span>
                <span className="text-[13px] text-[#645E66] font-varela tabular-nums">
                  ₹{amount.toFixed(2)}
                </span>
              </div>
            );
          })}
          {tipAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-[13px] text-[#645E66] font-varela">Tip</span>
              <span className="text-[13px] text-[#645E66] font-varela tabular-nums">
                ₹{tipAmount.toFixed(2)}
              </span>
            </div>
          )}
          {couponDiscount > 0 && (
            <div className="flex justify-between">
              <span className="text-[13px] text-[#027A48] font-varela">
                Coupon{couponCode ? ` (${couponCode})` : ""}
              </span>
              <span className="text-[13px] text-[#027A48] font-varela tabular-nums">
                -₹{couponDiscount.toFixed(2)}
              </span>
            </div>
          )}

          <div className="flex justify-between pt-2 mt-1 border-t border-dashed border-[#EEEEEE]">
            <span className="text-[16px] font-nunito font-semibold text-[#101828]">
              Total Payment
            </span>
            <span className="text-[16px] font-nunito font-semibold text-[#101828] tabular-nums">
              ₹{grandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Payment Breakdown — shown for mixed payments so the customer
            sees how the wallet portion stacked with the online charge. */}
        {walletAmountPaid > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-[#EEEEEE] space-y-2">
            <p className="text-[12px] font-nunito font-semibold text-[#1A181B]">
              Paid by
            </p>
            <div className="flex justify-between">
              <span className="text-[13px] text-[#027A48] font-varela">From Wallet</span>
              <span className="text-[13px] text-[#027A48] font-varela tabular-nums">
                ₹{walletAmountPaid.toFixed(2)}
              </span>
            </div>
            {razorpayPortion > 0 && (
              <div className="flex justify-between">
                <span className="text-[13px] text-[#1A181B] font-varela">Online (Razorpay)</span>
                <span className="text-[13px] text-[#1A181B] font-varela tabular-nums">
                  ₹{razorpayPortion.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Compact payment-method row when the breakdown isn't shown. */}
        {walletAmountPaid === 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-[#EEEEEE] flex justify-between items-center">
            <span className="text-[12px] font-varela text-[#8D848F]">
              Paid via
            </span>
            <span className="text-[12px] font-nunito font-semibold text-[#1A181B]">
              {paymentMethodLabel}
              {paymentStatus !== "Paid" && (
                <span className="ml-2 text-[#FFA601]">· {paymentStatus}</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons — Track Order + Open QR on top row, Back to
          Home as a full-width secondary below. Redirect uses replace so
          OrderConfirmed drops out of history — back from Home doesn't
          loop back here. */}
      <div className="mx-4 flex gap-3 mb-3">
        <button
          onClick={() => navigate(`/customer/order-tracking/${orderId}`, { replace: true })}
          className="flex-1 py-3 rounded-xl font-semibold font-nunito text-[14px] bg-[#FE8301] text-white active:scale-[0.98] transition-transform"
        >
          Track Order
        </button>
        <button
          onClick={() => setShowQRModal(true)}
          disabled={!orderId}
          className={`flex-1 py-3 rounded-xl font-semibold font-nunito text-[14px] border border-[#E5E5EA] text-[#1A181B] active:scale-[0.98] transition-transform ${!orderId ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Open QR
        </button>
      </div>

      {showQRModal && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowQRModal(false)} />
          <div
            className="bg-white rounded-t-[28px] md:rounded-[28px] w-full max-w-[360px] relative z-10 px-6 pt-6 animate-slideUp md:animate-scaleIn shadow-2xl"
            style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex justify-between items-center mb-3">
              <div className="min-w-0">
                <h2 className="text-[17px] font-nunito font-semibold text-[#1A181B]">Pickup QR</h2>
                <p className="text-[12px] text-[#8D848F] font-varela mt-0.5">
                  Show this at the pickup counter.
                </p>
              </div>
              <button
                onClick={() => setShowQRModal(false)}
                aria-label="Close"
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col items-center py-4">
              <div className="p-4 bg-white border border-[#EEEEEE] rounded-2xl">
                <QRCodeSVG
                  value={String(orderId || '')}
                  size={200}
                  level="M"
                  bgColor="#FFFFFF"
                  fgColor="#101828"
                />
              </div>
              <span className="mt-3 text-[13px] font-varela text-[#1A181B] tabular-nums">
                Order ID: <span className="font-nunito font-semibold">#{orderId}</span>
              </span>
              {selectedTime && (
                <span className="mt-1 text-[12px] font-varela text-[#645E66]">
                  Pickup: {selectedTime}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mx-4 mb-4">
        <button
          onClick={() => navigate('/customer/home', { replace: true })}
          className="w-full py-3 rounded-xl font-semibold font-nunito text-[14px] bg-[#F6F6F6] text-[#1A181B] hover:bg-[#EEEEEE] active:scale-[0.98] transition-all inline-flex items-center justify-center gap-1.5"
        >
          <Home size={15} />
          Back to Home
        </button>
      </div>

      {/* Important Instructions */}
      <div className="mx-4 bg-white rounded-2xl border border-[#EEEEEE] px-4 py-4">
        <h3 className="text-[16px] font-nunito font-semibold text-[#101828] mb-3">
          Important Instructions
        </h3>
        <ul className="space-y-2">
          <li className="flex gap-2 text-[13px] text-[#645E66] font-varela">
            <span className="shrink-0">•</span>
            <span>Please arrive at the pickup location 5 minutes before your selected time</span>
          </li>
          <li className="flex gap-2 text-[13px] text-[#645E66] font-varela">
            <span className="shrink-0">•</span>
            <span>Show your Order ID or QR code to the staff at the pickup counter</span>
          </li>
          <li className="flex gap-2 text-[13px] text-[#645E66] font-varela">
            <span className="shrink-0">•</span>
            <span>You'll receive a notification when your order is ready</span>
          </li>
          <li className="flex gap-2 text-[13px] text-[#645E66] font-varela">
            <span className="shrink-0">•</span>
            <span>For any issues, contact us {cafePhone ? `at ${cafePhone}` : "at the restaurant"}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default OrderConfirmed;
