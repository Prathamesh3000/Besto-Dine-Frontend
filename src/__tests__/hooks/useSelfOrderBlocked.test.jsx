import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const authState = vi.hoisted(() => ({ value: { isStaff: false } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.value }))

import useSelfOrderBlocked from '@/hooks/useSelfOrderBlocked'
import { setActiveTenant, clearActiveTenant } from '@/utils/tenant'

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
})
