import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import { getActiveTenant, getActiveTenantSlug, subscribeActiveTenant } from '../utils/tenant';
import { getToken } from '../utils/authStorage';
import { resolveImageUrl } from '../utils/image';
import { useMenuBootstrap, bumpMenuVersion } from '../hooks/queries/useMenuBootstrap';
import { getSocket, joinMenuRoom, leaveRoom, onSocketReconnect } from '../utils/socket';

const MenuContext = createContext(null);

// Flatten nutritionalInfo into top-level properties so components can
// read item.calories, item.protein, item.fats, item.fibre, item.carbs, item.iron
// directly — the backend stores them nested as item.nutritionalInfo.{field}.
//
// Also expose a singular `image` field. The backend stores menu media
// as `images: [String]` (multi-photo support) but most customer-facing
// surfaces — Home, Cart, Search, Orders, BillDetail — read
// `item.image`. Without normalising, those `<img src={item.image}>`
// renders get `undefined` and the picture silently breaks. We pick
// the first entry, route it through the centralised resolver so a
// `/uploads/...` value gets the backend host prepended, and fall
// through to any pre-set `item.image` for legacy/transformed callers.
function normalizeItem(item) {
    if (!item) return item;
    const n = item.nutritionalInfo || {};
    const firstImage = Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : null;
    return {
        ...item,
        image:    resolveImageUrl(firstImage) || resolveImageUrl(item.image) || item.image || '',
        calories: item.calories ?? n.calories ?? 0,
        protein:  item.protein  ?? n.protein  ?? 0,
        fats:     item.fats     ?? n.fat      ?? 0,  // backend uses "fat" (singular)
        fibre:    item.fibre    ?? n.fibre    ?? 0,
        carbs:    item.carbs    ?? n.carbs    ?? 0,
        iron:     item.iron     ?? n.iron     ?? 0,
    };
}

// ── Query key factories ─────────────────────────────────────────────────────
// Phase 1 SaaS: every cache key includes the active tenant slug so a
// customer who switches restaurants doesn't see stale items/categories
// from the previously-cached tenant. The slug is `'global'` when no
// tenant has been picked yet (legacy single-tenant fallback) so the
// keys still match across calls before branch selection.
const tenantScope = () => getActiveTenantSlug() || 'global';

const menuKeys = {
    all:        () => ['menu', tenantScope()],
    list:       (params) => ['menu', tenantScope(), 'list', params],
    combos:     () => ['combos', tenantScope()],
    comboList:  (params) => ['combos', tenantScope(), 'list', params],
    categories: () => ['categories', tenantScope()],
};

// True when the request interceptor has SOMETHING to identify the
// tenant: an activeTenant blob (customer/guest flow) OR a JWT in
// localStorage (staff flow — backend resolves tenant from
// req.user.restaurant). When neither exists — anonymous user sitting
// on /branch-selection — every menu/combo/category fetch would be
// rejected with 400 TENANT_REQUIRED, spamming the console with
// expected-noise errors. We gate the queries on this flag instead.
function readTenantContextPresence() {
    if (getActiveTenantSlug()) return true;
    try { return !!getToken(); } catch { return false; }
}

