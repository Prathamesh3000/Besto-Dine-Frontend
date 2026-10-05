import { describe, test, expect } from 'vitest'
import {
  resolveUnitPrice, resolveStrikePrice, resolveOfferPercent, resolveSizePrice,
  resolveLinePrice, formatPrice, round2, isOfferExpired,
} from '@/utils/pricing'

describe('resolveUnitPrice', () => {
  test.each([
    ['finalPrice wins over basePrice and price', { finalPrice: 90, basePrice: 100, price: 120 }, 90],
    ['basePrice used when no finalPrice', { basePrice: 100, price: 120 }, 100],
    ['price used for legacy shapes', { price: 120 }, 120],
    ['free item (finalPrice 0) is honoured, not skipped', { finalPrice: 0, basePrice: 100 }, 0],
    ['empty-string finalPrice falls through', { finalPrice: '', basePrice: 100 }, 100],
    ['NaN-ish finalPrice falls through', { finalPrice: 'abc', basePrice: 100 }, 100],
    ['numeric strings are coerced', { finalPrice: '89.5' }, 89.5],
    ['nothing priced → 0', {}, 0],
    ['combo uses price first', { isCombo: true, price: 250, finalPrice: 10, basePrice: 20 }, 250],
    ['combo falls back to finalPrice', { isCombo: true, finalPrice: 10, basePrice: 20 }, 10],
    ['combo falls back to basePrice', { isCombo: true, basePrice: 20 }, 20],
    ['combo with nothing → 0', { isCombo: true }, 0],
  ])('%s', (_name, item, expected) => {
    expect(resolveUnitPrice(item)).toBe(expected)
  })

  test.each([null, undefined])('returns 0 for %s item', (item) => {
    expect(resolveUnitPrice(item)).toBe(0)
  })
})

describe('resolveStrikePrice', () => {
  test.each([
    ['active offer shows base as strike', { basePrice: 200, finalPrice: 180 }, 200],
    ['no offer (equal prices) → null', { basePrice: 200, finalPrice: 200 }, null],
    ['final above base → null', { basePrice: 100, finalPrice: 120 }, null],
    ['missing finalPrice → null', { basePrice: 200 }, null],
    ['missing basePrice → null', { finalPrice: 200 }, null],
    ['combo never strikes', { isCombo: true, basePrice: 200, finalPrice: 100 }, null],
  ])('%s', (_n, item, expected) => {
    expect(resolveStrikePrice(item)).toBe(expected)
  })
  test('null item → null', () => expect(resolveStrikePrice(null)).toBeNull())
})

describe('resolveOfferPercent', () => {
  test.each([
    ['explicit offerPercentage wins', { offerPercentage: 15, basePrice: 100, finalPrice: 50 }, 15],
    ['inferred from base vs final', { basePrice: 200, finalPrice: 150 }, 25],
    ['zero explicit falls back to inference', { offerPercentage: 0, basePrice: 100, finalPrice: 90 }, 10],
    ['no offer → 0', { basePrice: 100, finalPrice: 100 }, 0],
    ['base 0 cannot infer → 0', { basePrice: 0, finalPrice: 0 }, 0],
    ['combo → 0', { isCombo: true, offerPercentage: 20 }, 0],
  ])('%s', (_n, item, expected) => {
    expect(resolveOfferPercent(item)).toBeCloseTo(expected, 10)
  })
  test('null item → 0', () => expect(resolveOfferPercent(undefined)).toBe(0))
})

describe('resolveSizePrice', () => {
  test('applies the item offer to the size base price, rounded to paise', () => {
    // 199 - 10% = 179.1 (the "₹179.1 vs ₹179" case)
    expect(resolveSizePrice({ offerPercentage: 10 }, { price: 199 })).toBe(179.1)
  })
  test('no offer → raw size price', () => {
    expect(resolveSizePrice({ basePrice: 100, finalPrice: 100 }, { price: 150 })).toBe(150)
  })
  test('rounds float dust to 2dp', () => {
    expect(resolveSizePrice({ offerPercentage: 33 }, { price: 99.99 })).toBe(66.99)
  })
  test.each([null, {}, { price: '' }, { price: 'x' }])('size without a usable price (%j) falls back to unit price', (size) => {
    expect(resolveSizePrice({ finalPrice: 80, basePrice: 100 }, size)).toBe(80)
  })
})

