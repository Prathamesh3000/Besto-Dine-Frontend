/**
 * Reserved first path segments.
 *
 * Restaurant landing pages live at the root of the URL space
 * (/<restaurantSlug>[/<branchSlug>]). Every first segment the app itself
 * routes (see App.jsx) — plus a handful of common words we may want
 * later — must never be treated as a restaurant slug, otherwise a
 * restaurant named "admin" could shadow the admin panel (or be shadowed
 * by it). React Router already prefers static routes over `/:slug`, so
 * this list guards the leftovers: bare prefixes such as /customer or
 * /waiter that have no exact route of their own.
 *
 * scripts/check-route-slugs.mjs fails when App.jsx gains a route whose
 * first segment is missing here, or when this list drifts from
 * Backend/utils/reservedSlugs.js — add new segments to BOTH files.
 */

// First segments routed by App.jsx.
const APP_ROUTE_SEGMENTS = [
    'admin',
    'bill',
    'bill-preview',
    'branch-selection',
    'chef',
    'customer',
    'force-change-password',
    'health',
    'home',
    'kiosk',
    'login',
    'notifications',
    'otp',
    'privacy',
    'r',
    'register-restaurant',
    'request-demo',
    'reset-password',
    'scan',
    'search',
    'splash',
    'staff-login',
    'superadmin',
    'switch-restaurant',
    'terms',
    'unauthorized',
    'waiter',
];

// Platform / infrastructure / marketing / SEO paths (current + likely
// future). MUST stay identical to PLATFORM_SEGMENTS in
// Backend/utils/reservedSlugs.js: restaurant creation refuses exactly the
// backend list, so a word reserved only here would hide a real
// restaurant's page, and one reserved only there is merely unused.
const COMMON_RESERVED = [
    'logout', 'register', 'signup', 'signin', 'sign-in', 'sign-up',
    'captain', 'kitchen', 'legal', 'forgot-password', 'verify', 'verify-email',
    'api', 'assets', 'static', 'public', 'uploads', 'images', 'img', 'fonts', 'media',
    'blog', 'pricing', 'features', 'about', 'contact', 'demo', 'help', 'support',
    'docs', 'faq', 'careers', 'www', 'app', 'dashboard', 'settings', 'profile',
    'account', 'orders', 'menu', 'cart', 'checkout', 'payment', 'payments',
    'wallet', 'booking', 'bookings', 'book', 'restaurants', 'restaurant',
    'favicon.ico', 'robots.txt', 'sitemap.xml', 'manifest.json', 'sw.js',
    'index.html', 'healthz', 'readyz', '404', '500', 'null', 'undefined',
    'bestodine', 'staff', 'manager', 'owner', 'auth', 'oauth', 'callback',
    'webhook', 'webhooks', 'socket.io', 'status',
    // Platform signup / marketing aliases (hotel self-signup, 2026-09).
    'register-hotel', 'join', 'partners',
];

export const RESERVED_SLUGS = new Set([...APP_ROUTE_SEGMENTS, ...COMMON_RESERVED]);

/** True when `slug` is a reserved first path segment (case-insensitive). */
export function isReservedSlug(slug) {
    if (!slug || typeof slug !== 'string') return true;
    return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
