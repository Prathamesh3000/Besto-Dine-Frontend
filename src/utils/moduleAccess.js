/**
 * Module access helpers for Super Admin screens — mirrors
 * Backend/utils/featureAccess.js (override → active add-on → plan).
 */

// Boolean modules, in the order the plan editor lists them.
export const MODULE_KEYS = [
    'dineIn', 'takeaway', 'kitchenDisplay', 'waiterDashboard', 'paymentGateway',
    'tipManagement', 'inventory', 'multiBranch', 'dataExport', 'accountingExport', 'aggregatorOrders',
    'walletLoyalty', 'couponPromotions', 'campaigns', 'crm', 'advanceBookingTable', 'staffPerformance',
    'advanceBookingHall', 'kiosk', 'eInvoice', 'webhooks', 'whiteLabelBranding',
];

const isOn = (v) => v === true || v === 'basic' || v === 'standard' || v === 'advanced';

export const isAddonActive = (a, now = Date.now()) =>
    a && a.status === 'active'
    && (!a.startDate || new Date(a.startDate).getTime() <= now)
    && (!a.endDate || new Date(a.endDate).getTime() > now);

export function resolveModule(restaurant, key) {
    const override = restaurant?.featureOverrides?.[key];
    const planValue = restaurant?.subscription?.features?.[key];
    const addon = (restaurant?.addons || []).find(a => a.key === key && isAddonActive(a));
    let on;
    let source;
    if (override === false) { on = false; source = 'override'; }
    else if (override === true) { on = true; source = 'override'; }
    else if (addon) { on = true; source = 'addon'; }
    else { on = isOn(planValue); source = 'plan'; }
    return { on, source, inPlan: isOn(planValue), override, addon };
}
