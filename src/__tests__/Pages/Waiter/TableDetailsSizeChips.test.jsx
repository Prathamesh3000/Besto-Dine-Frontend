/**
 * Waiter/TableDetails — BUG-42/43: sized lines carry a size chip, and
 * two same-item lines (Half + Full) render without duplicate keys or
 * an empty img src.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const cart = {
  a: { id: 'm1', lineKey: 'm1::half', name: 'Biryani', price: 100, quantity: 1, image: '', selectedSizes: [{ id: 's1', name: 'Half' }] },
  b: { id: 'm1', lineKey: 'm1::full', name: 'Biryani', price: 180, quantity: 1, image: '', selectedSizes: [{ id: 's2', name: 'Full' }] },
}
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'w', role: 'waiter' } }), CAPTAIN_ROLES: ['captain', 'admin', 'manager'] }))
vi.mock('@/Context/CartContext', () => ({
  useCart: () => ({ cartItems: cart, totalItems: 2, totalPrice: 280, clearCart: vi.fn(), setActiveTable: vi.fn(), updateQuantity: vi.fn() }),
}))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/Components/Waiter/ProductDetailsPopup', () => ({ default: () => null }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const ok = (data) => vi.fn(() => Promise.resolve({ data }))
  const items = [
    { _id: 'i1', name: 'Biryani', price: 100, quantity: 1, selectedSizes: [{ name: 'Half' }] },
    { _id: 'i2', name: 'Biryani', price: 180, quantity: 1, selectedSizes: [{ name: 'Full' }] },
  ]
  return {
    waiterAPI: {
      getAreas: ok({ areas: [] }),
      getActiveOrderByTable: ok({ success: true, order: { _id: 'o1', status: 'new', items } }),
      getRequests: ok({ requests: [] }),
    },
    settingsAPI: { getSettings: ok({ taxes: {} }) },
  }
})

import TableDetails from '@/Pages/Waiter/TableDetails'

afterEach(() => vi.restoreAllMocks())

describe('TableDetails size chips', () => {
  test('cart and order lines show Half/Full chips; no key or src warnings', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/waiter/details', state: { tableId: 't1', tableName: 'T4' } }]}>
        <Routes><Route path="/waiter/details" element={<TableDetails />} /></Routes>
      </MemoryRouter>,
    )
    // 2 cart chips + 2 order-list chips each
    await waitFor(() => expect(screen.getAllByText('Half')).toHaveLength(2))
    expect(screen.getAllByText('Full')).toHaveLength(2)
    expect(container.querySelector('img[src=""]')).toBeNull()
    const msgs = err.mock.calls.map((c) => String(c[0]) + String(c[1] ?? ''))
    expect(msgs.filter((m) => /same key|empty string/.test(m))).toEqual([])
  })
})
