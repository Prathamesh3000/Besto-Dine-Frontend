/**
 * Admin/PaymentsDashboard — stats + filter pills come from the API;
 * the refund action opens RefundModal on the row's refundable balance
 * and posts { orderId, amount, reason } to /razorpay/refund.
 * Payment rows use the shape of Backend/controllers/paymentController
 * getAllPayments.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@admin/RefundsDashboard', () => ({ default: () => <div>refunds-section</div> }))
vi.mock('@admin/components/PaymentDetailsModal', () => ({ default: ({ payment }) => <div>details-for-{payment?.id}</div> }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => ({
  default: { get: vi.fn() },
  razorpayAPI: { refund: vi.fn() },
}))

import { toast } from 'react-hot-toast'
import api, { razorpayAPI } from '@/utils/api'
import PaymentsDashboard from '@admin/PaymentsDashboard'

const row = (over) => ({
  id: 'ORD-1', _orderId: 'm1', table: 'Table 4', customer: 'Asha', phone: '', method: 'UPI',
  billAmount: 719.54, status: 'successful', date: '03 Oct 2026', time: '12:00 PM', createdAt: '2026-10-03T06:30:00Z',
  total: 719.54, amountPaid: 719.54, refundedAmount: 200.04, refundableBalance: 519.5, items: [], refunds: [],
  ...over,
})
const PAYMENTS = [
  row(),
  row({ id: 'ORD-2', _orderId: 'm2', table: 'Takeaway', customer: 'Ravi', method: 'Cash', billAmount: 250.25, status: 'pending', createdAt: '2026-10-03T07:00:00Z', refundableBalance: 0, amountPaid: 0, refundedAmount: 0 }),
  row({ id: 'ORD-3', _orderId: 'm3', table: 'Kiosk', customer: 'Guest', method: 'Card', billAmount: 99.99, status: 'failed', createdAt: '2026-10-03T05:00:00Z' }),
]
const RESPONSE = {
  success: true,
  stats: { todayRevenue: 12345.5, successful: 1, pending: 1, failed: 1 },
  filters: [
    { name: 'All', count: '03' }, { name: 'Successful', count: '01' }, { name: 'Pending', count: '01' },
    { name: 'Failed', count: '01' }, { name: 'Refunded', count: '00' },
  ],
  payments: PAYMENTS,
}

function renderDash() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/payments']}><PaymentsDashboard /></MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}
const tableRows = () => screen.getAllByRole('row').slice(1)

beforeEach(() => {
  api.get.mockResolvedValue({ data: RESPONSE })
})

describe('PaymentsDashboard — stats and filters', () => {
  test('stat cards show the API figures', async () => {
    renderDash()
    expect(await screen.findByText('₹12,345.5')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/payments/admin/all')
    for (const label of ['Successful', 'Pending', 'Failed']) {
      expect(screen.getAllByText(label)[0].nextSibling).toHaveTextContent('01')
    }
  })

  test('only filter pills with a non-zero count render, with the API counts', async () => {
    renderDash()
    await screen.findByText('All (03)')
    expect(screen.getByText('Successful (01)')).toBeInTheDocument()
    expect(screen.queryByText(/Refunded \(00\)/)).not.toBeInTheDocument()
  })

  test('rows are newest-first with the bill amount to the paisa; status pill filters them', async () => {
    const user = renderDash()
    await screen.findByText('All (03)')
    expect(tableRows().map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['TakeawayORD-2', 'Table 4ORD-1', 'KioskORD-3'])
    expect(screen.getByText('₹250.25')).toBeInTheDocument()
    expect(screen.getByText('₹719.54')).toBeInTheDocument()
    await user.click(screen.getByText('Pending (01)'))
    expect(tableRows()).toHaveLength(1)
    expect(screen.getByText('₹250.25')).toBeInTheDocument()
  })

  test('search matches customer / table / order id', async () => {
    const user = renderDash()
    await screen.findByText('All (03)')
    await user.type(screen.getByPlaceholderText(/Search by customer name/), 'kiosk')
    expect(tableRows()).toHaveLength(1)
    expect(screen.getByText('ORD-3')).toBeInTheDocument()
  })

  test('API failure shows a retry state', async () => {
    api.get.mockRejectedValue(new Error('500'))
    renderDash()
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('PaymentsDashboard — refund', () => {
  test('refund action exists only on successful payments', async () => {
    renderDash()
    await screen.findByText('All (03)')
    expect(screen.getAllByTitle('Refund')).toHaveLength(1)
  })

  test('modal opens on the refundable balance; partial refund posts orderId (Mongo id), amount and reason', async () => {
    razorpayAPI.refund.mockResolvedValue({ data: { success: true, message: 'Refund of ₹100.25 processed' } })
    const user = renderDash()
    await screen.findByText('All (03)')
    await user.click(screen.getByTitle('Refund'))
    expect(screen.getAllByText('₹519.50').length).toBeGreaterThan(0)
    expect(screen.getByText('₹200.04')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Partial Refund' }))
    await user.type(screen.getByLabelText(/Refund amount/), '100.25')
    await user.selectOptions(screen.getByLabelText(/Refund reason/), 'Other')
    await user.type(screen.getByLabelText(/Specify reason/), 'Cold food')
    await user.click(screen.getByRole('button', { name: /Confirm Refund/ }))

    await waitFor(() => expect(razorpayAPI.refund).toHaveBeenCalledWith({ orderId: 'm1', amount: 100.25, reason: 'Cold food' }))
    expect(toast.success).toHaveBeenCalledWith('Refund of ₹100.25 processed')
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2)) // refetched
    expect(screen.queryByRole('button', { name: /Confirm Refund/ })).not.toBeInTheDocument()
  })

  test('server rejection toasts the message and closes the modal without refetching', async () => {
    razorpayAPI.refund.mockRejectedValue({ response: { data: { message: 'Refund amount must be between ₹1 and ₹519.5' } } })
    const user = renderDash()
    await screen.findByText('All (03)')
    await user.click(screen.getByTitle('Refund'))
    await user.click(screen.getByRole('button', { name: /Confirm Refund/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Refund amount must be between ₹1 and ₹519.5'))
    expect(razorpayAPI.refund).toHaveBeenCalledWith({ orderId: 'm1', amount: 519.5, reason: 'Order cancelled' })
    expect(api.get).toHaveBeenCalledTimes(1)
  })
})
