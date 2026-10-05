import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../_helpers/queryWrapper.jsx'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), delete: vi.fn(), post: vi.fn() }))
const waiterAPI = vi.hoisted(() => ({ getActiveRequestsByTable: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api, waiterAPI }))
const h = vi.hoisted(() => ({ socket: null, connected: false, joinRoom: null, reconnect: new Set() }))
vi.mock('@/utils/socket', async () => {
  const { createFakeSocket } = await import('../_helpers/fakeSocket.js')
  h.socket = createFakeSocket()
  h.joinRoom = vi.fn()
  return {
    getSocket: () => h.socket,
    joinRoom: (...a) => h.joinRoom(...a),
    subscribeSocketState: () => () => {},
    isSocketConnected: () => h.connected,
    onSocketReconnect: (fn) => { h.reconnect.add(fn); return () => h.reconnect.delete(fn) },
  }
})
const authState = vi.hoisted(() => ({ current: { user: null, isGuest: false } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.current }))
const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), custom: vi.fn(), dismiss: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: toast, toast }))

import { NotificationProvider, useNotifications } from '@/Context/NotificationContext'
import { setActiveTenant, clearActiveTenant } from '@/utils/tenant'

let client
const mount = () => renderHook(() => useNotifications(), {
  wrapper: ({ children }) => (
    <MemoryRouter><QueryClientProvider client={client}><NotificationProvider>{children}</NotificationProvider></QueryClientProvider></MemoryRouter>
  ),
})
const NOTES = [{ _id: 'n1', status: 'unread' }, { _id: 'n2', status: 'unread' }, { _id: 'n3', status: 'read' }]
const as = (role, extra = {}) => { authState.current = { user: { _id: 'u1', role }, isGuest: false, ...extra } }
const ready = async (role = 'admin') => {
  as(role)
  setActiveTenant({ slug: 'spice' })
  const r = mount()
  await waitFor(() => expect(r.result.current.notifications).toHaveLength(3))
  return r
}

beforeEach(() => {
  client = makeQueryClient()
  for (const fn of Object.values(api)) fn.mockReset()
  waiterAPI.getActiveRequestsByTable.mockReset().mockResolvedValue({ data: { requests: [] } })
  api.get.mockImplementation((url) => (url.startsWith('/notifications')
    ? Promise.resolve({ data: { success: true, notifications: NOTES } })
    : Promise.resolve({ data: { success: true, order: null } })))
  api.put.mockResolvedValue({ data: {} })
  api.delete.mockResolvedValue({ data: {} })
  h.socket.reset()
  h.joinRoom.mockClear()
  h.reconnect.clear()
  h.connected = false
  for (const fn of [toast, toast.success, toast.custom]) fn.mockReset()
  clearActiveTenant()
  authState.current = { user: null, isGuest: false }
})

describe('notification list + unread count', () => {
  test('no user → nothing fetched', () => {
    mount()
    expect(api.get).not.toHaveBeenCalled()
  })

  test('user without a tenant slug waits, then fetches as soon as a tenant is picked', async () => {
    as('customer')
    const { result } = mount()
    expect(api.get).not.toHaveBeenCalled()
    act(() => { setActiveTenant({ slug: 'spice' }) })
    await waitFor(() => expect(result.current.unreadCount).toBe(2))
    expect(api.get).toHaveBeenCalledWith('/notifications?role=customer&userId=u1', { _isBackground: true })
  })

  test('unsuccessful envelope → empty list', async () => {
    as('admin')
    setActiveTenant({ slug: 'spice' })
    api.get.mockResolvedValue({ data: { success: false } })
    const { result } = mount()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notifications).toEqual([])
  })

  test.each([
    ['error 401 stops polling', { error: { response: { status: 401 } } }, false, 'admin', false],
    ['error 400 stops polling', { error: { response: { status: 400 } } }, false, 'admin', false],
    ['socket down → 15s', { error: null }, false, 'admin', 15000],
    ['socket up, staff → 90s safety poll', { error: null }, true, 'chef', 90000],
    ['socket up, customer → no poll', { error: null }, true, 'customer', false],
  ])('refetchInterval: %s', async (_l, state, live, role, expected) => {
    h.connected = live
    as(role)
    setActiveTenant({ slug: 's' })
    mount()
    const q = client.getQueryCache().find({ queryKey: ['notifications', 'u1'] })
    expect(q.options.refetchInterval({ state })).toBe(expected)
  })

  test('retry policy: terminal on 400/401/403, else up to 2 attempts with capped backoff', () => {
    as('admin')
    setActiveTenant({ slug: 's' })
    mount()
    const { retry, retryDelay } = client.getQueryCache().find({ queryKey: ['notifications', 'u1'] }).options
    expect(retry(0, { response: { status: 403 } })).toBe(false)
    expect(retry(1, new Error('net'))).toBe(true)
    expect(retry(2, new Error('net'))).toBe(false)
    expect(retryDelay(1)).toBe(2000)
    expect(retryDelay(10)).toBe(30000)
  })
})

