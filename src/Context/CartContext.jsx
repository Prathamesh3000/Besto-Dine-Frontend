import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { isDineInLocked, needsTableScan, requestTableScan } from '../utils/dineInSession';
import { CUSTOMER_DATA_CLEARED_EVENT } from '../utils/customerSession';
import { mergeLine, countDistinctLines, cartSubtotal } from '../utils/cart';
import toast from 'react-hot-toast';

// The cart store shared by the customer and waiter flows. Lives here
// (not under Context/Waiter) because both use it; the old path
// re-exports this module. Line identity / totals come from utils/cart
// so this store, the kiosk cart and the cart pages agree.
const CartContext = createContext();

// Storage key for the new per-table cart shape:
//   { [tableKey]: { [itemId]: { ... } } }
// A single `_default_` slot is used when no table is active (customer
// flows, advance booking, health mode — anything outside the waiter
// table-first ordering flow). The waiter flow calls setActiveTable(id)
// when a table is chosen so subsequent cart mutations land in that
// table's slot and don't bleed across tables.
const STORAGE_KEY = 'cart_by_table';
const LEGACY_KEY  = 'cart';
const DEFAULT_SLOT = '_default_';

// One-time migration from the old single-blob `cart` key to the new
// per-table shape. If the legacy key exists and the new one doesn't,
// move the entire blob into the default slot so nothing the customer
// had in their cart disappears on first load after the upgrade.
function loadInitial() {
    try {
        const fresh = localStorage.getItem(STORAGE_KEY);
        if (fresh) {
            const parsed = JSON.parse(fresh);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        }
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
            const parsed = JSON.parse(legacy);
            // Legacy blob could be array OR object — normalise to object
            const asObject = Array.isArray(parsed)
                ? parsed.reduce((acc, item) => {
                    const id = item.id || Math.random().toString(36).substr(2, 9);
                    acc[id] = item;
                    return acc;
                }, {})
                : (parsed && typeof parsed === 'object' ? parsed : {});
            localStorage.removeItem(LEGACY_KEY);
            return { [DEFAULT_SLOT]: asObject };
        }
    } catch (e) {
        console.error('Failed to parse waiter cart from localStorage', e);
    }
    return {};
}

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};

