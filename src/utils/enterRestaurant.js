/**
 * "Enter this restaurant (and branch), then go to X" — shared by the
 * customer branch picker (Pages/BranchSelection.jsx) and the public
 * restaurant landing page (Pages/Restaurant/RestaurantLandingPage.jsx).
 *
 * Entering = persisting the active tenant (+ optional branch) so every
 * later customer API call carries X-Restaurant-Slug / X-Branch-Id, and
 * wiping tenant-bound session state when the visitor moves to a
 * DIFFERENT restaurant. Where to go afterwards is the caller's call;
 * landingActionTarget() below maps the landing page's buttons onto the
 * same entry points the customer app already uses.
 */
import { setActiveTenant, getActiveTenant } from './tenant';
import { clearDineInLock } from './dineInSession';

/**
 * Tenant-bound session state that must not survive a move to a
 * different restaurant. The live cart (CartContext's `cart_by_table`)
 * is namespaced per tenant, so it needs no sweep here; only the legacy
 * flat `cart` key is dropped — carrying it across would smuggle tenant
 * A's menuItem IDs into a tenant B order.
 *
 * Deliberately does NOT touch `user` / `token` / `isGuest`: a customer
 * identity is global across tenants, so switching restaurants must not
 * sign anyone out. Compare ScanTable's clearStaleSession(), which DOES
 * clear those — a QR scan starts a brand-new session, this doesn't.
 */
export function clearTenantBoundSession() {
    localStorage.removeItem('cart');
    localStorage.removeItem('guest_cart_reset');
    localStorage.removeItem('selectedBranch');
    localStorage.removeItem('cafe_orders_v2');
    localStorage.removeItem('cancelled_orders_v1');
    localStorage.removeItem('order_ratings');
    localStorage.removeItem('guest_bill_paid_at');
    // The scanToken proves a session at *that* tenant's table — it is
    // meaningless at the new one, and leaving it set would attach a stale
    // X-Scan-Token to the next order.
    localStorage.removeItem('scanToken');
    clearDineInLock();
}

/**
 * Persist `restaurant` (+ optional `branch`) as the active tenant.
 *
 * `previousTenant` is the tenant blob held BEFORE this entry (defaults
 * to the current one). Moving to a different tenant invalidates
 * everything scoped to the old one; same-tenant re-picks (switching
 * branch only) keep the cart — the menu is shared tenant-wide, so those
 * items still resolve. MenuContext namespaces its caches by slug and so
 * self-invalidates; only the localStorage blobs need a sweep.
 *
 * restaurant: { slug, name, _id, features?, city?, phone? }
 * branch:     { _id, name, slug, addressLine1?, addressLine2?, city?, contactPhone? } | null
 */
export function enterRestaurant(restaurant, branch = null, previousTenant = getActiveTenant()) {
    if (!restaurant?.slug) throw new Error('enterRestaurant requires a restaurant with a slug');

    if (previousTenant?.slug && previousTenant.slug !== String(restaurant.slug).toLowerCase()) {
        clearTenantBoundSession();
    }

    const tenant = setActiveTenant({
        slug: restaurant.slug,
        name: restaurant.name,
        _id: restaurant._id,
        features: restaurant.features || {},
        branch: branch || null,
    });

    localStorage.setItem('selectedBranch', JSON.stringify({
        id: branch?._id || restaurant._id,
        name: branch?.name || restaurant.name,
        addressLine1: branch?.addressLine1 || branch?.city || restaurant.city || '',
        addressLine2: branch?.addressLine2 || '',
        hours: '',
        phone: branch?.contactPhone || restaurant.phone || '',
    }));
    // Same-window listeners (Header, Cart) re-read on this event
    try { window.dispatchEvent(new Event('storage_sync')); } catch { /* ignore */ }
    return tenant;
}

/**
 * Pick the branch to enter from a tenant's branch list, mirroring the
 * branch picker's rules: a matching preferred slug wins; 0–1 branches
 * need no choice (returns { branch: list[0] || null }); otherwise the
 * caller must ask ({ needsPick: true }).
 */
export function resolveBranchChoice(list = [], preferredSlug = null) {
    const preferred = preferredSlug
        ? list.find(b => b.slug === String(preferredSlug).toLowerCase())
        : null;
    if (preferred) return { branch: preferred, needsPick: false };
    if (list.length <= 1) return { branch: list[0] || null, needsPick: false };
    return { branch: null, needsPick: true };
}

/** Drop any table binding — the landing-page actions are off-table flows. */
function leaveTable() {
    localStorage.removeItem('dineInTable');
    localStorage.removeItem('tableNumber');
    localStorage.removeItem('fromQrScan');
}

/**
 * Where a landing-page action should send the visitor once the
 * restaurant has been entered, as `{ to, state? }` for navigate().
 * Mirrors the retired tenant home page's CTAs (goTakeaway / goTable) and BranchSelection's default hand-off:
 *
 *  - 'menu'     → /home (→ /customer/home). Order mode untouched, so a
 *                 diner already bound to a table keeps dine-in; anyone
 *                 unauthenticated is sent to /login by ProtectedRoute,
 *                 which defaults them into takeaway browsing.
 *  - 'item'     → /customer/item/:id, same rules as 'menu'.
 *  - 'takeaway' → takeaway mode, then the menu. Customers and guests go
 *                 straight in; everyone else via /login with `next`.
 *  - 'booking'  → /customer/booking-type (login required — the route is
 *                 a plain ProtectedRoute), via /login with `next` when
 *                 not signed in as a customer.
 *
 * `auth` = { isLoggedIn, isGuest, role }.
 */
export function landingActionTarget(action, auth = {}, { itemId } = {}) {
    const isCustomer = Boolean(auth.isLoggedIn) && auth.role === 'customer';
    switch (action) {
        case 'takeaway': {
            localStorage.setItem('orderType', 'takeaway');
            leaveTable();
            if (isCustomer || auth.isGuest) return { to: '/customer/home' };
            return { to: '/login', state: { from: 'takeaway', next: '/customer/home' } };
        }
        case 'booking': {
            localStorage.setItem('orderType', 'dine-in');
            leaveTable();
            const nextState = { bookingType: 'table' };
            if (isCustomer) return { to: '/customer/booking-type', state: nextState };
            return { to: '/login', state: { from: 'advance-booking', next: '/customer/booking-type', nextState } };
        }
        case 'item':
            return { to: itemId ? `/customer/item/${encodeURIComponent(itemId)}` : '/home' };
        case 'menu':
        default:
            return { to: '/home' };
    }
}
