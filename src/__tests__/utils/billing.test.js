/**
 * billing.js — computeBill parity with the backend is covered by
 * scripts/billing-parity.mjs; these tests focus on the other exports.
 */
import { describe, test, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  normaliseOrderType, toTaxConfig, computeBill, computeSubtotal, billFromOrder, round2,
} from '@/utils/billing'

// Backend's own pure append math — the oracle for what the server stores
// after an append (Backend/services/orderBillMath.js). Read-only use.
const require = createRequire(import.meta.url)
const { recomputeBillAfterAppend } = require('../../../../Backend/services/orderBillMath.js')

describe('normaliseOrderType', () => {
  test.each([
    ['dinein', 'dine-in'], ['Dine In', 'dine-in'], ['dine_in', 'dine-in'], ['DINE-IN', 'dine-in'],
    ['takeaway', 'takeaway'], ['Take Away', 'takeaway'], ['pickup', 'takeaway'],
    ['delivery', 'delivery'], ['home_delivery', 'delivery'],
    ['kiosk', 'kiosk'],
    ['', 'dine-in'], [null, 'dine-in'], [undefined, 'dine-in'],
    ['counter', 'counter'],
  ])('%j → %s', (input, expected) => {
    expect(normaliseOrderType(input)).toBe(expected)
  })
})

describe('toTaxConfig', () => {
  test('missing settings → zero config', () => {
    expect(toTaxConfig(null)).toEqual({ gstPct: 0, servicePct: 0, additionalCharges: [] })
  })
  test('disabled taxes contribute 0 and disabled charges are dropped', () => {
    const cfg = toTaxConfig({
      gst: { enabled: false, value: 5 },
      serviceCharge: { enabled: true, value: '10' },
      additionalCharges: [
        { name: 'Packaging', type: 'Fixed', value: 20 },
        { name: 'Old', type: 'Fixed', value: 5, enabled: false },
      ],
    })
    expect(cfg.gstPct).toBe(0)
    expect(cfg.servicePct).toBe(10)
    expect(cfg.additionalCharges.map((c) => c.name)).toEqual(['Packaging'])
  })
  test('non-numeric value coerces to 0', () => {
    expect(toTaxConfig({ gst: { enabled: true, value: 'abc' } }).gstPct).toBe(0)
  })
})

describe('computeBill (policy edges only)', () => {
  test('flat charges are dropped from an empty bill', () => {
    const b = computeBill({ subtotal: 0, taxConfig: { additionalCharges: [{ name: 'Pack', type: 'Fixed', value: 20 }] } })
    expect(b.additionalCharges).toEqual([])
    expect(b.total).toBe(0)
  })
  test('service charge applies to dine-in only', () => {
    const cfg = { gstPct: 5, servicePct: 10 }
    expect(computeBill({ subtotal: 100, taxConfig: cfg, orderType: 'dine-in' }).total).toBe(115)
    expect(computeBill({ subtotal: 100, taxConfig: cfg, orderType: 'takeaway' }).total).toBe(105)
  })
  test('additional charges: percentage on subtotal, fixed as-is, zero-amount rows hidden', () => {
    const b = computeBill({
      subtotal: 200,
      orderType: 'takeaway',
      taxConfig: { additionalCharges: [
        { name: 'Packing', type: 'Percentage', value: '2.5' },
        { name: 'Bag', type: 'Fixed', value: 10 },
        { name: 'Zero', type: 'Fixed', value: 0 },
      ] },
    })
    expect(b.additionalCharges).toEqual([
      { name: 'Packing', type: 'Percentage', value: 2.5, amount: 5 },
      { name: 'Bag', type: 'Fixed', value: 10, amount: 10 },
    ])
    expect(b.additionalChargesTotal).toBe(15)
    expect(b.total).toBe(215)
  })
  test('over-large discount clamps the total at 0', () => {
    expect(computeBill({ subtotal: 50, couponDiscount: 80 }).total).toBe(0)
  })
  // Pricing decision: GST is levied on (subtotal − coupon), floored at 0.
  test('₹1000 food, 5% GST, ₹100 coupon → GST ₹45, total ₹945', () => {
    const b = computeBill({ subtotal: 1000, taxConfig: { gstPct: 5 }, orderType: 'takeaway', couponDiscount: 100 })
    expect(b.gst).toBe(45)
    expect(b.total).toBe(945)
  })
  test('service / additional charges stay on the gross subtotal; points do not reduce GST', () => {
    const b = computeBill({
      subtotal: 1000, orderType: 'dine-in', couponDiscount: 100, pointsRedeemed: 50,
      taxConfig: { gstPct: 5, servicePct: 10, additionalCharges: [{ name: 'Green', type: 'Percentage', value: 2 }] },
    })
    // gst 5% of 900 = 45; service 100; green 20 → 1000 + 165 − 100 − 50 = 1015
    expect(b).toMatchObject({ gst: 45, serviceCharge: 100, additionalChargesTotal: 20, total: 1015 })
  })
  test('a coupon above the subtotal floors the GST base at 0', () => {
    expect(computeBill({ subtotal: 200, taxConfig: { gstPct: 5 }, couponDiscount: 250 }).gst).toBe(0)
  })
  test('no arguments → zero bill', () => {
    expect(computeBill().total).toBe(0)
  })
})