export const CartProvider = ({ children }) => {
    // cartsByTable — the persisted map; every mutation rewrites this.
    const [cartsByTable, setCartsByTable] = useState(loadInitial);

    // activeTableId — which slot in cartsByTable the mutators target.
    // Persisted so a refresh on /waiter/cart or /waiter/details keeps
    // showing the same table's items. Customer flows never set this so
    // they stay on the default slot.
    const [activeTableId, setActiveTableIdState] = useState(() => {
        try { return localStorage.getItem('cart_active_table') || null; } catch { return null; }
    });

    const { user, isGuest, isLoading } = useAuth();

    // Effective slot key — activeTableId wins; else the shared default.
    const slotKey = activeTableId || DEFAULT_SLOT;

    // Persist the table map
    useEffect(() => {
        try {
            const serialized = JSON.stringify(cartsByTable);
            // Skip no-op writes — notably the echo right after adopting
            // another tab's cart below.
            if (localStorage.getItem(STORAGE_KEY) === serialized) return;
            localStorage.setItem(STORAGE_KEY, serialized);
            window.dispatchEvent(new Event('storage_sync'));
        } catch { /* quota — not critical */ }
    }, [cartsByTable]);

    // Cross-tab sync (#29). Every write stores the COMPLETE per-table map,
    // so another tab's write is the newest full picture: adopt it. Without this each tab kept its stale in-memory copy and the
    // next edit in either tab overwrote the other's cart. The active
    // table stays per-tab (a waiter may work two tables in two tabs).
    useEffect(() => {
        const onStorage = (e) => {
            if (e.storageArea && e.storageArea !== localStorage) return;
            if (e.key !== STORAGE_KEY && e.key !== null) return;
            let incoming = {};
            try {
                const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) incoming = parsed;
            } catch { return; }
            // The other tab's map was built on top of ours (we adopt every
            // write), so it already includes our changes; a slot missing
            // there was cleared there.
            setCartsByTable(prev => (
                JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming
            ));
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Persist the active table id separately so it survives reload
    useEffect(() => {
        try {
            if (activeTableId) localStorage.setItem('cart_active_table', activeTableId);
            else localStorage.removeItem('cart_active_table');
        } catch { /* ignore */ }
    }, [activeTableId]);

    // Clear ALL carts on logout (not guest) — skip while auth is still restoring session
    useEffect(() => {
        if (!isLoading && !user && !isGuest) {
            setCartsByTable({});
            setActiveTableIdState(null);
        }
    }, [user, isGuest, isLoading]);

    // When guest mode activates, reset cart to ensure clean slate (default slot only —
    // guest mode has no table concept)
    useEffect(() => {
        if (isGuest) {
            const guestStart = localStorage.getItem('guest_session_start');
            const cartReset = localStorage.getItem('guest_cart_reset');
            if (guestStart && guestStart !== cartReset) {
                setCartsByTable(prev => ({ ...prev, [DEFAULT_SLOT]: {} }));
                localStorage.setItem('guest_cart_reset', guestStart);
            }
        }
    }, [isGuest]);

    // A different customer account signed in on this browser — the
    // customer cart (default slot) belonged to the previous account.
    // customerSession already dropped it from storage; drop the in-memory
    // copy too, or the persist effect above writes it straight back.
    useEffect(() => {
        const onCleared = () => setCartsByTable(prev => {
            if (!prev[DEFAULT_SLOT]) return prev;
            const next = { ...prev };
            delete next[DEFAULT_SLOT];
            return next;
        });
        window.addEventListener(CUSTOMER_DATA_CLEARED_EVENT, onCleared);
        return () => window.removeEventListener(CUSTOMER_DATA_CLEARED_EVENT, onCleared);
    }, []);

    // Public — waiter flow calls this once a table is chosen. Pass null
    // to drop back to the default slot (e.g. on logout / home).
    const setActiveTable = useCallback((tableId) => {
        setActiveTableIdState(tableId ? String(tableId) : null);
    }, []);

    const updateQuantity = useCallback((productId, delta, productDetails = {}) => {
        if (!productId) return;
        const numericDelta = Number(delta);
        if (isNaN(numericDelta)) return;

        // ── Dine-in session lock ─────────────────────────────────
        // Customer's bill on this table has been settled but they
        // haven't re-scanned the QR yet. Block ALL increments here
        // (single source of truth) so every Add / + button across
        // Home, Search, MenuItemDetail, ProductDetails — wherever
        // they live in the page tree — becomes effectively no-op
        // without each call site needing its own guard.
        // Decrements still pass through so a customer can clean up
        // their stale cart if needed.
        if (numericDelta > 0 && isDineInLocked()) {
            toast(
                'Bill settled. Re-scan the table QR to start a new order.',
                { id: 'dine-in-locked', icon: '🔒', duration: 4000 }
            );
            return;
        }

        // ── Dine-in without a table ──────────────────────────────
        // A guest (or dine-in customer) with no scanned table can
        // browse but not order: every dine-in order must be bound to
        // a table QR. Send them to the scan screen instead of letting
        // them build a cart that can only fail at Place Order.
        if (numericDelta > 0 && needsTableScan()) {
            toast(
                'Please scan the QR code on your table to order.',
                { id: 'dine-in-scan-required', icon: '📷', duration: 4000 }
            );
            requestTableScan('no_table');
            return;
        }

        setCartsByTable(prev => {
            const slot = prev[slotKey] || {};
            const merged = mergeLine(slot[productId] || {}, productDetails, numericDelta, 'quantity');

            const nextSlot = { ...slot };
            if (!merged) {
                delete nextSlot[productId];
            } else {
                nextSlot[productId] = merged;
            }
            return { ...prev, [slotKey]: nextSlot };
        });
    }, [slotKey]);

    const updateCartItem = useCallback((itemId, updates) => {
        setCartsByTable(prev => {
            const slot = prev[slotKey] || {};
            if (!slot[itemId]) return prev;
            return {
                ...prev,
                [slotKey]: {
                    ...slot,
                    [itemId]: { ...slot[itemId], ...updates },
                },
            };
        });
    }, [slotKey]);

    const clearCart = useCallback(() => {
        setCartsByTable(prev => ({ ...prev, [slotKey]: {} }));
    }, [slotKey]);

    // Clear a specific table's cart (used when closing / settling a table)
    const clearCartForTable = useCallback((tableId) => {
        const key = tableId ? String(tableId) : DEFAULT_SLOT;
        setCartsByTable(prev => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const cartItems = useMemo(() => cartsByTable[slotKey] || {}, [cartsByTable, slotKey]);

    // Number of distinct products (cart lines) — 3 products × qty 2 is
    // "3 items", not 6. Quantity only affects the price.
    const totalItems = useMemo(() => countDistinctLines(cartItems), [cartItems]);

    // Pre-tax subtotal (unit × qty per line, rounded to paise).
    const totalPrice = useMemo(() => cartSubtotal(cartItems), [cartItems]);

    const value = useMemo(() => ({
        cartItems,
        updateQuantity,
        updateCartItem,
        totalItems,
        totalPrice,
        clearCart,
        clearCartForTable,
        activeTableId,
        setActiveTable,
    }), [cartItems, totalItems, totalPrice, updateQuantity, updateCartItem, clearCart, clearCartForTable, activeTableId, setActiveTable]);

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    );
};
