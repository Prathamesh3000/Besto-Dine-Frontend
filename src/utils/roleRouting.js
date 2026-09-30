// Default landing path for non-customer roles. Used by entry-point pages
// (PlatformHome at `/`, customer Login, staff Login) to bounce a still-authenticated
// staff / chef / admin / superadmin away from customer-facing UI to their
// own workspace. Returns null for `customer` and unknown roles so the
// caller falls through to the regular customer flow.
export function staffHomePath(user) {
    switch (user?.role) {
        case 'waiter':
        case 'captain':
            return '/waiter/home';
        case 'chef':
            return '/chef/dashboard';
        case 'admin':
        case 'manager':
            return '/admin/dashboard';
        case 'superadmin':
            return '/superadmin/dashboard';
        default:
            return null;
    }
}
