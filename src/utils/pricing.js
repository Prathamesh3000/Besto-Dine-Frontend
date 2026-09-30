/**
 * pricing — the ONE place the frontend decides what a menu item costs.
 *
 * Why this module exists
 * ----------------------
 * Before it, ~10 call sites each inlined their own fallback chain, and
 * they did not agree. Inside Cart.jsx alone:
 *
 *   line 1088 : item.basePrice  ?? item.finalPrice ?? item.price
 *   line 1320 : item.finalPrice ||  item.basePrice  || item.unitPrice
 *
 * `basePrice` is the pre-offer price; `finalPrice` is what the customer
 * actually pays. Reading them in the wrong order silently charges the
 * pre-discount amount. That is not merely cosmetic: the server prices
 * every order authoritatively via utils/priceResolver.resolvePrice()
 * and REJECTS the order when the client total disagrees
 * (orderController "Order total does not match the server-calculated
 * price"). So a wrong precedence here doesn't just display a bad
 * number — it makes checkout fail outright.
 *
 * This module mirrors the server's resolver exactly. Treat
 * Backend/utils/priceResolver.js as the spec: if that changes, change
 * this in the same commit.
 *
 * Rule: nothing outside this file may read `finalPrice` / `basePrice`
 * to build a cart line. Import resolveUnitPrice() instead.
 */

/** Coerce to a finite number, else null. Guards '' , undefined, NaN. */
function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * The price a customer pays for one unit of `item`, before size and
 * topping modifiers.
 *
 * Precedence — finalPrice wins, always:
 *   1. finalPrice  — offer-adjusted, what the server will charge
 *   2. basePrice   — no offer configured on this item
 *   3. price       — combos and legacy/denormalised shapes carry only this
 *   4. 0
 *
 * A finalPrice of exactly 0 is honoured (a free item is legitimate),
 * which is why this tests for null rather than falsiness.
 */
export function resolveUnitPrice(item) {
    if (!item) return 0;
    // Combos are priced as a bundle and never carry base/final.
    if (item.isCombo) {
        return num(item.price) ?? num(item.finalPrice) ?? num(item.basePrice) ?? 0;
    }
    return num(item.finalPrice) ?? num(item.basePrice) ?? num(item.price) ?? 0;
}

/**
 * The struck-through "was" price, or null when there is no active
 * offer. Callers render the strikethrough only when this is non-null,
 * so an item without an offer doesn't show "₹200 ₹200".
 */
export function resolveStrikePrice(item) {
    if (!item || item.isCombo) return null;
    const base = num(item.basePrice);
    const final = num(item.finalPrice);
    if (base === null || final === null) return null;
    return base > final ? base : null;
}

/**
 * The item's active offer as a percentage (0 when none). Prefers the
 * explicit `offerPercentage`; otherwise infers it from base vs final so
 * shapes that only carry the two prices still discount correctly.
 */
export function resolveOfferPercent(item) {
    if (!item || item.isCombo) return 0;
    const explicit = num(item.offerPercentage);
    if (explicit !== null && explicit > 0) return explicit;
    const base = num(item.basePrice);
    const final = num(item.finalPrice);
    if (base && final !== null && base > final) return ((base - final) / base) * 100;
    return 0;
}

/**
 * What one unit of a given SIZE costs the customer.
 *
 * Sizes store the pre-offer (base) price. The server
 * (orderController.createOrder) charges the canonical size price with
 * the item's offerPercentage applied on top, rounded to 2dp. The
 * storefront used to show the raw size price instead, so on any
 * discounted item the modal / cart showed the undiscounted size price
 * while the menu card showed finalPrice — "Sample soup" costing one
 * amount on the menu and another once added to the cart.
 */
export function resolveSizePrice(item, size) {
    const sizePrice = num(size?.price);
    if (sizePrice === null) return resolveUnitPrice(item);
    const pct = resolveOfferPercent(item);
    return pct > 0 ? round2(sizePrice - (sizePrice * pct) / 100) : sizePrice;
}

/**
 * Unit price including the selected size and toppings — the number
 * that belongs on a cart line.
 *
 * Sizes REPLACE the base unit price (they carry their own absolute
 * price, offer-adjusted via resolveSizePrice); toppings ADD to it. This
 * matches how the server recomputes the line in
 * orderController.createOrder, which swaps in the canonical size price
 * (minus the item's offer) and then sums canonical topping prices.
 */
export function resolveLinePrice(item, { size = null, toppings = [] } = {}) {
    const unit = size ? resolveSizePrice(item, size) : resolveUnitPrice(item);
    const addons = (toppings || []).reduce((sum, t) => sum + (num(t?.price) ?? 0), 0);
    return round2(unit + addons);
}

/**
 * Format a rupee amount for display. Whole amounts render without
 * decimals, fractional ones (offer maths often produces e.g. 179.1)
 * keep 2dp — so the card, the modal and the cart line all print the
 * SAME number instead of the card rounding ₹179.1 to "₹179".
 */
export function formatPrice(n) {
    const v = round2(n);
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/** Round to 2dp. Money must never carry float dust into a total check. */
export function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}
