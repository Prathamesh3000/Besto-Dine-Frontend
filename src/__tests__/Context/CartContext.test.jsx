import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act } from '@testing-library/react'

const authState = vi.hoisted(() => ({ current: { user: { _id: 'c1', role: 'customer' }, isGuest: false, isLoading: false } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.current }))
const toastFn = vi.hoisted(() => vi.fn())
vi.mock('react-hot-toast', () => ({ default: toastFn, toast: toastFn }))

import { CartProvider, useCart } from '@/Context/CartContext'
import * as WaiterCart from '@/Context/Waiter/CartContext'
import { cartLineKey } from '@/utils/cart'
import { CUSTOMER_DATA_CLEARED_EVENT } from '@/utils/customerSession'
import { SCAN_REQUIRED_EVENT } from '@/utils/dineInSession'

const wrapper = ({ children }) => <CartProvider>{children}</CartProvider>
const mount = () => renderHook(() => useCart(), { wrapper })
const storedMap = () => JSON.parse(localStorage.getItem('cart_by_table') || '{}')
const pizza = { name: 'Pizza', price: 200 }

beforeEach(() => {
  authState.current = { user: { _id: 'c1', role: 'customer' }, isGuest: false, isLoading: false }
  toastFn.mockReset()
})

describe('add / remove / update quantity', () => {
  test('adding merges into one line; decrementing to 0 removes it', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    act(() => result.current.updateQuantity('p1', 2, pizza))
    expect(result.current.cartItems.p1).toMatchObject({ name: 'Pizza', quantity: 3 })
    act(() => result.current.updateQuantity('p1', -3))
    expect(result.current.cartItems).toEqual({})
  })

  test('quantity never goes negative (decrement on a missing line is a no-op)', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('ghost', -2))
    expect(result.current.cartItems).toEqual({})
  })

  test.each([
    ['empty id', '', 1],
    ['null id', null, 1],
    ['NaN delta', 'p1', 'abc'],
  ])('ignores %s', (_l, id, delta) => {
    const { result } = mount()
    act(() => result.current.updateQuantity(id, delta, pizza))
    expect(result.current.cartItems).toEqual({})
  })

  test('size / topping variants are distinct lines; topping order does not matter', () => {
    const { result } = mount()
    const large = cartLineKey('p1', { size: 'L', toppings: [{ id: 'olive' }, { id: 'cheese' }] })
    const largeSame = cartLineKey('p1', { size: { name: 'L' }, toppings: [{ id: 'cheese' }, { id: 'olive' }] })
    const small = cartLineKey('p1', { size: 'S' })
    expect(largeSame).toBe(large)
    act(() => {
      result.current.updateQuantity(large, 1, { ...pizza, unitPrice: 300, selectedSize: 'L' })
      result.current.updateQuantity(largeSame, 1, { ...pizza, unitPrice: 300, selectedSize: 'L' })
      result.current.updateQuantity(small, 1, { ...pizza, unitPrice: 150, selectedSize: 'S' })
    })
    expect(Object.keys(result.current.cartItems)).toHaveLength(2)
    expect(result.current.cartItems[large].quantity).toBe(2)
  })

  test('totals: distinct-line count and subtotal using unitPrice over price, rounded to paise', () => {
    const { result } = mount()
    act(() => {
      result.current.updateQuantity('a', 3, { price: 100, unitPrice: 133.335 })
      result.current.updateQuantity('b', 2, { price: 49.99 })
    })
    expect(result.current.totalItems).toBe(2)
    expect(result.current.totalPrice).toBe(499.99) // 400.01 (round2 of 400.005) + 99.98
  })

  test('updateCartItem patches an existing line and ignores unknown ids', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    act(() => result.current.updateCartItem('p1', { note: 'no onion' }))
    act(() => result.current.updateCartItem('nope', { note: 'x' }))
    expect(result.current.cartItems).toEqual({ p1: { ...pizza, quantity: 1, note: 'no onion' } })
  })

  test('clearCart (order placed) empties only the active slot', () => {
    const { result } = mount()
    act(() => result.current.setActiveTable('T1'))
    act(() => result.current.updateQuantity('p1', 1, pizza))
    act(() => result.current.setActiveTable(null))
    act(() => result.current.updateQuantity('p2', 1, pizza))
    act(() => result.current.clearCart())
    expect(result.current.cartItems).toEqual({})
    expect(storedMap().T1.p1.quantity).toBe(1)
  })
})

describe('dine-in guards', () => {
  test('a settled dine-in bill blocks increments but still allows decrements', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 2, pizza))
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 't1' }))
    localStorage.setItem('dineInBillSettled', '1')
    act(() => result.current.updateQuantity('p1', 1))
    expect(result.current.cartItems.p1.quantity).toBe(2)
    expect(toastFn).toHaveBeenCalledWith(expect.stringMatching(/Bill settled/), expect.objectContaining({ id: 'dine-in-locked' }))
    act(() => result.current.updateQuantity('p1', -1))
    expect(result.current.cartItems.p1.quantity).toBe(1)
  })

  test('a dine-in guest with no scanned table is sent to scan instead of adding', () => {
    authState.current = { user: null, isGuest: true, isLoading: false }
    localStorage.setItem('isGuest', 'true')
    const onScan = vi.fn()
    window.addEventListener(SCAN_REQUIRED_EVENT, onScan)
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    expect(result.current.cartItems).toEqual({})
    expect(onScan).toHaveBeenCalled()
    window.removeEventListener(SCAN_REQUIRED_EVENT, onScan)
  })
})

