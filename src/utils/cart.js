/**
 * cart — pure helpers every cart implementation shares.
 *
 * There are several carts in the app (the customer/waiter CartContext
 * store, the customer Cart page, the waiter CartPage, and the kiosk's
 * own localStorage cart). Each used to decide for itself what makes two
 * lines "the same line", how a line is totalled and what the header
 * badge counts, and they drifted. These helpers are the one answer; the
 * carts keep their own storage and shapes.
 *
 * Line shapes in play (all supported):
 *   CartContext : { unitPrice?, price, quantity, selectedSize?, selectedToppings? }
 *   kiosk       : { menuItemId, unitPrice, qty, size, addons: [{ name, qty, price }] }
 *
 * Bill maths (tax, charges, rounding) is NOT here — see utils/billing.
 */

import { round2 } from './pricing';

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Order-insensitive signature of a topping / add-on selection.
 * Toppings are identified by id when they have one, else by name; an
 * add-on picked more than once (kiosk "2× Cheese") includes its count.
 */
export function toppingSignature(toppings) {
    return (Array.isArray(toppings) ? toppings : [])
        .filter(Boolean)
        .map((t) => {
            if (typeof t !== 'object') return String(t);
            const id = String(t.id ?? t._id ?? t.name ?? '');
            // Only the kiosk's add-on count (`qty`) — menu toppings may
            // carry an unrelated `quantity` (portion size).
            const q = num(t.qty);
            return q > 1 ? `${id}x${q}` : id;
        })
        .sort()
        .join(',');
}

/**
 * Stable line identity for item + size + toppings. Two selections with
 * the same key are the same cart line and merge; anything else is a new
 * line. The format (`<id>-<size|default>-<sorted topping ids>`) is the
 * one the waiter cart has always persisted, so stored carts keep their
 * keys.
 */
export function cartLineKey(productId, { size = null, toppings = [] } = {}) {
    const sizeLabel = (size && typeof size === 'object') ? (size.name ?? size.id) : size;
    return `${productId}-${sizeLabel || 'default'}-${toppingSignature(toppings)}`;
}

/** Line identity of a kiosk cart line ({ menuItemId, size, addons }). */
export function kioskLineKey(line) {
    return cartLineKey(line?.menuItemId, { size: line?.size, toppings: line?.addons });
}

/** Quantity of a line, whichever field the cart uses. */
export function lineQuantity(line) {
    return num(line?.quantity ?? line?.qty);
}

/**
 * Per-unit price of a line. `unitPrice` (size + toppings, set when the
 * line is built) wins over the bare `price`, matching every cart view.
 */
export function lineUnitPrice(line) {
    return num(line?.unitPrice || line?.price || 0);
}

/** unit × quantity, rounded to paise. */
export function lineTotal(line) {
    return round2(lineUnitPrice(line) * lineQuantity(line));
}

function asArray(lines) {
    if (!lines) return [];
    return Array.isArray(lines) ? lines : Object.values(lines);
}

/** Sum of line totals. Accepts an array or a keyed object of lines. */
export function cartSubtotal(lines) {
    return round2(asArray(lines).reduce((sum, line) => sum + lineTotal(line), 0));
}

/**
 * Number of distinct lines with a positive quantity — 3 products × qty 2
 * is "3 items", not 6. This is what every cart badge shows.
 */
export function countDistinctLines(lines) {
    return asArray(lines).filter((line) => lineQuantity(line) > 0).length;
}

/**
 * Merge `delta` units (plus any updated details) into an existing line.
 * Returns null when the resulting quantity is 0 — the caller drops the
 * line. `qtyField` is 'quantity' for CartContext, 'qty' for the kiosk.
 */
export function mergeLine(existing, details = {}, delta = 0, qtyField = 'quantity') {
    const current = num(existing?.[qtyField]);
    const nextQty = Math.max(0, current + num(delta));
    if (nextQty === 0) return null;
    return { ...(existing || {}), ...details, [qtyField]: nextQty };
}

/**
 * Add `line` to an array cart (the kiosk shape), merging into the line
 * with the same identity when there is one. Pure — returns a new array.
 */
export function upsertLine(lines, line, quantity, { keyOf = kioskLineKey, qtyField = 'qty' } = {}) {
    const list = Array.isArray(lines) ? lines : [];
    const key = keyOf(line);
    const idx = list.findIndex((l) => keyOf(l) === key);
    if (idx === -1) return [...list, { ...line, [qtyField]: num(quantity) }];
    const merged = mergeLine(list[idx], {}, quantity, qtyField);
    return merged
        ? list.map((l, i) => (i === idx ? merged : l))
        : list.filter((_, i) => i !== idx);
}

/**
 * Change the quantity of the line identified by `key` by `delta`,
 * dropping it at 0. Pure — returns a new array.
 */
export function changeLineQty(lines, key, delta, { keyOf = kioskLineKey, qtyField = 'qty' } = {}) {
    return (Array.isArray(lines) ? lines : [])
        .map((l) => (keyOf(l) === key ? mergeLine(l, {}, delta, qtyField) : l))
        .filter(Boolean);
}
