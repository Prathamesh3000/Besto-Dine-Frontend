/**
 * utils/guestOrderAccess — the one-off access token a token-mode guest
 * counter order gets from POST /orders (§12.2): stored per order id,
 * expired entries dropped, and mapped onto api calls / socket joins.
 */
import { describe, test, expect, vi, afterEach } from 'vitest'
import {
  rememberGuestOrderAccess, guestOrderAccessFor, clearGuestOrderAccess,
  orderIdOfRequest, guestAccessForRequest, guestAccessJoinPayload, GUEST_ORDER_ACCESS_KEY,
} from '@/utils/guestOrderAccess'

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345'
const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

afterEach(() => { vi.useRealTimers() })

describe('storage', () => {
  test('remembers one token under every id given (orderId + _id) with the server expiry', () => {
    rememberGuestOrderAccess(['ORD-20261019-0042', '65f000000000000000000001', null, undefined], TOKEN, future())
    expect(guestOrderAccessFor('ORD-20261019-0042')).toBe(TOKEN)
    expect(guestOrderAccessFor('65f000000000000000000001')).toBe(TOKEN)
    expect(guestOrderAccessFor('ORD-other')).toBeNull()
    expect(guestOrderAccessFor('')).toBeNull()
    expect(guestOrderAccessFor(null)).toBeNull()
    const stored = JSON.parse(localStorage.getItem(GUEST_ORDER_ACCESS_KEY))
    expect(Object.keys(stored).sort()).toEqual(['65f000000000000000000001', 'ORD-20261019-0042'])
    expect(stored['ORD-20261019-0042']).toEqual({ token: TOKEN, expiresAt: expect.any(Number) })
  })

  test('a single id, a missing expiry (24 h default) and junk input', () => {
    rememberGuestOrderAccess('ORD-1', TOKEN)
    const { expiresAt } = JSON.parse(localStorage.getItem(GUEST_ORDER_ACCESS_KEY))['ORD-1']
    expect(expiresAt - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000)
    expect(expiresAt - Date.now()).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
    rememberGuestOrderAccess('ORD-2', '', future())           // no token → nothing
    rememberGuestOrderAccess([], TOKEN, future())             // no ids → nothing
    expect(guestOrderAccessFor('ORD-2')).toBeNull()
    expect(Object.keys(JSON.parse(localStorage.getItem(GUEST_ORDER_ACCESS_KEY)))).toEqual(['ORD-1'])
  })

  test('expired entries are dropped on read; clearGuestOrderAccess forgets everything', () => {
    rememberGuestOrderAccess('ORD-old', TOKEN, new Date(Date.now() - 1000).toISOString())
    rememberGuestOrderAccess('ORD-new', `${TOKEN}x`, future())
    expect(guestOrderAccessFor('ORD-old')).toBeNull()
    expect(guestOrderAccessFor('ORD-new')).toBe(`${TOKEN}x`)
    expect(Object.keys(JSON.parse(localStorage.getItem(GUEST_ORDER_ACCESS_KEY)))).toEqual(['ORD-new'])
    vi.useFakeTimers({ now: Date.now() + 2 * 60 * 60 * 1000 })
    expect(guestOrderAccessFor('ORD-new')).toBeNull()
    expect(localStorage.getItem(GUEST_ORDER_ACCESS_KEY)).toBeNull()
    vi.useRealTimers()
    rememberGuestOrderAccess('ORD-3', TOKEN, future())
    clearGuestOrderAccess()
    expect(localStorage.getItem(GUEST_ORDER_ACCESS_KEY)).toBeNull()
    expect(guestOrderAccessFor('ORD-3')).toBeNull()
  })

  test('a corrupt blob reads as empty', () => {
    localStorage.setItem(GUEST_ORDER_ACCESS_KEY, '{nope')
    expect(guestOrderAccessFor('ORD-1')).toBeNull()
    localStorage.setItem(GUEST_ORDER_ACCESS_KEY, '[1,2]')
    expect(guestOrderAccessFor('ORD-1')).toBeNull()
  })
})

describe('which request is about which order', () => {
  test.each([
    ['/orders/ORD-1/detail', undefined, 'ORD-1'],
    ['/orders/ORD-1/detail?guestAccess=x', undefined, 'ORD-1'],
    ['/orders/track/ORD-1', undefined, 'ORD-1'],
    ['/orders/65f000000000000000000001/payment', undefined, '65f000000000000000000001'],
    ['/orders/ORD-1/request-counter-payment', undefined, 'ORD-1'],
    ['/orders/ORD-1/cancel', undefined, 'ORD-1'],
    ['/orders/ORD%2F1/detail', undefined, 'ORD/1'],
    ['http://localhost:5000/api/v1/orders/ORD-1/detail', undefined, 'ORD-1'],
    ['/razorpay/create-order', { amount: 100, cafeOrderId: 'ORD-1' }, 'ORD-1'],
    ['/razorpay/verify-payment', JSON.stringify({ cafeOrderId: 'ORD-1' }), 'ORD-1'],
    ['/razorpay/orphan-refund', { cafeOrderId: 'ORD-1' }, 'ORD-1'],
    ['/razorpay/create-order', { amount: 100, cafeOrderId: 'none' }, null],
    ['/razorpay/create-order', { amount: 100 }, null],
    ['/razorpay/create-wallet-recharge', { amount: 100, cafeOrderId: 'ORD-1' }, null],
    ['/orders', { cafeOrderId: 'ORD-1' }, null],
    ['/orders/my-orders', undefined, 'my-orders'],   // a segment, but nothing is ever stored under it
    ['/menu', undefined, null],
    [undefined, undefined, null],
  ])('%s → %s', (url, data, expected) => {
    expect(orderIdOfRequest(url, data)).toBe(expected)
  })

  test('guestAccessForRequest: the stored token for that order only', () => {
    rememberGuestOrderAccess(['ORD-1', '65f000000000000000000001'], TOKEN, future())
    expect(guestAccessForRequest('/orders/ORD-1/detail')).toBe(TOKEN)
    expect(guestAccessForRequest('/orders/65f000000000000000000001/payment')).toBe(TOKEN)
    expect(guestAccessForRequest('/razorpay/verify-payment', { cafeOrderId: 'ORD-1' })).toBe(TOKEN)
    expect(guestAccessForRequest('/orders/ORD-2/detail')).toBeNull()
    expect(guestAccessForRequest('/orders/my-orders')).toBeNull()
    expect(guestAccessForRequest('/menu')).toBeNull()
  })
})

describe('socket join payload', () => {
  test('order rooms of a remembered order join with the token; everything else is the plain room', () => {
    rememberGuestOrderAccess('ORD-1', TOKEN, future())
    expect(guestAccessJoinPayload('order:ORD-1')).toEqual({ room: 'order:ORD-1', guestAccess: TOKEN })
    expect(guestAccessJoinPayload('order:ORD-2')).toBe('order:ORD-2')
    expect(guestAccessJoinPayload('table:abc')).toBe('table:abc')
    expect(guestAccessJoinPayload('t:r1:menu')).toBe('t:r1:menu')
    expect(guestAccessJoinPayload(null)).toBeNull()
  })
})
