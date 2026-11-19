/**
 * Waiter/CartPage — BUG-50: Half + Full lines of one item render without
 * duplicate keys, and a blank image renders no <img src="">.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const cart = {
  a: { id: 'm1', lineKey: 'm1::half', name: 'Biryani', price: 100, quantity: 1, image: '', selectedSizes: [{ id: 's1', name: 'Half' }] },
  b: { id: 'm1', lineKey: 'm1::full', name: 'Biryani', price: 180, quantity: 1, image: '', selectedSizes: [{ id: 's2', name: 'Full' }] },
}
vi.mock('@/Context/CartContext', () => ({
  useCart: () => ({ cartItems: cart, updateQuantity: vi.fn(), updateCartItem: vi.fn(), totalPrice: 280, totalItems: 2, activeTableId: 't1' }),
}))
vi.mock('@/utils/api', () => ({
  menuSearchAPI: { getTrending: vi.fn(() => Promise.resolve({ data: { items: [] } })) },
}))
vi.mock('@/Components/Waiter/SpecialInstructionsPopup', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/ProductDetails', () => ({ default: () => null }))

import CartPage from '@/Pages/Waiter/CartPage'

afterEach(() => vi.restoreAllMocks())

describe('CartPage size lines', () => {
  test('Half and Full render with no key or empty-src warnings', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<MemoryRouter><CartPage /></MemoryRouter>)
    expect(screen.getByText('Half')).toBeTruthy()
    expect(screen.getByText('Full')).toBeTruthy()
    expect(container.querySelector('img[src=""]')).toBeNull()
    const msgs = err.mock.calls.map((c) => String(c[0]) + String(c[1] ?? ''))
    expect(msgs.filter((m) => /same key|empty string/.test(m))).toEqual([])
  })
})
