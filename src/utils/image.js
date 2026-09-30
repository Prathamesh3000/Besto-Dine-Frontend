// Unified image utilities — single source of truth for fallbacks and error handling

const BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/api.*$/, '') || '';

/**
 * Append CDN resize/quality params to known image-host URLs so a
 * 4000×3000 photo doesn't get sent to render at 77×77. Massive
 * bandwidth win on mobile.
 *
 * Currently supports:
 *   - images.unsplash.com  → `?auto=format&fit=crop&w=<w>&q=<q>`
 *   - res.cloudinary.com   → inserts `/c_fill,w_<w>,q_<q>,f_auto/` after `/upload/`
 *
 * Unknown hosts pass through untouched. Pass `w` in CSS pixels at the
 * card's max layout size; the helper bumps DPR internally for retina.
 */
export function sizedImage(url, { w = 400, q = 75 } = {}) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed) return url;

  // Bump for retina — most modern phones are DPR 2-3. 1.5× is a
  // safe middle ground; sharp enough for retina without wasting
  // bandwidth on truly absurd DPR-3 panels.
  const targetW = Math.round(w * 1.5);

  // Unsplash hot path.
  if (/^https?:\/\/images\.unsplash\.com\//.test(trimmed)) {
    // Strip any existing size params so we don't double-stack them.
    const noQuery = trimmed.split('?')[0];
    return `${noQuery}?auto=format&fit=crop&w=${targetW}&q=${q}`;
  }

  // Cloudinary — inject transforms after `/upload/`.
  if (/^https?:\/\/res\.cloudinary\.com\//.test(trimmed) && !/\/upload\/[a-z]_/.test(trimmed)) {
    return trimmed.replace('/upload/', `/upload/c_fill,w_${targetW},q_${q},f_auto/`);
  }

  return trimmed;
}

/**
 * Strip a baked-in WHITE background from a brand/tenant logo so it sits cleanly
 * on a coloured navbar instead of showing an ugly white tile.
 *
 * Cloudinary-hosted logos get an on-the-fly `e_make_transparent` rewrite that
 * turns the near-white background pixels transparent WITHOUT trimming/cropping
 * the artwork (an earlier version added `e_trim` + `c_fit` which over-cropped
 * some logos and made them look wrong). Already-transformed Cloudinary URLs and
 * every other host (e.g. self-hosted `/uploads/...`) pass through untouched —
 * those still need a transparent PNG re-upload to look right.
 *
 * Apply AFTER resolveImageUrl: transparentLogo(resolveImageUrl(logoUrl)).
 */
export function transparentLogo(url, { tolerance = 15 } = {}) {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!/^https?:\/\/res\.cloudinary\.com\//.test(trimmed) || !trimmed.includes('/upload/')) return trimmed;
  if (/\/upload\/[a-z]_/.test(trimmed)) return trimmed; // already has transforms — leave it
  return trimmed.replace('/upload/', `/upload/e_make_transparent:${tolerance}/f_auto,q_auto/`);
}

export const FALLBACK_IMAGE = `${BASE_URL}/uploads/Thumbnil.png`;

// Stock imagery for the two VIRTUAL category cards — "All" and "Combo" —
// that aren't real DB categories and so have no admin-uploaded image.
// Without these they fell back to the grey Thumbnil placeholder. Stable
// Unsplash URLs; sizedImage() adds the resize/quality params at render.
export const ALL_CATEGORY_IMAGE = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836';
export const COMBO_CATEGORY_IMAGE = 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8';

/**
 * Resolve any backend-stored image value to a fully-qualified URL the
 * browser can render. Handles three shapes:
 *
 *   - `'/uploads/foo.jpg'`              → `${BACKEND}/uploads/foo.jpg`
 *   - `'http://...' / 'https://...'`    → returned unchanged (passes through
 *                                         external URLs like ui-avatars.com,
 *                                         CDN-hosted assets, social provider
 *                                         avatars, and legacy full-URL rows
 *                                         not yet backfilled)
 *   - empty / null / undefined          → returns null so the caller can
 *                                         render initials, an icon, or
 *                                         hide the <img> entirely
 *
 * The backend now persists `/uploads/...` (host-independent), so the
 * relative-path branch is the hot path. This helper is the single
 * source of truth — replace ad-hoc `BACKEND_URL + url` snippets with
 * `resolveImageUrl(url)`.
 */
export function resolveImageUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let trimmed = url.trim();
    if (!trimmed) return null;

    // Defensive URL repair for two known corruption patterns observed
    // in production data + dev console:
    //
    // 1) "double-scheme prefix" — `https://backendhttps//cdn.com/foo.jpg`
    //    happens when something concatenated BACKEND + raw URL and the
    //    raw URL had its colon stripped earlier. The real image URL
    //    starts at the second `http`, so cut everything before it.
    //
    // 2) "colon-stripped scheme" — `https//res.cloudinary.com/foo.jpg`
    //    a colon went missing somewhere upstream. Patch it back.
    //
    // Both repairs are cheap regex + no-op for clean URLs, so the
    // hot path stays unaffected.
    const doubleSchemeMatch = trimmed.match(/^https?:\/\/[^/]+(https?[/:].+)$/i);
    if (doubleSchemeMatch) trimmed = doubleSchemeMatch[1];
    trimmed = trimmed.replace(/^(https?)\/\//i, '$1://');

    if (trimmed.startsWith('/uploads/')) return `${BASE_URL}${trimmed}`;
    return trimmed;
}

/**
 * Get the best image source from a menu item object.
 * Handles: images array, single image string, and fallback.
 */
export function getItemImage(item) {
    if (!item) return FALLBACK_IMAGE;
    const raw = (item.images && item.images.length > 0) ? item.images[0] : item.image;
    return resolveImageUrl(raw) || FALLBACK_IMAGE;
}

/**
 * onError handler for <img> tags — prevents infinite loops and sets fallback.
 * Usage: <img onError={handleImageError} ... />
 */
export function handleImageError(e) {
    e.target.onerror = null; // prevent infinite loop
    e.target.src = FALLBACK_IMAGE;
}
