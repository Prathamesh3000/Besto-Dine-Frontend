/**
 * Page-level pure helpers: Admin/utils/validation, Kiosk/kioskState,
 * SuperAdmin/approvals/approvalUtils, Restaurant/components/landingUtils,
 * Platform/platformShared.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getRestaurantBySlug = vi.fn()
const getPlans = vi.fn()
vi.mock('@/utils/api', () => ({
  publicAPI: {
    getRestaurantBySlug: (...a) => getRestaurantBySlug(...a),
    getPlans: (...a) => getPlans(...a),
  },
}))

import * as v from '@/Pages/Admin/utils/validation'
import * as k from '@/Pages/Kiosk/kioskState'
import * as a from '@/Pages/SuperAdmin/approvals/approvalUtils'
import * as l from '@/Pages/Restaurant/components/landingUtils'
import * as p from '@/Pages/Platform/platformShared'
import * as tenant from '@/utils/tenant'

beforeEach(() => {
  tenant.clearActiveTenant()
  getRestaurantBySlug.mockReset()
  getPlans.mockReset()
})

// ─────────────────────────────────────────────────────────────────────────────
describe('Admin validation (legacy helpers)', () => {
  const ok = { isValid: true, error: null }
  test.each([
    [v.validateGuestName, '', 'Guest name is required'],
    [v.validateGuestName, '  ', 'Guest name is required'],
    [v.validateGuestName, ' a ', 'Name must be at least 2 characters'],
    [v.validateGuestName, 'Al', null],
    [v.validatePhoneNumber, '', 'Phone number is required'],
    [v.validatePhoneNumber, '98765 43210', null],
    [v.validatePhoneNumber, '987654321', 'Phone number must be exactly 10 digits'],
    [v.validatePhoneNumber, '+919876543210', 'Phone number must be exactly 10 digits'],
    [v.validatePhoneNumber, '98765-43210', 'Phone number must be exactly 10 digits'],
    [v.validateTime, null, 'Time is required'],
    [v.validateTime, '19:30', null],
    [v.validateGuestCount, '0', 'Guest count must be at least 1'],
    [v.validateGuestCount, 'abc', 'Guest count must be at least 1'],
    [v.validateGuestCount, '3', null],
    [v.validateTableName, ' ', 'Table name is required'],
    [v.validateTableName, 'T1', null],
    [v.validateCapacity, -1, 'Capacity must be at least 1'],
    [v.validateCapacity, 4, null],
    [v.validateAreaName, undefined, 'Area name is required'],
    [v.validateAreaName, 'Rooftop', null],
  ])('%o(%j) → %j', (fn, input, error) => {
    expect(fn(input)).toEqual(error ? { isValid: false, error } : ok)
  })

  test.each([[0, false], ['', false], ['  ', false], [null, false], ['x', true], [5, true]])(
    'validateRequiredSelection(%j) valid=%s', (value, valid) => {
      expect(v.validateRequiredSelection(value, 'Area').isValid).toBe(valid)
      if (!valid) expect(v.validateRequiredSelection(value, 'Area').error).toBe('Area is required')
    },
  )

  test('parseInt leniency: "2.9" and "3abc" are accepted as counts (documented behaviour)', () => {
    expect(v.validateGuestCount('2.9').isValid).toBe(true)
    expect(v.validateCapacity('3abc').isValid).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('kioskState', () => {
  test('cart persistence round-trip; corrupt cart reads as empty', () => {
    k.writeCart([{ menuItemId: 'm', qty: 1 }])
    expect(k.readCart()).toEqual([{ menuItemId: 'm', qty: 1 }])
    k.clearCart()
    expect(k.readCart()).toEqual([])
    localStorage.setItem(k.KIOSK_KEYS.CART, '{bad')
    expect(k.readCart()).toEqual([])
  })

  test('line helpers merge identical selections and count distinct lines', () => {
    const line = { menuItemId: 'm', unitPrice: 99.5, size: null, addons: [{ name: 'a' }] }
    let cart = k.addKioskLine([], line, 1)
    cart = k.addKioskLine(cart, { ...line }, 2)
    cart = k.addKioskLine(cart, { menuItemId: 'n', unitPrice: 10 }, 1)
    expect(k.kioskItemCount(cart)).toBe(2)
    expect(k.kioskSubtotal(cart)).toBe(308.5)
    cart = k.changeKioskLineQty(cart, line, -3)
    expect(cart).toHaveLength(1)
    expect(k.kioskLineKey(line)).toBe('m-default-a')
  })

  test('customer info / tracking token / last order helpers', () => {
    expect(k.readCustomerInfo()).toBeNull()
    k.writeCustomerInfo(null)
    expect(k.readCustomerInfo()).toEqual({})
    k.writeCustomerInfo({ name: 'A' })
    expect(k.readCustomerInfo()).toEqual({ name: 'A' })
    k.clearCustomerInfo()
    expect(k.readCustomerInfo()).toBeNull()

    k.writeTrackingToken('')
    expect(k.readTrackingToken()).toBeNull()
    k.writeTrackingToken('tt')
    expect(k.readTrackingToken()).toBe('tt')
    k.clearTrackingToken()
    expect(k.readTrackingToken()).toBeNull()

    k.writeLastOrder({ orderId: 'o' })
    expect(k.readLastOrder()).toEqual({ orderId: 'o' })
    localStorage.setItem(k.KIOSK_KEYS.LAST_ORDER, '{bad')
    expect(k.readLastOrder()).toBeNull()
    k.clearLastOrder()
    expect(k.readLastOrder()).toBeNull()

    localStorage.setItem(k.KIOSK_KEYS.CUSTOMER_INFO, '{bad')
    expect(k.readCustomerInfo()).toBeNull()
  })

  test('idempotency key is created once and reused across retries until cleared', () => {
    const first = k.getOrCreateIdempotencyKey()
    expect(first).toMatch(/^kiosk-[0-9a-f-]{36}$/)
    expect(k.getOrCreateIdempotencyKey()).toBe(first)
    k.clearIdempotencyKey()
    expect(k.getOrCreateIdempotencyKey()).not.toBe(first)
  })

  test('a too-short stored key is replaced', () => {
    localStorage.setItem(k.KIOSK_KEYS.IDEMPOTENCY_KEY, 'short')
    expect(k.getOrCreateIdempotencyKey()).not.toBe('short')
  })

  test('fallback key generator works without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', {})
    const key = k.getOrCreateIdempotencyKey()
    expect(key).toMatch(/^kiosk-\d+-[a-z0-9]+$/)
    expect(key.length).toBeLessThanOrEqual(80)
  })

  test('clearKioskSession wipes kiosk + stale customer/staff keys', () => {
    const keys = [...Object.values(k.KIOSK_KEYS).filter((x) => x !== k.KIOSK_KEYS.LAST_ORDER),
      'token', 'user', 'adminActiveBranch', 'adminBranchPicked', 'activeBranchId', 'isGuest', 'cart_by_table']
    keys.forEach((x) => localStorage.setItem(x, 'x'))
    k.clearKioskSession()
    keys.forEach((x) => expect(localStorage.getItem(x)).toBeNull())
  })

  // Regression (fixed 2026-10): clearKioskSession removes every customer auth key, incl. refresh_token.
  test('clearKioskSession removes the previous customer\'s refresh_token from the shared kiosk', () => {
    localStorage.setItem('token', 'access')
    localStorage.setItem('user', '{"_id":"prev-customer"}')
    localStorage.setItem('refresh_token', 'prev-customer-refresh')
    k.clearKioskSession()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })

  describe('bootstrapKioskTenant', () => {
    test('?slug= bootstraps the tenant, persists it and cleans the URL', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      window.history.pushState({}, '', '/kiosk?slug=Spice&x=1')
      getRestaurantBySlug.mockResolvedValue({ data: { success: true, data: { slug: 'spice', name: 'Spice', _id: 'r1', features: { kiosk: true } } } })
      const t = await k.bootstrapKioskTenant()
      expect(getRestaurantBySlug).toHaveBeenCalledWith('spice')
      expect(t).toMatchObject({ slug: 'spice', name: 'Spice', features: { kiosk: true } })
      expect(window.location.search).toBe('?x=1')
      vi.runAllTimers()
    })

    test('concurrent calls share one request (StrictMode double mount)', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      tenant.setActiveTenant({ slug: 'cached', branch: { _id: 'b1' } })
      window.history.pushState({}, '', '/kiosk')
      getRestaurantBySlug.mockResolvedValue({ data: { success: true, data: { slug: 'cached', name: 'C' } } })
      const [x, y] = await Promise.all([k.bootstrapKioskTenant(), k.bootstrapKioskTenant()])
      expect(getRestaurantBySlug).toHaveBeenCalledTimes(1)
      expect(x).toBe(y)
      expect(x.branch).toEqual({ _id: 'b1', name: '', slug: '' }) // cached branch kept
      vi.advanceTimersByTime(500)
      await k.bootstrapKioskTenant()
      expect(getRestaurantBySlug).toHaveBeenCalledTimes(2)
      vi.runAllTimers()
    })

    test('network failure falls back to the cached tenant', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      tenant.setActiveTenant({ slug: 'cached' })
      window.history.pushState({}, '', '/kiosk')
      getRestaurantBySlug.mockRejectedValue(new Error('offline'))
      await expect(k.bootstrapKioskTenant()).resolves.toMatchObject({ slug: 'cached' })
      vi.runAllTimers()
    })

    test('no slug anywhere → null without a request', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      window.history.pushState({}, '', '/kiosk')
      await expect(k.bootstrapKioskTenant()).resolves.toBeNull()
      expect(getRestaurantBySlug).not.toHaveBeenCalled()
      vi.runAllTimers()
    })

    test('unsuccessful response keeps the cached tenant', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout'] })
      window.history.pushState({}, '', '/kiosk?restaurant=ghost')
      getRestaurantBySlug.mockResolvedValue({ data: { success: false } })
      await expect(k.bootstrapKioskTenant()).resolves.toBeNull()
      vi.runAllTimers()
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('approvalUtils', () => {
  test.each([
    [1499, '₹1,499'], [150000, '₹1,50,000'], [null, '—'], [undefined, '—'],
  ])('fmtMoney(%j) → %s', (n, out) => expect(a.fmtMoney(n)).toBe(out))

  test('fmtMoney falls back when the currency code is invalid', () => {
    expect(a.fmtMoney(1000, 'NOPE!')).toBe('₹1,000')
  })

  test.each([[149900, '₹1,499.00'], [12345, '₹123.45'], ['x', '₹0.00'], [null, '₹0.00']])(
    'fmtPaise(%j) → %s', (paise, out) => expect(a.fmtPaise(paise)).toBe(out),
  )
  test('fmtPaise fallback for invalid currency', () => {
    expect(a.fmtPaise(150, 'NOPE!')).toBe('₹1.5')
  })

  test('dates format in en-IN; empty → em dash', () => {
    expect(a.fmtDate('2026-10-03T10:00:00Z')).toMatch(/03 Oct 2026/)
    expect(a.fmtDate(null)).toBe('—')
    expect(a.fmtDateTime(null)).toBe('—')
    expect(a.fmtDateTime('2026-10-03T10:00:00Z')).toMatch(/Oct 2026/)
  })

  test.each([
    [30 * 1000, 'just now'], [5 * 60e3, '5m ago'], [3 * 3600e3, '3h ago'], [2 * 86400e3, '2d ago'],
  ])('fmtRelative(now - %d ms) → %s', (ago, out) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    expect(a.fmtRelative(new Date(Date.now() - ago).toISOString())).toBe(out)
  })
  test('fmtRelative ≥30 days falls back to a date; empty → dash', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    expect(a.fmtRelative('2026-08-01T12:00:00Z')).toMatch(/Aug 2026/)
    expect(a.fmtRelative('')).toBe('—')
  })

  test.each([[0, 'waiting since today'], [-1, 'waiting since today'], [1, 'waiting 1 day'], [4, 'waiting 4 days']])(
    'waitingLabel(%d)', (d, out) => expect(a.waitingLabel(d)).toBe(out),
  )

  test.each([['98765 43210', '919876543210'], ['+91 98765 43210', '919876543210'], ['', ''], [null, '']])(
    'waNumber(%j) → %s', (ph, out) => expect(a.waNumber(ph)).toBe(out),
  )

  test('labels fall back to the key', () => {
    expect(a.featureLabel('kiosk')).toBe('Self-Order Kiosk')
    expect(a.featureLabel('mystery')).toBe('mystery')
    expect(a.limitLabel('maxTables')).toBe('Tables')
    expect(a.limitLabel('x')).toBe('x')
  })

  test.each([[5, '5'], [100000, '1,00,000'], [0, 'Unlimited'], [-1, 'Unlimited'], ['5', 'Unlimited'], [undefined, 'Unlimited']])(
    'fmtLimit(%j) → %s', (val, out) => expect(a.fmtLimit(val)).toBe(out),
  )

  test('enabledFeatures keeps true flags and tiered strings, drops _id/none/empty/false', () => {
    expect(a.enabledFeatures({ _id: 'x', kiosk: true, crm: 'advanced', inventory: 'none', tipManagement: '', webhooks: false })).toEqual([
      { key: 'kiosk', label: 'Self-Order Kiosk', tier: null },
      { key: 'crm', label: 'Customer Management', tier: 'advanced' },
    ])
    expect(a.enabledFeatures(null)).toEqual([])
  })

  test.each([
    ['restaurant.signup_approve', 'Signup approved'],
    ['restaurant.custom_thing', 'Restaurant custom thing'],
    [undefined, ''],
  ])('actionLabel(%j) → %s', (act, out) => expect(a.actionLabel(act)).toBe(out))

  test('errorState extracts status and message with fallback', () => {
    expect(a.errorState({ response: { status: 404, data: { message: 'gone' } } }, 'fb')).toEqual({ status: 404, message: 'gone' })
    expect(a.errorState(new Error('net'), 'fb')).toEqual({ status: 0, message: 'fb' })
    expect(a.LIST_PATH).toBe('/superadmin/pending-approvals')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('landingUtils', () => {
  test.each([
    ['#ABCDEF', '#abcdef'], ['#abc', '#aabbcc'], ['  #FfF ', '#ffffff'],
    ['red', l.DEFAULT_ACCENT], ['#abcd', l.DEFAULT_ACCENT], [null, l.DEFAULT_ACCENT], ['javascript:x', l.DEFAULT_ACCENT],
  ])('normalizeAccent(%j) → %s', (hex, out) => expect(l.normalizeAccent(hex)).toBe(out))

  test.each([['#000000', '#FFFFFF'], ['#ffffff', '#1A181B'], ['#ffff00', '#1A181B'], [l.DEFAULT_ACCENT, '#FFFFFF'], ['bogus', '#FFFFFF']])(
    'readableOn(%s) → %s', (hex, out) => expect(l.readableOn(hex)).toBe(out),
  )

  test.each([
    ['09:00', '9:00 AM'], ['21:30', '9:30 PM'], ['00:15', '12:15 AM'], ['12:00', '12:00 PM'], ['24:00', '12:00 AM'],
    ['9:05:00', '9:05 AM'], ['Closed', 'Closed'], ['', ''], [null, ''],
  ])('formatTime(%j) → %s', (t, out) => expect(l.formatTime(t)).toBe(out))

  test.each([
    [new Date(2026, 9, 5), 'Monday'], [new Date(2026, 9, 4), 'Sunday'], [new Date(2026, 9, 10), 'Saturday'],
  ])('todayName(%s) → %s', (d, out) => expect(l.todayName(d)).toBe(out))

  test.each([[179, '₹179'], [179.1, '₹179.1'], [1234.5, '₹1,234.5'], ['abc', ''], [Infinity, '']])(
    'formatPrice(%j) → %s', (n, out) => expect(l.formatPrice(n)).toBe(out),
  )

  test.each([
    ['example.com', 'https://example.com'], ['http://x.com', 'http://x.com'], ['HTTPS://X.com', 'HTTPS://X.com'],
    ['//evil.com', 'https://evil.com'], ['javascript:alert(1)', 'https://javascript:alert(1)'], ['', ''], [null, ''],
  ])('externalUrl(%j) → %s (never a javascript: href)', (u, out) => expect(l.externalUrl(u)).toBe(out))

  test.each([
    ['@spicehub', 'instagram.com', 'https://instagram.com/spicehub'],
    ['spicehub', 'instagram.com', 'https://instagram.com/spicehub'],
    ['instagram.com/spicehub', 'instagram.com', 'https://instagram.com/spicehub'],
    ['https://fb.com/x', 'facebook.com', 'https://fb.com/x'],
    ['', 'x.com', ''],
  ])('socialProfileUrl(%j, %s)', (val, host, out) => expect(l.socialProfileUrl(val, host)).toBe(out))

  test.each([
    ['98765 43210', 'https://wa.me/919876543210'], ['+44 7700 900123', 'https://wa.me/447700900123'],
    ['wa.me/123', 'https://wa.me/123'], ['abc', ''], ['', ''],
  ])('whatsappUrl(%j) → %s', (val, out) => expect(l.whatsappUrl(val)).toBe(out))

  test.each([['+91 98765-43210', 'tel:+919876543210'], ['(020) 1234', 'tel:0201234'], ['', ''], [null, '']])(
    'telHref(%j) → %s', (ph, out) => expect(l.telHref(ph)).toBe(out),
  )

  test('WEEK_ORDER starts on Monday', () => {
    expect(l.WEEK_ORDER[0]).toBe('Monday')
    expect(l.WEEK_ORDER).toHaveLength(7)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('platformShared', () => {
  test.each([
    [{ price: 0 }, { amount: 'Free', per: '' }],
    [null, { amount: 'Free', per: '' }],
    [{ price: 1499 }, { amount: '₹1,499', per: '/ month' }],
    [{ price: 3999, billingCycle: 'quarterly' }, { amount: '₹3,999', per: '/ quarter' }],
    [{ price: 12000, billingCycle: 'yearly', currency: 'INR' }, { amount: '₹12,000', per: '/ year' }],
    [{ price: 100, billingCycle: 'weird' }, { amount: '₹100', per: '/ month' }],
    [{ price: 100, currency: 'BAD!' }, { amount: '₹100', per: '/ month' }],
  ])('formatPlanPrice(%j)', (plan, out) => expect(p.formatPlanPrice(plan)).toEqual(out))

  test('planHighlights: limits (new + legacy keys) then feature labels, capped', () => {
    const plan = {
      limits: { branches: 1, maxTables: 25, staff: 100000, menuItems: 0 },
      features: { kiosk: true, crm: 'advanced', inventory: false, unknownFlag: true, tipManagement: 'none' },
    }
    expect(p.planHighlights(plan)).toEqual([
      'Up to 1 branch', 'Up to 25 tables', 'Unlimited staff accounts',
      'Self-Order Kiosk', 'Customer Management (advanced)',
    ])
  })

  test('planHighlights accepts feature arrays of keys or objects and respects maxFeatures', () => {
    const plan = { features: ['kiosk', 'custom thing', { label: 'Priority support' }, { name: 'SLA' }, {}] }
    expect(p.planHighlights(plan)).toEqual(['Self-Order Kiosk', 'custom thing', 'Priority support', 'SLA'])
    expect(p.planHighlights(plan, 2)).toEqual(['Self-Order Kiosk', 'custom thing'])
    expect(p.planHighlights(undefined)).toEqual([])
  })

  test('readUtm picks present utm_* keys and truncates to 100 chars', () => {
    expect(p.readUtm(`?utm_source=google&utm_campaign=${'x'.repeat(150)}&other=1`)).toEqual({ source: 'google', campaign: 'x'.repeat(100) })
    expect(p.readUtm('?a=1')).toBeUndefined()
    window.history.pushState({}, '', '/?utm_medium=cpc')
    expect(p.readUtm()).toEqual({ medium: 'cpc' })
    window.history.pushState({}, '', '/')
  })

  test('usePageMeta sets title/description and restores them on unmount', () => {
    document.title = 'Before'
    const existing = document.createElement('meta')
    existing.setAttribute('name', 'description')
    existing.setAttribute('content', 'old desc')
    document.head.appendChild(existing)

    const { unmount } = renderHook(() => p.usePageMeta(p.PLATFORM_TITLE, p.PLATFORM_DESCRIPTION))
    expect(document.title).toBe(p.PLATFORM_TITLE)
    expect(existing.getAttribute('content')).toBe(p.PLATFORM_DESCRIPTION)
    unmount()
    expect(document.title).toBe('Before')
    expect(existing.getAttribute('content')).toBe('old desc')
    existing.remove()
  })

  test('usePageMeta creates a description meta when missing and removes it afterwards', () => {
    const { unmount } = renderHook(() => p.usePageMeta('T', 'D'))
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe('D')
    unmount()
    expect(document.querySelector('meta[name="description"]')).toBeNull()
  })

  test.each([
    ['bare array', [{ name: 'Basic' }]],
    ['{ data: [...] }', { data: [{ name: 'Basic' }] }],
    ['unexpected shape', { nope: true }],
  ])('usePublicPlans normalises a %s body', async (_n, body) => {
    getPlans.mockResolvedValue({ data: body })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }) => createElement(QueryClientProvider, { client: qc }, children)
    const { result } = renderHook(() => p.usePublicPlans(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(Array.isArray(body) ? body : (body.data || []))
  })
})
