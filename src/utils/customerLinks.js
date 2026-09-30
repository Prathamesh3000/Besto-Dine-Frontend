/**
 * Shareable customer entry links — /<restaurant-slug>[/<branch-slug>].
 *
 * Opening one shows that restaurant's public landing page
 * (Pages/Restaurant/RestaurantLandingPage.jsx), whose actions drop the
 * customer straight into that restaurant (and branch) without ever
 * showing the platform-wide restaurant list. Legacy /r/... links
 * redirect there. Super Admin and the tenant admin panel
 * hand these out as copyable links and QR posters.
 *
 * VITE_PUBLIC_APP_URL pins the host baked into links and QR codes, so a
 * link generated while browsing on localhost (or an admin-only host)
 * still points customers at the real app. Falls back to the current
 * origin when unset.
 */
export function getPublicAppOrigin() {
    const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    return configured || window.location.origin;
}

/** Full customer URL for a restaurant, optionally pinned to one branch. */
export function restaurantLink(slug, branchSlug = null) {
    if (!slug) return '';
    let path = `/${encodeURIComponent(slug)}`;
    if (branchSlug) path += `/${encodeURIComponent(branchSlug)}`;
    return `${getPublicAppOrigin()}${path}`;
}
