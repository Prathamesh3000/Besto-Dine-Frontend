/**
 * Admin/OrderDetailsModal — a pay-first held order shows the human
 * label "Awaiting payment" in amber, never the raw 'awaiting-payment'.
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api, settingsAPI: { getSettings: () => Promise.resolve({ data: null }) } }
})

import OrderDetailsModal from '@/Pages/Admin/components/OrderDetailsModal'

const HELD = {
  _id: 'h1', id: 'ORD-H1', status: 'awaiting-payment', paymentStatus: 'Pending', paymentMethod: 'cash',
  type: 'dine-in', table: 'T7', user: 'Asha', total: 300,
  items: [{ name: 'Thali', price: 300, quantity: 1 }], createdAt: new Date().toISOString(),
}

describe('OrderDetailsModal — awaiting-payment', () => {
  test('header badge reads "Awaiting payment" with amber styling', () => {
    render(<OrderDetailsModal order={HELD} onClose={() => {}} />)
    const badge = screen.getByText('Awaiting payment')
    expect(badge.className).toMatch(/amber/)
    expect(screen.queryByText(/awaiting-payment/i)).not.toBeInTheDocument()
  })
})
