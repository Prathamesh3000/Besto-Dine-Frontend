import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act } from '@testing-library/react'

const authState = vi.hoisted(() => ({ current: { user: { _id: 'c1', role: 'customer' }, isGuest: false, isLoading: false } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.current }))
const toastFn = vi.hoisted(() => vi.fn())
vi.mock('react-hot-toast', () => ({ default: toastFn, toast: toastFn }))

import { CartProvider, useCart, migrateLineKeys } from '@/Context/CartContext'
import { customerLineKey, cartSubtotal } from '@/utils/cart'

const wrapper = ({ children }) => <CartProvider>{children}</CartProvider>
const mount = () => renderHook(() => useCart(), { wrapper })

const half = { id: 'bir', title: 'Veg Biryani', selectedSizes: [{ id: 's1', name: 'Half', price: 160 }], selectedToppings: [], unitPrice: 160, price: 160 }
const full = { id: 'bir', title: 'Veg Biryani', selectedSizes: [{ id: 's2', name: 'Full', price: 260 }], selectedToppings: [], unitPrice: 260, price: 260 }

beforeEach(() => { localStorage.clear(); toastFn.mockReset() })

describe('BUG-37: customer cart lines are keyed by item + size', () => {
  test('Half and Full of the same dish stay two lines; total is 160 + 260', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('bir', 1, half))
    act(() => result.current.updateQuantity('bir', 1, full))
    const lines = Object.values(result.current.cartItems)
    expect(lines).toHaveLength(2)
    expect(lines.map(l => [l.selectedSizes[0].name, l.quantity]).sort()).toEqual([['Full', 1], ['Half', 1]])
    expect(result.current.totalPrice).toBe(420)
    expect(Math.round(result.current.totalPrice * 1.05 * 100) / 100).toBe(441)
    expect(result.current.totalItems).toBe(2)
  })

  test('same size merges quantity', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('bir', 1, full))
    act(() => result.current.updateQuantity('bir', 2, full))
    const lines = Object.values(result.current.cartItems)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(3)
    expect(result.current.totalPrice).toBe(780)
  })

  test('+/- and remove by line key only touch that line', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('bir', 1, half))
    act(() => result.current.updateQuantity('bir', 1, full))
    const fullKey = customerLineKey('bir', full)
    expect(result.current.cartItems[fullKey].lineKey).toBe(fullKey)
    act(() => result.current.updateQuantity(fullKey, 1, result.current.cartItems[fullKey], { exactKey: true }))
    expect(result.current.cartItems[fullKey].quantity).toBe(2)
    act(() => result.current.updateQuantity(fullKey, -2, result.current.cartItems[fullKey], { exactKey: true }))
    const left = Object.values(result.current.cartItems)
    expect(left).toHaveLength(1)
    expect(left[0].selectedSizes[0].name).toBe('Half')
    expect(result.current.totalPrice).toBe(160)
  })

  test('a plain item keeps the bare product id key', () => {
    expect(customerLineKey('p1', { selectedSizes: [], selectedToppings: [] })).toBe('p1')
    expect(customerLineKey('p1', {})).toBe('p1')
  })

  test('customizing a line to another size re-keys it and merges into an existing line', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('bir', 1, half))
    act(() => result.current.updateQuantity('bir', 1, full))
    const halfKey = customerLineKey('bir', half)
    act(() => result.current.updateCartItem(halfKey, { selectedSizes: full.selectedSizes, unitPrice: 260, price: 260, quantity: 1 }))
    const lines = Object.values(result.current.cartItems)
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe(2)
    expect(result.current.totalPrice).toBe(520)
  })

  test('persisted carts keyed by bare id are migrated to size-aware keys', () => {
    localStorage.setItem('cart_by_table', JSON.stringify({ _default_: { bir: { ...full, quantity: 2 } } }))
    const { result } = mount()
    const key = customerLineKey('bir', full)
    expect(Object.keys(result.current.cartItems)).toEqual([key])
    act(() => result.current.updateQuantity('bir', 1, full))
    expect(Object.values(result.current.cartItems)).toHaveLength(1)
    expect(result.current.cartItems[key].quantity).toBe(3)
  })

  test('migrateLineKeys leaves plain and waiter combo lines alone', () => {
    const slots = { t1: { 'p1-L-': { id: 'p1-L-', selectedSize: 'L', quantity: 1 } }, _default_: { p2: { id: 'p2', quantity: 1 } } }
    expect(migrateLineKeys(slots)).toEqual(slots)
  })
})

describe('totals', () => {
  test('cartSubtotal over the two lines is 420', () => {
    expect(cartSubtotal([{ unitPrice: 160, quantity: 1 }, { unitPrice: 260, quantity: 1 }])).toBe(420)
  })
})
