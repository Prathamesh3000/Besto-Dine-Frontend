import { describe, test, expect, vi, beforeEach } from 'vitest'

let t
beforeEach(async () => {
  // tenant.js caches the blob in module state — reload for isolation.
  vi.resetModules()
  t = await import('@/utils/tenant')
})

describe('reading the active tenant', () => {
  test('nothing picked → nulls and platform home', () => {
    expect(t.getActiveTenant()).toBeNull()
    expect(t.getActiveTenantSlug()).toBeNull()
    expect(t.getActiveBranchId()).toBeNull()
    expect(t.getActiveBranch()).toBeNull()
    expect(t.getActiveTenantFeatures()).toEqual({})
    expect(t.activeRestaurantPath()).toBe('/')
  })

  test.each(['{bad json', JSON.stringify({ name: 'no slug' }), JSON.stringify(null)])(
    'invalid stored blob %s → null', async (raw) => {
      localStorage.setItem('activeTenant', raw)
      vi.resetModules()
      t = await import('@/utils/tenant')
      expect(t.getActiveTenant()).toBeNull()
    },
  )

  test('reads a stored blob once and caches it', async () => {
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'spice', branch: { _id: 'b1', name: 'FC' } }))
    vi.resetModules()
    t = await import('@/utils/tenant')
    expect(t.getActiveTenantSlug()).toBe('spice')
    expect(t.getActiveBranchId()).toBe('b1')
    localStorage.removeItem('activeTenant')
    expect(t.getActiveTenantSlug()).toBe('spice') // cached
  })
})

describe('setActiveTenant', () => {
  test('normalises slug, whitelists branch/branding fields and persists', () => {
    const blob = t.setActiveTenant({
      slug: '  Spice-Hub ', name: 'Spice', _id: 'r1', features: { kiosk: true },
      branch: { _id: 'b1', name: 'FC', slug: 'fc', secret: 'x' },
      branding: { primaryColor: '#fff', evil: '<script>' },
    })
    expect(blob.slug).toBe('spice-hub')
    expect(blob.branch).toEqual({ _id: 'b1', name: 'FC', slug: 'fc' })
    expect(blob.branding).toEqual({ logoUrl: '', primaryColor: '#fff', faviconUrl: '', emailFromName: '', tagline: '' })
    expect(JSON.parse(localStorage.getItem('activeTenant')).slug).toBe('spice-hub')
    expect(t.activeRestaurantPath()).toBe('/spice-hub')
  })

  test('branch without _id is dropped; non-object features become {}', () => {
    const blob = t.setActiveTenant({ slug: 'a', branch: { name: 'x' }, features: 'nope' })
    expect(blob.branch).toBeNull()
    expect(blob.features).toEqual({})
    expect(blob.branding).toBeNull()
  })

  test.each([undefined, {}, { slug: 5 }, { slug: '' }])('rejects %j', (arg) => {
    expect(() => t.setActiveTenant(arg)).toThrow(/string slug/)
  })

  test('activeRestaurantPath encodes the slug', () => {
    t.setActiveTenant({ slug: 'a b' })
    expect(t.activeRestaurantPath()).toBe('/a%20b')
  })
})

describe('setActiveBranch', () => {
  test('no tenant → no-op', () => {
    expect(t.setActiveBranch({ _id: 'b' })).toBeNull()
  })
  test('switches and clears the branch while keeping the tenant', () => {
    t.setActiveTenant({ slug: 'a' })
    t.setActiveBranch({ _id: 'b2', name: 'Main' })
    expect(t.getActiveBranch()).toEqual({ _id: 'b2', name: 'Main', slug: '' })
    t.setActiveBranch(null)
    expect(t.getActiveBranchId()).toBeNull()
    expect(t.getActiveTenantSlug()).toBe('a')
  })
})

describe('isFeatureEnabled (unknown → allow)', () => {
  test('no tenant → true', () => expect(t.isFeatureEnabled('kiosk')).toBe(true))
  test('legacy blob without features → true', () => {
    t.setActiveTenant({ slug: 'a' })
    expect(t.isFeatureEnabled('kiosk')).toBe(true)
  })
  test.each([[true, true], [false, false], [undefined, false], ['true', false]])(
    'flag %j → %s when a feature map is known', (flag, expected) => {
      t.setActiveTenant({ slug: 'a', features: { other: true, kiosk: flag } })
      expect(t.isFeatureEnabled('kiosk')).toBe(expected)
    },
  )
})

describe('subscriptions and clearing', () => {
  test('subscribers are notified on set/branch/clear, and can unsubscribe', () => {
    const fn = vi.fn()
    const bad = vi.fn(() => { throw new Error('ignored') })
    const unsub = t.subscribeActiveTenant(fn)
    t.subscribeActiveTenant(bad)
    t.setActiveTenant({ slug: 'a' })
    t.setActiveBranch({ _id: 'b' })
    t.clearActiveTenant()
    expect(fn).toHaveBeenCalledTimes(3)
    expect(fn).toHaveBeenLastCalledWith(null)
    unsub()
    t.setActiveTenant({ slug: 'z' })
    expect(fn).toHaveBeenCalledTimes(3)
    expect(localStorage.getItem('activeTenant')).not.toBeNull()
  })

  test('clearActiveTenant removes storage', () => {
    t.setActiveTenant({ slug: 'a' })
    t.clearActiveTenant()
    expect(localStorage.getItem('activeTenant')).toBeNull()
    expect(t.getActiveTenant()).toBeNull()
  })
})
