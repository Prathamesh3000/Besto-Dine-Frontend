import { describe, test, expect } from 'vitest'
import { isTrialLocked, isTrialAllowedPath, trialBannerState } from '@/utils/trialLock'

describe('trialLock helpers', () => {
  test('isTrialLocked only for the owner of an expired tenant', () => {
    expect(isTrialLocked({ role: 'admin', tenant: { trialExpired: true } })).toBe(true)
    expect(isTrialLocked({ role: 'waiter', tenant: { trialExpired: true } })).toBe(false)
    expect(isTrialLocked({ role: 'admin', tenant: { trialExpired: false } })).toBe(false)
    expect(isTrialLocked(null)).toBe(false)
  })
  test('billing and the lock screen stay reachable', () => {
    expect(isTrialAllowedPath('/admin/subscription')).toBe(true)
    expect(isTrialAllowedPath('/trial-expired')).toBe(true)
    expect(isTrialAllowedPath('/admin/menu')).toBe(false)
  })
  test('banner state tones', () => {
    const u = (d) => ({ role: 'admin', tenant: { status: 'trial', daysLeft: d } })
    expect(trialBannerState(u(14))).toMatchObject({ tone: 'info', dismissible: true })
    expect(trialBannerState(u(3))).toMatchObject({ tone: 'amber', dismissible: false })
    expect(trialBannerState(u(1))).toMatchObject({ tone: 'red' })
    expect(trialBannerState(u(0))).toMatchObject({ tone: 'red', label: 'ends today' })
  })
})
