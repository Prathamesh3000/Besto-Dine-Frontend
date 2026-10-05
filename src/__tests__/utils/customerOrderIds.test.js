import { describe, test, expect } from 'vitest'
import {
  readScanSessionId, getCustomerOrderSession, readRecoveryOrderIds, rememberOrderIds,
  forgetOrderIds, clearOrderIds, CUSTOMER_ORDERS_ROOT,
} from '@/utils/customerOrderIds'

const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload) => `h.${b64url(payload)}.sig`
const IDS_KEY = 'customer_order_ids_v1'

describe('readScanSessionId', () => {
  test('no scan token → null', () => {
    expect(readScanSessionId()).toBeNull()
  })
  test('reads sessionId from the JWT payload (base64url, unpadded)', () => {
    localStorage.setItem('scanToken', jwt({ sessionId: 'sess-1', x: '??>>' }))
    expect(readScanSessionId()).toBe('sess-1')
  })
  test('undecodable token falls back to a token-suffix id', () => {
    const token = 'not-a-jwt-but-long-enough-to-slice-xxxxxxxx'
    localStorage.setItem('scanToken', token)
    expect(readScanSessionId()).toBe(`tok:${token.slice(-24)}`)
  })
  test('JWT without sessionId falls back to suffix id', () => {
    const token = jwt({ table: 't' })
    localStorage.setItem('scanToken', token)
    expect(readScanSessionId()).toBe(`tok:${token.slice(-24)}`)
  })
})

describe('getCustomerOrderSession', () => {
  test('logged-in user wins', () => {
    localStorage.setItem('scanToken', jwt({ sessionId: 's' }))
    const s = getCustomerOrderSession({ _id: 'u1' }, true)
    expect(s).toMatchObject({ key: 'user:u1', userId: 'u1', isLoggedIn: true, scanSession: 's' })
  })
  test('user ignored when not logged in → guest scan session', () => {
    localStorage.setItem('scanToken', jwt({ sessionId: 's' }))
    expect(getCustomerOrderSession({ _id: 'u1' }, false).key).toBe('guest:s')
  })
  test('table-only fallback', () => {
    localStorage.setItem('dineInTable', JSON.stringify({ id: 't9' }))
    expect(getCustomerOrderSession(null, false)).toMatchObject({ key: 'table:t9', tableId: 't9' })
  })
  test('corrupt dineInTable → no key', () => {
    localStorage.setItem('dineInTable', '{bad')
    expect(getCustomerOrderSession(null, false).key).toBeNull()
  })
  test('nobody → null key', () => {
    expect(getCustomerOrderSession(undefined, true)).toMatchObject({ key: null, isLoggedIn: false })
  })
  test('query root constant', () => {
    expect(CUSTOMER_ORDERS_ROOT).toEqual(['customer', 'orders'])
  })
})

describe('order id recovery store', () => {
  const guestA = { scanSession: 'A', userId: null }
  const guestB = { scanSession: 'B', userId: null }
  const user1 = { scanSession: null, userId: 'u1' }

  test('remember then read back for the same session, newest first, de-duplicated', () => {
    rememberOrderIds(guestA, ['o1'])
    rememberOrderIds(guestA, ['o2', 'o1'])
    expect(readRecoveryOrderIds(guestA)).toEqual(['o2', 'o1'])
  })

  test('a different diner on the same phone never sees the previous list', () => {
    rememberOrderIds(guestA, ['o1'])
    expect(readRecoveryOrderIds(guestB)).toEqual([])
    rememberOrderIds(guestB, ['o9'])
    // B's write replaced A's list entirely.
    expect(readRecoveryOrderIds(guestA)).toEqual([])
    expect(readRecoveryOrderIds(guestB)).toEqual(['o9'])
  })

  test('user-owned list readable by the same user', () => {
    rememberOrderIds(user1, ['x'])
    expect(readRecoveryOrderIds(user1)).toEqual(['x'])
    expect(readRecoveryOrderIds({ userId: 'u2' })).toEqual([])
  })

  test('caps at 30 ids', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `o${i}`)
    rememberOrderIds(guestA, ids)
    expect(readRecoveryOrderIds(guestA)).toHaveLength(30)
  })

  test.each([
    ['no session identity', {}, ['o1']],
    ['null session', null, ['o1']],
    ['no ids', guestA, []],
    ['only invalid ids', guestA, [null, 5, '']],
  ])('remember is a no-op: %s', (_n, session, ids) => {
    rememberOrderIds(session, ids)
    expect(localStorage.getItem(IDS_KEY)).toBeNull()
  })

  test('legacy cafe_orders_v2 ids are merged in (ids only)', () => {
    localStorage.setItem('cafe_orders_v2', JSON.stringify([{ orderId: 'L1' }, { id: 'L2' }, { orderId: 7 }, null]))
    expect(readRecoveryOrderIds(guestA)).toEqual(['L1', 'L2'])
  })

  test('corrupt stores are ignored', () => {
    localStorage.setItem(IDS_KEY, '{bad')
    localStorage.setItem('cafe_orders_v2', '{bad')
    expect(readRecoveryOrderIds(guestA)).toEqual([])
    localStorage.setItem(IDS_KEY, JSON.stringify({ ids: 'nope' }))
    expect(readRecoveryOrderIds(guestA)).toEqual([])
  })

  test('forgetOrderIds drops dead ids for the owning session only', () => {
    rememberOrderIds(guestA, ['o1', 'o2'])
    forgetOrderIds(guestB, ['o1'])
    expect(readRecoveryOrderIds(guestA)).toEqual(['o1', 'o2'])
    forgetOrderIds(guestA, ['o1'])
    expect(readRecoveryOrderIds(guestA)).toEqual(['o2'])
    forgetOrderIds(guestA, [])
    expect(readRecoveryOrderIds(guestA)).toEqual(['o2'])
  })

  test('guest who logs in keeps the scan-stamped list and gains the user stamp', () => {
    rememberOrderIds(guestA, ['o1'])
    rememberOrderIds({ scanSession: 'A', userId: 'u1' }, ['o2'])
    const stored = JSON.parse(localStorage.getItem(IDS_KEY))
    expect(stored).toMatchObject({ scanSession: 'A', userId: 'u1', ids: ['o2', 'o1'] })
  })

  test('clearOrderIds removes the store', () => {
    rememberOrderIds(guestA, ['o1'])
    clearOrderIds()
    expect(localStorage.getItem(IDS_KEY)).toBeNull()
  })
})
