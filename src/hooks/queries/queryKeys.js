/**
 * Centralised React Query keys for the admin side.
 *
 * Why centralise: invalidating "all admin tables data" from a mutation
 * elsewhere (or a socket handler) needs a stable key. Hardcoding
 * `['admin', 'tables']` inline in 10 files makes it impossible to
 * grep-and-rename later.
 *
 * Convention:
 *   adminKeys.tables(filters?)    → leaf — exact tables-list query
 *   adminKeys.all                 → root — invalidate every admin query
 *
 * Branch scoping (#29): every leaf key ends with the admin's active
 * branch id, read at access time from the same `adminActiveBranch`
 * localStorage slot the api.js interceptor uses to add `?branch=`.
 * Switching branch therefore lands on a different cache entry instead
 * of briefly painting the previous branch's data. Leaves are getters so
 * callers keep writing `adminKeys.tables` / `adminKeys.orders.live`
 * unchanged, and the branch goes LAST so existing prefix invalidations
 * (`['admin']`, `['admin', 'orders']`, `['admin', 'tables']`) still match.
 * The same trailing object also carries the tenant (see adminScope).
 */
export function getAdminBranchKey() {
    try {
        const raw = localStorage.getItem('adminActiveBranch');
        if (!raw) return 'all';
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'string') return parsed || 'all';
            return parsed?._id ? String(parsed._id) : 'all';
        } catch {
            return raw; // legacy plain-string value
        }
    } catch {
        return 'all';
    }
}

/**
 * The tenant (restaurant) the admin cache belongs to: the signed-in
 * staff user's tenant, else the active tenant blob (Login.jsx sets it
 * for staff too). Read from storage at access time like the branch, so
 * a tenant switch on the same tab — admin of A logs out, admin of B
 * logs in — can never be served A's cache. null when unknown (the key
 * then omits it).
 */
export function getAdminTenantKey() {
    const read = (key) => {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
    };
    const staffTenant = read('staff_user')?.tenant;
    const fromStaff = staffTenant && (staffTenant._id || staffTenant.slug);
    if (fromStaff) return String(fromStaff);
    const active = read('activeTenant');
    return active?.slug ? String(active.slug) : null;
}

/** Trailing scope part of every admin key: branch, plus tenant when known. */
export function adminScope() {
    const tenant = getAdminTenantKey();
    return tenant ? { branch: getAdminBranchKey(), tenant } : { branch: getAdminBranchKey() };
}

/** Append `{ tenant }` to an ad-hoc admin key when the tenant is known. */
export function withAdminTenant(key) {
    const tenant = getAdminTenantKey();
    return tenant ? [...key, { tenant }] : key;
}

const k = (...parts) => ['admin', ...parts, adminScope()];

export const adminKeys = {
    all:           ['admin'],
    get bootstrap()    { return k('bootstrap'); },
    get tables()       { return k('tables'); },
    get areas()        { return k('areas'); },
    get reservations() { return k('reservations'); },
    get staff()        { return k('staff'); },
    get settings()     { return k('settings'); },
    orders: {
        get live()    { return k('orders', 'live'); },
        get past()    { return k('orders', 'past'); },
        get kitchen() { return k('orders', 'kitchen'); },
        refunds: (params = {}) => k('orders', 'refunds', params),
    },
    inventory: {
        list:    (params = {}) => k('inventory', 'list', params),
        get summary() { return k('inventory', 'summary'); },
        get alerts()  { return k('inventory', 'alerts'); },
    },
    get payments()   { return k('payments'); },
    get crm()        { return k('crm'); },
    get bookings()   { return k('bookings'); },
    get menu()       { return k('menu'); },
    get categories() { return k('categories'); },
};
