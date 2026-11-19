// Free-trial helpers shared by the banner, the upgrade modal, the route guard
// and the lock screen. The server decides (user.tenant.* comes from /auth/me
// and login); this only reads it. See Backend/utils/trialLock.js.
//
// tenant.trialState: 'none' | 'active' | 'read_only' | 'locked'
//   active     days 1..14          everything works
//   read_only  trialEnd..lockAt    GETs pass, writes 403 SUBSCRIPTION_READ_ONLY
//   locked     after lockAt        403 SUBSCRIPTION_BLOCKED on everything
// Older snapshots only carry trialExpired / readOnly / status; those are the
// fallbacks below so a stale cached user still resolves to the right state.

export const TRIAL_STATES = ['none', 'active', 'read_only', 'locked'];
export const TRIAL_READONLY_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Only the owner (admin role) can upgrade; they get the banner + billing CTAs. */
export const isTrialOwner = (user) => user?.role === 'admin';

/** Resolve the tenant's trial state from the auth snapshot. */
export function trialStateOf(tenant) {
    const t = tenant || {};
    if (TRIAL_STATES.includes(t.trialState)) return t.trialState;
    if (t.trialExpired === true) return 'locked';
    if (t.readOnly === true) return 'read_only';
    if (t.status === 'trial') return 'active';
    return 'none';
}

/** Date (or null) at which a read-only tenant gets fully locked. */
export function lockAtOf(tenant) {
    const t = tenant || {};
    if (t.lockAt) {
        const d = new Date(t.lockAt);
        if (!Number.isNaN(d.getTime())) return d;
    }
    if (t.trialEndDate) {
        const d = new Date(t.trialEndDate);
        if (!Number.isNaN(d.getTime())) return new Date(d.getTime() + TRIAL_READONLY_GRACE_DAYS * DAY_MS);
    }
    return null;
}

/** Any signed-in staff user of a tenant whose trial is fully locked. */
export const isTrialLocked = (user) => !!user && trialStateOf(user.tenant) === 'locked';

/** Trial ended, still inside the read-only grace window. */
export const isReadOnly = (user) => !!user && trialStateOf(user.tenant) === 'read_only';

/** Paths a locked user may still open (billing + the lock screen). */
export const TRIAL_LOCK_ALLOWED_PATHS = ['/admin/subscription', '/trial-expired'];

export const isTrialAllowedPath = (pathname = '') =>
    TRIAL_LOCK_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Banner tone from days left: blue > 7, amber <= 7, red <= 3. */
export const trialTone = (days) => (days <= 3 ? 'red' : days <= 7 ? 'amber' : 'blue');

/**
 * Banner model for an owner on a trial (active or read-only), or null when
 * the banner should not show (not owner, no trial, paid, locked).
 *   { days, tone, label, dismissible, readOnly: false }           active
 *   { tone, lockAt, label, dismissible: false, readOnly: true }   read_only
 */
export function trialBannerState(user) {
    if (!isTrialOwner(user)) return null;
    const t = user?.tenant;
    if (!t) return null;
    const state = trialStateOf(t);

    if (state === 'read_only') {
        const lockAt = lockAtOf(t);
        const msLeft = lockAt ? lockAt.getTime() - Date.now() : 0;
        const tone = msLeft <= DAY_MS ? 'red' : 'amber';
        const lockLabel = lockAt ? lockAt.toLocaleDateString() : 'soon';
        return {
            readOnly: true,
            tone,
            lockAt,
            label: `Your trial ended — read-only until ${lockLabel}. Upgrade to keep editing.`,
            dismissible: false,
        };
    }

    if (state !== 'active') return null;
    const days = t.daysLeft;
    if (days === null || days === undefined || Number.isNaN(Number(days))) return null;
    const n = Math.max(0, Number(days));
    const label = n === 0 ? 'ends today' : n === 1 ? '1 day left' : `${n} days left`;
    return { readOnly: false, days: n, tone: trialTone(n), label, dismissible: n > 7 };
}
