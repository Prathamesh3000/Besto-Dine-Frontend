import { useCallback } from "react";
import api from "../../../utils/api";
import { resolveUnitPrice, resolveLinePrice } from "../../../utils/pricing";

// Cart price drift guard (moved verbatim from Cart.jsx).
export default function useCartPriceSync({ cartContextItems, updateCartItem, updateQtyContext }) {
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
  return syncCartPrices;
}
