/**
 * HealthMode/BillPreviews — dine-in table with several unpaid rounds.
 *
 * One payment settles the whole table: the page pays against the FIRST
 * round and the server settles the rest, but create-order only accepts exactly
 * what the table owes (this round's due + every other unpaid round's). So the
 * amount handed to the payment screen is the sum of the rounds' stored dues —
 * not the on-screen recompute — and never just one round (which would leave
 * the rest unpaid) nor a bare total the server may refuse.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ user: null, isLoggedIn: false, isGuest: true }) }))
vi.mock('@/Context/CartContext', () => ({ useCart: () => ({ clearCart: vi.fn() }) }))
vi.mock('@/Context/MenuContext', () => ({ useMenu: () => ({ menuItems: [] }) }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/customerOrderIds', () => ({ rememberOrderIds: vi.fn(), getCustomerOrderSession: vi.fn(() => 'sess') }))
vi.mock('@/utils/tenant', () => ({ getActiveTenant: vi.fn(() => null) }))
vi.mock('@/utils/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }), joinRoom: vi.fn() }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))
vi.mock('react-barcode', () => ({ default: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() }
  return {
    default: api,
    razorpayAPI: { createOrder: vi.fn(), verifyPayment: vi.fn(), orphanRefund: vi.fn() },
    walletAPI: { getWallet: vi.fn(), payWithWallet: vi.fn() },
    settingsAPI: { getSettings: vi.fn() },
  }
})

import api, { settingsAPI } from '@/utils/api'
import BillPreviews from '@/Pages/HealthMode/BillPreviews'

function PaymentProbe() {
  const { state } = useLocation()
  return <div data-testid="payment-state">{JSON.stringify(state)}</div>
}

const round = (id, price, extra = {}) => ({
  _id: `mongo-${id}`,
  orderId: id,
  paymentStatus: 'Pending',
  status: 'served',
  items: [{ name: `Dish ${id}`, price, quantity: 1 }],
  total: price * 1.05, // 5% GST
  amountPaid: 0,
  ...extra,
})

async function renderTable(orders) {
  localStorage.setItem('dineInTable', JSON.stringify({ _id: 't1', name: 'TB-02' }))
  api.get.mockImplementation((url) => {
    if (String(url).includes('/orders/active-list/table/')) return Promise.resolve({ data: { success: true, orders } })
    return Promise.resolve({ data: {} })
  })
  render(
    <MemoryRouter initialEntries={['/bill-preview']}>
      <Routes>
        <Route path="/bill-preview" element={<BillPreviews />} />
        <Route path="/customer/payment" element={<PaymentProbe />} />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
  await act(async () => {})
  return userEvent.setup()
}
const paymentState = () => JSON.parse(screen.getByTestId('payment-state').textContent)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  settingsAPI.getSettings.mockResolvedValue({ data: { general: { cafeName: 'Cafe Uno' }, taxes: { gst: { enabled: true, value: 5 } } } })
})

describe('BillPreviews (dine-in) — a table with several unpaid rounds', () => {
  test('one payment for the whole table against the first round: sum of every round due', async () => {
    const user = await renderTable([round('ORD-A', 100), round('ORD-B', 200), round('ORD-C', 400)])
    const btn = await screen.findByRole('button', { name: /^Pay Bill/ })
    expect(btn).toHaveTextContent('₹735.00') // 105 + 210 + 420
    await user.click(btn)
    const s = paymentState()
    expect(s.orderId).toBe('ORD-A')
    expect(s.total).toBeCloseTo(735, 2)
  })

  test('a part-paid first round counts only what it still owes; siblings net of discount and paid', async () => {
    const user = await renderTable([
      round('ORD-A', 200, { amountPaid: 100 }),            // 210 total, 100 paid -> 110 due
      round('ORD-B', 100, { manualDiscount: 5 }),          // 105 - 5 -> 100
      round('ORD-C', 100, { total: 105, amountPaid: 20 }), // 105 - 20 -> 85
    ])
    await user.click(await screen.findByRole('button', { name: /^Pay Bill/ }))
    const s = paymentState()
    expect(s.orderId).toBe('ORD-A')
    expect(s.total).toBeCloseTo(110 + 100 + 85, 2)
  })

  test('a single round is unchanged: that order id and its total', async () => {
    const user = await renderTable([round('ORD-A', 100)])
    const btn = await screen.findByRole('button', { name: /^Pay Bill/ })
    expect(btn).toHaveTextContent('₹105.00')
    await user.click(btn)
    const s = paymentState()
    expect(s.orderId).toBe('ORD-A')
    expect(s.total).toBeCloseTo(105, 2)
  })
})
