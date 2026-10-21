/**
 * Admin/OrdersDashboard — pay-first held orders ('awaiting-payment').
 * The cashier sees them under an "Awaiting payment" pill (never the raw
 * status code) with "Mark paid (cash)" and "Cancel" actions that go
 * through the normal PATCH /orders/:id/status.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
  useAdminBranch: () => ({ selectedBranchId: null, branches: [], isLocked: false }),
}))
// Default operations profile (tables on) — the dashboard reads it for
// token-number mode; no AuthProvider in this test.
vi.mock('@/hooks/useOperations', () => ({ default: () => null, useOperations: () => null }))
vi.mock('@/Pages/Admin/components/OrderDetailsModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddTakeawayOrderModal', () => ({ default: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api }
})
const archive = { data: [], refetch: vi.fn() }
vi.mock('@/hooks/queries/adminQueries', () => ({
  useAdminDineInArchive: () => ({ data: archive.data, isLoading: false, isError: false, refetch: archive.refetch }),
  usePastOrdersPage: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}))

import api from '@/utils/api'
import OrdersDashboard from '@/Pages/Admin/OrdersDashboard'

const now = new Date().toISOString()
const order = (over) => ({
  _id: over.id.toLowerCase(), type: 'dine-in', table: { _id: 't1', name: 'T1' }, tableId: 'T1',
  user: 'Asha', items: [{ name: 'Dosa', price: 120, quantity: 1 }], total: 120,
  paymentStatus: 'Pending', createdAt: now, updatedAt: now, ...over,
})
const HELD = order({ id: 'ORD-HELD', status: 'awaiting-payment', paymentMethod: 'cash', total: 250 })
const NEW = order({ id: 'ORD-NEW', status: 'new' })
const HELD_TA = order({ id: 'ORT-HELD', type: 'takeaway', table: null, tableId: 'TA', status: 'awaiting-payment' })

function renderAt(tab) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/admin/orders?tab=${tab}`]}>
        <OrdersDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  api.patch.mockResolvedValue({ data: { success: true } })
  archive.data = [HELD, NEW, HELD_TA]
})

describe('OrdersDashboard — awaiting-payment orders', () => {
  test('dine-in: "Awaiting payment" pill + label, never the raw status code', async () => {
    renderAt('live')
    expect(screen.getByRole('button', { name: 'Awaiting payment (01)' })).toBeInTheDocument()
    // All = held + new
    expect(screen.getByRole('button', { name: 'All (02)' })).toBeInTheDocument()
    expect(screen.getAllByText('Awaiting payment').length).toBeGreaterThan(0)
    expect(screen.queryByText(/awaiting-payment/i)).not.toBeInTheDocument()
  })

  test('dine-in: the pill filters the list to held orders', async () => {
    const user = userEvent.setup()
    renderAt('live')
    expect(screen.getByText('ORD-NEW')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Awaiting payment (01)' }))
    expect(screen.getByText('ORD-HELD')).toBeInTheDocument()
    expect(screen.queryByText('ORD-NEW')).not.toBeInTheDocument()
  })

  test('Mark paid (cash) → PATCH paymentStatus Paid, method cash, then refetch', async () => {
    const user = userEvent.setup()
    renderAt('live')
    // Only the held order carries the cashier actions.
    const buttons = screen.getAllByRole('button', { name: 'Mark paid (cash)' })
    expect(buttons).toHaveLength(1)
    await user.click(buttons[0])
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/ord-held/status',
      expect.objectContaining({ paymentStatus: 'Paid', paymentMethod: 'cash', amountPaid: 250 })))
    await waitFor(() => expect(archive.refetch).toHaveBeenCalled())
  })

  test('Cancel → PATCH status cancelled with cancelReason admin-void (after confirm)', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAt('live')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/ord-held/status',
      { status: 'cancelled', cancelReason: 'admin-void' }))
  })

  test('Cancel is a no-op when the confirm is dismissed', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt('live')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.patch).not.toHaveBeenCalled()
  })

  test('takeaway: held order shows "Awaiting payment" pill/badge and the Mark paid action', async () => {
    const user = userEvent.setup()
    renderAt('takeaway')
    const pill = screen.getByRole('button', { name: 'Awaiting payment (01)' })
    await user.click(pill)
    const card = screen.getByText('ORT-HELD').closest('div.rounded-2xl')
    expect(within(card).getByText('Awaiting payment')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Mark paid (cash)' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/ort-held/status',
      expect.objectContaining({ paymentStatus: 'Paid', paymentMethod: 'cash' })))
  })
})
