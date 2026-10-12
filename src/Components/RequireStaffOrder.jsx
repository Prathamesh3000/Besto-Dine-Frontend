import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardX } from 'lucide-react';
import { useAuth } from '../Context/AuthContext';
import useOperations from '../hooks/useOperations';

/**
 * Operations-profile gate for the waiter app's order-entry screens
 * (/waiter/menu, /waiter/category/:id, /waiter/cart).
 *
 * orderFlow.staffOrder:false — the restaurant doesn't take orders
 * through the waiter app (customers self-order / counter only). The
 * backend refuses staff-created orders from waiter / captain, so they
 * see a short explanation instead of a menu whose cart can only fail.
 * Admins / managers pass through (admin POS is still allowed).
 */
const GATED_ROLES = new Set(['waiter', 'captain']);

/** True when this staff user may not enter orders from the waiter app. */
export function useStaffOrderOff() {
    const { user } = useAuth();
    const ops = useOperations();
    return GATED_ROLES.has(user?.role) && ops?.orderFlow?.staffOrder === false;
}

export default function RequireStaffOrder({ children }) {
    const off = useStaffOrderOff();
    if (!off) return children;
    return (
        <div className="min-h-[60vh] flex items-center justify-center p-6" data-testid="staff-order-off">
            <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <ClipboardX size={24} className="text-slate-600" />
                </div>
                <h1 className="text-xl font-bold text-slate-800 mb-2">Order entry is off</h1>
                <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    Your restaurant doesn&apos;t take orders from the waiter app. Guests order themselves or at the counter.
                </p>
                <Link
                    to="/waiter/home"
                    className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm transition"
                >
                    Back to tables
                </Link>
            </div>
        </div>
    );
}