describe('per-table slots (waiter flow)', () => {
  test('each table has its own cart and the active table persists', () => {
    const { result } = mount()
    act(() => result.current.setActiveTable(7))
    act(() => result.current.updateQuantity('p1', 1, pizza))
    expect(localStorage.getItem('cart_active_table')).toBe('7')
    act(() => result.current.setActiveTable('8'))
    expect(result.current.cartItems).toEqual({})
    act(() => result.current.setActiveTable('7'))
    expect(result.current.cartItems.p1.quantity).toBe(1)
    act(() => result.current.setActiveTable(null))
    expect(localStorage.getItem('cart_active_table')).toBeNull()
  })

  test('clearCartForTable drops just that table (or default when null)', () => {
    const { result } = mount()
    act(() => result.current.setActiveTable('T1'))
    act(() => result.current.updateQuantity('p1', 1, pizza))
    act(() => result.current.setActiveTable(null))
    act(() => result.current.updateQuantity('p2', 1, pizza))
    act(() => result.current.clearCartForTable('T1'))
    act(() => result.current.clearCartForTable('missing'))
    expect(storedMap().T1).toBeUndefined()
    act(() => result.current.clearCartForTable(null))
    expect(result.current.cartItems).toEqual({})
  })
})

describe('persistence', () => {
  test('writes the map to localStorage and reloads it on mount', () => {
    const first = mount()
    act(() => first.result.current.updateQuantity('p1', 2, pizza))
    expect(storedMap()._default_.p1.quantity).toBe(2)
    first.unmount()
    const second = mount()
    expect(second.result.current.cartItems.p1.quantity).toBe(2)
  })

  test.each([
    ['array', [{ id: 'x', price: 10, quantity: 1 }], 'x'],
    ['object', { y: { price: 5, quantity: 2 } }, 'y'],
  ])('migrates a legacy %s `cart` blob into the default slot', (_l, legacy, key) => {
    localStorage.setItem('cart', JSON.stringify(legacy))
    const { result } = mount()
    expect(result.current.cartItems[key]).toBeDefined()
    expect(localStorage.getItem('cart')).toBeNull()
  })

  test('corrupt storage starts empty', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('cart_by_table', '{bad')
    const { result } = mount()
    expect(result.current.cartItems).toEqual({})
  })

  test('adopts another tab\'s write (storage event) and ignores other keys', () => {
    const { result } = mount()
    localStorage.setItem('cart_by_table', JSON.stringify({ _default_: { z: { price: 1, quantity: 4 } } }))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'other' })) })
    expect(result.current.cartItems).toEqual({})
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'cart_by_table', storageArea: localStorage })) })
    expect(result.current.cartItems.z.quantity).toBe(4)
  })
})

describe('auth-driven clearing', () => {
  test('logout (no user, not guest, auth settled) clears every cart', () => {
    const { result, rerender } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    authState.current = { user: null, isGuest: false, isLoading: false }
    rerender()
    expect(result.current.cartItems).toEqual({})
    expect(storedMap()).toEqual({})
  })

  test('does not clear while auth is still restoring', () => {
    localStorage.setItem('cart_by_table', JSON.stringify({ _default_: { p: { price: 1, quantity: 1 } } }))
    authState.current = { user: null, isGuest: false, isLoading: true }
    const { result } = mount()
    expect(result.current.cartItems.p).toBeDefined()
  })

  test('a fresh guest session resets the default slot once', () => {
    localStorage.setItem('cart_by_table', JSON.stringify({ _default_: { old: { price: 1, quantity: 1 } }, T9: { w: { quantity: 1 } } }))
    localStorage.setItem('guest_session_start', '123')
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 't' }))
    authState.current = { user: null, isGuest: true, isLoading: false }
    const { result } = mount()
    expect(result.current.cartItems).toEqual({})
    expect(storedMap().T9).toBeDefined()
    expect(localStorage.getItem('guest_cart_reset')).toBe('123')
  })

  test('account switch (customer data cleared) drops the in-memory customer cart', () => {
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    act(() => { window.dispatchEvent(new Event(CUSTOMER_DATA_CLEARED_EVENT)) })
    expect(result.current.cartItems).toEqual({})
    expect(storedMap()._default_).toBeUndefined()
  })
})

describe('tenant isolation', () => {
  // Regression (fixed 2026-10): cart slots are keyed per tenant (`<slot>@<slug>`) and follow active-tenant changes.
  test('tenant A\'s cart is not shown (or persisted) after entering tenant B', async () => {
    const { enterRestaurant } = await import('@/utils/enterRestaurant')
    enterRestaurant({ slug: 'tenant-a', _id: 'A' }, null, null)
    const { result } = mount()
    act(() => result.current.updateQuantity('A-menu-item', 2, { name: 'A Burger', price: 100 }))

    act(() => { enterRestaurant({ slug: 'tenant-b', _id: 'B' }) })

    expect(result.current.cartItems).toEqual({})
    expect(storedMap()._default_ ?? {}).toEqual({})

    // Back at tenant A, A's cart is where it was left.
    act(() => { enterRestaurant({ slug: 'tenant-a', _id: 'A' }) })
    expect(result.current.cartItems['A-menu-item']).toMatchObject({ quantity: 2 })
    const { clearActiveTenant } = await import('@/utils/tenant')
    act(() => { clearActiveTenant() })
  })
})

describe('module surface', () => {
  test('the Waiter path re-exports the same store', () => {
    expect(WaiterCart.CartProvider).toBe(CartProvider)
    expect(WaiterCart.useCart).toBe(useCart)
  })

  test('useCart outside the provider throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useCart())).toThrow('useCart must be used within a CartProvider')
  })
})
