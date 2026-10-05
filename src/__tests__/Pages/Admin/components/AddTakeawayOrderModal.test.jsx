/**
 * Staff takeaway order (Admin OrdersDashboard → AddTakeawayOrderModal).
 *
 * The staff discount is sent IN the create call as `manualDiscount`
 * (POST /orders stamps it at creation for staff callers: ≥ 0, ≤ total,
 * paise). There is no follow-up PATCH /orders/:id/status for it, and
 * order.total still carries the full server bill.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../../../_helpers/queryWrapper'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
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
import OrdersDashboard from '@/Pages/Admin/OrdersDashboard'
import AddTakeawayOrderModal from '@/Pages/Admin/components/AddTakeawayOrderModal'

const THALI = { _id: 'm1', name: 'Thali', finalPrice: 500, status: 'active' }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockImplementation((url) => (String(url).startsWith('/menu')
    ? Promise.resolve({ data: { data: [THALI] } })
    : Promise.resolve({ data: { success: true } })))
  settingsAPI.getSettings.mockResolvedValue({ data: { taxes: { gst: { enabled: true, value: 5 } } } })
  api.post.mockResolvedValue({ data: { success: true, order: { _id: 'oid1', orderId: 'ORD-TK-1' } } })
  api.patch.mockResolvedValue({ data: { success: true } })
})

async function buildOrder(user, { discount }) {
  await user.type(await screen.findByPlaceholderText('Search by item name'), 'Tha')
  await user.click(await screen.findByText('Thali'))
  if (discount) {
    const select = screen.getAllByRole('combobox').find((s) => [...s.options].some((o) => o.value === String(discount)))
    await user.selectOptions(select, String(discount))
  }
  await user.click(screen.getByRole('button', { name: 'Place Order' }))
}

describe('AddTakeawayOrderModal — payload', () => {
  test('carries manualDiscount (paise) with the full server bill as total', async () => {
    const onPlaceOrder = vi.fn()
    const user = userEvent.setup()
    render(<AddTakeawayOrderModal onClose={() => {}} onPlaceOrder={onPlaceOrder} adminBranches={[{ _id: 'b1', name: 'MG Road' }]} activeBranchId="b1" />)
    await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
    await buildOrder(user, { discount: 100 })
    expect(onPlaceOrder).toHaveBeenCalledTimes(1)
    const payload = onPlaceOrder.mock.calls[0][0]
    // ₹500 + 5% GST = ₹525; the discount is outside order.total.
    expect(payload).toMatchObject({ type: 'takeaway', branchId: 'b1', total: 525, manualDiscount: 100 })
    expect(payload.items).toEqual([expect.objectContaining({ menuItem: 'm1', price: 500, quantity: 1 })])
  })

  test('no discount → no manualDiscount field', async () => {
    const onPlaceOrder = vi.fn()
    const user = userEvent.setup()
    render(<AddTakeawayOrderModal onClose={() => {}} onPlaceOrder={onPlaceOrder} adminBranches={[{ _id: 'b1', name: 'MG Road' }]} activeBranchId="b1" />)
    await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
    await buildOrder(user, { discount: 0 })
    expect(onPlaceOrder.mock.calls[0][0]).not.toHaveProperty('manualDiscount')
  })
})

describe('OrdersDashboard — staff takeaway create', () => {
  test('POST /orders body carries manualDiscount and no PATCH is issued for the discount', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={makeQueryClient()}>
        <MemoryRouter initialEntries={['/admin/orders?tab=takeaway']}>
          <OrdersDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await user.click(await screen.findByRole('button', { name: /Add Order/ }))
    await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
    await buildOrder(user, { discount: 100 })

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ total: 525, manualDiscount: 100 })))
    // Let the handler finish before checking nothing else was sent.
    await waitFor(() => expect(DINE.refetch).toHaveBeenCalled())
    expect(api.patch).not.toHaveBeenCalled()
  })
})
