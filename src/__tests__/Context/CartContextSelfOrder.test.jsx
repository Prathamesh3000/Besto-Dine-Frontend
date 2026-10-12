/**
 * CartContext — operations profile orderFlow.customerSelfOrder:false
 * (QR is menu-only). The cart store is the single guard every Add / +
 * button goes through.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act } from '@testing-library/react'

const authState = vi.hoisted(() => ({ current: { user: { _id: 'c1', role: 'customer' }, isGuest: false, isLoading: false, isStaff: false } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.current }))
const toastFn = vi.hoisted(() => vi.fn())
vi.mock('react-hot-toast', () => ({ default: toastFn, toast: toastFn }))

import { CartProvider, useCart } from '@/Context/CartContext'
import { setActiveTenant, setActiveTenantOperations, clearActiveTenant } from '@/utils/tenant'
import { QR_MENU_ONLY_NOTE } from '@/utils/customerOrdering'

const wrapper = ({ children }) => <CartProvider>{children}</CartProvider>
const mount = () => renderHook(() => useCart(), { wrapper })
const pizza = { name: 'Pizza', price: 200 }
const setOps = (orderFlow) => setActiveTenant({ slug: 'hotel', operations: { orderFlow } })

beforeEach(() => {
  localStorage.clear()
  clearActiveTenant()
  authState.current = { user: { _id: 'c1', role: 'customer' }, isGuest: false, isLoading: false, isStaff: false }
  toastFn.mockReset()
})

describe('CartContext — QR menu-only', () => {
  test('dine-in customer: add is refused with the menu-only note', () => {
    setOps({ customerSelfOrder: false })
    localStorage.setItem('orderType', 'dine-in')
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    expect(result.current.cartItems).toEqual({})
    expect(toastFn).toHaveBeenCalledWith(QR_MENU_ONLY_NOTE, expect.objectContaining({ id: 'qr-menu-only' }))
  })

  test('takeaway customer: add still works', () => {
    setOps({ customerSelfOrder: false })
    localStorage.setItem('orderType', 'takeaway')
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    expect(result.current.cartItems.p1).toMatchObject({ name: 'Pizza', quantity: 1 })
    expect(toastFn).not.toHaveBeenCalled()
  })

  test('staff (waiter app shares this store): add still works', () => {
    setOps({ customerSelfOrder: false })
    authState.current = { user: { _id: 'w1', role: 'waiter' }, isGuest: false, isLoading: false, isStaff: true }
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 2, pizza))
    expect(result.current.cartItems.p1).toMatchObject({ quantity: 2 })
  })

  test('self-order on: dine-in add works as before', () => {
    setOps({ customerSelfOrder: true })
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 1, pizza))
    expect(result.current.cartItems.p1).toMatchObject({ quantity: 1 })
  })

  test('decrements still pass so a stale cart can be cleaned up', () => {
    setOps({ customerSelfOrder: true })
    const { result } = mount()
    act(() => result.current.updateQuantity('p1', 2, pizza))
    // same tenant, profile flips (no slot change)
    setActiveTenantOperations({ orderFlow: { customerSelfOrder: false } })
    act(() => result.current.updateQuantity('p1', 1))
    expect(result.current.cartItems.p1).toMatchObject({ quantity: 2 })
    act(() => result.current.updateQuantity('p1', -1))
    expect(result.current.cartItems.p1).toMatchObject({ quantity: 1 })
  })
})
