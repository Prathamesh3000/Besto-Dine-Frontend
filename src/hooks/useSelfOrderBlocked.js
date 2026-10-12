import { useEffect, useReducer } from 'react';
import { useAuth } from '../Context/AuthContext';
import { isDineInSelfOrderBlocked } from '../utils/customerOrdering';

/**
 * Reactive "QR is menu-only" flag for customer pages: true when the
 * restaurant switched customer self-ordering off and this visitor is in
 * the dine-in flow. Always false for staff (Home / ProductDetails are
 * shared with the waiter app) and for takeaway.
 */
export default function useSelfOrderBlocked() {
    const { isStaff } = useAuth();
    const [, rerender] = useReducer((n) => n + 1, 0);
    useEffect(() => {
        // orderType flips (dine-in <-> takeaway) and tenant blob updates
        // are written to localStorage and announced with these events.
        window.addEventListener('storage', rerender);
        window.addEventListener('storage_sync', rerender);
        return () => {
            window.removeEventListener('storage', rerender);
            window.removeEventListener('storage_sync', rerender);
        };
    }, []);
    return !isStaff && isDineInSelfOrderBlocked();
}
