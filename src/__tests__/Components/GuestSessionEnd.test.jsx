import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const socketHandlers = vi.hoisted(() => ({}))
vi.mock('@/hooks/useSocketEvent', () => ({ default: (evt, fn) => { socketHandlers[evt] = fn } }))
vi.mock('@/utils/customerOrderIds', () => ({
  getCustomerOrderSession: () => ({ scanSession: 's1' }),
  readRecoveryOrderIds: () => ['ORD-1', 'ORD-2'],
  clearOrderIds: vi.fn(),
}))

import GuestSessionEnd from '@/Components/Common/GuestSessionEnd'
import { isGuestVisitComplete } from '@/utils/guestSessionEnd'

const order = (orderId, status, paymentStatus, extra = {}) => ({ orderId, status, paymentStatus, ...extra })
const serve = (...orders) => {
  api.get.mockImplementation((url) => {
    const id = decodeURIComponent(url.split('/')[2])
    const o = orders.find((x) => x.orderId === id)
    return o ? Promise.resolve({ data: { success: true, order: o } }) : Promise.reject({ response: { status: 404 } })
  })
}

const renderAt = (path = '/customer/menu') => render(
  <MemoryRouter initialEntries={[path]}>
    <GuestSessionEnd />
    <Routes>
      <Route path="/customer/menu" element={<div>MENU</div>} />
      <Route path="/kiosk/menu" element={<div>KIOSK</div>} />
      <Route path="/login" element={<div>LOGIN PAGE</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  localStorage.clear()
  api.get.mockReset()
  auth = { isGuest: true, isLoggedIn: false, exitGuestMode: vi.fn() }
})

describe('isGuestVisitComplete', () => {
  test.each([
    ['no orders yet', [], false],
    ['dine-in paid after eating', [order('A', 'served', 'Paid')], true],
    ['paid but still cooking (takeaway / pay-first)', [order('A', 'preparing', 'Paid')], false],
    ['served but unpaid', [order('A', 'served', 'Pending')], false],
    ['one of two rounds unpaid', [order('A', 'served', 'Paid'), order('B', 'served', 'Pending')], false],
    ['cancelled orders are ignored', [order('A', 'served', 'Paid'), order('B', 'cancelled', 'Pending')], true],
    ['only cancelled orders', [order('A', 'cancelled', 'Pending')], false],
    ['refunded counts as settled', [order('A', 'served', 'Refunded')], true],
    ['home delivery delivered', [order('A', 'ready', 'Paid', { delivery: { status: 'delivered' } })], true],
  ])('%s', (_l, orders, expected) => expect(isGuestVisitComplete(orders)).toBe(expected))
})

describe('GuestSessionEnd popup', () => {
  test('appears once every order is paid and served; OK ends the guest session and opens login', async () => {
    serve(order('ORD-1', 'served', 'Paid'), order('ORD-2', 'served', 'Paid'))
    renderAt()
    const dialog = await screen.findByTestId('guest-session-end')
    expect(dialog).toHaveTextContent('You are in guest mode, and guest mode ends once your final bill is paid.')
    expect(localStorage.getItem('guest_session_ended')).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(auth.exitGuestMode).toHaveBeenCalled()
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
    expect(localStorage.getItem('guest_session_ended')).toBeNull()
  })

  test('stays hidden while a bill is unpaid, then appears on the live update when staff settle it', async () => {
    serve(order('ORD-1', 'served', 'Pending'))
    renderAt()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('guest-session-end')).not.toBeInTheDocument()

    serve(order('ORD-1', 'served', 'Paid'))         // cash settled at the counter
    await act(async () => { socketHandlers['order:updated']({ paymentStatus: 'Paid' }) })
    expect(await screen.findByTestId('guest-session-end')).toBeInTheDocument()
  })

  test('takeaway paid but not handed over yet → no popup', async () => {
    serve(order('ORD-1', 'ready', 'Paid', { type: 'takeaway' }))
    renderAt()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('guest-session-end')).not.toBeInTheDocument()
  })

  test('a reload after the visit ended shows the popup again without refetching', async () => {
    localStorage.setItem('guest_session_ended', '1')
    renderAt()
    expect(screen.getByTestId('guest-session-end')).toBeInTheDocument()
  })

  test('logged-in customers, staff and the kiosk are never affected', async () => {
    serve(order('ORD-1', 'served', 'Paid'))
    auth = { isGuest: false, isLoggedIn: true, exitGuestMode: vi.fn() }
    const { unmount } = renderAt()
    await new Promise((r) => setTimeout(r, 20))
    expect(api.get).not.toHaveBeenCalled()
    expect(screen.queryByTestId('guest-session-end')).not.toBeInTheDocument()
    unmount()

    auth = { isGuest: true, isLoggedIn: false, exitGuestMode: vi.fn() }
    renderAt('/kiosk/menu')
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByTestId('guest-session-end')).not.toBeInTheDocument()
  })
})
