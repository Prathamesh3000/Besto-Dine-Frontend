import { describe, test, expect } from 'vitest'
import { describePaymentInitError } from '../../utils/payInitError'

describe('describePaymentInitError', () => {
  test('a 500 from create-order → generic retry message, never the raw server text', () => {
    const r = describePaymentInitError({ response: { status: 500, data: { message: 'Failed to create payment order' } } })
    expect(r.title).toBe("We couldn't start the payment")
    expect(r.message).toMatch(/try again/i)
    expect(r.message).not.toMatch(/Failed to create payment order/)
  })

  test('a 429 → "payments are busy", wait and retry', () => {
    const r = describePaymentInitError({ response: { status: 429 } })
    expect(r.title).toBe('Payments are busy right now')
    expect(r.message).toMatch(/wait a minute/i)
  })

  test('no connection (axios network error) → check your internet', () => {
    expect(describePaymentInitError({ code: 'ERR_NETWORK' }).title).toBe("Can't reach the payment service")
    expect(describePaymentInitError({ message: 'Network Error' }).title).toBe("Can't reach the payment service")
  })

  test('a non-HTTP failure (e.g. the gateway script threw) is not blamed on the network', () => {
    expect(describePaymentInitError(new TypeError('x is not a constructor')).title).toBe("We couldn't start the payment")
  })

  test('every message reassures the customer that nothing was charged', () => {
    for (const err of [{ response: { status: 500 } }, { response: { status: 429 } }, { code: 'ERR_NETWORK' }, undefined]) {
      expect(describePaymentInitError(err).message).toMatch(/Nothing was charged and your order has not been placed/)
    }
  })
})
