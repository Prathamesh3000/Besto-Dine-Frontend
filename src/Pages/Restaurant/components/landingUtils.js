// Small pure helpers shared by the restaurant landing page components.

/** Brand orange used across the customer app (buttons, pills, focus rings). */
export const DEFAULT_ACCENT = '#FE8301';

export const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Valid #rgb / #rrggbb → normalized #rrggbb; anything else → fallback. */
export function normalizeAccent(hex, fallback = DEFAULT_ACCENT) {
    const v = String(hex || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v.slice(1).split('').map(c => c + c).join('')}`.toLowerCase();
    return fallback;
}

/** Text colour that stays readable on top of `hex` (white or near-black). */
export function readableOn(hex) {
    const v = normalizeAccent(hex);
    const [r, g, b] = [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Prefer white until the accent is genuinely light (yellow, pastel).
    return luminance > 0.45 ? '#1A181B' : '#FFFFFF';
}

/** '09:00' / '21:30' → '9:00 AM' / '9:30 PM'. Unknown shapes pass through. */
export function formatTime(value) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    if (!m) return value || '';
    let h = Number(m[1]);
    const suffix = h >= 12 && h < 24 ? 'PM' : 'AM';
    h %= 12;
    if (h === 0) h = 12;
    return `${h}:${m[2]} ${suffix}`;
}

/** Today's English weekday name, matching operatingHours[].day. */
export function todayName(date = new Date()) {
    return WEEK_ORDER[(date.getDay() + 6) % 7];
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export function formatPrice(value) {
    const n = Number(value);
    return Number.isFinite(n) ? inr.format(n) : '';
}

/** Prefix bare domains with https:// so they open as external links. */
export function externalUrl(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return `https://${v.replace(/^\/+/, '')}`;
}

/** Accepts a profile URL or a bare handle (with or without '@'). */
export function socialProfileUrl(value, host) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v) || v.includes('.')) return externalUrl(v);
    return `https://${host}/${v.replace(/^@/, '')}`;
}

/** WhatsApp: a wa.me / api.whatsapp.com link, or a phone number. */
export function whatsappUrl(value) {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v) || v.includes('.')) return externalUrl(v);
    const digits = v.replace(/\D/g, '');
    if (!digits) return '';
    // Ten-digit numbers are Indian mobiles without the country code.
    return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

/** Phone number → tel: href (keeps a leading '+'). */
export function telHref(phone) {
    const v = String(phone || '').trim();
    if (!v) return '';
    return `tel:${v.replace(/[^\d+]/g, '')}`;
}
