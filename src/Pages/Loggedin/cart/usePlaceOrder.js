import { useRef } from "react";
import { toast } from "react-hot-toast";
import api from "../../../utils/api";
import { activeRestaurantPath, setActiveTenantOperations, getActiveBranch } from "../../../utils/tenant";
import { resolveUnitPrice } from "../../../utils/pricing";
import { computeBill } from "../../../utils/billing";
import { isGuestSessionExpired, clearGuestSession } from "../../../utils/guestSession";
import { rememberGuestOrderAccess } from "../../../utils/guestOrderAccess";
import { rememberOrderIds, getCustomerOrderSession } from "../../../utils/customerOrderIds";
import { generateIdempotencyKey, createActionGuard } from "../../../utils/idempotency";
import { reportMissingFields } from "../../../utils/requiredFields";
import { getCustomerOperations } from "../../../utils/operations";
import { QR_MENU_ONLY_NOTE, dineInPaymentChoice } from "../../../utils/customerOrdering";
import { getCheckoutIdempotencyKey, clearCheckoutIdempotencyKey } from "./checkoutIdempotency";

// Place-order flow incl. the Phase 1 double-tap guard and idempotency key
// handling (moved verbatim from Cart.jsx).
export default function usePlaceOrder({
  navigate, isGuest, isLoggedIn, authUser, clearCart, dineInOrderingOff, isTakeaway,
  selectedTime, selectedDay, setTimeError, contactPhone, setPhoneError,
  deliveryActive, quoteState, quoteMessage, deliveryAddress, measuredDelivery,
  selectedSlabIndex, selectedSlab, setDeliveryError, setBranchError, deliveryConfig,
  deliveryCoords, deliveryFee, subtotal, finalTakeawayTotal, cartItems, couponDiscount,
  appliedCoupon, appliedPoints, tipAmount, setIsSubmitting, isSubmitting, tokenOrderMode,
  taxConfig, syncCartPrices,
}) {
  // Handle Place Order. `payChoice` ('payFirst' | 'payAfter') is the
  // customer's pick when the operations profile says payment.dineIn is
  // 'either' (two buttons); the single-button modes ignore it.
  // Synchronous double-tap guard: isSubmitting is React state, so two taps in
  // the same tick both read false. The ref flips instantly and is released in
  // finally (the takeaway/pay-first paths navigate away without touching
  // isSubmitting, so the guard, not the state, is what stops a second tap).
  const placeOrderGuardRef = useRef(createActionGuard());
  const handlePlaceOrder = async (payChoice) => {
    if (cartItems.length === 0 || isSubmitting) return;
    if (!placeOrderGuardRef.current.enter()) return;
    try {
      await placeOrderInner(payChoice);
    } finally {
      placeOrderGuardRef.current.leave();
    }
  };
  const placeOrderInner = async (payChoice) => {

    // GST-005 — 24h FE cap. Block guest checkout when guest_session_start
    // is older than a day. The backend's 4h scanToken JWT is the hard
    // gate; this FE gate is the friendlier-UX layer that nudges the
    // customer back to the QR before they fire a request that would
    // 401 with no recovery affordance. Logged-in customers bypass.
    if (isGuest && isGuestSessionExpired()) {
      toast.error(
        'Your table session has expired. Please re-scan the table QR to start a new order.',
        { duration: 5000 }
      );
      clearGuestSession();
      clearCart();
      navigate(activeRestaurantPath());
      return;
    }

    // QR is menu-only — the backend would 403 SELF_ORDER_DISABLED.
    if (dineInOrderingOff) {
      toast(QR_MENU_ONLY_NOTE, { id: 'qr-menu-only', duration: 4000 });
      return;
    }

    if (isTakeaway) {
      // QA N2 — check every required field up front, mark each one
      // inline, and name them all in one toast (scrolling to the first)
      // instead of stopping silently at the first gap.
      const missing = [];
      if (!selectedTime) {
        setTimeError('Please select a pickup time before proceeding');
        missing.push({ label: 'Pickup time', id: 'pickupTime' });
      } else {
        setTimeError('');
      }

      // Contact number — required for takeaway so the cafe can call the
      // customer about the pickup/delivery. Indian 10-digit mobile; take
      // the last 10 digits so a "+91" / leading-0 paste still validates.
      const phoneDigits = String(contactPhone || '').replace(/\D/g, '').slice(-10);
      if (!/^[6-9]\d{9}$/.test(phoneDigits)) {
        setPhoneError('Enter a valid 10-digit mobile number so we can call about your order');
        missing.push({ label: 'Contact number', id: 'contactPhoneInput' });
      } else {
        setPhoneError('');
      }

      if (deliveryActive && quoteState !== "loading" && quoteState !== "error") {
        const deliveryMissing = [];
        if (!deliveryAddress.trim()) deliveryMissing.push({ label: 'Delivery address', id: 'deliveryAddress' });
        if (!measuredDelivery && (selectedSlabIndex == null || !selectedSlab)) {
          deliveryMissing.push({ label: 'Delivery distance', id: 'deliveryDistance' });
        }
        if (deliveryMissing.length) {
          setDeliveryError(`Please enter your ${deliveryMissing.map(m => m.label.toLowerCase()).join(' and ')}`);
          missing.push(...deliveryMissing);
        }
      }
      if (reportMissingFields(missing)) return;

      const selectedBranch = (() => {
        try { return JSON.parse(localStorage.getItem('selectedBranch') || 'null'); } catch { return null; }
      })();

      // Authoritative branch ref comes from the active tenant blob
      // (validated at pick-time). selectedBranch is the UI label only.
      const activeBranch = getActiveBranch();
      const branchName = activeBranch?.name || selectedBranch?.name;
      const branchId = activeBranch?._id || null;

      if (!branchName) {
        // Branch missing is a flow problem — surface it AND redirect.
        // The banner remains visible long enough for the user to
        // understand why they were sent to the picker.
        setBranchError('Please select a branch before placing your order');
        toast.error('Please select a branch before placing your order');
        navigate("/branch-selection");
        return;
      }
      setBranchError('');

      // Home delivery validation — require a chosen distance range + a
      // non-empty address. `deliveryActive` is already false when the cart is
      // below the minimum (locked), so a below-min cart falls through as a
      // normal takeaway instead of erroring.
      if (deliveryActive) {
        if (quoteState === "loading") {
          toast.error('Calculating your delivery charge - please wait a moment');
          return;
        }
        if (quoteState === "error") {
          setDeliveryError(quoteMessage || 'This address is outside our delivery area');
          toast.error(quoteMessage || 'This address is outside our delivery area');
          return;
        }
        if (!deliveryAddress.trim()) {
          reportMissingFields([{ label: 'Delivery address', id: 'deliveryAddress' }]);
          return;
        }
        if (!measuredDelivery && (selectedSlabIndex == null || !selectedSlab)) {
          reportMissingFields([{ label: 'Delivery distance', id: 'deliveryDistance' }]);
          return;
        }
        if (deliveryConfig.minOrderValue > 0 && subtotal < deliveryConfig.minOrderValue) {
          setDeliveryError(`Minimum order for delivery is ₹${deliveryConfig.minOrderValue}. Add ₹${(deliveryConfig.minOrderValue - subtotal).toFixed(0)} more.`);
          toast.error(`Home delivery needs a minimum order of ₹${deliveryConfig.minOrderValue}`);
          return;
        }
        setDeliveryError('');
      }

      if (finalTakeawayTotal <= 0) {
        toast.error("Order total must be greater than zero.");
        return;
      }

      // Delivery snapshot threaded through bill-preview → order create.
      const deliveryPayload = deliveryActive ? {
        requested: true,
        address: deliveryAddress.trim(),
        slabIndex: measuredDelivery ? undefined : selectedSlabIndex,
        slab: { fromKm: Number(selectedSlab.fromKm), toKm: Number(selectedSlab.toKm) },
        // Customer coordinates - the server re-measures the distance from
        // these (or re-geocodes the address) and ignores the client fee.
        lat: deliveryCoords?.lat,
        lng: deliveryCoords?.lng,
        distanceKm: measuredDelivery?.distanceKm,
      } : undefined;

      // Navigate to bill-preview with order data — order will be created AFTER payment
      navigate("/bill-preview", {
        state: {
          isTakeaway: true,
          items: cartItems,
          subtotal,
          couponDiscount,
          appliedCoupon,
          appliedPoints,
          tipAmount: tipAmount || 0,
          selectedTime,
          selectedDay,
          total: finalTakeawayTotal,
          // Home delivery — fee + snapshot for the bill preview's
          // grandTotal recompute and the address card.
          deliveryFee,
          delivery: deliveryPayload,
          // Order payload for backend creation after payment.
          // IMPORTANT: must mirror the dine-in payload's coupon / points /
          // tip fields below — without them the backend's TOTAL_TAMPERED
          // check recomputes serverMinTotal as if no discount was applied
          // and rejects the create with 400 right after Razorpay charges
          // the customer. (Latent bug — the old /customer/payment page
          // hid this because it created the order via the same path with
          // the same omission, but only triggered when payment method
          // was "online"; now that takeaway always pays online, every
          // discounted cart hit it.)
          orderPayload: {
            type: "takeaway",
            // Fresh key for this checkout attempt — BillPreview / Payment
            // resend it on every retry of the create so a double
            // payment callback can't produce two orders.
            clientIdempotencyKey: generateIdempotencyKey(),
            customerName: authUser?.name || "Guest",
            // Validated 10-digit contact captured above — staff call this.
            phone: phoneDigits,
            tableId: null,
            pickupTime: selectedTime,
            // Phase 6 step 4 — the pickup location is a free-text
            // label stored in order.pickupLocation. The backend
            // still accepts `branch` as an alias for backcompat.
            pickupLocation: branchName,
            // branchId routes the order to the selected branch's
            // staff dashboards. Backend validates against the tenant.
            branchId,
            items: cartItems.map(item => ({
              menuItem: item._id || item.id,
              name: item.name || item.title || "Unknown Item",
              price: resolveUnitPrice(item),
              quantity: item.quantity,
              selectedSizes: item.selectedSizes || [],
              selectedToppings: item.selectedToppings || [],
              instructions: item.instructions || ""
            })),
            total: parseFloat(finalTakeawayTotal.toFixed(2)),
            tipAmount: tipAmount || 0,
            couponCode: appliedCoupon?.coupon?.code || '',
            couponDiscount: couponDiscount || 0,
            pointsRedeemed: appliedPoints || 0,
            // Home delivery — server re-derives the fee from settings and
            // stamps order.delivery; address + slab travel here.
            delivery: deliveryPayload,
            note: "",
          },
          // Cart items for localStorage saving after payment
          cartItemsForStorage: cartItems.map(item => ({
            title: item.name || item.title,
            name: item.name || item.title,
            price: resolveUnitPrice(item),
            unitPrice: resolveUnitPrice(item),
            quantity: item.quantity,
            image: item.image || item.images?.[0] || ''
          })),
        },
      });
      return;
    }

    // Dine-in order path
    setIsSubmitting(true);
    try {
      // Read table ID from localStorage (set by QR scan in ScanTable.jsx).
      // Token mode: the restaurant has no tables — the order goes without
      // one (the server allots a token number); a stale binding is ignored.
      const dineInTable = JSON.parse(localStorage.getItem('dineInTable') || '{}');
      const dineInTableId = tokenOrderMode ? null : (dineInTable._id || null);

      // Dine-in total = the server's bill (utils/billing mirrors
      // Backend/utils/billing): subtotal + GST + service charge +
      // additional charges − coupon + tip. The server stores its own
      // figure and rejects a total more than ₹1 below it
      // (TOTAL_MISMATCH). Wallet balance is NOT deducted here — the
      // server's `pointsRedeemed` is a loyalty-points count, not wallet
      // rupees; the wallet pays the bill later on the Payment screen.
      const dineInFinalTotal = computeBill({
        subtotal,
        taxConfig,
        orderType: 'dine-in',
        couponDiscount,
        tipAmount: tipAmount || 0,
      }).total;

      // _silent so the api.js interceptor does NOT fire its own toast
      // for 4xx responses — we own the error UX in this handler (e.g.
      // 409 ACTIVE_ORDER_EXISTS gets a contextual recovery flow rather
      // than a duplicated raw-message toast).
      const dineInPayload = {
        type: "dine-in",
        customerName: authUser?.name || "Guest",
        phone: authUser?.mobile || "",
        tableId: dineInTableId,
        items: cartItems.map(item => ({
          menuItem: item._id || item.id,
          name: item.name || item.title || "Unknown Item",
          price: resolveUnitPrice(item),
          quantity: item.quantity,
          selectedSizes: item.selectedSizes || [],
          selectedToppings: item.selectedToppings || [],
          instructions: item.instructions || ""
        })),
        total: dineInFinalTotal,
        tipAmount: tipAmount || 0,
        couponCode: appliedCoupon?.coupon?.code || '',
        couponDiscount: couponDiscount || 0,
        pointsRedeemed: 0,
        note: ""
      };
      // Same key for every retry of THIS cart (duplicate-order guard).
      const idemKey = getCheckoutIdempotencyKey(JSON.stringify(dineInPayload));

      // Pay-first restaurant (operations profile): no order exists until
      // the customer pays — hand the draft to the payment screen, which
      // creates the order with (or right after) the payment.
      const handOffToPayment = (key) => {
        setIsSubmitting(false);
        navigate('/customer/payment', {
          state: {
            payFirstDineIn: true,
            orderPayload: { ...dineInPayload, clientIdempotencyKey: key },
            total: dineInFinalTotal,
            cartItemsForStorage: cartItems.map(item => ({
              title: item.name || item.title,
              name: item.name || item.title,
              price: resolveUnitPrice(item),
              unitPrice: resolveUnitPrice(item),
              quantity: item.quantity,
              image: item.image || item.images?.[0] || '',
            })),
          },
        });
      };
      // 'either': the customer chose "Pay now" (pay-first path) or "Pay
      // after the meal" (today's path). Without a pick, today's path.
      const payMode = dineInPaymentChoice();
      if (payMode === 'payFirst' || (payMode === 'either' && payChoice === 'payFirst')) {
        handOffToPayment(idemKey);
        return;
      }

      let data;
      try {
        ({ data } = await api.post('/orders', {
          ...dineInPayload,
          clientIdempotencyKey: idemKey,
        }, { _silent: true, headers: { 'Idempotency-Key': idemKey } }));
      } catch (postErr) {
        // 402 PAYMENT_REQUIRED_FIRST — the restaurant switched to
        // pay-first but this device's cached profile is stale. Store
        // the fresh rule and take the same pay-first path as above.
        // Nothing was created; the hand-off gets a fresh key (the
        // server would replay this 402 for the old one).
        if (postErr?.response?.status === 402 && postErr.response?.data?.code === 'PAYMENT_REQUIRED_FIRST') {
          const ops = getCustomerOperations();
          setActiveTenantOperations({
            ...ops,
            payment: {
              ...ops.payment,
              dineIn: 'payFirst',
              methods: postErr.response.data.methods || ops.payment?.methods,
            },
          });
          clearCheckoutIdempotencyKey();
          toast('This restaurant asks you to pay first', { id: 'pay-first-required', duration: 4000 });
          handOffToPayment(getCheckoutIdempotencyKey(JSON.stringify(dineInPayload)));
          return;
        }
        throw postErr;
      }

      if (data.success) {
        clearCheckoutIdempotencyKey();
        // Mixed-cart split — backend may have produced TWO docs:
        //   data.order      → kitchen items doc (primary)
        //   data.splitOrder → counter items doc (status=ready)
        // Toast accordingly so the customer knows what happened.
        const wasSplit = !!data.isSplit && !!data.splitOrder;
        if (wasSplit) {
          toast.success(`Order placed — ready-to-serve items split off so they reach you faster!`, { duration: 5000 });
        } else {
          toast.success(`Order #${String(data.order.orderId).split('-').pop()?.slice(-6) || ''} placed!`);
        }

        // Remember only the new order IDs (#22) — the Orders / Bill
        // screens re-fetch every order from the server, so nothing but
        // the IDs needs to live on the device.
        const placedIds = [data.order?.orderId];
        if (wasSplit) placedIds.push(data.splitOrder?.orderId);
        rememberOrderIds(getCustomerOrderSession(authUser, isLoggedIn), placedIds.filter(Boolean).map(String));
        // Token mode, guest counter order: the server's one-off access
        // token (no scan session exists) — kept under both ids so the
        // confirmation / tracking / pay calls can present it (X-Guest-Access).
        if (data.guestAccessToken) {
          rememberGuestOrderAccess(
            [...placedIds, data.order?._id, wasSplit ? data.splitOrder?._id : null],
            data.guestAccessToken,
            data.guestAccessExpiresAt,
          );
        }
        window.dispatchEvent(new Event("storage_sync"));

        clearCart();
        if (tokenOrderMode) {
          // Token mode: the confirmation screen shows the token number big
          // and clear ("Your token: T-042") — the customer collects on it.
          navigate("/customer/order-confirmed", {
            replace: true,
            state: {
              orderId: data.order?.orderId,
              tokenNumber: data.order?.tokenNumber || null,
              items: cartItems.map(item => ({
                name: item.name || item.title,
                price: resolveUnitPrice(item),
                quantity: item.quantity,
                image: item.image || item.images?.[0] || '',
              })),
              total: dineInFinalTotal,
              isTakeaway: false,
              paymentMethod: data.order?.paymentMethod || 'cash',
              tracking: getCustomerOperations().orderFlow?.customerTracking !== false,
            },
          });
          return;
        }
        navigate("/customer/orders");
      }
    } catch (error) {
      console.error("Failed to place order", error);
      // A 4xx is a definitive rejection (nothing was created) — the next
      // attempt must use a new key, otherwise the server would replay
      // this same error. Network errors / 5xx keep the key so a retry
      // dedupes against an order that may have been created.
      const failStatus = error.response?.status;
      if (failStatus >= 400 && failStatus < 500) clearCheckoutIdempotencyKey();

      // 400 TOTAL_TAMPERED — server canonical price ≠ what the cart
      // computed. Almost always caused by a menu reseed / price edit
      // happening between the time items were added to the cart and
      // checkout. Re-sync prices in place and tell the customer to
      // re-confirm the new total. We deliberately don't auto-resubmit
      // — if the new price is HIGHER, the customer must see it before
      // we charge them again.
      // TOTAL_MISMATCH is the same story for taxes / charges (e.g. the
      // GST or service-charge settings changed while the cart was open).
      if (error.response?.status === 400 && ['TOTAL_TAMPERED', 'TOTAL_MISMATCH'].includes(error.response?.data?.code)) {
        try {
          const { changed, removed } = await syncCartPrices();
          if (changed > 0 || removed > 0) {
            toast.error(
              "Menu prices have changed since you added items. We've updated your cart — please review the new total and place the order again.",
              { duration: 7000 }
            );
          } else {
            toast.error("Order total mismatch. Please refresh the page and try again.");
          }
        } catch {
          toast.error("Order total mismatch. Please refresh the page and try again.");
        }
        return;
      }

      // 401 SCAN_TOKEN_* — the guest's table session is expired,
      // missing, or bound to a different table/tenant. GST-004 fix.
      // Without this branch the user sees a generic toast, the stale
      // scanToken stays in localStorage, and tapping Place Order again
      // would 401 again with no recovery affordance. Clear the guest
      // session and redirect to landing so they pick up a fresh scan.
      const tokenErrorCodes = new Set([
        'SCAN_TOKEN_EXPIRED',
        'SCAN_TOKEN_REQUIRED',
        'SCAN_TOKEN_INVALID',
        'SCAN_TOKEN_MISMATCH',
      ]);
      if ([401, 403].includes(error.response?.status) && tokenErrorCodes.has(error.response?.data?.code)) {
        toast.error(
          error.response.data.message ||
            'Your table session has expired. Please re-scan the table QR.',
          { duration: 5000 }
        );
        clearGuestSession();
        clearCart();
        navigate(activeRestaurantPath());
        return;
      }

      // 409 ACTIVE_ORDER_EXISTS — the table already has an unpaid order.
      // Customers can't append (staff-only), so route them to view it
      // instead of leaving them stuck on a generic error toast. If the
      // active order belongs to them (or their guest scan session), the
      // active-order endpoint returns it; otherwise it 403s and we fall
      // back to a clearer message.
      if (error.response?.status === 409 && error.response?.data?.code === 'ACTIVE_ORDER_EXISTS') {
        try {
          const dineInTable = JSON.parse(localStorage.getItem('dineInTable') || '{}');
          const dineInTableId = dineInTable._id || null;
          if (dineInTableId) {
            const { data: activeData } = await api.get(
              `/orders/active/table/${dineInTableId}`,
              { _silent: true }
            );
            if (activeData?.order) {
              toast.success("This table already has an active order — taking you there.");
              navigate("/customer/orders");
              return;
            }
          }
          toast.error("This table already has an active order. Please ask a waiter to add items to it.");
        } catch {
          toast.error("This table already has an active order. Please ask a waiter to add items to it.");
        }
        return;
      }

      toast.error(error.response?.data?.message || error.response?.data?.error || error.message || "Failed to place order");
    } finally {
      setIsSubmitting(false);
    }
  };
  return handlePlaceOrder;
}
