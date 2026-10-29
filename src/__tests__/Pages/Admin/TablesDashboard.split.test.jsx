/**
 * Admin/TablesDashboard — "Split payment" in the drawer's settle view:
 * tender lines covering the stored amount due are sent as `payments`
 * (no paymentMethod / amountPaid; the server derives them).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
// No AuthProvider in this test — the operations profile falls back to defaults.
vi.mock('@/hooks/useOperations', async () => {
  const { DEFAULT_OPERATIONS } = await import('@/utils/operations')
  return { default: () => DEFAULT_OPERATIONS, useOperations: () => DEFAULT_OPERATIONS }
})
vi.mock('@/Pages/Admin/components/AddReservationModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddAreaModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddTableModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/BulkAddTablesModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/MergeTables', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/QRManagementModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/LateArrivalBanner', () => ({ default: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api }
})
// Live settings changed AFTER the order was placed: 18% GST, 5% service.
const BOOTSTRAP = {
  data: {
    tables: [{ _id: 't1', name: 'T7', capacity: 4, status: 'occupied', area: { _id: 'a1', name: 'Main', isActive: true } }],
    areas: [{ _id: 'a1', name: 'Main', isActive: true }],
    reservations: [],
    staff: [],
    settings: { taxes: { gst: { enabled: true, value: 18 }, serviceCharge: { enabled: true, value: 5 } } },
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}
vi.mock('@/hooks/queries/useAdminBootstrap', () => ({ useAdminBootstrap: () => BOOTSTRAP }))

import api from '@/utils/api'
import TablesDashboard from '@/Pages/Admin/TablesDashboard'

// Placed at 5% GST + 10% service → 1000 + 50 + 100 = 1150.
const ORDER = {
  _id: 'oid1', orderId: 'ORD-1', type: 'dine-in', paymentStatus: 'Pending', status: 'served',
  items: [{ _id: 'i1', name: 'Thali', price: 500, quantity: 2 }],
  gst: 50, gstPercentage: 5, serviceCharge: 100, serviceChargePercentage: 10,
  total: 1150, manualDiscount: 0, amountPaid: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  api.patch.mockResolvedValue({ data: { success: true } })
})


describe('TablesDashboard drawer — split payment', () => {
  test('cash + UPI covering the stored bill send payments[]', async () => {
    api.get.mockImplementation((url) => (url === '/orders/active-list/table/t1'
      ? Promise.resolve({ data: { success: true, orders: [{ ...ORDER, manualDiscount: 150 }] } })
      : Promise.resolve({ data: { success: true } })))
    const user = userEvent.setup()
    render(<MemoryRouter><TablesDashboard /></MemoryRouter>)
    await user.click(screen.getByText('T7'))
    await screen.findByText('GST (5%)')
    await user.click(screen.getByRole('button', { name: 'Proceed to Pay' }))
    await user.click(screen.getByRole('button', { name: 'Split payment' }))
    const done = screen.getByRole('button', { name: /Done/ })
    expect(done).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Add payment line/ }))
    fireEvent.change(screen.getByLabelText('Payment amount 1'), { target: { value: '400' } })
    expect(screen.getByTestId('split-tender-summary')).toHaveTextContent('Remaining ₹600.00')
    await user.click(screen.getByRole('button', { name: /Add payment line/ }))
    expect(screen.getByLabelText('Payment amount 2')).toHaveValue(600)
    expect(done).toBeEnabled()
    await user.click(done)

    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const [url, body, cfg] = api.patch.mock.calls.find((c) => c[0] === '/orders/oid1/status')
    expect(url).toBe('/orders/oid1/status')
    expect(body).toEqual({
      paymentStatus: 'Paid',
      payments: [{ method: 'cash', amount: 400 }, { method: 'upi', amount: 600 }],
      manualDiscount: 150,
    })
    expect(cfg.headers['Idempotency-Key']).toEqual(expect.any(String))
  })
})
