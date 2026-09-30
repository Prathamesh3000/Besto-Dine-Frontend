import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import api from '../../utils/api';
import { getActiveTenantSlug, getActiveBranchId, subscribeActiveTenant } from '../../utils/tenant';

/**
 * Single round-trip first-paint loader for the customer menu page.
 *
 * Replaces the historical chain of:
 *   /menu, /combos, /categories, /settings, /promotions, /promotions/coupons/active
 *
 * with one request to /public/menu-bootstrap. Server-side Promise.allSettled
 * keeps any single slow / failing collection from killing the whole
 * response.
 *
 * Cache rationale:
 * - The endpoint is `/public/*`, served with `Cache-Control: public,
 *   max-age=60, stale-while-revalidate=300`. The browser HTTP cache
 *   will short-circuit network calls inside the 60s window even
 *   without React Query.
 * - React Query layered on top means tab switches paint instantly
 *   from the in-memory cache, then quietly revalidate.
 * - Hydrates per-section caches (`['menu', slug, 'list', {}]` etc.)
 *   so the existing MenuContext queries see warm data instead of
 *   re-fetching.
 *
 * Tenant safety: queryKey includes (slug, branch) so a customer who
 * switches restaurants doesn't see stale items from the previous one.
 */
// BUG #24 — bumped when a `menu:updated` socket ping arrives. The endpoint
// is served with `Cache-Control: max-age=60`, so a plain refetch could be
// answered from the browser HTTP cache with the stale (still in-stock)
// item. Adding `_v=<n>` to the URL forces a fresh network fetch.
let menuVersion = 0;
export function bumpMenuVersion() {
    menuVersion += 1;
    return menuVersion;
}

export function useMenuBootstrap({ enabled = true } = {}) {
    const queryClient = useQueryClient();

    // Use the same tenant signals MenuContext does. Without them the
    // bootstrap fires on /branch-selection (no slug) and 400s.
    const slug = getActiveTenantSlug();
    const branchId = getActiveBranchId();

    // When the customer switches tenants, drop every cached bootstrap
    // entry — same pattern MenuContext uses.
    useEffect(() => {
        const unsub = subscribeActiveTenant(() => {
            queryClient.removeQueries({ queryKey: ['public', 'menu-bootstrap'] });
        });
        return unsub;
    }, [queryClient]);

    // Kiosk routes consume the same bootstrap but want only kiosk-
    // eligible categories (admin per-category `showOnKiosk` toggle).
    // Detect once at call time — the queryKey includes the flag so a
    // user who somehow lands on /kiosk and then a regular customer
    // page in the same browser session doesn't share the filtered
    // cache.
    const isKioskRoute = typeof window !== 'undefined'
        && window.location.pathname.startsWith('/kiosk');

    const query = useQuery({
        queryKey: ['public', 'menu-bootstrap', slug || 'none', branchId || 'tenant', isKioskRoute ? 'kiosk' : 'std'],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (slug) params.set('slug', slug);
            if (branchId) params.set('branch', branchId);
            if (isKioskRoute) params.set('kiosk', 'true');
            if (menuVersion > 0) params.set('_v', String(menuVersion));
            // _isBackground keeps the global error toast quiet on cold-Atlas
            // timeouts — React Query will retry, and a one-off timeout
            // shouldn't pop a red banner.
            const res = await api.get(`/public/menu-bootstrap?${params.toString()}`, {
                _isBackground: true,
            });
            return res.data?.data ?? null;
        },
        enabled: enabled && !!slug,
        staleTime: 60 * 1000,
        retry: 2,
    });

    // Hydrate per-section caches so MenuContext's own useQuery hooks
    // (`['menu', slug, 'list', {}]`, `['combos', ...]`, `['categories', ...]`)
    // see warm data and skip their own fetches on the next render. We
    // shape each cache write to match what MenuContext expects.
    useEffect(() => {
        if (!query.data || !slug) return;
        const tenantScope = slug || 'global';
        const { menu, combos, categories } = query.data;
        if (Array.isArray(menu)) {
            queryClient.setQueryData(['menu', tenantScope, 'list', {}], {
                items: menu,
                pagination: {
                    totalItems: menu.length,
                    totalPages: 1,
                    currentPage: 1,
                    pageSize: menu.length,
                },
            });
        }
        if (Array.isArray(combos)) {
            queryClient.setQueryData(['combos', tenantScope, 'list', {}], {
                items: combos,
                pagination: {
                    totalItems: combos.length,
                    totalPages: 1,
                    currentPage: 1,
                    pageSize: combos.length,
                },
            });
        }
        if (Array.isArray(categories)) {
            queryClient.setQueryData(['categories', tenantScope], categories);
        }
    }, [query.data, slug, queryClient]);

    return query;
}