export function MenuProvider({ children }) {
    const queryClient = useQueryClient();

    // Phase 1 SaaS: when the customer switches restaurants, every cache
    // entry from the previous tenant must be invalidated. The tenant
    // slug is part of every queryKey above, so a clean cache reset is
    // enough — TanStack Query will refetch with the new key and the
    // backend will return the new tenant's data.
    useEffect(() => {
        const unsub = subscribeActiveTenant(() => {
            queryClient.removeQueries({ queryKey: ['menu'] });
            queryClient.removeQueries({ queryKey: ['combos'] });
            queryClient.removeQueries({ queryKey: ['categories'] });
        });
        return unsub;
    }, [queryClient]);

    // ── BUG #24 — live menu changes ─────────────────────────────────────
    // Admin stock / status edits emit a tenant-scoped `menu:updated` ping
    // (room `t:<restaurantId>:menu`). Staff sockets are auto-joined by the
    // server; customers join the public room for the tenant they picked.
    const [activeRestaurantId, setActiveRestaurantId] = useState(() => getActiveTenant()?._id || null);
    useEffect(() => subscribeActiveTenant(() => setActiveRestaurantId(getActiveTenant()?._id || null)), []);
    useEffect(() => {
        if (!activeRestaurantId) return undefined;
        const room = joinMenuRoom(activeRestaurantId);
        return () => leaveRoom(room);
    }, [activeRestaurantId]);

    const menuRefreshTimerRef = useRef(null);
    const refreshMenuFromServer = useCallback(() => {
        // Debounce: a bulk edit can fire many pings in a row.
        if (menuRefreshTimerRef.current) clearTimeout(menuRefreshTimerRef.current);
        menuRefreshTimerRef.current = setTimeout(() => {
            menuRefreshTimerRef.current = null;
            bumpMenuVersion(); // bypass the 60 s HTTP cache on menu-bootstrap
            queryClient.invalidateQueries({ queryKey: ['public', 'menu-bootstrap'] });
            queryClient.invalidateQueries({ queryKey: ['menu'] });
            queryClient.invalidateQueries({ queryKey: ['combos'] });
        }, 300);
    }, [queryClient]);
    useEffect(() => () => {
        if (menuRefreshTimerRef.current) clearTimeout(menuRefreshTimerRef.current);
    }, []);

    // Suppress menu/combo/category fetches until we have either a
    // picked tenant or a logged-in staff session — see
    // readTenantContextPresence for the rationale.
    const [hasTenantContext, setHasTenantContext] = useState(readTenantContextPresence);
    useEffect(() => {
        const update = () => setHasTenantContext(readTenantContextPresence());
        const unsubTenant = subscribeActiveTenant(update);
        // Cross-tab login/logout fires the 'storage' event — keep our
        // gate in sync so a token added in another tab unblocks fetches.
        window.addEventListener('storage', update);
        return () => {
            unsubTenant();
            window.removeEventListener('storage', update);
        };
    }, []);

    // Listen for menu pings only once there is a tenant context, so an
    // anonymous visitor on the landing page doesn't open a socket.
    const menuSocketEnabled = !!activeRestaurantId || hasTenantContext;
    useEffect(() => {
        if (!menuSocketEnabled) return undefined;
        const socket = getSocket();
        socket.on('menu:updated', refreshMenuFromServer);
        // Missed pings while offline → resync on reconnect (BUG #12).
        const offReconnect = onSocketReconnect(refreshMenuFromServer);
        return () => {
            socket.off('menu:updated', refreshMenuFromServer);
            offReconnect();
        };
    }, [menuSocketEnabled, refreshMenuFromServer]);

    // Customer-flow first-paint bundle. When a tenant slug is set but
    // the user is anonymous (no token) — i.e. a QR-scan customer — we
    // fire the single /public/menu-bootstrap call instead of the three
    // separate /menu, /combos, /categories fetches. The hook hydrates
    // the per-section caches via queryClient.setQueryData so the per-
    // section useQuery hooks below find warm data and skip their own
    // network calls.
    //
    // Staff dashboards (token present) skip bootstrap and keep using
    // the per-section fetches because they need fields the public
    // bootstrap doesn't return (status='archived' menu items, etc.).
    const isAnonymousCustomer = useMemo(() => {
        if (typeof window === 'undefined') return false;
        if (!getActiveTenantSlug()) return false;
        // Kiosk routes are guest-only by design — a stale staff token
        // from prior dev/QA usage on the same browser would otherwise
        // flip this to false and skip the public bootstrap, leaving
        // the kiosk Menu screen stuck on a spinner. Match the same
        // /kiosk skip-auth pattern used in AuthContext.jsx:62-63.
        const isKioskRoute = window.location.pathname.startsWith('/kiosk');
        if (isKioskRoute) return true;
        try { return !getToken(); } catch { return false; }
    }, [hasTenantContext]); // eslint-disable-line react-hooks/exhaustive-deps
    const {
        data: bootstrapData,
        isSuccess: bootstrapLanded,
        isError: bootstrapFailed,
    } = useMenuBootstrap({ enabled: isAnonymousCustomer });

    // Per-section queries fire when:
    //   - we have tenant context (existing rule), AND
    //   - we're NOT an anonymous customer that's still waiting for
    //     bootstrap (or whose bootstrap succeeded — its cache is warm)
    // Anonymous customer where bootstrap failed → fall back to per-
    // section fetches so the page still loads.
    const useBootstrapSource = isAnonymousCustomer && bootstrapLanded;
    const perSectionEnabled = hasTenantContext && (!isAnonymousCustomer || bootstrapFailed);

    // ══════════════════════════════════════════════════════════════════════════
    //  MENU ITEMS — default fetch via TanStack Query
    // ══════════════════════════════════════════════════════════════════════════

    const {
        data: defaultMenuData,
        isLoading: defaultMenuLoadingRaw,
        error: defaultMenuError,
    } = useQuery({
        queryKey: menuKeys.list({}),
        queryFn: async () => {
            // Customer / kiosk menu pages browse the WHOLE catalogue by
            // category — pagination would silently hide items past the
            // first 20 (the menu API's default limit), causing categories
            // with mostly-newer/less-popular items to look empty. Pull a
            // large slab in one shot; the admin Menu tab still uses
            // fetchMenuItems({ page, limit }) for its paginated view.
            const res = await api.get('/menu?limit=1000', { _isBackground: true });
            if (res.data.success) {
                return {
                    items: (res.data.data || []).map(normalizeItem),
                    pagination: {
                        totalItems: res.data.totalItems || res.data.count || 0,
                        totalPages: res.data.totalPages || 1,
                        currentPage: res.data.currentPage || 1,
                        pageSize: res.data.pageSize || 1000,
                    },
                };
            }
            return { items: [], pagination: { totalItems: 0, totalPages: 0, currentPage: 1, pageSize: 1000 } };
        },
        enabled: perSectionEnabled,
        staleTime: 5 * 60 * 1000, // 5 min (replaces sessionStorage TTL)
    });

    // When the customer flow uses bootstrap as the source, the per-section
    // useQuery is disabled — but the cache key still holds the data
    // bootstrap wrote via setQueryData. Read that out so the rest of
    // the provider works unchanged. Without this, anonymous customers
    // would see empty menu arrays despite a successful bootstrap.
    const bootstrapMenuItems = bootstrapData?.menu;
    const defaultMenuLoading = useBootstrapSource ? false : defaultMenuLoadingRaw;

    // Parameterized fetch state (for filtered/paginated queries from components)
    const [paramMenuItems, setParamMenuItems] = useState(null);
    const [paramMenuPagination, setParamMenuPagination] = useState(null);
    const [paramMenuLoading, setParamMenuLoading] = useState(false);
    const [paramMenuError, setParamMenuError] = useState(null);

    // Expose either parameterized results (if a filter is active), the
    // per-section query result, OR — for anonymous customers — the
    // bootstrap payload's menu slice. Bootstrap items are already
    // normalised on the backend (image, price), but we run them through
    // normalizeItem anyway to fold in nutritionalInfo into top-level
    // properties the same way the per-section path does.
    const menuItems = useMemo(() => {
        if (paramMenuItems) return paramMenuItems;
        if (useBootstrapSource && Array.isArray(bootstrapMenuItems)) {
            return bootstrapMenuItems.map(normalizeItem);
        }
        return defaultMenuData?.items ?? [];
    }, [paramMenuItems, useBootstrapSource, bootstrapMenuItems, defaultMenuData]);
    const menuLoading = paramMenuLoading || defaultMenuLoading;
    const menuError = paramMenuError || (defaultMenuError ? defaultMenuError.message : null);
    const menuPagination = useMemo(
        () => paramMenuPagination ?? defaultMenuData?.pagination ?? { totalItems: 0, totalPages: 0, currentPage: 1, pageSize: 20 },
        [paramMenuPagination, defaultMenuData]
    );

    const fetchMenuItems = useCallback(async (params = {}, append = false) => {
        const isDefault = Object.keys(params).length === 0;

        if (isDefault) {
            // Default fetch — just invalidate the TanStack Query cache
            setParamMenuItems(null);
            setParamMenuPagination(null);
            setParamMenuError(null);
            queryClient.invalidateQueries({ queryKey: menuKeys.list({}) });
            return;
        }

        // Parameterized fetch — still imperative for filtered/paginated calls
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') queryParams.append(k, v);
        });
        const qs = queryParams.toString();

        setParamMenuLoading(true);
        setParamMenuError(null);

        try {
            const res = await api.get(`/menu?${qs}`);
            if (res.data.success) {
                const newData = (res.data.data || []).map(normalizeItem);
                setParamMenuItems(prev => append ? [...(prev || []), ...newData] : newData);
                setParamMenuPagination({
                    totalItems: res.data.totalItems || res.data.count || 0,
                    totalPages: res.data.totalPages || 1,
                    currentPage: res.data.currentPage || 1,
                    pageSize: res.data.pageSize || 20,
                });
            }
        } catch (err) {
            setParamMenuError(err.response?.data?.message || 'Failed to fetch menu items');
        } finally {
            setParamMenuLoading(false);
        }
    }, [queryClient]);

    // ── Menu CRUD mutations ─────────────────────────────────────────────────
    const createMenuMutation = useMutation({
        mutationFn: (data) => api.post('/menu', data),
        onSuccess: (res) => {
            if (res.data.success) {
                queryClient.setQueryData(menuKeys.list({}), (old) => {
                    if (!old) return old;
                    return { ...old, items: [...old.items, normalizeItem(res.data.data)] };
                });
            }
        },
    });

    const updateMenuMutation = useMutation({
        mutationFn: ({ id, data }) => api.put(`/menu/${id}`, data),
        onSuccess: (res, { id }) => {
            if (res.data.success) {
                queryClient.setQueryData(menuKeys.list({}), (old) => {
                    if (!old) return old;
                    return { ...old, items: old.items.map(item => item._id === id ? normalizeItem(res.data.data) : item) };
                });
            }
        },
    });

    const deleteMenuMutation = useMutation({
        mutationFn: (id) => api.delete(`/menu/${id}`),
        onSuccess: (res, id) => {
            if (res.data.success) {
                queryClient.setQueryData(menuKeys.list({}), (old) => {
                    if (!old) return old;
                    return { ...old, items: old.items.filter(item => item._id !== id) };
                });
            }
        },
    });

    const createMenuItem = useCallback(async (data) => {
        const res = await createMenuMutation.mutateAsync(data);
        return res.data;
    }, [createMenuMutation]);

    const updateMenuItem = useCallback(async (id, data) => {
        const res = await updateMenuMutation.mutateAsync({ id, data });
        return res.data;
    }, [updateMenuMutation]);

    const deleteMenuItem = useCallback(async (id) => {
        const res = await deleteMenuMutation.mutateAsync(id);
        return res.data;
    }, [deleteMenuMutation]);

    const toggleMenuItemStatus = useCallback(async (id, currentStatus) => {
        const newStatus = currentStatus === 'active' ? 'archived' : 'active';
        const res = await updateMenuMutation.mutateAsync({ id, data: { status: newStatus } });
        return res.data;
    }, [updateMenuMutation]);

    // ══════════════════════════════════════════════════════════════════════════
    //  COMBOS — default fetch via TanStack Query
    // ══════════════════════════════════════════════════════════════════════════

    const {
        data: defaultComboData,
        isLoading: defaultComboLoadingRaw,
        error: defaultComboError,
    } = useQuery({
        queryKey: menuKeys.comboList({}),
        queryFn: async () => {
            const res = await api.get('/combos', { _isBackground: true });
            if (res.data.success) {
                return {
                    // Combo cards on the customer-facing flows reach for
                    // `combo.image` (singular). Backend stores them as
                    // `images: [String]`, so we surface the first entry
                    // here — same contract as normalizeItem above.
                    items: (res.data.data || []).map(normalizeItem),
                    pagination: {
                        totalItems: res.data.totalItems || res.data.count || 0,
                        totalPages: res.data.totalPages || 1,
                        currentPage: res.data.currentPage || 1,
                        pageSize: res.data.pageSize || 20,
                    },
                };
            }
            return { items: [], pagination: { totalItems: 0, totalPages: 0, currentPage: 1, pageSize: 20 } };
        },
        enabled: perSectionEnabled,
        staleTime: 5 * 60 * 1000,
    });

    const bootstrapCombos = bootstrapData?.combos;
    const defaultComboLoading = useBootstrapSource ? false : defaultComboLoadingRaw;

    const [paramCombos, setParamCombos] = useState(null);
    const [paramComboPagination, setParamComboPagination] = useState(null);
    const [paramComboLoading, setParamComboLoading] = useState(false);
    const [paramComboError, setParamComboError] = useState(null);

    const combos = useMemo(() => {
        if (paramCombos) return paramCombos;
        if (useBootstrapSource && Array.isArray(bootstrapCombos)) {
            return bootstrapCombos.map(normalizeItem);
        }
        return defaultComboData?.items ?? [];
    }, [paramCombos, useBootstrapSource, bootstrapCombos, defaultComboData]);
    const comboLoading = paramComboLoading || defaultComboLoading;
    const comboError = paramComboError || (defaultComboError ? defaultComboError.message : null);
    const comboPagination = useMemo(
        () => paramComboPagination ?? defaultComboData?.pagination ?? { totalItems: 0, totalPages: 0, currentPage: 1, pageSize: 20 },
        [paramComboPagination, defaultComboData]
    );

    const fetchCombos = useCallback(async (params = {}, append = false) => {
        const isDefault = Object.keys(params).length === 0;

        if (isDefault) {
            setParamCombos(null);
            setParamComboPagination(null);
            setParamComboError(null);
            queryClient.invalidateQueries({ queryKey: menuKeys.comboList({}) });
            return;
        }

        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v !== undefined && v !== null && v !== '') queryParams.append(k, v);
        });
        const qs = queryParams.toString();

        setParamComboLoading(true);
        setParamComboError(null);

        try {
            const res = await api.get(`/combos?${qs}`);
            if (res.data.success) {
                const newData = res.data.data || [];
                setParamCombos(prev => append ? [...(prev || []), ...newData] : newData);
                setParamComboPagination({
                    totalItems: res.data.totalItems || res.data.count || 0,
                    totalPages: res.data.totalPages || 1,
                    currentPage: res.data.currentPage || 1,
                    pageSize: res.data.pageSize || 20,
                });
            }
        } catch (err) {
            setParamComboError(err.response?.data?.message || 'Failed to fetch combos');
        } finally {
            setParamComboLoading(false);
        }
    }, [queryClient]);

    // ── Combo CRUD mutations ────────────────────────────────────────────────
    const createComboMutation = useMutation({
        mutationFn: (data) => api.post('/combos', data),
        onSuccess: (res) => {
            if (res.data.success) {
                queryClient.setQueryData(menuKeys.comboList({}), (old) => {
                    if (!old) return old;
                    return { ...old, items: [...old.items, res.data.data] };
                });
            }
        },
    });

    const updateComboMutation = useMutation({
        mutationFn: ({ id, data }) => api.put(`/combos/${id}`, data),
        onSuccess: (res, { id }) => {
            if (res.data.success) {
                queryClient.setQueryData(menuKeys.comboList({}), (old) => {
                    if (!old) return old;
                    return { ...old, items: old.items.map(c => c._id === id ? res.data.data : c) };
                });
            }
        },
    });

    const deleteComboMutation = useMutation({
        mutationFn: (id) => api.delete(`/combos/${id}`),
        onSuccess: (res, id) => {
            if (res.data.success) {
                queryClient.setQueryData(menuKeys.comboList({}), (old) => {
                    if (!old) return old;
                    return { ...old, items: old.items.filter(c => c._id !== id) };
                });
            }
        },
    });

    const createCombo = useCallback(async (data) => {
        const res = await createComboMutation.mutateAsync(data);
        return res.data;
    }, [createComboMutation]);

    const updateCombo = useCallback(async (id, data) => {
        const res = await updateComboMutation.mutateAsync({ id, data });
        return res.data;
    }, [updateComboMutation]);

    const deleteCombo = useCallback(async (id) => {
        const res = await deleteComboMutation.mutateAsync(id);
        return res.data;
    }, [deleteComboMutation]);

    const toggleComboStatus = useCallback(async (id, currentStatus) => {
        const newStatus = currentStatus === 'active' ? 'archived' : 'active';
        const res = await updateComboMutation.mutateAsync({ id, data: { status: newStatus } });
        return res.data;
    }, [updateComboMutation]);

    // ══════════════════════════════════════════════════════════════════════════
    //  CATEGORIES — via TanStack Query
    // ══════════════════════════════════════════════════════════════════════════

    const { data: categoriesData = [], isLoading: categoriesLoadingRaw } = useQuery({
        queryKey: menuKeys.categories(),
        queryFn: async () => {
            const res = await api.get('/categories?status=active', { _isBackground: true });
            if (res.data.success) return res.data.data || [];
            return [];
        },
        enabled: perSectionEnabled,
        staleTime: 5 * 60 * 1000,
    });

    // Anonymous customers consume the bootstrap categories; staff and
    // admin pages keep using the per-section query result.
    const bootstrapCategories = bootstrapData?.categories;
    const rawCategories = useBootstrapSource && Array.isArray(bootstrapCategories)
        ? bootstrapCategories
        : categoriesData;
    // Resolve category.image through the same defensive URL repair as
    // menu items so a corrupted `https://hosthttps//cdn.com/...` value
    // doesn't trigger DNS-failure renders on the customer category grid.
    const categories = useMemo(
        () => rawCategories.map((c) => c ? { ...c, image: resolveImageUrl(c.image) || c.image || '' } : c),
        [rawCategories]
    );
    // Categories may arrive via bootstrap (anonymous customer flow) OR
    // the per-section query. Either path satisfies "loaded".
    const categoriesLoading = useBootstrapSource ? false : categoriesLoadingRaw;

    const fetchCategories = useCallback(async (force = false) => {
        if (force) {
            queryClient.invalidateQueries({ queryKey: menuKeys.categories() });
        }
        // No-op for non-force calls — TanStack Query serves from cache
    }, [queryClient]);

    // ─── Upload helper ────────────────────────────────────────────────────────
    const uploadImage = useCallback(async (file) => {
        const formData = new FormData();
        formData.append('image', file);
        const res = await api.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        if (res.data.success) {
            // /upload returns a full Cloudinary URL — resolveImageUrl
            // passes absolute URLs through untouched and only prepends the
            // host for legacy /uploads/ paths. Prepending the host blindly
            // (the old bug) produced a corrupt "http://host…https://…" URL.
            return resolveImageUrl(res.data.url) || res.data.url;
        }
        throw new Error('Upload failed');
    }, []);

    // ─── Force refresh — invalidates all TanStack Query caches ──────────────
    // Call this after admin create/edit/delete so customers see fresh data.
    const refreshAll = useCallback(() => {
        setParamMenuItems(null);
        setParamMenuPagination(null);
        setParamCombos(null);
        setParamComboPagination(null);
        queryClient.invalidateQueries({ queryKey: menuKeys.all() });
        queryClient.invalidateQueries({ queryKey: menuKeys.combos() });
        queryClient.invalidateQueries({ queryKey: menuKeys.categories() });
    }, [queryClient]);

    const value = useMemo(() => ({
        // Menu Items
        menuItems,
        menuLoading,
        menuError,
        menuPagination,
        fetchMenuItems,
        createMenuItem,
        updateMenuItem,
        deleteMenuItem,
        toggleMenuItemStatus,

        // Combos
        combos,
        comboLoading,
        comboError,
        comboPagination,
        fetchCombos,
        createCombo,
        updateCombo,
        deleteCombo,
        toggleComboStatus,

        // Shared
        categories,
        categoriesLoading,
        fetchCategories,
        uploadImage,
        refreshAll,
    }), [
        menuItems, menuLoading, menuError, menuPagination,
        combos, comboLoading, comboError, comboPagination,
        categories, categoriesLoading,
        fetchMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, toggleMenuItemStatus,
        fetchCombos, createCombo, updateCombo, deleteCombo, toggleComboStatus,
        fetchCategories, uploadImage, refreshAll,
    ]);

    return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function useMenu() {
    const ctx = useContext(MenuContext);
    if (!ctx) throw new Error('useMenu must be used within a <MenuProvider>');
    return ctx;
}

export default MenuContext;
