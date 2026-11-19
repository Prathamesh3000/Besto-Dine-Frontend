import { describe, test, expect } from 'vitest'
import {
  trialStateOf, lockAtOf, isTrialLocked, isReadOnly, isTrialAllowedPath, trialBannerState, trialTone,
  TRIAL_LOCK_ALLOWED_PATHS, TRIAL_READONLY_GRACE_DAYS,
} from '@/utils/trialLock'

const DAY = 24 * 60 * 60 * 1000

describe('trialLock helpers', () => {
  test('trialStateOf prefers tenant.trialState, falls back to legacy flags', () => {
    expect(trialStateOf({ trialState: 'read_only', trialExpired: true })).toBe('read_only')
    expect(trialStateOf({ trialState: 'locked' })).toBe('locked')
    expect(trialStateOf({ trialExpired: true })).toBe('locked')
    expect(trialStateOf({ readOnly: true })).toBe('read_only')
    expect(trialStateOf({ status: 'trial' })).toBe('active')
    expect(trialStateOf({ status: 'active' })).toBe('none')
    expect(trialStateOf({ trialState: 'bogus', status: 'trial' })).toBe('active')
    expect(trialStateOf(null)).toBe('none')
  })

  test('lockAtOf uses lockAt, else trialEndDate + grace, else null', () => {
    expect(lockAtOf({ lockAt: '2026-11-04T00:00:00.000Z' }).toISOString()).toBe('2026-11-04T00:00:00.000Z')
    expect(lockAtOf({ trialEndDate: '2026-11-01T00:00:00.000Z' }).toISOString())
      .toBe(new Date(Date.parse('2026-11-01T00:00:00.000Z') + TRIAL_READONLY_GRACE_DAYS * DAY).toISOString())
    expect(lockAtOf({ lockAt: 'not a date' })).toBeNull()
    expect(lockAtOf(null)).toBeNull()
  })

  test('isTrialLocked / isReadOnly for any staff role; locked wins', () => {
    expect(isTrialLocked({ role: 'admin', tenant: { trialState: 'locked' } })).toBe(true)
    expect(isTrialLocked({ role: 'waiter', tenant: { trialState: 'locked' } })).toBe(true)
    expect(isTrialLocked({ role: 'admin', tenant: { trialExpired: true } })).toBe(true)
    expect(isTrialLocked({ role: 'admin', tenant: { trialState: 'read_only' } })).toBe(false)
    expect(isTrialLocked(null)).toBe(false)
    expect(isReadOnly({ role: 'admin', tenant: { trialState: 'read_only' } })).toBe(true)
    expect(isReadOnly({ role: 'waiter', tenant: { readOnly: true } })).toBe(true)
    expect(isReadOnly({ role: 'admin', tenant: { trialState: 'locked' } })).toBe(false)
    expect(isReadOnly(null)).toBe(false)
  })

  test('billing and the lock screen stay reachable', () => {
    expect(TRIAL_LOCK_ALLOWED_PATHS).toEqual(['/admin/subscription', '/trial-expired'])
    expect(isTrialAllowedPath('/admin/subscription')).toBe(true)
    expect(isTrialAllowedPath('/admin/subscription/invoices')).toBe(true)
    expect(isTrialAllowedPath('/trial-expired')).toBe(true)
    expect(isTrialAllowedPath('/admin/menu')).toBe(false)
  })

  test('tone rule: blue > 7, amber <= 7, red <= 3', () => {
    expect(trialTone(14)).toBe('blue')
    expect(trialTone(8)).toBe('blue')
    expect(trialTone(7)).toBe('amber')
    expect(trialTone(4)).toBe('amber')
    expect(trialTone(3)).toBe('red')
    expect(trialTone(0)).toBe('red')
  })

  test('banner state for an active trial', () => {
    const u = (d) => ({ role: 'admin', tenant: { status: 'trial', trialState: 'active', daysLeft: d } })
    expect(trialBannerState(u(14))).toMatchObject({ tone: 'blue', dismissible: true, readOnly: false, label: '14 days left' })
    expect(trialBannerState(u(8))).toMatchObject({ tone: 'blue', dismissible: true })
    expect(trialBannerState(u(7))).toMatchObject({ tone: 'amber', dismissible: false })
    expect(trialBannerState(u(3))).toMatchObject({ tone: 'red', dismissible: false })
    expect(trialBannerState(u(1))).toMatchObject({ tone: 'red', label: '1 day left' })
    expect(trialBannerState(u(0))).toMatchObject({ tone: 'red', label: 'ends today' })
    expect(trialBannerState({ role: 'admin', tenant: { status: 'trial', trialState: 'active', daysLeft: null } })).toBeNull()
    expect(trialBannerState({ role: 'waiter', tenant: { status: 'trial', trialState: 'active', daysLeft: 5 } })).toBeNull()
  })

  test('banner state in the read-only window and hidden when locked / paid', () => {
    const lockAt = new Date(Date.now() + 2 * DAY).toISOString()
    const ro = trialBannerState({ role: 'admin', tenant: { trialState: 'read_only', lockAt } })
    expect(ro).toMatchObject({ readOnly: true, tone: 'amber', dismissible: false })
    expect(ro.label).toBe(`Your trial ended — read-only until ${new Date(lockAt).toLocaleDateString()}. Upgrade to keep editing.`)
    const soon = trialBannerState({ role: 'admin', tenant: { trialState: 'read_only', lockAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() } })
    expect(soon.tone).toBe('red')
    expect(trialBannerState({ role: 'admin', tenant: { trialState: 'locked', trialExpired: true } })).toBeNull()
    expect(trialBannerState({ role: 'admin', tenant: { status: 'active', trialState: 'none' } })).toBeNull()
  })
})
