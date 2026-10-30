import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ChevronLeft, Plus, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../Context/AuthContext";
import ProductDetailsModal from "../../Components/Loggedin/ProductDetailsModal";
import SpecialInstructionsPopup from "../../Components/Waiter/SpecialInstructionsPopup";
import { useCart } from "../../Context/CartContext";
import { useMenu } from "../../Context/MenuContext";
import api, { walletAPI, promotionsAPI, settingsAPI } from "../../utils/api";
import { getActiveBranch } from "../../utils/tenant";
import { geocodeAddress, reverseGeocode, getCurrentPosition } from "../../utils/geo";
import { useDineInLock } from "../../utils/dineInSession";
import { resolveUnitPrice } from "../../utils/pricing";
import { computeBill, computeSubtotal, toTaxConfig } from "../../utils/billing";
import { toast } from "react-hot-toast";
import { getCustomerOperations } from "../../utils/operations";
import useSelfOrderBlocked from "../../hooks/useSelfOrderBlocked";
import { serviceSpotLabel, isTokenMode } from "../../utils/customerOrdering";
import { getTableNumber, getHealthPrefs } from "./cart/storage";
import { enrichCouponError } from "./cart/couponErrors";
import HealthCartItem from "./cart/HealthCartItem";
import useCartPriceSync from "./cart/useCartPriceSync";
import usePickupSlots from "./cart/usePickupSlots";
import useComplementaryItems from "./cart/useComplementaryItems";
import usePlaceOrder from "./cart/usePlaceOrder";
import ComplementarySection from "./cart/ComplementarySection";
import PickupTimeSection from "./cart/PickupTimeSection";
import ContactPhoneSection from "./cart/ContactPhoneSection";
import DeliverySection from "./cart/DeliverySection";
import CouponSection from "./cart/CouponSection";
import WalletSection from "./cart/WalletSection";
import TipSection from "./cart/TipSection";
import BillSummarySection from "./cart/BillSummarySection";
import PairingSection from "./cart/PairingSection";
import BottomBar from "./cart/BottomBar";
import CouponTermsModal from "./cart/CouponTermsModal";

