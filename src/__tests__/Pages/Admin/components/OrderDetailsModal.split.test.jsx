/**
 * Admin/OrderDetailsModal — takeaway "Split payment": tender lines that
 * must cover the amount due are sent as `payments`; the single-method
 * flow is the default and unchanged.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api, settingsAPI: { getSettings: () => Promise.resolve({ data: null }) } }
})

import api from '@/utils/api'
import OrderDetailsModal from '@/Pages/Admin/components/OrderDetailsModal'

const ORDER = {
  _id: 'tk1', id: 'ORD-TK1', status: 'new', paymentStatus: 'Pending', type: 'takeaway',
  user: 'Asha', total: 500, manualDiscount: 0, amountPaid: 0,
  items: [{ name: 'Thali', price: 500, quantity: 1 }], createdAt: new Date().toISOString(),
}

async function openPayment(order = ORDER) {
  const user = userEvent.setup()
  render(<OrderDetailsModal order={order} onClose={() => {}} onRefresh={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /^payment$/i }))
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe('OrderDetailsModal — split payment', () => {
  test('single method is the default flow (no payments field)', async () => {
    const user = await openPayment()
    expect(screen.queryByTestId('split-tender-editor')).not.toBeInTheDocument()
    await user.click(screen.getByText('Cash'))
    await user.click(screen.getByRole('button', { name: /Done/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    expect(api.patch.mock.calls[0][1]).toEqual({ paymentStatus: 'Paid', paymentMethod: 'Cash', amountPaid: 500 })
  })

  test('cash + UPI lines covering the bill send payments[]', async () => {
    const user = await openPayment()
    await user.click(screen.getByRole('button', { name: 'Split payment' }))
    const done = screen.getByRole('button', { name: /Done/ })
    expect(done).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Add payment line/ }))
    fireEvent.change(screen.getByLabelText('Payment amount 1'), { target: { value: '200' } })
    expect(screen.getByTestId('split-tender-summary')).toHaveTextContent('Remaining ₹300.00')
    expect(done).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Add payment line/ }))
    // The new line is pre-filled with what is still unpaid.
    expect(screen.getByLabelText('Payment amount 2')).toHaveValue(300)
    expect(screen.getByLabelText('Payment method 2')).toHaveValue('upi')
    expect(done).toBeEnabled()

    await user.click(done)
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [url, body, cfg] = api.patch.mock.calls[0]
    expect(url).toBe('/orders/tk1/status')
    expect(body).toEqual({
      paymentStatus: 'Paid',
      payments: [{ method: 'cash', amount: 200 }, { method: 'upi', amount: 300 }],
    })
    expect(cfg.headers['Idempotency-Key']).toEqual(expect.any(String))
  })

  test('only cash may be over the amount due', async () => {
    const user = await openPayment()
    await user.click(screen.getByRole('button', { name: 'Split payment' }))
    await user.click(screen.getByRole('button', { name: /Add payment line/ }))
    fireEvent.change(screen.getByLabelText('Payment amount 1'), { target: { value: '600' } })
    expect(screen.getByRole('button', { name: /Done/ })).toBeEnabled() // cash change
    fireEvent.change(screen.getByLabelText('Payment method 1'), { target: { value: 'card' } })
    expect(screen.getByRole('button', { name: /Done/ })).toBeDisabled()
  })

  test('a part-paid order only has to cover the remainder', async () => {
    const user = await openPayment({ ...ORDER, paymentStatus: 'Partially Paid', amountPaid: 100, manualDiscount: 50 })
    await user.click(screen.getByRole('button', { name: 'Split payment' }))
    await user.click(screen.getByRole('button', { name: /Add payment line/ }))
    expect(screen.getByLabelText('Payment amount 1')).toHaveValue(350)
  })
})
