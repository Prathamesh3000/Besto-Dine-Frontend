import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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
vi.mock('@/utils/customerOrderIds', () => ({
  getCustomerOrderSession: () => ({}),
  readRecoveryOrderIds: () => [],
}))
vi.mock('@/utils/tenant', () => ({ activeRestaurantPath: () => '/r/home' }))

import CustomerLayout from '@/Components/Loggedin/CustomerLayout'

const STAFF = 'Your table has been closed by the restaurant. Thank you for dining with us!'
const renderIt = () => render(
  <MemoryRouter initialEntries={['/customer/menu']}>
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route path="/customer/menu" element={<div>MENU</div>} />
      </Route>
      <Route path="/r/home" element={<div>RESTAURANT HOME</div>} />
    </Routes>
  </MemoryRouter>,
)
const seat = () => {
  localStorage.setItem('scanToken', 'tok')
  localStorage.setItem('dineInTable', JSON.stringify({ _id: 't1' }))
}

beforeEach(() => {
  localStorage.clear()
  api.get.mockClear()
  auth = { exitGuestMode: vi.fn(), logout: vi.fn(), user: null, isLoggedIn: false }
})

describe('CustomerLayout — staff freed the table', () => {
  test('guest: table-freed push clears the binding, shows staff wording, Leave now exits', async () => {
    seat()
    renderIt()
    act(() => socketHandlers['session:ended']({ reason: 'table-freed', tableId: 't1' }))
    expect(await screen.findByText(STAFF)).toBeInTheDocument()
    expect(localStorage.getItem('scanToken')).toBeNull()
    expect(localStorage.getItem('dineInTable')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave now' }))
    expect(auth.exitGuestMode).toHaveBeenCalled()
    expect(auth.logout).not.toHaveBeenCalled()
    expect(await screen.findByText('RESTAURANT HOME')).toBeInTheDocument()
  })

  test('logged-in customer: per-user push (no tableId, no scan session) signs out via logout()', async () => {
    auth = { ...auth, user: { role: 'customer', _id: 'u1' }, isLoggedIn: true }
    renderIt()
    act(() => socketHandlers['session:ended']({ reason: 'all-tables-freed' }))
    expect(await screen.findByText(STAFF)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leave now' }))
    expect(auth.logout).toHaveBeenCalled()
    expect(auth.exitGuestMode).toHaveBeenCalled()
    expect(await screen.findByText('RESTAURANT HOME')).toBeInTheDocument()
  })

  test('push for a different table is ignored', () => {
    seat()
    renderIt()
    act(() => socketHandlers['session:ended']({ reason: 'table-freed', tableId: 'other' }))
    expect(screen.queryByText(STAFF)).not.toBeInTheDocument()
    expect(localStorage.getItem('scanToken')).toBe('tok')
  })

  test('idle-sweeper payload (no reason) keeps the old wording and does not log out', async () => {
    seat()
    auth = { ...auth, user: { role: 'customer' }, isLoggedIn: true }
    renderIt()
    act(() => socketHandlers['session:ended']({ tableId: 't1', graceMinutes: 15 }))
    expect(await screen.findByText(/No order was placed for 15 minutes/)).toBeInTheDocument()
    expect(screen.queryByText(STAFF)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leave now' }))
    expect(auth.logout).not.toHaveBeenCalled()
    expect(auth.exitGuestMode).toHaveBeenCalled()
  })

  test('bd:table-session-ended window event runs the same sign-out', async () => {
    seat()
    auth = { ...auth, user: { role: 'customer' }, isLoggedIn: true }
    renderIt()
    act(() => { window.dispatchEvent(new CustomEvent('bd:table-session-ended', { detail: { reason: 'table-freed' } })) })
    expect(await screen.findByText(STAFF)).toBeInTheDocument()
    expect(localStorage.getItem('scanToken')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave now' }))
    expect(auth.logout).toHaveBeenCalled()
  })
})
