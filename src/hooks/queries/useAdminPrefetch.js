import { useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { adminKeys, getAdminBranchKey, withAdminTenant } from './queryKeys';

/**
 * Prefetch the data each admin page needs as soon as the user hovers
 * its nav link. By the time they actually click (typically 100–300ms
 * later — the time it takes a finger to descend on a touchpad / move
 * a mouse), the React Query cache already has the response and the
 * destination page renders instantly.
 *
 * Hover-prefetch is cheap: a single API call per page-visit, vs the
 * "always-cold" status quo where every nav click waits ~300–800ms for
 * the same call. If the user never clicks, the prefetched response
 * sits in cache and harmlessly expires — so the only real cost is one
 * extra request per hover-without-click, which is rare.
 *
 * Returns a `prefetch(path)` function that the AdminLayout wires to
 * `onMouseEnter` / `onFocus` on each NavLink. Unknown paths are no-ops.
 */
export function useAdminPrefetch() {
    const qc = useQueryClient();

    const prefetchers = {
        // Same key useAdminBootstrap (TablesDashboard) reads: the
        // bootstrap key + the selected branch ('all' when none), which
        // AdminBranchContext persists to the slot getAdminBranchKey reads.
        '/admin/tables': () => qc.prefetchQuery({
            queryKey: [...adminKeys.bootstrap, getAdminBranchKey()],
            queryFn: () => api.get('/admin/bootstrap').then(r => r.data?.data ?? {}),
            staleTime: 60_000,
        }),
        // Keys mirror the pages' keys for the ACTIVE branch (the api
        // interceptor scopes these requests to it), so a prefetch never
        // caches one branch's data under another branch's key.
        '/admin/orders': () => Promise.all([
            qc.prefetchQuery({
                queryKey: withAdminTenant(['admin', 'orders', 'dine-archive', getAdminBranchKey()]),
                queryFn: async () => {
                    const [live, past] = await Promise.all([
                        api.get('/orders/live'),
                        api.get('/orders/past', { params: { limit: 200 } }),
                    ]);
                    const seen = new Set();
                    return [
                        ...(live.data?.orders ?? []),
                        ...(past.data?.orders ?? []),
                    ].filter(o => {
                        const key = o._id || o.orderId || o.id;
                        if (!key || seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                },
                staleTime: 15_000,
            }),
        ]),
        '/admin/dashboard': () => {
            const params = { earningsPeriod: 'daily', bookingTime: 'today', branch: getAdminBranchKey() };
            return qc.prefetchQuery({
                queryKey: withAdminTenant(['admin', 'telemetry', params]),
                queryFn: () => api.get('/telemetry/stats', { params }).then(r => r.data),
                staleTime: 15_000,
            });
        },
        '/admin/staff': () => qc.prefetchQuery({
            queryKey: adminKeys.staff,
            queryFn: () => api.get('/staff').then(r => r.data?.staff ?? []),
            staleTime: 5 * 60_000,
        }),
        '/admin/menu': () => qc.prefetchQuery({
            queryKey: adminKeys.categories,
            queryFn: () => api.get('/categories').then(r => r.data?.data ?? r.data?.categories ?? []),
            staleTime: 5 * 60_000,
        }),
    };

    return (path) => {
        const fn = prefetchers[path];
        if (fn) {
            // Fire-and-forget — we never await, never surface errors.
            // A failed prefetch becomes a normal cache miss when the
            // user clicks, indistinguishable from no prefetch at all.
            try { fn(); } catch { /* swallow */ }
        }
    };
}
