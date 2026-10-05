import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  Users,
  Clock,
  Minus,
  Plus,
  ShoppingCart,
  ChevronRight,
  Check,
  CircleCheck,
  X,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Loader2,
  Heart,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../Context/AuthContext";
import { useFavorites } from "../../utils/favorites";
import ProductDetailsModal from "../../Components/Loggedin/ProductDetailsModal";
import SpecialInstructionsPopup from "../../Components/Waiter/SpecialInstructionsPopup";
import { useCart } from "../../Context/CartContext";
import { useMenu } from "../../Context/MenuContext";
import api, { walletAPI, promotionsAPI, settingsAPI } from "../../utils/api";
import { getActiveBranch, activeRestaurantPath } from "../../utils/tenant";
import { geocodeAddress, reverseGeocode, getCurrentPosition } from "../../utils/geo";
import { useDineInLock } from "../../utils/dineInSession";
import { resolveUnitPrice, resolveLinePrice, formatPrice } from "../../utils/pricing";
import { computeBill, computeSubtotal, toTaxConfig } from "../../utils/billing";
import { lineUnitPrice, lineTotal as cartLineTotal } from "../../utils/cart";
import { isGuestSessionExpired, clearGuestSession } from "../../utils/guestSession";
import { rememberOrderIds, getCustomerOrderSession } from "../../utils/customerOrderIds";
import { toast } from "react-hot-toast";
import { reportMissingFields } from "../../utils/requiredFields";

// ─── Checkout idempotency key ────────────────────────────────────────────────
// One key per checkout attempt. It survives a slow-network retry / double
// tap / page refresh (sessionStorage) so the backend returns the original
// order instead of creating a twin, and is dropped on success or on a
// definitive (4xx) rejection. Bound to a fingerprint of the cart so a
// different cart never reuses a stale key.
const CHECKOUT_IDEM_KEY = 'checkout_idem_v1';

function generateIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `web-${crypto.randomUUID()}`;
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return `web-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
    }
  } catch { /* fall through */ }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function getCheckoutIdempotencyKey(fingerprint) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_IDEM_KEY) || 'null');
    if (saved?.key && saved.fp === fingerprint) return saved.key;
    const key = generateIdempotencyKey();
    sessionStorage.setItem(CHECKOUT_IDEM_KEY, JSON.stringify({ key, fp: fingerprint }));
    return key;
  } catch {
    return generateIdempotencyKey();
  }
}

function clearCheckoutIdempotencyKey() {
  try { sessionStorage.removeItem(CHECKOUT_IDEM_KEY); } catch { /* ignore */ }
}

// ─── Standalone localStorage helpers ─────────────────────────────────────────

function getTableNumber() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const table = urlParams.get("table");
    if (table) {
      localStorage.setItem("tableNumber", table);
      return table;
    }
    // Read from dineInTable (set by QR scan) first, then fall back to tableNumber
    const dineInTable = localStorage.getItem("dineInTable");
    if (dineInTable) {
      const parsed = JSON.parse(dineInTable);
      if (parsed.name) return parsed.name;
    }
    return localStorage.getItem("tableNumber") || null;
  } catch {
    return null;
  }
}

function getHealthPrefs() {
  try {
    const saved = localStorage.getItem("healthPreferences");
    if (saved) {
      const prefs = JSON.parse(saved);
      return { healthMode: prefs.healthMode ?? false };
    }
  } catch { /* ignore */ }
  return { healthMode: false };
}


const HealthCartItem = ({
  item,
  quantity,
  onIncrease,
  onDecrease,
  onRemove,
  onCustomize,
  onViewDetails,
  onAddInstructions,
  onRemoveInstructions,
  isInstructionsExpanded,
  onToggleInstructions,
}) => {
  // Per-device favourites — same heart the Home cards / favourites use.
  const { has: hasFavorite, toggle: toggleFavorite } = useFavorites();
  const favId = item.id || item._id;
  const isFavorited = hasFavorite(favId);

  // Check if item has sizes or toppings (for showing Customize button)
  const hasSizesOrToppings =
    (item.selectedToppings && item.selectedToppings.length > 0) ||
    (item.selectedSizes && item.selectedSizes.length > 0);

  // Only offer "Customize" when the item actually has something to
  // customize. The cart-item shape differs by add-path, so check every
  // signal that means "this menu item exposes sizes/toppings":
  //   • hasCustomization — stamped at add time by the detail screens
  //   • raw sizes[] / toppings[] — carried from the menu blob (Home/quick-add)
  //   • already-selected sizes/toppings on this line
  // Plain items (Dal Tadka, a starter with no options) match none of
  // these, so the button stays hidden — no confusing dead button.
  const canCustomize =
    Boolean(item.hasCustomization) ||
    (Array.isArray(item.sizes) && item.sizes.length > 0) ||
    (Array.isArray(item.toppings) && item.toppings.length > 0) ||
    hasSizesOrToppings;

  // Per-unit price and the line total (unit × quantity) shown in cart.
  // Shared line maths (utils/cart) — same as the CartContext totals.
  const unitPrice = lineUnitPrice(item);
  const lineTotal = cartLineTotal({ unitPrice, quantity });

  // Selected customization chips. Prefer the canonical selectedSizes/
  // selectedToppings arrays; fall back to the legacy `size` string so a
  // line added before the canonical keys existed still shows its size.
  // "Regular" is the no-size default ProductDetails writes — drop it so it
  // doesn't read as a real choice on plain items.
  const sizeChips = (
    item.selectedSizes && item.selectedSizes.length > 0
      ? item.selectedSizes.map((s) => s.name)
      : (item.size ? [item.size] : [])
  ).filter((n) => n && String(n).toLowerCase() !== "regular");
  // A line is "customized via a detail screen" (so its `toppings` array
  // holds the SELECTED toppings) when it carries any of these markers.
  // A raw quick-add line has none of them — its `toppings` would be the
  // menu's AVAILABLE toppings, which we must NOT show as if chosen.
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
  const hasChips = sizeChips.length > 0 || toppingChips.length > 0;

  // Portion suffix (e.g. "· 500 ml") shown after the size name — but ONLY
  // for weight/volume units where the amount adds real info. For count
  // units (plate, pieces, bowl…) the size name already says it, so a
  // "Half Plate · 4plate" / "Medium · 1pieces" suffix is just confusing.
  const MEASUREMENT_UNITS = ["gm", "g", "kg", "ml", "liter", "litre"];
  const sizeUnit = String(item.unit || "").toLowerCase();
  const portionSuffix =
    item.sizeQuantity && MEASUREMENT_UNITS.includes(sizeUnit)
      ? ` · ${item.sizeQuantity} ${item.unit}`
      : "";

  const hasInstructions =
    item.instructions && item.instructions.trim() !== "";

  return (
    // Whole card opens the item's detail popup. Interactive controls inside
    // (customize, qty +/-, remove, instructions) stopPropagation so they act
    // on their own without also triggering the detail view.
    <div
      onClick={onViewDetails}
      role="button"
      className="bg-white rounded-[20px] p-3 sm:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-[#F1F1F3] mb-3 transition-all duration-300 cursor-pointer active:scale-[0.99]"
    >
      <div className="flex flex-row gap-3.5 sm:gap-4">
        {/* Image - always on left */}
        <div className="relative w-[104px] h-[104px] sm:w-[120px] sm:h-[120px] shrink-0 rounded-[16px] overflow-hidden">
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover"
          />
          {item.isVeg !== undefined && (
            <div className="absolute top-2 left-2 z-10">
              <div
                className={`w-[18px] h-[18px] border-2 ${item.isVeg ? "border-[#00B050]" : "border-[#E31E24]"} rounded-[3px] bg-white flex items-center justify-center`}
              >
                <div
                  className={`w-[9px] h-[9px] ${item.isVeg ? "bg-[#00B050]" : "bg-[#E31E24]"} rounded-full`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Content - fills remaining width */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
          {/* Title + remove */}
          <div className="flex justify-between items-start gap-2">
            <h3 className="font-bold text-[#1A181B] font-nunito text-[16px] sm:text-[18px] leading-[1.25] tracking-[-0.01em] pr-2 line-clamp-2">
              {item.title}
            </h3>
            {/* Favourite (heart) in the title row's right slot — replaces the
                old ✕ remove. No remove button needed: dropping quantity to 0
                via the stepper auto-removes the line. stopPropagation so the
                tap toggles the favourite without opening the detail popup. */}
            {favId && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleFavorite(favId); }}
                aria-label={isFavorited ? "Remove from favourites" : "Add to favourites"}
                aria-pressed={isFavorited}
                className="shrink-0 w-7 h-7 -mt-0.5 -mr-1 rounded-full hover:bg-[#FFF1F2] active:scale-90 flex items-center justify-center transition-all"
              >
                <Heart
                  size={18}
                  strokeWidth={2}
                  className={isFavorited ? "text-[#E11D48] fill-[#E11D48]" : "text-[#B6AEB8]"}
                />
              </button>
            )}
          </div>

          {/* Customize (text + chevron) & selected chips */}
          <div className="flex flex-col gap-2 mt-1.5">
            {canCustomize && (
              <button
                onClick={(e) => { e.stopPropagation(); onCustomize(); }}
                className="w-fit flex items-center gap-0.5 text-[#645E66] active:opacity-70 transition-opacity"
              >
                <span className="text-[14px] font-semibold font-varela">
                  Customize
                </span>
                <ChevronRight size={16} className="text-[#9A8FA0] mt-px" />
              </button>
            )}

            {hasChips && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {sizeChips.map((name, i) => (
                  <span
                    key={`size-${i}`}
                    className="text-[12px] px-3 py-1 rounded-full bg-[#F7F0FA] text-[#7D7380] whitespace-nowrap font-varela"
                  >
                    {name}{portionSuffix}
                  </span>
                ))}
                {toppingChips.map((name, i) => (
                  <span
                    key={`top-${i}`}
                    className="text-[12px] px-3 py-1 rounded-full bg-[#F7F0FA] text-[#7D7380] whitespace-nowrap font-varela"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Price + Qty — show the line total (unit × quantity); the
              per-unit breakdown sits underneath once qty > 1 so the
              number always matches what this line adds to the bill. */}
          <div className="flex items-center justify-between mt-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[21px] sm:text-[22px] leading-[26px] font-nunito font-bold text-[#1A181B] tabular-nums">
                ₹{formatPrice(lineTotal)}
              </span>
              {quantity > 1 && (
                <span className="text-[11px] leading-[14px] font-varela text-[#8D848F] tabular-nums">
                  ₹{formatPrice(unitPrice)} × {quantity}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 font-nunito font-semibold bg-[#FAFAFA] rounded-xl px-1.5 py-1.5 border border-[#EFEFEF]">
              <button
                onClick={(e) => { e.stopPropagation(); onDecrease(); }}
                className="w-7 h-7 flex items-center justify-center text-[#333333] rounded-lg active:scale-90 active:bg-gray-100 transition-all"
              >
                <Minus size={15} />
              </button>
              <span className="text-[#1A181B] min-w-[28px] text-center text-[15px] tabular-nums">
                {quantity}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onIncrease(); }}
                className="w-7 h-7 flex items-center justify-center text-[#333333] rounded-lg active:scale-90 active:bg-gray-100 transition-all"
              >
                <Plus size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Special Instructions Section (Now Full Width) */}
      <div className="mt-3 pt-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          {hasInstructions ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-[6px]">
                <CircleCheck size={16} fill="#007AFF" stroke="white" strokeWidth={2.5} color='#007AFF' />
                <span className="text-[12px] font-[400] text-[#007AFF] font-nunito">Special Instructions Applied</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleInstructions(); }}
                  className="text-[14px] font-semibold text-[#FF7A00] active:opacity-70 transition-opacity font-varela"
                >
                  {isInstructionsExpanded ? 'Hide Details' : 'View Details'}
                </button>
                {onRemoveInstructions && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveInstructions(); }}
                    aria-label="Remove special instructions"
                    className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 active:scale-90 transition-all"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onAddInstructions(); }}
              className="flex items-center gap-2.5 text-[#4A4A4A] group w-full"
            >
              <div className="w-7 h-7 rounded-full bg-[#F4ECF8] flex items-center justify-center text-[#7C3AED] group-active:scale-90 transition-transform flex-shrink-0">
                <Plus size={15} strokeWidth={3} />
              </div>
              <span className="text-[15px] font-semibold font-nunito text-[#1A181B]">Add Special Instructions</span>
            </button>
          )}
        </div>

        {/* Expanded Instructions View */}
        <AnimatePresence>
          {hasInstructions && isInstructionsExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-[#F8F9FF] rounded-[20px] p-4 flex items-center justify-between border border-[#E8EEFF]">
                <p className="text-[13px] text-[#4A4A4A] flex-1 pr-4 line-clamp-2 font-varela">
                  {item.instructions}
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); onAddInstructions(); }}
                  className="flex items-center gap-1 text-[#FF7A00] font-bold text-[14px] active:scale-95 transition-transform whitespace-nowrap font-nunito"
                >
                  <SlidersHorizontal size={14} strokeWidth={2.5} /> Edit
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// WITHOUT HEALTH MODE REGULAR CART ITEM here add cart items Without healthmode
const CartItem = ({ item, quantity, onIncrease, onDecrease, onCustomize }) => {
  const hasSizesOrToppings =
    (item.selectedToppings && item.selectedToppings.length > 0) ||
    (item.selectedSizes && item.selectedSizes.length > 0);

  return (
    <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-100 flex gap-3 sm:gap-4 transition-colors">
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
        <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-100">
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        </div>
        {item.isVeg !== undefined && (
          <div className="absolute top-1 right-1 bg-white p-0.5 rounded shadow-sm">
            <div
              className={`w-3 h-3 border ${item.isVeg ? "border-green-600" : "border-red-600"} rounded-sm flex items-center justify-center`}
            >
              <div
                className={`w-1.5 h-1.5 ${item.isVeg ? "bg-green-600" : "bg-red-600"} rounded-full`}
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-gray-900 text-base mb-1">
              {item.title}
            </h3>
          </div>
          <p className="text-xs text-gray-500 line-clamp-1 mb-2">{item.desc}</p>

          {hasSizesOrToppings && (
            <div className="flex flex-col gap-1 mb-2">
              <div
                className="flex items-center gap-1 cursor-pointer"
                onClick={onCustomize}
              >
                <span className="text-[12px] font-varela text-[#645E66]">
                  Customize
                </span>
                <ChevronRight size={13} className="text-[#7D7380]" />
              </div>
              <div className="flex flex-wrap gap-1">
                {item.selectedSizes &&
                  item.selectedSizes.map((size) => (
                    <span
                      key={size.id}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 whitespace-nowrap font-varela border border-orange-100"
                    >
                      {size.name}
                    </span>
                  ))}
                {item.selectedToppings &&
                  item.selectedToppings.map((t) => (
                    <span
                      key={t.id}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 whitespace-nowrap font-varela border border-orange-100"
                    >
                      {t.name}
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <span className="flex items-center gap-1">
              <Users size={12} /> Serves {item.serves}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> {item.time}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-bold text-lg text-gray-900 ">
            ₹{formatPrice(item.unitPrice || item.price)}
          </span>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1 border border-gray-200 ">
            <button
              onClick={onDecrease}
              className="w-5 h-5 flex items-center justify-center text-gray-600 active:scale-95"
            >
              <Minus size={14} />
            </button>
            <span className="font-bold text-sm w-4 text-center text-gray-800 ">
              {quantity}
            </span>
            <button
              onClick={onIncrease}
              className="w-5 h-5 flex items-center justify-center text-gray-600 active:scale-95"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function Cart() {
  const navigate = useNavigate();
  const { user: authUser, isGuest, isLoggedIn } = useAuth();
  // Locked when the dine-in bill has been settled but the customer
  // hasn't re-scanned the table QR yet. Disables Place Order and
  // shows a clear "Re-scan QR" banner so the customer knows what
  // to do instead of tapping a dead button.
  const dineInLocked = useDineInLock();
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

  // ── Cart price drift guard ──────────────────────────────────────────
  // The server canonicalises each line item's price from the live menu
  // doc and rejects orders whose total falls below `subtotal − coupon −
  // points + tip` (TOTAL_TAMPERED). When a customer's cart is older
  // than the most recent menu reseed / branch price edit, the cached
  // line prices fall out of sync and every checkout 400s.
  //
  // We fix that here once on mount: refetch each cart item's canonical
  // doc, patch the per-unit price in the context, drop items whose
  // menuItem has been deleted (404), and toast the user when anything
  // changed so the new total isn't a silent surprise. Same routine is
  // re-invoked from the TOTAL_TAMPERED catch in handlePlaceOrder so a
  // late drift is caught even after the cart was loaded.
  const syncCartPrices = useCallback(async () => {
    const items = Object.values(cartContextItems);
    if (items.length === 0) return { changed: 0, removed: 0 };

    let changed = 0;
    let removed = 0;
    await Promise.all(items.map(async (cartItem) => {
      const menuId = cartItem._id || cartItem.id;
      if (!menuId) return;

      // Compare the LINE price (size + toppings) the cart actually shows
      // and sums — not the bare menu price. Comparing bare prices and then
      // writing the bare price back used to wipe the size/topping part of
      // a customised line, so the cart showed a different number than
      // the item modal did.
      const selSize = Array.isArray(cartItem.selectedSizes) ? cartItem.selectedSizes[0] : null;
      const selTops = Array.isArray(cartItem.selectedToppings) ? cartItem.selectedToppings : [];
      const cartUnit = Number(cartItem.unitPrice ?? cartItem.price ?? resolveUnitPrice(cartItem)) || 0;
      const byName = (list, name) => (Array.isArray(list) ? list : []).find(
        (x) => String(x?.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase()
      );
      const canonicalLine = (doc) => {
        if (!selSize && selTops.length === 0) return resolveUnitPrice(doc);
        return resolveLinePrice(doc, {
          size: selSize ? byName(doc.sizes, selSize.name) || null : null,
          toppings: selTops.map((t) => byName(doc.toppings, t?.name)).filter(Boolean),
        });
      };
      // Patch the per-unit price from a canonical doc (menu item OR combo).
      // Combos store the live price as `price`/`finalPrice`; menu items as
      // `finalPrice`/`basePrice`. Project both onto the cart's price keys.
      const applyPrice = (doc) => {
        const canonicalUnit = canonicalLine(doc);
        if (canonicalUnit > 0 && Math.abs(canonicalUnit - cartUnit) > 0.01) {
          updateCartItem(menuId, {
            price: canonicalUnit,
            unitPrice: canonicalUnit,
            finalPrice: doc.finalPrice ?? doc.price ?? canonicalUnit,
            basePrice: doc.basePrice ?? doc.originalPrice ?? canonicalUnit,
          });
          changed += 1;
        }
      };

      const fetchCombo = async () => {
        const cres = await api.get(`/combos/${menuId}`, { _silent: true });
        return cres.data?.combo || cres.data?.data || cres.data;
      };

      // Combos live in a SEPARATE collection from menu items, so a combo
      // in the cart must be validated against /combos/<id> — a /menu/<id>
      // lookup 404s for it and the old code then wrongly dropped it with
      // "1 item was removed — no longer on the menu". Detect combos by the
      // flags ProductDetails stamps; entries added via a card's quick-Add
      // (which don't carry the flag) are caught by the /combos fallback on
      // a /menu 404 below.
      const looksLikeCombo =
        Boolean(cartItem.isCombo) ||
        Array.isArray(cartItem.comboCategories) ||
        Array.isArray(cartItem.categories);

      try {
        if (looksLikeCombo) {
          const combo = await fetchCombo();
          if (combo && combo._id) applyPrice(combo);
          return;
        }
        const res = await api.get(`/menu/${menuId}`, { _silent: true });
        const menu = res.data?.menuItem || res.data?.data || res.data;
        if (!menu || !menu._id) return;
        applyPrice(menu);
      } catch (err) {
        // Only a 404 means "gone". Network blips / 5xx leave the item
        // alone — the server re-validates at /orders time.
        if (err?.response?.status !== 404) return;
        // Before declaring it removed, try the OTHER collection: an
        // unflagged combo 404s on /menu yet is perfectly valid.
        try {
          const combo = await fetchCombo();
          if (combo && combo._id) { applyPrice(combo); return; }
        } catch { /* genuinely gone — fall through to removal */ }
        updateQtyContext(menuId, -9999);
        removed += 1;
      }
    }));
    return { changed, removed };
  }, [cartContextItems, updateCartItem, updateQtyContext]);

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
  useEffect(() => {
    settingsAPI.getSettings().then(res => {
      const taxes = res.data?.taxes;
      if (taxes) {
        setTaxConfig(toTaxConfig(taxes));
      }
      const delivery = res.data?.delivery;
      if (delivery) {
        setDeliveryConfig({
          enabled: !!delivery.enabled,
          slabs: Array.isArray(delivery.slabs) ? delivery.slabs : [],
          minOrderValue: Number(delivery.minOrderValue) || 0,
        });
      }
    }).catch((err) => {
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
          image: item.images?.[0] || 'https://placehold.co/200x200?text=Item',
        })));
      }
    }).catch((err) => {
      console.error('Failed to load menu suggestions:', err);
    });
  }, []);

  // Tick every minute so time slots stay current
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Dynamic time slots generation — re-runs every minute via nowTick
  const amSlots = useMemo(() => {
    const now = new Date(nowTick);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const slots = [];
    for (let h = 9; h < 12; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (currentHour < 12 && (h < currentHour || (h === currentHour && m <= currentMinute))) continue;
        const hour = h % 12 || 12;
        slots.push(`${hour}:${m === 0 ? "00" : m} AM`);
      }
    }
    return slots;
  }, [nowTick]);

  const pmSlots = useMemo(() => {
    const now = new Date(nowTick);
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const slots = [];
    for (let h = 12; h < 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (currentHour >= 12 && (h < currentHour || (h === currentHour && m <= currentMinute))) continue;
        const hour = h % 12 || 12;
        const ampm = "PM";
        slots.push(`${hour}:${m === 0 ? "00" : m} ${ampm}`);
      }
    }
    return slots;
  }, [nowTick]);

  // Use useMemo to prevent re-generation on every render but keep it updated based on selectedDay
  const currentTimeSlots = useMemo(() => {
    const allSlots = selectedDay === "AM" ? amSlots : pmSlots;
    // Chunk into 4-item rows for the grid
    const rows = [];
    for (let i = 0; i < allSlots.length; i += 4) {
      rows.push(allSlots.slice(i, i + 4));
    }
    return rows;
  }, [selectedDay, amSlots, pmSlots]);

  const timeOffers = useMemo(() => {
    return currentTimeSlots.map((row) =>
      row.map(() => ""),
    );
  }, [currentTimeSlots]);

  // Auto-switch to PM when no AM slots remain, clear expired selection
  useEffect(() => {
    if (selectedDay === "AM" && amSlots.length === 0 && pmSlots.length > 0) {
      setSelectedDay("PM");
    }
    const allSlots = selectedDay === "AM" ? amSlots : pmSlots;
    if (selectedTime && !allSlots.includes(selectedTime)) {
      setSelectedTime(null);
    }
  }, [amSlots, pmSlots, selectedDay, selectedTime]);

  // Massage a raw backend coupon-rejection message into something that
  // actually tells the customer what to do next. The backend's
  // "Minimum order value of ₹500 required" is technically correct but
  // confusing when the cart shows a TOTAL of ₹561 (taxes included) and
  // the coupon check runs against SUBTOTAL (₹410). This rewrites the
  // common rejection reasons with the gap value spelled out.
  const enrichCouponError = (raw, currentSubtotal) => {
    const msg = String(raw || 'Could not apply this coupon.').trim();
    const minMatch = msg.match(/[₹$]?\s*(\d+(?:\.\d+)?)/);
    if (/minimum order/i.test(msg) && minMatch) {
      const minVal = Number(minMatch[1]);
      const sub = Number(currentSubtotal || 0);
      const gap = Math.max(0, Math.ceil(minVal - sub));
      if (gap > 0) {
        return `Add ₹${gap} more to apply this coupon. Your subtotal is ₹${sub.toFixed(0)}; this coupon needs ₹${minVal.toFixed(0)} (before tax).`;
      }
    }
    if (/expired/i.test(msg))       return `This coupon has expired. Pick another from the list below.`;
    if (/already used|usage limit/i.test(msg)) return `You've already used this coupon the maximum number of times.`;
    if (/not valid|invalid/i.test(msg))         return `This code isn't valid for your current order. Try a different coupon.`;
    if (/time window|not active yet/i.test(msg)) return `This coupon isn't active right now. Check the time window in View Terms.`;
    return msg;
  };

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

  // "Complete your meal" suggestions — picks complementary items from
  // the catalogue based on category-name keywords. Heuristic chosen over
  // a backend co-occurrence query so it works on day-1 tenants with no
  // order history. Buckets are name-based because every tenant labels
  // their categories differently — "Drinks" / "Beverages" / "Cold
  // Drinks" all map to the same intent.
  const complementaryItems = useMemo(() => {
    if (!catalogueItems?.length || !cartItems?.length) return [];

    const DRINKS = ['beverage', 'drink', 'water', 'juice', 'cold', 'hot ', 'tea', 'coffee', 'shake', 'cola', 'soda', 'mocktail', 'lassi'];
    const BREADS = ['bread', 'roti', 'naan', 'paratha', 'kulcha', 'chapati', 'puri', 'rumali'];
    const SIDES  = ['side', 'starter', 'appetizer', 'salad', 'fries', 'pakora', 'snack'];
    const SWEETS = ['dessert', 'sweet', 'cake', 'ice cream', 'pudding', 'gulab', 'jalebi', 'kulfi'];

    const matches = (catName, keywords) => {
      const n = String(catName || '').toLowerCase();
      return keywords.some(k => n.includes(k));
    };

    const cartItemIds = new Set(cartItems.map(it => it.id));
    const cartHasDrinks = cartItems.some(it => matches(it.category?.name, DRINKS));
    const cartHasBread  = cartItems.some(it => matches(it.category?.name, BREADS));
    const cartHasSide   = cartItems.some(it => matches(it.category?.name, SIDES));
    const cartHasSweet  = cartItems.some(it => matches(it.category?.name, SWEETS));
    // "Main" = anything that's NOT a drink/bread/side/sweet. If the
    // user added paneer masala, this triggers the bread + drink picks.
    const cartHasMain = cartItems.some(it => {
      const n = String(it.category?.name || '').toLowerCase();
      return n && !matches(n, DRINKS) && !matches(n, BREADS) && !matches(n, SIDES) && !matches(n, SWEETS);
    });

    const scored = catalogueItems
      .filter(m => !cartItemIds.has(m._id))
      .filter(m => m.status !== 'inactive' && m.status !== 'archived')
      .map(m => {
        const catName = m.category?.name || '';
        let score = 0;
        if (!cartHasDrinks && matches(catName, DRINKS)) score += 5;
        if (cartHasMain && !cartHasBread && matches(catName, BREADS)) score += 4;
        if (!cartHasSide && matches(catName, SIDES)) score += 2;
        if (!cartHasSweet && matches(catName, SWEETS)) score += 1;
        // Tiebreak: more-ordered items first (capped so blockbusters
        // don't drown out category diversity).
        score += Math.min(2, (m.orderCount || 0) / 10);
        return { item: m, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Pick top items but enforce at most 2 per category — keeps the
    // strip mixed (e.g. 1 water + 1 roti + 1 fries beats 3 sodas).
    const perCatCount = {};
    const out = [];
    for (const s of scored) {
      const cat = String(s.item.category?._id || s.item.category || 'none');
      if ((perCatCount[cat] || 0) >= 2) continue;
      perCatCount[cat] = (perCatCount[cat] || 0) + 1;
      out.push(s.item);
      if (out.length >= 6) break;
    }
    return out;
  }, [cartItems, catalogueItems]);

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

  // Handle Place Order
  const handlePlaceOrder = async () => {
    if (cartItems.length === 0 || isSubmitting) return;

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
            image: item.image || item.images?.[0] || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=300&q=80"
          })),
        },
      });
      return;
    }

    // Dine-in order path
    setIsSubmitting(true);
    try {
      // Read table ID from localStorage (set by QR scan in ScanTable.jsx)
      const dineInTable = JSON.parse(localStorage.getItem('dineInTable') || '{}');
      const dineInTableId = dineInTable._id || null;

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
      const { data } = await api.post('/orders', {
        ...dineInPayload,
        clientIdempotencyKey: idemKey,
      }, { _silent: true, headers: { 'Idempotency-Key': idemKey } });

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
        window.dispatchEvent(new Event("storage_sync"));

        clearCart();
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
          ) : (tableNumber && !dineInLocked) ? (
            <span className="text-[#666666] text-[14px] font-varela regular">
              Table {tableNumber}
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
            solid orange Place Order CTA. */}
        <button
          type="button"
          onClick={() => navigate('/customer/menu')}
          className="w-full mt-2 mb-4 flex items-center justify-center gap-2 border-2 border-dashed border-[#FFD2A6] text-[#FE8301] bg-[#FFF8F1] rounded-[14px] py-3 font-nunito font-semibold text-[14px] active:scale-[0.98] transition-transform"
        >
          <Plus size={18} strokeWidth={2.5} />
          Add more items
        </button>

        {/* Complete your meal — horizontal-scroll strip of complementary
            items based on what's currently in cart (drinks for mains,
            bread for curries, etc.). Tap +Add for a one-tap drop-in. */}
        {complementaryItems.length > 0 && (
          <section className="mt-2 mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
            <div className="flex items-center gap-2 mb-3">
              <i className="fi fi-rr-utensils text-[#FE8301] text-[18px] min-[375px]:text-[20px] leading-none" />
              <h2 className="text-[15px] min-[375px]:text-[17px] leading-[22px] font-nunito font-semibold text-[#1A181B]">
                Complete your meal
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              {complementaryItems.map((m) => {
                const id = m._id || m.id;
                const img = (m.images && m.images[0]) || m.image;
                const price = resolveUnitPrice(m);
                const basePrice = Number(m.basePrice ?? 0);
                const isVeg = m.vegType === 'veg' || m.isVeg === true;
                return (
                  <div
                    key={id}
                    className="shrink-0 w-[140px] min-[375px]:w-[150px] bg-white border border-[#F2F4F7] rounded-[14px] overflow-hidden flex flex-col"
                  >
                    <div className="relative w-full h-[100px] bg-gray-100">
                      {img ? (
                        <img
                          src={img}
                          alt={m.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/200x200?text=No+Image'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No image</div>
                      )}
                      <div className="absolute top-1.5 left-1.5">
                        <div className={`w-[16px] h-[16px] border-2 ${isVeg ? 'border-[#00B050]' : 'border-[#E31E24]'} rounded-[3px] bg-white flex items-center justify-center`}>
                          <div className={`w-[8px] h-[8px] ${isVeg ? 'bg-[#00B050]' : 'bg-[#E31E24]'} rounded-full`} />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col p-2.5 gap-1.5">
                      <h3 className="text-[12px] min-[375px]:text-[13px] font-nunito font-semibold text-[#1A181B] line-clamp-2 leading-[16px] min-h-[32px]">
                        {m.name}
                      </h3>
                      <div className="flex items-center justify-between gap-1 mt-auto">
                        <div className="flex items-baseline gap-1 min-w-0">
                          <span className="text-[13px] nunito font-bold text-[#1A181B] tabular-nums">₹{price.toFixed(0)}</span>
                          {basePrice > price && (
                            <span className="text-[10px] text-gray-400 line-through tabular-nums">₹{basePrice.toFixed(0)}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddComplementary(m)}
                          className="bg-[#FE8301] text-white text-[11px] font-nunito font-semibold px-2.5 py-1 rounded-[8px] active:scale-95 transition-transform shrink-0"
                          aria-label={`Add ${m.name} to cart`}
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Select Time Section — takeaway only (pickup time scheduling).
            The other sections (Coupon, Wallet, Tip, Bill Summary) used to
            be nested under the same isTakeaway gate, which hid them from
            dine-in customers entirely — explaining why coupons never
            rendered in dine-in flow even though the backend returned them. */}
        {isTakeaway && (
            <section
              id="pickupTime"
              className={`mt-4 mb-4 bg-white rounded-[16px] border p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833] ${timeError ? 'border-red-400' : 'border-[#F6F6F6]'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] min-[375px]:text-[16px] leading-[22px] font-nunito font-semibold text-[#1A181B]">
                  Select time <span className="text-red-500" aria-hidden="true">*</span>
                </h2>
                <span className="text-[#FE8301] text-[13px] min-[375px]:text-[14px] font-varela leading-[16px]">
                  Today
                </span>
              </div>
              <div className="flex items-center gap-[10px] mb-3">
                <button
                  onClick={() => { setSelectedDay("AM"); if (timeError) setTimeError(''); }}
                  className={`text-[13px] min-[375px]:text-[14px] font-varela transition-colors ${selectedDay === "AM" ? "text-[#FE8301]" : "text-[#007AFF]"
                    }`}
                >
                  AM
                </button>
                <button
                  onClick={() => { setSelectedDay("PM"); if (timeError) setTimeError(''); }}
                  className={`text-[13px] min-[375px]:text-[14px] font-varela transition-colors ${selectedDay === "PM" ? "text-[#FE8301]" : "text-[#007AFF]"
                    }`}
                >
                  PM
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {currentTimeSlots.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="grid grid-cols-4 gap-1 min-[375px]:gap-3"
                  >
                    {row.map((time, i) => {
                      const isSelected = selectedTime === time;
                      const offer = timeOffers[rowIndex][i];
                      return (
                        <button
                          key={time}
                          onClick={() => { setSelectedTime(time); if (timeError) setTimeError(''); }}
                          className={`flex flex-col items-center py-1.5 min-[375px]:py-2 rounded-[10px] border transition-all ${isSelected
                            ? "border-[#FF9B0B] bg-[#FFFAF5]"
                            : "border-[#EEEEEE] bg-white"
                            }`}
                        >
                          <span className="text-[11px] min-[375px]:text-[13px] font-varela text-[#1A181B] leading-tight">
                            {time}
                          </span>
                          <span className="text-[9px] min-[375px]:text-[11px] font-varela mt-0.5 text-[#007AFF] leading-tight transition-opacity duration-200">
                            {offer}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {currentTimeSlots.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-4 font-varela">
                    No slots available for this period.
                  </p>
                )}
              </div>
              {timeError && (
                <p role="alert" className="mt-3 text-xs text-red-600 flex items-center gap-1 font-varela">
                  <span aria-hidden="true">⚠</span>{timeError}
                </p>
              )}
              {branchError && (
                <p role="alert" className="mt-2 text-xs text-red-600 flex items-center gap-1 font-varela">
                  <span aria-hidden="true">⚠</span>{branchError}
                </p>
              )}
            </section>
        )}

        {/* Contact Number Section — takeaway only. The cafe calls this to
            coordinate the chosen pickup/delivery time, so we collect it
            right under the time picker. Prefilled from the profile mobile,
            editable, and required (guests have no profile number). */}
        {isTakeaway && (
          <section
            id="contactPhone"
            className={`mb-4 bg-white rounded-[16px] border p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833] ${phoneError ? 'border-red-400' : 'border-[#F6F6F6]'}`}
          >
            <h2 className="text-[15px] min-[375px]:text-[16px] leading-[22px] font-nunito font-semibold text-[#1A181B] mb-1">
              Contact number <span className="text-red-500" aria-hidden="true">*</span>
            </h2>
            <p className="text-[11px] min-[375px]:text-[12px] text-[#8D848F] font-varela mb-3">
              We'll call this number about your order.
            </p>
            <div className={`flex items-center rounded-[10px] border bg-white px-3 ${phoneError ? 'border-red-400' : 'border-[#EEEEEE]'}`}>
              <span className="text-[14px] text-[#645E66] font-varela pr-2 mr-1 border-r border-[#EEEEEE]">+91</span>
              <input
                id="contactPhoneInput"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                aria-required="true"
                value={contactPhone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setContactPhone(digits);
                  if (phoneError) setPhoneError('');
                }}
                placeholder="10-digit mobile number"
                aria-label="Contact number for this order"
                className="flex-1 py-2.5 text-[14px] font-varela text-[#1A181B] outline-none bg-transparent"
              />
            </div>
            {phoneError && (
              <p role="alert" className="mt-2 text-xs text-red-600 flex items-center gap-1 font-varela">
                <span aria-hidden="true">⚠</span>{phoneError}
              </p>
            )}
          </section>
        )}

        {/* ── Home Delivery Section (takeaway only) ────────────────────
            Shown only when the cafe has enabled delivery and configured
            at least one distance range. The customer flips the toggle,
            picks the km range that covers their address, and types the
            address — the slab's charge is added to the bill below. */}
        {isTakeaway && deliveryConfig.enabled && (deliveryConfig.slabs || []).length > 0 && (
          <section className="mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[20px] min-[375px]:text-[24px] leading-none">🛵</span>
                <h2 className="text-[16px] min-[375px]:text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B]">
                  Home Delivery
                </h2>
              </div>
              <button
                type="button"
                disabled={deliveryLocked}
                onClick={() => {
                  if (deliveryLocked) return;
                  setWantsDelivery(prev => !prev);
                  setDeliveryError('');
                }}
                className={`relative w-[44px] h-[24px] rounded-full transition-colors shrink-0 ${deliveryLocked ? 'bg-[#E5E5EA] opacity-50 cursor-not-allowed' : deliveryActive ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                aria-pressed={deliveryActive}
                aria-label="Toggle home delivery"
              >
                <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${deliveryActive ? 'translate-x-[20px]' : ''}`} />
              </button>
            </div>
            <p className="text-[12px] font-varela text-[#8D848F] leading-[16px] mb-3">
              Can't pick up? Get it delivered to your doorstep.
            </p>

            {/* Locked notice — cart below the delivery minimum. */}
            {deliveryLocked && (
              <div className="flex items-start gap-2 rounded-[10px] bg-[#FFF7ED] border border-[#FED7AA] px-3 py-2.5 mb-1">
                <span className="text-[14px] leading-none mt-0.5">🔒</span>
                <p className="text-[12px] font-varela text-[#9A3412] leading-[16px]">
                  Home delivery unlocks at a minimum order of <span className="font-bold">₹{deliveryMinOrder}</span>.
                  Add <span className="font-bold">₹{deliveryShortfall}</span> more to your cart to get it delivered.
                </p>
              </div>
            )}

            {deliveryActive && (
              <div className="space-y-3">
                {/* Address - the distance and charge are measured from it. */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label htmlFor="deliveryAddress" className="block text-[13px] font-nunito font-semibold text-[#1A181B]">
                      Delivery address <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      disabled={isLocating}
                      className="flex items-center gap-1 text-[12px] font-nunito font-semibold text-[#FE8301] hover:underline disabled:opacity-60"
                    >
                      {isLocating ? <Loader2 size={12} className="animate-spin" /> : <span aria-hidden="true">{"\u{1F4CD}"}</span>}
                      {isLocating ? "Locating..." : "Use my location"}
                    </button>
                  </div>
                  <textarea
                    id="deliveryAddress"
                    required
                    aria-required="true"
                    value={deliveryAddress}
                    onChange={(e) => handleDeliveryAddressChange(e.target.value)}
                    placeholder="House / flat no., building, street, landmark, area, city"
                    rows={3}
                    className="w-full border rounded-[10px] px-3 py-2.5 text-[13px] min-[375px]:text-[14px] leading-[18px] font-varela text-[#333333] placeholder:text-[#0A0A0A80] outline-none border-[#D1D5DC] focus:border-[#FE8301] resize-none"
                  />
                </div>

                {/* Measured distance + charge */}
                {quoteState === "loading" && (
                  <p className="flex items-center gap-1.5 text-[12px] font-varela text-[#8D848F]">
                    <Loader2 size={12} className="animate-spin" /> Calculating distance...
                  </p>
                )}
                {measuredDelivery && (
                  <div className="flex items-center justify-between gap-2 rounded-[10px] bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-2.5">
                    <span className="text-[13px] font-varela text-[#166534]">
                      Distance approx. <span className="font-bold">{measuredDelivery.distanceKm.toFixed(1)} km</span>
                    </span>
                    <span className="text-[13px] font-nunito font-semibold text-[#166534]">
                      Delivery charge {"\u20B9"}{measuredDelivery.charge.toFixed(0)}
                    </span>
                  </div>
                )}
                {quoteState === "error" && quoteMessage && (
                  <p role="alert" className="text-xs text-red-600 font-varela">{quoteMessage}</p>
                )}

                {/* Distance range chips - manual fallback when the distance
                    couldn't be measured automatically. */}
                {!measuredDelivery && quoteState !== "loading" && quoteState !== "error" && (
                <div id="deliveryDistance">
                  <label className="block text-[13px] font-nunito font-semibold text-[#1A181B] mb-1.5">
                    Select your distance <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  {quoteMessage && (
                    <p className="text-[11px] font-varela text-[#9A3412] mb-1.5">{quoteMessage}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(deliveryConfig.slabs || []).map((slab, idx) => {
                      const isSel = selectedSlabIndex === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { setSelectedSlabIndex(idx); setDeliveryError(''); }}
                          className={`px-3 py-2 rounded-[10px] text-[13px] font-varela border transition-colors ${isSel
                            ? 'border-[#FE8301] bg-[#FFF7ED] text-[#FE8301] font-semibold'
                            : 'border-[#D1D5DC] text-[#333333] hover:border-[#FE8301]'}`}
                        >
                          {slab.fromKm}–{slab.toKm} km · ₹{Number(slab.charge).toFixed(0)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}

                {deliveryError && (
                  <p role="alert" className="text-xs text-red-600 flex items-center gap-1 font-varela">
                    <span aria-hidden="true">⚠</span>{deliveryError}
                  </p>
                )}
                {deliveryConfig.minOrderValue > 0 && (
                  <p className="text-[11px] font-varela text-[#8D848F]">
                    Minimum order for delivery: ₹{deliveryConfig.minOrderValue}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Apply Coupon Section — guests see the section disabled with
            a "Login to use" CTA. Loyalty / promotional codes require a
            customer account so the redemption ledger has an identity to
            track usage / abuse against. */}
            <section className="mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <div className="flex items-center gap-2 mb-3">
                <i className="fi fi-rr-tags text-[#FE8301] text-[20px] min-[375px]:text-[24px] leading-none"></i>
                <h2 className="text-[16px] min-[375px]:text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B]">
                  Apply Coupon
                </h2>
              </div>
              {isGuest && (
                <div className="mb-3 flex items-center gap-2 bg-[#FFF7ED] border border-[#FED7AA] rounded-[10px] px-3 py-2.5">
                  <i className="fi fi-rr-lock text-[#FE8301] text-[16px] leading-none shrink-0" aria-hidden="true" />
                  <p className="flex-1 text-[12px] min-[375px]:text-[13px] font-varela text-[#9A3412] leading-[16px]">
                    Login to unlock coupons & save on every order.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="shrink-0 bg-[#FE8301] text-white text-[12px] font-nunito font-semibold px-3 py-1.5 rounded-[8px] active:scale-95 transition-transform"
                  >
                    Login
                  </button>
                </div>
              )}
              <div className={`flex gap-2 mb-1 ${isGuest ? 'opacity-60' : ''}`}>
                <input
                  id="couponCode"
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponError) setCouponError('') }}
                  placeholder="FIRST20"
                  aria-label="Coupon code"
                  aria-invalid={couponError ? 'true' : 'false'}
                  aria-describedby={couponError ? 'couponCode-err' : undefined}
                  disabled={isGuest}
                  className={`flex-1 min-w-0 border rounded-[10px] px-3 py-2.5 text-[13px] min-[375px]:text-[14px] leading-[18px] font-varela text-[#333333] placeholder:text-[#0A0A0A80] outline-none ${couponError ? 'border-red-400 focus:border-red-500' : 'border-[#D1D5DC] focus:border-[#FE8301]'} disabled:bg-[#F4F4F5] disabled:cursor-not-allowed`}
                />
                <button
                  onClick={() => handleApplyCoupon()}
                  disabled={applyingCoupon?.source === 'input' || isGuest}
                  aria-busy={applyingCoupon?.source === 'input' ? 'true' : 'false'}
                  className="bg-[#FE8301] text-white px-3 min-[375px]:px-4 py-2.5 rounded-[11px] leading-[16px] font-semibold font-nunito text-[14px] min-[375px]:text-[15px] active:scale-95 transition-transform flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {applyingCoupon?.source === 'input' ? <Loader2 size={14} className="animate-spin" /> : null}
                  Apply
                </button>
              </div>
              {couponError && (
                <div
                  id="couponCode-err"
                  role="alert"
                  className="mt-2 mb-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-[10px] px-3 py-2.5"
                >
                  <i className="fi fi-rr-exclamation text-red-500 text-[14px] leading-none mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="flex-1 text-[12px] min-[375px]:text-[13px] font-varela text-red-700 leading-[16px]">
                    {couponError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCouponError('')}
                    aria-label="Dismiss error"
                    className="shrink-0 text-red-400 hover:text-red-600 active:scale-95 transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {appliedCoupon && (
                <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-[10px] px-3 py-2">
                  <Check size={15} className="text-green-600 flex-shrink-0" />
                  <span className="text-green-700 text-[12px] font-varela">
                    {appliedCoupon.coupon?.code || 'Coupon'} applied!
                  </span>
                  <button
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponCode("");
                    }}
                    className="ml-auto text-gray-400 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <p className="text-[14px] min-[375px]:text-[15px] leading-[22px] font-nunito text-[#364153] font-semibold mb-2">
                Available Coupons:
              </p>
              <div className="flex flex-col gap-2">
                {availableCoupons.length > 0 ? availableCoupons.map((c) => {
                  const isApplied = appliedCoupon?.coupon?.code === c.code;
                  const discountLabel = c.discountType === 'percentage'
                    ? `${c.discountValue}% OFF`
                    : `₹${c.discountValue} OFF`;
                  // "(subtotal)" suffix matches Swiggy/Zomato copy — kills
                  // the "but my total is over ₹500" confusion before it
                  // happens. The minOrderValue is checked against the
                  // pre-tax subtotal on the backend.
                  const minOrderLabel = c.minOrderValue > 0 ? `Min. order ₹${c.minOrderValue} (subtotal)` : null;
                  const maxDiscountLabel = c.discountType === 'percentage' && c.maxDiscountAmount > 0
                    ? `Up to ₹${c.maxDiscountAmount}`
                    : null;
                  // Proactive minimum-order check — disables Apply when
                  // the subtotal hasn't reached the threshold yet, with
                  // a helpful "Add ₹X more" gap. Final authority still
                  // lives on the server.
                  const minOrderGap = (c.minOrderValue > 0 && subtotal < c.minOrderValue)
                    ? Math.ceil(c.minOrderValue - subtotal)
                    : 0;
                  const isLocked = minOrderGap > 0;
                  return (
                    <div
                      key={c.code || c._id}
                      className={`relative w-full text-left p-3 rounded-[12px] border transition-all ${
                        isApplied
                          ? 'border-green-300 bg-green-50'
                          : isLocked
                            ? 'border-[#F2F4F7] bg-[#FAFAFB] opacity-90'
                            : 'border-[#F2F4F7] bg-white hover:border-[#FDDCB5]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${
                          isApplied ? 'bg-green-100' : 'bg-[#FFF9F2]'
                        }`}>
                          <i className={`fi fi-rr-tags text-[16px] leading-none ${
                            isApplied ? 'text-green-600' : 'text-[#FE8301]'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] min-[375px]:text-[14px] font-nunito font-bold text-[#1A181B] tracking-tight">
                              {c.code}
                            </span>
                            <span className={`text-[10px] min-[375px]:text-[11px] font-nunito font-bold px-2 py-0.5 rounded-full ${
                              isApplied ? 'bg-green-600 text-white' : 'bg-[#FE8301] text-white'
                            }`}>
                              {discountLabel}
                            </span>
                          </div>
                          {c.title && (
                            <p className="text-[12px] min-[375px]:text-[13px] font-varela text-[#364153] mt-0.5 truncate">
                              {c.title}
                            </p>
                          )}
                          {(minOrderLabel || maxDiscountLabel) && (
                            <p className="text-[10px] min-[375px]:text-[11px] font-varela text-[#8D848F] mt-1">
                              {[minOrderLabel, maxDiscountLabel].filter(Boolean).join(' · ')}
                            </p>
                          )}

                          {/* Action row — single-tap Apply + View Terms link */}
                          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                            {isApplied ? (
                              <span className="inline-flex items-center gap-1 text-[12px] font-nunito font-semibold text-green-600">
                                <Check size={14} /> Applied
                              </span>
                            ) : isLocked ? (
                              <span className="text-[11px] min-[375px]:text-[12px] font-varela text-red-600">
                                Add ₹{minOrderGap} more to unlock
                              </span>
                            ) : isGuest ? (
                              <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="bg-white text-[#FE8301] border border-[#FE8301] text-[12px] font-nunito font-semibold px-3 py-1.5 rounded-[8px] active:scale-95 transition-transform inline-flex items-center gap-1"
                              >
                                <i className="fi fi-rr-lock text-[10px] leading-none" aria-hidden="true" />
                                Login to use
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleApplyCoupon(c.code, 'card')}
                                disabled={applyingCoupon?.code === String(c.code || '').toUpperCase()}
                                aria-busy={applyingCoupon?.code === String(c.code || '').toUpperCase() ? 'true' : 'false'}
                                className="bg-[#FE8301] text-white text-[12px] font-nunito font-semibold px-3 py-1.5 rounded-[8px] active:scale-95 transition-transform disabled:opacity-60 inline-flex items-center gap-1"
                              >
                                {applyingCoupon?.code === String(c.code || '').toUpperCase()
                                  ? <><Loader2 size={12} className="animate-spin" /> Applying…</>
                                  : 'Apply'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setTermsCoupon(c)}
                              className="text-[12px] font-nunito font-semibold text-[#1F78FF] hover:text-[#0E5BD9] active:scale-95 transition-all"
                              aria-label={`View terms for coupon ${c.code}`}
                            >
                              View Terms
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-[#8D848F] text-[12px] font-varela px-1">No coupons available</p>
                )}
              </div>
            </section>

            {/* Wallet Points Section — guests see it disabled with a
                "Login to use" CTA. Wallet is per-tenant and bound to a
                customer identity (see CLAUDE.md "Wallet semantics") so
                guests literally have nothing to redeem. Takeaway only:
                a dine-in bill is paid (wallet included) on the Payment
                screen after the meal. */}
            {isTakeaway && (
            <section className="mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                  <i className="fi fi-rr-gift text-[#FE8301] text-[20px] leading-none"></i>
                </div>
                <h2 className="text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B]">
                  Wallet
                </h2>
              </div>

              {isGuest && (
                <div className="mb-3 flex items-center gap-2 bg-[#FFF7ED] border border-[#FED7AA] rounded-[10px] px-3 py-2.5">
                  <i className="fi fi-rr-lock text-[#FE8301] text-[16px] leading-none shrink-0" aria-hidden="true" />
                  <p className="flex-1 text-[12px] min-[375px]:text-[13px] font-varela text-[#9A3412] leading-[16px]">
                    Login to earn & redeem wallet rewards.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="shrink-0 bg-[#FE8301] text-white text-[12px] font-nunito font-semibold px-3 py-1.5 rounded-[8px] active:scale-95 transition-transform"
                  >
                    Login
                  </button>
                </div>
              )}

              <div className={`flex gap-3 mb-1 ${isGuest ? 'opacity-60' : ''}`}>
                <input
                  id="pointsToRedeem"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={pointsToRedeem}
                  onChange={(e) => { setPointsToRedeem(e.target.value); if (pointsError) setPointsError('') }}
                  placeholder="Amount to redeem"
                  aria-label="Wallet points to redeem"
                  aria-invalid={pointsError ? 'true' : 'false'}
                  aria-describedby={pointsError ? 'pointsToRedeem-err' : undefined}
                  disabled={isGuest}
                  className={`flex-1 min-w-0 border rounded-[10px] px-3 py-2.5 text-[14px] font-varela text-[#333333] placeholder:text-[#8D848F] outline-none ${pointsError ? 'border-red-400 focus:border-red-500' : 'border-[#D1D5DC] focus:border-[#FE8301]'} disabled:bg-[#F4F4F5] disabled:cursor-not-allowed`}
                />
                <button
                  onClick={handleRedeemPoints}
                  disabled={isGuest}
                  className="bg-[#FE8301] text-white px-6 py-2.5 rounded-[11px] font-semibold font-nunito text-[15px] active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Redeem
                </button>
              </div>
              {pointsError && (
                <p id="pointsToRedeem-err" role="alert" className="text-xs text-red-600 mb-3 flex items-center gap-1 font-varela">
                  <span aria-hidden="true">⚠</span>{pointsError}
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[14px] font-varela text-[#1A181B] font-medium">
                  Available Points:
                </span>
                <span className="text-[14px] font-varela text-[#007AFF] font-medium">
                  {isGuest ? '— Login to view' : `${availablePoints.toFixed(2)} Points`}
                </span>
              </div>

              {appliedPoints > 0 && (
                <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-[10px] px-3 py-2">
                  <Check size={15} className="text-blue-600 shrink-0" />
                  <span className="text-blue-700 text-[12px] font-varela">
                    ₹{appliedPoints} points applied!
                  </span>
                  <button
                    onClick={() => setAppliedPoints(0)}
                    className="ml-auto text-gray-400 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </section>
            )}

            {/* Add Tip Section */}
            <section className="bg-white rounded-[16px] border border-[#F6F6F6] p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <h2 className="text-[20px] leading-[28px] font-nunito font-semibold text-[#1A181B] mb-2">
                Add Tip
              </h2>
              <div className="grid grid-cols-4 gap-1.5 min-[375px]:gap-2 mb-3">
                {[20, 30, 40, 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      // Apply the tip IMMEDIATELY on tap (toggle off if
                      // re-tapped). Previously these buttons only filled the
                      // custom-amount input, so a customer who tapped "₹30"
                      // (it highlighted, looked selected) and placed the
                      // order had NO tip stored — tipAmount stayed null
                      // because they never pressed "Add". That's why the tip
                      // never reached the order / admin bill. Apply directly.
                      setTipAmount((prev) => (prev === amt ? null : amt));
                      setCustomTip("");
                    }}
                    className={`py-2 min-[375px]:py-[11px] rounded-[12px] min-[375px]:rounded-[16px] border text-[13px] min-[375px]:text-[15px] font-varela transition-all ${tipAmount === amt
                      ? "border-[#FF9B0B] bg-[#FFFAF5] text-[#1A181B] font-semibold ring-1 ring-[#FF9B0B]"
                      : "border-[#EEEEEE] bg-[#F9F9F9] text-[#1A181B]"
                      }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="Enter custom amount"
                  className="flex-1 min-w-0 border border-[#D1D5DC] rounded-[12px] min-[375px]:rounded-[16px] px-3 min-[375px]:px-4 py-2.5 min-[375px]:py-[14px] text-[13px] min-[375px]:text-[14px] font-varela text-[#333333] placeholder:text-[#8D848F] outline-none focus:border-[#FE8301]"
                />
                <button
                  onClick={() => {
                    const v = Number(customTip);
                    if (v > 0) {
                      setTipAmount(v);
                      setCustomTip("");
                    }
                  }}
                  className="bg-[#FE8301] text-white px-4 min-[375px]:px-6 py-2.5 min-[375px]:py-[14px] rounded-[12px] min-[375px]:rounded-[16px] font-nunito font-semibold text-[13px] min-[375px]:text-[14px] leading-[16px] active:scale-95 transition-transform flex-shrink-0"
                >
                  Add
                </button>
              </div>
              {tipAmount > 0 && (
                <div className="mt-3 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-[10px] px-3 py-2">
                  <Check size={15} className="text-orange-600 shrink-0" />
                  <span className="text-orange-700 text-[12px] font-varela">
                    Tip of ₹{tipAmount} added. Thank you!
                  </span>
                  <button
                    onClick={() => setTipAmount(null)}
                    className="ml-auto text-gray-400 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </section>

            {/* Bill Summary Section */}
            <section className="bg-white rounded-[16px] border border-[#F6F6F6] p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <h2 className="text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B] mb-3">
                Bill Summary
              </h2>
              <div className="flex flex-col gap-2 text-[14px] font-varela">
                <div className="flex justify-between text-[#364153]">
                  <span className="flex items-baseline gap-1">
                    Subtotal
                    <span className="text-[10px] font-varela text-[#8D848F] tracking-tight">(items only)</span>
                  </span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                {gst > 0 && (
                  <div className="flex justify-between text-[#8D848F]">
                    <span>GST ({taxConfig.gstPct}%)</span>
                    <span>₹{gst.toFixed(2)}</span>
                  </div>
                )}
                {serviceCharge > 0 && (
                  <div className="flex justify-between text-[#8D848F]">
                    <span>Service Charge ({bill.serviceChargePct}%)</span>
                    <span>₹{serviceCharge.toFixed(2)}</span>
                  </div>
                )}
                {bill.additionalCharges.map((c, i) => {
                  const suffix = c.type === 'Percentage' ? ` (${c.value}%)` : '';
                  return (
                    <div key={c.name || i} className="flex justify-between text-[#8D848F]">
                      <span>{c.name}{suffix}</span>
                      <span>₹{c.amount.toFixed(2)}</span>
                    </div>
                  );
                })}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon Discount</span>
                    <span>-₹{couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                {walletAppliedToBill > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Wallet Points</span>
                    <span>-₹{walletAppliedToBill.toFixed(2)}</span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Tip</span>
                    <span>₹{tipAmount.toFixed(2)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-[#8D848F]">
                    <span>Delivery{measuredDelivery ? ` (${measuredDelivery.distanceKm.toFixed(1)} km)` : selectedSlab ? ` (${selectedSlab.fromKm}–${selectedSlab.toKm} km)` : ''}</span>
                    <span>₹{deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-dashed border-[#E5E5E5] my-1"></div>
                <div className="flex justify-between text-[#1A181B] font-nunito font-bold text-[16px]">
                  <span>Total</span>
                  <span>₹{finalTakeawayTotal.toFixed(2)}</span>
                </div>
              </div>
            </section>

        {/* Health Mode Recommendations */}
        {healthMode && !isTakeaway && cartItems.length > 0 && (
          <>
            {/* Pairing Section */}
            <section className="bg-[#F9FEF2] -mx-4 py-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-2 px-4">
                You will love pairing it with
              </h2>

              <div
                className="flex gap-2 overflow-x-auto pb-4 px-4"
                style={{ scrollbarWidth: "none" }}
              >
                {pairingItems.map((item) => (
                  <div
                    key={item.id}
                    className="shrink-0 w-32 bg-white rounded-2xl p-1.5 shadow-sm cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="w-full h-24 rounded-xl overflow-hidden mb-2">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <p className="text-sm font-medium text-gray-800 line-clamp-1">
                      {item.title}
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      ₹{item.price}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Floating Bottom Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full lg:max-w-3xl p-3 sm:p-4 md:p-5 bg-white border-t border-gray-100 transition-colors duration-200">
        {/* Dine-in lock banner — surfaces just above the CTA so the
            customer sees the "why" before they try to tap a dead
            button. Only shown for dine-in (the lock util gates
            itself on dineInTable being present). */}
        {dineInLocked && !isTakeaway && (
          <div className="mb-2 flex items-start gap-2 bg-[#FFF8EB] border border-[#FCE7A4] rounded-xl px-3 py-2">
            <span className="text-[16px] leading-none mt-0.5">🔒</span>
            <p className="text-[12px] font-varela text-[#7A4504] leading-snug">
              Your bill is settled. Please <span className="font-semibold">re-scan the table QR</span> to start a new order.
            </p>
          </div>
        )}
        <button
          onClick={handlePlaceOrder}
          disabled={cartItems.length === 0 || isSubmitting || (dineInLocked && !isTakeaway)}
          className={`w-full py-3 rounded-xl semibold font-nunito text-[14px] shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 ${
            isSubmitting || cartItems.length === 0 || (dineInLocked && !isTakeaway)
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : isTakeaway && !selectedTime
              ? "bg-orange-300 text-white cursor-pointer"
              : "bg-[#FE8301] text-white"
            }`}
        >
          {isSubmitting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <ShoppingCart size={18} className="sm:w-5 sm:h-5 md:w-6 md:h-6 " />
          )}
          <span>
            {dineInLocked && !isTakeaway
              ? "Re-scan QR to order"
              : isSubmitting
              ? "Placing Order..."
              : isTakeaway
              ? !selectedTime
                ? "Please Select Pickup Time"
                : `Proceed to Pay ₹${finalTakeawayTotal.toFixed(2)}`
              : activeOrdersCount > 0
                ? `Place New Order · ₹${finalTakeawayTotal.toFixed(2)}`
                : `Place Order ₹${finalTakeawayTotal.toFixed(2)}`}
          </span>
        </button>
      </div>

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

      {/* Coupon Terms & Conditions modal — opened from "View Terms" on
          each coupon card. Bottom-sheet on mobile, centred card on sm+.
          z-[100] to clear the BottomNav (which sits at z-50). */}
      {termsCoupon && (() => {
        const c = termsCoupon;
        const isApplied = appliedCoupon?.coupon?.code === c.code;
        const discountLabel = c.discountType === 'percentage'
          ? `${c.discountValue}% OFF`
          : `₹${c.discountValue} OFF`;
        const fmtDate = (d) => {
          if (!d) return null;
          try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
          catch { return null; }
        };
        const expiry = fmtDate(c.endDate);
        const startDate = fmtDate(c.startDate);
        const terms = [
          c.minOrderValue > 0       && `Minimum order value: ₹${c.minOrderValue}`,
          (c.discountType === 'percentage' && c.maxDiscountAmount > 0) && `Maximum discount: ₹${c.maxDiscountAmount}`,
          c.scope === 'food'        && `Applies to food items only`,
          c.scope === 'beverages'   && `Applies to beverages only`,
          (c.startTime && c.endTime) && `Valid between ${c.startTime} – ${c.endTime}`,
          c.usagePerUser > 0        && `Limit: ${c.usagePerUser} use${c.usagePerUser > 1 ? 's' : ''} per customer`,
          startDate                 && `Valid from: ${startDate}`,
          expiry                    && `Valid until: ${expiry}`,
          c.couponCategory === 'first_order' && `New customers only (first order)`,
        ].filter(Boolean);

        return (
          <div
            onClick={() => setTermsCoupon(null)}
            className="fixed inset-x-0 top-0 h-[100dvh] z-[100] bg-black/60 flex items-end sm:items-center justify-center"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full sm:max-w-[450px] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col"
            >
              {/* Drag handle (mobile) */}
              <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
                <span className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0 border-b border-gray-100">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[16px] font-nunito font-bold text-[#1A181B] tracking-tight">{c.code}</span>
                    <span className="text-[10px] font-nunito font-bold px-2 py-0.5 rounded-full bg-[#FE8301] text-white">
                      {discountLabel}
                    </span>
                  </div>
                  {c.title && (
                    <p className="text-[13px] font-varela text-[#364153] mt-1">{c.title}</p>
                  )}
                </div>
                <button
                  onClick={() => setTermsCoupon(null)}
                  aria-label="Close terms"
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                >
                  <X size={16} className="text-gray-700" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {c.description && (
                  <div>
                    <h4 className="text-[12px] font-nunito font-semibold text-[#8D848F] uppercase tracking-wider mb-1.5">About</h4>
                    <p className="text-[13px] font-varela text-[#364153] leading-relaxed whitespace-pre-line">{c.description}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-[12px] font-nunito font-semibold text-[#8D848F] uppercase tracking-wider mb-2">Terms &amp; Conditions</h4>
                  {terms.length > 0 ? (
                    <ul className="space-y-2">
                      {terms.map((t, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[#FE8301] mt-0.5 shrink-0">•</span>
                          <span className="text-[13px] font-varela text-[#1A181B] leading-relaxed">{t}</span>
                        </li>
                      ))}
                      <li className="flex items-start gap-2">
                        <span className="text-[#FE8301] mt-0.5 shrink-0">•</span>
                        <span className="text-[13px] font-varela text-[#1A181B] leading-relaxed">
                          Cannot be combined with other coupons.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#FE8301] mt-0.5 shrink-0">•</span>
                        <span className="text-[13px] font-varela text-[#1A181B] leading-relaxed">
                          Restaurant reserves the right to withdraw the offer at any time.
                        </span>
                      </li>
                    </ul>
                  ) : (
                    <p className="text-[13px] font-varela text-[#8D848F]">No additional terms.</p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {isApplied ? (
                  <button
                    onClick={() => setTermsCoupon(null)}
                    className="w-full bg-green-600 text-white font-nunito font-semibold py-3 rounded-[12px] text-[14px]"
                  >
                    Already Applied
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const code = c.code;
                      setTermsCoupon(null);
                      handleApplyCoupon(code, 'card');
                    }}
                    disabled={applyingCoupon?.code === String(c.code || '').toUpperCase()}
                    className="w-full bg-[#FE8301] hover:bg-[#E67700] text-white font-nunito font-semibold py-3 rounded-[12px] text-[14px] transition-colors active:scale-[0.98] disabled:opacity-60"
                  >
                    {applyingCoupon?.code === String(c.code || '').toUpperCase() ? 'Applying…' : 'Apply Coupon'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default Cart;
