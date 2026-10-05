import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft, Clock, MapPin, Phone, ShoppingCart, ShieldCheck, User, Utensils } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Barcode from "react-barcode";
import toast from "react-hot-toast";
import { useCart } from "../../Context/CartContext";
import api, { settingsAPI, razorpayAPI, walletAPI } from "../../utils/api";
import { useAuth } from "../../Context/AuthContext";
import { rememberOrderIds, getCustomerOrderSession } from "../../utils/customerOrderIds";
import { useMenu } from "../../Context/MenuContext";
import { resolveImageUrl } from "../../utils/image";
import { getActiveTenant } from "../../utils/tenant";
import useSocketEvent from "../../hooks/useSocketEvent";
import { joinRoom } from "../../utils/socket";
import { computeBill, toTaxConfig } from "../../utils/billing";

// Load the Razorpay checkout script on demand. Same pattern as
// Payment.jsx — kept local instead of in utils/ because it's the only
// other place that opens checkout.
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// Look up a real image for an order item by matching its menuItem id or
// name against the cached menu. Backend order items don't store images
// (see Backend/models/order.js orderItemSchema), so without this the
// bill preview renders broken <img> icons.
function resolveItemImage(item, menuItems) {
  if (item?.image) return item.image;
  if (!Array.isArray(menuItems) || menuItems.length === 0) return "";
  const match = menuItems.find(
    (m) =>
      (item?.menuItem && (m._id === item.menuItem || m.id === item.menuItem)) ||
      (item?.name && m.name === item.name) ||
      (item?.title && m.name === item.title),
  );
  return match?.image || "";
}

// Inline SVG used as a visible placeholder when no image is available.
// Keeps the layout consistent without depending on a network URL.
const ItemImageFallback = () => (
  <div className="w-full h-full flex items-center justify-center bg-[#F7F7F7]">
    <Utensils size={22} className="text-[#B6AEB8]" />
  </div>
);

// ─── Helper ───────────────────────────────────────────────────────────────────
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
  } catch (_) {
    return null;
  }
}

