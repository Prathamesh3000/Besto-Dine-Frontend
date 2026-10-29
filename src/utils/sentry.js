// Sentry error reporting. A strict no-op unless VITE_SENTRY_DSN is set at
// build time. Errors only: no tracing, no session replay, no PII.
import * as Sentry from '@sentry/react';

const SENSITIVE_KEY = /^(authorization|cookie|set-cookie|x-api-key|password|passwd|token|accesstoken|refreshtoken|access_token|refresh_token|idtoken|id_token|scantoken|secret|otp|razorpay_signature)$/i;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

function scrubString(s) {
    return s.replace(BEARER_RE, 'Bearer [Filtered]').replace(JWT_RE, '[Filtered]');
}

// Deep-scrub an arbitrary event fragment (mutates a plain copy).
export function scrub(value, depth = 0) {
    if (depth > 8 || value == null) return value;
    if (typeof value === 'string') return scrubString(value);
    if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
    if (typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SENSITIVE_KEY.test(k) ? '[Filtered]' : scrub(v, depth + 1);
        }
        return out;
    }
    return value;
}

export function scrubEvent(event) {
    if (!event) return event;
    if (event.request) {
        const { headers, cookies, data, url, query_string: qs } = event.request;
        event.request = {
            ...event.request,
            ...(headers ? { headers: scrub(headers) } : {}),
            ...(data !== undefined ? { data: scrub(data) } : {}),
            ...(url ? { url: scrubString(url) } : {}),
            ...(qs ? { query_string: typeof qs === 'string' ? scrubString(qs) : scrub(qs) } : {}),
        };
        delete event.request.cookies;
        void cookies;
    }
    if (event.extra) event.extra = scrub(event.extra);
    if (event.contexts) event.contexts = scrub(event.contexts);
    if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => ({ ...b, ...(b.data ? { data: scrub(b.data) } : {}), ...(b.message ? { message: scrubString(b.message) } : {}) }));
    }
    if (event.user) event.user = { id: event.user.id };
    return event;
}

let started = false;

// Returns true when Sentry was initialised.
export function initSentry(env = import.meta.env) {
    const dsn = env?.VITE_SENTRY_DSN;
    if (!dsn || started) return started;
    Sentry.init({
        dsn,
        release: env.VITE_SENTRY_RELEASE || undefined,
        environment: env.VITE_SENTRY_ENVIRONMENT || env.MODE || 'production',
        sendDefaultPii: false,
        // Errors only — never enable tracing / replay here.
        tracesSampleRate: 0,
        beforeSend: scrubEvent,
        beforeBreadcrumb(breadcrumb) {
            return breadcrumb ? { ...breadcrumb, ...(breadcrumb.data ? { data: scrub(breadcrumb.data) } : {}) } : breadcrumb;
        },
    });
    started = true;
    return true;
}

export const sentryEnabled = () => started;
export { Sentry };
