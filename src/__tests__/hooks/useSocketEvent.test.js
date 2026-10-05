import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const h = vi.hoisted(() => ({ socket: null, stateListeners: new Set(), reconnect: new Set(), connected: false }))
vi.mock('@/utils/socket', async () => {
  const { createFakeSocket } = await import('../_helpers/fakeSocket.js')
  h.socket = createFakeSocket()
  return {
    getSocket: vi.fn(() => h.socket),
    subscribeSocketState: (fn) => { h.stateListeners.add(fn); return () => h.stateListeners.delete(fn) },
    isSocketConnected: () => h.connected,
    onSocketReconnect: (fn) => { h.reconnect.add(fn); return () => h.reconnect.delete(fn) },
  }
})

import useSocketEvent, { useSocketConnected, useSocketReconnect } from '@/hooks/useSocketEvent'

beforeEach(() => {
  h.socket.reset()
  h.stateListeners.clear()
  h.reconnect.clear()
  h.connected = false
})

describe('useSocketEvent', () => {
  test('subscribes on mount and calls the handler with the payload', () => {
    const handler = vi.fn()
    renderHook(() => useSocketEvent('order:new', handler))
    expect(h.socket.listenerCount('order:new')).toBe(1)
    h.socket.serverEmit('order:new', { id: 1 })
    expect(handler).toHaveBeenCalledWith({ id: 1 })
  })

  test('re-rendering with a new inline handler does not re-subscribe or leak, and uses the latest handler', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => useSocketEvent('order:new', fn), { initialProps: { fn: first } })
    rerender({ fn: second })
    rerender({ fn: second })
    expect(h.socket.on).toHaveBeenCalledTimes(1)
    expect(h.socket.listenerCount('order:new')).toBe(1)
    h.socket.serverEmit('order:new')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test('changing the event name swaps the subscription', () => {
    const { rerender } = renderHook(({ ev }) => useSocketEvent(ev, () => {}), { initialProps: { ev: 'a' } })
    rerender({ ev: 'b' })
    expect(h.socket.listenerCount('a')).toBe(0)
    expect(h.socket.listenerCount('b')).toBe(1)
  })

  test('unmount removes the exact listener it added', () => {
    const { unmount } = renderHook(() => useSocketEvent('x', () => {}))
    const added = h.socket.on.mock.calls[0][1]
    unmount()
    expect(h.socket.off).toHaveBeenCalledWith('x', added)
    expect(h.socket.totalListeners()).toBe(0)
  })
})

describe('useSocketConnected', () => {
  test('reflects the socket state store and updates on change', () => {
    const { result } = renderHook(() => useSocketConnected())
    expect(result.current).toBe(false)
    h.connected = true
    act(() => h.stateListeners.forEach((fn) => fn()))
    expect(result.current).toBe(true)
  })

  test('unsubscribes from the state store on unmount', () => {
    const { unmount } = renderHook(() => useSocketConnected())
    expect(h.stateListeners.size).toBe(1)
    unmount()
    expect(h.stateListeners.size).toBe(0)
  })
})

describe('useSocketReconnect', () => {
  test('calls the latest handler on every reconnect and unregisters on unmount', () => {
    const a = vi.fn()
    const b = vi.fn()
    const { rerender, unmount } = renderHook(({ fn }) => useSocketReconnect(fn), { initialProps: { fn: a } })
    rerender({ fn: b })
    h.reconnect.forEach((fn) => fn())
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    unmount()
    expect(h.reconnect.size).toBe(0)
  })
})
