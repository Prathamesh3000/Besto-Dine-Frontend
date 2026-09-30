import React from 'react';

/**
 * Super Admin UI primitives.
 *
 * Shared design-system components used across every Super Admin page.
 * Centralising them here keeps spacing, typography, color, radius and
 * shadow consistent without forcing each page to repeat long Tailwind
 * classnames.
 *
 * Design tokens (informal — encoded in classnames below):
 *   surface     → bg-white border border-orange-100/70
 *   muted       → bg-[#FAF5F0] text-gray-500
 *   radius      → rounded-2xl on cards, rounded-xl on inputs/buttons
 *   shadow      → very soft (1-2px) at rest, slightly stronger on hover
 *   accent      → #FE8301 brand orange (primary), gray-900 text
 *   text scale  → 2xl/bold page title, base/semibold section title,
 *                 sm body, xs muted, 11px uppercase tracking caption
 *
 * Palette matches the tenant-facing Admin portal so the whole product
 * reads as one brand, with the Super Admin sidebar as the only strong
 * visual difference between the two surfaces.
 */

// ─── PageHeader ──────────────────────────────────────────────────────
export const PageHeader = ({ eyebrow, title, description, actions }) => (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
        <div className="min-w-0">
            {eyebrow && (
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FE8301] mb-1.5">
                    {eyebrow}
                </div>
            )}
            <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-gray-900 truncate">
                {title}
            </h1>
            {description && (
                <p className="text-sm text-gray-500 mt-1.5 max-w-2xl leading-relaxed">
                    {description}
                </p>
            )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
);

// ─── Card ────────────────────────────────────────────────────────────
export const Card = ({ className = '', children, ...rest }) => (
    <div
        className={`bg-white rounded-2xl border border-orange-100/60 shadow-[0_1px_2px_rgba(254,131,1,0.05)] ${className}`}
        {...rest}
    >
        {children}
    </div>
);

