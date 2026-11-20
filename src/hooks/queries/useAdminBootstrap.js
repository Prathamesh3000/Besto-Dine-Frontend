import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '../../utils/api';
import { adminKeys } from './queryKeys';
import useSocketEvent from '../useSocketEvent';
import { useAdminBranch } from '../../Context/AdminBranchContext';
import { ingestTableTimerMeta } from '../useServerClock';

/**
 * Optimistic table-status patch from a `table:updated` socket payload
 * ({ tableId, status }) so the Tables grid flips Free ⇄ Occupied the
 * instant the event lands, before the refetch returns. Only the two
 * occupancy states are patched (other statuses — merged, reserved,
 * disabled — wait for the refetch). Freeing a table also drops its merge
 * link / active order, mirroring the server (freeTableOrUnmergeGroup).
 * Pure; returns the same array when nothing changed.
 */
export function patchTableStatus(tables, payload) {
    if (!Array.isArray(tables) || !payload?.tableId) return tables;
    const { tableId, status } = payload;
    if (status !== 'free' && status !== 'occupied') return tables;
    let changed = false;
    const next = tables.map((t) => {
        if (!t || String(t._id) !== String(tableId)) return t;
        // A scan on a merged sibling reports 'occupied' — keep 'merged'.
        if (status === 'occupied' && (t.status === 'merged' || t.status === 'disabled')) return t;
        if (status === 'free' && t.status === 'disabled') return t;
        const alreadyThere = t.status === status
            && (status !== 'free' || !(Array.isArray(t.mergedWith) && t.mergedWith.length));
        if (alreadyThere) return t;
        changed = true;
        return status === 'free'
            ? { ...t, status: 'free', mergedWith: [], activeOrder: null }
            : { ...t, status: 'occupied' };
    });
    return changed ? next : tables;
}

/**
 * Table-timer socket patch: set (startedAt) or clear (null) one table's
 * sessionStartedAt. Pure; returns the same array when nothing changed. The
 * `table:updated` refetch that follows corrects a merged group's earliest start.
 */
export function patchTableTimer(tables, tableId, startedAt) {
    if (!Array.isArray(tables) || !tableId) return tables;
    let changed = false;
    const next = tables.map((t) => {
        if (!t || String(t._id) !== String(tableId)) return t;
        if ((t.sessionStartedAt || null) === (startedAt || null)) return t;
        changed = true;
        return { ...t, sessionStartedAt: startedAt || null };
    });
    return changed ? next : tables;
}

/**
 * Single round-trip first-paint loader for admin dashboards.
 *
 * Replaces the historical pattern:
 *   Promise.all([api.get('/tables'), api.get('/areas'), ...])
 *
 * with:
 *   const { data, isLoading } = useAdminBootstrap()
 *   const tables = data?.tables ?? []
 *
 * Benefits:
 * - Single network call → 5x faster perceived load on cold connections
 * - React Query cache: tab switches paint instantly from cache while
 *   a background refetch happens
 * - Per-section React Query cache writes — `useTables()` etc. read
 *   from the SAME cache, so a page that already has bootstrap data
 *   skips its own fetch on mount
 * - Socket events invalidate granularly (just `tables`, not everything)
 *
 * @param {object} options
 * @param {string[]} options.sections — which sections to load. Default = all.
 *                                      Skip sections a page doesn't need to
 *                                      shave a bit off the response time.
 * @param {boolean} options.enabled  — gate the query (e.g. wait for auth)
 */
