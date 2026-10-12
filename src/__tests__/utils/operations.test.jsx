import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const authState = vi.hoisted(() => ({ value: { operations: null } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.value }))

import {
  DEFAULT_PUBLIC_OPERATIONS, DEFAULT_OPERATIONS, getCustomerOperations, opsFlag,
} from '@/utils/operations'
import {
  setActiveTenant, setActiveTenantOperations, getActiveTenant, clearActiveTenant, subscribeActiveTenant,
} from '@/utils/tenant'
import { useOperations } from '@/hooks/useOperations'

const HOTEL = {
  serviceModel: 'counterService',
  orderFlow: { customerSelfOrder: true, customerTracking: false },
  payment: {
    dineIn: 'payFirst', takeaway: 'payFirst', kiosk: 'payFirst', delivery: 'payFirst',
    methods: { online: true, wallet: true, counterCash: true },
  },
  customerApp: { callWaiter: false, requestBill: false, appendToOrder: true, tips: false },
  tables: { useTables: true },
}

beforeEach(() => {
  localStorage.clear()
  clearActiveTenant()
  authState.value = { operations: null }
})

describe('customer operations profile', () => {
  test('no tenant picked → today\'s behaviour', () => {
    expect(getCustomerOperations()).toBe(DEFAULT_PUBLIC_OPERATIONS)
    expect(getCustomerOperations().payment.dineIn).toBe('payAfter')
  })

  test('older tenant blob without operations → today\'s behaviour', () => {
    setActiveTenant({ slug: 'cafe', name: 'Cafe' })
    expect(getActiveTenant().operations).toBeNull()
    expect(getCustomerOperations()).toBe(DEFAULT_PUBLIC_OPERATIONS)
  })

  test('profile stored at pick time is returned and persisted', () => {
    setActiveTenant({ slug: 'hotel', name: 'Hotel', operations: HOTEL })
    expect(getCustomerOperations().payment.dineIn).toBe('payFirst')
    expect(JSON.parse(localStorage.getItem('activeTenant')).operations.customerApp.callWaiter).toBe(false)
  })

  test('a non-object operations value is ignored', () => {
    setActiveTenant({ slug: 'cafe', operations: 'nope' })
    expect(getActiveTenant().operations).toBeNull()
  })

  test('setActiveTenantOperations refreshes the profile without notifying subscribers', () => {
    setActiveTenant({ slug: 'hotel', name: 'Hotel' })
    const spy = vi.fn()
    const unsub = subscribeActiveTenant(spy)
    setActiveTenantOperations(HOTEL)
    expect(spy).not.toHaveBeenCalled()
    expect(getCustomerOperations().customerApp.callWaiter).toBe(false)
    expect(getActiveTenant().slug).toBe('hotel')
    unsub()
  })

  test('setActiveTenantOperations is a no-op with no tenant or a bad value', () => {
    expect(setActiveTenantOperations(HOTEL)).toBeNull()
    setActiveTenant({ slug: 'cafe' })
    setActiveTenantOperations(null)
    expect(getActiveTenant().operations).toBeNull()
  })

  test('opsFlag reads dot paths', () => {
    expect(opsFlag(HOTEL, 'customerApp.callWaiter')).toBe(false)
    expect(opsFlag(HOTEL, 'payment.methods.counterCash')).toBe(true)
    expect(opsFlag(HOTEL, 'nope.deeper')).toBeUndefined()
  })
})

describe('useOperations (staff)', () => {
  test('falls back to today\'s full profile without a tenant snapshot', () => {
    const { result } = renderHook(() => useOperations())
    expect(result.current).toBe(DEFAULT_OPERATIONS)
    expect(result.current.roles).toEqual({ waiter: true, captain: true, chef: true })
    expect(result.current.orderFlow.servedStep).toBe(true)
  })

  test('returns the resolved profile from /auth/me', () => {
    const ops = { ...DEFAULT_OPERATIONS, roles: { waiter: false, captain: false, chef: false } }
    authState.value = { operations: ops }
    const { result } = renderHook(() => useOperations())
    expect(result.current.roles.waiter).toBe(false)
  })
})
