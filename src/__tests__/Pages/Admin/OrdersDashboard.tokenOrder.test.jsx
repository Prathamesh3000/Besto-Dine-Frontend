/**
 * Admin/OrdersDashboard — token-number mode (operations tables.useTables:false).
 *   - Dine In tab gains "New token order": posts a dine-in order with NO
 *     tableId and toasts the token the server returns.
 *   - Rows show "Token T-042" where the table name goes.
 *   - Default profile: no such button; rows unchanged.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../../_helpers/queryWrapper'
import { DEFAULT_OPERATIONS } from '@/utils/operations'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({
  default: () => {},
  useSocketConnected: () => true,
  useSocketReconnect: () => {},
}))
vi.mock('@/Context/AdminBranchContext', () => ({
  useAdminBranch: () => ({ selectedBranchId: 'b1', branches: [{ _id: 'b1', name: 'MG Road' }], isLocked: false }),
}))
const opsState = { current: null }
vi.mock('@/hooks/useOperations', () => ({
  default: () => opsState.current,
  useOperations: () => opsState.current,
}))
const DINE = { data: [], isLoading: false, isError: false, refetch: vi.fn() }
const PAST = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }
vi.mock('@/hooks/queries/adminQueries', () => ({
  useAdminDineInArchive: () => DINE,
  usePastOrdersPage: () => PAST,
}))
vi.mock('@/Pages/Admin/components/OrderDetailsModal', () => ({ default: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() }
  return { default: api, settingsAPI: { getSettings: vi.fn() } }
})

import api, { settingsAPI } from '@/utils/api'
import toast from 'react-hot-toast'
import OrdersDashboard from '@/Pages/Admin/OrdersDashboard'

const THALI = { _id: 'm1', name: 'Thali', finalPrice: 500, status: 'active' }
const tokenOps = { ...DEFAULT_OPERATIONS, tables: { ...DEFAULT_OPERATIONS.tables, useTables: false } }
const now = new Date().toISOString()
const TOKEN_ORDER = {
  _id: 'tk1', id: 'ORD-TK1', type: 'dine-in', table: null, tableId: 'TA', tokenNumber: 'T-042',
  user: 'Asha', items: [{ name: 'Dosa', price: 120, quantity: 1 }], total: 120, status: 'new',
  paymentStatus: 'Pending', createdAt: now, updatedAt: now,
}

beforeEach(() => {
  vi.clearAllMocks()
  opsState.current = DEFAULT_OPERATIONS
  DINE.data = []
  api.get.mockImplementation((url) => (String(url).startsWith('/menu')
    ? Promise.resolve({ data: { data: [THALI] } })
    : Promise.resolve({ data: { success: true } })))
  settingsAPI.getSettings.mockResolvedValue({ data: { taxes: { gst: { enabled: true, value: 5 } } } })
  api.post.mockResolvedValue({ data: { success: true, order: { _id: 'oid1', orderId: 'ORD-1', tokenNumber: 'T-007' } } })
})

const renderAt = (tab) => render(
  <QueryClientProvider client={makeQueryClient()}>
    <MemoryRouter initialEntries={[`/admin/orders?tab=${tab}`]}>
      <OrdersDashboard />
    </MemoryRouter>
  </QueryClientProvider>,
)

describe('OrdersDashboard — token-number mode', () => {
  test('default profile: no "New token order" button', () => {
    renderAt('live')
    expect(screen.queryByRole('button', { name: /New token order/ })).not.toBeInTheDocument()
  })

  test('useTables:false: "New token order" posts a dine-in order without tableId and toasts the token', async () => {
    opsState.current = tokenOps
    const user = userEvent.setup()
    renderAt('live')
    await user.click(screen.getByRole('button', { name: /New token order/ }))
    expect(screen.getByText('New dine-in (token) order')).toBeInTheDocument()
    await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
    await user.type(await screen.findByPlaceholderText('Search by item name'), 'Tha')
    await user.click(await screen.findByText('Thali'))
    await user.click(screen.getByRole('button', { name: 'Place Order' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ type: 'dine-in', branchId: 'b1' })))
    const payload = api.post.mock.calls[0][1]
    expect(payload).not.toHaveProperty('tableId')
    expect(payload).not.toHaveProperty('pickupLocation')
    expect(payload.items).toEqual([expect.objectContaining({ menuItem: 'm1', quantity: 1 })])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('T-007')))
    // The success popup shows the token too.
    expect(await screen.findByTestId('placed-token')).toHaveTextContent('T-007')
    await waitFor(() => expect(DINE.refetch).toHaveBeenCalled())
  })

  test('the button is Dine In only — not on the Takeaway tab', () => {
    opsState.current = tokenOps
    renderAt('takeaway')
    expect(screen.queryByRole('button', { name: /New token order/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add Order/ })).toBeInTheDocument()
  })

  test('rows show "Token T-042" where the table goes (never Takeaway)', () => {
    opsState.current = tokenOps
    DINE.data = [TOKEN_ORDER]
    renderAt('live')
    expect(screen.getByText('Token T-042')).toBeInTheDocument()
    // No "Takeaway" badge on the row (the tab button of that name is not a badge).
    expect(screen.queryByText('Takeaway', { selector: 'span' })).not.toBeInTheDocument()
  })
})
