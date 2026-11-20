import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
const api = vi.hoisted(() => ({ get: vi.fn(() => Promise.resolve({ data: { available: true } })), post: vi.fn(() => Promise.resolve({})) }))
vi.mock('@/utils/api', () => ({ default: api }))
const socketHandlers = vi.hoisted(() => ({}))
vi.mock('@/hooks/useSocketEvent', () => ({
  default: (evt, fn) => { socketHandlers[evt] = fn },
  useSocketConnected: () => true,
  useSocketReconnect: () => {},
}))
const sock = vi.hoisted(() => ({ joinRoom: vi.fn(), leaveRoom: vi.fn(), s: { disconnect: vi.fn(), connect: vi.fn() } }))
vi.mock('@/utils/socket', () => ({ joinRoom: sock.joinRoom, leaveRoom: sock.leaveRoom, getSocket: () => sock.s }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/customerOrderIds', () => ({ getCustomerOrderSession: () => ({}), readRecoveryOrderIds: () => [] }))
vi.mock('@/utils/tenant', () => ({ activeRestaurantPath: () => '/r/home', getActiveTenantSlug: () => 'staging-cafe' }))

import toast from 'react-hot-toast'
import CustomerLayout from '@/Components/Loggedin/CustomerLayout'

const renderIt = () => render(
  <MemoryRouter initialEntries={['/customer/menu']}>
    <Routes><Route element={<CustomerLayout />}><Route path="/customer/menu" element={<div>MENU</div>} /></Route></Routes>
  </MemoryRouter>,
)
const CART = JSON.stringify([{ id: 'x', qty: 2 }])
const seat = () => {
  localStorage.setItem('scanToken', 'old-tok')
  localStorage.setItem('dineInTable', JSON.stringify({ _id: 't5', name: 'T5', capacity: 4, qrToken: 'q' }))
  localStorage.setItem('cart', CART)
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  auth = { exitGuestMode: vi.fn(), logout: vi.fn(), user: null, isLoggedIn: false }
})

describe('CustomerLayout — table:moved', () => {
  test('swaps token + table, keeps the cart, rejoins the room, toasts, no logout', () => {
    seat()
    renderIt()
    act(() => socketHandlers['table:moved']({ fromTableId: 't5', toTableId: 't6', toTableName: 'T6', scanToken: 'new-tok', sessionId: 's1' }))
    expect(localStorage.getItem('scanToken')).toBe('new-tok')
    const t = JSON.parse(localStorage.getItem('dineInTable'))
    expect(t._id).toBe('t6')
    expect(t.name).toBe('T6')
    expect(localStorage.getItem('cart')).toBe(CART)
    expect(sock.leaveRoom).toHaveBeenCalledWith('table:t5')
    expect(sock.joinRoom).toHaveBeenCalledWith('table:t6')
    expect(toast).toHaveBeenCalledWith('Your table is now T6', expect.anything())
    expect(auth.logout).not.toHaveBeenCalled()
    expect(auth.exitGuestMode).not.toHaveBeenCalled()
  })

  test('push for another table, or with no scan session, is ignored', () => {
    seat()
    renderIt()
    act(() => socketHandlers['table:moved']({ fromTableId: 'other', toTableId: 't6', toTableName: 'T6', scanToken: 'new-tok' }))
    expect(localStorage.getItem('scanToken')).toBe('old-tok')
    localStorage.clear()
    act(() => socketHandlers['table:moved']({ toTableId: 't6', toTableName: 'T6', scanToken: 'new-tok' }))
    expect(localStorage.getItem('scanToken')).toBeNull()
  })
})
