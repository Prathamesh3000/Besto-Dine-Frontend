import { describe, it, expect } from 'vitest'
import {
  generateIdempotencyKey, withIdempotencyKey, createKeyStore, createActionGuard, needsIdempotencyKey,
  orderPayKey, orderPayKeys, isOrderPaymentBody,
} from '../../utils/idempotency'

describe('idempotency helpers', () => {
  it('generates unique prefixed keys', () => {
    const a = generateIdempotencyKey(), b = generateIdempotencyKey()
    expect(a).toMatch(/^web-/)
    expect(a).not.toBe(b)
  })

  it('withIdempotencyKey merges the header and keeps other config', () => {
    const cfg = withIdempotencyKey('k1', { _silent: true, headers: { 'X-A': '1' } })
    expect(cfg).toEqual({ _silent: true, headers: { 'X-A': '1', 'Idempotency-Key': 'k1' } })
    const plain = { _silent: true }
    expect(withIdempotencyKey('', plain)).toBe(plain)
  })

  it('key store reuses a key until the fingerprint changes or it is reset', () => {
    const s = createKeyStore()
    const k = s.get('pay', '100|o1')
    expect(s.get('pay', '100|o1')).toBe(k)
    const k2 = s.get('pay', '120|o1')
    expect(k2).not.toBe(k)
    expect(s.get('other', '100|o1')).not.toBe(k2)
    s.reset('pay')
    expect(s.get('pay', '120|o1')).not.toBe(k2)
  })

  it('action guard blocks a second synchronous entry until released', () => {
    const g = createActionGuard()
    expect(g.enter()).toBe(true)
    expect(g.enter()).toBe(false)
    expect(g.busy).toBe(true)
    g.leave()
    expect(g.enter()).toBe(true)
  })

  it('needsIdempotencyKey matches payment-type routes only', () => {
    expect(needsIdempotencyKey('post', '/orders')).toBe(true)
    expect(needsIdempotencyKey('PATCH', '/orders/abc/payment')).toBe(true)
    expect(needsIdempotencyKey('post', '/orders/abc/repeat-all')).toBe(true)
    expect(needsIdempotencyKey('post', '/orders/abc/repeat/item1')).toBe(true)
    expect(needsIdempotencyKey('post', '/razorpay/verify-payment')).toBe(true)
    expect(needsIdempotencyKey('post', '/razorpay/refund')).toBe(true)
    expect(needsIdempotencyKey('post', '/razorpay/verify-wallet-recharge')).toBe(true)
    expect(needsIdempotencyKey('post', '/wallet/pay')).toBe(true)
    expect(needsIdempotencyKey('get', '/orders')).toBe(false)
    expect(needsIdempotencyKey('patch', '/orders/abc/status')).toBe(false)
    expect(needsIdempotencyKey('patch', '/orders/abc/status', { status: 'ready' })).toBe(false)
    expect(needsIdempotencyKey('patch', '/orders/abc/status', { paymentStatus: 'Paid' })).toBe(true)
    expect(needsIdempotencyKey('patch', '/orders/abc/status', { amountPaid: 0 })).toBe(true)
    expect(needsIdempotencyKey('patch', '/orders/abc/status', JSON.stringify({ amountPaid: 5 }))).toBe(true)
    expect(needsIdempotencyKey('post', '/advance-booking/create')).toBe(true)
    expect(needsIdempotencyKey('post', '/advance-booking/b1/create-remaining-payment')).toBe(true)
    expect(needsIdempotencyKey('post', '/advance-booking/b1/verify-remaining-payment')).toBe(true)
    expect(needsIdempotencyKey('post', '/advance-booking/b1/cancel')).toBe(false)
    expect(needsIdempotencyKey('patch', '/advance-booking/b1/status')).toBe(false)
    expect(needsIdempotencyKey('post', '/orders/delivery-quote')).toBe(false)
    expect(needsIdempotencyKey('get', '/razorpay/reconcile')).toBe(false)
  })
})

describe('order settle keys', () => {
  it('orderPayKey is stable per (order + method/amount) and changes with the fingerprint', () => {
    orderPayKeys.reset()
    const body = { paymentStatus: 'Paid', paymentMethod: 'Cash', amountPaid: 100 }
    const a = orderPayKey('o1', body)
    expect(orderPayKey('o1', { ...body, paymentMethod: 'cash' })).toBe(a)
    expect(orderPayKey('o1', { ...body, amountPaid: 120 })).not.toBe(a)
    expect(orderPayKey('o2', body)).not.toBe(a)
  })
  it('isOrderPaymentBody detects money-bearing bodies only', () => {
    expect(isOrderPaymentBody({ status: 'served' })).toBe(false)
    expect(isOrderPaymentBody({ paymentStatus: 'Paid' })).toBe(true)
    expect(isOrderPaymentBody(null)).toBe(false)
  })
})
