import React from 'react';

/** Titled card section used by every block of the restaurant landing page. */
const LandingSection = ({ id, title, icon, action = null, flush = false, children }) => {
    const Icon = icon;
    return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="px-5">
        <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id={id ? `${id}-title` : undefined} className="flex items-center gap-2 text-[17px] font-bold text-[#101828] font-nunito">
                {Icon && (
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-[var(--accent)]">
                        <Icon size={15} strokeWidth={2.4} />
                    </span>
                )}
                {title}
            </h2>
            {action}
        </div>
        {flush ? children : (
            <div className="bg-white rounded-2xl border border-[#F2F4F7] shadow-[0_1px_2px_rgba(16,24,40,0.04)] p-4">
                {children}
            </div>
        )}
    </section>
    );
};

export default LandingSection;
