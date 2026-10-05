/**
 * billing.js settle helpers — orderAmountDue / settleAmountForOrders /
 * billFromOrders. Staff settle screens (Waiter BillPage, Admin
 * TablesDashboard) send these as amountPaid, so they must equal the
 * server's due = order.total − manualDiscount − amountPaid, computed from
 * the STORED bill — never from the current (possibly edited) tax rates.
 */
import { describe, test, expect } from 'vitest'
import {
  orderAmountDue, settleAmountForOrders, billFromOrders, computeBill, toTaxConfig,
} from '@/utils/billing'

// Placed at 5% GST + 10% service: 1000 + 50 + 100 = 1150.
const STORED = {
  _id: 'o1',
  type: 'dine-in',
  items: [{ price: 500, quantity: 2 }],
  gst: 50, gstPercentage: 5,
  serviceCharge: 100, serviceChargePercentage: 10,
  total: 1150,
  manualDiscount: 50,
  amountPaid: 100,
}
// An admin has since changed the rates to 18% GST / 5% service.
const LIVE = toTaxConfig({ gst: { enabled: true, value: 18 }, serviceCharge: { enabled: true, value: 5 } })

describe('orderAmountDue', () => {
  test('live tax settings differ from the stored breakdown → due = stored total − manualDiscount − amountPaid', () => {
    const live = computeBill({ subtotal: 1000, taxConfig: LIVE, orderType: 'dine-in' }).total
    expect(live).toBe(1230) // what the old live recompute would have used
    expect(orderAmountDue(STORED, LIVE)).toBe(1150 - 50 - 100)
  })

  test('rounds to paise and never goes negative', () => {
    expect(orderAmountDue({ total: 100.1, manualDiscount: 0.05, amountPaid: 0.02 })).toBe(100.03)
    expect(orderAmountDue({ total: 500, manualDiscount: 0, amountPaid: 300.335 })).toBe(199.67)
    expect(orderAmountDue({ total: 100, manualDiscount: 80, amountPaid: 50 })).toBe(0)
  })

  test('manualDiscount override replaces the stored discount', () => {
    expect(orderAmountDue(STORED, LIVE, { manualDiscount: 200 })).toBe(1150 - 200 - 100)
    expect(orderAmountDue(STORED, LIVE, { manualDiscount: 0 })).toBe(1150 - 100)
  })

  test('legacy order with no stored total falls back to the given tax config', () => {
    const legacy = { type: 'dine-in', items: [{ price: 100, quantity: 1 }] }
    expect(orderAmountDue(legacy, toTaxConfig({ gst: { enabled: true, value: 5 } }))).toBe(105)
  })
})

describe('settleAmountForOrders', () => {
  const ROUND2 = { _id: 'o2', items: [{ price: 200, quantity: 1 }], gst: 10, gstPercentage: 5, total: 210, manualDiscount: 10, amountPaid: 0 }

  test('sums each order\'s stored due', () => {
    expect(settleAmountForOrders([STORED, ROUND2], LIVE)).toBe(1000 + 200)
  })

  test('a table-level discount replaces the stored manual discounts', () => {
    // (1150 − 100) + (210 − 0) − 75
    expect(settleAmountForOrders([STORED, ROUND2], LIVE, { manualDiscount: 75 })).toBe(1185)
  })

  test('empty list settles nothing', () => {
    expect(settleAmountForOrders([], LIVE)).toBe(0)
  })
})

describe('billFromOrders', () => {
  test('sums the stored breakdowns (not live rates) and reports a shared rate', () => {
    const b = billFromOrders([STORED, { items: [{ price: 100, quantity: 1 }], gst: 5, gstPercentage: 5, serviceCharge: 10, serviceChargePercentage: 10, total: 115 }], LIVE)
    expect(b).toMatchObject({
      subtotal: 1100, gst: 55, gstPct: 5, serviceCharge: 110, serviceChargePct: 10,
      total: 1265, manualDiscount: 50, amountPaid: 100, fromServer: true,
    })
  })

  test('mixed rates across rounds → rate is null (label shows no %)', () => {
    const other = { items: [{ price: 100, quantity: 1 }], gst: 18, gstPercentage: 18, total: 118 }
    expect(billFromOrders([STORED, other]).gstPct).toBeNull()
  })
})
