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
import { isGuestVisitComplete, evaluateGuestVisit, GUEST_END_GRACE_MS } from '@/utils/guestSessionEnd'
import { setActiveTenant, clearActiveTenant } from '@/utils/tenant'

// Operations profile without a kitchen screen: the customer blob says
// tracking is off, and the server marks orders served at creation.
const NO_TRACKING = { orderFlow: { customerSelfOrder: true, customerTracking: false } }
const MIN = 60 * 1000

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
  clearActiveTenant()
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

  test('reads the active restaurant\'s profile by default (no tenant → today\'s rule, no grace)', () => {
    const justPaid = order('A', 'served', 'Paid', { paidAt: new Date().toISOString() })
    expect(isGuestVisitComplete([justPaid])).toBe(true)
    setActiveTenant({ slug: 'counter', operations: NO_TRACKING })
    expect(isGuestVisitComplete([justPaid])).toBe(false)
  })
})

describe('isGuestVisitComplete — no-tracking profile (orders are "served" at creation)', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const paid = (id, minutesAgo, extra = {}) =>
    order(id, 'served', 'Paid', { paidAt: new Date(now - minutesAgo * MIN).toISOString(), ...extra })

  test('GUEST_END_GRACE_MS is 20 minutes', () => expect(GUEST_END_GRACE_MS).toBe(20 * MIN))

  test.each([
    ['paid + served 1 min ago → still eating, not complete', [paid('A', 1)], false],
    ['paid + served 21 min ago → complete', [paid('A', 21)], true],
    ['exactly 20 min ago → complete', [paid('A', 20)], true],
    ['mixed: one round 25 min ago, latest 1 min ago → not complete', [paid('A', 25), paid('B', 1)], false],
    ['mixed: both rounds older than 20 min → complete', [paid('A', 45), paid('B', 22)], true],
    ['mixed: latest round unpaid → not complete regardless of age', [paid('A', 45), order('B', 'served', 'Pending')], false],
    ['cancelled round is ignored for the grace clock', [paid('A', 30), order('B', 'cancelled', 'Pending', { paidAt: new Date(now).toISOString() })], true],
    ['no paidAt → falls back to updatedAt', [order('A', 'served', 'Paid', { updatedAt: new Date(now - 2 * MIN).toISOString() })], false],
    ['no timestamps at all → today\'s rule (complete)', [order('A', 'served', 'Paid')], true],
    ['still cooking (profile with a kitchen but tracking off) → not complete', [order('A', 'preparing', 'Paid', { paidAt: new Date(now - 30 * MIN).toISOString() })], false],
  ])('%s', (_l, orders, expected) => expect(isGuestVisitComplete(orders, NO_TRACKING, now)).toBe(expected))

  test('the default profile ignores the grace period (today\'s behaviour)', () => {
    expect(isGuestVisitComplete([paid('A', 0)], undefined, now)).toBe(true)
    expect(isGuestVisitComplete([paid('A', 0)], { orderFlow: { customerTracking: true } }, now)).toBe(true)
  })

  test('the full staff flags are honoured too (kitchenDisplay / servedStep false)', () => {
    expect(isGuestVisitComplete([paid('A', 1)], { orderFlow: { kitchenDisplay: false } }, now)).toBe(false)
    expect(isGuestVisitComplete([paid('A', 1)], { orderFlow: { servedStep: false } }, now)).toBe(false)
  })

  test('evaluateGuestVisit reports how long until the grace period is over', () => {
    expect(evaluateGuestVisit([paid('A', 25), paid('B', 5)], NO_TRACKING, now)).toEqual({ complete: false, recheckInMs: 15 * MIN })
    expect(evaluateGuestVisit([paid('A', 25)], NO_TRACKING, now)).toEqual({ complete: true, recheckInMs: null })
    expect(evaluateGuestVisit([order('A', 'served', 'Pending')], NO_TRACKING, now)).toEqual({ complete: false, recheckInMs: null })
    expect(evaluateGuestVisit([paid('A', 0)], undefined, now)).toEqual({ complete: true, recheckInMs: null })
  })
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

  test('no-tracking profile: a just-paid guest is NOT told guest mode is over; the popup comes once the grace period elapses (timer, no new order event)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      setActiveTenant({ slug: 'counter', operations: NO_TRACKING })
      // Paid (and auto-"served") 19 minutes ago — still inside the grace period.
      serve(order('ORD-1', 'served', 'Paid', { paidAt: new Date(Date.now() - 19 * MIN).toISOString() }),
        order('ORD-2', 'served', 'Paid', { paidAt: new Date(Date.now() - 30 * MIN).toISOString() }))
      renderAt()
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
      await act(async () => { await vi.advanceTimersByTimeAsync(10) })
      expect(screen.queryByTestId('guest-session-end')).not.toBeInTheDocument()
      expect(localStorage.getItem('guest_session_ended')).toBeNull()

      // 1 min + the re-check beat later the grace period is over: the
      // component re-checks on its own and the popup appears.
      api.get.mockClear()
      await act(async () => { await vi.advanceTimersByTimeAsync(1 * MIN + 1500) })
      expect(api.get).toHaveBeenCalled()
      expect(await screen.findByTestId('guest-session-end')).toBeInTheDocument()
      expect(localStorage.getItem('guest_session_ended')).toBe('1')
    } finally {
      vi.useRealTimers()
    }
  })

  test('default profile: the popup still appears immediately on paid + served (no grace)', async () => {
    setActiveTenant({ slug: 'cafe', operations: { orderFlow: { customerSelfOrder: true, customerTracking: true } } })
    serve(order('ORD-1', 'served', 'Paid', { paidAt: new Date().toISOString() }), order('ORD-2', 'served', 'Paid', { paidAt: new Date().toISOString() }))
    renderAt()
    expect(await screen.findByTestId('guest-session-end')).toBeInTheDocument()
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
