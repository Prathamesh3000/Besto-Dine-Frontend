import { describe, test, expect } from 'vitest'
import { hasDeliveryNoRanges, DELIVERY_NO_RANGES_WARNING } from './deliveryWarning'

describe('hasDeliveryNoRanges', () => {
  test('on with zero ranges warns', () => {
    expect(hasDeliveryNoRanges({ enabled: true, slabs: [] })).toBe(true)
    expect(hasDeliveryNoRanges({ enabled: true })).toBe(true)
  })
  test('off, or on with at least one range, does not warn', () => {
    expect(hasDeliveryNoRanges({ enabled: false, slabs: [] })).toBe(false)
    expect(hasDeliveryNoRanges({ enabled: true, slabs: [{ fromKm: 0, toKm: 5, charge: 40 }] })).toBe(false)
    expect(hasDeliveryNoRanges(null)).toBe(false)
  })
  test('message text', () => {
    expect(DELIVERY_NO_RANGES_WARNING).toMatch(/customers will not see Home Delivery/)
  })
})
