/**
 * Customer-side ordering gates from the operations profile
 * (OPERATIONS_CONTROL_PANEL_DESIGN.md §5.4). The backend enforces every
 * rule (403 SELF_ORDER_DISABLED); this only keeps customers from
 * tapping into that error.
 */
import { getCustomerOperations } from './operations';

/** Shown wherever dine-in ordering controls are hidden (QR is menu-only). */
export const QR_MENU_ONLY_NOTE = 'Ordering at the table is not available — please order with the staff.';

/** The restaurant switched customer self-ordering off. */
export function isCustomerSelfOrderOff(ops = getCustomerOperations()) {
    return ops?.orderFlow?.customerSelfOrder === false;
}

/** Current customer order type ('dine-in' unless takeaway was picked). */
function readOrderType() {
    try { return localStorage.getItem('orderType') || 'dine-in'; } catch { return 'dine-in'; }
}

/**
 * True when a customer may not build a dine-in order themselves: the
 * QR is menu-only and they are in the dine-in flow. Takeaway is never
 * affected. Callers must skip this for staff (they order via the
 * waiter app, gated by orderFlow.staffOrder).
 */
export function isDineInSelfOrderBlocked(ops = getCustomerOperations()) {
    return isCustomerSelfOrderOff(ops) && readOrderType() !== 'takeaway';
}

/** Customer-facing label for where the guest is served ('Room' for a
 *  roomService hotel, else 'Table'). Wording only — v1 of roomService. */
export function serviceSpotLabel(ops = getCustomerOperations()) {
    return ops?.serviceModel === 'roomService' ? 'Room' : 'Table';
}

/**
 * How a dine-in customer pays here (operations `payment.dineIn`):
 *   'payFirst' — the cart hands the draft to the payment screen; the order
 *                exists only once it is paid
 *   'payAfter' — today's flow: the order is placed, the bill comes later
 *   'either'   — the cart offers both ("Pay now" / "Pay after the meal")
 * A missing profile or an unknown value is today's behaviour.
 */
export function dineInPaymentChoice(ops = getCustomerOperations()) {
    const mode = ops?.payment?.dineIn;
    return mode === 'payFirst' || mode === 'either' ? mode : 'payAfter';
}

/**
 * Token-number mode (OPERATIONS_CONTROL_PANEL_DESIGN.md §12.2): the
 * restaurant does not use tables (`tables.useTables === false`). Dine-in
 * orders are placed without a table and come back with a `tokenNumber`
 * ("T-042") the customer collects against at the counter. The backend
 * enforces it (a dine-in order needs no tableId); this only drives the
 * customer UI. A missing profile means tables are in use (today).
 */
export function isTokenMode(ops = getCustomerOperations()) {
    return ops?.tables?.useTables === false;
}

/** Banner shown on the menu for a tableless (token-mode) dine-in visit. */
export const TOKEN_MODE_NOTE = 'Order from your seat — you\u2019ll get a token number to collect your food.';

/**
 * Customer-facing label for an order status when the restaurant has
 * live tracking off (§12.3): the server collapses new/preparing/ready to
 * `confirmed` and served to `completed`. Other statuses pass through
 * capitalised so an uncollapsed order still reads well.
 */
export function tokenOrderStatusLabel(status) {
    switch (String(status || '').toLowerCase()) {
        case 'confirmed': return 'Confirmed';
        case 'completed': return 'Completed';
        case 'cancelled': return 'Cancelled';
        case 'awaiting-payment': return 'Awaiting payment';
        case '': return '';
        default: {
            const s = String(status);
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
    }
}
