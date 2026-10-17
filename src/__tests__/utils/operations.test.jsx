import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const authState = vi.hoisted(() => ({ value: { operations: null } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.value }))

import {
  DEFAULT_PUBLIC_OPERATIONS, DEFAULT_OPERATIONS, getCustomerOperations, mergePublicOperations, opsFlag,
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

  // A9: hooks that read the profile from localStorage (useSelfOrderBlocked)
  // listen to the same-window `storage_sync` event; the setter must fire it
  // when the profile changes, and only then (the menu bootstrap calls it on
  // every success — an unconditional event would re-render in a loop).
  test('setActiveTenantOperations announces a CHANGED profile with storage_sync, and stays silent for the same one', () => {
    setActiveTenant({ slug: 'hotel', name: 'Hotel' })
    const dispatched = vi.fn()
    window.addEventListener('storage_sync', dispatched)
    try {
      setActiveTenantOperations(HOTEL)
      expect(dispatched).toHaveBeenCalledTimes(1)
      setActiveTenantOperations({ ...HOTEL, payment: { ...HOTEL.payment } })   // equal by value
      expect(dispatched).toHaveBeenCalledTimes(1)
      setActiveTenantOperations({ ...HOTEL, orderFlow: { customerSelfOrder: false, customerTracking: false } })
      expect(dispatched).toHaveBeenCalledTimes(2)
      expect(getCustomerOperations().orderFlow.customerSelfOrder).toBe(false)
    } finally {
      window.removeEventListener('storage_sync', dispatched)
    }
  })

  // A6: a partial blob (older backend, the 402 PAYMENT_REQUIRED_FIRST patch
  // in Cart.jsx) must never leave `payment.methods` with missing keys —
  // Payment.jsx would then offer zero ways to pay.
  describe('mergePublicOperations / partial stored blobs', () => {
    test('undefined / null / non-object → the defaults themselves', () => {
      expect(mergePublicOperations(undefined)).toBe(DEFAULT_PUBLIC_OPERATIONS)
      expect(mergePublicOperations(null)).toBe(DEFAULT_PUBLIC_OPERATIONS)
      expect(mergePublicOperations('nope')).toBe(DEFAULT_PUBLIC_OPERATIONS)
      expect(mergePublicOperations([])).toBe(DEFAULT_PUBLIC_OPERATIONS)
    })

    test('a partial blob is filled with today\'s defaults, nested keys included', () => {
      const merged = mergePublicOperations({ payment: { dineIn: 'payFirst' } })
      expect(merged).toEqual({
        ...DEFAULT_PUBLIC_OPERATIONS,
        payment: { ...DEFAULT_PUBLIC_OPERATIONS.payment, dineIn: 'payFirst' },
      })
      expect(merged.payment.methods).toEqual({ online: true, wallet: true, counterCash: false })
      expect(merged.customerApp.callWaiter).toBe(true)
    })

    test('explicit false is preserved; missing method keys default to today\'s value', () => {
      const merged = mergePublicOperations({ payment: { methods: { online: false } }, customerApp: { tips: false } })
      expect(merged.payment.methods).toEqual({ online: false, wallet: true, counterCash: false })
      expect(merged.customerApp).toEqual({ callWaiter: true, requestBill: true, appendToOrder: true, tips: false })
    })

    test('a null nested value means "unknown" and keeps the default; extra keys survive', () => {
      const merged = mergePublicOperations({ payment: { methods: null }, orderFlow: { kitchenDisplay: false } })
      expect(merged.payment.methods).toEqual(DEFAULT_PUBLIC_OPERATIONS.payment.methods)
      expect(merged.orderFlow).toEqual({ customerSelfOrder: true, customerTracking: true, kitchenDisplay: false })
    })

    test('a full blob merges to itself and the input is not mutated', () => {
      const copy = JSON.parse(JSON.stringify(HOTEL))
      expect(mergePublicOperations(HOTEL)).toEqual(HOTEL)
      expect(HOTEL).toEqual(copy)
    })

    test('getCustomerOperations() fills a partial stored blob (every payment method key present)', () => {
      setActiveTenant({ slug: 'hotel', operations: { payment: { dineIn: 'payFirst', methods: { counterCash: true } } } })
      const ops = getCustomerOperations()
      expect(ops.payment.dineIn).toBe('payFirst')
      expect(ops.payment.methods).toEqual({ online: true, wallet: true, counterCash: true })
      expect(ops.orderFlow).toEqual({ customerSelfOrder: true, customerTracking: true })
      expect(ops.tables.useTables).toBe(true)
      // Stable identity for the same stored blob (render-loop friendly).
      expect(getCustomerOperations()).toBe(ops)
    })

    test('getCustomerOperations() keeps the stored profile\'s explicit false values', () => {
      setActiveTenant({ slug: 'hotel', operations: { payment: { methods: { online: false, wallet: false, counterCash: true } } } })
      expect(getCustomerOperations().payment.methods).toEqual({ online: false, wallet: false, counterCash: true })
    })
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
