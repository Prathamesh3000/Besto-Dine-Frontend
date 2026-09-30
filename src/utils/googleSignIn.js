/**
 * Google Sign-In availability.
 *
 * Lives outside GoogleSignInButton.jsx because a file that exports both
 * a component and a plain function breaks React Fast Refresh — the
 * whole module gets remounted on edit instead of hot-swapped.
 *
 * The client ID is a build-time constant, so this never changes while
 * the page is open and callers can read it once.
 *
 * Note this only reports what the BROWSER knows. The backend gates the
 * endpoint independently on its own GOOGLE_CLIENT_ID: if the two are
 * ever out of step, the button may render while POST /auth/google
 * answers 503, which the login page surfaces as an ordinary error.
 * Keep the two env vars set to the same value.
 */
export function isGoogleSignInAvailable() {
    return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}
