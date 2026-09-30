import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { getSocket, subscribeSocketState, isSocketConnected, onSocketReconnect } from '../utils/socket';

/**
 * Listen for a Socket.io event and call `handler` when it fires.
 * Automatically cleans up the listener on unmount.
 *
 * The handler is stored in a ref so callers don't need to memoize it
 * with useCallback — this prevents infinite re-render loops when an
 * inline function is passed as the handler.
 *
 * Usage:
 *   useSocketEvent('order:new', () => refetchOrders());
 *   useSocketEvent('order:updated', (data) => { if (data.orderId === myId) refetch(); });
 */
export default function useSocketEvent(eventName, handler) {
    const handlerRef = useRef(handler);
    useLayoutEffect(() => { handlerRef.current = handler; });

    useEffect(() => {
        const socket = getSocket();
        const stableHandler = (...args) => handlerRef.current(...args);
        socket.on(eventName, stableHandler);
        return () => socket.off(eventName, stableHandler);
    }, [eventName]);
}

function subscribeConnected(cb) {
    // Make sure the singleton exists so we actually get connect events.
    getSocket();
    return subscribeSocketState(cb);
}

/**
 * BUG #23 — `true` while the realtime socket is connected. Use it to turn
 * fallback polling off (or down to a slow safety poll) while live events
 * are flowing, and back on when the socket drops.
 *
 *   const live = useSocketConnected();
 *   useQuery({ ..., refetchInterval: live ? false : 15_000 });
 */
export function useSocketConnected() {
    return useSyncExternalStore(subscribeConnected, isSocketConnected, () => false);
}

/**
 * BUG #12 — run `handler` after every socket RE-connect (not the first
 * connect), e.g. to invalidate live queries that may have missed events
 * while offline.
 */
export function useSocketReconnect(handler) {
    const handlerRef = useRef(handler);
    useLayoutEffect(() => { handlerRef.current = handler; });
    useEffect(() => {
        getSocket();
        return onSocketReconnect(() => handlerRef.current?.());
    }, []);
}
