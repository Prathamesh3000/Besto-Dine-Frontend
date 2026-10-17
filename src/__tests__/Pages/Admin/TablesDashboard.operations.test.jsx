/**
 * Admin/TablesDashboard — Operations Control Panel.
 *   - tables.mergeTables === false hides Merge / Unmerge
 *   - tables.assignWaiters === false hides the assign-waiter control
 *   - a pay-first held order ('awaiting-payment') on the table still
 *     raises the counter-payment alert, and "Mark Paid" settles it.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_OPERATIONS } from '@/utils/operations'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
const opsState = { current: null }
vi.mock('@/hooks/useOperations', () => ({
  default: () => opsState.current,
  useOperations: () => opsState.current,
}))
vi.mock('@/Pages/Admin/components/AddReservationModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddAreaModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddTableModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/BulkAddTablesModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/MergeTables', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/QRManagementModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/LateArrivalBanner', () => ({ default: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api, printAPI: {} }
})
const AREA = { _id: 'a1', name: 'Main', isActive: true }
const BOOTSTRAP = {
  data: {
    tables: [
      { _id: 't1', name: 'T7', capacity: 4, status: 'occupied', area: AREA },
      { _id: 't2', name: 'T8', capacity: 4, status: 'alert', alerts: [], area: AREA },
      { _id: 't3', name: 'T9', capacity: 2, status: 'merged', mergedWith: ['t4'], area: AREA },
      { _id: 't4', name: 'T10', capacity: 2, status: 'merged', mergedWith: ['t3'], area: AREA },
    ],
    areas: [AREA],
    reservations: [],
    staff: [{ _id: 'w1', name: 'Ravi', role: 'waiter', status: 'active', staffId: 'W1' }],
    settings: {},
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}
vi.mock('@/hooks/queries/useAdminBootstrap', () => ({ useAdminBootstrap: () => BOOTSTRAP }))

import api from '@/utils/api'
import TablesDashboard from '@/Pages/Admin/TablesDashboard'

const withTables = (tables) => ({ ...DEFAULT_OPERATIONS, tables: { ...DEFAULT_OPERATIONS.tables, ...tables } })

const HELD_LIVE = {
  _id: 'h1', id: 'ORD-H1', status: 'awaiting-payment', paymentStatus: 'Pending', paymentMethod: 'cash',
  table: { _id: 't1', name: 'T7' }, user: 'Asha', isRegistered: false, total: 300, items: [],
}
const HELD_DETAIL = {
  _id: 'h1', orderId: 'ORD-H1', id: 'ORD-H1', status: 'awaiting-payment', paymentStatus: 'Pending',
  paymentMethod: 'cash', user: 'Asha', phone: '', table: 'T7', total: 300, amountPaid: 0, manualDiscount: 0,
  items: [{ name: 'Thali', price: 300, quantity: 1 }], createdAt: new Date().toISOString(),
  counterPaymentRequestedAt: new Date().toISOString(),
}

function mockApi({ held = false } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/orders/active-list/table/t1') return Promise.resolve({ data: { success: true, orders: [] } })
    if (url === '/orders/live') return Promise.resolve({ data: { success: true, orders: held ? [HELD_LIVE] : [] } })
    if (url === '/orders/h1/detail') return Promise.resolve({ data: { success: true, order: HELD_DETAIL } })
    return Promise.resolve({ data: { success: true } })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  opsState.current = DEFAULT_OPERATIONS
  api.patch.mockResolvedValue({ data: { success: true } })
  mockApi()
})

const renderPage = () => render(<MemoryRouter><TablesDashboard /></MemoryRouter>)

describe('TablesDashboard — operations profile', () => {
  test('defaults: Merge Table button is shown', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Merge Table/ })).toBeInTheDocument()
  })

  test('mergeTables:false hides Merge Table and Unmerge', async () => {
    opsState.current = withTables({ mergeTables: false })
    const user = userEvent.setup()
    renderPage()
    expect(screen.queryByRole('button', { name: /Merge Table/ })).not.toBeInTheDocument()
    await user.click(screen.getAllByText(/T9/)[0])
    await waitFor(() => expect(screen.queryByRole('button', { name: /Unmerge Table/ })).not.toBeInTheDocument())
  })

  test('mergeTables on: a merged group offers Unmerge', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByText(/T9/)[0])
    expect(await screen.findByRole('button', { name: /Unmerge Table/ })).toBeInTheDocument()
  })

  test('assignWaiters on: table drawer offers the waiter picker', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('T8'))
    expect(await screen.findByText('Select Waiter to Assign')).toBeInTheDocument()
  })

  test('assignWaiters:false hides the waiter picker', async () => {
    opsState.current = withTables({ assignWaiters: false })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('T8'))
    await screen.findByText('Seating Capacity')
    expect(screen.queryByText('Select Waiter to Assign')).not.toBeInTheDocument()
  })
})

describe('TablesDashboard — held (awaiting-payment) order on a table', () => {
  test('counter-payment alert shows and Mark Paid settles the held order in cash', async () => {
    mockApi({ held: true })
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('T7'))
    expect(await screen.findByText('Counter-payment requested')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Mark Paid · Cash/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/h1/status',
      expect.objectContaining({ paymentStatus: 'Paid', paymentMethod: 'cash', amountPaid: 300 })))
  })

  test('no held order → no alert', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('T7'))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/orders/live'))
    expect(screen.queryByText('Counter-payment requested')).not.toBeInTheDocument()
  })
})
