/**
 * billing — the ONE place the frontend turns a subtotal into a bill.
 *
 * Why this module exists
 * ----------------------
 * The gst/serviceCharge/additionalCharges arithmetic was independently
 * reimplemented in TWELVE files:
 *
 *   Loggedin/  Cart, BillDetail, BillReceipt, OrderConfirmed, Orders
 *   Kiosk/     Cart, useKioskTaxConfig
 *   Waiter/    BillPage
 *   HealthMode/BillPreviews
 *   Admin/     TablesDashboard, AddTakeawayOrderModal, OrderDetailsModal
 *
 * Twelve copies means a rule change lands in one of them and silently
 * fails in eleven. That is exactly how service charge ended up billed
 * on takeaway orders: the charge is a dine-in table-service concept,
 * but every copy applied it unconditionally because no copy knew what
 * kind of order it was pricing.
 *
 * computeBill() therefore takes `orderType` as a first-class input and
 * owns the policy. Callers pass facts; they do not decide.
 */

import { round2 } from './pricing';

export { round2 };

/**
 * Order types that attract a service charge.
 *
 * Service charge pays for table service: a server attending a seated
 * party. Takeaway, delivery and kiosk orders receive no table service,
 * so charging for it is not a pricing preference — it is billing for
 * something never rendered. Dine-in only.
 */
export const SERVICE_CHARGE_TYPES = new Set(['dine-in']);

/** Normalise the many spellings of order type in play across the app. */
export function normaliseOrderType(orderType) {
    const t = String(orderType || '').toLowerCase().replace(/[\s_]/g, '-');
    if (t === 'dinein' || t === 'dine-in') return 'dine-in';
    if (t === 'takeaway' || t === 'take-away' || t === 'pickup') return 'takeaway';
    if (t === 'delivery' || t === 'home-delivery') return 'delivery';
    if (t === 'kiosk') return 'kiosk';
    return t || 'dine-in';
}

function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Turn a taxes settings payload (Settings.taxes) into the flat shape
 * computeBill expects. Every caller was doing this inline; now they
 * don't.
 */
export function toTaxConfig(taxes) {
    if (!taxes) return { gstPct: 0, servicePct: 0, additionalCharges: [] };
    return {
        gstPct: taxes.gst?.enabled ? num(taxes.gst.value) : 0,
        servicePct: taxes.serviceCharge?.enabled ? num(taxes.serviceCharge.value) : 0,
        additionalCharges: (taxes.additionalCharges || []).filter((c) => c.enabled !== false),
    };
}

/**
 * Compute a complete bill.
 *
 * @param subtotal   Sum of line totals, pre-tax.
 * @param taxConfig  { gstPct, servicePct, additionalCharges[] }
 * @param orderType  'dine-in' | 'takeaway' | 'delivery' | 'kiosk'
 * @param couponDiscount / pointsRedeemed / tipAmount / deliveryFee
 *
 * Returns every intermediate the UI renders, so a caller never
 * recomputes a line it wants to display.
 *
 * Note the ordering: taxes are levied on the gross subtotal, then
 * discounts come off the taxed figure. That matches what the server
 * does today; changing it is a pricing decision, not a refactor, so it
 * is deliberately preserved here.
 */
export function computeBill({
    subtotal = 0,
    taxConfig = {},
    orderType = 'dine-in',
    couponDiscount = 0,
    pointsRedeemed = 0,
    tipAmount = 0,
    deliveryFee = 0,
} = {}) {
    const sub = round2(num(subtotal));
    const type = normaliseOrderType(orderType);
    const gstPct = num(taxConfig.gstPct);

    // The policy this module exists to centralise. A takeaway bill
    // shows no service-charge row at all, rather than a ₹0.00 row.
    const serviceApplies = SERVICE_CHARGE_TYPES.has(type);
    const servicePct = serviceApplies ? num(taxConfig.servicePct) : 0;

    const gst = round2(sub * (gstPct / 100));
    const serviceCharge = round2(sub * (servicePct / 100));

    // An empty cart attracts no flat charges — otherwise a packaging
    // fee appears on a ₹0 bill.
    const additionalCharges = sub <= 0 ? [] : (taxConfig.additionalCharges || [])
        .map((c) => ({
            name: c.name,
            type: c.type,
            value: num(c.value),
            amount: c.type === 'Percentage' ? round2(sub * (num(c.value) / 100)) : round2(num(c.value)),
        }))
        .filter((c) => c.amount > 0);

    const additionalChargesTotal = round2(
        additionalCharges.reduce((s, c) => s + c.amount, 0),
    );

    const total = round2(
        sub + gst + serviceCharge + additionalChargesTotal
        - num(couponDiscount) - num(pointsRedeemed)
        + num(tipAmount) + num(deliveryFee),
    );

    return {
        subtotal: sub,
        gst,
        gstPct,
        serviceCharge,
        serviceChargePct: servicePct,
        serviceChargeApplies: serviceApplies,
        additionalCharges,
        additionalChargesTotal,
        couponDiscount: round2(num(couponDiscount)),
        pointsRedeemed: round2(num(pointsRedeemed)),
        tipAmount: round2(num(tipAmount)),
        deliveryFee: round2(num(deliveryFee)),
        // Never let a bill go negative — an over-large coupon or points
        // balance should zero the bill, not hand money back.
        total: total < 0 ? 0 : total,
    };
}

