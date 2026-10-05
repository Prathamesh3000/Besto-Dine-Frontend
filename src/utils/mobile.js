/**
 * Indian mobile number input helpers — shared by every form that takes a
 * mobile (hotel signup, customer register/OTP login, profile edit,
 * request-demo, staff add, Super Admin create-restaurant).
 *
 * The backend (Backend/utils/mobile.js normalizeMobile) accepts exactly
 * 10 digits starting 6–9 after stripping +91 / 91 / 0 prefixes; these
 * helpers make the inputs enforce the same thing while typing.
 *
 * NOTE: do NOT put maxLength={10} on these inputs — the browser truncates
 * a pasted "+91 98765-43210" to "+91 98765-" BEFORE onChange sees it.
 * sanitizeMobileInput() caps the value at 10 digits instead.
 */

export const MOBILE_REGEX = /^[6-9]\d{9}$/;

/**
 * Typed / pasted value → at most 10 national digits.
 * '+91 98765-43210' → '9876543210', '919876543210' → '9876543210',
 * '09876543210' → '9876543210', '98765432101234' → '9876543210'.
 */
export function sanitizeMobileInput(raw) {
    const s = String(raw ?? '').trim();
    let d = s.replace(/\D/g, '');
    if (s.startsWith('+')) {
        // Explicit international prefix: drop the Indian country code.
        d = d.replace(/^91/, '');
    } else if (d.length > 10 && d.startsWith('91')) {
        d = d.slice(2);
    } else if (d.length > 10 && d.startsWith('0')) {
        d = d.replace(/^0+/, '');
    }
    return d.slice(0, 10);
}

/** Error message for a sanitised mobile, or '' when valid. */
export function mobileError(value, { required = true } = {}) {
    const d = String(value ?? '');
    if (!d) return required ? 'Please enter your 10-digit mobile number.' : '';
    if (d.length !== 10) return `Mobile number must be 10 digits (${d.length}/10).`;
    if (!MOBILE_REGEX.test(d)) return 'Indian mobile numbers start with 6, 7, 8 or 9.';
    return '';
}

/** True when `value` is a valid 10-digit Indian mobile. */
export function isValidMobile(value) {
    return MOBILE_REGEX.test(String(value ?? ''));
}

/** Common <input> attributes for a mobile field (spread onto the input). */
export const mobileInputAttrs = {
    type: 'tel',
    inputMode: 'numeric',
    autoComplete: 'tel-national',
    pattern: '[6-9][0-9]{9}',
};
