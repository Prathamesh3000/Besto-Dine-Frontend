/**
 * planCta — plan-card CTA routing (TRIAL_SIGNUP_AND_LEADS_PLAN.md §3):
 * enterprise → Contact Sales, trial → /start-trial (before the free check),
 * free / paid → register with the plan slug; tolerant of old payloads.
 */
import { describe, test, expect } from 'vitest'
import { getCTA, isFreePlan, hasTrial, trialDaysOf, planTier, isEnterprisePlan } from '@/utils/planCta'

const paid = { slug: 'gold', tier: 20, price: 1799, prices: { monthly: 1799, annual: 17999, biennial: 28799 }, trial: { enabled: false, durationDays: 14 }, trialDays: 0 }

describe('getCTA', () => {
  test('enterprise (tier >= 30) → Contact Sales → /contact, even with a trial and zero price', () => {
    const cta = getCTA({ slug: 'enterprise', tier: 30, price: 0, prices: {}, trial: { enabled: true, durationDays: 14 } })
    expect(cta).toMatchObject({ label: 'Contact Sales', to: '/contact', kind: 'contact' })
    expect(getCTA({ slug: 'mega', tier: 45, price: 50000 }).kind).toBe('contact')
  })

  test('trial-enabled paid plan → Start Free Trial → /start-trial with no plan in the URL', () => {
    const cta = getCTA({ ...paid, trial: { enabled: true, durationDays: 14 }, trialDays: 14 }, 'annual')
    expect(cta).toEqual(expect.objectContaining({ label: 'Start Free Trial', to: '/start-trial', kind: 'trial' }))
    expect(cta.to).not.toContain('plan=')
  })

  test('free plan WITH a trial still goes to the trial funnel (trial check before free)', () => {
    const cta = getCTA({ slug: 'free', tier: 0, price: 0, prices: { monthly: 0, annual: null }, trial: { enabled: true, durationDays: 7 } })
    expect(cta).toMatchObject({ to: '/start-trial', kind: 'trial' })
  })

  test('free plan without a trial → Get Started → register with the slug', () => {
    const cta = getCTA({ slug: 'free', tier: 0, price: 0, prices: { monthly: null, annual: null, biennial: null }, trial: { enabled: false, durationDays: 0 } })
    expect(cta).toMatchObject({ label: 'Get Started', to: '/register-restaurant?plan=free', kind: 'free' })
  })

  test('paid plan without a trial → Get Started → register with the slug', () => {
    expect(getCTA(paid, 'monthly')).toMatchObject({ label: 'Get Started', to: '/register-restaurant?plan=gold', kind: 'paid' })
  })

  test('tolerates missing fields: no trial object falls back to trialDays, no tier is 0, no slug uses _id', () => {
    expect(getCTA({ _id: 'abc', price: 699, trialDays: 14 })).toMatchObject({ kind: 'trial', to: '/start-trial' })
    expect(getCTA({ _id: 'abc', price: 699, trialDays: 0 })).toMatchObject({ kind: 'paid', to: '/register-restaurant?plan=abc' })
    expect(getCTA({ price: 699 })).toMatchObject({ kind: 'paid', to: '/register-restaurant' })
    expect(getCTA({ slug: 'x', price: 0 })).toMatchObject({ kind: 'free' })
    expect(getCTA(null)).toMatchObject({ kind: 'paid', to: '/register-restaurant' })
  })

  test('a trial object with enabled=false wins over a stale legacy trialDays', () => {
    expect(getCTA({ slug: 'gold', price: 1799, trial: { enabled: false, durationDays: 14 }, trialDays: 14 }).kind).toBe('paid')
  })
})

describe('tier / trial / free helpers', () => {
  test('tier 0 is a real tier, not "missing"; strings are coerced', () => {
    expect(planTier({ tier: 0 })).toBe(0)
    expect(planTier({})).toBe(0)
    expect(planTier({ tier: '30' })).toBe(30)
    expect(isEnterprisePlan({ tier: 0 })).toBe(false)
    expect(isEnterprisePlan({ tier: 30 })).toBe(true)
    expect(isEnterprisePlan({ tier: 29 })).toBe(false)
  })

  test('trialDaysOf / hasTrial read the trial object first, then trialDays', () => {
    expect(trialDaysOf({ trial: { enabled: true, durationDays: 30 }, trialDays: 14 })).toBe(30)
    expect(trialDaysOf({ trial: { enabled: false, durationDays: 30 }, trialDays: 14 })).toBe(0)
    expect(trialDaysOf({ trialDays: 14 })).toBe(14)
    expect(trialDaysOf({})).toBe(0)
    expect(hasTrial({ trial: { enabled: true, durationDays: 0 } })).toBe(true)
    expect(hasTrial({ trialDays: 7 })).toBe(true)
    expect(hasTrial({ trialDays: 0 })).toBe(false)
  })

  test('isFreePlan: all cycle prices 0/null and price 0 and tier < 30', () => {
    expect(isFreePlan({ tier: 0, price: 0, prices: { monthly: 0, annual: null } })).toBe(true)
    expect(isFreePlan({ tier: 0, price: 0 })).toBe(true)
    expect(isFreePlan({ tier: 0, price: 0, prices: { monthly: null, annual: 999 } })).toBe(false)
    expect(isFreePlan({ tier: 0, price: 499, prices: {} })).toBe(false)
    expect(isFreePlan({ tier: 30, price: 0, prices: {} })).toBe(false)
    expect(isFreePlan(undefined)).toBe(false)
  })
})
