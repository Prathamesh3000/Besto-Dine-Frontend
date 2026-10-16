/**
 * Operations profile on the frontend — "HOW does this restaurant run?"
 * (OPERATIONS_CONTROL_PANEL_DESIGN.md).
 *
 * The backend resolves everything (Backend/utils/operationsProfile.js):
 *   - staff apps get the full resolved profile on `/auth/me` as
 *     `user.tenant.operations` (read it with useOperations()).
 *   - customer apps get a customer-safe subset on the QR scan, the
 *     restaurant-by-slug lookup and the menu bootstrap, stored on the
 *     active tenant blob (read it with getCustomerOperations()).
 *
 * Nothing here re-implements a rule. The only logic is the fallback to
 * today's behaviour when an older backend / cached blob has no profile —
 * or has only part of one: a stored blob is deep-merged over
 * DEFAULT_PUBLIC_OPERATIONS so every key callers read (e.g.
 * `payment.methods.online`) is always present with today's default.
 */
import { getActiveTenant } from './tenant';

/** Today's customer-facing behaviour — what an absent profile means. */
export const DEFAULT_PUBLIC_OPERATIONS = Object.freeze({
    serviceModel: 'tableService',
    orderFlow: Object.freeze({ customerSelfOrder: true, customerTracking: true }),
    payment: Object.freeze({
        dineIn: 'payAfter',
        takeaway: 'payFirst',
        kiosk: 'payFirst',
        delivery: 'payFirst',
        methods: Object.freeze({ online: true, wallet: true, counterCash: false }),
    }),
    customerApp: Object.freeze({ callWaiter: true, requestBill: true, appendToOrder: true, tips: true }),
    tables: Object.freeze({ useTables: true }),
});

/** Today's full staff-side profile — used when there is no tenant
 *  snapshot (super admin, legacy single-tenant, older cached login). */
export const DEFAULT_OPERATIONS = Object.freeze({
    preset: 'fullService',
    modules: Object.freeze({ qrOrdering: true, waiter: true, captain: true, chef: true, customerPayment: true }),
    serviceModel: 'tableService',
    roles: Object.freeze({ waiter: true, captain: true, chef: true }),
    orderFlow: Object.freeze({
        customerSelfOrder: true, staffOrder: true, kitchenDisplay: true,
        servedStep: true, customerTracking: true,
    }),
    payment: Object.freeze({
        dineIn: 'payAfter', takeaway: 'payFirst', kiosk: 'payFirst', delivery: 'payFirst',
        methods: Object.freeze({ online: true, wallet: true, counterCash: false }),
        holdUntilPaid: false, holdExpiryMinutes: 20,
    }),
    customerApp: Object.freeze({ callWaiter: true, requestBill: true, appendToOrder: true, tips: true }),
    tables: Object.freeze({ useTables: true, assignWaiters: true, mergeTables: true }),
    channels: Object.freeze({ dineIn: true, takeaway: true, kiosk: true }),
    planBlocks: Object.freeze([]),
});

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Keys of `over` win; nested plain objects merge key by key; a missing,
 *  undefined or null value keeps the default. Extra keys are kept. */
function deepMerge(base, over) {
    const out = { ...base };
    for (const [key, value] of Object.entries(over)) {
        if (value == null) continue;
        out[key] = isPlainObject(base?.[key]) && isPlainObject(value)
            ? deepMerge(base[key], value)
            : value;
    }
    return out;
}

/**
 * Pure: fill a partial customer-side profile with today's defaults.
 * `mergePublicOperations({ payment: { methods: { online: false } } })`
 * gives online:false, wallet:true, counterCash:false and everything else
 * as in DEFAULT_PUBLIC_OPERATIONS. Explicit `false` is preserved; a
 * non-object input returns DEFAULT_PUBLIC_OPERATIONS itself.
 */
export function mergePublicOperations(partial) {
    if (!isPlainObject(partial)) return DEFAULT_PUBLIC_OPERATIONS;
    return deepMerge(DEFAULT_PUBLIC_OPERATIONS, partial);
}

// getCustomerOperations() runs on every render of several customer pages;
// remember the last merge so the same stored blob yields the same object.
let lastStored = null;
let lastMerged = null;

/** Customer-side profile for the active restaurant (never null; every
 *  key of DEFAULT_PUBLIC_OPERATIONS is present). */
export function getCustomerOperations() {
    const ops = getActiveTenant()?.operations;
    if (!isPlainObject(ops)) return DEFAULT_PUBLIC_OPERATIONS;
    if (ops !== lastStored) {
        lastStored = ops;
        lastMerged = mergePublicOperations(ops);
    }
    return lastMerged;
}

/** Read a dot-path flag (e.g. 'customerApp.callWaiter') from a profile. */
export function opsFlag(ops, path) {
    return path.split('.').reduce((cur, key) => (cur == null ? undefined : cur[key]), ops);
}
