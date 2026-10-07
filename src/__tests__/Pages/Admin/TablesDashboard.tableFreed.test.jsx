/**
 * Admin/TablesDashboard — table-status timing (2026-10). When the open
 * drawer's table is freed by someone else (customer paid online / from
 * the wallet, a waiter settled, the last order was cancelled), the
 * live bootstrap flips it to free; an admin sitting in the payment /
 * Edit Bill view is taken back to the drawer (now "Table Available")
 * instead of being left settling a bill that no longer exists.
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

const h = vi.hoisted(() => ({ bootstrap: null }))
const makeBootstrap = (status) => ({
  data: {
    tables: [{ _id: 't1', name: 'T7', capacity: 4, status, area: { _id: 'a1', name: 'Main', isActive: true } }],
    areas: [{ _id: 'a1', name: 'Main', isActive: true }],
    reservations: [],
    staff: [],
    settings: { taxes: {} },
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
})
vi.mock('@/hooks/queries/useAdminBootstrap', () => ({ useAdminBootstrap: () => h.bootstrap }))

import api from '@/utils/api'
import toast from 'react-hot-toast'
import TablesDashboard from '@/Pages/Admin/TablesDashboard'

const ORDER = {
  _id: 'oid1', orderId: 'ORD-1', type: 'dine-in', paymentStatus: 'Pending', status: 'new',
  items: [{ _id: 'i1', name: 'Thali', price: 500, quantity: 1 }],
  gst: 25, gstPercentage: 5, serviceCharge: 0, total: 525, manualDiscount: 0, amountPaid: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  h.bootstrap = makeBootstrap('occupied')
  api.get.mockImplementation((url) => (url === '/orders/active-list/table/t1'
    ? Promise.resolve({ data: { success: true, orders: [ORDER] } })
    : Promise.resolve({ data: { success: true } })))
})

const ui = () => <MemoryRouter><TablesDashboard /></MemoryRouter>

describe('TablesDashboard drawer — table freed elsewhere', () => {
  test('payment view open → leaves it, shows "Table Available" and a toast', async () => {
    const user = userEvent.setup()
    const { rerender } = render(ui())
    await user.click(screen.getByText('T7'))
    await user.click(await screen.findByRole('button', { name: 'Proceed to Pay' }))
    expect(screen.getByText('Select Payment Method')).toBeInTheDocument()

    h.bootstrap = makeBootstrap('free') // socket → refetch → table free
    rerender(ui())

    expect(await screen.findByText('Table Available')).toBeInTheDocument()
    expect(screen.queryByText('Select Payment Method')).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Bill settled — table is now free')
    expect(api.patch).not.toHaveBeenCalled()
  })

  test('plain occupied drawer just turns into the free drawer (no toast)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(ui())
    await user.click(screen.getByText('T7'))
    await screen.findByRole('button', { name: 'Proceed to Pay' })

    h.bootstrap = makeBootstrap('free')
    rerender(ui())

    await waitFor(() => expect(screen.getByText('Table Available')).toBeInTheDocument())
    expect(toast.success).not.toHaveBeenCalled()
  })

  test('our own settle keeps the success screen when the table frees', async () => {
    api.patch.mockResolvedValue({ data: { success: true } })
    const user = userEvent.setup()
    const { rerender } = render(ui())
    await user.click(screen.getByText('T7'))
    await user.click(await screen.findByRole('button', { name: 'Proceed to Pay' }))
    await user.click(screen.getByText('Cash'))
    await user.click(screen.getByRole('button', { name: /Done/ }))
    await screen.findByText(/Bill Paid via/)

    h.bootstrap = makeBootstrap('free')
    rerender(ui())

    expect(screen.getByText(/Bill Paid via/)).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalledWith('Bill settled — table is now free')
  })
})

