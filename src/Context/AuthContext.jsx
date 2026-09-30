import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';

import api from '../utils/api';
import { disconnectSocket, reconnectWithAuth } from '../utils/socket';
import { isGuestSessionExpired, clearGuestSession } from '../utils/guestSession';
import {
    currentAudience, audienceForUser, setEntryAudience, userStorageKey, getStoredUserObject,
    setTabIdentity, clearTabIdentity, STAFF_SIDE_AUDIENCES,
    getToken, getRefreshToken, getStoredUser, setAuth, setStoredUser, clearAuth,
} from '../utils/authStorage';
import { claimCustomerData, clearCustomerPersonalData } from '../utils/customerSession';
import SessionChangedOverlay from '../Components/Common/SessionChangedOverlay';

const userIdOf = (u) => (u && (u._id || u.id) ? String(u._id || u.id) : null);

// CRIT-25 — cross-tab logout via BroadcastChannel. When any tab logs
// out, the others drop their auth state too. Guarded for SSR / old
// browsers with a stub that swallows postMessage.
const AUTH_CHANNEL = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('bestodine-auth')
    : { postMessage() {}, addEventListener() {}, removeEventListener() {} };

const AuthContext = createContext(null);

// All possible roles in the app
export const USER_ROLES = {
    WAITER: 'waiter',
    CAPTAIN: 'captain',
    CUSTOMER: 'customer',
    ADMIN: 'admin',
    MANAGER: 'manager',
    CHEF: 'chef',
    SUPERADMIN: 'superadmin',
};

