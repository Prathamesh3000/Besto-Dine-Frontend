import { describe, test, expect } from 'vitest'
import { sumLines, summarizeLines, buildPayments, paymentsFingerprint } from '@/utils/tenderLines'
import { orderPayKey, orderPayKeys } from '@/utils/idempotency'

describe('tenderLines', () => {
  test('sums with 2dp rounding and ignores blank / non-positive lines', () => {
    expect(sumLines([{ amount: '0.1' }, { amount: '0.2' }, { amount: '' }, { amount: '-5' }])).toBe(0.3)
  })

  test('summarize: exact split is valid', () => {
    const s = summarizeLines([{ method: 'cash', amount: '200' }, { method: 'upi', amount: '300' }], 500)
    expect(s).toMatchObject({ paid: 500, remaining: 0, change: 0, valid: true })
  })

  test('summarize: short split has a remainder and is invalid', () => {
    const s = summarizeLines([{ method: 'cash', amount: '200' }], 500)
    expect(s).toMatchObject({ remaining: 300, valid: false })
  })

  test('summarize: only cash may exceed the due (change)', () => {
    expect(summarizeLines([{ method: 'upi', amount: '300' }, { method: 'cash', amount: '300' }], 500)).toMatchObject({ change: 100, valid: true })
    expect(summarizeLines([{ method: 'upi', amount: '600' }], 500).valid).toBe(false)
  })

  test('summarize: a blank line makes it invalid; empty list is invalid', () => {
    expect(summarizeLines([{ method: 'cash', amount: '500' }, { method: 'upi', amount: '' }], 500).valid).toBe(false)
    expect(summarizeLines([], 500).valid).toBe(false)
  })

  test('buildPayments drops blanks and trims references', () => {
    expect(buildPayments([
      { method: 'cash', amount: '10.5' },
      { method: 'upi', amount: '5', reference: ' u1 ' },
      { method: 'card', amount: '' },
    ])).toEqual([{ method: 'cash', amount: 10.5 }, { method: 'upi', amount: 5, reference: 'u1' }])
  })

  test('fingerprint is empty without payments and changes with the lines', () => {
    expect(paymentsFingerprint(undefined)).toBe('')
    expect(paymentsFingerprint([{ method: 'cash', amount: 1 }])).not.toBe(paymentsFingerprint([{ method: 'cash', amount: 2 }]))
  })

  test('orderPayKey: same payments reuse the key, different payments get a new one', () => {
    orderPayKeys.reset()
    const body = { paymentStatus: 'Paid', payments: [{ method: 'cash', amount: 100 }, { method: 'upi', amount: 50 }] }
    const a = orderPayKey('o1', body)
    expect(orderPayKey('o1', { ...body, payments: [...body.payments] })).toBe(a)
    expect(orderPayKey('o1', { ...body, payments: [{ method: 'cash', amount: 120 }, { method: 'upi', amount: 30 }] })).not.toBe(a)
  })
})