describe('mutations (optimistic)', () => {
  test('markAsRead flips one note immediately and PUTs it', async () => {
    const { result } = await ready()
    act(() => result.current.markAsRead('n1'))
    await waitFor(() => expect(result.current.unreadCount).toBe(1))
    expect(api.put).toHaveBeenCalledWith('/notifications/n1/read', { role: 'admin', userId: 'u1' })
  })

  test('markAsRead rolls back when the server fails', async () => {
    const { result } = await ready()
    api.put.mockRejectedValueOnce(new Error('500'))
    act(() => result.current.markAsRead('n1'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    await waitFor(() => expect(result.current.unreadCount).toBe(2))
  })

  test('markAllAsRead zeroes the count; rollback on failure', async () => {
    const { result } = await ready()
    act(() => result.current.markAllAsRead())
    await waitFor(() => expect(result.current.unreadCount).toBe(0))
    expect(api.put).toHaveBeenCalledWith('/notifications/all/read', { role: 'admin', userId: 'u1' })
  })

  test('markAllAsRead failure restores the previous list', async () => {
    const { result } = await ready()
    api.put.mockRejectedValueOnce(new Error('x'))
    act(() => result.current.markAllAsRead())
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    await waitFor(() => expect(result.current.unreadCount).toBe(2))
  })

  test('deleteNotification removes it optimistically (and restores on failure)', async () => {
    const { result } = await ready()
    act(() => result.current.deleteNotification('n3'))
    await waitFor(() => expect(result.current.notifications).toHaveLength(2))
    expect(api.delete).toHaveBeenCalledWith('/notifications/n3')
  })

  test('deleteNotification failure restores the list', async () => {
    const { result } = await ready()
    api.delete.mockRejectedValueOnce(new Error('x'))
    act(() => result.current.deleteNotification('n1'))
    await waitFor(() => expect(api.delete).toHaveBeenCalled())
    await waitFor(() => expect(result.current.notifications).toHaveLength(3))
  })

  test('clearAll empties the list after the server confirms', async () => {
    const { result } = await ready()
    act(() => result.current.clearAll())
    await waitFor(() => expect(result.current.notifications).toEqual([]))
    expect(api.delete).toHaveBeenCalledWith('/notifications/clear', { data: { role: 'admin', userId: 'u1' } })
  })

  test('toggleSound flips the flag', async () => {
    const { result } = await ready()
    act(() => result.current.toggleSound())
    expect(result.current.soundEnabled).toBe(false)
    expect(() => result.current.testSound()).not.toThrow()
  })
})

describe('socket events', () => {
  test('a burst of events is deduped into ONE refetch of the notifications query', async () => {
    const { result } = await ready()
    vi.useFakeTimers()
    const spy = vi.spyOn(client, 'invalidateQueries')
    act(() => {
      h.socket.serverEmit('notification:new', {})
      h.socket.serverEmit('order:updated')
      h.socket.serverEmit('request:updated')
      h.socket.serverEmit('notification:new', {})
    })
    act(() => { vi.advanceTimersByTime(300) })
    const keys = spy.mock.calls.map((c) => JSON.stringify(c[0].queryKey))
    expect(keys.filter((k) => k === JSON.stringify(['notifications', 'u1']))).toHaveLength(1)
    expect(keys).toEqual(expect.arrayContaining([JSON.stringify(['liveOrders']), JSON.stringify(['requests'])]))
    expect(result.current).toBeTruthy()
  })

  test('notification:new toasts staff; the customer side swallows checkout noise titles', async () => {
    await ready('admin')
    act(() => h.socket.serverEmit('notification:new', { title: 'Order Placed', description: 'T4' }))
    expect(toast.success).toHaveBeenCalledWith('Order Placed: T4', expect.any(Object))
  })

  test.each(['Order Placed', 'Payment Confirmed', 'Payment Confirmed (Webhook)'])('customer does not get a "%s" toast', async (title) => {
    await ready('customer')
    act(() => h.socket.serverEmit('notification:new', { title }))
    expect(toast.success).not.toHaveBeenCalled()
  })

  test.each([
    ['chef', { type: 'dine-in', tableName: '4', items: '2x Tea' }, 'New Order: Dine-in · Table 4 · 2x Tea'],
    ['waiter', { type: 'takeaway' }, 'New Order: Takeaway'],
    ['captain', undefined, 'New Order Received!'],
  ])('order:new toasts %s with a glanceable line', async (role, payload, msg) => {
    await ready(role)
    act(() => h.socket.serverEmit('order:new', payload))
    expect(toast.success).toHaveBeenCalledWith(msg, expect.any(Object))
  })

  test.each(['admin', 'manager', 'customer'])('order:new does not toast %s (they get notification:new instead)', async (role) => {
    await ready(role)
    act(() => h.socket.serverEmit('order:new', { type: 'dine-in' }))
    expect(toast.success).not.toHaveBeenCalled()
  })

  test.each([
    ['waiter', true], ['captain', true], ['chef', false], ['admin', false],
  ])('order:ready / request:new toast %s: %s', async (role, shown) => {
    await ready(role)
    act(() => { h.socket.serverEmit('order:ready'); h.socket.serverEmit('request:new', { message: 'Water T2' }) })
    expect(toast.success.mock.calls.length > 0).toBe(shown)
  })

  test.each([
    ['waiter', true], ['captain', true], ['admin', true], ['manager', true], ['chef', false], ['customer', false],
  ])('counter-payment:requested shows a Settle prompt to %s: %s', async (role, shown) => {
    await ready(role)
    act(() => h.socket.serverEmit('counter-payment:requested', { table: 'Table 5', amount: 420, orderId: 'O1' }))
    expect(toast.custom.mock.calls.length > 0).toBe(shown)
    if (shown) expect(toast.custom.mock.calls[0][1]).toEqual({ id: 'counter-payment-O1', duration: Infinity })
  })

  test('re-renders do not stack listeners; unmount removes them all', async () => {
    const { rerender, unmount } = await ready('waiter')
    rerender(); rerender()
    expect(h.socket.listenerCount('notification:new')).toBe(1)
    expect(h.socket.listenerCount('order:new')).toBe(1)
    unmount()
    expect(h.socket.totalListeners()).toBe(0)
  })

  test('reconnect resyncs notifications, live orders and requests', async () => {
    await ready('waiter')
    vi.useFakeTimers()
    const spy = vi.spyOn(client, 'invalidateQueries')
    act(() => { h.reconnect.forEach((fn) => fn()); vi.advanceTimersByTime(300) })
    expect(spy.mock.calls.map((c) => c[0].queryKey)).toEqual(expect.arrayContaining([['notifications'], ['liveOrders'], ['requests']]))
  })
})

describe('dine-in guest status tracking', () => {
  beforeEach(() => {
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 'T7' }))
    authState.current = { user: null, isGuest: true }
  })

  test('joins the table room and polls the table\'s active order + requests', async () => {
    api.get.mockResolvedValue({ data: { success: true, order: { orderId: 'O9', status: 'preparing' } } })
    mount()
    expect(h.joinRoom).toHaveBeenCalledWith('table:T7')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/orders/active/table/T7', { _isBackground: true }))
    await waitFor(() => expect(h.joinRoom).toHaveBeenCalledWith('order:O9'))
    expect(waiterAPI.getActiveRequestsByTable).toHaveBeenCalledWith('T7')
  })

  test('request:updated transitions toast once per change (pending→accepted, →completed), not on first sight or repeats', async () => {
    mount()
    const req = (status) => ({ _id: 'r1', type: 'water', status })
    act(() => h.socket.serverEmit('request:updated', req('pending')))
    expect(toast.success).not.toHaveBeenCalled()
    act(() => h.socket.serverEmit('request:updated', req('accepted')))
    act(() => h.socket.serverEmit('request:updated', req('accepted')))
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenLastCalledWith('A waiter is on the way with your water!', expect.any(Object))
    act(() => h.socket.serverEmit('request:updated', req('completed')))
    expect(toast.success).toHaveBeenLastCalledWith('Your water request has been completed.', expect.any(Object))
    act(() => h.socket.serverEmit('request:updated', { status: 'x' })) // malformed ignored
    expect(toast.success).toHaveBeenCalledTimes(2)
  })

  test('a scan token forces one socket re-handshake so the table join is authorised', () => {
    localStorage.setItem('scanToken', 'st')
    mount()
    expect(h.socket.disconnect).toHaveBeenCalled()
    expect(h.socket.connect).toHaveBeenCalled()
  })

  test('staff never treat a leftover dineInTable as their own', () => {
    as('waiter')
    mount()
    expect(h.joinRoom).not.toHaveBeenCalledWith('table:T7')
  })
})

