/**
 * Billing-cycle helpers for the SaaS plans. Mirrors Backend/utils/billingCycles.js
 * (same rounding) — see scripts/billing-cycles-parity.mjs and
 * __tests__/utils/billingCycles.test.js for the parity check.
 *
 * Plan prices are BASE rupees (before GST). GST is added at checkout.
 */

export const CYCLE_KEYS = ['monthly', 'annual', 'biennial'];
export const DEFAULT_CYCLE = 'monthly';
export const DEFAULT_GST_RATE = 18;
export const CYCLE_MONTHS = { monthly: 1, annual: 12, biennial: 24 };

export const CYCLE_TOGGLE_LABEL = { monthly: 'Monthly', annual: 'Annual', biennial: '2-year' };
// Suffix shown after a price: "Rs 17,999 / year".
export const CYCLE_PER = { monthly: '/month', annual: '/year', biennial: '/2 years' };
// Noun for a period: "billed every year".
export const CYCLE_TERM = { monthly: 'month', annual: 'year', biennial: '2 years' };

export const isCycle = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CYCLE_MONTHS, c);
export const normalizeCycle = (c) => (isCycle(c) ? c : DEFAULT_CYCLE);
export const monthsFor = (c) => CYCLE_MONTHS[normalizeCycle(c)];
export const cyclePer = (c) => CYCLE_PER[normalizeCycle(c)];
export const cycleLabel = (c) => CYCLE_TOGGLE_LABEL[normalizeCycle(c)];

const toPaise = (rupees) => Math.round(Number(rupees) * 100);

/** Base rupees -> { basePaise, gstPaise, totalPaise, gstRate } (backend priceWithGst). */
export function priceWithGst(basePrice, rate = DEFAULT_GST_RATE) {
    const basePaise = toPaise(basePrice);
    const totalPaise = Math.round((basePaise * (100 + rate)) / 100);
    return { basePaise, gstPaise: totalPaise - basePaise, totalPaise, gstRate: rate };
}

/** Same, in rupees: { base, gst, total, gstRate }. */
export function gstBreakdown(basePrice, rate = DEFAULT_GST_RATE) {
    const m = priceWithGst(basePrice, rate);
    return { base: m.basePaise / 100, gst: m.gstPaise / 100, total: m.totalPaise / 100, gstRate: rate };
}

/** Base price per month (2dp) of a cycle price. */
export function monthlyEquivalent(price, cycle) {
    const p = Number(price);
    if (!Number.isFinite(p)) return 0;
    return Math.round((p / monthsFor(cycle)) * 100) / 100;
}

/** Percent saved vs paying the monthly list price for the same months. */
export function savingsPct(price, cycle, monthlyPrice) {
    const m = Number(monthlyPrice);
    if (!(m > 0) || !(Number(price) > 0)) return 0;
    const pct = (1 - monthlyEquivalent(price, cycle) / m) * 100;
    return Math.max(0, Math.round(pct));
}

/**
 * Cycle price rows for a plan (public-plans / billing-plans shape). Uses the
 * server's `cycles` rows when present; otherwise derives them from `prices`,
 * and finally from the legacy `price` (monthly) so old payloads still render.
 */
export function planCycleRows(plan, rate) {
    if (!plan) return [];
    const gst = Number.isFinite(Number(rate)) ? Number(rate) : (Number.isFinite(Number(plan.gstRate)) ? Number(plan.gstRate) : DEFAULT_GST_RATE);
    if (Array.isArray(plan.cycles) && plan.cycles.length) {
        return plan.cycles.filter(r => isCycle(r?.cycle) && Number(r.price) > 0);
    }
    const prices = { ...(plan.prices || {}) };
    const anyExplicit = CYCLE_KEYS.some(k => Number(prices[k]) > 0);
    if (!anyExplicit && Number(plan.price) > 0) {
        if (plan.billingCycle === 'yearly') prices.annual = plan.price;
        else prices.monthly = plan.price;
    }
    const monthly = Number(prices.monthly) > 0 ? Number(prices.monthly) : null;
    const rows = [];
    for (const cycle of CYCLE_KEYS) {
        const base = Number(prices[cycle]);
        if (!(base > 0)) continue;
        const g = gstBreakdown(base, gst);
        rows.push({
            cycle,
            months: CYCLE_MONTHS[cycle],
            price: base,
            gst: g.gst,
            total: g.total,
            perMonthEquivalent: monthlyEquivalent(base, cycle),
            savingsPctVsMonthly: cycle === 'monthly' ? 0 : savingsPct(base, cycle, monthly),
        });
    }
    return rows;
}

/** The row for `cycle`, or null. */
export const rowForCycle = (plan, cycle, rate) =>
    planCycleRows(plan, rate).find(r => r.cycle === cycle) || null;

