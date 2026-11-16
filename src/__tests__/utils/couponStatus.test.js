import { describe, test, expect } from 'vitest'
import { couponBadgeLabel } from '../../utils/couponStatus'

describe('couponBadgeLabel', () => {
  test('a live, switched-on coupon stays Active', () => {
    expect(couponBadgeLabel({ isActive: true }, 'Active')).toBe('Active')
  })

  test('a date-active coupon the admin switched off reads Disabled', () => {
    expect(couponBadgeLabel({ isActive: false }, 'Active')).toBe('Disabled')
  })

  test('Scheduled and Expired are never relabelled, even when switched off', () => {
    expect(couponBadgeLabel({ isActive: false }, 'Scheduled')).toBe('Scheduled')
    expect(couponBadgeLabel({ isActive: false }, 'Expired')).toBe('Expired')
  })

  test('a coupon with no isActive field is treated as on', () => {
    expect(couponBadgeLabel({}, 'Active')).toBe('Active')
    expect(couponBadgeLabel(undefined, 'Active')).toBe('Active')
  })
})
