import { useCallback, useRef, useState } from 'react';

/**
 * Lightweight form-validation hook for BestoDine.
 *
 * Designed to replace the inline `if (!x) return toast.error(...)` pattern
 * with per-field inline errors, aria-invalid, auto-focus on first bad
 * field, and a single shape for server-side errors landing on the right
 * input (e.g. `EMAIL_TAKEN` → email field, not a floating toast).
 *
 * Validators are pure: (value, allValues) => string | null.
 * Compose with combine(): combine(required('Email'), email()).
 *
 *   const form = useFormValidation(
 *       { name: '', email: '' },
 *       { name: required('Name'),
 *         email: combine(required('Email'), email()) }
 *   );
 *
 *   <form onSubmit={(e) => { e.preventDefault();
 *                            if (!form.validateAll()) return; save(); }}>
 *     <FormField form={form} name="name"  label="Name"  required />
 *     <FormField form={form} name="email" label="Email" type="email" required />
 *     <SubmitButton loading={saving}>Save</SubmitButton>
 *   </form>
 */
export function useFormValidation(initial, schema) {
    const [values, setValues] = useState(initial);
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const fieldRefs = useRef({});

    // Register an input ref so validateAll() can focus the first bad field.
    // Caller pattern: <input ref={form.registerRef('email')} />
    // FormField does this for you.
    const registerRef = useCallback((name) => (el) => {
        if (el) fieldRefs.current[name] = el;
        else delete fieldRefs.current[name];
    }, []);

    const setValue = useCallback((name, value) => {
        setValues((v) => ({ ...v, [name]: value }));
        // Clear the field's error the moment they start fixing it.
        // Without this, the red border lingers until next blur — feels stuck.
        setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
    }, []);

    const handleChange = useCallback((e) => {
        const { name, value, type, checked } = e.target;
        setValue(name, type === 'checkbox' ? checked : value);
    }, [setValue]);

    const handleBlur = useCallback((e) => {
        const { name } = e.target;
        setTouched((t) => (t[name] ? t : { ...t, [name]: true }));
        const validator = schema[name];
        if (validator) {
            const err = validator(values[name], values);
            setErrors((prev) => ({ ...prev, [name]: err || undefined }));
        }
    }, [schema, values]);

    /**
     * Validate every field in `schema`. Returns true if all pass.
     * Side effects: sets errors, marks everything touched, focuses +
     * scrolls to the first invalid field.
     */
    const validateAll = useCallback(() => {
        const next = {};
        for (const name of Object.keys(schema)) {
            const err = schema[name](values[name], values);
            if (err) next[name] = err;
        }
        setErrors(next);
        setTouched(Object.fromEntries(Object.keys(schema).map((k) => [k, true])));

        const firstBad = Object.keys(schema).find((k) => next[k]);
        if (firstBad) {
            const el = fieldRefs.current[firstBad];
            if (el) {
                try { el.focus({ preventScroll: true }); } catch { /* select/textarea fallback */ }
                if (typeof el.scrollIntoView === 'function') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
        return Object.keys(next).length === 0;
    }, [schema, values]);

    /**
     * Map server-returned validation errors onto fields.
     * Use in the catch block after a `{ _silent: true }` request:
     *
     *   if (err.response?.data?.code === 'EMAIL_TAKEN') {
     *       form.setServerErrors({ email: 'That email is already registered' });
     *   }
     */
    const setServerErrors = useCallback((map) => {
        setErrors((prev) => ({ ...prev, ...map }));
        setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(map).map((k) => [k, true])) }));
        const first = Object.keys(map)[0];
        const el = first && fieldRefs.current[first];
        if (el) {
            try { el.focus({ preventScroll: true }); } catch { /* noop */ }
            el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        }
    }, []);

    const reset = useCallback((next = initial) => {
        setValues(next); setErrors({}); setTouched({});
    }, [initial]);

    /**
     * Programmatic focus on a registered field. Useful for mount-time
     * focus logic (e.g. focus password instead of email if the email
     * was remembered).
     */
    const focusField = useCallback((name) => {
        const el = fieldRefs.current[name];
        if (el?.focus) {
            try { el.focus(); } catch { /* noop */ }
        }
    }, []);

    return {
        values, errors, touched,
        setValue, setValues,
        handleChange, handleBlur,
        validateAll, setServerErrors,
        registerRef, focusField, reset,
    };
}

// ─── Validator combinators ────────────────────────────────────────────────────
// All validators return `string | null`. Null means "valid".
// Empty/null values are treated as valid by format validators — pair with
// `required(...)` via combine() when the field is mandatory.

export const combine = (...fns) => (v, all) => {
    for (const fn of fns) { const r = fn(v, all); if (r) return r; }
    return null;
};

export const required = (label = 'This field') => (v) =>
    v == null || (typeof v === 'string' && !v.trim()) ? `${label} is required` : null;

export const email = (msg = 'Enter a valid email address') => (v) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()) ? null : msg;

export const phone10 = (msg = 'Enter a valid 10-digit phone number') => (v) =>
    !v || /^[0-9]{10}$/.test(String(v).trim()) ? null : msg;

export const minLen = (n, label = 'This field') => (v) =>
    !v || v.length >= n ? null : `${label} must be at least ${n} characters`;

export const maxLen = (n, label = 'This field') => (v) =>
    !v || v.length <= n ? null : `${label} cannot exceed ${n} characters`;

export const matches = (otherField, msg = 'Values do not match') => (v, all) =>
    v === all[otherField] ? null : msg;

export const positive = (label = 'Value') => (v) => {
    if (v === '' || v == null) return `${label} is required`;
    const n = Number(v);
    return !isNaN(n) && n > 0 ? null : `${label} must be greater than 0`;
};

export const integerInRange = (min, max, label = 'Value') => (v) => {
    if (v === '' || v == null) return `${label} is required`;
    const n = Number(v);
    if (isNaN(n) || !Number.isInteger(n)) return `${label} must be a whole number`;
    if (n < min) return `${label} must be at least ${min}`;
    if (n > max) return `${label} cannot exceed ${max}`;
    return null;
};

export const oneOf = (allowed, label = 'Selection') => (v) =>
    allowed.includes(v) ? null : `${label} is required`;
