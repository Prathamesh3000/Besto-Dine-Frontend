/**
 * Waiter/BillPage — the bill shown and the amount handed to the payment
 * screen (sent on as amountPaid) are the order's STORED bill, not a
 * re-price from the current tax settings. Marking Paid can't change
 * order.total and the server rejects amountPaid below
 * total − manualDiscount − amountPaid (AMOUNT_TOO_LOW).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/socket', () => ({ joinRoom: vi.fn() }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() }
  return {
    default: api,
    settingsAPI: { getSettings: vi.fn() },
    promotionsAPI: { applyCoupon: vi.fn() },
  }
})

import { settingsAPI } from '@/utils/api'
import BillPage from '@/Pages/Waiter/BillPage'

let landed = null
function Probe() { landed = useLocation().state; return <div>payment-page</div> }

// Placed at 5% GST + 10% service → 1000 + 50 + 100 = 1150.
const ORDER = {
  _id: 'oid1', orderId: 'ORD-1', type: 'dine-in', paymentStatus: 'Pending',
  items: [{ _id: 'i1', name: 'Thali', price: 500, quantity: 2 }],
  gst: 50, gstPercentage: 5, serviceCharge: 100, serviceChargePercentage: 10,
  total: 1150, manualDiscount: 50, amountPaid: 0,
}

function renderBill(order) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/waiter/bill', state: { tableId: 't1', tableName: '7', activeOrder: order } }]}>
      <Routes>
        <Route path="/waiter/bill" element={<BillPage />} />
        <Route path="/waiter/payment" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  landed = null
  // Live settings changed AFTER the order was placed: 18% GST, 5% service.
  settingsAPI.getSettings.mockResolvedValue({ data: {
    general: { cafeName: 'Cafe Uno' },
    taxes: { gst: { enabled: true, value: 18 }, serviceCharge: { enabled: true, value: 5 } },
  } })
})

describe('Waiter BillPage — settles the stored bill', () => {
  test('live tax rates differ from the stored breakdown: shows stored rows and settles total − manualDiscount', async () => {
    const user = renderBill(ORDER)
    await screen.findByText('Cafe Uno')
    expect(screen.getByText('GST (5%)')).toBeInTheDocument()
    expect(screen.getByText('Service Charge (10%)')).toBeInTheDocument()
    expect(screen.queryByText(/GST \(18%\)/)).not.toBeInTheDocument()
    expect(screen.getByText('₹1100.00')).toBeInTheDocument() // Total Payment

    await user.click(screen.getByRole('button', { name: /Pay Bill — ₹1100\.00/ }))
    await screen.findByText('payment-page')
    expect(landed).toMatchObject({ orderId: 'oid1', amount: 1150 - 50 - 0 })
  })

  test('part already paid: settles total − manualDiscount − amountPaid', async () => {
    const user = renderBill({ ...ORDER, amountPaid: 300 })
    await screen.findByText('Cafe Uno')
    expect(screen.getByText('Amount Due')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Pay Bill — ₹800\.00/ }))
    await waitFor(() => expect(landed).toMatchObject({ amount: 1150 - 50 - 300 }))
  })
})
