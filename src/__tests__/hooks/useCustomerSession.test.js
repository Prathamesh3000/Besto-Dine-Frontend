import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useCustomerSession, { readCustomerSession } from '@/hooks/useCustomerSession'

const table = (o = { _id: 't1', name: 'T1' }) => localStorage.setItem('dineInTable', JSON.stringify(o))

describe('readCustomerSession derivation', () => {
  test('no keys → browsing takeaway, may order, no table chrome', () => {
    expect(readCustomerSession()).toMatchObject({
      phase: 'browsing', table: null, orderType: 'takeaway', isGuest: false,
      isDineIn: false, canOrder: true, canRequestService: false,
      showTableChrome: false, isSettled: false, guestExpired: false,
    })
  })

  test('scanned table → seated dine-in with service + ordering', () => {
    table()
    expect(readCustomerSession()).toMatchObject({
      phase: 'seated', table: { id: 't1', name: 'T1' }, orderType: 'dine-in',
      canOrder: true, canRequestService: true, showTableChrome: true,
    })
  })

  test('table name falls back to tableNumber key; id may be `id`', () => {
    table({ id: 'x9' })
    localStorage.setItem('tableNumber', '12')
    expect(readCustomerSession().table).toEqual({ id: 'x9', name: '12' })
  })

  test.each([
    ['corrupt JSON', '{oops'],
    ['an object without an id', JSON.stringify({ name: 'T' })],
  ])('dineInTable with %s is treated as no table', (_l, raw) => {
    localStorage.setItem('dineInTable', raw)
    expect(readCustomerSession().table).toBeNull()
  })

  test('dine-in order type without a table cannot order', () => {
    localStorage.setItem('orderType', 'dine-in')
    expect(readCustomerSession()).toMatchObject({ phase: 'browsing', isDineIn: true, canOrder: false })
  })

  test('settled bill locks ordering and hides table chrome', () => {
    table()
    localStorage.setItem('dineInBillSettled', '1')
    const s = readCustomerSession()
    expect(s.phase).toBe('settled')
    expect(s).toMatchObject({ canOrder: false, canRequestService: false, showTableChrome: false, isSettled: true })
  })

  test('guest whose 24h window lapsed cannot act at all', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    table()
    localStorage.setItem('isGuest', 'true')
    localStorage.setItem('guest_session_start', String(Date.now() - 25 * 3600 * 1000))
    expect(readCustomerSession()).toMatchObject({ isGuest: true, guestExpired: true, canOrder: false, canRequestService: false })
  })
})

describe('useCustomerSession reactivity', () => {
  test.each([
    ['dineInLockChange', () => new Event('dineInLockChange')],
    ['guestSessionChange', () => new Event('guestSessionChange')],
    ['focus', () => new Event('focus')],
    ['storage on a watched key', () => new StorageEvent('storage', { key: 'dineInTable' })],
    ['storage clear (key null)', () => new StorageEvent('storage', { key: null })],
  ])('re-derives on %s', (_l, make) => {
    const { result } = renderHook(() => useCustomerSession())
    expect(result.current.phase).toBe('browsing')
    table()
    act(() => { window.dispatchEvent(make()) })
    expect(result.current.phase).toBe('seated')
  })

  test('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useCustomerSession())
    const before = result.current
    table()
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' })) })
    expect(result.current).toBe(before)
  })

  test('removes all four listeners on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useCustomerSession())
    unmount()
    const names = remove.mock.calls.map((c) => c[0])
    expect(names).toEqual(expect.arrayContaining(['storage', 'dineInLockChange', 'guestSessionChange', 'focus']))
  })
})
