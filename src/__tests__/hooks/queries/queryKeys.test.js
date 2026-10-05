import { describe, test, expect } from 'vitest'
import { adminKeys, getAdminBranchKey } from '@/hooks/queries/queryKeys'

const setBranch = (raw) => localStorage.setItem('adminActiveBranch', raw)

describe('getAdminBranchKey', () => {
  test.each([
    ['nothing stored', null, 'all'],
    ['a JSON string id', JSON.stringify('b1'), 'b1'],
    ['a JSON empty string', JSON.stringify(''), 'all'],
    ['a branch object', JSON.stringify({ _id: 42, name: 'Main' }), '42'],
    ['an object without _id', JSON.stringify({ name: 'x' }), 'all'],
    ['a legacy plain (non-JSON) string', 'legacyId', 'legacyId'],
  ])('%s → %s', (_l, raw, expected) => {
    if (raw !== null) setBranch(raw)
    expect(getAdminBranchKey()).toBe(expected)
  })
})

describe('adminKeys', () => {
  test('root key is a stable prefix of every leaf', () => {
    for (const key of [adminKeys.tables, adminKeys.orders.live, adminKeys.inventory.summary, adminKeys.categories]) {
      expect(key[0]).toBe('admin')
    }
    expect(adminKeys.all).toEqual(['admin'])
  })

  test('leaves are structurally stable across reads (same branch → equal keys)', () => {
    expect(adminKeys.tables).toEqual(adminKeys.tables)
    expect(adminKeys.orders.refunds({ p: 1 })).toEqual(adminKeys.orders.refunds({ p: 1 }))
  })

  test.each([
    ['bootstrap', () => adminKeys.bootstrap, ['admin', 'bootstrap']],
    ['tables', () => adminKeys.tables, ['admin', 'tables']],
    ['areas', () => adminKeys.areas, ['admin', 'areas']],
    ['reservations', () => adminKeys.reservations, ['admin', 'reservations']],
    ['staff', () => adminKeys.staff, ['admin', 'staff']],
    ['settings', () => adminKeys.settings, ['admin', 'settings']],
    ['orders.live', () => adminKeys.orders.live, ['admin', 'orders', 'live']],
    ['orders.past', () => adminKeys.orders.past, ['admin', 'orders', 'past']],
    ['orders.kitchen', () => adminKeys.orders.kitchen, ['admin', 'orders', 'kitchen']],
    ['orders.refunds', () => adminKeys.orders.refunds(), ['admin', 'orders', 'refunds', {}]],
    ['inventory.list', () => adminKeys.inventory.list({ page: 2 }), ['admin', 'inventory', 'list', { page: 2 }]],
    ['inventory.summary', () => adminKeys.inventory.summary, ['admin', 'inventory', 'summary']],
    ['inventory.alerts', () => adminKeys.inventory.alerts, ['admin', 'inventory', 'alerts']],
    ['payments', () => adminKeys.payments, ['admin', 'payments']],
    ['crm', () => adminKeys.crm, ['admin', 'crm']],
    ['bookings', () => adminKeys.bookings, ['admin', 'bookings']],
    ['menu', () => adminKeys.menu, ['admin', 'menu']],
    ['categories', () => adminKeys.categories, ['admin', 'categories']],
  ])('%s ends with the active branch, so a branch switch lands on a new cache entry', (_l, get, prefix) => {
    const before = get()
    expect(before).toEqual([...prefix, { branch: 'all' }])
    setBranch(JSON.stringify('b2'))
    const after = get()
    expect(after).toEqual([...prefix, { branch: 'b2' }])
    expect(after).not.toEqual(before)
  })

  // Regression (fixed 2026-10): admin keys carry the tenant (staff user's tenant, else activeTenant) next to the branch.
  test('admin keys carry the tenant as well as the branch — two tenants never share a cache entry', () => {
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'uA', role: 'admin', tenant: { _id: 'tenantA', slug: 'a' } }))
    const keyForTenantA = adminKeys.tables
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'uB', role: 'admin', tenant: { _id: 'tenantB', slug: 'b' } }))
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'b' }))
    const keyForTenantB = adminKeys.tables
    expect(keyForTenantB).not.toEqual(keyForTenantA)
  })
})
