/**
 * geo — browser-side location helpers for the takeaway home-delivery
 * checkout. Uses OpenStreetMap Nominatim (free, no API key). Every helper
 * resolves to null on failure instead of throwing, so the checkout can
 * fall back to the server-side geocoder / the manual distance picker.
 *
 * The delivery FEE is never computed here — the server measures the
 * distance (POST /orders/delivery-quote, and again at order create).
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const TIMEOUT_MS = 6000;

async function nominatimFetch(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${NOMINATIM}${path}`, {
            signal: ctrl.signal,
            headers: { 'Accept-Language': 'en' },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** Free-text address → { lat, lng } | null */
export async function geocodeAddress(address) {
    const q = String(address || '').trim();
    if (q.length < 5) return null;
    const rows = await nominatimFetch(`/search?format=json&limit=1&q=${encodeURIComponent(q.slice(0, 300))}`);
    if (!Array.isArray(rows) || !rows[0]) return null;
    const lat = Number(rows[0].lat);
    const lng = Number(rows[0].lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** { lat, lng } → human-readable address | null */
export async function reverseGeocode({ lat, lng }) {
    const data = await nominatimFetch(`/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=0`);
    return data?.display_name || null;
}

/**
 * Browser geolocation as a promise. Rejects with a customer-readable
 * message (permission denied, unavailable, timeout, unsupported).
 */
export function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Location is not supported on this device.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            (err) => {
                const msg = err?.code === 1
                    ? 'Location permission denied. Allow location access or type your address.'
                    : err?.code === 3
                        ? 'Getting your location timed out. Please try again.'
                        : 'Could not get your location. Please type your address.';
                reject(new Error(msg));
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
        );
    });
}
