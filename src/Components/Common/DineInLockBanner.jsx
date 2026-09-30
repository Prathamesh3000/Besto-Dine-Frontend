/**
 * DineInLockBanner — global sticky strip that appears on every
 * customer-facing page when the dine-in bill has been settled but
 * the customer hasn't re-scanned the table QR yet.
 *
 * Mount once near the App root so individual pages don't need to
 * remember to render their own banner. Sits at the very top with a
 * fixed position + high z-index, pushing nothing down (the header
 * accounts for safe-area on its own).
 *
 * Visible on customer-facing routes only — admin / waiter / chef
 * dashboards never see the customer's settle flag.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useDineInLock } from '../../utils/dineInSession';

const CUSTOMER_PATH_PREFIXES = [
    '/customer/',
    '/scan/',
    '/menu',
];

export default function DineInLockBanner() {
    const locked = useDineInLock();
    const { pathname } = useLocation();

    if (!locked) return null;

    // Limit the banner to customer-facing routes. Staff dashboards
    // and admin pages share the same React app but should never see
    // a customer's session-lock notice.
    const onCustomerPath = CUSTOMER_PATH_PREFIXES.some((p) => pathname.startsWith(p));
    if (!onCustomerPath) return null;

    return (
        <div
            role="status"
            className="fixed top-0 left-0 right-0 z-[120] bg-gradient-to-r from-[#7A1F1F] via-[#B42318] to-[#EF4F5F] text-white shadow-lg animate-in slide-in-from-top duration-300"
        >
            <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2">
                <Lock size={16} className="shrink-0" />
                <p className="text-[12px] sm:text-[13px] font-nunito font-semibold leading-tight flex-1">
                    Bill settled — ordering is paused.
                    <span className="font-varela font-normal opacity-90">
                        {' '}Re-scan the table QR to start a new order.
                    </span>
                </p>
            </div>
        </div>
    );
}
