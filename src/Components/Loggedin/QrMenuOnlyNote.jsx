import React from 'react';
import { QR_MENU_ONLY_NOTE } from '../../utils/customerOrdering';

/** Short note shown where dine-in ordering controls are hidden. */
export default function QrMenuOnlyNote({ className = '' }) {
    return (
        <div
            role="status"
            data-testid="qr-menu-only-note"
            className={`flex items-start gap-2 bg-[#FFF8EB] border border-[#FCE7A4] rounded-xl px-3 py-2 ${className}`}
        >
            <span className="text-[16px] leading-none mt-0.5" aria-hidden="true">🍽️</span>
            <p className="text-[12px] font-varela text-[#7A4504] leading-snug">{QR_MENU_ONLY_NOTE}</p>
        </div>
    );
}