describe('computeSubtotal', () => {
  test.each([
    ['unitPrice wins over price', [{ unitPrice: 50, price: 40, quantity: 2 }], 100],
    ['price used when no unitPrice', [{ price: 40, quantity: 3 }], 120],
    ['missing quantity counts as 1', [{ price: 40 }], 40],
    ['quantity 0 counts as 1 (documented: `|| 1`)', [{ price: 40, quantity: 0 }], 40],
    ['non-numeric price → 0', [{ price: 'x', quantity: 2 }], 0],
    ['null entries tolerated', [null, { price: 10 }], 10],
    ['float dust rounded', [{ price: 0.1 }, { price: 0.2 }], 0.3],
  ])('%s', (_n, items, expected) => {
    expect(computeSubtotal(items)).toBe(expected)
  })
  test.each([undefined, null, []])('%j → 0', (items) => {
    expect(computeSubtotal(items)).toBe(0)
  })
})

describe('billFromOrder', () => {
  const t0 = '2026-10-01T12:00:00.000Z'
  const t1 = '2026-10-01T12:30:00.000Z'
  const gst18 = { gstPct: 18, servicePct: 0, additionalCharges: [] }

  test('uses the stored breakdown when it reconciles with the stored total', () => {
    const order = {
      items: [{ price: 100, quantity: 2, addedAt: t0 }],
      gst: 10, gstPercentage: 5, serviceCharge: 20, serviceChargePercentage: 10,
      additionalCharges: [{ name: 'Pack', type: 'Fixed', value: 15, amount: 15 }],
      total: 245, type: 'dine-in',
    }
    const b = billFromOrder(order, gst18)
    expect(b.fromServer).toBe(true)
    expect(b.gst).toBe(10)
    expect(b.gstPct).toBe(5)
    expect(b.serviceCharge).toBe(20)
    expect(b.serviceChargeApplies).toBe(true)
    expect(b.additionalChargesTotal).toBe(15)
    expect(b.total).toBe(245)
    expect(b.computedTotal).toBe(245)
  })

  test('reconciliation tolerates ±0.05 rounding drift', () => {
    const order = { items: [{ price: 100 }], gst: 5, gstPercentage: 5, total: 105.04 }
    expect(billFromOrder(order, gst18).fromServer).toBe(true)
  })

  test('falls back to current settings when the stored breakdown does not reconcile', () => {
    const order = { items: [{ price: 100 }], gst: 5, gstPercentage: 5, total: 150, type: 'takeaway' }
    const b = billFromOrder(order, gst18)
    expect(b.fromServer).toBe(false)
    expect(b.gst).toBe(18)
    expect(b.computedTotal).toBe(118)
    expect(b.total).toBe(150) // the stored total is still what is owed
  })

  test('without a fallback config a non-reconciling stored breakdown is still shown', () => {
    const order = { items: [{ price: 100 }], gst: 5, gstPercentage: 5, total: 150 }
    const b = billFromOrder(order, null)
    expect(b.fromServer).toBe(true)
    expect(b.computedTotal).toBe(105)
    expect(b.total).toBe(150)
  })

  test('legacy order without breakdown fields is re-derived with the server type rule', () => {
    const order = { items: [{ price: 100 }], total: 115, orderType: 'dine-in' }
    const b = billFromOrder(order, { gstPct: 5, servicePct: 10, additionalCharges: [] })
    expect(b.fromServer).toBe(false)
    expect(b.serviceCharge).toBe(10)
    expect(b.total).toBe(115)
  })

  test('delivery orders: no service charge and the slab fee from order.delivery.fee', () => {
    const order = { items: [{ price: 100 }], delivery: { requested: true, fee: 30 }, type: 'dine-in' }
    const b = billFromOrder(order, { gstPct: 5, servicePct: 10, additionalCharges: [] })
    expect(b.serviceChargeApplies).toBe(false)
    expect(b.deliveryFee).toBe(30)
    expect(b.total).toBe(135)
    expect(b.storedTotal).toBeNull()
  })

  test('manual discount is reported but not taken off the total', () => {
    const order = { items: [{ price: 100 }], gst: 5, gstPercentage: 5, total: 105, manualDiscount: 10.555 }
    const b = billFromOrder(order, gst18)
    expect(b.manualDiscount).toBe(10.56)
    expect(b.total).toBe(105)
  })

  test('coupon / points / tip are part of reconciliation', () => {
    const order = {
      items: [{ price: 200 }], gst: 10, gstPercentage: 5,
      couponDiscount: 20, pointsRedeemed: 5, tipAmount: 15, total: 200,
    }
    const b = billFromOrder(order, gst18)
    expect(b.fromServer).toBe(true)
    expect(b.couponDiscount).toBe(20)
    expect(b.tipAmount).toBe(15)
  })

  test('totalPayment is accepted as the stored total', () => {
    const b = billFromOrder({ items: [{ price: 100 }], totalPayment: '118' }, gst18)
    expect(b.storedTotal).toBe(118)
  })

  test.each(['', 'abc', null])('unusable stored total %j → computed total', (total) => {
    const b = billFromOrder({ items: [{ price: 100 }], total }, gst18)
    expect(b.storedTotal).toBeNull()
    expect(b.total).toBe(118)
  })

  test('explicit items override order.items', () => {
    const b = billFromOrder({ items: [{ price: 999 }] }, null, [{ price: 10, quantity: 2 }])
    expect(b.subtotal).toBe(20)
  })

  test('null order is safe', () => {
    expect(billFromOrder(null).total).toBe(0)
  })

  test('items added within the 60s grace window do not count as appended', () => {
    const order = {
      items: [
        { price: 100, addedAt: t0 },
        { price: 100, addedAt: '2026-10-01T12:00:45.000Z' },
      ],
      gst: 10, gstPercentage: 5, total: 210,
    }
    expect(billFromOrder(order, gst18).fromServer).toBe(true)
  })

  // Regression (fixed 2026-10): billFromOrder no longer discards a reconciling stamp just because items were appended (backend re-stamps on append).
  test('appended order whose re-stamped breakdown reconciles shows the stored breakdown, not re-derived current-settings taxes', () => {
    // Arrange — placed at 5% GST, one round appended (server re-stamps),
    // then the admin changes GST to 18%.
    const placed = { gst: 5, serviceCharge: 0, additionalCharges: [], additionalChargesTotal: 0, total: 105 }
    const restamp = recomputeBillAfterAppend({
      bill: placed, subtotalBefore: 100, subtotalAfter: 200,
      taxConfig: { gstPct: 5, servicePct: 0, additionalCharges: [] }, orderType: 'takeaway',
    })
    const order = {
      type: 'takeaway',
      items: [{ price: 100, addedAt: t0 }, { price: 100, addedAt: t1 }],
      ...restamp,
    }
    // The stored breakdown reconciles exactly with the stored total.
    expect(round2(200 + order.gst)).toBe(order.total) // 210

    // Act — the screen passes the CURRENT settings (now 18%) as the fallback.
    const b = billFromOrder(order, gst18)

    // Assert — the server's stored GST (₹10 @5%) is displayed.
    expect(b.gst).toBe(10)
    expect(b.gstPct).toBe(5)
    expect(b.fromServer).toBe(true)
  })
})
