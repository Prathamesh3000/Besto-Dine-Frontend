import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { useBranches } from '../hooks/queries/adminQueries';

/**
 * AdminBranchContext — manages the branch selection state for the admin panel.
 *
 * Design (2026-05-20 — user's "tenant owner = Main branch admin" rule):
 *
 * - **Tenant owner** (admin/manager with no `user.branch` pin) effectively
 *   runs the Main branch — that's where their day-to-day work happens.
 *   The switcher therefore defaults to Main's `_id` on first load. From
 *   the dropdown they can switch into any sub-branch to view that
 *   branch's data (cross-branch visibility), or pick "All Branches"
 *   for a tenant-wide merged view. The previous default of `null` =
 *   "All Branches" hid the leak that legacy tenant-level records were
 *   surfacing in every branch's view — once Main was the default the
 *   user's mental model finally matched what they saw on screen.
 *
 * - **Branch-pinned Admin/Manager** is locked to their assigned branch
 *   (set during login). No dropdown, `isLocked = true`; the JWT pin is
 *   server-authoritative.
 *
 * - Pages don't need to read `branchQueryParam` explicitly anymore — the
 *   global axios interceptor in [utils/api.js](Frontend/src/utils/api.js)
 *   reads `localStorage.adminActiveBranch` (persisted from here) and
 *   injects `?branch=<id>` on every authenticated GET.
 */
const AdminBranchContext = createContext(null);

const ADMIN_LIKE_ROLES = ['admin', 'manager'];

// Persisted across reloads so the picker doesn't reset to "All branches"
// on every refresh AND so api.js's global request interceptor can read
// it and inject `?branch=<id>` on every staff request automatically —
// without that, every admin page would need to thread branchQueryParam
// by hand and we'd keep finding leaks where someone forgot.
const STORAGE_KEY = 'adminActiveBranch';
// Separate flag — tracks whether the tenant owner has consciously picked
// a value (including the "All Branches" null choice) so the
// default-to-Main effect doesn't keep overriding their explicit pick.
// Without this, picking "All Branches" would silently flip back to Main
// on the next render because both states read as falsy from storage.
const PICKED_FLAG_KEY = 'adminBranchPicked';

function readStoredBranchId() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        // Accept either a bare id or { _id, ... }. Defensive — early
        // dev builds stored the full branch blob.
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string') return parsed;
        return parsed?._id || null;
    } catch {
        return null;
    }
}

function writeStoredBranchId(id) {
    try {
        if (id) localStorage.setItem(STORAGE_KEY, JSON.stringify(id));
        else localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore quota / private mode */ }
}

function readPickedFlag() {
    try { return localStorage.getItem(PICKED_FLAG_KEY) === '1'; } catch { return false; }
}

function writePickedFlag(flag) {
    try {
        if (flag) localStorage.setItem(PICKED_FLAG_KEY, '1');
        else localStorage.removeItem(PICKED_FLAG_KEY);
    } catch { /* ignore */ }
}

