import { useAuth } from '../Context/AuthContext';
import useSocketEvent from '../hooks/useSocketEvent';

/**
 * Keeps a signed-in staff user's operations profile current: when the
 * Super Admin changes how the restaurant runs, the server emits
 * `tenant:operations-updated` to the tenant's staff rooms and we refetch
 * /auth/me (which carries the resolved profile). Renders nothing.
 *
 * The payload may name a `branchId` (a per-branch override changed,
 * design §12.1). No filtering on it: /auth/me resolves the profile for
 * this user's effective branch, so a refetch is right either way.
 *
 * The listener only mounts for tenant staff — getSocket() opens a
 * connection, and visitors / customers must not get one from here.
 */
function Listener({ tenantId, refreshUser }) {
    useSocketEvent('tenant:operations-updated', (payload) => {
        if (payload?.restaurant && String(payload.restaurant) !== String(tenantId)) return;
        refreshUser?.();
    });
    return null;
}

export default function OperationsSync() {
    const { user, refreshUser } = useAuth();
    const isTenantStaff = !!user?.tenant?._id && user.role !== 'customer' && user.role !== 'superadmin';
    if (!isTenantStaff) return null;
    return <Listener tenantId={user.tenant._id} refreshUser={refreshUser} />;
}
