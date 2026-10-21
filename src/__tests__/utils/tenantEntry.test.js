/**
 * Tableless (token-number) dine-in entry — OPERATIONS_CONTROL_PANEL_DESIGN
 * §12.2. The branch "counter QR" enters the restaurant with NO table and
 * the session remembers `dineInEntry = { dineIn:true, tableless:true }`;
 * every "scan a table first" gate stands down, a real table scan wins.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

let tenant, er, ds, session

beforeEach(async () => {
  vi.resetModules()
  tenant = await import('@/utils/tenant')
  er = await import('@/utils/enterRestaurant')
  ds = await import('@/utils/dineInSession')
  session = await import('@/hooks/useCustomerSession')
})

const CAFE = { slug: 'cafe-uno', name: 'Cafe Uno', _id: 'r1' }
const BRANCH = { _id: 'b1', name: 'MG Road', slug: 'mg-road' }
const entry = () => JSON.parse(localStorage.getItem('dineInEntry'))

describe('enterRestaurant with the counter QR', () => {
  test('counter:true → restaurant + branch entered, no table, tableless dine-in remembered', () => {
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 'stale', name: '9' }))
    localStorage.setItem('tableNumber', '9')
    localStorage.setItem('isGuest', 'true')

    er.enterRestaurant(CAFE, BRANCH, undefined, { counter: true })

    expect(tenant.getActiveTenantSlug()).toBe('cafe-uno')
    expect(tenant.getActiveBranchId()).toBe('b1')
    expect(entry()).toEqual({ dineIn: true, tableless: true })
    expect(localStorage.getItem('dineInTable')).toBeNull()
    expect(localStorage.getItem('tableNumber')).toBeNull()
    expect(localStorage.getItem('orderType')).toBe('dine-in')
    // Flagged like a QR scan so the login screen keeps dine-in.
    expect(localStorage.getItem('fromQrScan')).toBe('true')
    expect(ds.isTablelessDineIn()).toBe(true)
    // The guest needs no table scan to order.
    expect(ds.needsTableScan()).toBe(false)
  })

  test('the plain restaurant link also enters tableless when the profile has tables off', () => {
    er.enterRestaurant({ ...CAFE, operations: { tables: { useTables: false } } }, BRANCH)
    expect(entry()).toEqual({ dineIn: true, tableless: true })
    expect(ds.isTablelessDineIn()).toBe(true)
  })

  test('default tenants are unchanged: no entry, guest dine-in still needs a scan', () => {
    localStorage.setItem('isGuest', 'true')
    localStorage.setItem('orderType', 'dine-in')
    er.enterRestaurant(CAFE, BRANCH)
    expect(localStorage.getItem('dineInEntry')).toBeNull()
    expect(ds.isTablelessDineIn()).toBe(false)
    expect(ds.needsTableScan()).toBe(true)
    er.enterRestaurant({ ...CAFE, operations: { tables: { useTables: true } } }, BRANCH)
    expect(localStorage.getItem('dineInEntry')).toBeNull()
  })

  test('moving to a DIFFERENT restaurant drops the tableless entry', () => {
    er.enterRestaurant(CAFE, BRANCH, undefined, { counter: true })
    er.enterRestaurant({ slug: 'other', name: 'Other' })
    expect(localStorage.getItem('dineInEntry')).toBeNull()
    expect(ds.isTablelessDineIn()).toBe(false)
  })
})

describe('isTablelessDineIn precedence', () => {
  beforeEach(() => ds.markTablelessDineIn())

  test('a real table scan wins over the counter entry', () => {
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 't1', name: '4' }))
    expect(ds.isTablelessDineIn()).toBe(false)
    expect(ds.needsTableScan()).toBe(false) // has a table
  })

  test('switching to takeaway is not a tableless dine-in visit', () => {
    localStorage.setItem('orderType', 'takeaway')
    expect(ds.isTablelessDineIn()).toBe(false)
  })

  test('clearTablelessDineIn forgets the entry; corrupt entry is ignored', () => {
    ds.clearTablelessDineIn()
    expect(ds.isTablelessDineIn()).toBe(false)
    localStorage.setItem('dineInEntry', '{nope')
    expect(ds.isTablelessDineIn()).toBe(false)
    localStorage.setItem('dineInEntry', JSON.stringify({ tableless: true }))
    expect(ds.isTablelessDineIn()).toBe(false) // dineIn flag required
  })
})

describe('landingActionTarget("counter")', () => {
  test.each([
    [{ isLoggedIn: true, role: 'customer' }, { to: '/customer/home' }],
    [{ isGuest: true }, { to: '/customer/home' }],
    [{}, { to: '/login', state: { from: 'qr-scan', next: '/customer/home' } }],
    [{ isLoggedIn: true, role: 'waiter' }, { to: '/login', state: { from: 'qr-scan', next: '/customer/home' } }],
  ])('%j → %j and pins dine-in', (auth, out) => {
    localStorage.setItem('orderType', 'takeaway')
    expect(er.landingActionTarget('counter', auth)).toEqual(out)
    expect(localStorage.getItem('orderType')).toBe('dine-in')
  })
})

describe('readCustomerSession in a tableless visit', () => {
  test('browsing phase, dine-in, may order, no table chrome', () => {
    ds.markTablelessDineIn()
    expect(session.readCustomerSession()).toMatchObject({
      phase: 'browsing', table: null, isDineIn: true, tableless: true,
      canOrder: true, canRequestService: false, showTableChrome: false,
    })
  })

  test('default dine-in without a table still cannot order', () => {
    localStorage.setItem('orderType', 'dine-in')
    expect(session.readCustomerSession()).toMatchObject({ tableless: false, canOrder: false })
  })

  test('a scanned table reports tableless:false', () => {
    ds.markTablelessDineIn()
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 't1', name: '4' }))
    expect(session.readCustomerSession()).toMatchObject({ phase: 'seated', tableless: false, canOrder: true })
  })
})