export function AdminBranchProvider({ children }) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [selectedBranchId, _setSelectedBranchId] = useState(() => readStoredBranchId());
    const [hasPicked, setHasPicked] = useState(() => readPickedFlag());

    // Wrap setSelectedBranchId so we record that the user has made an
    // explicit choice. The default-to-Main effect below checks this
    // flag and stops auto-overriding once it's true.
    const setSelectedBranchId = useCallback((value) => {
        // Persist synchronously (not only in the effect below): child
        // queries fire their fetches before the provider's effect runs,
        // and both the api interceptor and the branch-scoped admin query
        // keys read this slot — writing late would fetch the OLD branch
        // under the NEW branch's cache key.
        writeStoredBranchId(value);
        _setSelectedBranchId(value);
        setHasPicked(true);
        writePickedFlag(true);
    }, []);

    // Branch-pinned admin/manager is locked to their branch (set during login)
    const isLocked = !!(user?.branch && ADMIN_LIKE_ROLES.includes(user?.role));
    const lockedBranchId = user?.branch?._id || null;
    const lockedBranchName = user?.branch?.name || '';

    // Branches come from the shared TanStack Query so we don't double-
    // fetch alongside any page that also uses useBranches(). The query
    // dedupes on its ['admin','branches'] key and caches for 10 min.
    // We only "enable" the fetch for admin-like roles so customer / staff
    // contexts that mount the provider don't trigger an unnecessary call.
    const isAdminLike = ADMIN_LIKE_ROLES.includes(user?.role);
    const { data: branches = [], isLoading: loading } = useBranches({
        enabled: isAdminLike,
    });

    // Preserve the old imperative refetch hook for any caller that still
    // wants to force-refresh the branches list. Routes via React Query so
    // it shares the dedup + cache invalidation path with useBranches().
    const fetchBranches = useCallback(() => {
        return queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
    }, [queryClient]);

    // Default tenant owners (unpinned admin/manager) to the Main branch
    // on first load. Tenant owner acts as Main's admin by design — every
    // other branch has its own Branch Admin. The switcher dropdown then
    // lets them OPTIONALLY switch into a sub-branch or "All Branches"
    // for cross-branch reporting. Once the user has picked anything
    // explicitly (including "All Branches" → null), `hasPicked` is
    // true and we stop auto-overriding.
    useEffect(() => {
        if (isLocked) return;                     // pinned: pin wins
        if (hasPicked) return;                    // user already chose
        if (selectedBranchId) return;             // already a value
        if (!branches.length) return;             // waiting on /branches
        const main = branches.find(b => b.slug === 'main');
        if (main) {
            // Set directly via internal setter so we don't flip
            // `hasPicked` — this is the system default, not a user pick.
            writeStoredBranchId(main._id);
            _setSelectedBranchId(main._id);
        }
    }, [isLocked, hasPicked, selectedBranchId, branches]);

    // Branch-pinned admins ignore the persisted switcher value; their
    // pin wins. For unpinned tenant owners, persist the selection so a
    // page refresh keeps the same scoped view AND the global API
    // interceptor can read it on every request.
    useEffect(() => {
        if (isLocked) return;
        writeStoredBranchId(selectedBranchId);
    }, [selectedBranchId, isLocked]);

    // Clear the persisted value AND the "has picked" flag the moment
    // the user signs out so the next sign-in re-runs the Main-default
    // logic, and a stale value from a previous session doesn't get
    // injected into login requests.
    useEffect(() => {
        if (!user) {
            writeStoredBranchId(null);
            writePickedFlag(false);
            setHasPicked(false);
        }
    }, [user]);

    // The actual branch ID to filter by
    const activeBranchId = isLocked ? lockedBranchId : selectedBranchId;

    // Resolve the Main branch id so callers can tell whether the user
    // is currently viewing Main or a sub-branch.
    const mainBranch = branches.find(b => b.slug === 'main') || null;
    const mainBranchId = mainBranch?._id || null;

    // CROSS-BRANCH READ-ONLY MODE (2026-05-20)
    // ----------------------------------------
    // Only the tenant owner (unpinned admin/manager) sees the switcher.
    // When they pick a SUB-branch from it, they're "peeking" at that
    // branch's dashboard — they should NOT be allowed to edit anything
    // there. Each sub-branch has its own Branch Admin for day-to-day
    // operations. The owner stays in full edit mode only at their home
    // (Main) branch.
    //
    // This flag is true when:
    //   - the user is the unpinned tenant owner (no JWT branch pin)
    //   - they have explicitly picked a branch
    //   - that branch is NOT Main
    //
    // The AdminLayout reads it and hides every nav tab except Dashboard.
    // Pages can also read it to disable mutations as a belt-and-braces
    // measure (the backend's strict per-branch filter is the real gate).
    const isCrossBranchReadOnly = !isLocked
        && !!activeBranchId
        && !!mainBranchId
        && String(activeBranchId) !== String(mainBranchId);

    // Query param object to spread into API calls
    // null = "All branches" → send ?branch=all
    // string = specific branch → send ?branch=<id>
    const branchQueryParam = activeBranchId
        ? { branch: activeBranchId }
        : {};

    return (
        <AdminBranchContext.Provider value={{
            branches,
            selectedBranchId: activeBranchId,
            setSelectedBranchId: isLocked ? () => {} : setSelectedBranchId,
            branchQueryParam,
            isLocked,
            lockedBranchName,
            mainBranchId,
            isCrossBranchReadOnly,
            loading,
            refetchBranches: fetchBranches,
        }}>
            {children}
        </AdminBranchContext.Provider>
    );
}

export function useAdminBranch() {
    const ctx = useContext(AdminBranchContext);
    if (!ctx) {
        // Fallback for pages rendered outside the provider
        return {
            branches: [],
            selectedBranchId: null,
            setSelectedBranchId: () => {},
            branchQueryParam: {},
            isLocked: false,
            lockedBranchName: '',
            mainBranchId: null,
            isCrossBranchReadOnly: false,
            loading: false,
            refetchBranches: () => {},
        };
    }
    return ctx;
}

export default AdminBranchContext;
