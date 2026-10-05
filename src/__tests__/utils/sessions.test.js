/**
 * dineInSession / guestSession / customerSession / roleRouting / waiterScope.
 */
import { describe, test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  isDineInLocked, markDineInBillSettled, needsTableScan, requestTableScan, clearDineInTable,
  clearDineInLock, useDineInLock, SCAN_REQUIRED_EVENT, SCAN_TABLE_PATH,
} from '@/utils/dineInSession'
import { isGuestSessionExpired, clearGuestSession, GUEST_SESSION_MAX_AGE_MS, SESSION_EVENT } from '@/utils/guestSession'
import { clearCustomerPersonalData, claimCustomerData, CUSTOMER_DATA_CLEARED_EVENT } from '@/utils/customerSession'
import { staffHomePath } from '@/utils/roleRouting'
import { getWaiterScope, inWaiterScope, isAssignedToMe } from '@/utils/waiterScope'

const bindTable = () => localStorage.setItem('dineInTable', JSON.stringify({ _id: 't1' }))

describe('dineInSession', () => {
  test.each([
    ['no table, no flag', () => {}, false],
    ['flag without a table', () => localStorage.setItem('dineInBillSettled', '1'), false],
    ['table without flag', bindTable, false],
    ['table + settled flag', () => { bindTable(); localStorage.setItem('dineInBillSettled', '1') }, true],
    ['table + guest bill paid', () => {
      bindTable(); localStorage.setItem('isGuest', 'true'); localStorage.setItem('guest_bill_paid_at', '123')
    }, true],
    ['table + paid stamp but not a guest', () => { bindTable(); localStorage.setItem('guest_bill_paid_at', '123') }, false],
    ['corrupt table blob', () => { localStorage.setItem('dineInTable', '{'); localStorage.setItem('dineInBillSettled', '1') }, false],
    ['table blob without id', () => { localStorage.setItem('dineInTable', '{}'); localStorage.setItem('dineInBillSettled', '1') }, false],
  ])('isDineInLocked: %s → %s', (_n, arrange, expected) => {
    arrange()
    expect(isDineInLocked()).toBe(expected)
  })

  test('markDineInBillSettled sets the flag and notifies; clearDineInLock unsets', () => {
    bindTable()
    const spy = vi.fn()
    window.addEventListener('dineInLockChange', spy)
    markDineInBillSettled()
    expect(isDineInLocked()).toBe(true)
    clearDineInLock()
    expect(isDineInLocked()).toBe(false)
    window.removeEventListener('dineInLockChange', spy)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  test.each([
    ['guest without table on dine-in', () => localStorage.setItem('isGuest', 'true'), true],
    ['guest doing takeaway', () => { localStorage.setItem('isGuest', 'true'); localStorage.setItem('orderType', 'takeaway') }, false],
    ['guest with a table', () => { localStorage.setItem('isGuest', 'true'); bindTable() }, false],
    ['logged-in customer', () => {}, false],
  ])('needsTableScan: %s → %s', (_n, arrange, expected) => {
    arrange()
    expect(needsTableScan()).toBe(expected)
  })

  test('requestTableScan dispatches the event with a reason', () => {
    const got = []
    const l = (e) => got.push(e.detail)
    window.addEventListener(SCAN_REQUIRED_EVENT, l)
    requestTableScan()
    requestTableScan('table_removed')
    window.removeEventListener(SCAN_REQUIRED_EVENT, l)
    expect(got).toEqual([{ reason: 'no_table' }, { reason: 'table_removed' }])
    expect(SCAN_TABLE_PATH).toBe('/scan')
  })

  test('clearDineInTable drops the binding but keeps auth and tenant', () => {
    bindTable()
    for (const k of ['tableNumber', 'scanToken', 'scanSessionStart', 'fromQrScan', 'dineInBillSettled', 'token', 'activeTenant']) localStorage.setItem(k, 'x')
    localStorage.setItem('orderType', 'takeaway')
    clearDineInTable()
    for (const k of ['dineInTable', 'tableNumber', 'scanToken', 'scanSessionStart', 'fromQrScan', 'dineInBillSettled']) {
      expect(localStorage.getItem(k)).toBeNull()
    }
    expect(localStorage.getItem('orderType')).toBe('dine-in')
    expect(localStorage.getItem('token')).toBe('x')
    expect(localStorage.getItem('activeTenant')).toBe('x')
  })

  test('useDineInLock re-renders on the lock event', () => {
    bindTable()
    const { result } = renderHook(() => useDineInLock())
    expect(result.current).toBe(false)
    act(() => markDineInBillSettled())
    expect(result.current).toBe(true)
    act(() => clearDineInLock())
    expect(result.current).toBe(false)
  })
})

describe('guestSession', () => {
  test.each([
    ['not a guest', null, null, false],
    ['guest without anchor (legacy client)', 'true', null, false],
    ['guest at exactly 24h', 'true', 0, false],
    ['guest 1ms past 24h', 'true', 1, true],
    ['fresh guest', 'true', -GUEST_SESSION_MAX_AGE_MS + 1000, false],
  ])('isGuestSessionExpired: %s', (_n, isGuest, overMs, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T10:00:00Z'))
    if (isGuest) localStorage.setItem('isGuest', isGuest)
    if (overMs !== null) localStorage.setItem('guest_session_start', String(Date.now() - GUEST_SESSION_MAX_AGE_MS - overMs))
    expect(isGuestSessionExpired()).toBe(expected)
  })

  test('clearGuestSession wipes every guest key and leaves the customer login', () => {
    const keys = ['scanToken', 'scanSessionStart', 'isGuest', 'guest_session_start', 'guest_cart_reset', 'guest_bill_paid_at',
      'dineInTable', 'tableNumber', 'fromQrScan', 'cart', 'orderType', 'cafe_orders_v2']
    keys.forEach((k) => localStorage.setItem(k, 'x'))
    localStorage.setItem('token', 'keep')
    const spy = vi.fn()
    window.addEventListener(SESSION_EVENT, spy)
    clearGuestSession()
    window.removeEventListener(SESSION_EVENT, spy)
    keys.forEach((k) => expect(localStorage.getItem(k)).toBeNull())
    expect(localStorage.getItem('token')).toBe('keep')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('customerSession', () => {
  test('clearCustomerPersonalData wipes personal keys and only the default cart slot', () => {
    localStorage.setItem('cafe_orders_v2', '[]')
    localStorage.setItem('healthPreferences', '{}')
    localStorage.setItem('customer_data_owner', 'u1')
    localStorage.setItem('dineInTable', 'keep')
    localStorage.setItem('cart_by_table', JSON.stringify({ _default_: { a: 1 }, T5: { b: 2 } }))
    const spy = vi.fn()
    window.addEventListener(CUSTOMER_DATA_CLEARED_EVENT, spy)
    clearCustomerPersonalData()
    window.removeEventListener(CUSTOMER_DATA_CLEARED_EVENT, spy)
    expect(localStorage.getItem('cafe_orders_v2')).toBeNull()
    expect(localStorage.getItem('healthPreferences')).toBeNull()
    expect(localStorage.getItem('customer_data_owner')).toBeNull()
    expect(localStorage.getItem('dineInTable')).toBe('keep')
    expect(JSON.parse(localStorage.getItem('cart_by_table'))).toEqual({ T5: { b: 2 } })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['same owner keeps data', 'u1', 'u1', {}, true],
    ['different owner wipes data', 'u2', 'u1', {}, false],
    ['unowned data wiped by default', null, 'u1', {}, false],
    ['unowned data kept with keepUnowned (guest → sign-in)', null, 'u1', { keepUnowned: true }, true],
    ['foreign data wiped even with keepUnowned', 'u2', 'u1', { keepUnowned: true }, false],
  ])('claimCustomerData: %s', (_n, owner, userId, opts, kept) => {
    if (owner) localStorage.setItem('customer_data_owner', owner)
    localStorage.setItem('order_ratings', '{"o":5}')
    claimCustomerData(userId, opts)
    expect(localStorage.getItem('order_ratings') !== null).toBe(kept)
    expect(localStorage.getItem('customer_data_owner')).toBe(userId)
  })

  test('claimCustomerData without a user id does nothing', () => {
    localStorage.setItem('order_ratings', 'x')
    claimCustomerData(null)
    expect(localStorage.getItem('order_ratings')).toBe('x')
    expect(localStorage.getItem('customer_data_owner')).toBeNull()
  })

  test('numeric ids are compared as strings', () => {
    localStorage.setItem('customer_data_owner', '42')
    localStorage.setItem('order_ratings', 'x')
    claimCustomerData(42)
    expect(localStorage.getItem('order_ratings')).toBe('x')
  })
})

describe('roleRouting.staffHomePath', () => {
  test.each([
    ['waiter', '/waiter/home'], ['captain', '/waiter/home'], ['chef', '/chef/dashboard'],
    ['admin', '/admin/dashboard'], ['manager', '/admin/dashboard'], ['superadmin', '/superadmin/dashboard'],
    ['customer', null], ['unknown', null], [undefined, null],
  ])('%s → %s', (role, path) => {
    expect(staffHomePath(role ? { role } : null)).toBe(path)
  })
})

describe('waiterScope', () => {
  const table = (id, area, assignedWaiter) => ({ _id: id, area, assignedWaiter })
  const takeaway = { table: null }

  test('getWaiterScope normalises raw ids and populated refs', () => {
    const s = getWaiterScope({ _id: 'w1', role: 'waiter', assignedAreas: ['a1', { _id: 'a2' }], assignedTables: [{ _id: 't1' }] })
    expect([...s.assignedAreaIds]).toEqual(['a1', 'a2'])
    expect([...s.assignedTableIds]).toEqual(['t1'])
    expect(s).toMatchObject({ hasAreaScope: true, hasTableScope: true, handlesTakeaway: false, isSupervisor: false, userId: 'w1' })
    expect(getWaiterScope(null)).toMatchObject({ hasAreaScope: false, userId: '' })
  })

  test.each([
    ['catch-all waiter sees takeaway', { role: 'waiter' }, true],
    ['area-pinned waiter does not see takeaway', { role: 'waiter', assignedAreas: ['a1'] }, false],
    ['area-pinned takeaway handler sees takeaway', { role: 'waiter', assignedAreas: ['a1'], handlesTakeaway: true }, true],
    ['pinned captain (supervisor) sees takeaway', { role: 'captain', assignedTables: ['t1'] }, true],
  ])('takeaway: %s', (_n, user, expected) => {
    expect(inWaiterScope(getWaiterScope(user), takeaway)).toBe(expected)
  })

  test.each([
    ['catch-all sees all dine-in', { role: 'waiter' }, table('t9', 'a9'), true],
    ['pure takeaway handler sees no dine-in', { role: 'waiter', handlesTakeaway: true }, table('t9', 'a9'), false],
    ['area match (raw area id)', { assignedAreas: ['a1'] }, table('t9', 'a1'), true],
    ['area match (populated area)', { assignedAreas: ['a1'] }, table('t9', { _id: 'a1' }), true],
    ['area miss', { assignedAreas: ['a1'] }, table('t9', 'a2'), false],
    ['table pin match', { assignedTables: ['t1'] }, table('t1', 'a2'), true],
    ['table pin miss', { assignedTables: ['t1'] }, table('t2', 'a2'), false],
    ['both gates must pass', { assignedAreas: ['a1'], assignedTables: ['t1'] }, table('t1', 'a2'), false],
    ['area with null id', { assignedAreas: ['a1'] }, table('t9', null), false],
    ['captain-assigned table overrides pins', { _id: 'w1', assignedAreas: ['a1'] }, table('t9', 'a2', { _id: 'w1' }), true],
  ])('dine-in: %s', (_n, user, t, expected) => {
    expect(inWaiterScope(getWaiterScope(user), { table: t })).toBe(expected)
  })

  test.each([
    [{ userId: 'w1' }, { assignedWaiter: 'w1' }, true],
    [{ userId: 'w1' }, { assignedWaiter: { _id: 'w1' } }, true],
    [{ userId: 'w1' }, { assignedWaiter: 'w2' }, false],
    [{ userId: '' }, { assignedWaiter: '' }, false],
    [{ userId: 'w1' }, null, false],
    [null, { assignedWaiter: 'w1' }, false],
  ])('isAssignedToMe(%j, %j) → %s', (scope, t, expected) => {
    expect(isAssignedToMe(scope, t)).toBe(expected)
  })
})