// ─── Takeaway Bill Preview ─────────────────────────────────────────────────────
const TakeawayBillPreview = ({ state }) => {
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const { menuItems } = useMenu();
  const { user, isGuest, isLoggedIn } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [merchantName, setMerchantName] = useState("BestoDine");
  const {
    items: rawItems = [],
    subtotal = 0,
    couponDiscount = 0,
    appliedCoupon,
    appliedPoints = 0,
    tipAmount = 0,
    selectedTime,
    selectedDay,
    total: backendTotal = 0,
    backendOrderId,
    backendOrderObjectId,
    orderPayload,
    cartItemsForStorage,
    deliveryFee = 0,
    delivery,
  } = state;

  const items = useMemo(
    () =>
      (rawItems || []).map((item) => ({
        ...item,
        image: resolveItemImage(item, menuItems),
      })),
    [rawItems, menuItems],
  );

  // Fetch tax rates from settings (for display breakdown only — grandTotal uses backend total).
  // Service charge is a dine-in (table service) charge — it never applies
  // to takeaway / home delivery, so this preview pins it to 0 regardless
  // of the tenant's serviceCharge setting (mirrors utils/billing and the
  // server's order total calculation).
  const [taxConfig, setTaxConfig] = useState({ gstPct: 5, servicePct: 0, additionalCharges: [] });
  const [cafeContact, setCafeContact] = useState("");
  const [cafeAddress, setCafeAddress] = useState("");
  const [estimatedPrepTime, setEstimatedPrepTime] = useState("25–30");
  useEffect(() => {
    settingsAPI.getSettings().then(res => {
      if (res.data) {
        // Settings may arrive at the top level or under `.data` depending
        // on which controller path serves the request — normalise once.
        const data = res.data;
        const general = data.general || data.data?.general || {};
        const taxes = data.taxes || data.data?.taxes;
        // computeBill drops the service charge for takeaway/delivery.
        if (taxes) setTaxConfig(toTaxConfig(taxes));
        // The settings field is `general.contactNumber` — older code
        // looked for a top-level `contactPhone` and never resolved.
        const phone = general.contactNumber || data.contactPhone || "";
        if (phone) setCafeContact(phone);
        if (data.estimatedPrepTime) setEstimatedPrepTime(data.estimatedPrepTime);
        if (general.cafeName) setMerchantName(general.cafeName);
        // Build a clean address from the structured fields, falling back
        // to the flat `general.address` string for older settings docs.
        const ad = general.addressDetails;
        const structured = ad
          ? [ad.line1, ad.line2, ad.city, ad.state, ad.pincode].filter(Boolean).join(", ")
          : "";
        setCafeAddress(structured || general.address || "");
      }
    }).catch(() => {});
  }, []);

  // Bill math lives in utils/billing (mirror of the server's
  // Backend/utils/billing.js) so this preview rounds exactly like the
  // server that re-prices the order.
  const bill = computeBill({
    subtotal,
    taxConfig,
    // This preview only serves takeaway / home delivery — never dine-in.
    orderType: delivery || Number(deliveryFee) > 0 ? "delivery" : "takeaway",
    couponDiscount,
    tipAmount,
    deliveryFee,
  });
  const { gst, gstPct, serviceCharge, serviceChargePct, additionalCharges: activeCharges } = bill;
  // Authoritative billable total — full pre-redemption amount. The
  // wallet (when used) pays this in a separate transaction; Razorpay
  // is only used for the remainder. We don't pass `pointsRedeemed` to
  // the order endpoint at all, because the cart's "wallet balance" is
  // `wallet.balance` (rupees) while the endpoint's `pointsRedeemed` is
  // a count of loyalty points (different field — see wallet model).
  // deliveryFee is the slab charge threaded from the cart. It MUST be in
  // grandTotal — the server's serverMinTotal includes it, so omitting it
  // here would make createCafeOrder POST a total below the floor and get
  // rejected with TOTAL_TAMPERED right after Razorpay charges.
  const grandTotal = bill.total;

  // ── Split-rail wallet payment ──────────────────────────────────────
  // The customer can apply any portion of their wallet balance toward
  // the order. We split the payment:
  //   walletAmount   — paid from wallet.balance via walletAPI.payWithWallet
  //   razorpayAmount — paid via Razorpay (skipped if wallet covers all)
  // Both rails together cover grandTotal. The order's walletAmountPaid
  // field records the wallet portion so verify-payment doesn't lose it.
  const walletAvailable = Math.max(0, Number(appliedPoints) || 0);
  const walletAmount = Math.min(walletAvailable, grandTotal);
  const razorpayAmount = parseFloat((grandTotal - walletAmount).toFixed(2));
  const walletCoversFull = razorpayAmount <= 0.5 && walletAmount > 0;

  const branch = (() => {
    try {
      return JSON.parse(localStorage.getItem("selectedBranch") || "null");
    } catch {
      return null;
    }
  })();

  // Branch name as picked at cart-time. orderPayload.pickupLocation is the
  // authoritative label written onto the order itself. Prefer that.
  const branchName = orderPayload?.pickupLocation || branch?.name || "";
  // Address: structured branch fields → flat localStorage fields → tenant
  // settings address. No hardcoded "demo" fallback — empty is honest.
  const pickupAddress = (() => {
    if (branch) {
      const parts = [
        branch.addressLine1,
        branch.addressLine2,
        branch.city,
        branch.state,
        branch.postalCode || branch.pincode,
      ].filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
    return cafeAddress || "";
  })();

  // Customer info — pulled from the orderPayload Cart.jsx already built,
  // so it matches what the backend will receive on submission.
  const customerName = orderPayload?.customerName || user?.name || "Guest";
  const customerPhone = orderPayload?.phone || user?.mobile || "";

  // No real Order ID exists yet (the cafe order is created after Razorpay
  // confirms payment), so don't fake one — call it a Preview.
  const displayOrderId = backendOrderId || "";
  const headerTitle = displayOrderId ? `Order ID: ${displayOrderId}` : "Order Preview";

  // Bill-summary derived numbers used in the redesigned layout.
  // Savings exclude `appliedPoints` because we just dropped wallet
  // redemption above — only the coupon-driven savings still apply.
  const totalItemCount = items.reduce((sum, it) => sum + (it.quantity || 1), 0);
  const totalSavings = (couponDiscount || 0);

  // Build a human-readable pickup time label. `selectedDay` from the
  // cart is the AM/PM period toggle (used to filter time slots), NOT a
  // weekday — and the AM/PM is already encoded in the 12-hour time
  // string itself, so we drop it here. Always render "Today, <time>"
  // since takeaway slots are same-day.
  const pickupTimeLabel = selectedTime ? `Today, ${selectedTime}` : "Today, Soon";

  // Common create-order helper. Overrides cart-supplied `pointsRedeemed`
  // — the cart's "wallet balance" is rupees, not loyalty points; treating
  // it as the latter was the original TOTAL_TAMPERED root cause. The
  // wallet portion is debited AFTER the order is created via the dedicated
  // wallet pay endpoint (which requires order._id), and verify-payment
  // detects the prior wallet payment and ADDS the Razorpay capture to it.
  //
  // `checkout` (Razorpay handler response) is sent as `razorpayPayment`
  // so the server claims the capture at creation — only the three ids,
  // never the rest of the checkout object. When the wallet pays part of
  // the bill, `walletAmountPaid` tells the server the capture only has
  // to cover (total − walletAmountPaid); the server validates the wallet
  // balance, and the wallet is still debited afterwards via
  // walletAPI.payWithWallet.
  const createCafeOrder = async (paymentMethod, { checkout, walletAmountPaid } = {}) => {
    const { data } = await api.post("/orders", {
      ...orderPayload,
      pointsRedeemed: 0,
      total: grandTotal,
      paymentMethod,
      ...(checkout ? {
        razorpayPayment: {
          razorpay_order_id: checkout.razorpay_order_id,
          razorpay_payment_id: checkout.razorpay_payment_id,
          razorpay_signature: checkout.razorpay_signature,
        },
      } : {}),
      ...(walletAmountPaid > 0 ? { walletAmountPaid } : {}),
    });
    if (!data.success) throw new Error("Failed to create order");

    // Remember only the order ID (#22); order screens re-fetch it from
    // the server.
    rememberOrderIds(getCustomerOrderSession(user, isLoggedIn), [String(data.order.orderId)]);
    window.dispatchEvent(new Event("storage_sync"));

    return data.order;
  };

  // Navigate to the order-confirmed page after either rail succeeds.
  const finishOrder = (cafeOrderId, paymentMethod) => {
    clearCart();
    if (isGuest) {
      localStorage.setItem("guest_bill_paid_at", Date.now().toString());
    }
    navigate("/customer/order-confirmed", {
      replace: true,
      state: {
        orderId: cafeOrderId,
        items: cartItemsForStorage || [],
        total: grandTotal,
        isTakeaway: true,
        selectedTime: orderPayload?.pickupTime,
        paymentMethod,
      },
    });
  };

  // Full-wallet path — wallet covers the entire bill; skip Razorpay.
  // Order MUST be created first because /wallet/pay requires an
  // existing order._id (it computes payable = total - amountPaid and
  // updates the order in the same request).
  const handleFullWalletPayment = async () => {
    try {
      const createdOrder = await createCafeOrder("wallet");
      const payRes = await walletAPI.payWithWallet(walletAmount, createdOrder._id);
      if (!payRes?.data?.success) {
        toast.error("Wallet payment failed. Please try again.", { id: "pay-wallet-err" });
        setIsProcessing(false);
        return;
      }

      toast.success(`Paid ₹${walletAmount.toFixed(0)} from wallet.`, { id: "pay-wallet-success", duration: 4000 });
      finishOrder(createdOrder.orderId, "wallet");
    } catch (err) {
      console.error("Wallet payment error:", err);
      const backendMsg = err?.response?.data?.message || err?.message || "Wallet payment failed.";
      toast.error(backendMsg, { id: "pay-wallet-err" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayBill = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    // Wallet covers it entirely → skip Razorpay, pay from wallet.
    if (walletCoversFull) {
      await handleFullWalletPayment();
      return;
    }

    // Otherwise: Razorpay rail. Razorpay charges `razorpayAmount`
    // (= grandTotal - walletAmount). The wallet portion is debited
    // after Razorpay clears so a Razorpay failure never drains the
    // customer's wallet.
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      toast.error("Failed to load payment gateway. Please check your internet connection.", { id: "pay-gateway-load" });
      setIsProcessing(false);
      return;
    }

    try {
      // Deferred takeaway — cafeOrderId doesn't exist yet, so we create
      // the Razorpay order with a null id; the cafe order is created
      // inside the success handler once payment is confirmed.
      // razorpayAmount = grandTotal - walletAmount (split-rail). Wallet
      // is only debited AFTER Razorpay clears so a Razorpay failure
      // never silently drains the customer's wallet.
      const { data } = await razorpayAPI.createOrder(razorpayAmount, null);
      if (!data.success) {
        toast.error("Failed to initiate payment. Please try again.", { id: "pay-init" });
        setIsProcessing(false);
        return;
      }

      const options = {
        key: data.key,
        amount: data.razorpayOrder.amount,
        currency: data.razorpayOrder.currency,
        name: merchantName,
        description: walletAmount > 0
          ? `Takeaway · ₹${razorpayAmount.toFixed(2)} online + ₹${walletAmount.toFixed(2)} wallet`
          : "Takeaway Order Payment",
        order_id: data.razorpayOrder.id,
        handler: async (response) => {
          // Money has already left the customer's account at this point.
          // If anything below fails we MUST surface enough information
          // for the customer to get refunded — the Razorpay payment_id
          // is the lookup key staff need to find the orphaned charge.
          try {
            // Step 1 — create the cafe order. We need its _id to debit
            // the wallet (the /wallet/pay endpoint requires orderId so it
            // can compute the payable delta server-side and tie the
            // wallet transaction to the order).
            const createdOrder = await createCafeOrder("online", {
              checkout: response,
              walletAmountPaid: walletAmount,
            });
            const cafeOrderId = createdOrder.orderId;

            // Step 2 — debit the wallet portion (if any). Sequence
            // matters: this runs BEFORE verify-payment so verify can
            // observe `order.amountPaid > 0` and ADD the Razorpay
            // capture to it (instead of overwriting). If wallet debit
            // fails, the order falls through with only the Razorpay
            // portion paid — surface the payment_id for staff lookup.
            if (walletAmount > 0) {
              try {
                const walletRes = await walletAPI.payWithWallet(walletAmount, createdOrder._id);
                if (!walletRes?.data?.success) {
                  throw new Error(walletRes?.data?.message || "Wallet deduction failed");
                }
              } catch (walletErr) {
                console.warn("Wallet deduction failed after Razorpay charge:", walletErr);
                const walletMsg = walletErr?.response?.data?.message || walletErr?.message || "Wallet deduction failed";
                toast(
                  `${walletMsg}. Online portion paid; please contact staff at the counter to settle the wallet portion.`,
                  { id: "wallet-deduct-warn", icon: "⚠️", duration: 12000 }
                );
              }
            }

            const verifyRes = await razorpayAPI.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              cafeOrderId,
            });

            if (verifyRes.data.success) {
              toast.success("Payment successful! Thank you.", { id: "pay-success", duration: 4000 });
              finishOrder(cafeOrderId, "online");
            } else {
              // Verify failed but the order DOES exist server-side — the
              // payment just isn't linked yet. Don't show raw Razorpay
              // ids to the customer; staff can look them up via order id.
              const serverMsg = verifyRes.data?.message || "Payment verification failed.";
              toast.error(
                `${serverMsg} Please contact staff at the counter to confirm your payment.`,
                { id: "pay-verify-err", duration: 12000 }
              );
            }
          } catch (verifyErr) {
            console.error("Takeaway order/verify error:", verifyErr);
            // Kick off the auto-refund the instant the order-creation
            // step rejected. The customer sees a clean "we're refunding
            // you" message; the technical reason (out-of-stock, coupon
            // expiry, etc.) goes to the admin alert that fires server-
            // side. Run it in the background — we always swap the toast
            // regardless so the customer isn't left staring at a
            // spinner if Razorpay itself is slow to refund.
            const backendMsg = verifyErr?.response?.data?.message
              || verifyErr?.response?.data?.code
              || verifyErr?.message
              || "Order could not be saved.";
            try {
              razorpayAPI.orphanRefund({
                razorpay_payment_id: response.razorpay_payment_id,
                // Checkout signature proves to the server this browser
                // made the payment (required for guests without a login).
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                reason: backendMsg,
              }).catch((refundErr) => {
                console.warn("Orphan-refund call failed:", refundErr);
              });
            } catch { /* fire-and-forget */ }
            toast.error(
              "We couldn't place this order. Your payment is being refunded automatically — it'll be back in your account in 5–7 business days.",
              { id: "pay-verify-err", duration: 12000 }
            );
          }
          setIsProcessing(false);
        },
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.mobile || "",
        },
        theme: { color: "#FE8301" },
        modal: {
          ondismiss: () => setIsProcessing(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (response) => {
        toast.error(`Payment failed: ${response.error.description}`);
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err) {
      console.error("Takeaway payment error:", err);
      toast.error("Failed to initiate payment. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-28">
      {/* Header */}
      <header className="px-4 py-4 flex items-center justify-between bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Back"
          >
            <ChevronLeft size={24} className="text-[#666666]" />
          </button>
          <span className="text-[16px] font-medium text-[#1A181B] font-nunito leading-[28px]">
            {headerTitle}
          </span>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#FE8301] bg-[#FFF9F2] px-2.5 py-1 rounded-full">
          {delivery?.requested ? 'Delivery' : 'Takeaway'}
        </span>
      </header>

      <main className="px-4 pt-4 flex-1">
        {/* ── Customer Info — small "ordering as" line so the customer
              can verify the name/phone we'll attach to the order before
              they pay. Only shown when we actually have data; guests with
              no captured contact see nothing instead of empty rows. ── */}
        {(customerName || customerPhone) && (
          <div className="bg-[#FFF9F2] border border-[#FFE9D1] rounded-[16px] px-4 py-3 mb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
              <User size={18} className="text-[#FE8301]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-[#8D848F] font-varela leading-[14px]">
                Ordering as
              </p>
              <p className="text-[14px] font-nunito font-semibold text-[#1A181B] truncate">
                {customerName}
                {customerPhone && (
                  <span className="font-varela font-normal text-[#645E66]">
                    {" "}· {customerPhone}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* ── Bill Summary Card ─────────────────────────── */}
        <div className="bg-white rounded-[16px] border border-[#EEEEEE] px-4 pt-4 pb-5 mb-4">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[18px] font-nunito font-semibold text-[#101828]">
              Bill Summary
            </h2>
            <span className="text-[12px] font-varela text-[#8D848F]">
              {totalItemCount} {totalItemCount === 1 ? "item" : "items"}
            </span>
          </div>

          {/* Items */}
          <div className="space-y-4 mb-5">
            {items.map((item, idx) => {
              const qty = item.quantity || 1;
              const unitPrice = parseFloat(item.unitPrice || item.price || 0);
              const lineTotal = unitPrice * qty;
              const description = item.desc || item.customization;
              // Portion suffix only for weight/volume units (e.g. "· 500 ml");
              // for count units (plate/pieces) the size name already says it,
              // so "· 4plate" / "· 1pieces" is just noise — drop it.
              const MEASUREMENT_UNITS = ["gm", "g", "kg", "ml", "liter", "litre"];
              const portionSuffix =
                item.sizeQuantity && MEASUREMENT_UNITS.includes(String(item.unit || "").toLowerCase())
                  ? ` · ${item.sizeQuantity} ${item.unit}`
                  : "";
              // Selected size + toppings (same logic as the cart card) so the
              // bill reflects exactly what was customized.
              const sizeChips = (
                item.selectedSizes && item.selectedSizes.length > 0
                  ? item.selectedSizes.map((s) => s.name)
                  : (item.size ? [item.size] : [])
              ).filter((n) => n && String(n).toLowerCase() !== "regular");
              const isCustomizedLine =
                typeof item.size === "string" ||
                Array.isArray(item.selectedSizes) ||
                Array.isArray(item.selectedToppings);
              const toppingChips =
                item.selectedToppings && item.selectedToppings.length > 0
                  ? item.selectedToppings.map((t) => t.name)
                  : (isCustomizedLine && Array.isArray(item.toppings)
                      ? item.toppings.map((t) => t?.name).filter(Boolean)
                      : []);
              const customChips = [
                ...sizeChips.map((n) => `${n}${portionSuffix}`),
                ...toppingChips,
              ];
              return (
                <div key={idx} className="flex gap-3">
                  <div className="w-[68px] h-[68px] rounded-[12px] overflow-hidden shrink-0 bg-[#F7F7F7]">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <ItemImageFallback />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[15px] font-nunito font-semibold text-[#101828] truncate mb-0.5 leading-[22px]">
                          {item.title}
                        </h3>
                        {description && (
                          <p className="text-[13px] text-[#645E66] font-varela mb-1.5 line-clamp-1 leading-[18px]">
                            {description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <div className="inline-flex items-center justify-center px-3 py-1 bg-[#F7F7F7] rounded-lg">
                            <span className="text-[11px] text-[#8D848F] font-varela leading-[14px]">
                              Qty:{qty}
                            </span>
                          </div>
                          {customChips.map((c, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-[#FDF5FF] text-[#7D7380] font-varela leading-[14px] whitespace-nowrap"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="text-[14px] font-varela text-[#101828] pt-1 leading-[18px] shrink-0 tabular-nums">
                        ₹{lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div className="border-t border-[#EEEEEE] mb-4" />

          {/* Pricing */}
          <div className="space-y-3">
            {/* Subtotal — sum of line items before any taxes/charges, so
                 the customer can see what they're being charged tax on. */}
            <div className="flex justify-between items-center">
              <span className="text-[14px] text-[#645E66] font-varela">
                Subtotal
              </span>
              <span className="text-[14px] text-[#645E66] font-varela tabular-nums">
                ₹{bill.subtotal.toFixed(2)}
              </span>
            </div>
            {gstPct > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-[#645E66] font-varela">
                  GST ({gstPct}%)
                </span>
                <span className="text-[14px] text-[#645E66] font-varela tabular-nums">
                  ₹{gst.toFixed(2)}
                </span>
              </div>
            )}
            {serviceChargePct > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-[#645E66] font-varela">
                  Service Charge ({serviceChargePct}%)
                </span>
                <span className="text-[14px] text-[#645E66] font-varela tabular-nums">
                  ₹{serviceCharge.toFixed(2)}
                </span>
              </div>
            )}
            {activeCharges.map((charge, idx) => {
              const amt = charge.amount;
              return (
                <div key={idx} className="flex justify-between items-center">
                  <span className="text-[14px] text-[#645E66] font-varela">
                    {charge.name} {charge.type === 'Percentage' ? `(${charge.value}%)` : ''}
                  </span>
                  <span className="text-[14px] text-[#645E66] font-varela tabular-nums">
                    ₹{amt.toFixed(2)}
                  </span>
                </div>
              );
            })}
            {tipAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-[#645E66] font-varela">
                  Tip
                </span>
                <span className="text-[14px] text-[#645E66] font-varela tabular-nums">
                  ₹{tipAmount.toFixed(2)}
                </span>
              </div>
            )}
            {Number(deliveryFee) > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-[#645E66] font-varela">
                  Delivery{delivery?.distanceKm != null ? ` (${Number(delivery.distanceKm).toFixed(1)} km)` : delivery?.slab ? ` (${delivery.slab.fromKm}–${delivery.slab.toKm} km)` : ''}
                </span>
                <span className="text-[14px] text-[#645E66] font-varela tabular-nums">
                  ₹{Number(deliveryFee).toFixed(2)}
                </span>
              </div>
            )}
            {couponDiscount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[14px] text-[#027A48] font-varela">
                  Coupon{appliedCoupon?.coupon?.code ? ` (${appliedCoupon.coupon.code})` : ""}
                </span>
                <span className="text-[14px] text-[#027A48] font-varela tabular-nums">
                  -₹{couponDiscount.toFixed(2)}
                </span>
              </div>
            )}
            {/* (No wallet line here — wallet credit is shown as a
                Payment Breakdown below the Total row, so the bill
                ledger above stays a clean subtotal + charges view.) */}

            <div className="flex justify-between items-center pt-2 mt-1 border-t border-dashed border-[#EEEEEE]">
              <span className="text-[16px] font-nunito font-semibold text-[#101828] leading-[22px]">
                Total Payment
              </span>
              <span className="text-[16px] font-nunito font-semibold text-[#101828] leading-[22px] tabular-nums">
                ₹{grandTotal.toFixed(2)}
              </span>
            </div>
            {totalSavings > 0 && (
              <div className="mt-1 text-center text-[12px] font-varela text-[#027A48] bg-[#ECFDF3] border border-[#ABEFC6] rounded-lg py-1.5">
                You're saving ₹{totalSavings.toFixed(2)} on this order 🎉
              </div>
            )}

            {/* Payment Breakdown — visible only when split. Lines up
                below Total Payment so the customer sees clearly: the
                bill is ₹X, of which ₹Y comes from wallet and ₹Z is
                charged via Razorpay. */}
            {walletAmount > 0 && (
              <div className="mt-3 pt-3 border-t border-dashed border-[#EEEEEE] space-y-2">
                <p className="text-[12px] font-nunito font-semibold text-[#1A181B]">
                  Payment Breakdown
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-[13px] text-[#027A48] font-varela">
                    From Wallet
                  </span>
                  <span className="text-[13px] text-[#027A48] font-varela tabular-nums">
                    -₹{walletAmount.toFixed(2)}
                  </span>
                </div>
                {razorpayAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-[#1A181B] font-varela">
                      Pay via Razorpay
                    </span>
                    <span className="text-[13px] font-nunito font-semibold text-[#1A181B] tabular-nums">
                      ₹{razorpayAmount.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Pickup Time Card ──────────────────────────── */}
        <div className="bg-white rounded-[16px] border border-[#EEEEEE] px-4 py-4 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                <Clock size={18} className="text-[#FE8301]" />
              </div>
              <span className="text-[16px] font-nunito font-semibold text-[#101828]">
                Pickup Time
              </span>
            </div>
            <span className="text-[14px] font-varela text-[#645E66]">
              {pickupTimeLabel}
            </span>
          </div>
          <p className="text-[13px] text-[#007AFF] font-varela leading-[18px] pl-12">
            Ready in approx. {estimatedPrepTime} mins
          </p>
        </div>

        {/* ── Delivery Address Card — shown only for home-delivery orders.
              The order is delivered to this address by the cafe's staff. */}
        {delivery?.requested && delivery?.address && (
          <div className="bg-white rounded-[16px] border border-[#EEEEEE] px-4 py-4 mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                <MapPin size={18} className="text-[#FE8301]" />
              </div>
              <span className="text-[16px] font-nunito font-semibold text-[#101828]">
                Delivering To
              </span>
            </div>
            <div className="pl-12 space-y-1">
              <p className="text-[14px] text-[#1A181B] font-varela leading-[20px] whitespace-pre-line">
                {delivery.address}
              </p>
              {delivery.slab && (
                <p className="text-[12px] text-[#8D848F] font-varela">
                  {delivery.distanceKm != null ? `Distance: approx. ${Number(delivery.distanceKm).toFixed(1)} km · ` : ''}Distance range: {delivery.slab.fromKm}–{delivery.slab.toKm} km
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Pickup Location Card — cafe name → branch (when distinct) →
              full address → tappable contact. Drops the previous demo
              fallback string in favour of an honest empty state. ── */}
        <div className="bg-white rounded-[16px] border border-[#EEEEEE] px-4 py-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
              <MapPin size={18} className="text-[#FE8301]" />
            </div>
            <span className="text-[16px] font-nunito font-semibold text-[#101828]">
              Pickup Location
            </span>
          </div>
          <div className="pl-12 space-y-1">
            {(merchantName || branchName) && (
              <p className="text-[14px] font-nunito font-semibold text-[#1A181B]">
                {merchantName || branchName}
                {merchantName && branchName && branchName !== merchantName && (
                  <span className="text-[#645E66] font-varela font-normal">
                    {" "}— {branchName}
                  </span>
                )}
              </p>
            )}
            <p className="text-[13px] text-[#645E66] font-varela leading-[18px]">
              {pickupAddress || "Address not configured."}
            </p>
            {cafeContact && (
              <a
                href={`tel:${cafeContact}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-[#FE8301] font-varela font-semibold mt-1 hover:underline"
              >
                <Phone size={12} />
                {cafeContact}
              </a>
            )}
          </div>
        </div>
      </main>

      {/* Fixed Footer — payment hint reflects which rail will fire.
           Three states:
             1. Full wallet  → skip Razorpay entirely
             2. Partial wallet + Razorpay → split, wallet debited only
                                              after Razorpay clears
             3. No wallet    → Razorpay full charge */}
      <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full lg:max-w-3xl p-4 bg-white border-t border-[#F0F0F0] z-50">
        <div className="flex items-center justify-center gap-1.5 mb-2">
          <ShieldCheck size={14} className="text-[#027A48]" />
          <span className="text-[11px] font-varela text-[#645E66]">
            {walletCoversFull
              ? `Paying ₹${walletAmount.toFixed(2)} from your wallet balance`
              : walletAmount > 0
                ? `₹${walletAmount.toFixed(2)} wallet + ₹${razorpayAmount.toFixed(2)} via Razorpay`
                : "Secure payment via Razorpay · UPI, Card, Net Banking"}
          </span>
        </div>
        <button
          onClick={handlePayBill}
          disabled={isProcessing}
          className={`w-full py-3 rounded-xl font-semibold font-nunito text-[14px] shadow-lg flex items-center justify-center gap-2 text-white transition-transform ${
            isProcessing
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-[#FE8301] active:scale-[0.98]"
          }`}
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border border-white border-t-transparent rounded-full animate-spin"></div>
              <span>{walletCoversFull ? "Charging wallet…" : "Opening payment…"}</span>
            </>
          ) : (
            <>
              <ShoppingCart size={18} />
              <span>
                {walletCoversFull
                  ? `Pay ₹${walletAmount.toFixed(0)} from Wallet`
                  : walletAmount > 0
                    ? `Pay ₹${razorpayAmount.toFixed(0)} (₹${walletAmount.toFixed(0)} wallet)`
                    : `Pay Bill ₹${grandTotal.toFixed(0)}`}
              </span>
            </>
          )}
        </button>
      </footer>
    </div>
  );
};

// ─── Dine-in Bill Preview (original) ──────────────────────────────────────────
const DineInBillPreview = () => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const { menuItems } = useMenu();
  const [tableNumber, setTableNumber] = useState(getTableNumber);
  const [orders, setOrders] = useState([]);
  const [taxConfig, setTaxConfig] = useState({ gstPct: 5, servicePct: 10, additionalCharges: [] });

  useEffect(() => {
    const syncTableNum = () => {
      setTableNumber(getTableNumber());
    };
    window.addEventListener("storage", syncTableNum);
    window.addEventListener("storage_sync", syncTableNum);
    return () => {
      window.removeEventListener("storage", syncTableNum);
      window.removeEventListener("storage_sync", syncTableNum);
    };
  }, []);

  // Seed identity from the active-tenant branding blob (Phase 7.4
   // white-label). That's the customer-facing source of truth for
   // logo + cafe name — it's already cached in localStorage after
   // branch selection, so the bill preview paints correctly on first
   // render without waiting for the /settings round-trip.
  const [cafeIdentity, setCafeIdentity] = useState(() => {
    const t = getActiveTenant();
    return {
      name: t?.name || "",
      logoUrl: t?.branding?.logoUrl || "",
      address: "",
      contactNumber: "",
      email: "",
    };
  });

  // Fetch tax + general (cafe name / logo / address / contact) settings.
  // /settings carries the admin-configured branch-level overrides, so if
  // it returns branch-specific cafeName/address prefer those over the
  // tenant-level branding. Address + contact match the waiter bill so
  // the printed receipt context is the same across roles.
  useEffect(() => {
    settingsAPI.getSettings().then(res => {
      if (res.data) {
        const taxes = res.data.taxes;
        if (taxes) setTaxConfig(toTaxConfig(taxes));
        const general = res.data.general;
        if (general) {
          setCafeIdentity((prev) => ({
            name: general.cafeName || prev.name,
            logoUrl: general.logoUrl || prev.logoUrl,
            address: general.address || prev.address,
            contactNumber: general.contactNumber || prev.contactNumber,
            email: general.email || prev.email,
          }));
        }
      }
    }).catch(() => {});
  }, []);

  // Tracks whether at least one fetchActiveOrder cycle has completed.
  // Used by the empty-state branch below to avoid flashing "Nothing to
  // pay" during the first paint before we've actually checked.
  const [loadAttempted, setLoadAttempted] = useState(false);

  // Fetch the active order for the customer's CURRENT table — same
  // endpoint for both logged-in and guest so the bill can't show stale
  // past orders merged together. Previously the logged-in path called
  // /orders/my-orders and concatenated every delivered order the user
  // had ever placed, which produced a bill with 9 items / ₹2726 when
  // the real active order on the table was 5 items / ₹810. The admin
  // drawer, waiter bill and this preview now all pull the same source.
  const fetchActiveOrder = React.useCallback(() => {
    const dineInTable = JSON.parse(localStorage.getItem('dineInTable') || '{}');
    const tableId = dineInTable._id;
    const finish = () => setLoadAttempted(true);
    if (tableId) {
      // Independent-orders model: a table can have MULTIPLE unpaid rounds
      // (e.g. a repeat placed after the first round was served lands as
      // its own order so the kitchen doesn't re-cook the served items).
      // Pull the FULL list and aggregate so the final bill sums every
      // round — the singular /active/table endpoint returns only one and
      // produced a bill that under-counted the table.
      api.get(`/orders/active-list/table/${tableId}`).then(res => {
        if (res.data?.success && Array.isArray(res.data.orders)) {
          setOrders(res.data.orders);
        } else {
          // Server says nothing unpaid on this table — clear the local
          // cache rather than falling back to a stale Delivered entry
          // that produces a "₹0 / ₹0" bill summary after payment.
          setOrders([]);
        }
        finish();
      }).catch(() => {
        // Transient failure — keep whatever the last good fetch showed.
        finish();
      });
    } else {
      // No table in this session → nothing to bill here.
      finish();
    }
  }, []);

  useEffect(() => {
    fetchActiveOrder();
  }, [isLoggedIn, fetchActiveOrder]);

  // Live sync — when a waiter applies a coupon, admin appends an item,
  // or payment completes, the server emits `order:updated`. Join the
  // per-order room and refetch so the bill total stays in step with
  // the admin drawer and waiter bill instead of going stale.
  // Track EVERY round's id so a payment / append / status change on any
  // of the table's orders refreshes the aggregated bill — not just the
  // first round.
  const orderIdsKey = orders.map(o => o.orderId || o.id || o._id).filter(Boolean).join(',');
  useEffect(() => {
    orderIdsKey.split(',').filter(Boolean).forEach(id => joinRoom(`order:${id}`));
  }, [orderIdsKey]);
  const refetchIfMine = (payload) => {
    if (!payload?.orderId) return;
    const ids = orderIdsKey.split(',').filter(Boolean).map(String);
    if (ids.includes(String(payload.orderId))) fetchActiveOrder();
  };
  useSocketEvent('order:updated', refetchIfMine);
  useSocketEvent('order:appended', refetchIfMine);
  useSocketEvent('order:new', fetchActiveOrder);

  const pendingOrders = orders;

  React.useEffect(() => {
    if (pendingOrders.length === 0 && orders.length === 0) {
      // Only redirect after we've tried loading
    }
  }, [pendingOrders.length, navigate]);

  const cancelledOrders = JSON.parse(
    localStorage.getItem("cancelled_orders_v1") || "{}",
  );

  const displayItems = pendingOrders.flatMap((order) => {
    const items = order.items || [];
    return items
      .map((item, index) => ({
        ...item,
        title: item.title || item.name,
        image: resolveItemImage(item, menuItems),
        compositeId: `${order.id || order._id}-${index}`,
      }))
      .filter((item) => !cancelledOrders[item.compositeId]);
  });

  const subtotalRaw = displayItems.reduce((sum, item) => {
    const priceToUse = item.unitPrice || item.price || 0;
    return sum + priceToUse * item.quantity;
  }, 0);
  // Tip + coupon + wallet-point adjustments are stored ON the order,
  // not derived at display time. Surfacing them here keeps this bill
  // view in sync with the admin drawer and waiter bill — which all
  // three showed different totals before because each was picking a
  // different subset of these fields.
  const primaryOrder = pendingOrders[0] || {};
  // Sum adjustments across EVERY round on the table — a tip/coupon/points
  // redemption recorded on any round must count toward the table's final
  // bill, not just the first order's.
  const tipAmount = pendingOrders.reduce((s, o) => s + (Number(o.tipAmount) || 0), 0);
  const couponDiscount = pendingOrders.reduce((s, o) => s + (Number(o.couponDiscount) || 0), 0);
  const pointsRedeemed = pendingOrders.reduce((s, o) => s + (Number(o.pointsRedeemed) || 0), 0);
  // Manual discount the admin/waiter applied from the table drawer — now
  // persisted on the order, so the customer sees the same reduced total
  // the staff applied.
  const manualDiscount = pendingOrders.reduce((s, o) => s + (Number(o.manualDiscount) || 0), 0);
  // The table's running bill (rounds can be appended after placement),
  // so it is priced live — through utils/billing, the mirror of the
  // server's Backend/utils/billing.js, so rounding matches the waiter
  // bill and the admin drawer. GST is on (subtotal − coupon); the staff
  // manual discount is not a coupon (no GST effect — the server keeps it
  // outside order.total), so it comes off the final figure.
  const bill = computeBill({
    subtotal: subtotalRaw,
    taxConfig,
    orderType: "dine-in",
    couponDiscount,
    pointsRedeemed,
    tipAmount,
  });
  const { subtotal, gst, gstPct, serviceCharge, serviceChargePct, additionalCharges: activeChargesDI } = bill;
  const total = Math.max(0, Math.round((bill.total - manualDiscount) * 100) / 100);

  const displayOrderId =
    pendingOrders.length > 0
      ? `#A${(pendingOrders[0].id || pendingOrders[0]._id || '').toString().slice(-4)}`
      : "#A0000";
  // Real backend orderId (e.g. ORD-0001) for API calls
  const backendOrderId = pendingOrders.length > 0
    ? (pendingOrders[0].orderId || pendingOrders[0].id || pendingOrders[0]._id)
    : null;

  // Empty state — no active unpaid order on the customer's table after
  // we've finished fetching. Replaces the silent "₹0 / ₹0" bill that
  // appeared when the page was reached after the only active order had
  // already been settled (eg. customer landed here from a stale Make
  // Payment button before polling could refresh it).
  if (loadAttempted && pendingOrders.length === 0) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <header className="px-4 py-4 flex items-center justify-between sticky top-0 z-50 bg-white border-b border-gray-100">
          <button
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={24} className="text-[#666666]" />
          </button>
          <span className="text-[16px] font-nunito font-semibold text-[#1A181B]">Bill</span>
          <span className="w-6" />
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#ECFDF3] flex items-center justify-center mb-4">
            <span className="text-[#027A48] text-[28px] font-nunito font-bold">✓</span>
          </div>
          <h2 className="text-[18px] font-nunito font-semibold text-[#1A181B] mb-2">
            All bills settled
          </h2>
          <p className="text-[14px] text-[#645E66] font-varela max-w-[260px] mb-6 leading-[20px]">
            There's no pending bill on your table right now. Place a new order to start a fresh tab.
          </p>
          <div className="flex flex-col gap-3 w-full max-w-[300px]">
            <button
              onClick={() => navigate('/customer/orders')}
              className="h-[48px] bg-[#FE8301] text-white rounded-2xl font-nunito font-semibold text-[14px] active:scale-[0.98] transition-transform"
            >
              Back to Orders
            </button>
            <button
              onClick={() => navigate('/customer/menu')}
              className="h-[48px] bg-[#F5F5F5] text-[#645E66] rounded-2xl font-nunito font-semibold text-[14px] active:scale-[0.98] transition-transform"
            >
              Browse Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col pb-28">
      <header className="px-4 py-3 flex items-center justify-between sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors shrink-0"
            aria-label="Back"
          >
            <ChevronLeft size={24} className="text-[#666666]" />
          </button>
          <div className="min-w-0">
            <p className="text-[15px] font-nunito font-semibold text-[#1A181B] leading-tight truncate">
              {displayOrderId ? `Order #${String(displayOrderId).split('-').pop()?.slice(-6)}` : 'Bill Preview'}
            </p>
            <p className="text-[11px] font-varela text-[#8D848F] leading-tight">
              {displayOrderId || 'Active dine-in'}
            </p>
          </div>
        </div>
        {/* Dine-in pill mirrors the Takeaway pill on the takeaway
            preview so customers visually distinguish the two flows. */}
        <span className="shrink-0 text-[11px] font-nunito font-semibold uppercase tracking-wide text-[#4D7CFF] bg-[#EAF1FF] px-2.5 py-1 rounded-full">
          Dine-in · Table {tableNumber || '—'}
        </span>
      </header>

      <div className="flex flex-col items-center mt-4 mb-2">
        {resolveImageUrl(cafeIdentity.logoUrl) ? (
          <div className="w-[76px] h-[76px] bg-white border border-gray-200 rounded-2xl mb-2 shadow-sm overflow-hidden p-2 flex items-center justify-center">
            <img
              src={resolveImageUrl(cafeIdentity.logoUrl)}
              alt={cafeIdentity.name || "Cafe logo"}
              className="max-w-full max-h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
        ) : (
          <div className="w-[62px] h-[62px] rounded-full bg-[#FF9B0B] mb-2 flex items-center justify-center">
            <span className="text-white font-nunito font-bold text-[22px] select-none">
              {(cafeIdentity.name || "C").charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <h1 className="text-[18px] font-nunito font-semibold text-[#101828] leading-[24px]">
          {cafeIdentity.name || "The Coffee House"}
        </h1>
        {cafeIdentity.address && (
          <p className="text-[13px] text-[#645E66] font-varela mt-1 px-4 text-center leading-[18px]">
            {cafeIdentity.address}
          </p>
        )}
        {(cafeIdentity.contactNumber || cafeIdentity.email) && (
          <p className="text-[12px] text-[#8D848F] font-varela mt-0.5 text-center leading-[16px]">
            {cafeIdentity.contactNumber}
            {cafeIdentity.contactNumber && cafeIdentity.email && ' | '}
            {cafeIdentity.email}
          </p>
        )}
      </div>

      <main className="px-4 flex-1 overflow-y-auto scrollbar-hide">
        <div className="bg-white rounded-[24px] border-[0.5px] border-[#DDDDDD] p-4 mb-4">
          <div className="flex items-baseline justify-between mb-4 gap-2">
            <h2 className="text-[18px] font-nunito font-semibold text-[#101828]">
              Bill Summary
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-varela text-[#8D848F]">
                {displayItems.reduce((s, it) => s + (it.quantity || 1), 0)} {displayItems.reduce((s, it) => s + (it.quantity || 1), 0) === 1 ? 'item' : 'items'}
              </span>
              {/* Payment status pill — paid orders read at a glance
                  even before scrolling to the bottom of the bill. */}
              {primaryOrder.paymentStatus === 'Paid' ? (
                <span className="text-[10px] font-nunito font-semibold uppercase tracking-wide text-[#027A48] bg-[#E5FFEB] px-2 py-0.5 rounded-full">
                  Paid
                </span>
              ) : (
                <span className="text-[10px] font-nunito font-semibold uppercase tracking-wide text-[#FFA601] bg-[#FFEFD0] px-2 py-0.5 rounded-full">
                  Unpaid
                </span>
              )}
            </div>
          </div>
          <div className="space-y-4 mb-4">
            {displayItems.map((item, index) => {
              const qty = item.quantity || 1;
              const unitPrice = parseFloat(item.unitPrice || item.price || 0);
              const lineTotal = unitPrice * qty;
              const description = item.desc || item.customization || item.instructions;
              const MEASUREMENT_UNITS = ["gm", "g", "kg", "ml", "liter", "litre"];
              const portionSuffix =
                item.sizeQuantity && MEASUREMENT_UNITS.includes(String(item.unit || "").toLowerCase())
                  ? ` · ${item.sizeQuantity} ${item.unit}`
                  : "";
              const sizeChips = (
                item.selectedSizes && item.selectedSizes.length > 0
                  ? item.selectedSizes.map((s) => s.name)
                  : (item.size ? [item.size] : [])
              ).filter((n) => n && String(n).toLowerCase() !== "regular");
              const isCustomizedLine =
                typeof item.size === "string" ||
                Array.isArray(item.selectedSizes) ||
                Array.isArray(item.selectedToppings);
              const toppingChips =
                item.selectedToppings && item.selectedToppings.length > 0
                  ? item.selectedToppings.map((t) => t.name)
                  : (isCustomizedLine && Array.isArray(item.toppings)
                      ? item.toppings.map((t) => t?.name).filter(Boolean)
                      : []);
              const customChips = [
                ...sizeChips.map((n) => `${n}${portionSuffix}`),
                ...toppingChips,
              ];
              return (
                <div key={index} className="flex gap-2">
                  <div className="w-[74px] h-[74px] rounded-2xl overflow-hidden shrink-0 bg-[#F7F7F7]">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <ItemImageFallback />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[16px] font-nunito font-semibold text-[#101828] truncate mb-0.5 leading-[24px]">
                          {item.title}
                        </h3>
                        {description && (
                          <p className="text-[14px] text-[#645E66] regular font-varela mb-1 line-clamp-1 leading-[18px]">
                            {description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-[#8D848F] regular font-varela leading-[14px] bg-[#F7F7F7] rounded-lg px-3 py-1">
                            Qty:{qty}
                          </span>
                          {customChips.map((c, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-[#FDF5FF] text-[#7D7380] font-varela leading-[14px] whitespace-nowrap"
                            >
                              {c}
                            </span>
                          ))}
                          <span className="text-[11px] text-[#8D848F] font-varela leading-[14px]">
                            × ₹{unitPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <span className="text-[14px] font-varela text-[#101828] regular pt-1 leading-[18px] tabular-nums">
                        ₹{lineTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 pt-4 border-t border-dashed border-[#EEEEEE]">
            <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
              <span>Subtotal</span>
              <span className="tabular-nums">₹{subtotal.toFixed(2)}</span>
            </div>
            {gstPct > 0 && (
              <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
                <span>GST ({gstPct}%)</span>
                <span className="tabular-nums">₹{gst.toFixed(2)}</span>
              </div>
            )}
            {serviceChargePct > 0 && (
              <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
                <span>Service Charge ({serviceChargePct}%)</span>
                <span className="tabular-nums">₹{serviceCharge.toFixed(2)}</span>
              </div>
            )}
            {(activeChargesDI || []).map((charge, idx) => (
              <div key={idx} className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
                <span>{charge.name} {charge.type === 'Percentage' ? `(${charge.value}%)` : ''}</span>
                <span className="tabular-nums">
                  ₹{charge.amount.toFixed(2)}
                </span>
              </div>
            ))}
            {couponDiscount > 0 && (
              <div className="flex justify-between items-center text-[14px] text-[#027A48] font-varela">
                <span>Coupon{primaryOrder.couponCode ? ` (${primaryOrder.couponCode})` : ''}</span>
                <span className="tabular-nums">-₹{couponDiscount.toFixed(2)}</span>
              </div>
            )}
            {pointsRedeemed > 0 && (
              <div className="flex justify-between items-center text-[14px] text-[#027A48] font-varela">
                <span>Wallet Points</span>
                <span className="tabular-nums">-₹{pointsRedeemed.toFixed(2)}</span>
              </div>
            )}
            {tipAmount > 0 && (
              <div className="flex justify-between items-center text-[14px] text-[#645E66] font-varela">
                <span>Tip</span>
                <span className="tabular-nums">+₹{tipAmount.toFixed(2)}</span>
              </div>
            )}
            {manualDiscount > 0 && (
              <div className="flex justify-between items-center text-[14px] text-[#027A48] font-varela">
                <span>Discount</span>
                <span className="tabular-nums">-₹{manualDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-3 mt-1 border-t border-[#EEEEEE]">
              <span className="text-[16px] font-nunito font-semibold text-[#101828] leading-[22px]">
                Total Payment
              </span>
              <span className="text-[16px] font-nunito font-semibold text-[#101828] leading-[22px] tabular-nums">
                ₹{total.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="mt-4 mb-6 border-t border-dashed border-[#34C759]" />

          {/* Barcode (dine-in only). Takeaway uses QR because the
              customer has to show a code at a pickup counter where
              their phone screen is the most reliable scan source.
              Dine-in uses a 1-D barcode that prints cleanly on the
              receipt strip a waiter / cashier scans with a regular
              POS handheld — same encoding the kitchen receipt
              printer uses. CODE128 because order ids are mixed
              alphanumeric (ORT-260506-3EC772). */}
          <div className="flex flex-col items-center">
            <p className="text-[11px] font-varela text-[#8D848F] uppercase tracking-wide mb-1.5">
              Scan to settle bill
            </p>
            <div className="px-3 py-3 bg-white border border-[#EEEEEE] rounded-2xl">
              <Barcode
                value={String(backendOrderId || displayOrderId || "—")}
                format="CODE128"
                width={1.6}
                height={56}
                fontSize={11}
                margin={0}
                background="#FFFFFF"
                lineColor="#101828"
                displayValue={true}
              />
            </div>
            <span className="text-[11px] font-varela text-[#8D848F] mt-2 text-center max-w-[260px]">
              Show this barcode at the counter or to a waiter to settle your bill.
            </span>
          </div>
        </div>
      </main>

      <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full lg:max-w-3xl p-4 bg-white backdrop-blur-md flex items-center justify-center z-50">
        {primaryOrder.paymentStatus === 'Paid' ? (
          <button
            disabled
            className="w-full font-bold h-[48px] bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6] rounded-[16px] text-[14px] font-nunito leading-[16px] flex items-center justify-center gap-2 cursor-default"
          >
            <span>✓ Paid · ₹{total.toFixed(0)}</span>
          </button>
        ) : (
          <button
            onClick={() => {
              navigate("/customer/payment", {
                state: {
                  total,
                  orderId: backendOrderId || displayOrderId,
                  tableNumber: tableNumber || "—",
                },
              });
            }}
            className="w-full font-semibold h-[48px] bg-[#FE8301] text-white rounded-[16px] text-[14px] font-nunito leading-[16px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <ShoppingCart size={18} />
            <span>Pay Bill ₹{total.toFixed(0)}</span>
          </button>
        )}
      </footer>
    </div>
  );
};

// ─── Root Component ────────────────────────────────────────────────────────────
const BillPreviews = () => {
  const location = useLocation();
  const state = location.state;

  if (state?.isTakeaway) {
    return <TakeawayBillPreview state={state} />;
  }

  return <DineInBillPreview />;
};

export default BillPreviews;
