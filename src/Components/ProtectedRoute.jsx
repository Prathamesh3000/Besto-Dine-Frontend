import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, STAFF_ROLES, CUSTOMER_ROLES } from '../Context/AuthContext';
import { getActiveTenantSlug } from '../utils/tenant';

function AuthLoader() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#FBFBFF]">
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-orange-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm font-medium">Loading…</p>
            </div>
        </div>
    );
}

/**
 * ProtectedRoute — role-based route guard
 *
 * Props
 * ─────
 * requiredRole   : string | string[]  — role(s) that may access this route
 * allowGuest     : bool               — if true, guest (skipped login) users pass through
 * redirectTo     : string             — where to send blocked users (default: '/login')
 *
 * Access matrix
 * ─────────────
 * Staff routes   → requiredRole="waiter" or requiredRole={['waiter','captain']}
 * Customer routes → allowGuest (both logged-in customers AND guests pass)
 * Login-required  → neither allowGuest nor requiredRole (just isLoggedIn check)
 */
const ProtectedRoute = ({
    children,
    requiredRole,
    allowGuest = false,
    redirectTo,
}) => {
    const { isAuthenticated, isGuest, isLoading, hasRole, mustChangePassword, audience } = useAuth();
    const location = useLocation();

    if (isLoading) return <AuthLoader />;

    // Phase 1 SaaS: every customer-facing route needs an active tenant
    // slug. Without it, API calls have no tenant context and the customer
    // sees the wrong (or no) restaurant's data.
    //
    // A route is staff/super-admin-facing ONLY when it pins a non-customer
    // role — those carry the tenant in the staff JWT and are exempt.
    // EVERYTHING else (allowGuest, customer-only, AND plain login-required
    // customer routes) is customer-facing: if there's no slug we bounce to
    // the branch picker FIRST — before any login redirect — so for the
    // customer flows (takeaway, advance booking, plain browse) branch
    // selection ALWAYS comes before login, and is never re-asked after it.
    // This runs regardless of auth state, which also closes the latent bug
    // where a logged-in customer with no slug slipped straight into a
    // booking step and every API call 400'd with TENANT_REQUIRED.
    const requiredRolesList = [].concat(requiredRole || []);
    const isStaffRoute = requiredRolesList.length > 0 && !requiredRolesList.includes('customer');
    const isBranchSelectionPath = location.pathname === '/branch-selection';

    if (!isStaffRoute && !isBranchSelectionPath && !getActiveTenantSlug()) {
        return <Navigate to="/branch-selection" replace state={{ from: location.pathname }} />;
    }

    // Guest users are allowed when the route explicitly opts in — BUT
    // only when no specific `requiredRole` is set. If a route passes
    // both `allowGuest` and `requiredRole`, the role check must still
    // win; otherwise a guest (who has no role) would slip past an
    // explicit logged-in-only gate. R-08 fix: the old version had the
    // guest short-circuit above the role check, which let guests reach
    // /customer/wallet (allowGuest + requiredRole={CUSTOMER_ROLES}).
    // A guest's role is never 'customer', so adding `!requiredRole`
    // keeps every pure-guest route (/customer/home, /cart, /payment,
    // etc.) working exactly as before while closing the bypass.
    if (allowGuest && isGuest && !requiredRole) return children;

    // All other routes require actual authentication
    if (!isAuthenticated) {
        // Auto-detect correct login page from the requiredRole prop:
        // Customer roles → /login, all other roles (staff + superadmin) → /staff-login
        const requiredRoles = [].concat(requiredRole || []);
        const loginPath = redirectTo
            || (requiredRoles.length && !requiredRoles.includes('customer')
                ? '/staff-login'
                : '/login');
        return <Navigate to={loginPath} replace />;
    }

    // Force password change before accessing any protected route. The
    // page is shared by the Super Admin ('platform') and tenant staff
    // ('staff'), so tell it which audience's session to act on.
    if (mustChangePassword) {
        return <Navigate to="/force-change-password" replace state={{ audience }} />;
    }

    // If a specific role is required, check it. Instead of showing a
    // dead-end "Unauthorized" screen, redirect the user to the correct
    // login page so they can switch to the right account:
    //   - Customer-only routes → /login (customer login)
    //   - Staff / admin / chef / superadmin routes → /staff-login
    //
    // We pass the intended destination in `state.from` so the login
    // page can redirect back after successful auth with the right role.
    if (requiredRole && !hasRole(requiredRole)) {
        const roles = [].concat(requiredRole);
        const isCustomerOnlyRoute = roles.every(r => r === 'customer');
        const loginPath = isCustomerOnlyRoute ? '/login' : '/staff-login';
        return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
    }

    return children;
};

/**
 * CaptainOnlyRoute
 * Visually blocks waiters from captain-exclusive features without
 * redirecting them away from the page. Renders an inline message instead.
 */
export function CaptainOnlyRoute({ children, fallback }) {
    const { isCaptain, isLoading } = useAuth();

    if (isLoading) return <AuthLoader />;

    if (isCaptain) return children;

    return fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-6">
            <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center">
                <i className="fi fi-rr-lock text-3xl text-orange-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">Captain Access Only</h2>
            <p className="text-sm text-gray-500 max-w-xs">
                This feature is available to Captains only. Contact your captain to perform this action.
            </p>
        </div>
    );
}

export default ProtectedRoute;
