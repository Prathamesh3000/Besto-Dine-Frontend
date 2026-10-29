/**
 * Admin/components/TokenBoard — token-number mode (tables.useTables:false).
 * Lists open dine-in token orders from GET /orders/live; Mark paid (cash)
 * and Complete go through the same PATCH /orders/:id/status routes the
 * Orders dashboard uses (or /pickup in the waiter app).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/Pages/Admin/components/OrderDetailsModal', () => ({
  default: ({ order }) => <div data-testid="order-details">{order.tokenNumber}</div>,
}))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() }
  return { default: api }
})

import api from '@/utils/api'
import toast from 'react-hot-toast'
import TokenBoard, { isOpenTokenOrder, tokenPaymentState } from '@/Pages/Admin/components/TokenBoard'

const now = new Date().toISOString()
const HELD = { _id: 'h1', id: 'ORD-H1', type: 'dine-in', tokenNumber: 'T-001', status: 'awaiting-payment', paymentStatus: 'Pending', total: 250, items: [{ name: 'Thali', quantity: 1 }], user: 'Asha', createdAt: now }
const NEW = { _id: 'n1', id: 'ORD-N1', type: 'dine-in', tokenNumber: 'T-002', status: 'new', paymentStatus: 'Pending', total: 120, items: [{ name: 'Dosa', quantity: 2 }, { name: 'Chai', quantity: 1 }], createdAt: now }
const READY = { _id: 'r1', id: 'ORD-R1', type: 'dine-in', tokenNumber: 'T-003', status: 'ready', paymentStatus: 'Paid', total: 90, items: [{ name: 'Idli', quantity: 1 }], createdAt: now }
const TAKEAWAY = { _id: 'ta1', id: 'ORT-1', type: 'takeaway', tokenNumber: null, status: 'new', total: 50, items: [], createdAt: now }
const TABLE = { _id: 'tb1', id: 'ORD-TB', type: 'dine-in', table: { _id: 't1', name: 'T7' }, tokenNumber: null, status: 'new', total: 50, items: [], createdAt: now }
const SERVED = { _id: 's1', id: 'ORD-S1', type: 'dine-in', tokenNumber: 'T-000', status: 'served', paymentStatus: 'Paid', total: 50, items: [], createdAt: now }

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { success: true, orders: [HELD, NEW, READY, TAKEAWAY, TABLE, SERVED] } })
  api.patch.mockResolvedValue({ data: { success: true } })
})

const card = (token) => screen.getByText(token).closest('[data-testid="token-card"]')

describe('TokenBoard helpers', () => {
  test('isOpenTokenOrder keeps open table-less dine-in orders with a token only', () => {
    expect([HELD, NEW, READY, TAKEAWAY, TABLE, SERVED].filter(isOpenTokenOrder).map(o => o.tokenNumber)).toEqual(['T-001', 'T-002', 'T-003'])
  })
  test('tokenPaymentState: held / unpaid / paid', () => {
    expect(tokenPaymentState(HELD)).toBe('held')
    expect(tokenPaymentState(NEW)).toBe('unpaid')
    expect(tokenPaymentState(READY)).toBe('paid')
  })
})

describe('TokenBoard', () => {
  test('renders one card per open token order with token, items, total and payment state', async () => {
    render(<TokenBoard />)
    expect(await screen.findAllByTestId('token-card')).toHaveLength(3)
    expect(api.get).toHaveBeenCalledWith('/orders/live')
    expect(screen.getByText('3 open tokens')).toBeInTheDocument()

    const held = card('T-001')
    expect(within(held).getByText('Held — awaiting payment')).toBeInTheDocument()
    expect(within(held).getByText('1 item')).toBeInTheDocument()
    expect(within(held).getByText('₹250.00')).toBeInTheDocument()
    // A held order is not in the kitchen yet — no Complete.
    expect(within(held).queryByRole('button', { name: /Complete/ })).not.toBeInTheDocument()

    const fresh = card('T-002')
    expect(within(fresh).getByText('Unpaid')).toBeInTheDocument()
    expect(within(fresh).getByText('3 items')).toBeInTheDocument()

    const ready = card('T-003')
    expect(within(ready).getByText('Paid')).toBeInTheDocument()
    // Paid → no cash button.
    expect(within(ready).queryByRole('button', { name: 'Mark paid (cash)' })).not.toBeInTheDocument()
    // Excluded rows never render.
    expect(screen.queryByText('T-000')).not.toBeInTheDocument()
    expect(screen.queryByText('ORT-1')).not.toBeInTheDocument()
  })

  test('Mark paid (cash) → PATCH /orders/:id/status Paid / cash / amountPaid', async () => {
    const user = userEvent.setup()
    render(<TokenBoard />)
    await screen.findAllByTestId('token-card')
    await user.click(within(card('T-001')).getByRole('button', { name: 'Mark paid (cash)' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/h1/status',
      expect.objectContaining({ paymentStatus: 'Paid', paymentMethod: 'cash', amountPaid: 250 }), expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }) })))
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('T-001'))
  })

  test('Complete on a ready order → PATCH status served (admin default)', async () => {
    const user = userEvent.setup()
    render(<TokenBoard />)
    await screen.findAllByTestId('token-card')
    await user.click(within(card('T-003')).getByRole('button', { name: /Complete/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/r1/status', { status: 'served' }))
  })

  test('serveVia="pickup" (waiter app) → PATCH /orders/:id/pickup', async () => {
    const user = userEvent.setup()
    render(<TokenBoard serveVia="pickup" />)
    await screen.findAllByTestId('token-card')
    await user.click(within(card('T-003')).getByRole('button', { name: /Complete/ }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/orders/r1/pickup'))
  })

  test('View opens OrderDetailsModal; showDetails=false hides it', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<TokenBoard />)
    await screen.findAllByTestId('token-card')
    await user.click(screen.getByRole('button', { name: 'View token T-002' }))
    expect(screen.getByTestId('order-details')).toHaveTextContent('T-002')
    unmount()
    render(<TokenBoard showDetails={false} />)
    await screen.findAllByTestId('token-card')
    expect(screen.queryByRole('button', { name: /View token/ })).not.toBeInTheDocument()
  })

  test('canMarkPaid=false hides the cash button (plain waiter)', async () => {
    render(<TokenBoard canMarkPaid={false} />)
    await screen.findAllByTestId('token-card')
    expect(screen.queryByRole('button', { name: 'Mark paid (cash)' })).not.toBeInTheDocument()
  })

  test('empty feed → empty state', async () => {
    api.get.mockResolvedValue({ data: { success: true, orders: [TABLE, TAKEAWAY] } })
    render(<TokenBoard />)
    expect(await screen.findByText('No open token orders')).toBeInTheDocument()
  })
})
