import React from 'react';

/**
 * Centered empty-state block used across waiter pages.
 *
 * Replaces the ad-hoc one-liner "No ready orders for X" plain text the
 * waiter screens shipped with — those left huge silent voids on tablet
 * widths and gave the user nothing to act on. This version gives the
 * empty state a clear visual anchor (icon + headline + hint) and an
 * optional CTA button, matching the same pattern used on the chef
 * dashboard's column empty states.
 *
 * Props:
 *   icon       Lucide icon component
 *   title      Short headline (e.g. "No orders yet")
 *   hint       Optional one-line explanation
 *   action     Optional { label, onClick } CTA button
 */
const WaiterEmptyState = ({ icon: Icon, title, hint, action }) => (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        {Icon && (
            <div className="w-16 h-16 rounded-2xl bg-orange-50 ring-1 ring-orange-100 text-[#FE8301] flex items-center justify-center mb-4">
                <Icon size={28} strokeWidth={1.75} />
            </div>
        )}
        <p className="text-base font-bold text-gray-900">{title}</p>
        {hint && (
            <p className="text-sm text-gray-500 mt-1.5 max-w-sm leading-relaxed">{hint}</p>
        )}
        {action && (
            <button
                type="button"
                onClick={action.onClick}
                className="mt-5 h-11 px-5 rounded-xl bg-[#FE8301] hover:bg-orange-600 active:bg-orange-700 text-white font-bold text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FE8301]"
            >
                {action.label}
            </button>
        )}
    </div>
);

export default WaiterEmptyState;
