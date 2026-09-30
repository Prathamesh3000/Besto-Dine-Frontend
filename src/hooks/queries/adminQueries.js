import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { adminKeys, getAdminBranchKey } from './queryKeys';
import useSocketEvent from '../useSocketEvent';

/**
 * Per-section admin queries. Each one shares its cache key with the
 * `/admin/bootstrap` aggregator — a page that already loaded bootstrap
 * data sees `useTables()` resolve instantly from cache, then revalidate
 * in the background. A page that doesn't use bootstrap (e.g. opens a
 * modal that needs only the staff list) fetches just that one slice.
 */

const unwrapList = (key) => (data) => data?.[key] ?? (Array.isArray(data) ? data : []);

export function useTables(opts = {}) {
    return useQuery({
        queryKey: adminKeys.tables,
        queryFn: () => api.get('/tables').then(r => unwrapList('tables')(r.data)),
        staleTime: 60_000,
        ...opts,
    });
}

export function useAreas(opts = {}) {
    return useQuery({
        queryKey: adminKeys.areas,
        queryFn: () => api.get('/areas').then(r => unwrapList('areas')(r.data)),
        staleTime: 60_000,
        ...opts,
    });
}

export function useReservations(opts = {}) {
    return useQuery({
        queryKey: adminKeys.reservations,
        queryFn: () => api.get('/reservations').then(r => unwrapList('reservations')(r.data)),
        staleTime: 30_000,
        ...opts,
    });
}

export function useStaff(opts = {}) {
    return useQuery({
        queryKey: adminKeys.staff,
        queryFn: () => api.get('/staff').then(r => unwrapList('staff')(r.data)),
        staleTime: 5 * 60_000,
        ...opts,
    });
}

export function useAdminSettings(opts = {}) {
    return useQuery({
        queryKey: adminKeys.settings,
        queryFn: () => api.get('/settings').then(r => r.data),
        staleTime: 5 * 60_000,
        ...opts,
    });
}

export function useLiveOrders(opts = {}) {
    return useQuery({
        queryKey: adminKeys.orders.live,
        queryFn: () => api.get('/orders/live').then(r => r.data?.orders ?? r.data ?? []),
        staleTime: 15_000,
        refetchInterval: 30_000,
        ...opts,
    });
}

export function usePastOrders(opts = {}) {
    return useQuery({
        queryKey: adminKeys.orders.past,
        queryFn: () => api.get('/orders/past').then(r => r.data?.orders ?? r.data ?? []),
        staleTime: 60_000,
        ...opts,
    });
}

export function useCategories(opts = {}) {
    return useQuery({
        queryKey: adminKeys.categories,
        queryFn: () => api.get('/categories').then(r => r.data?.categories ?? r.data ?? []),
        staleTime: 5 * 60_000,
        ...opts,
    });
}

/**
 * Telemetry stats for the admin home dashboard. Keyed by the
 * filter params so picking a different period / branch reuses any
 * previously cached page (the user gets a paint-instant flip with
 * a quiet background revalidate, instead of a full spinner).
 */
export function useTelemetry({ earningsPeriod = 'daily', timeFilter = 'today', branch = 'all' } = {}, opts = {}) {
    const queryClient = useQueryClient();
    const params = {
        earningsPeriod,
        bookingTime: String(timeFilter).toLowerCase(),
        branch: branch || 'all',
    };

    // Real-time invalidation for the Customer Requests panel. Without
    // these listeners the panel only refreshes via the 30s polling
    // cycle, so a "Call Waiter" press would take up to 30 seconds to
    // appear on the admin dashboard.
    const invalidateTelemetry = () => queryClient.invalidateQueries({ queryKey: ['admin', 'telemetry'] });
    useSocketEvent('request:new', invalidateTelemetry);
    useSocketEvent('request:updated', invalidateTelemetry);
    useSocketEvent('order:new', invalidateTelemetry);
    useSocketEvent('order:updated', invalidateTelemetry);

    return useQuery({
        queryKey: ['admin', 'telemetry', params],
        queryFn: () => api.get('/telemetry/stats', { params }).then(r => r.data),
        staleTime: 15_000,
        refetchInterval: 30_000,
        keepPreviousData: true,
        ...opts,
    });
}

/**
 * Historical business report — earnings (auto-bucketed) + most-selling
 * items for an arbitrary [from, to] date range. Powers the Reports page,
 * which is where a past month/week's numbers stay retrievable after the
 * live Dashboard cards have rolled over to the current period.
 *
 * @param {object} p
 * @param {string} p.from   — 'YYYY-MM-DD' inclusive start (omit → month start)
 * @param {string} p.to     — 'YYYY-MM-DD' inclusive end   (omit → today)
 * @param {string} p.branch — 'all' | branch id
 */
export function useReports({ from = '', to = '', branch = 'all' } = {}, opts = {}) {
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    if (branch && branch !== 'all') params.branch = branch;
    return useQuery({
        queryKey: ['admin', 'reports', { from, to, branch: branch || 'all' }],
        queryFn: () => api.get('/telemetry/reports', { params }).then(r => r.data),
        staleTime: 60_000,
        keepPreviousData: true,
        ...opts,
    });
}

/**
 * Future earnings forecast — linear trend + weekday seasonality over the
 * recent daily series. Powers the "Forecast" section of the business report
 * modal. Keyed by branch + horizon so switching either reuses cache.
 *
 * @param {object} p
 * @param {string} p.branch   — 'all' | branch id
 * @param {number} p.horizon  — days to project (default backend = 30)
 * @param {number} p.lookback — days of history to learn from (default 60)
 */