/** Sum cart lines into a subtotal. Mirrors the server's line math. */
export function computeSubtotal(items = []) {
    return round2(
        (items || []).reduce((sum, it) => {
            const unit = num(it?.unitPrice ?? it?.price);
            const qty = num(it?.quantity) || 1;
            return sum + unit * qty;
        }, 0),
    );
}

/**
 * The bill of an order that has ALREADY been placed.
 *
 * The server stamps the breakdown it charged onto the order at creation
 * (Order.gst / gstPercentage / serviceCharge / serviceChargePercentage /
 * additionalCharges / additionalChargesTotal) and `order.total` is what
 * the customer owes. Screens that show a placed order must display
 * those stored figures — re-deriving them from the *current* settings
 * is how editing the GST rate used to rewrite historical bills.
 *
 * The stored breakdown is used only when it reconciles with the stored
 * total (subtotal + charges − discounts + tip + delivery ≈ total) and
 * no items were appended after placement (the append endpoint adds the
 * bare item price to `total` without re-stamping the tax breakdown, so
 * the stamp no longer describes the bill). Legacy orders that predate
 * the breakdown fields carry none. In those cases the breakdown is
 * recomputed through computeBill with `fallbackTaxConfig`, so even the
 * fallback uses the server's rounding and service-charge rule.
 *
 * Returns the computeBill shape plus:
 *   fromServer    — true when the breakdown shown is the server's
 *   storedTotal   — order.total (null when the order carries none)
 *   computedTotal — the total the breakdown shown sums to
 *   total         — storedTotal when present, else computedTotal
 *   manualDiscount — staff discount, NOT included in any total above
 *
 * @param order              Order doc (or a formatted copy carrying the same fields)
 * @param fallbackTaxConfig  toTaxConfig() output, used only when the stored breakdown can't be
 * @param items              Optional line list to price instead of order.items
 */
/** Items appended after placement carry a later `addedAt` (see the
 *  server's appendItems); a minute of grace absorbs creation jitter. */
const APPENDED_GRACE_MS = 60 * 1000;
function hasAppendedItems(items) {
    const times = (items || [])
        .map((i) => (i?.addedAt ? new Date(i.addedAt).getTime() : NaN))
        .filter(Number.isFinite);
    if (times.length < 2) return false;
    return Math.max(...times) - Math.min(...times) > APPENDED_GRACE_MS;
}

export function billFromOrder(order, fallbackTaxConfig = null, items = null) {
    const o = order || {};
    const subtotal = computeSubtotal(items || o.items || []);
    // order.total excludes the staff manual discount (the server takes
    // it off separately at settlement), so it is reported, not applied.
    const couponDiscount = num(o.couponDiscount);
    const manualDiscount = round2(num(o.manualDiscount));
    const adjustments = {
        couponDiscount,
        pointsRedeemed: o.pointsRedeemed,
        tipAmount: o.tipAmount,
        // Delivery orders keep the slab fee under order.delivery.fee.
        deliveryFee: o.deliveryFee ?? o.delivery?.fee,
    };

    const rawStoredTotal = o.total ?? o.totalPayment;
    const storedTotal = rawStoredTotal !== undefined && rawStoredTotal !== null
        && rawStoredTotal !== '' && Number.isFinite(Number(rawStoredTotal))
        ? round2(num(rawStoredTotal))
        : null;

    const storedAdditional = (Array.isArray(o.additionalCharges) ? o.additionalCharges : [])
        .map((c) => ({ name: c?.name, type: c?.type, value: num(c?.value), amount: round2(num(c?.amount)) }))
        .filter((c) => c.amount > 0);
    const storedAdditionalTotal = round2(num(o.additionalChargesTotal)
        || storedAdditional.reduce((sum, c) => sum + c.amount, 0));
    const hasStored = num(o.gst) > 0 || num(o.serviceCharge) > 0 || storedAdditionalTotal > 0
        || num(o.gstPercentage) > 0 || num(o.serviceChargePercentage) > 0;

    if (hasStored) {
        const gst = round2(num(o.gst));
        const serviceCharge = round2(num(o.serviceCharge));
        const sum = round2(
            subtotal + gst + serviceCharge + storedAdditionalTotal
            - couponDiscount - num(o.pointsRedeemed) + num(o.tipAmount) + num(adjustments.deliveryFee),
        );
        const computedTotal = sum < 0 ? 0 : sum;
        const reconciles = (storedTotal === null || Math.abs(computedTotal - storedTotal) <= 0.05)
            && !hasAppendedItems(o.items);
        if (reconciles || !fallbackTaxConfig) {
            const base = computeBill({ subtotal, ...adjustments });
            return {
                ...base,
                gst,
                gstPct: num(o.gstPercentage),
                serviceCharge,
                serviceChargePct: num(o.serviceChargePercentage),
                serviceChargeApplies: serviceCharge > 0,
                additionalCharges: storedAdditional,
                additionalChargesTotal: storedAdditionalTotal,
                manualDiscount,
                fromServer: true,
                storedTotal,
                computedTotal,
                total: storedTotal ?? computedTotal,
            };
        }
    }

    const derived = computeBill({
        subtotal,
        taxConfig: fallbackTaxConfig || {},
        // Same type mapping the server used when it priced the order.
        orderType: o.delivery?.requested ? 'delivery' : (o.type || o.orderType),
        ...adjustments,
    });
    return {
        ...derived,
        manualDiscount,
        fromServer: false,
        storedTotal,
        computedTotal: derived.total,
        total: storedTotal ?? derived.total,
    };
}
