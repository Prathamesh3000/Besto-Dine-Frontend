/**
 * utils/billingCycles — GST math, per-month equivalents and savings must match
 * Backend/utils/billingCycles.js exactly (same rounding). Golden numbers are the
 * product's example prices; the parity block loads the backend module itself
 * and compares a grid of inputs so a rounding change on one side fails here.
 */
import { describe, test, expect } from 'vitest'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  priceWithGst, gstBreakdown, monthlyEquivalent, savingsPct, planCycleRows, rowForCycle,
  availableCyclesAcross, maxSavingsFor, formatINR, formatCyclePrice, formatTenantPrice,
  validateCyclePrices, trialInfo, normalizeCycle,
} from '@/utils/billingCycles'

const PLANS = {
  silver:  { monthly: 699,  annual: 6999,  biennial: 11199 },
  gold:    { monthly: 1799, annual: 17999, biennial: 28799 },
  premium: { monthly: 2999, annual: 29999, biennial: 47999 },
}

describe('GST math (golden)', () => {
  test.each([
    [699, 824.82, 125.82],
    [6999, 8258.82, 1259.82],
    [11199, 13214.82, 2015.82],
    [17999, 21238.82, 3239.82],
    [29999, 35398.82, 5399.82],
    [47999, 56638.82, 8639.82],
  ])('base %s -> total %s, GST %s', (base, total, gst) => {
    const g = gstBreakdown(base)
    expect(g.total).toBe(total)
    expect(g.gst).toBe(gst)
    expect(g.base).toBe(base)
  })

  test('paise are integers and base + gst = total', () => {
    const m = priceWithGst(1799)
    expect(Number.isInteger(m.totalPaise)).toBe(true)
    expect(m.basePaise + m.gstPaise).toBe(m.totalPaise)
  })

  test('per-month equivalent and savings match the product examples', () => {
    expect(monthlyEquivalent(6999, 'annual')).toBe(583.25)
    expect(monthlyEquivalent(11199, 'biennial')).toBe(466.63)
    expect(savingsPct(6999, 'annual', 699)).toBe(17)
    expect(savingsPct(11199, 'biennial', 699)).toBe(33)
    expect(savingsPct(17999, 'annual', 1799)).toBe(17)
    expect(savingsPct(0, 'annual', 699)).toBe(0)
  })
})

describe('parity with Backend/utils/billingCycles.js', () => {
  const backendPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../Backend/utils/billingCycles.js')
  const hasBackend = fs.existsSync(backendPath)
  const backend = hasBackend ? createRequire(import.meta.url)(backendPath) : null

  test.skipIf(!hasBackend)('priceWithGst / monthlyEquivalent / savingsPct agree on a grid', () => {
    const bases = [1, 99, 499.5, 699, 1799, 2999, 6999, 11199, 17999, 28799, 29999, 47999, 123456.78]
    for (const base of bases) {
      expect(priceWithGst(base, 18)).toEqual(backend.priceWithGst(base, 18))
      for (const cycle of ['monthly', 'annual', 'biennial']) {
        expect(monthlyEquivalent(base, cycle)).toBe(backend.monthlyEquivalent(base, cycle))
        expect(savingsPct(base, cycle, 699)).toBe(backend.savingsPct(base, cycle, 699))
      }
    }
  })

  test.skipIf(!hasBackend)('planCycleRows derived from prices equals backend buildCycleRows', () => {
    for (const prices of Object.values(PLANS)) {
      const plan = { price: prices.monthly, prices }
      expect(planCycleRows(plan, 18)).toEqual(backend.buildCycleRows(plan))
    }
  })
})