export function useForecast({ branch = 'all', horizon, lookback } = {}, opts = {}) {
    const params = {};
    if (branch && branch !== 'all') params.branch = branch;
    if (horizon) params.horizon = horizon;
    if (lookback) params.lookback = lookback;
    return useQuery({
        queryKey: ['admin', 'forecast', { branch: branch || 'all', horizon: horizon || 'def', lookback: lookback || 'def' }],
        queryFn: () => api.get('/telemetry/forecast', { params }).then(r => r.data),
        staleTime: 5 * 60_000,
        keepPreviousData: true,
        ...opts,
    });
}

/**
 * Combined live + recent-past orders for the admin Live / Takeaway tabs.
 * Server-side Promise.all is faster than two client round trips, then we
 * dedupe by _id (today's served rows appear in BOTH endpoints — the live
 * `servedToday` list and the past archive). Without dedup, "Completed
 * Today" stat cards double-count.
 *
 * @param {object} params
 * @param {string} params.branch — `'all'` | branch id. Empty string is
 *                                 treated as `'all'` to keep callers tidy.
 */
export function useAdminDineInArchive({ branch = 'all' } = {}, opts = {}) {
    const branchParam = branch && branch !== 'all' ? { branch } : {};
    return useQuery({
        queryKey: ['admin', 'orders', 'dine-archive', branch || 'all'],
        queryFn: async () => {
            const [live, past] = await Promise.all([
                api.get('/orders/live', { params: branchParam }),
                api.get('/orders/past', { params: { ...branchParam, limit: 200 } }),
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
        refetchInterval: 60_000,
        keepPreviousData: true,
        ...opts,
    });
}

/**
 * Paginated archive query for the Past tab. Each filter combo gets its
 * own cache entry so flipping back to a previous page is instant. The
 * server returns `{ orders, summary, pagination }` — we hand the whole
 * object back so the consumer can read all three.
 */
export function usePastOrdersPage({
    page = 1,
    limit = 8,
    branch = 'all',
    status = '',
    dateRange = '',
    search = '',
} = {}, opts = {}) {
    const params = { page, limit };
    if (branch && branch !== 'all') params.branch = branch;
    if (status) params.status = status;
    if (dateRange) params.dateRange = dateRange;
    if (search) params.search = search;
    return useQuery({
        // Active branch too — the api interceptor adds it to the request
        // when `branch` isn't passed explicitly.
        queryKey: ['admin', 'orders', 'past-page', params, { branch: getAdminBranchKey() }],
        queryFn: () => api.get('/orders/past', { params }).then(r => r.data),
        staleTime: 15_000,
        keepPreviousData: true,
        ...opts,
    });
}

/**
 * Inventory items + summary in one query. Same pattern as the other
 * admin lists — keyed by filters so flipping back to a previous filter
 * combo paints from cache. Server returns `{ items, pagination }` for
 * the items endpoint and `{ summary }` for the summary endpoint; we
 * merge them into one shape so consumers read both off `data`.
 */
export function useInventoryList({
    page = 1,
    limit = 10,
    search = '',
    category = 'All',
    status = 'all',
    sortBy = '',
    sortOrder = '',
} = {}, opts = {}) {
    const params = { page, limit };
    if (search) params.search = search;
    if (category && category !== 'All') params.category = category;
    if (status && status !== 'all') params.status = status;
    if (sortBy) { params.sortBy = sortBy; params.sortOrder = sortOrder; }
    return useQuery({
        queryKey: ['admin', 'inventory', 'list', params, { branch: getAdminBranchKey() }],
        queryFn: async () => {
            const [itemsRes, summaryRes] = await Promise.all([
                api.get('/inventory', { params }),
                api.get('/inventory/summary'),
            ]);
            return {
                items: itemsRes.data?.items ?? [],
                pagination: itemsRes.data?.pagination ?? { page: 1, limit, total: 0, pages: 1 },
                summary: summaryRes.data?.summary ?? null,
            };
        },
        staleTime: 30_000,
        keepPreviousData: true,
        ...opts,
    });
}

/**
 * Branch list (multi-location tenants only). Single-location tenants
 * get a 403 FEATURE_LOCKED — we mark `_silent` so the interceptor
 * doesn't toast it, and treat the empty array as "single location".
 */
export function useBranches(opts = {}) {
    return useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: () => api.get('/branches', { _silent: true })
            .then(r => r.data?.data ?? [])
            .catch(() => []),
        staleTime: 10 * 60_000,
        retry: false,
        ...opts,
    });
}

/**
 * Imperative invalidation helpers, for cases where a mutation lives
 * far from the query (e.g. a modal in a different tree). Saves callers
 * from importing useQueryClient + adminKeys directly.
 */
export function useAdminInvalidator() {
    const qc = useQueryClient();
    return {
        all:          () => qc.invalidateQueries({ queryKey: adminKeys.all }),
        tables:       () => qc.invalidateQueries({ queryKey: adminKeys.tables }),
        areas:        () => qc.invalidateQueries({ queryKey: adminKeys.areas }),
        reservations: () => qc.invalidateQueries({ queryKey: adminKeys.reservations }),
        staff:        () => qc.invalidateQueries({ queryKey: adminKeys.staff }),
        settings:     () => qc.invalidateQueries({ queryKey: adminKeys.settings }),
        orders:       () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }),
    };
}
