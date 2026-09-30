/**
 * Customer personal data cached in this browser, and which account owns it.
 *
 * Several customer screens cache personal data in localStorage — order
 * history, ratings, cart, allergies / diet, notification preferences,
 * favorites, recent searches. None of those keys are per-account, so a
 * second customer signing in on the same browser (after the first one's
 * token expired, or straight through signup without logging out) saw the
 * first customer's data: Orders merges localStorage-only rows into the
 * server list, and HealthContext even synced the cached allergies into
 * the new account's profile.
 *
 * OWNER_KEY stamps which account the cached data belongs to.
 * claimCustomerData() runs on every customer sign-in and wipes the cache
 * whenever it belongs to anyone else.
 */

const OWNER_KEY = 'customer_data_owner';

// Account-personal keys only. Visit context — dineInTable, scanToken,
// orderType, activeTenant, selectedBranch — describes this device's
// current table / restaurant, not the account, and is left alone.
const PERSONAL_KEYS = [
    'cafe_orders_v2',
    'cancelled_orders_v1',
    'order_ratings',
    'guest_bill_paid_at',
    'cart',
    'guest_cart_reset',
    'healthPreferences',
    'pref_whatsapp',
    'pref_sms',
    'pref_push',
    'pref_voice',
    'pref_parking',
    'pref_veg',
    'pref_nonveg',
    'pref_allergy_text',
    'recent_searches',
    'customer_bookmarks',
];

// The customer cart lives in CartContext's shared map under the default
// slot; waiter table slots are staff data and stay put.
const CART_MAP_KEY = 'cart_by_table';
const CART_DEFAULT_SLOT = '_default_';

/** Fired after a wipe so providers holding the same data in memory reset it. */
export const CUSTOMER_DATA_CLEARED_EVENT = 'customer_data_cleared';

export function clearCustomerPersonalData() {
    try {
        PERSONAL_KEYS.forEach((k) => localStorage.removeItem(k));
        localStorage.removeItem(OWNER_KEY);
        const cartMap = JSON.parse(localStorage.getItem(CART_MAP_KEY) || 'null');
        if (cartMap && typeof cartMap === 'object' && cartMap[CART_DEFAULT_SLOT]) {
            delete cartMap[CART_DEFAULT_SLOT];
            localStorage.setItem(CART_MAP_KEY, JSON.stringify(cartMap));
        }
    } catch { /* storage unavailable */ }
    // 'favorites:change' re-reads useFavorites(); 'storage_sync' re-reads
    // Orders / Header / Cart, which listen for it.
    for (const name of [CUSTOMER_DATA_CLEARED_EVENT, 'favorites:change', 'storage_sync']) {
        try { window.dispatchEvent(new Event(name)); } catch { /* no window */ }
    }
}

/**
 * Bind the cached customer data to `userId`. Call on every customer
 * sign-in (password, signup, OTP) and on session restore, before the
 * account's screens mount.
 *
 * Kept when it already belongs to this account. Unstamped data is kept
 * only with `keepUnowned` — a guest on this device signing in (their
 * cart carries over) or a session restore (it's what this user was
 * already seeing). Anything else is wiped.
 */
export function claimCustomerData(userId, { keepUnowned = false } = {}) {
    if (!userId) return;
    const id = String(userId);
    let owner = null;
    try { owner = localStorage.getItem(OWNER_KEY); } catch { /* ignore */ }
    if (owner !== id && !(owner === null && keepUnowned)) {
        clearCustomerPersonalData();
    }
    try { localStorage.setItem(OWNER_KEY, id); } catch { /* ignore */ }
}
