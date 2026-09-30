import React from 'react';

/**
 * FormField — label + input + inline error in one accessible unit.
 * Pairs with useFormValidation. Pass the hook's return value as `form`.
 *
 * Renders a native <input> by default. For <select>, <textarea>, or custom
 * inputs, pass them as children — FormField clones them with the wired
 * value/onChange/ref/aria props.
 *
 *   <FormField form={form} name="email" label="Email" type="email" required />
 *
 *   <FormField form={form} name="role" label="Role" required>
 *       <select>
 *           <option value="">Select…</option>
 *           <option value="admin">Admin</option>
 *       </select>
 *   </FormField>
 *
 * NOTE — `required` here only controls the asterisk in the label and the
 * `aria-required` attribute. The actual validation gate is the schema you
 * pass to useFormValidation. Don't sprinkle the prop onto optional fields.
 *
 * PLACEHOLDER GUIDELINES — match length to the rendered width:
 *   • Full-width fields → descriptive example/format
 *       e.g. "e.g. Joe's Cafe & Bakery", "you@yourdomain.com",
 *            "At least 8 characters", "Full name as on documents"
 *   • Half-width / grid-cols-2 fields → short hint only (no example
 *     long enough to overflow on mobile)
 *       e.g. "10-digit mobile", "e.g. Mumbai", "DD/MM/YYYY"
 *   • Numeric / search / single-token fields → one or two words
 *       e.g. "0", "Search…", "GST number"
 *   Skip the placeholder entirely when the label already says everything
 *   (e.g. boolean toggles, single-select dropdowns with a "Select…" option).
 */
export default function FormField({
    form,
    name,
    label,
    type = 'text',
    required: req = false,
    placeholder,
    helpText,
    autoComplete,
    inputMode,
    maxLength,
    minLength,
    autoFocus,
    disabled,
    children,
    className = '',
    inputClassName = '',
    labelClassName = '',
}) {
    const { values, errors, touched, handleChange, handleBlur, registerRef } = form;
    const id = `f-${name}`;
    const errorId = `${id}-err`;
    const helpId = helpText ? `${id}-help` : undefined;
    const showError = !!(touched[name] && errors[name]);

    const baseInput =
        'w-full px-4 py-3 rounded-xl border bg-white text-sm transition ' +
        'focus:outline-none focus:ring-2 ' +
        (showError
            ? 'border-red-400 focus:ring-red-200 focus:border-red-500 '
            : 'border-gray-300 focus:ring-orange-200 focus:border-orange-400 ') +
        (disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed ' : '') +
        inputClassName;

    const wired = {
        id,
        name,
        value: values[name] ?? '',
        onChange: handleChange,
        onBlur: handleBlur,
        ref: registerRef(name),
        disabled,
        'aria-invalid': showError ? 'true' : 'false',
        'aria-describedby': [showError && errorId, helpId].filter(Boolean).join(' ') || undefined,
        'aria-required': req ? 'true' : undefined,
    };

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            {label && (
                <label
                    htmlFor={id}
                    className={
                        labelClassName ||
                        'text-xs font-semibold text-gray-600 uppercase tracking-wider'
                    }
                >
                    {label}
                    {req && (
                        <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                    )}
                </label>
            )}

            {children
                ? React.cloneElement(children, {
                      ...wired,
                      className: children.props.className || baseInput,
                  })
                : (
                    <input
                        type={type}
                        placeholder={placeholder}
                        autoComplete={autoComplete}
                        inputMode={inputMode}
                        maxLength={maxLength}
                        minLength={minLength}
                        autoFocus={autoFocus}
                        className={baseInput}
                        {...wired}
                    />
                )}

            {helpText && !showError && (
                <p id={helpId} className="text-xs text-gray-500">{helpText}</p>
            )}

            {showError && (
                <p
                    id={errorId}
                    role="alert"
                    className="text-xs text-red-600 flex items-center gap-1 mt-0.5"
                >
                    <span aria-hidden="true">⚠</span>
                    {errors[name]}
                </p>
            )}
        </div>
    );
}
