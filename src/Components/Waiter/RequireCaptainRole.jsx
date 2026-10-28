import { Navigate } from 'react-router-dom';
import { useAuth, CAPTAIN_ROLES } from '../../Context/AuthContext';

/**
 * Billing/payment screens are captain/admin/manager only. A signed-in
 * waiter who reaches one (typed URL, stale link) is sent back to the
 * waiter home instead of the /staff-login bounce ProtectedRoute does for
 * a role mismatch. Nest INSIDE a ProtectedRoute so auth/loading is
 * already handled.
 */
const RequireCaptainRole = ({ children }) => {
    const { user } = useAuth();
    if (!CAPTAIN_ROLES.includes(user?.role)) {
        return <Navigate to="/waiter/home" replace />;
    }
    return children;
};

export default RequireCaptainRole;
