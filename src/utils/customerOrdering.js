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