export function useAdminBootstrap({ sections, enabled = true } = {}) {
    const queryClient = useQueryClient();

    // Branch switcher value (tenant owner) — null when "All branches"
    // is selected OR when no provider wraps this hook. Branch-pinned
    // admins ignore the switcher; the backend pin is authoritative.
    const { selectedBranchId } = useAdminBranch();

    const sectionList = sections && sections.length
        ? [...sections].sort()
        : null;

    const query = useQuery({
        // Cache key must include the selected branch so switching from
        // "All branches" to "Main" forces a fresh fetch instead of
        // serving stale all-branch data.
        queryKey: [
            ...(sectionList
                ? [...adminKeys.bootstrap, sectionList.join(',')]
                : adminKeys.bootstrap),
            selectedBranchId || 'all',
        ],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (sectionList) params.set('sections', sectionList.join(','));
            // Pass the switcher value to the backend so tables/areas/
            // reservations are scoped to the picked branch. Without this,
            // switching to "Main" still returned every branch's data —
            // the leak the user reported on 2026-05-20.
            if (selectedBranchId) params.set('branch', selectedBranchId);
            const qs = params.toString();
            const sentAt = Date.now();
            const res = await api.get(qs ? `/admin/bootstrap?${qs}` : '/admin/bootstrap');
            const receivedAt = Date.now();
            const data = res.data?.data ?? {};
            // Table timer: server clock offset + thresholds (admin/manager/
            // captain only; absent otherwise). Accept the fields at the top
            // level of the body or inside `data`; settings.tableTimer is the
            // fallback for thresholds.
            ingestTableTimerMeta({
                serverTime: res.data?.serverTime ?? data.serverTime,
                tableTimer: res.data?.tableTimer ?? data.tableTimer ?? data.settings?.tableTimer,
            }, sentAt, receivedAt);
            return data;
        },
        enabled,
        staleTime: 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 2,
    });

    // Hydrate per-section caches so individual `useTables` / `useAreas`
    // hooks elsewhere read instantly without a second fetch.
    useEffect(() => {
        if (!query.data) return;
        const { tables, areas, reservations, staff, settings } = query.data;
        if (tables) queryClient.setQueryData(adminKeys.tables, tables);
        if (areas) queryClient.setQueryData(adminKeys.areas, areas);
        if (reservations) queryClient.setQueryData(adminKeys.reservations, reservations);
        if (staff) queryClient.setQueryData(adminKeys.staff, staff);
        if (settings) queryClient.setQueryData(adminKeys.settings, settings);
    }, [query.data, queryClient]);

    // Real-time invalidation. We invalidate only the affected slice so
    // a single table update doesn't refetch reservations + staff + settings.
    // table:updated also patches the cached status first (instant
    // Free ⇄ Occupied flip on the grid and in an open drawer); the
    // invalidation then refetches the authoritative data.
    useSocketEvent('table:updated', (payload) => {
        if (payload?.tableId) {
            queryClient.setQueriesData({ queryKey: adminKeys.bootstrap }, (old) => {
                if (!old || !Array.isArray(old.tables)) return old;
                const tables = patchTableStatus(old.tables, payload);
                return tables === old.tables ? old : { ...old, tables };
            });
            queryClient.setQueriesData({ queryKey: adminKeys.tables }, (old) => patchTableStatus(old, payload));
        }
        queryClient.invalidateQueries({ queryKey: adminKeys.tables });
        queryClient.invalidateQueries({ queryKey: adminKeys.bootstrap });
    });
    // Table timer: start/stop patches sessionStartedAt immediately.
    const applyTimer = (tableId, startedAt) => {
        if (!tableId) return;
        queryClient.setQueriesData({ queryKey: adminKeys.bootstrap }, (old) => {
            if (!old || !Array.isArray(old.tables)) return old;
            const tables = patchTableTimer(old.tables, tableId, startedAt);
            return tables === old.tables ? old : { ...old, tables };
        });
        queryClient.setQueriesData({ queryKey: adminKeys.tables }, (old) => patchTableTimer(old, tableId, startedAt));
    };
    useSocketEvent('table:timer-started', (p) => applyTimer(p?.tableId, p?.startedAt));
    useSocketEvent('table:timer-stopped', (p) => applyTimer(p?.tableId, null));
    useSocketEvent('order:new', () => {
        queryClient.invalidateQueries({ queryKey: adminKeys.tables });
        queryClient.invalidateQueries({ queryKey: adminKeys.orders.live });
    });
    useSocketEvent('order:updated', () => {
        queryClient.invalidateQueries({ queryKey: adminKeys.tables });
        queryClient.invalidateQueries({ queryKey: adminKeys.orders.live });
    });
    useSocketEvent('settings:updated', () => {
        queryClient.invalidateQueries({ queryKey: adminKeys.settings });
        queryClient.invalidateQueries({ queryKey: adminKeys.bootstrap });
    });

    return query;
}
