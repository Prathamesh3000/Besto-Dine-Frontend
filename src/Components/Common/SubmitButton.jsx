import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * SubmitButton — submit button that handles the four states every form
 * in this codebase currently gets wrong:
 *   1. Disabled while loading (prevents duplicate submission)
 *   2. Spinner during async work (visual feedback)
 *   3. aria-busy for screen readers
 *   4. Disabled styling (so it doesn't look clickable when it isn't)
 *
 *   <SubmitButton loading={saving}>Save</SubmitButton>
 *   <SubmitButton loading={saving} loadingText="Creating restaurant…">
 *       Create my restaurant
 *   </SubmitButton>
 *
 * Pass `variant` to switch palettes. Default = orange (admin theme).
 * Use `className` to override layout (width/margins), not color.
 */
export default function SubmitButton({
    loading = false,
    disabled = false,
    children,
    loadingText,
    variant = 'orange',
    type = 'submit',
    className = '',
    ...rest
}) {
    const palettes = {
        orange: 'bg-[#FE8301] hover:bg-orange-600 disabled:bg-orange-300 text-white',
        coral:  'bg-[#FF6B6B] hover:bg-[#ff5252] disabled:bg-[#ffb3b3] text-white',
        red:    'bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white',
        gray:   'bg-gray-700 hover:bg-gray-800 disabled:bg-gray-300 text-white',
    };
    const colorClasses = palettes[variant] || palettes.orange;

    return (
        <button
            type={type}
            disabled={loading || disabled}
            aria-busy={loading ? 'true' : 'false'}
            className={
                'inline-flex items-center justify-center gap-2 px-6 py-2.5 ' +
                'rounded-lg text-sm font-semibold transition ' +
                'disabled:cursor-not-allowed ' +
                colorClasses + ' ' + className
            }
            {...rest}
        >
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {loading && loadingText ? loadingText : children}
        </button>
    );
}
