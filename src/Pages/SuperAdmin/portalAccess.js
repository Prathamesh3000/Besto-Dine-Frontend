// Single definition of "who may open which super-admin page", shared by the
// layout sidebar, the /superadmin route guards and the post-login redirect.
//
//   - role 'superadmin'   : level 'full' = everything, anything else (support) = read everything
//   - role 'platformstaff': only the modules in user.platformAccess ({ key: 'view' | 'manage' })
//   - anyone else         : nothing

export const SUPERADMIN_HOME = '/superadmin/dashboard';

// Sidebar order matters: firstAllowedPath() walks this list.
// `module` may be a string or an array (visible when ANY is viewable);
// `fullOnly` items are never delegated to platform staff (any real super admin,
// full or support, may open them); `fullLevel` items (Team) are for the
// owner-level `full` super admin only.
export const PORTAL_NAV = [
    { key: 'dashboard',        to: '/superadmin/dashboard',         module: 'dashboard' },
    { key: 'restaurants',      to: '/superadmin/restaurants',       module: 'trials' },
    { key: 'pending-approvals', to: '/superadmin/pending-approvals', fullOnly: true },
    { key: 'leads',            to: '/superadmin/leads',             module: ['signupLeads', 'leads'] },
    { key: 'marketing',        to: '/superadmin/marketing',         module: 'marketing' },
    { key: 'blog',             to: '/superadmin/blog',              module: 'blog' },
    { key: 'plans',            to: '/superadmin/plans',             module: 'plans' },
    { key: 'payments',         to: '/superadmin/payments',          module: 'payments' },
    { key: 'audit-logs',       to: '/superadmin/audit-logs',        fullOnly: true },
    { key: 'security',         to: '/superadmin/security',          fullOnly: true },
    { key: 'team',             to: '/superadmin/team',              fullLevel: true },
];

const isFull = (u) => u?.role === 'superadmin' && u?.superadminLevel === 'full';

export function canViewModule(user, key) {
    if (!user || !key) return false;
    if (user.role === 'superadmin') return true;
    if (user.role === 'platformstaff') {
        const lvl = user.platformAccess?.[key];
        return lvl === 'view' || lvl === 'manage';
    }
    return false;
}

export function canManageModule(user, key) {
    if (!user || !key) return false;
    if (isFull(user)) return true;
    if (user.role === 'platformstaff') return user.platformAccess?.[key] === 'manage';
    return false;
}

/** May this user open a page guarded by { module | anyOf | fullOnly }? */
export function canOpen(user, { module, anyOf, fullOnly, fullLevel } = {}) {
    if (fullLevel) return isFull(user);
    if (fullOnly) return user?.role === 'superadmin';
    const keys = anyOf || (module ? [module] : []);
    if (!keys.length) return !!user && (user.role === 'superadmin' || user.role === 'platformstaff');
    return keys.some((k) => canViewModule(user, k));
}

/** Does a PORTAL_NAV entry show for this user? */
export function canSeeNavItem(user, item) {
    return canOpen(user, { module: typeof item.module === 'string' ? item.module : undefined,
        anyOf: Array.isArray(item.module) ? item.module : undefined, fullOnly: item.fullOnly, fullLevel: item.fullLevel });
}

/** First sidebar page the user may open, or null when they have none. */
export function firstAllowedPath(user) {
    const hit = PORTAL_NAV.find((item) => canSeeNavItem(user, item));
    return hit ? hit.to : null;
}

/** Where to send a freshly signed-in portal user. Super admins keep the Overview. */
export function portalHomePath(user) {
    if (user?.role === 'superadmin') return SUPERADMIN_HOME;
    return firstAllowedPath(user) || SUPERADMIN_HOME;
}