// ─── SectionCard ─────────────────────────────────────────────────────
export const SectionCard = ({ title, subtitle, actions, icon: Icon, children, className = '' }) => (
    <Card className={className}>
        {(title || actions) && (
            <header className="px-5 sm:px-6 py-4 border-b border-orange-100/70 flex items-start gap-3">
                {Icon && (
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FE8301] shrink-0">
                        <Icon className="w-4.5 h-4.5" strokeWidth={2} size={18} />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    {title && <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>}
                    {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
                </div>
                {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
            </header>
        )}
        <div className="p-5 sm:p-6">{children}</div>
    </Card>
);

// ─── StatCard ────────────────────────────────────────────────────────
const TONE_PRESETS = {
    slate:   { ring: 'ring-gray-200/70',    icon: 'bg-gray-100  text-gray-700',      dot: 'bg-gray-400'    },
    brand:   { ring: 'ring-orange-200/70',  icon: 'bg-orange-50 text-[#FE8301]',     dot: 'bg-[#FE8301]'   },
    success: { ring: 'ring-emerald-200/70', icon: 'bg-emerald-50 text-emerald-600',  dot: 'bg-emerald-500' },
    warning: { ring: 'ring-amber-200/70',   icon: 'bg-amber-50   text-amber-600',    dot: 'bg-amber-500'   },
    danger:  { ring: 'ring-rose-200/70',    icon: 'bg-rose-50    text-rose-600',     dot: 'bg-rose-500'    },
    info:    { ring: 'ring-sky-200/70',     icon: 'bg-sky-50     text-sky-600',      dot: 'bg-sky-500'     },
    indigo:  { ring: 'ring-indigo-200/70',  icon: 'bg-indigo-50  text-indigo-600',   dot: 'bg-indigo-500'  },
};

export const StatCard = ({ label, value, hint, icon: Icon, tone = 'slate', loading }) => {
    const t = TONE_PRESETS[tone] || TONE_PRESETS.slate;
    return (
        <div className="bg-white rounded-2xl border border-orange-100/60 p-5 shadow-[0_1px_2px_rgba(254,131,1,0.05)] hover:shadow-[0_8px_24px_rgba(254,131,1,0.10)] hover:border-orange-200/70 transition-all">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                        {label}
                    </div>
                    <div className="mt-2.5 text-[28px] leading-none font-bold text-gray-900 tabular-nums">
                        {loading ? <span className="inline-block w-16 h-7 bg-gray-100 rounded-md animate-pulse" /> : (value ?? '—')}
                    </div>
                    {hint && (
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${t.dot}`} />
                            {hint}
                        </div>
                    )}
                </div>
                {Icon && (
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.icon} ring-1 ${t.ring}`}>
                        <Icon size={18} strokeWidth={2} />
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Badge ───────────────────────────────────────────────────────────
const BADGE_TONES = {
    slate:   'bg-gray-100    text-gray-700    ring-gray-200/70',
    brand:   'bg-orange-50   text-orange-700  ring-orange-200/70',
    success: 'bg-emerald-50  text-emerald-700 ring-emerald-200/70',
    warning: 'bg-amber-50    text-amber-700   ring-amber-200/70',
    danger:  'bg-rose-50     text-rose-700    ring-rose-200/70',
    info:    'bg-sky-50      text-sky-700     ring-sky-200/70',
    indigo:  'bg-indigo-50   text-indigo-700  ring-indigo-200/70',
};

export const Badge = ({ tone = 'slate', children, className = '', dot = false }) => (
    <span
        className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ring-1 ${BADGE_TONES[tone] || BADGE_TONES.slate} ${className}`}
    >
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${TONE_PRESETS[tone]?.dot || 'bg-gray-400'}`} />}
        {children}
    </span>
);

// ─── Button ──────────────────────────────────────────────────────────
//
// Primary is the brand orange (matches the tenant-facing Admin portal
// so the whole product reads as one). `brand` is kept as an alias for
// backward-compat with pages that specify it explicitly. `ghost` is
// the neutral secondary, `danger` for destructive, `success` for
// confirm-positive flows.
const BUTTON_VARIANTS = {
    primary: 'bg-[#FE8301] text-white hover:bg-[#e57601] active:bg-[#cc6a01] shadow-[0_4px_12px_rgba(254,131,1,0.22)]',
    brand:   'bg-[#FE8301] text-white hover:bg-[#e57601] active:bg-[#cc6a01] shadow-[0_4px_12px_rgba(254,131,1,0.22)]',
    ghost:   'bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301]',
    danger:  'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 hover:border-rose-300',
    success: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm',
    dark:    'bg-gray-900 text-white hover:bg-gray-800 active:bg-black shadow-sm',
};

const BUTTON_SIZES = {
    sm: 'text-xs px-3 py-1.5 rounded-lg',
    md: 'text-sm px-4 py-2.5 rounded-xl',
    lg: 'text-sm px-5 py-3 rounded-xl',
};

export const Button = React.forwardRef(function Button(
    { variant = 'primary', size = 'md', icon: Icon, iconRight: IconRight, children, className = '', ...rest },
    ref
) {
    return (
        <button
            ref={ref}
            className={`inline-flex items-center justify-center gap-2 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#FE8301]/40 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
            {...rest}
        >
            {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.25} />}
            {children}
            {IconRight && <IconRight size={size === 'sm' ? 14 : 16} strokeWidth={2.25} />}
        </button>
    );
});

// ─── Input / Select / Textarea ──────────────────────────────────────
export const inputClass =
    'w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:outline-none focus:border-[#FE8301] focus:ring-4 focus:ring-[#FE8301]/10 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';

export const Field = ({ label, hint, required, error, children }) => (
    <label className="block">
        {(label || hint) && (
            <div className="flex items-baseline justify-between mb-1.5 gap-3">
                {label && (
                    <span className="text-xs font-semibold text-gray-700">
                        {label}
                        {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
                    </span>
                )}
                {hint && !error && (
                    <span className="text-[10px] text-gray-400 truncate">{hint}</span>
                )}
            </div>
        )}
        {children}
        {error && (
            <p role="alert" className="mt-1.5 text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                <span aria-hidden="true">⚠</span>{error}
            </p>
        )}
    </label>
);

// ─── EmptyState ──────────────────────────────────────────────────────
export const EmptyState = ({ icon: Icon, title, description, action, className = '' }) => (
    <div className={`flex flex-col items-center justify-center text-center py-14 px-6 ${className}`}>
        {Icon && (
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FE8301] mb-4">
                <Icon size={24} strokeWidth={1.75} />
            </div>
        )}
        <div className="text-sm font-semibold text-gray-800">{title}</div>
        {description && <p className="text-xs text-gray-500 mt-1 max-w-sm leading-relaxed">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
    </div>
);

// ─── Skeleton ────────────────────────────────────────────────────────
export const Skeleton = ({ className = '' }) => (
    <div className={`bg-gray-100 rounded-md animate-pulse ${className}`} />
);

// ─── Table primitives ────────────────────────────────────────────────
export const TableShell = ({ children, className = '' }) => (
    <Card className={`overflow-hidden p-0 ${className}`}>
        <div className="overflow-x-auto">
            <table className="w-full text-sm">{children}</table>
        </div>
    </Card>
);

export const TH = ({ children, align = 'left', className = '' }) => (
    <th
        className={`text-${align} px-5 py-3.5 text-[10.5px] font-semibold uppercase tracking-widest text-gray-500 bg-[#FAF5F0]/70 ${className}`}
    >
        {children}
    </th>
);

export const TD = ({ children, align = 'left', className = '' }) => (
    <td className={`px-5 py-4 text-${align} ${className}`}>{children}</td>
);

// ─── ModalShell ──────────────────────────────────────────────────────
export const ModalShell = ({ open = true, onClose, title, subtitle, icon: Icon, children, footer, maxWidth = 'max-w-lg' }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
            <div className={`bg-white w-full ${maxWidth} rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] animate-slideUp`}>
                <header className="px-5 sm:px-6 py-4 border-b border-orange-100/70 flex items-start gap-3 shrink-0">
                    {Icon && (
                        <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FE8301] shrink-0">
                            <Icon size={18} strokeWidth={2} />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold text-gray-900 truncate">{title}</h2>
                        {subtitle && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#FE8301] hover:bg-orange-50 transition shrink-0"
                        aria-label="Close"
                    >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
                            <path d="M2 2L12 12M12 2L2 12" />
                        </svg>
                    </button>
                </header>
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                    {children}
                </div>
                {footer && (
                    <footer className="px-5 sm:px-6 py-4 border-t border-orange-100/70 flex items-center justify-end gap-3 shrink-0 bg-[#FAF5F0]/50">
                        {footer}
                    </footer>
                )}
            </div>
        </div>
    );
};

// ─── ConfirmModal — branded replacement for window.confirm ──────────
//
// Use when you need a yes/no decision before an action. The Confirm
// button takes a `danger` flag that switches its styling to red so
// destructive actions look destructive.
//
//   <ConfirmModal
//       open={open}
//       onClose={() => setOpen(false)}
//       onConfirm={doIt}
//       title="Suspend this restaurant?"
//       description="Their staff will be locked out immediately."
//       confirmLabel="Suspend"
//       danger
//   />
export const ConfirmModal = ({
    open, onClose, onConfirm, title, description,
    confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false,
}) => {
    if (!open) return null;
    const confirmClasses = danger
        ? 'bg-rose-600 hover:bg-rose-700 text-white'
        : 'bg-[#FE8301] hover:bg-[#e57601] text-white';
    return (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn" role="dialog" aria-modal="true">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slideUp">
                <header className="px-5 sm:px-6 py-4 border-b border-orange-100/70">
                    <h2 className="text-base font-bold text-gray-900">{title}</h2>
                    {description && (
                        <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{description}</p>
                    )}
                </header>
                <footer className="px-5 sm:px-6 py-4 flex items-center justify-end gap-3 bg-[#FAF5F0]/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={() => { onConfirm?.(); onClose?.(); }}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition ${confirmClasses}`}
                    >
                        {confirmLabel}
                    </button>
                </footer>
            </div>
        </div>
    );
};

// ─── PromptModal — branded replacement for window.prompt ────────────
//
// Same shape as ConfirmModal but with a textarea. The onConfirm callback
// receives the trimmed string value. `required` turns the empty state
// into an inline error instead of letting the caller submit an empty
// string (which is what window.prompt would have done).
//
//   <PromptModal
//       open={open}
//       title="Why are you rejecting this signup?"
//       description="The reason is recorded in the audit log."
//       placeholder="e.g. Suspicious application details"
//       required
//       onClose={() => setOpen(false)}
//       onConfirm={(reason) => rejectSignup(reason)}
//   />
export const PromptModal = ({
    open, onClose, onConfirm, title, description,
    placeholder = '', defaultValue = '', confirmLabel = 'Confirm',
    cancelLabel = 'Cancel', danger = false, required = false,
    rows = 3, maxLength = 500,
}) => {
    const [value, setValue] = React.useState(defaultValue);
    const [error, setError] = React.useState('');
    // Reset state when the modal re-opens — without this, a previously
    // typed value (or stale error) would leak into the next prompt.
    React.useEffect(() => {
        if (open) { setValue(defaultValue); setError(''); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    if (!open) return null;
    const confirmClasses = danger
        ? 'bg-rose-600 hover:bg-rose-700 text-white'
        : 'bg-[#FE8301] hover:bg-[#e57601] text-white';

    const handleSubmit = () => {
        const trimmed = value.trim();
        if (required && !trimmed) {
            setError('This field is required');
            return;
        }
        onConfirm?.(trimmed);
        onClose?.();
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-gray-900/40 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn" role="dialog" aria-modal="true">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slideUp">
                <header className="px-5 sm:px-6 py-4 border-b border-orange-100/70">
                    <h2 className="text-base font-bold text-gray-900">{title}</h2>
                    {description && (
                        <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{description}</p>
                    )}
                </header>
                <div className="px-5 sm:px-6 py-4">
                    <label className="block">
                        <span className="sr-only">{title}</span>
                        <textarea
                            value={value}
                            onChange={(e) => { setValue(e.target.value); if (error) setError(''); }}
                            placeholder={placeholder}
                            rows={rows}
                            maxLength={maxLength}
                            autoFocus
                            aria-required={required ? 'true' : undefined}
                            aria-invalid={error ? 'true' : 'false'}
                            className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:outline-none focus:ring-4 resize-none ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : 'border-gray-200 focus:border-[#FE8301] focus:ring-[#FE8301]/10'}`}
                        />
                    </label>
                    {error && (
                        <p role="alert" className="mt-1.5 text-xs text-rose-600 font-semibold flex items-center gap-1">
                            <span aria-hidden="true">⚠</span>{error}
                        </p>
                    )}
                    {!error && maxLength && (
                        <p className="mt-1 text-[11px] text-gray-400 text-right">{value.length}/{maxLength}</p>
                    )}
                </div>
                <footer className="px-5 sm:px-6 py-4 flex items-center justify-end gap-3 bg-[#FAF5F0]/50 border-t border-orange-100/70">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white text-gray-700 border border-gray-200 hover:border-[#FE8301]/40 hover:bg-orange-50 hover:text-[#FE8301] transition"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition ${confirmClasses}`}
                    >
                        {confirmLabel}
                    </button>
                </footer>
            </div>
        </div>
    );
};

// ─── DefinitionList primitives ───────────────────────────────────────
export const DL = ({ children, columns = 2, className = '' }) => (
    <dl className={`grid grid-cols-1 sm:grid-cols-${columns} gap-x-6 gap-y-5 ${className}`}>
        {children}
    </dl>
);

export const DLItem = ({ label, value, children }) => (
    <div className="min-w-0">
        <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-gray-500">
            {label}
        </dt>
        <dd className="mt-1 text-sm text-gray-900 font-medium break-words">{value ?? children ?? '—'}</dd>
    </div>
);