/** Cycles that at least one of the plans sells, in monthly -> biennial order. */
export function availableCyclesAcross(plans) {
    const set = new Set();
    for (const p of plans || []) for (const r of planCycleRows(p)) set.add(r.cycle);
    return CYCLE_KEYS.filter(c => set.has(c));
}

/** Largest savings % for a cycle across plans (for the toggle badge), 0 when none. */
export function maxSavingsFor(plans, cycle) {
    let best = 0;
    for (const p of plans || []) {
        const r = rowForCycle(p, cycle);
        if (r && r.savingsPctVsMonthly > best) best = r.savingsPctVsMonthly;
    }
    return best;
}

/** Rupee amount -> "Rs 17,999" style with the rupee sign ("₹17,999"); keeps paise only when present. */
export function formatINR(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const hasPaise = Math.round(n * 100) % 100 !== 0;
    return `₹${n.toLocaleString('en-IN', {
        minimumFractionDigits: hasPaise ? 2 : 0,
        maximumFractionDigits: 2,
    })}`;
}

/**
 * Price of a subscription snapshot as a MONTHLY MRR-equivalent (rupees).
 * `subscription.price` is the base amount per billingCycle.
 */
export function mrrEquivalent(price, cycle) {
    return monthlyEquivalent(price, cycle);
}

/**
 * Cross-cycle validation for the Super Admin plan form. Inputs are base prices
 * (numbers, null/'' = unavailable). Returns { annual?, biennial?, monthly? }
 * messages: annual < 12 x monthly, biennial < 2 x annual.
 */
export function validateCyclePrices({ monthly, annual, biennial }) {
    const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
    const m = num(monthly), a = num(annual), b = num(biennial);
    const errs = {};
    for (const [k, v] of [['monthly', m], ['annual', a], ['biennial', b]]) {
        if (v !== null && (!Number.isFinite(v) || v < 0)) errs[k] = 'Must be zero or greater';
    }
    if (!errs.annual && a > 0 && m > 0 && !(a < 12 * m)) {
        errs.annual = `Annual must be less than 12 x monthly (${formatINR(12 * m)})`;
    }
    if (!errs.biennial && b > 0 && a > 0 && !(b < 2 * a)) {
        errs.biennial = `2-year must be less than 2 x annual (${formatINR(2 * a)})`;
    }
    if (!errs.biennial && b > 0 && !(a > 0) && m > 0 && !(b < 24 * m)) {
        errs.biennial = `2-year must be less than 24 x monthly (${formatINR(24 * m)})`;
    }
    return errs;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Trial countdown. Progress is measured over the tenant's real trial window
 * (trialStartDate -> trialEndDate; falls back to subscription.startDate when
 * the API does not send trialStartDate). No start date = no progress shown.
 */
export function trialInfo(trialEndDate, trialStartDate, now = new Date()) {
    if (!trialEndDate) return null;
    const end = new Date(trialEndDate);
    const diffMs = end - now;
    if (diffMs <= 0) return { daysLeft: 0, pct: 100, expired: true };
    const daysLeft = Math.ceil(diffMs / DAY_MS);
    const start = trialStartDate ? new Date(trialStartDate) : null;
    const totalMs = start && !Number.isNaN(start.getTime()) ? end - start : 0;
    const pct = totalMs > 0
        ? Math.min(100, Math.max(0, ((now - start) / totalMs) * 100))
        : 0;
    return { daysLeft, pct, expired: false };
}

// Suffix for a plan/subscription cycle, tolerating the legacy plan labels
// ('yearly', 'quarterly') the older Super Admin payloads still carry.
const SUFFIX = { monthly: '/ month', annual: '/ year', biennial: '/ 2 years', yearly: '/ year', quarterly: '/ quarter' };
const NOUN = { monthly: 'month', annual: 'year', biennial: '2 years', yearly: 'year', quarterly: 'quarter' };
export const cycleSuffix = (cycle) => SUFFIX[cycle] || SUFFIX.monthly;
export const cycleNoun = (cycle) => NOUN[cycle] || NOUN.monthly;

/** "₹17,999 / year" for a base price and cycle. */
export const formatCyclePrice = (price, cycle) => `${formatINR(price)} ${cycleSuffix(cycle)}`;

/**
 * Super Admin price label for a tenant: the agreed per-cycle base price, plus
 * the MRR-equivalent for prepaid cycles, e.g. "₹17,999 / year (₹1,499.92/mo MRR)".
 * `price` falls back to the plan's monthly list price when the tenant has no snapshot.
 */
export function formatTenantPrice(price, cycle) {
    const p = Number(price);
    if (!(p > 0)) return 'Free';
    const c = normalizeCycle(cycle);
    const base = formatCyclePrice(p, c);
    return c === 'monthly' ? base : `${base} (${formatINR(mrrEquivalent(p, c))}/mo MRR)`;
}
