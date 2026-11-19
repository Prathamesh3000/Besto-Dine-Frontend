/**
 * CTA routing for a subscription plan card — the ONE helper used by the
 * landing pricing section, the register plan picker and any other plan card
 * (TRIAL_SIGNUP_AND_LEADS_PLAN.md §3).
 *
 * Order matters:
 *   1. tier >= 30 (enterprise)     → "Contact Sales"     → /contact
 *   2. plan offers a free trial    → "Start Free Trial"  → /start-trial
 *   3. free plan                   → "Get Started"       → /register-restaurant?plan=<slug>
 *   4. paid plan                   → "Get Started"       → /register-restaurant?plan=<slug>
 *
 * The trial check runs BEFORE the free check so a free plan that also offers
 * a trial still goes through the trial funnel. `/start-trial` deliberately
 * carries no plan / price / length — the server decides those (§4).
 *
 * Payload tolerance: new plans carry `tier` (Number, 0 is valid) and
 * `trial { enabled, durationDays }`; older payloads only `trialDays`. A
 * missing tier is treated as 0, but a real 0 is never mistaken for missing.
 */

export const ENTERPRISE_TIER = 30;

const num = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** Numeric tier rank of a plan; missing / invalid → 0. */
export function planTier(plan) {
    return num(plan?.tier) ?? 0;
}

export const isEnterprisePlan = (plan) => planTier(plan) >= ENTERPRISE_TIER;

const hasTrialObject = (plan) => plan?.trial !== null && typeof plan?.trial === 'object';

/**
 * Trial length in days to display: `trial.enabled ? trial.durationDays : 0`
 * when the plan carries a `trial` object, else the legacy `trialDays`.
 */
export function trialDaysOf(plan) {
    if (hasTrialObject(plan)) {
        return plan.trial.enabled ? Math.max(0, num(plan.trial.durationDays) ?? 0) : 0;
    }
    return Math.max(0, num(plan?.trialDays) ?? 0);
}

/** True when the plan offers a free trial (trial.enabled, else trialDays > 0). */
export function hasTrial(plan) {
    if (hasTrialObject(plan)) return plan.trial.enabled === true;
    return trialDaysOf(plan) > 0;
}

/**
 * Free plan: every cycle price (`prices.monthly` / `prices.annual` /
 * `prices.biennial`) is 0 or null, `price` is 0, and the plan is not an
 * enterprise tier (a ₹0 enterprise plan is "custom / quoted", not free).
 */
export function isFreePlan(plan) {
    if (!plan || isEnterprisePlan(plan)) return false;
    const prices = plan.prices || {};
    const cyclesFree = ['monthly', 'annual', 'biennial'].every((k) => !((num(prices[k]) ?? 0) > 0));
    return cyclesFree && !((num(plan.price) ?? 0) > 0);
}

export const CTA_KIND = Object.freeze({ CONTACT: 'contact', TRIAL: 'trial', FREE: 'free', PAID: 'paid' });

const registerPath = (plan) => {
    const ref = plan?.slug || plan?._id;
    return ref ? `/register-restaurant?plan=${encodeURIComponent(ref)}` : '/register-restaurant';
};

/**
 * CTA for a plan card. `cycle` is accepted for call-site symmetry with the
 * price formatter; the routing is plan-level (free is free in every cycle).
 *
 * @returns {{ label: string, labelKey: string, to: string, kind: 'contact'|'trial'|'free'|'paid' }}
 */
// eslint-disable-next-line no-unused-vars
export function getCTA(plan, cycle) {
    if (isEnterprisePlan(plan)) {
        return { label: 'Contact Sales', labelKey: 'platform.cta.contact_sales', to: '/contact', kind: CTA_KIND.CONTACT };
    }
    if (hasTrial(plan)) {
        return { label: 'Start Free Trial', labelKey: 'platform.cta.trial_short', to: '/start-trial', kind: CTA_KIND.TRIAL };
    }
    if (isFreePlan(plan)) {
        return { label: 'Get Started', labelKey: 'platform.cta.get_started', to: registerPath(plan), kind: CTA_KIND.FREE };
    }
    return { label: 'Get Started', labelKey: 'platform.cta.get_started', to: registerPath(plan), kind: CTA_KIND.PAID };
}

export default getCTA;
