import { useAuth } from '../Context/AuthContext';
import { DEFAULT_OPERATIONS } from '../utils/operations';

/**
 * Staff-side operations profile — how the signed-in user's restaurant
 * runs (roles in use, order flow, payment timing). Resolved by the
 * backend and shipped on /auth/me; falls back to today's behaviour when
 * there is no tenant snapshot (super admin, legacy single-tenant).
 *
 * Customer pages use getCustomerOperations() from utils/operations.js.
 */
export function useOperations() {
    const { operations } = useAuth();
    return operations && typeof operations === 'object' ? operations : DEFAULT_OPERATIONS;
}

export default useOperations;
