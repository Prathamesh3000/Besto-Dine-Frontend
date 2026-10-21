import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const auth = vi.hoisted(() => ({ value: {} }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth.value }))
const tenant = vi.hoisted(() => ({ value: null }))
vi.mock('@/utils/tenant', () => ({ getActiveTenant: () => tenant.value }))

import { useOperations } from '@/hooks/useOperations'
import { getCustomerOperations, DEFAULT_OPERATIONS, DEFAULT_PUBLIC_OPERATIONS } from '@/utils/operations'

beforeEach(() => { auth.value = {}; tenant.value = null })

describe('useOperations (staff, from /auth/me)', () => {
  test('no tenant snapshot → today\'s defaults (tables in use)', () => {
    auth.value = { operations: null }
    const { result } = renderHook(() => useOperations())
    expect(result.current).toBe(DEFAULT_OPERATIONS)
    expect(result.current.tables.useTables).toBe(true)
  })

  test('token-number mode: a resolved blob with tables.useTables:false passes through untouched', () => {
    const ops = { ...DEFAULT_OPERATIONS, tables: { useTables: false, assignWaiters: false, mergeTables: false } }
    auth.value = { operations: ops }
    const { result } = renderHook(() => useOperations())
    expect(result.current).toBe(ops)
    expect(result.current.tables.useTables).toBe(false)
  })

  test('a non-object value falls back to the defaults', () => {
    auth.value = { operations: 'broken' }
    const { result } = renderHook(() => useOperations())
    expect(result.current).toBe(DEFAULT_OPERATIONS)
  })
})

describe('getCustomerOperations (customer, from the tenant blob)', () => {
  test('no profile on the blob → public defaults', () => {
    tenant.value = { _id: 'r1' }
    expect(getCustomerOperations()).toBe(DEFAULT_PUBLIC_OPERATIONS)
  })

  test('tables.useTables:false is kept (not normalised back to true) while missing keys get defaults', () => {
    tenant.value = { _id: 'r1', operations: { tables: { useTables: false } } }
    const ops = getCustomerOperations()
    expect(ops.tables.useTables).toBe(false)
    expect(ops.payment.methods).toEqual({ online: true, wallet: true, counterCash: false })
    expect(ops.customerApp.callWaiter).toBe(true)
  })
})
