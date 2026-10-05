/**
 * passwordPolicy — one definition of what counts as an acceptable
 * password, shared by registration and password reset.
 *
 * The bug this fixes
 * ------------------
 * The registration form displayed a strength meter scoring 0–4 with
 * labels "Too short / Weak / Fair / Good / Strong", but `validate-
 * RegisterStep1` only ever checked `password.length < 8`. So a
 * password the UI itself labelled merely "Good" sailed through — the
 * meter was decoration, not a gate. The reported symptom: "when user
 * set 'Good' password still user can able to do registration."
 *
 * Worse, the two ends disagreed. The SERVER has always enforced
 * uppercase + lowercase + digit + special + 8 chars
 * (authController.PASSWORD_REGEX), but the client didn't check those
 * at all — and it collected the password on step 1 while only
 * submitting on step 2. A password failing the server rules was
 * therefore accepted on step 1, and the user discovered the problem
 * only after filling in their mobile number and accepting the terms,
 * via a rejection that pointed at no field.
 *
 * Now: the client enforces the server's rules (8–128 chars, upper, lower,
 * digit, special — which always scores at least "Good"), and it does so
 * on step 1 where the field actually lives.
 *
 * SERVER_PASSWORD_REGEX below is a literal mirror of the backend's.
 * If one changes, change both.
 *
 * The backend enforces the same rules for customer register / reset
 * and hotel self-signup (Backend/utils/passwordPolicy.js), so a weaker
 * password can't slip in by calling the API directly.
 */

/** Mirror of Backend/controllers/authController.js PASSWORD_REGEX. */
export const SERVER_PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=<>?]).{8,}$/;

/**
 * Minimum score the meter must reach before the form will submit.
 * 3 = "Good": a password that meets every rule below at 8–11 chars is
 * accepted; 12+ chars earns "Strong" and is encouraged, not required.
 */
export const MIN_PASSWORD_SCORE = 3;

/** Minimum accepted length (a "Good" password). */
export const MIN_LENGTH = 8;

/** Maximum accepted length — mirrors Backend/utils/passwordPolicy.js isStrongPassword. */
export const MAX_LENGTH = 128;

/** Length that separates "Good" from "Strong". */
export const STRONG_LENGTH = 12;

export const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
export const STRENGTH_COLORS = [
    'bg-gray-200', 'bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-green-600',
];

/**
 * Score 0–4 from length and character-class variety.
 * Unchanged from the original inline implementation so the meter
 * behaves exactly as before — only the gating is new.
 */
export function scorePassword(pw) {
    if (!pw) return 0;
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= STRONG_LENGTH) s++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(s, 4);
}

/**
 * Which specific rules a password fails, as stable keys the UI renders
 * as a live checklist. Returning the failures (rather than a boolean)
 * is what lets the form show someone what's missing while they type,
 * instead of rejecting them after the fact.
 */
export function passwordRuleFailures(pw) {
    const failures = [];
    if (!pw || pw.length < MIN_LENGTH) failures.push('length');
    if (pw && pw.length > MAX_LENGTH) failures.push('maxLength');
    if (!(/[A-Z]/.test(pw || '') && /[a-z]/.test(pw || ''))) failures.push('case');
    if (!/\d/.test(pw || '')) failures.push('digit');
    if (!/[!@#$%^&*()_\-+=<>?]/.test(pw || '')) failures.push('special');
    return failures;
}

/** Is this password acceptable? The single question callers should ask. */
export function isPasswordAcceptable(pw) {
    return passwordRuleFailures(pw).length === 0 && scorePassword(pw) >= MIN_PASSWORD_SCORE;
}

/**
 * A single human-readable reason, for a form-level error line.
 * Returns '' when the password is fine.
 */
export function passwordError(pw) {
    if (!pw) return 'Password is required';
    const failures = passwordRuleFailures(pw);
    if (!failures.length) return '';
    if (failures.includes('length')) {
        return `Use at least ${MIN_LENGTH} characters`;
    }
    if (failures.includes('maxLength')) return `Use at most ${MAX_LENGTH} characters`;
    if (failures.includes('case')) return 'Add both upper and lower case letters';
    if (failures.includes('digit')) return 'Add a number';
    return 'Add a special character (!@#$…)';
}
