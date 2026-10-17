import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const authState = vi.hoisted(() => ({ value: { isStaff: false } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.value }))

import useSelfOrderBlocked from '@/hooks/useSelfOrderBlocked'
import { setActiveTenant, setActiveTenantOperations, clearActiveTenant } from '@/utils/tenant'

const menuOnly = () => setActiveTenant({ slug: 'hotel', operations: { orderFlow: { customerSelfOrder: false } } })

beforeEach(() => {
  localStorage.clear()
  clearActiveTenant()
  authState.value = { isStaff: false }
})

describe('useSelfOrderBlocked', () => {
  test('false when self-order is on (default)', () => {
    const { result } = renderHook(() => useSelfOrderBlocked())
    expect(result.current).toBe(false)
  })

  test('true for a dine-in customer when the QR is menu-only', () => {
    menuOnly()
    localStorage.setItem('orderType', 'dine-in')
    const { result } = renderHook(() => useSelfOrderBlocked())
    expect(result.current).toBe(true)
  })

  test('false for takeaway', () => {
    menuOnly()
    localStorage.setItem('orderType', 'takeaway')
    const { result } = renderHook(() => useSelfOrderBlocked())
    expect(result.current).toBe(false)
  })

  test('false for staff (Home / ProductDetails are shared with the waiter app)', () => {
    menuOnly()
    authState.value = { isStaff: true }
    const { result } = renderHook(() => useSelfOrderBlocked())
    expect(result.current).toBe(false)
  })

  test('re-evaluates when orderType changes (storage_sync)', () => {
    menuOnly()
    localStorage.setItem('orderType', 'takeaway')
    const { result } = renderHook(() => useSelfOrderBlocked())
    expect(result.current).toBe(false)
    act(() => {
      localStorage.setItem('orderType', 'dine-in')
      window.dispatchEvent(new Event('storage_sync'))
    })
    expect(result.current).toBe(true)
  })

  // A9: the menu bootstrap refreshes the profile with setActiveTenantOperations
  // — the hook must pick that up without a storage event from another tab.
  test('re-evaluates when the restaurant switches self-ordering off/on via setActiveTenantOperations', () => {
    setActiveTenant({ slug: 'hotel', operations: { orderFlow: { customerSelfOrder: true } } })
    localStorage.setItem('orderType', 'dine-in')
    const { result } = renderHook(() => useSelfOrderBlocked())
    expect(result.current).toBe(false)

    act(() => { setActiveTenantOperations({ orderFlow: { customerSelfOrder: false } }) })
    expect(result.current).toBe(true)

    act(() => { setActiveTenantOperations({ orderFlow: { customerSelfOrder: true } }) })
    expect(result.current).toBe(false)
  })

  test('an unchanged profile does not re-render the hook (no event loop)', () => {
    setActiveTenant({ slug: 'hotel', operations: { orderFlow: { customerSelfOrder: false } } })
    localStorage.setItem('orderType', 'dine-in')
    let renders = 0
    const { result } = renderHook(() => { renders += 1; return useSelfOrderBlocked() })
    expect(result.current).toBe(true)
    const before = renders
    act(() => { setActiveTenantOperations({ orderFlow: { customerSelfOrder: false } }) })
    expect(renders).toBe(before)
    expect(result.current).toBe(true)
  })
})