// Convenience role groups. Manager is grouped with Admin because per
// the staff matrix it's treated like an admin for routing + page-
// level access; tenant-owner-only operations (billing, branch CRUD)
// stay gated by the `isTenantOwner` flag, not by role.
export const ADMIN_ROLES = [USER_ROLES.ADMIN, USER_ROLES.MANAGER];
export const STAFF_ROLES = [USER_ROLES.WAITER, USER_ROLES.CAPTAIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER];
export const CAPTAIN_ROLES = [USER_ROLES.CAPTAIN, USER_ROLES.ADMIN, USER_ROLES.MANAGER];
export const CUSTOMER_ROLES = [USER_ROLES.CUSTOMER];
export const CHEF_ROLES = [USER_ROLES.CHEF, USER_ROLES.ADMIN, USER_ROLES.MANAGER];
export const SUPERADMIN_ROLES = [USER_ROLES.SUPERADMIN];
export const ALL_AUTH_ROLES = [...STAFF_ROLES, ...CUSTOMER_ROLES, USER_ROLES.CHEF, USER_ROLES.SUPERADMIN];

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isGuest, setIsGuest] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    // Audience ('platform' | 'staff' | 'customer', see utils/authStorage)
    // whose stored session the in-memory `user` came from. Every write
    // back (profile refresh, logout, password change) targets it, so a
    // tab never touches another audience's keys.
    const [audience, setAudienceState] = useState(null);
    const audRef = useRef(null);
    const userRef = useRef(null);
    // Set when another tab changed / cleared this tab's session:
    // { kind: 'switched' | 'signedOut', audience, user? }.
    const [sessionChange, setSessionChange] = useState(null);

    const setAudience = useCallback((aud) => {
        audRef.current = aud || null;
        setAudienceState(aud || null);
    }, []);

    useEffect(() => { userRef.current = user; }, [user]);

    // Restore session on mount
    useEffect(() => {
        // Migrate legacy 'cafeUser' key to 'user' on first load, then remove it.
        // (Customer-flow only — 'cafeUser' predates the staff/customer split.)
        if (currentAudience() === 'customer') {
            const legacyCafeUser = localStorage.getItem('cafeUser');
            if (legacyCafeUser && !localStorage.getItem('user')) {
                localStorage.setItem('user', legacyCafeUser);
            }
            localStorage.removeItem('cafeUser');
        }
        // Read the token/user for THIS tab's audience (platform / staff /
        // customer) so a chef logged in another tab can't hydrate the
        // customer tab, nor a hotel admin the Super Admin tab — they live
        // under separate storage keys now.
        const aud = currentAudience();
        const storedUser = getStoredUser(aud);
        const token = getToken(aud);

        // Kiosk routes are guest-only and shared between many customers.
        // Honoring a stale staff/customer token from a previous session
        // would (a) leak that user into the kiosk, (b) trigger
        // /auth/me + notification polling we don't need on a public
        // terminal. Skip auth hydration entirely on /kiosk paths so the
        // kiosk stays a clean anonymous device.
        const isKioskRoute = typeof window !== 'undefined'
            && window.location.pathname.startsWith('/kiosk');

        if (storedUser && token && !isKioskRoute) {
            try {
                const parsedUser = JSON.parse(storedUser);
                // Unstamped customer cache is what this user was already
                // seeing, so adopt it; wipe it if another account owns it.
                if (aud === 'customer' && parsedUser?.role === 'customer') {
                    claimCustomerData(parsedUser._id || parsedUser.id, { keepUnowned: true });
                }
                setAudience(aud);
                setTabIdentity(aud, parsedUser);
                userRef.current = parsedUser;
                setUser(parsedUser);
                setIsLoggedIn(true);
                // Hard-refresh the cached user against the backend so fields
                // that can change out-of-band (avatar, name, permissions,
                // tenant status) don't stay stale until the next login.
                // Ignore failures — interceptor handles 401 / network loss
                // and the cached copy is a safe fallback.
                api.get('/auth/me', { _aud: aud })
                    .then(res => {
                        const fresh = res.data?.user || res.data;
                        if (fresh && fresh._id && userIdOf(fresh) === userIdOf(userRef.current)) {
                            setUser(fresh);
                            setStoredUser(fresh, aud);
                        }
                    })
                    .catch(() => {});
            } catch {
                logout();
            }
        } else if (localStorage.getItem('isGuest') === 'true' && !isKioskRoute) {
            // GST-005 — 24h FE cap. Don't restore a stale guest session
            // (guest_session_start > 24h ago). The QR scan is the only
            // legitimate way to start a guest session; without re-scanning
            // the customer's localStorage scanToken / dineInTable / cart
            // could be from a previous day and every action would 401 with
            // no recovery path. Clear the slate so the next render bounces
            // them to /branch-selection (no active tenant after the clear).
            if (isGuestSessionExpired()) {
                clearGuestSession();
                setIsGuest(false);
            } else {
                setIsGuest(true);
            }
        }
        setIsLoading(false);
    }, []);

    // Live-watch the 24h boundary. The mount effect above only fires
    // once; a guest who left the tab open across the 24h mark would
    // otherwise stay in isGuest=true forever. Re-evaluate on focus,
    // visibilitychange and storage sync so the next interaction drops
    // them cleanly when the cap trips.
    //
    // The same 'storage' listener also watches for cross-tab identity
    // changes: when another tab signs a DIFFERENT account into this tab's
    // audience (or clears it), this tab must not keep rendering the old
    // account while silently sending the new account's token. api.js /
    // socket.js already refuse the mismatched token (identityMismatch);
    // here we block the UI and let the user choose.
    useEffect(() => {
        const check = () => {
            if (localStorage.getItem('isGuest') === 'true' && isGuestSessionExpired()) {
                clearGuestSession();
                setIsGuest(false);
            }
        };
        const checkIdentity = (e) => {
            const mine = userRef.current;
            if (!mine) return;
            const aud = audRef.current || currentAudience();
            // e.key === null → localStorage.clear() in another tab.
            if (e && e.key !== null && e.key !== userStorageKey(aud)) return;
            const stored = getStoredUserObject(aud);
            const storedId = userIdOf(stored);
            if (!storedId) {
                setSessionChange({ kind: 'signedOut', audience: aud });
                disconnectSocket();
            } else if (storedId !== userIdOf(mine)) {
                setSessionChange({ kind: 'switched', audience: aud, user: stored });
                disconnectSocket();
            } else {
                // Same account again (e.g. the other tab signed back in as us).
                setSessionChange(null);
            }
        };
        const onStorage = (e) => {
            check();
            checkIdentity(e);
        };
        window.addEventListener('focus', check);
        window.addEventListener('storage', onStorage);
        document.addEventListener('visibilitychange', check);
        return () => {
            window.removeEventListener('focus', check);
            window.removeEventListener('storage', onStorage);
            document.removeEventListener('visibilitychange', check);
        };
    }, []);

    const login = async (email, password, loginType, expectedRole) => {
        // Read before isGuest is cleared below — a guest signing in keeps
        // the cart they built (see claimCustomerData).
        const wasGuest = localStorage.getItem('isGuest') === 'true';
        try {
            // _silent so the axios interceptor doesn't toast a generic
            // "Invalid credentials" — the login page owns the inline
            // error display (formError banner above the form). Without
            // this, both the interceptor and the page would fire toasts
            // for the same failure (double-toast).
            const response = await api.post(
                '/auth/login',
                { email, password, loginType, expectedRole },
                { _silent: true },
            );
            // #28 — refreshToken is kept out of the user object and stored
            // separately (audience-scoped) for silent session renewal.
            const { token, refreshToken, ...userData } = response.data;

            // Another customer's cached orders / cart / allergies must never
            // surface in this account. Staff logins don't touch customer data.
            if (userData.role === 'customer') {
                claimCustomerData(userData._id || userData.id, { keepUnowned: wasGuest });
            }
            
            // Store under the audience-scoped keys so a login here can't
            // clobber a session of another audience open in another tab.
            // On the customer login page that's the customer audience; on
            // the shared /staff-login it's picked from the returned role
            // (superadmin → 'platform', tenant staff → 'staff'), and the
            // tab remembers it so /force-change-password reads the same
            // session.
            const tabAud = currentAudience();
            const aud = tabAud === 'customer' ? 'customer' : (audienceForUser(userData) || tabAud);
            if (STAFF_SIDE_AUDIENCES.includes(aud)) setEntryAudience(aud);
            setAuth(token, userData, aud, refreshToken);
            setTabIdentity(aud, userData);
            setAudience(aud);
            setSessionChange(null);
            localStorage.removeItem('isGuest');

            userRef.current = userData;
            setUser(userData);
            setIsLoggedIn(true);
            setIsGuest(false);

            // Force the singleton socket to re-handshake with the new
            // token. Without this, a socket opened pre-login keeps its
            // null auth — server-side `socket.data.role` stays null and
            // every subsequent `join` is silently rejected, so chef /
            // waiter never get live events until a page reload.
            reconnectWithAuth();

            return { success: true, role: userData.role, user: userData, audience: aud };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                // e.g. SIGNUP_PENDING / SIGNUP_REJECTED — the staff login
                // page renders those as a dedicated status panel.
                code: error.response?.data?.code,
                reason: error.response?.data?.reason,
                message: error.response?.data?.message || 'Login failed'
            };
        }
    };

    /**
     * Exchange a Google ID token for a BestoDine session.
     *
     * The token comes from Google Identity Services in the browser and
     * is verified server-side (signature, audience, issuer) before any
     * account is touched — see Backend/utils/googleAuth.js. Nothing
     * here trusts the token's contents; we only relay it.
     */
    const loginWithGoogle = async (credential) => {
        const wasGuest = localStorage.getItem('isGuest') === 'true';
        try {
            // _silent — the login page owns the error copy, same as
            // login() and register() above.
            const response = await api.post('/auth/google', { credential }, { _silent: true });
            const { token, refreshToken, needsMobile, ...userData } = response.data;

            // A Google sign-in may be a brand-new account OR a return
            // visit. claimCustomerData wipes cached personal data when
            // it belongs to a different account, which is exactly the
            // check we want either way.
            claimCustomerData(userData._id || userData.id, { keepUnowned: wasGuest });

            // Customer-only flow (Pages/Loggedin/Login.jsx) → this tab's
            // (customer) audience.
            const aud = currentAudience();
            setAuth(token, userData, aud, refreshToken);
            setTabIdentity(aud, userData);
            setAudience(aud);
            setSessionChange(null);
            localStorage.removeItem('isGuest');

            userRef.current = userData;
            setUser(userData);
            setIsLoggedIn(true);
            setIsGuest(false);
            reconnectWithAuth();

            // `needsMobile` is true when Google gave us no phone number
            // (it never does) and the account has none stored. Orders
            // need one, so the caller prompts rather than letting the
            // customer discover the gap at checkout.
            return { success: true, role: userData.role, user: userData, needsMobile };
        } catch (error) {
            console.error('Google sign-in error:', error);
            return {
                success: false,
                code: error.response?.data?.code,
                message: error.response?.data?.message || 'Could not sign you in with Google.',
            };
        }
    };

    const register = async (formData) => {
        const wasGuest = localStorage.getItem('isGuest') === 'true';
        try {
            // _silent — same reason as login() above. Signup page surfaces
            // server messages (e.g. EMAIL_ALREADY_REGISTERED) inline.
            const response = await api.post('/auth/register', formData, { _silent: true });
            // #28 — refreshToken is kept out of the user object and stored
            // separately (audience-scoped) for silent session renewal.
            const { token, refreshToken, ...userData } = response.data;

            // A brand-new account owns nothing cached in this browser
            // (except a guest's own cart when a guest signs up).
            claimCustomerData(userData._id || userData.id, { keepUnowned: wasGuest });

            const aud = currentAudience();
            setAuth(token, userData, aud, refreshToken);
            setTabIdentity(aud, userData);
            setAudience(aud);
            setSessionChange(null);
            localStorage.removeItem('isGuest');

            userRef.current = userData;
            setUser(userData);
            setIsLoggedIn(true);
            setIsGuest(false);
            reconnectWithAuth();

            return { success: true, role: userData.role, user: userData };
        } catch (error) {
            console.error('Registration error:', error);
            return { 
                success: false, 
                message: error.response?.data?.message || 'Registration failed' 
            };
        }
    };


    // Local-only teardown. Shared between user-initiated logout() below
    // and the cross-tab BroadcastChannel handler.
    const hardLogoutLocal = useCallback((opts = {}) => {
        // Tear down only the requested audience. A customer logout must
        // NOT clear the staff tab's token (or wipe shared customer-flow
        // keys like the cart when it's a staff logout), and a Super Admin
        // logout must not sign out a hotel admin tab (or vice versa) —
        // the audiences share localStorage but are otherwise independent.
        const aud = opts.audience || audRef.current || currentAudience();
        sessionStorage.setItem('intentional_logout', 'true');
        userRef.current = null;
        setUser(null);
        setIsLoggedIn(false);
        clearTabIdentity(aud);
        if (audRef.current === aud) setAudience(null);
        clearAuth(aud);
        if (aud === 'customer') {
            setIsGuest(false);
            localStorage.removeItem('cafeUser');
            localStorage.removeItem('isGuest');
            localStorage.removeItem('cafe_orders_v2');
            localStorage.removeItem('cancelled_orders_v1');
            localStorage.removeItem('order_ratings');
            localStorage.removeItem('guest_bill_paid_at');
            localStorage.removeItem('guest_session_start');
            localStorage.removeItem('guest_cart_reset');
            localStorage.removeItem('cart');
            localStorage.removeItem('scanToken');
            localStorage.removeItem('scanSessionStart');
        }
        disconnectSocket();
        window.dispatchEvent(new Event('storage_sync'));
        setTimeout(() => sessionStorage.removeItem('intentional_logout'), 2000);
        // CRIT-25 — tell the other tabs to do the same, but only the tabs
        // showing the SAME audience (carry it in the message).
        if (!opts.fromBroadcast) {
            try { AUTH_CHANNEL.postMessage({ type: 'logout', audience: aud }); } catch { /* ignore */ }
        }
    }, [setAudience]);

    // Best-effort server-side logout: revokes this device's refresh token
    // (#15) and closes an auto-opened staff shift. Credentials are captured
    // before the local teardown clears them.
    const notifyServerLogout = (path = '/auth/logout', aud = audRef.current || currentAudience()) => {
        const token = getToken(aud);
        const refreshToken = getRefreshToken(aud);
        if (!token && !refreshToken) return Promise.resolve();
        return api.post(
            path,
            { refreshToken },
            {
                _silent: true,
                _isBackground: true,
                _aud: aud,
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
        ).catch(() => { /* offline — the refresh token still expires on its own */ });
    };

    const logout = () => {
        const aud = audRef.current || currentAudience();
        const wasStaff = STAFF_SIDE_AUDIENCES.includes(aud)
            || ['waiter', 'captain', 'chef', 'admin', 'manager', 'superadmin'].includes(user?.role);
        notifyServerLogout('/auth/logout', aud);
        hardLogoutLocal({ audience: aud });
        return { wasStaff, audience: aud };
    };

    // #15 — end every session of this account on every device.
    const logoutAll = async () => {
        const aud = audRef.current || currentAudience();
        await notifyServerLogout('/auth/logout-all', aud);
        hardLogoutLocal({ audience: aud });
    };

    // CRIT-25 — listen for "logout" from other tabs. Only react when the
    // broadcast's audience matches this tab's audience, so a customer
    // logging out elsewhere doesn't kick a chef out of their tab, nor a
    // hotel admin's logout the Super Admin.
    useEffect(() => {
        const onMsg = (e) => {
            const aud = audRef.current || currentAudience();
            if (e?.data?.type === 'logout' && e.data.audience === aud) {
                if (userRef.current) setSessionChange({ kind: 'signedOut', audience: aud });
                hardLogoutLocal({ fromBroadcast: true, audience: e.data.audience });
            }
        };
        AUTH_CHANNEL.addEventListener('message', onMsg);
        return () => AUTH_CHANNEL.removeEventListener('message', onMsg);
    }, [hardLogoutLocal]);


    const setGuestMode = () => {
        setUser(null);
        setIsLoggedIn(false);
        setIsGuest(true);
        localStorage.setItem('isGuest', 'true');
        localStorage.removeItem('user');
        localStorage.removeItem('cafeUser');
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        // Clean slate: a guest is anonymous, so no previous account's
        // orders / cart / allergies / favorites may carry into the session.
        clearCustomerPersonalData();
        localStorage.setItem('guest_session_start', Date.now().toString());
        // Notify all components that data was cleared
        window.dispatchEvent(new Event('storage_sync'));
    };

    const exitGuestMode = () => {
        // No table API call here. Freeing the table is server-owned: the
        // payment / order-completion services and the empty-order sweeper
        // call freeTableOrUnmergeGroup (status → free, activeOrder → null,
        // diner snapshot wiped) once the bill is settled. A customer is not
        // allowed to PUT /tables/:id (captain/admin only), so the old
        // best-effort call here always 403'd and was silently swallowed.
        setUser(null);
        setIsLoggedIn(false);
        setIsGuest(false);
        localStorage.removeItem('isGuest');
        localStorage.removeItem('guest_session_start');
        localStorage.removeItem('guest_bill_paid_at');
        localStorage.removeItem('guest_cart_reset');
        localStorage.removeItem('cafe_orders_v2');
        localStorage.removeItem('cancelled_orders_v1');
        localStorage.removeItem('order_ratings');
        localStorage.removeItem('dineInTable');
        localStorage.removeItem('orderType');
        localStorage.removeItem('cart');
        localStorage.removeItem('scanToken');
        localStorage.removeItem('scanSessionStart');
        window.dispatchEvent(new Event('storage_sync'));
    };

    const updateProfile = (updates) => {
        const updatedUser = { ...user, ...updates };
        userRef.current = updatedUser;
        setUser(updatedUser);
        setStoredUser(updatedUser, audRef.current || undefined);
    };

    // Re-fetches the current user from /auth/me and rewrites state + localStorage.
    // Call after any action that mutates the logged-in user's own fields
    // (name, mobile, avatar, permissions) so the header / cached claims
    // don't stay stale until the next login.
    const refreshUser = useCallback(async () => {
        try {
            const aud = audRef.current || undefined;
            const res = await api.get('/auth/me', { _aud: aud });
            const fresh = res.data?.user || res.data;
            if (!fresh) return null;
            // Preserve the locally-cached token payload (role, tenant, etc.
            // that /auth/me also returns) by replacing the whole user object.
            userRef.current = fresh;
            setUser(fresh);
            setStoredUser(fresh, aud);
            return fresh;
        } catch {
            return null;
        }
    }, []);

    /** Returns true if the current user's role matches one or more of the given roles */
    const hasRole = (role) => {
        if (!user?.role) return false;
        return Array.isArray(role) ? role.includes(user.role) : user.role === role;
    };

    /** Returns true if the user has a specific granular permission.
     *  Admins bypass all permission checks automatically. */
    const hasPermission = (key) => {
        if (user?.role === 'admin') return true;
        return user?.permissions?.[key] === true;
    };

    /** Returns true if the user's tenant subscription includes the named
     *  feature. Mirrors the backend `featureGate(key)` resolution rules:
     *
     *    1. featureOverrides[key] === false  →  blocked (Super Admin revoked)
     *    2. featureOverrides[key] === true   →  allowed (Super Admin granted)
     *    3. tenant.features[key] is true / 'advanced' / 'standard' / 'basic' → allowed
     *    4. No tenant on user (legacy single-tenant)  →  allowed
     *
     *  Use this in admin sidebars / page guards to drive lock badges and
     *  upgrade prompts BEFORE the user clicks into a 403 response.
     */
    const hasFeature = (key) => {
        if (!key) return true;
        // Super admins are above the tenant boundary — they see everything.
        if (user?.role === 'superadmin') return true;
        // Legacy / single-tenant deployments — no tenant snapshot present.
        const tenant = user?.tenant;
        if (!tenant) return true;

        const overrides = tenant.featureOverrides || {};
        if (overrides[key] === false) return false;
        if (overrides[key] === true) return true;

        const value = tenant.features?.[key];
        return value === true
            || value === 'advanced'
            || value === 'standard'
            || value === 'basic';
    };

    /** Returns the numeric limit (e.g. maxStaff, maxBranches) configured
     *  for the user's plan. Returns 0 if no tenant context.  */
    const getLimit = (key) => {
        const v = user?.tenant?.limits?.[key];
        return typeof v === 'number' ? v : 0;
    };

    // Derived booleans — use these in components for readability
    const isStaff = hasRole(STAFF_ROLES);
    const isCaptain = hasRole([USER_ROLES.CAPTAIN, USER_ROLES.ADMIN]);
    const isWaiter = hasRole(USER_ROLES.WAITER);
    const isCustomer = hasRole(USER_ROLES.CUSTOMER);
    const isChef = hasRole(USER_ROLES.CHEF);
    const isSuperAdmin = hasRole(USER_ROLES.SUPERADMIN);
    const isFullSuperAdmin = isSuperAdmin && user?.superadminLevel === 'full';

    const mustChangePassword = user?.mustChangePassword === true;

    const value = useMemo(() => ({
        user,
        isLoggedIn,
        isAuthenticated: isLoggedIn,
        isGuest,
        isLoading,
        isStaff,
        isCaptain,
        isWaiter,
        isCustomer,
        isChef,
        isSuperAdmin,
        isFullSuperAdmin,
        superadminLevel: user?.superadminLevel || '',
        mustChangePassword,
        login,
        register,
        loginWithGoogle,
        logout,
        logoutAll,
        setGuestMode,
        exitGuestMode,
        updateProfile,
        refreshUser,
        hasRole,
        hasPermission,
        hasFeature,
        getLimit,
        tenant: user?.tenant ?? null,
        role: user?.role ?? null,
        // Which storage audience this tab's session lives in.
        audience,
    }), [user, isLoggedIn, isGuest, isLoading, audience]);

    return (
        <AuthContext.Provider value={value}>
            {children}
            {sessionChange && <SessionChangedOverlay change={sessionChange} />}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
}

export const useAuthContext = useAuth; // alias for backward compatibility

export default AuthContext;