describe('resolveLinePrice', () => {
  const item = { basePrice: 200, finalPrice: 180, offerPercentage: 10 }
  test('no size, no toppings → unit price', () => {
    expect(resolveLinePrice(item)).toBe(180)
  })
  test('size replaces the base price (offer applied) and toppings add', () => {
    expect(resolveLinePrice(item, { size: { price: 300 }, toppings: [{ price: 20 }, { price: '15.5' }] })).toBe(305.5)
  })
  test('toppings without a numeric price contribute 0', () => {
    expect(resolveLinePrice(item, { toppings: [null, { price: 'abc' }, {}] })).toBe(180)
  })
  test('null toppings tolerated', () => {
    expect(resolveLinePrice(item, { toppings: null })).toBe(180)
  })
  test('sum rounded to paise (0.1 + 0.2 dust)', () => {
    expect(resolveLinePrice({ price: 0.1 }, { toppings: [{ price: 0.2 }] })).toBe(0.3)
  })
})

describe('formatPrice', () => {
  test.each([
    [179, '179'],
    [179.1, '179.10'],
    [179.105, '179.11'],
    [179.004, '179'],
    [0, '0'],
    [null, '0'],
    ['12.5', '12.50'],
  ])('formatPrice(%j) → %s', (input, expected) => {
    expect(formatPrice(input)).toBe(expected)
  })
})

describe('round2', () => {
  test.each([
    [1.005, 1], // binary float: 1.005 is 1.00499999… — documents JS behaviour
    [1.006, 1.01],
    [0.1 + 0.2, 0.3],
    [-1.234, -1.23],
    ['2.345', 2.35],
    [undefined, 0],
    ['abc', 0],
  ])('round2(%j) → %s', (input, expected) => {
    expect(round2(input)).toBe(expected)
  })
})

// Mirror of Backend utils/priceResolver.resolvePrice: once a tenant-wide
// offer's offerExpiryDate has passed, the stored (discounted) finalPrice
// is ignored and the base price charged, so the cart agrees with the
// server's total check.
describe('expired offers (server parity)', () => {
  const DAY = 86400000
  const offer = (ends) => ({ basePrice: 200, finalPrice: 160, offerPercentage: 20, offerExpiryDate: ends })

  test('an expired offer is ignored everywhere', () => {
    const item = offer(new Date(Date.now() - DAY).toISOString())
    expect(isOfferExpired(item)).toBe(true)
    expect(resolveUnitPrice(item)).toBe(200)
    expect(resolveStrikePrice(item)).toBeNull()
    expect(resolveOfferPercent(item)).toBe(0)
    expect(resolveSizePrice(item, { price: 300 })).toBe(300)
    expect(resolveLinePrice(item, { toppings: [{ price: 15 }] })).toBe(215)
  })

  test('an offer that has not ended yet still applies', () => {
    const item = offer(new Date(Date.now() + DAY).toISOString())
    expect(isOfferExpired(item)).toBe(false)
    expect(resolveUnitPrice(item)).toBe(160)
    expect(resolveStrikePrice(item)).toBe(200)
    expect(resolveOfferPercent(item)).toBe(20)
    expect(resolveSizePrice(item, { price: 300 })).toBe(240)
  })

  test.each([
    ['no end date', undefined],
    ['an unparseable end date', 'not-a-date'],
  ])('%s → the offer applies', (_l, ends) => {
    const item = offer(ends)
    expect(isOfferExpired(item)).toBe(false)
    expect(resolveUnitPrice(item)).toBe(160)
  })

  test('combos never expire through this path', () => {
    expect(resolveUnitPrice({ isCombo: true, price: 250, offerExpiryDate: new Date(Date.now() - DAY) })).toBe(250)
  })
})
