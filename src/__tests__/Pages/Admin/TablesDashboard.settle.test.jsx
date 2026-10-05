/**
 * Admin/TablesDashboard — the drawer's "Done" (settle) sends amountPaid
 * from the orders' STORED bill (total − manualDiscount − amountPaid),
 * not a re-price from the current tax settings; otherwise a tax-rate
 * edit makes the server reject the settle with AMOUNT_TOO_LOW.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
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

async function openAndSettle(order) {
  api.get.mockImplementation((url) => (url === '/orders/active-list/table/t1'
    ? Promise.resolve({ data: { success: true, orders: [order] } })
    : Promise.resolve({ data: { success: true } })))
  const user = userEvent.setup()
  render(<MemoryRouter><TablesDashboard /></MemoryRouter>)
  await user.click(screen.getByText('T7'))
  await screen.findByText('GST (5%)')
  expect(screen.getByText('Service Charge (10%)')).toBeInTheDocument()
  expect(screen.queryByText('GST (18%)')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Proceed to Pay' }))
  const showsAmountDue = screen.queryAllByText('Amount Due').length > 0
  await user.click(screen.getByText('Cash'))
  await user.click(screen.getByRole('button', { name: /Done/ }))
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/oid1/status', expect.objectContaining({ paymentStatus: 'Paid' })))
  const body = api.patch.mock.calls.find((c) => c[0] === '/orders/oid1/status' && c[1].paymentStatus === 'Paid')[1]
  return { body, showsAmountDue }
}

describe('TablesDashboard drawer — settles the stored bill', () => {
  test('live rates differ from the stored breakdown → amountPaid = stored total − manualDiscount', async () => {
    const { body, showsAmountDue } = await openAndSettle({ ...ORDER, manualDiscount: 100 })
    expect(showsAmountDue).toBe(false)
    expect(body).toMatchObject({ paymentMethod: 'Cash', amountPaid: 1150 - 100, manualDiscount: 100 })
  })

  test('part already paid → amountPaid = stored total − manualDiscount − amountPaid', async () => {
    const { body, showsAmountDue } = await openAndSettle({ ...ORDER, manualDiscount: 50, amountPaid: 300 })
    expect(body.amountPaid).toBe(1150 - 50 - 300)
    // The drawer shows the remainder it is about to settle.
    expect(showsAmountDue).toBe(true)
  })
})