describe('planCycleRows', () => {
  const gold = { price: 1799, prices: PLANS.gold }

  test('uses the server cycles rows when present', () => {
    const rows = [{ cycle: 'annual', months: 12, price: 100, gst: 18, total: 118, perMonthEquivalent: 8.33, savingsPctVsMonthly: 5 }]
    expect(planCycleRows({ cycles: rows })).toEqual(rows)
  })

  test('derives rows from prices and skips cycles that are not sold', () => {
    const rows = planCycleRows({ price: 699, prices: { monthly: 699, annual: null, biennial: 11199 } })
    expect(rows.map(r => r.cycle)).toEqual(['monthly', 'biennial'])
  })

  test('legacy plan with only a monthly price still yields a monthly row', () => {
    const rows = planCycleRows({ price: 999, billingCycle: 'monthly' })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ cycle: 'monthly', price: 999 })
  })

  test('legacy yearly plan carries its price as annual', () => {
    expect(planCycleRows({ price: 9999, billingCycle: 'yearly' })[0]).toMatchObject({ cycle: 'annual', price: 9999 })
  })

  test('rowForCycle / availableCyclesAcross / maxSavingsFor', () => {
    expect(rowForCycle(gold, 'annual').total).toBe(21238.82)
    expect(rowForCycle(gold, 'weird')).toBeNull()
    const plans = [gold, { price: 699, prices: PLANS.silver }, { price: 50, prices: { monthly: 50 } }]
    expect(availableCyclesAcross(plans)).toEqual(['monthly', 'annual', 'biennial'])
    expect(availableCyclesAcross([{ price: 50, prices: { monthly: 50 } }])).toEqual(['monthly'])
    expect(maxSavingsFor(plans, 'annual')).toBe(17)
    expect(maxSavingsFor(plans, 'biennial')).toBe(33)
  })
})

describe('formatting', () => {
  test('formatINR', () => {
    expect(formatINR(17999)).toBe('₹17,999')
    expect(formatINR(21238.82)).toBe('₹21,238.82')
    expect(formatINR(1500.5)).toBe('₹1,500.50')
    expect(formatINR(NaN)).toBe('—')
  })

  test('cycle price labels are cycle-aware', () => {
    expect(formatCyclePrice(699, 'monthly')).toBe('₹699 / month')
    expect(formatCyclePrice(17999, 'annual')).toBe('₹17,999 / year')
    expect(formatCyclePrice(28799, 'biennial')).toBe('₹28,799 / 2 years')
    expect(formatCyclePrice(100, 'yearly')).toBe('₹100 / year')
  })

  test('tenant price shows the MRR equivalent for prepaid cycles only', () => {
    expect(formatTenantPrice(699, 'monthly')).toBe('₹699 / month')
    expect(formatTenantPrice(17999, 'annual')).toBe('₹17,999 / year (₹1,499.92/mo MRR)')
    expect(formatTenantPrice(0, 'annual')).toBe('Free')
    expect(normalizeCycle('nonsense')).toBe('monthly')
  })
})

describe('validateCyclePrices', () => {
  test('accepts the product prices and blanks', () => {
    for (const p of Object.values(PLANS)) expect(validateCyclePrices(p)).toEqual({})
    expect(validateCyclePrices({ monthly: 699, annual: '', biennial: '' })).toEqual({})
  })

  test('annual must be < 12 x monthly', () => {
    expect(validateCyclePrices({ monthly: 699, annual: 8388, biennial: '' }).annual).toMatch(/less than 12 x monthly/)
    expect(validateCyclePrices({ monthly: 699, annual: 8387, biennial: '' }).annual).toBeUndefined()
  })

  test('biennial must be < 2 x annual', () => {
    expect(validateCyclePrices({ monthly: 699, annual: 6999, biennial: 13998 }).biennial).toMatch(/less than 2 x annual/)
    expect(validateCyclePrices({ monthly: 699, annual: 6999, biennial: 13997 }).biennial).toBeUndefined()
  })

  test('negative / non-numeric values are rejected', () => {
    expect(validateCyclePrices({ monthly: 699, annual: -1, biennial: '' }).annual).toBeDefined()
    expect(validateCyclePrices({ monthly: 699, annual: 'abc', biennial: '' }).annual).toBeDefined()
  })
})

describe('trialInfo (trialStartDate -> trialEndDate)', () => {
  const day = 86400000
  const now = new Date('2026-11-10T00:00:00Z')

  test('progress uses the real window, not a hard-coded 14 days', () => {
    // 30-day trial, 10 days in -> 33%, 20 days left
    const t = trialInfo(new Date(now.getTime() + 20 * day), new Date(now.getTime() - 10 * day), now)
    expect(t.daysLeft).toBe(20)
    expect(Math.round(t.pct)).toBe(33)
  })

  test('14-day trial halfway', () => {
    const t = trialInfo(new Date(now.getTime() + 7 * day), new Date(now.getTime() - 7 * day), now)
    expect(Math.round(t.pct)).toBe(50)
  })

  test('expired and missing start', () => {
    expect(trialInfo(new Date(now.getTime() - day), null, now)).toMatchObject({ expired: true, pct: 100 })
    expect(trialInfo(new Date(now.getTime() + day), null, now).pct).toBe(0)
    expect(trialInfo(null, null, now)).toBeNull()
  })
})