function Cart() {
  const navigate = useNavigate();
  const { user: authUser, isGuest, isLoggedIn } = useAuth();
  // Locked when the dine-in bill has been settled but the customer
  // hasn't re-scanned the table QR yet. Disables Place Order and
  // shows a clear "Re-scan QR" banner so the customer knows what
  // to do instead of tapping a dead button.
  const dineInLocked = useDineInLock();
  // QR is menu-only (operations profile customerSelfOrder:false): no
  // dine-in Place Order — the staff take the order. Takeaway untouched.
  const selfOrderBlocked = useSelfOrderBlocked();
  const { cartItems: cartContextItems, updateQuantity: updateQtyContext, updateCartItem, clearCart: clearCartContext } = useCart();
  // Menu catalogue — used to compute "Complete your meal" suggestions
  // (drinks / breads / sides / desserts that pair with what's in cart).
  const { menuItems: catalogueItems } = useMenu();
  const cartItems = useMemo(() => Object.values(cartContextItems), [cartContextItems]);

  // ── Active table orders count ──────────────────────────────────────
  // Independent-orders model — each Place Order tap creates a fresh
  // Order doc, the table can have multiple unpaid orders running at
  // once. The banner just tells the customer how many active orders
  // they have so this Place Order being a SEPARATE new card isn't a
  // surprise. Final bill combines all of them at settle time.
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const dineInTable = JSON.parse(localStorage.getItem('dineInTable') || '{}');
        const tableId = dineInTable?._id;
        if (!tableId) return;
        const res = await api.get(`/orders/active-list/table/${tableId}`, { _isBackground: true });
        if (cancelled) return;
        const list = Array.isArray(res?.data?.orders) ? res.data.orders : [];
        setActiveOrdersCount(list.length);
      } catch { /* ignore — banner just won't render */ }
    })();
    return () => { cancelled = true; };
  }, [cartContextItems]);

  // ── Cart price drift guard (see cart/useCartPriceSync.js) ───────────
  const syncCartPrices = useCartPriceSync({ cartContextItems, updateCartItem, updateQtyContext });

  // Run the sync ONCE per page mount (the ref locks it), regardless of
  // how cart contents shift afterwards. New items added later carry the
  // menu's current price already, so we don't need to re-sync on every
  // mutation — that would also create a feedback loop with updateCartItem.
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (hasSyncedRef.current) return;
    if (Object.keys(cartContextItems).length === 0) return;
    hasSyncedRef.current = true;
    syncCartPrices().then(({ changed, removed }) => {
      if (changed > 0) {
        toast.success(
          `${changed} item${changed > 1 ? 's' : ''} updated to the latest menu price.`,
          { id: 'cart-sync', duration: 4000 }
        );
      }
      if (removed > 0) {
        toast.error(
          `${removed} item${removed > 1 ? 's were' : ' was'} removed — no longer on the menu.`,
          { id: 'cart-sync-removed', duration: 5000 }
        );
      }
    });
  }, [cartContextItems, syncCartPrices]);

  const [tableNumber, setTableNumber] = useState(getTableNumber);
  const [healthMode, setHealthMode] = useState(
    () => getHealthPrefs().healthMode,
  );
  const [orderType, setOrderType] = useState(
    () => localStorage.getItem("orderType") || "dine-in",
  );
  const isTakeaway = orderType === "takeaway";
  // Token-number restaurant (§12.2, `tables.useTables:false`): a dine-in
  // order is placed with NO table and comes back with a token number.
  const tokenOrderMode = !isTakeaway && isTokenMode(getCustomerOperations());
  const dineInOrderingOff = selfOrderBlocked && !isTakeaway;

  // Takeaway-specific state
  const [selectedDay, setSelectedDay] = useState(() => new Date().getHours() >= 12 ? "PM" : "AM");
  const [selectedTime, setSelectedTime] = useState(null);
  const [couponCode, setCouponCode] = useState("");
  // Inline validation errors for the 4 checkout micro-forms. Replaces
  // the previous toast-on-empty pattern so the error renders next to
  // the field the user is looking at.
  const [couponError, setCouponError] = useState("");
  const [pointsError, setPointsError] = useState("");
  const [timeError, setTimeError] = useState("");
  const [branchError, setBranchError] = useState("");
  // Takeaway contact number — the cafe calls this to coordinate the
  // chosen pickup/delivery time. Prefilled from the logged-in customer's
  // profile mobile, but always editable (and required for guests, who
  // have no profile). Stored on order.phone so it reaches the staff
  // dashboards alongside the order.
  const [contactPhone, setContactPhone] = useState(authUser?.mobile || "");
  const [phoneError, setPhoneError] = useState("");
  // AuthContext resolves the user after first paint, so seed the contact
  // field once the profile mobile arrives — but never clobber what the
  // customer has already typed.
  useEffect(() => {
    if (authUser?.mobile) setContactPhone((prev) => prev || authUser.mobile);
  }, [authUser?.mobile]);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [tipAmount, setTipAmount] = useState(null);
  const [customTip, setCustomTip] = useState("");

  const [pointsToRedeem, setPointsToRedeem] = useState("");
  const [appliedPoints, setAppliedPoints] = useState(0);
  const [availablePoints, setAvailablePoints] = useState(0);
  // QA N6 — which coupon is being applied ({ code, source }), not a
  // shared boolean: tapping Apply on one coupon card must not turn every
  // card's button into "Applying…". `source` separates the code input's
  // Apply button from the coupon cards / T&C sheet.
  const [applyingCoupon, setApplyingCoupon] = useState(null);
  // Latest apply wins — a slower earlier response can't overwrite it.
  const couponRequestRef = useRef(0);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [taxConfig, setTaxConfig] = useState({ gstPct: 0, servicePct: 0, additionalCharges: [] });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [pairingItems, setPairingItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Home delivery (takeaway only) ──────────────────────────────────
  const [deliveryConfig, setDeliveryConfig] = useState({ enabled: false, slabs: [], minOrderValue: 0 });
  const [wantsDelivery, setWantsDelivery] = useState(false);
  const [selectedSlabIndex, setSelectedSlabIndex] = useState(null);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryError, setDeliveryError] = useState("");
  // Measured delivery distance. The server quotes distance + fee from the
  // branch/restaurant coordinates to the customer's location (GPS or the
  // geocoded address). When it can't measure (location not configured,
  // address not found) the manual distance chips are the fallback.
  const [deliveryCoords, setDeliveryCoords] = useState(null);
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [quoteState, setQuoteState] = useState("idle"); // idle | loading | ok | manual | error
  const [quoteMessage, setQuoteMessage] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const quoteSeqRef = useRef(0);
  // True while the coordinates came from "Use my location" - editing the
  // address text afterwards (adding a flat no.) must not discard them.
  const coordsFromGpsRef = useRef(false);

  // Fetch tax settings. Operating-hours gating was removed here:
  //   1. The default seeded Monday = closed, silently blocking every fresh
  //      tenant's customers on Mondays even when the cafe is actually open.
  //   2. For QR-scan dine-in the customer is already at the cafe — gating
  //      their checkout on a wall-clock schedule is the wrong UX layer.
  //   3. The backend doesn't validate operating hours on order submission,
  //      so the client check was the only (buggy) enforcement.
  // If hour-based enforcement is needed later, it belongs on the backend
  // createOrder path so all clients share one rule.
  // taxConfig starts at zero tax, so an order placed before this succeeds
  // would send a total with no GST / charges (TOTAL_MISMATCH). settingsLoaded
  // lets usePlaceOrder refuse to submit until the real settings are in, and
  // reloadSettings lets it re-pull them after a TOTAL_MISMATCH.
  const loadSettings = () => settingsAPI.getSettings().then(res => {
    const taxes = res.data?.taxes;
    if (taxes) {
      setTaxConfig(toTaxConfig(taxes));
      setSettingsLoaded(true);
    }
    const delivery = res.data?.delivery;
    if (delivery) {
      setDeliveryConfig({
        enabled: !!delivery.enabled,
        slabs: Array.isArray(delivery.slabs) ? delivery.slabs : [],
        minOrderValue: Number(delivery.minOrderValue) || 0,
      });
    }
    return !!taxes;
  });

  useEffect(() => {
    loadSettings().catch((err) => {
      console.error('Failed to load settings:', err);
      toast.error('Could not load cafe settings. Some features may be unavailable.');
    });

    // Fetch pairing recommendations from menu API
    api.get('/menu?limit=4&status=active', { _isBackground: true }).then(res => {
      if (res.data?.success && res.data.data?.length > 0) {
        setPairingItems(res.data.data.map(item => ({
          id: item._id,
          title: item.name,
          price: resolveUnitPrice(item),
          image: item.images?.[0] || '',
        })));
      }
    }).catch((err) => {
      console.error('Failed to load menu suggestions:', err);
    });
  }, []);

  // Tick every minute + dynamic time slots (see cart/usePickupSlots.js)
  const { currentTimeSlots, timeOffers } = usePickupSlots({ selectedDay, setSelectedDay, selectedTime, setSelectedTime });


  // Massage a raw backend coupon-rejection message into something that
  // actually tells the customer what to do next. The backend's
  // "Minimum order value of ₹500 required" is technically correct but
  // confusing when the cart shows a TOTAL of ₹561 (taxes included) and
  // the coupon check runs against SUBTOTAL (₹410). This rewrites the
  // common rejection reasons with the gap value spelled out.

  // Accepts an optional `codeOverride` so card-tap apply can pass the
  // coupon code directly instead of waiting for setState to flush
  // (which is the bug that made tapping a card and immediately hitting
  // Apply behave like a "double tap" — the input value lagged one
  // render behind the handler).
  const handleApplyCoupon = async (codeOverride, source = 'input') => {
    const codeToApply = String(typeof codeOverride === 'string' ? codeOverride : couponCode).trim();
    // Coupon and wallet are independent: coupon reduces the order total
    // (a discount), wallet pays a portion of whatever the customer
    // owes. They stack — apply both freely.
    if (!codeToApply) {
      setCouponError('Enter a coupon code to apply');
      setTimeout(() => document.getElementById('couponCode')?.focus(), 0);
      return;
    }
    setCouponError('');
    const requestId = ++couponRequestRef.current;
    const isLatest = () => requestId === couponRequestRef.current;
    setApplyingCoupon({ code: codeToApply.toUpperCase(), source });
    // Mirror the code into the input so the user sees what's being
    // applied if they tapped a card.
    if (codeOverride) setCouponCode(codeOverride);
    try {
      // ADM-064 — pass items[] so the server can compute the eligible
      // subtotal for scope='food' / 'beverages' coupons. prepStation is
      // carried through from MenuContext when the item was added; falls
      // back to 'kitchen' (food) on the server when absent.
      // menuItem lets the server resolve each line's real category kind
      // (food vs beverages) instead of trusting the prepStation hint.
      const couponItems = cartItems.map(it => ({
        menuItem: it._id || it.id,
        prepStation: it.prepStation || 'kitchen',
        price: Number(it.unitPrice || it.price) || 0,
        quantity: Number(it.quantity) || 0,
      }));
      // _silent so we own the failure UI below — the global interceptor
      // would otherwise fire a toast first and we'd double-message.
      const res = await promotionsAPI.applyCoupon(codeToApply, subtotal, { _silent: true }, couponItems);
      if (!isLatest()) return;
      if (res.data?.success) {
        setAppliedCoupon(res.data);
        setCouponError('');
        toast.success(res.data.message || "Coupon applied!");
      } else {
        setAppliedCoupon(null);
        setCouponError(enrichCouponError(res.data?.message, subtotal));
      }
    } catch (err) {
      if (!isLatest()) return;
      setAppliedCoupon(null);
      setCouponError(enrichCouponError(err?.response?.data?.message, subtotal));
    } finally {
      if (isLatest()) setApplyingCoupon(null);
    }
  };

  // T&C modal state — opened from each coupon card's "View Terms" button.
  const [termsCoupon, setTermsCoupon] = useState(null);

  const handleRedeemPoints = () => {
    // Wallet stacks with coupon — see handleApplyCoupon. The wallet
    // amount is clamped to the post-coupon total in BillPreviews so
    // the customer can never "redeem" more than the bill they owe.
    const pts = parseInt(pointsToRedeem);
    if (isNaN(pts) || pts <= 0) {
      setPointsError('Enter a valid amount greater than zero');
      setTimeout(() => document.getElementById('pointsToRedeem')?.focus(), 0);
      return;
    }
    if (pts > availablePoints) {
      setPointsError(`You only have ₹${availablePoints.toFixed(2)} wallet balance available`);
      return;
    }
    if (pts > subtotal) {
      setPointsError(`Amount cannot exceed order subtotal of ₹${subtotal}`);
      return;
    }
    setPointsError('');
    setAppliedPoints(pts);
    setPointsToRedeem("");
    toast.success(`₹${pts} wallet balance applied!`);
  };

  // Calculate Bill with Toppings and Sizes.
  // All tax/charge arithmetic lives in utils/billing so the cart, the
  // bill preview, the receipt and the order payload cannot drift apart
  // — and so the takeaway service-charge rule is enforced in exactly
  // one place. Pass facts in; don't re-derive them here.
  const subtotal = computeSubtotal(cartItems);
  const couponDiscount = appliedCoupon ? (appliedCoupon.discount || 0) : 0;

  // Home delivery is only OFFERED once the cart meets the tenant's minimum
  // order value. Below it, the toggle is locked and we tell the customer
  // exactly how much more to add — instead of letting them fill everything
  // and bounce at checkout. `deliveryActive` is the effective state used for
  // the fee + body so a previously-enabled toggle stops applying the moment
  // the cart drops below the minimum.
  const deliveryMinOrder = Number(deliveryConfig.minOrderValue) || 0;
  const deliveryLocked = deliveryMinOrder > 0 && subtotal < deliveryMinOrder;
  const deliveryShortfall = deliveryLocked ? Math.ceil(deliveryMinOrder - subtotal) : 0;
  const deliveryActive = wantsDelivery && !deliveryLocked;

  // Delivery fee — the charge of the distance slab the customer picked,
  // applied only on takeaway when home delivery is requested. The server
  // re-derives this from Settings.delivery.slabs so a tampered fee is
  // ignored; here it's just for the bill display + the total.
  // A measured quote wins; otherwise the manually picked slab applies.
  const measuredDelivery = (deliveryActive && quoteState === "ok" && deliveryQuote) ? deliveryQuote : null;
  const selectedSlab = measuredDelivery
    ? measuredDelivery.slab
    : (deliveryActive && selectedSlabIndex != null)
      ? (deliveryConfig.slabs || [])[selectedSlabIndex]
      : null;
  const deliveryFee = selectedSlab ? (Number(selectedSlab.charge) || 0) : 0;

  // Ask the server for distance + fee. Coordinates come from GPS or are
  // geocoded here in the browser (Nominatim); if browser geocoding fails
  // the server tries the address itself. Out-of-order responses are
  // dropped via the sequence ref.
  const requestDeliveryQuote = useCallback(async ({ address, coords }) => {
    const seq = ++quoteSeqRef.current;
    setQuoteState("loading");
    setQuoteMessage("");
    let point = coords || null;
    if (!point && address) point = await geocodeAddress(address);
    if (seq !== quoteSeqRef.current) return;
    try {
      const res = await api.post("/orders/delivery-quote", {
        lat: point?.lat,
        lng: point?.lng,
        address,
        branchId: getActiveBranch()?._id || null,
      }, { _silent: true });
      if (seq !== quoteSeqRef.current) return;
      const d = res.data || {};
      if (d.success) {
        setDeliveryQuote({ distanceKm: Number(d.distanceKm) || 0, slab: d.slab, charge: Number(d.charge) || 0 });
        if (d.location) setDeliveryCoords(d.location);
        setQuoteState("ok");
      } else {
        // Not measurable - fall back to the manual distance picker.
        setDeliveryQuote(null);
        setQuoteState("manual");
        setQuoteMessage(d.code === "DELIVERY_ADDRESS_NOT_FOUND" ? (d.message || "") : "");
      }
    } catch (err) {
      if (seq !== quoteSeqRef.current) return;
      setDeliveryQuote(null);
      const data = err.response?.data || {};
      if (data.code === "DELIVERY_OUT_OF_RANGE") {
        setQuoteState("error");
        setQuoteMessage(data.message || "This address is outside our delivery area.");
      } else {
        setQuoteState("manual");
        setQuoteMessage("");
      }
    }
  }, []);

  // Typed address -> debounced quote. Skipped while GPS coordinates are
  // in use (the address text is then just a label for the rider).
  useEffect(() => {
    if (!deliveryActive || coordsFromGpsRef.current) return undefined;
    const addr = deliveryAddress.trim();
    if (addr.length < 8) return undefined;
    const t = setTimeout(() => requestDeliveryQuote({ address: addr }), 900);
    return () => clearTimeout(t);
  }, [deliveryAddress, deliveryActive, requestDeliveryQuote]);

  const handleDeliveryAddressChange = (value) => {
    const next = value.slice(0, 500);
    setDeliveryAddress(next);
    if (deliveryError) setDeliveryError("");
    if (!coordsFromGpsRef.current || !next.trim()) {
      // Typed address drives the distance - drop any stale measurement
      // until the debounced quote comes back.
      coordsFromGpsRef.current = false;
      setDeliveryCoords(null);
      setDeliveryQuote(null);
      setQuoteState("idle");
      setQuoteMessage("");
    }
  };

  const handleUseMyLocation = async () => {
    if (isLocating) return;
    setIsLocating(true);
    setDeliveryError("");
    try {
      const coords = await getCurrentPosition();
      coordsFromGpsRef.current = true;
      setDeliveryCoords(coords);
      let addressForQuote = deliveryAddress.trim();
      if (!addressForQuote) {
        const found = await reverseGeocode(coords);
        if (found) {
          addressForQuote = found.slice(0, 500);
          setDeliveryAddress(addressForQuote);
        }
      }
      await requestDeliveryQuote({ address: addressForQuote, coords });
    } catch (err) {
      toast.error(err.message || "Could not get your location.");
    } finally {
      setIsLocating(false);
    }
  };

  // The one bill. Bill Summary, the Place Order button and the order
  // payload all read this object, so the three numbers cannot disagree.
  //
  // `orderType` is what makes service charge correct: computeBill
  // suppresses it for takeaway/delivery, because service charge pays
  // for table service and a takeaway customer receives none. Passing
  // the order type instead of a pre-computed percentage is the whole
  // point of the helper — don't reintroduce a local servicePct here.
  //
  // Wallet ("points") balance only comes off the bill on the takeaway /
  // delivery path, where BillPreviews spends it through /wallet/pay
  // right after the order is created. A dine-in bill is settled later
  // on the Payment screen (which offers the wallet there), so the cart
  // neither deducts it nor offers it — the server rejects a dine-in
  // total that is below its own bill (TOTAL_MISMATCH).
  const walletAppliedToBill = isTakeaway ? appliedPoints : 0;
  const bill = computeBill({
    subtotal,
    taxConfig,
    orderType: deliveryActive ? 'delivery' : orderType,
    couponDiscount,
    pointsRedeemed: walletAppliedToBill,
    tipAmount: tipAmount || 0,
    deliveryFee,
  });
  const { gst, serviceCharge } = bill;
  const finalTakeawayTotal = bill.total;

  // Sync state from localStorage (cross-tab and same-window)
  useEffect(() => {
    function syncState() {
      setTableNumber(localStorage.getItem("tableNumber"));
      setHealthMode(getHealthPrefs().healthMode);
      setOrderType(localStorage.getItem("orderType") || "dine-in");
    }
    window.addEventListener("storage", syncState);
    window.addEventListener("storage_sync", syncState);
    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener("storage_sync", syncState);
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Fetch wallet balance + active coupons INDEPENDENTLY so one failure
  // (feature-locked, offline) doesn't blank out the other. Coupons
  // endpoint is public (no `protect`), so guests can load them too —
  // only the wallet call is gated on a real account. `_silent: true`
  // suppresses the global toast interceptor for both.
  useEffect(() => {
    let cancelled = false;

    if (!isGuest) {
      walletAPI.getWallet({ _silent: true }).then(res => {
        if (cancelled) return;
        if (res.data?.success) {
          setAvailablePoints(parseFloat((res.data.balance || 0).toFixed(2)));
        }
      }).catch(() => { /* feature locked or offline — skip */ });
    }

    // Available coupons — fetched even for guests, since customers
    // (logged-in or not) can browse them and the endpoint doesn't
    // require auth. `Cache-Control: no-cache` request header bypasses
    // the browser's ETag/304 layer which was occasionally serving a
    // stale empty body and leaving availableCoupons at [].
    promotionsAPI.getActiveCoupons({
      _silent: true,
      headers: { 'Cache-Control': 'no-cache' },
    }).then(res => {
      if (cancelled) return;
      if (res.data?.success) {
        setAvailableCoupons(res.data.coupons || []);
      }
    }).catch(() => { /* feature locked or offline — skip */ });

    return () => { cancelled = true; };
  }, [isGuest]);

  // ─── Cart Operations ───────────────────────────────────────────────────────

  const updateQuantity = (index, quantity) => {
    const item = cartItems[index];
    if (!item) return;
    const delta = quantity - item.quantity;
    updateQtyContext(item.id, delta, item);
  };

  const removeItem = (index) => {
    const item = cartItems[index];
    if (!item) return;
    updateQtyContext(item.id, -item.quantity, item);
  };


  const clearCart = () => {
    clearCartContext();
  };

  // Special Instructions Popup State
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [selectedItemForInstructions, setSelectedItemForInstructions] = useState(null);

  // Track which items have expanded instructions
  const [expandedInstructions, setExpandedInstructions] = useState({});

  // Customize Modal State
  const [customizeModalOpen, setCustomizeModalOpen] = useState(false);
  const [productToCustomize, setProductToCustomize] = useState(null);
  const [, setCustomizeItemIndex] = useState(null);

  // No auto-navigate to home, let user decide or handle in a more stable way if needed
  // useEffect(() => {
  //   if (cartItems.length === 0) {
  //     navigate("/");
  //   }
  // }, [cartItems.length, navigate]);

  const complementaryItems = useComplementaryItems({ cartItems, catalogueItems });

  // Add a complementary item directly to the cart. Mirrors the +Add on
  // the Home page card so items with no required size/toppings drop in
  // with a single tap. If the item has sizes/toppings configured, the
  // user can still tap the cart line's "Customize" button after.
  const handleAddComplementary = (item) => {
    const id = item._id || item.id;
    if (!id) return;
    const cartItem = {
      id,
      title: item.name || item.title || 'Item',
      name: item.name,
      desc: item.description || item.desc || '',
      image: (item.images && item.images[0]) || item.image,
      price: resolveUnitPrice(item),
      unitPrice: resolveUnitPrice(item),
      isVeg: item.vegType === 'veg' || item.isVeg === true,
      quantity: 1,
      prepStation: item.prepStation,
      category: item.category,
      selectedSizes: [],
      selectedToppings: [],
    };
    updateQtyContext(id, 1, cartItem);
    toast.success(`${cartItem.title} added to cart`, { id: `complement-${id}`, duration: 2000 });
  };

  // Increase Quantity
  const handleIncrease = (itemId) => {
    const itemIndex = cartItems.findIndex((item) => item.id === itemId);
    if (itemIndex >= 0) {
      updateQuantity(itemIndex, cartItems[itemIndex].quantity + 1);
    }
  };

  // Decrease Quantity
  const handleDecrease = (itemId) => {
    const itemIndex = cartItems.findIndex((item) => item.id === itemId);
    if (itemIndex >= 0) {
      const newQuantity = cartItems[itemIndex].quantity - 1;
      if (newQuantity <= 0) {
        removeItem(itemIndex);
      } else {
        updateQuantity(itemIndex, newQuantity);
      }
    }
  };

  // Handle Add/Edit Special Instructions
  const handleOpenInstructions = (item) => {
    setSelectedItemForInstructions(item);
    setIsInstructionsOpen(true);
  };

  // Handle Toggle Instructions Expansion
  const handleToggleInstructions = (itemIndex) => {
    setExpandedInstructions((prev) => ({
      ...prev,
      [itemIndex]: !prev[itemIndex],
    }));
  };

  // Handle Save Instructions
  const handleSaveInstructions = (itemId, instructions) => {
    updateCartItem(itemId, { instructions });

    // Find index for auto-collapse
    const idx = cartItems.findIndex(it => it.id === itemId);
    if (idx >= 0) {
      setExpandedInstructions((prev) => ({
        ...prev,
        [idx]: false,
      }));
    }
  };

  // Clear a line's special instructions (the Remove control on the card).
  const handleRemoveInstructions = (item) => {
    updateCartItem(item.id, { instructions: '' });
    const idx = cartItems.findIndex(it => it.id === item.id);
    if (idx >= 0) {
      setExpandedInstructions((prev) => ({ ...prev, [idx]: false }));
    }
    toast.success('Special instructions removed', { id: `instr-remove-${item.id}`, duration: 2000 });
  };

  // Handle Customize button click
  const handleCustomize = (itemIndex) => {
    const item = cartItems[itemIndex];
    setCustomizeItemIndex(itemIndex);
    setProductToCustomize(item);
    setCustomizeModalOpen(true);
  };

  // Handle Close Customize Modal
  const handleCloseCustomizeModal = () => {
    setCustomizeModalOpen(false);
    setProductToCustomize(null);
    setCustomizeItemIndex(null);
  };

  const handlePlaceOrder = usePlaceOrder({
    navigate, isGuest, isLoggedIn, authUser, clearCart, dineInOrderingOff, isTakeaway,
    selectedTime, selectedDay, setTimeError, contactPhone, setPhoneError,
    deliveryActive, quoteState, quoteMessage, deliveryAddress, measuredDelivery,
    selectedSlabIndex, selectedSlab, setDeliveryError, setBranchError, deliveryConfig,
    deliveryCoords, deliveryFee, subtotal, finalTakeawayTotal, cartItems, couponDiscount,
    appliedCoupon, appliedPoints, tipAmount, setIsSubmitting, isSubmitting, tokenOrderMode,
    taxConfig, syncCartPrices, settingsLoaded, reloadSettings: loadSettings,
  });


  // pairingItems fetched from API in useEffect above

  // Empty cart state
  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] lg:max-w-3xl mx-auto flex flex-col">
        <header className="bg-white sticky top-0 z-40">
          <div className="flex items-center justify-between px-4 py-2 mt-2">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1 -ml-1 hover:bg-gray-100 active:scale-95 transition-transform">
                <ChevronLeft size={24} className="text-gray-800" />
              </button>
              <h3 className="text-[16px] font-nunito medium text-[#1A181B]">Cart</h3>
            </div>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-16">
          <ShoppingCart size={64} className="text-gray-200 mb-4" />
          <h2 className="text-[20px] font-nunito font-semibold text-[#1A181B] mb-2">Your cart is empty</h2>
          <p className="text-[14px] text-[#8D848F] text-center mb-6">Add items from the menu to get started</p>
          <button
            onClick={() => navigate('/customer/menu')}
            className="bg-[#FE8301] text-white font-nunito font-semibold text-[14px] px-8 py-3 rounded-[12px] active:scale-[0.97] transition-transform"
          >
            Browse Menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] pb-30 transition-colors duration-200 lg:max-w-3xl mx-auto">
      {/* Header */}
      <header className="bg-white sticky top-0 z-40 transition-colors">
        <div className="flex items-center justify-between px-4 py-2 mt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-1 -ml-1 hover:bg-gray-100 active:scale-95 transition-transform"
            >
              <ChevronLeft size={24} className="text-gray-800" />
            </button>
            <h3 className="text-[16px] font-nunito medium text-[#1A181B]">
              Cart
            </h3>
          </div>
          {isTakeaway ? (
            <span className="text-[#FE8301] text-[14px] font-varela font-normal bg-orange-50 px-3 py-1 rounded-[10px]">
              Takeaway
            </span>
          ) : tokenOrderMode ? (
            <span className="text-[#1D4ED8] text-[13px] font-varela bg-[#EAF1FF] px-3 py-1 rounded-[10px]" data-testid="token-order-chip">
              Token order
            </span>
          ) : (tableNumber && !dineInLocked) ? (
            <span className="text-[#666666] text-[14px] font-varela regular">
              {serviceSpotLabel()} {tableNumber}
            </span>
          ) : null}
        </div>
      </header>

      <main className="px-4 pt-4 flex flex-col">
        {/* Active-orders banner — dine-in only. Independent-orders
            model: this Place Order will create a NEW Order card the
            chef can prep separately. Final bill aggregates every
            unpaid order on the table at pay time. */}
        {!isTakeaway && activeOrdersCount > 0 && (
          <div className="mb-3 bg-[#EAF1FF] border border-[#C7D9FF] rounded-2xl p-3 flex items-start gap-2.5">
            <span className="text-[18px] leading-none mt-0.5">🍽️</span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-nunito font-semibold text-[#1A4FBF] leading-tight">
                You have {activeOrdersCount} active {activeOrdersCount === 1 ? 'order' : 'orders'} on this table
              </p>
              <p className="text-[12px] font-varela text-[#1A4FBF]/85 mt-0.5 leading-snug">
                This will be placed as a <span className="font-semibold">separate new order</span> — the kitchen tracks it as its own card. Each order shows up on your Orders tab independently. <span className="font-semibold">Final bill combines everything into one total.</span>
              </p>
            </div>
          </div>
        )}

        {/* Cart Items */}
        <section>
          {cartItems.map((item, index) => (
            <HealthCartItem
              key={`${item.id}-${index}`}
              item={item}
              quantity={item.quantity}
              onIncrease={() => handleIncrease(item.id)}
              onDecrease={() => handleDecrease(item.id)}
              onRemove={() => {
                // CUS-021: full-line remove via the X button. Toast
                // confirms — keeps the cart predictable while leaving
                // room for a future undo (snapshot/restore the line).
                const title = item.title || item.name || 'Item';
                removeItem(index);
                toast.success(`${title} removed from cart`, { id: `cart-remove-${item.id}`, duration: 2500 });
              }}
              onCustomize={() => handleCustomize(index)}
              onViewDetails={() => handleCustomize(index)}
              onAddInstructions={() => handleOpenInstructions(item)}
              onRemoveInstructions={() => handleRemoveInstructions(item)}
              isInstructionsExpanded={expandedInstructions[index] || false}
              onToggleInstructions={() => handleToggleInstructions(index)}
              healthMode={healthMode}
            />
          ))}
        </section>

        {/* Add more items — sends the customer back to the menu without
            losing the cart (cart lives in context, not this page). The
            dashed style reads as an "append" action, distinct from the
            solid orange Place Order CTA. Hidden when the QR is
            menu-only (nothing to add — the staff take the order). */}
        {!dineInOrderingOff && (
        <button
          type="button"
          onClick={() => navigate('/customer/menu')}
          className="w-full mt-2 mb-4 flex items-center justify-center gap-2 border-2 border-dashed border-[#FFD2A6] text-[#FE8301] bg-[#FFF8F1] rounded-[14px] py-3 font-nunito font-semibold text-[14px] active:scale-[0.98] transition-transform"
        >
          <Plus size={18} strokeWidth={2.5} />
          Add more items
        </button>
        )}

        <ComplementarySection complementaryItems={complementaryItems} handleAddComplementary={handleAddComplementary} />

        <PickupTimeSection isTakeaway={isTakeaway} timeError={timeError} setTimeError={setTimeError} branchError={branchError} selectedDay={selectedDay} setSelectedDay={setSelectedDay} selectedTime={selectedTime} setSelectedTime={setSelectedTime} currentTimeSlots={currentTimeSlots} timeOffers={timeOffers} />

        <ContactPhoneSection isTakeaway={isTakeaway} phoneError={phoneError} contactPhone={contactPhone} setContactPhone={setContactPhone} setPhoneError={setPhoneError} />

        <DeliverySection isTakeaway={isTakeaway} deliveryConfig={deliveryConfig} deliveryLocked={deliveryLocked} deliveryActive={deliveryActive} setWantsDelivery={setWantsDelivery} setDeliveryError={setDeliveryError} deliveryMinOrder={deliveryMinOrder} deliveryShortfall={deliveryShortfall} handleUseMyLocation={handleUseMyLocation} isLocating={isLocating} deliveryAddress={deliveryAddress} handleDeliveryAddressChange={handleDeliveryAddressChange} quoteState={quoteState} measuredDelivery={measuredDelivery} quoteMessage={quoteMessage} selectedSlabIndex={selectedSlabIndex} setSelectedSlabIndex={setSelectedSlabIndex} deliveryError={deliveryError} />

        <CouponSection isGuest={isGuest} navigate={navigate} couponCode={couponCode} setCouponCode={setCouponCode} couponError={couponError} setCouponError={setCouponError} handleApplyCoupon={handleApplyCoupon} applyingCoupon={applyingCoupon} appliedCoupon={appliedCoupon} setAppliedCoupon={setAppliedCoupon} availableCoupons={availableCoupons} subtotal={subtotal} setTermsCoupon={setTermsCoupon} />

        <WalletSection isTakeaway={isTakeaway} isGuest={isGuest} navigate={navigate} pointsToRedeem={pointsToRedeem} setPointsToRedeem={setPointsToRedeem} pointsError={pointsError} setPointsError={setPointsError} handleRedeemPoints={handleRedeemPoints} availablePoints={availablePoints} appliedPoints={appliedPoints} setAppliedPoints={setAppliedPoints} />

        <TipSection tipAmount={tipAmount} setTipAmount={setTipAmount} customTip={customTip} setCustomTip={setCustomTip} />

        <BillSummarySection subtotal={subtotal} gst={gst} taxConfig={taxConfig} serviceCharge={serviceCharge} bill={bill} couponDiscount={couponDiscount} walletAppliedToBill={walletAppliedToBill} tipAmount={tipAmount} deliveryFee={deliveryFee} measuredDelivery={measuredDelivery} selectedSlab={selectedSlab} finalTakeawayTotal={finalTakeawayTotal} />

        <PairingSection healthMode={healthMode} isTakeaway={isTakeaway} cartItems={cartItems} pairingItems={pairingItems} />
      </main>

      <BottomBar dineInLocked={dineInLocked} isTakeaway={isTakeaway} tokenOrderMode={tokenOrderMode} dineInOrderingOff={dineInOrderingOff} handlePlaceOrder={handlePlaceOrder} cartItems={cartItems} isSubmitting={isSubmitting} selectedTime={selectedTime} activeOrdersCount={activeOrdersCount} finalTakeawayTotal={finalTakeawayTotal} />


      {/* Special Instructions Popup */}
      <SpecialInstructionsPopup
        isOpen={isInstructionsOpen}
        onClose={() => setIsInstructionsOpen(false)}
        onSave={handleSaveInstructions}
        item={selectedItemForInstructions}
      />

      {/* Product Details Modal for Customization */}
      {customizeModalOpen && productToCustomize && (
        <ProductDetailsModal
          product={productToCustomize}
          onClose={handleCloseCustomizeModal}
          isUpdateMode={true}
        />
      )}

      <CouponTermsModal termsCoupon={termsCoupon} setTermsCoupon={setTermsCoupon} appliedCoupon={appliedCoupon} applyingCoupon={applyingCoupon} handleApplyCoupon={handleApplyCoupon} />
    </div>
  );
}

export default Cart;