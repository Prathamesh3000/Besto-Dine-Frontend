import { describe, test, expect } from 'vitest'
import { buildAdminNavItems } from '@/utils/adminNav'

const ITEMS = [
  { name: 'Dashboard', path: '/admin/dashboard', permission: null, feature: null },
  { name: 'Wallet', path: '/admin/wallet', permission: null, feature: 'walletLoyalty' },
  { name: 'Incentives', path: '/admin/incentives', permission: 'incentives', feature: 'incentives', hideWhenLocked: true },
]
const names = (ctx) => buildAdminNavItems(ITEMS, { isTenantOwner: true, isCrossBranchReadOnly: false, ...ctx }).map(i => i.name)
const perms = (...keys) => (k) => keys.includes(k)
const feats = (...keys) => (k) => keys.includes(k)

describe('admin nav - Incentives gating', () => {
  test('admin (all permissions) + plan has module -> shown', () => {
    expect(names({ hasPermission: () => true, hasFeature: feats('incentives') })).toContain('Incentives')
  })
  test('plan without module -> hidden entirely (no PRO badge)', () => {
    expect(names({ hasPermission: () => true, hasFeature: feats() })).not.toContain('Incentives')
  })
  test('manager without the permission -> hidden even when the plan has it', () => {
    expect(names({ hasPermission: perms(), hasFeature: feats('incentives') })).not.toContain('Incentives')
  })
  test('manager with the permission -> shown', () => {
    expect(names({ hasPermission: perms('incentives'), hasFeature: feats('incentives') })).toContain('Incentives')
  })
  test('other locked modules still show with the locked flag', () => {
    const out = buildAdminNavItems(ITEMS, { hasPermission: () => true, hasFeature: feats('incentives'), isCrossBranchReadOnly: false })
    expect(out.find(i => i.name === 'Wallet').locked).toBe(true)
  })
  test('cross-branch read-only keeps only the dashboard', () => {
    expect(names({ hasPermission: () => true, hasFeature: feats('incentives'), isCrossBranchReadOnly: true })).toEqual(['Dashboard'])
  })
})
