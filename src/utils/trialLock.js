// Free-trial helpers shared by the banner, the route guard and the lock screen.
// The server decides (user.tenant.* comes from /auth/me and login); this only
// reads it. See Backend/utils/trialLock.js.

/** Only the owner (admin role) is ever trial-locked or shown trial UI. */
export const isTrialOwner = (user) => user?.role === 'admin';

/** Owner of a tenant whose free trial ended unpaid. */
export const isTrialLocked = (user) => isTrialOwner(user) && user?.tenant?.trialExpired === true;

/** Paths an owner may still open while locked (billing + the lock screen). */
export const TRIAL_LOCK_ALLOWED_PATHS = ['/admin/subscription', '/trial-expired'];

export const isTrialAllowedPath = (pathname = '') =>
    TRIAL_LOCK_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Banner model for an owner currently on a trial, or null when it should not
 * show (not owner, not on trial, already paid, expired).
 */
export function trialBannerState(user) {
    if (!isTrialOwner(user)) return null;
    const t = user?.tenant;
    if (!t || t.status !== 'trial' || t.trialExpired) return null;
    const days = t.daysLeft;
    if (days === null || days === undefined || Number.isNaN(Number(days))) return null;
    const n = Math.max(0, Number(days));
    const tone = n <= 1 ? 'red' : n <= 3 ? 'amber' : 'info';
    const label = n === 0 ? 'ends today' : n === 1 ? '1 day left (last day)' : `${n} days left`;
    return { days: n, tone, label, dismissible: n > 3 };
}