const audioHooks = {}
describe('interactive bits', () => {
  test('the counter-payment prompt\'s Settle button deep-links to /waiter/payment with cash state', async () => {
    const { render, screen, fireEvent } = await import('@testing-library/react')
    const { Routes, Route, useLocation } = await import('react-router-dom')
    as('captain')
    setActiveTenant({ slug: 'spice' })
    let loc
    function Spy() { loc = useLocation(); return null }
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <NotificationProvider><Routes><Route path="*" element={<Spy />} /></Routes></NotificationProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    act(() => h.socket.serverEmit('counter-payment:requested', { table: 'Table 5', amount: 420.4, orderId: 'O1' }))
    const renderToast = toast.custom.mock.calls[0][0]
    render(<>{renderToast({ id: 't1', visible: true })}</>)
    expect(screen.getByText('Table 5 — collect ₹420')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(toast.dismiss).toHaveBeenCalledWith('t1')
    fireEvent.click(screen.getByText('Settle Cash for Table 5'))
    expect(loc.pathname).toBe('/waiter/payment')
    expect(loc.state).toEqual({ orderId: 'O1', orderDisplayId: 'O1', amount: 420.4, tableName: '5', fromCounterRequest: true })
  })

  test.each(['chef', 'waiter', 'customer', 'admin', 'superadmin'])('after a user interaction, a new notification plays the %s sound (throttled)', async (role) => {
    const osc = { type: '', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }
    const gain = { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
    const createOscillator = vi.fn(() => osc)
    audioHooks.createOscillator = createOscillator; audioHooks.createGain = () => gain
    vi.stubGlobal('AudioContext', vi.fn(function AC() { return { state: 'running', currentTime: 0, destination: {}, createOscillator: () => audioHooks.createOscillator(), createGain: () => audioHooks.createGain(), resume: vi.fn() } }))
    window.AudioContext = globalThis.AudioContext
    window.__audioInteracted = true
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(Date.now() + 60_000 * (['chef', 'waiter', 'customer', 'admin', 'superadmin'].indexOf(role) + 1) * 10)
    await ready(role)
    act(() => { h.socket.serverEmit('notification:new', {}); h.socket.serverEmit('notification:new', {}) })
    act(() => { vi.advanceTimersByTime(400) })
    expect(createOscillator).toHaveBeenCalled()
    const firstBurst = createOscillator.mock.calls.length
    expect(firstBurst).toBeLessThanOrEqual(3) // second ping inside the 2s throttle is silent
    delete window.__audioInteracted
  })
})
