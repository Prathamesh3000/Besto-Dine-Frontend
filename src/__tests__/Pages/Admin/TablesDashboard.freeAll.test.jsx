import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
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
const h = vi.hoisted(() => ({ status: 'occupied', refetch: null }))
vi.mock('@/hooks/queries/useAdminBootstrap', () => ({
  useAdminBootstrap: () => ({
    data: {
      tables: [{ _id: 't1', name: 'T7', capacity: 4, status: h.status, area: { _id: 'a1', name: 'Main', isActive: true } }],
      areas: [{ _id: 'a1', name: 'Main', isActive: true }], reservations: [], staff: [], settings: { taxes: {} },
    },
    isLoading: false, isError: false, refetch: h.refetch,
  }),
}))

import api from '@/utils/api'
import toast from 'react-hot-toast'
import AuthContext from '@/Context/AuthContext'
import TablesDashboard from '@/Pages/Admin/TablesDashboard'

const ui = (role) => (
  <AuthContext.Provider value={{ user: { role } }}>
    <MemoryRouter><TablesDashboard /></MemoryRouter>
  </AuthContext.Provider>
)

beforeEach(() => {
  vi.clearAllMocks()
  h.status = 'occupied'
  h.refetch = vi.fn()
  api.get.mockResolvedValue({ data: { success: true, orders: [] } })
})

describe('TablesDashboard — Free all tables', () => {
  test.each(['captain', 'waiter'])('hidden for %s', (role) => {
    render(ui(role))
    expect(screen.queryByRole('button', { name: /free all tables/i })).not.toBeInTheDocument()
  })

  test('disabled when nothing is occupied', () => {
    h.status = 'free'
    render(ui('admin'))
    expect(screen.getByRole('button', { name: /free all tables/i })).toBeDisabled()
  })

  test('confirm -> POST /tables/free-all -> success toast', async () => {
    const user = userEvent.setup()
    api.post.mockResolvedValue({ data: { success: true, freedTableCount: 3, closedOrderCount: 0, customersSignedOut: 5 } })
    render(ui('admin'))
    await user.click(screen.getByRole('button', { name: /free all tables/i }))
    expect(screen.getByText(/Every customer currently seated will be signed out/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Free all' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/tables/free-all', {}))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('3 tables freed — 5 customers signed out'))
  })

  test('409 ORDER_NOT_EMPTY -> reason modal -> resends force + reason', async () => {
    const user = userEvent.setup()
    api.post
      .mockRejectedValueOnce({ response: { data: { code: 'ORDER_NOT_EMPTY', tableCount: 2, orderCount: 4, totalAmount: 1200 } } })
      .mockResolvedValueOnce({ data: { success: true, freedTableCount: 2, closedOrderCount: 4, customersSignedOut: 1 } })
    render(ui('manager'))
    await user.click(screen.getByRole('button', { name: /free all tables/i }))
    await user.click(screen.getByRole('button', { name: 'Free all' }))
    expect(await screen.findByText(/2 tables have 4 open orders totalling ₹1200/)).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: /write off & free all/i })
    expect(confirm).toBeDisabled()
    await user.type(screen.getByLabelText(/reason/i), 'End of day')
    await user.click(confirm)
    await waitFor(() => expect(api.post).toHaveBeenLastCalledWith('/tables/free-all', { force: true, reason: 'End of day' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 tables freed — 1 customers signed out'))
  })
})
