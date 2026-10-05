/**
 * geo, image, favorites, exportReport, featureLabels, enterRestaurant,
 * serverStatus, upgradePromptBus.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// ── xlsx is captured, never written to disk ─────────────────────────────────
const written = []
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal()
  const mod = actual.default ?? actual
  return { ...mod, default: { ...mod, writeFile: (wb, name) => written.push({ wb, name }) }, writeFile: (wb, name) => written.push({ wb, name }) }
})

// ─────────────────────────────────────────────────────────────────────────────
describe('geo', () => {
  let geo
  beforeEach(async () => { geo = await import('@/utils/geo') })

  test('geocodeAddress parses the first Nominatim row', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ lat: '18.5', lon: '73.8' }] })
    vi.stubGlobal('fetch', fetchMock)
    await expect(geo.geocodeAddress('  FC Road, Pune ')).resolves.toEqual({ lat: 18.5, lng: 73.8 })
    expect(fetchMock.mock.calls[0][0]).toContain('q=FC%20Road%2C%20Pune')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Accept-Language': 'en' })
  })

  test('query is capped at 300 characters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    await geo.geocodeAddress('a'.repeat(500))
    expect(fetchMock.mock.calls[0][0]).toMatch(/q=a{300}$/)
  })

  test.each([
    ['too short input, no request', 'Pune', null, false],
    ['HTTP error', 'FC Road Pune', { ok: false }, true],
    ['empty result', 'FC Road Pune', { ok: true, json: async () => [] }, true],
    ['non-numeric coords', 'FC Road Pune', { ok: true, json: async () => [{ lat: 'x', lon: '1' }] }, true],
  ])('geocodeAddress → null on %s', async (_n, addr, res, called) => {
    const fetchMock = vi.fn().mockResolvedValue(res)
    vi.stubGlobal('fetch', fetchMock)
    await expect(geo.geocodeAddress(addr)).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(called ? 1 : 0)
  })

  test('network failure resolves null instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(geo.reverseGeocode({ lat: 1, lng: 2 })).resolves.toBeNull()
  })

  test('request is aborted after the 6s timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const p = geo.geocodeAddress('FC Road Pune')
    await vi.advanceTimersByTimeAsync(6000)
    await expect(p).resolves.toBeNull()
  })

  test('reverseGeocode returns display_name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ display_name: 'Pune' }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(geo.reverseGeocode({ lat: 18.5, lng: 73.8 })).resolves.toBe('Pune')
    expect(fetchMock.mock.calls[0][0]).toContain('lat=18.5&lon=73.8')
  })

  test('getCurrentPosition resolves coordinates', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok) => ok({ coords: { latitude: 1, longitude: 2 } }) } })
    await expect(geo.getCurrentPosition()).resolves.toEqual({ lat: 1, lng: 2 })
  })

  test.each([
    [1, /permission denied/], [3, /timed out/], [2, /Could not get your location/],
  ])('getCurrentPosition error code %d → readable message', async (code, msg) => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_ok, fail) => fail({ code }) } })
    await expect(geo.getCurrentPosition()).rejects.toThrow(msg)
  })

  test('unsupported device rejects', async () => {
    vi.stubGlobal('navigator', {})
    await expect(geo.getCurrentPosition()).rejects.toThrow(/not supported/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('image', () => {
  let img
  beforeEach(async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:5000/api/v1')
    vi.resetModules()
    img = await import('@/utils/image')
  })

  test.each([
    ['/uploads/a.jpg', 'http://localhost:5000/uploads/a.jpg'],
    ['  /uploads/a.jpg ', 'http://localhost:5000/uploads/a.jpg'],
    ['https://cdn.x/a.jpg', 'https://cdn.x/a.jpg'],
    ['https://backendhttps//cdn.com/foo.jpg', 'https://cdn.com/foo.jpg'],
    ['https//res.cloudinary.com/foo.jpg', 'https://res.cloudinary.com/foo.jpg'],
    ['', null], ['   ', null], [null, null], [42, null],
  ])('resolveImageUrl(%j) → %j', (input, out) => {
    expect(img.resolveImageUrl(input)).toBe(out)
  })

  test('FALLBACK_IMAGE uses the backend origin', () => {
    expect(img.FALLBACK_IMAGE).toBe('http://localhost:5000/uploads/Thumbnil.png')
  })

  test.each([
    [{ images: ['/uploads/1.jpg'], image: '/uploads/2.jpg' }, 'http://localhost:5000/uploads/1.jpg'],
    [{ images: [], image: '/uploads/2.jpg' }, 'http://localhost:5000/uploads/2.jpg'],
    [{ image: '' }, 'http://localhost:5000/uploads/Thumbnil.png'],
    [null, 'http://localhost:5000/uploads/Thumbnil.png'],
  ])('getItemImage(%j)', (item, out) => expect(img.getItemImage(item)).toBe(out))

  test('handleImageError swaps in the fallback once and disarms itself', () => {
    const target = { onerror: () => {}, src: 'broken' }
    img.handleImageError({ target })
    expect(target).toEqual({ onerror: null, src: img.FALLBACK_IMAGE })
  })

  test.each([
    ['https://images.unsplash.com/photo-1?w=4000&q=100', {}, 'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=600&q=75'],
    ['https://res.cloudinary.com/demo/image/upload/v1/a.jpg', { w: 100, q: 50 }, 'https://res.cloudinary.com/demo/image/upload/c_fill,w_150,q_50,f_auto/v1/a.jpg'],
    ['https://res.cloudinary.com/demo/image/upload/c_fill,w_10/a.jpg', {}, 'https://res.cloudinary.com/demo/image/upload/c_fill,w_10/a.jpg'],
    [' https://other.host/a.jpg ', {}, 'https://other.host/a.jpg'],
    ['', {}, ''], [null, {}, null],
  ])('sizedImage(%j, %j)', (url, opts, out) => expect(img.sizedImage(url, opts)).toBe(out))

  test.each([
    ['https://res.cloudinary.com/d/image/upload/v1/logo.png', 'https://res.cloudinary.com/d/image/upload/e_make_transparent:15/f_auto,q_auto/v1/logo.png'],
    ['https://res.cloudinary.com/d/image/upload/e_trim/logo.png', 'https://res.cloudinary.com/d/image/upload/e_trim/logo.png'],
    ['https://res.cloudinary.com/d/raw/logo.png', 'https://res.cloudinary.com/d/raw/logo.png'],
    ['/uploads/logo.png', '/uploads/logo.png'],
    [undefined, undefined],
  ])('transparentLogo(%j)', (url, out) => expect(img.transparentLogo(url)).toBe(out))

  test('loopback API host is swapped for the LAN host when opened from a phone', async () => {
    window.history.pushState({}, '', '/')
    const { swapLoopbackHost } = await import('@/utils/apiOrigin')
    // jsdom page host is localhost → unchanged
    expect(swapLoopbackHost('http://localhost:5000/api/v1')).toBe('http://localhost:5000/api/v1')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('favorites', () => {
  let fav
  beforeEach(async () => { fav = await import('@/utils/favorites') })

  test('toggle adds then removes, persisting under customer_bookmarks', () => {
    expect(fav.toggleFavorite('m1')).toBe(true)
    expect(fav.isFavorite('m1')).toBe(true)
    expect(JSON.parse(localStorage.getItem('customer_bookmarks'))).toEqual(['m1'])
    expect(fav.toggleFavorite('m1')).toBe(false)
    expect(fav.isFavorite('m1')).toBe(false)
  })

  test.each([null, '', undefined])('falsy id %j is ignored', (id) => {
    expect(fav.toggleFavorite(id)).toBe(false)
    expect(fav.isFavorite(id)).toBe(false)
    fav.removeFavorite(id)
    expect(localStorage.getItem('customer_bookmarks')).toBeNull()
  })

  test('corrupt storage reads as empty', () => {
    localStorage.setItem('customer_bookmarks', '{bad')
    expect(fav.isFavorite('m1')).toBe(false)
  })

  test('removeFavorite only writes when something was removed', () => {
    const spy = vi.fn()
    window.addEventListener('favorites:change', spy)
    fav.removeFavorite('absent')
    fav.toggleFavorite('m1')
    fav.removeFavorite('m1')
    window.removeEventListener('favorites:change', spy)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  test('useFavorites stays in sync with same-tab and cross-tab changes', () => {
    const { result } = renderHook(() => fav.useFavorites())
    expect(result.current.has('m1')).toBe(false)
    act(() => { result.current.toggle('m1') })
    expect(result.current.has('m1')).toBe(true)
    act(() => {
      localStorage.setItem('customer_bookmarks', JSON.stringify(['m2']))
      window.dispatchEvent(new StorageEvent('storage', { key: 'customer_bookmarks' }))
    })
    expect(result.current.has('m2')).toBe(true)
    act(() => {
      localStorage.setItem('customer_bookmarks', JSON.stringify(['m2', 'm3']))
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    })
    expect(result.current.has('m3')).toBe(false) // unrelated key ignored
    act(() => { result.current.remove('m2') })
    expect([...result.current.favorites]).toEqual(['m3'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('exportReport', () => {
  beforeEach(() => { written.length = 0 })

  const columns = [
    { key: 'name', label: 'Item' },
    { key: 'qty', label: 'Qty', numeric: true },
    { key: 'amount', label: 'Amount', money: true },
  ]

  test('builds title/meta/header/data/total rows with numeric money cells formatted as ₹', async () => {
    const { exportReportToExcel } = await import('@/utils/exportReport')
    await exportReportToExcel({
      filename: 'r.xlsx', sheetName: 'A very long sheet name that exceeds thirty-one chars', title: 'Stock',
      meta: [{ label: 'Period', value: 'Oct' }],
      columns, rows: [{ name: 'Rice', qty: 2, amount: 120.5 }, { name: 'Dal', qty: null, amount: '' }],
      totals: { qty: 2, amount: 120.5 },
    })
    const { wb, name } = written[0]
    expect(name).toBe('r.xlsx')
    const sheetName = wb.SheetNames[0]
    expect(sheetName).toHaveLength(31)
    const ws = wb.Sheets[sheetName]
    expect(ws.A1.v).toBe('Stock')
    expect(ws.A2.v).toBe('Period')
    expect(ws.A4.v).toBe('Item') // header after blank spacer row
    expect(ws.C5).toMatchObject({ v: 120.5, t: 'n', z: '"₹"#,##0.00' })
    expect(ws.B6.v).toBe(0) // empty numeric → 0
    expect(ws.C6.v).toBe(0)
    expect(ws.A8.v).toBe('TOTAL')
    expect(ws.C8.z).toBe('"₹"#,##0.00')
    expect(ws['!cols'].every((c) => c.wch >= 10 && c.wch <= 40)).toBe(true)
  })

  test('without title/meta the header is row 1 and empty text cells stay blank', async () => {
    const { exportReportToExcel } = await import('@/utils/exportReport')
    await exportReportToExcel({ filename: 'x.xlsx', columns, rows: [{ qty: 1, amount: 1 }] })
    const ws = written[0].wb.Sheets.Report
    expect(ws.A1.v).toBe('Item')
    expect(ws.A2.v).toBe('')
  })

  test.each(['=HYPERLINK("http://evil","x")', '+1+cmd', '-2+3', '@SUM(A1)'])(
    'formula-looking text %j is stored as an inert string cell, never a formula', async (payload) => {
      const { exportReportToExcel } = await import('@/utils/exportReport')
      await exportReportToExcel({ filename: 'x.xlsx', columns, rows: [{ name: payload, qty: 1, amount: 1 }] })
      const cell = written[0].wb.Sheets.Report.A2
      expect(cell.t).toBe('s')
      expect(cell.f).toBeUndefined()
      expect(cell.v).toBe(payload)
    },
  )

  test('all current callers export .xlsx (CSV would emit formula text unescaped)', () => {
    // Guards the assumption above: the xlsx path is safe; a .csv filename
    // would make XLSX.writeFile emit "=..." raw.
    const dir = path.resolve(HERE, '../../Pages/Admin/components')
    const callers = ['InventoryReports.jsx', 'PurchasesTab.jsx', 'SuppliersTab.jsx']
    for (const f of callers) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8')
      const names = [...src.matchAll(/filename:\s*`([^`]+)`/g)].map((m) => m[1])
      expect(names.length).toBeGreaterThan(0)
      names.forEach((n) => expect(n).toMatch(/\.xlsx$/))
    }
  })

  test('reportStamp formats yyyy-mm-dd with zero padding', async () => {
    const { reportStamp } = await import('@/utils/exportReport')
    expect(reportStamp(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('featureLabels', () => {
  test('keys match Backend/middlewares/featureGate.js FEATURE_LABELS', async () => {
    const { FEATURE_LABELS } = await import('@/utils/featureLabels')
    const src = fs.readFileSync(path.resolve(HERE, '../../../../Backend/middlewares/featureGate.js'), 'utf8')
    const block = src.slice(src.indexOf('const FEATURE_LABELS'), src.indexOf('};', src.indexOf('const FEATURE_LABELS')))
    const backendKeys = [...block.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]).sort()
    expect(Object.keys(FEATURE_LABELS).sort()).toEqual(backendKeys)
    Object.values(FEATURE_LABELS).forEach((v) => expect(v).toMatch(/^[A-Z]/))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('enterRestaurant', () => {
  let er, tenant
  beforeEach(async () => {
    vi.resetModules()
    tenant = await import('@/utils/tenant')
    er = await import('@/utils/enterRestaurant')
  })
  const tenantKeys = ['cart', 'guest_cart_reset', 'cafe_orders_v2', 'cancelled_orders_v1', 'order_ratings', 'guest_bill_paid_at', 'scanToken', 'dineInBillSettled']

  test('entering a DIFFERENT restaurant wipes tenant-bound state but keeps the login', () => {
    tenant.setActiveTenant({ slug: 'old' })
    tenantKeys.forEach((k) => localStorage.setItem(k, 'x'))
    localStorage.setItem('token', 'keep')
    er.enterRestaurant({ slug: 'New', name: 'New Cafe', _id: 'r2', city: 'Pune' })
    tenantKeys.forEach((k) => expect(localStorage.getItem(k)).toBeNull())
    expect(localStorage.getItem('token')).toBe('keep')
    expect(tenant.getActiveTenantSlug()).toBe('new')
    expect(JSON.parse(localStorage.getItem('selectedBranch'))).toEqual({
      id: 'r2', name: 'New Cafe', addressLine1: 'Pune', addressLine2: '', hours: '', phone: '',
    })
  })

  test('re-entering the SAME restaurant (branch switch) keeps the cart; slug compare is case-insensitive', () => {
    tenant.setActiveTenant({ slug: 'spice' })
    localStorage.setItem('cart', 'keep')
    er.enterRestaurant({ slug: 'SPICE', name: 'S' }, { _id: 'b2', name: 'FC Road', addressLine1: 'L1', contactPhone: '99' })
    expect(localStorage.getItem('cart')).toBe('keep')
    expect(tenant.getActiveBranchId()).toBe('b2')
    expect(JSON.parse(localStorage.getItem('selectedBranch'))).toMatchObject({ id: 'b2', name: 'FC Road', addressLine1: 'L1', phone: '99' })
  })

  test('requires a slug', () => {
    expect(() => er.enterRestaurant({ name: 'x' })).toThrow(/slug/)
  })

  test.each([
    [[], null, { branch: null, needsPick: false }],
    [[{ slug: 'a' }], null, { branch: { slug: 'a' }, needsPick: false }],
    [[{ slug: 'a' }, { slug: 'b' }], 'B', { branch: { slug: 'b' }, needsPick: false }],
    [[{ slug: 'a' }, { slug: 'b' }], 'zzz', { branch: null, needsPick: true }],
    [[{ slug: 'a' }, { slug: 'b' }], null, { branch: null, needsPick: true }],
  ])('resolveBranchChoice(%j, %j)', (list, pref, out) => {
    expect(er.resolveBranchChoice(list, pref)).toEqual(out)
  })

  test.each([
    ['takeaway', { isLoggedIn: true, role: 'customer' }, { to: '/customer/home' }, 'takeaway'],
    ['takeaway', { isGuest: true }, { to: '/customer/home' }, 'takeaway'],
    ['takeaway', {}, { to: '/login', state: { from: 'takeaway', next: '/customer/home' } }, 'takeaway'],
    ['takeaway', { isLoggedIn: true, role: 'waiter' }, { to: '/login', state: { from: 'takeaway', next: '/customer/home' } }, 'takeaway'],
    ['booking', { isLoggedIn: true, role: 'customer' }, { to: '/customer/booking-type', state: { bookingType: 'table' } }, 'dine-in'],
    ['booking', { isGuest: true }, { to: '/login', state: { from: 'advance-booking', next: '/customer/booking-type', nextState: { bookingType: 'table' } } }, 'dine-in'],
  ])('landingActionTarget(%s, %j)', (action, auth, out, orderType) => {
    localStorage.setItem('dineInTable', 'x')
    expect(er.landingActionTarget(action, auth)).toEqual(out)
    expect(localStorage.getItem('orderType')).toBe(orderType)
    expect(localStorage.getItem('dineInTable')).toBeNull()
  })

  test.each([
    ['item', { itemId: 'a/b' }, '/customer/item/a%2Fb'],
    ['item', {}, '/home'],
    ['menu', {}, '/home'],
    ['unknown', {}, '/home'],
  ])('landingActionTarget(%s) keeps the table binding and routes to %s', (action, opts, to) => {
    localStorage.setItem('dineInTable', 'x')
    expect(er.landingActionTarget(action, {}, opts)).toEqual({ to })
    expect(localStorage.getItem('dineInTable')).toBe('x')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('serverStatus', () => {
  let s
  beforeEach(async () => { vi.resetModules(); s = await import('@/utils/serverStatus') })

  test('banner flips only after two consecutive failures and clears on success', () => {
    const fn = vi.fn()
    const unsub = s.subscribeServerStatus(fn)
    s.reportNetworkFailure()
    expect(s.isServerDown()).toBe(false)
    s.setServerDown(true)
    expect(s.isServerDown()).toBe(true)
    s.reportNetworkFailure() // already down → no duplicate notification
    s.setServerDown(false)
    expect(s.isServerDown()).toBe(false)
    s.reportNetworkSuccess() // idempotent
    expect(fn.mock.calls).toEqual([[true], [false]])
    unsub()
  })

  test('a success between failures resets the counter', () => {
    s.reportNetworkFailure()
    s.reportNetworkSuccess()
    s.reportNetworkFailure()
    expect(s.isServerDown()).toBe(false)
  })

  test('offline device: failures ignored; coming back online clears the banner', () => {
    const online = vi.fn()
    s.subscribeOnlineStatus(online)
    s.reportNetworkFailure(); s.reportNetworkFailure()
    expect(s.isServerDown()).toBe(true)
    window.dispatchEvent(new Event('offline'))
    expect(s.isOffline()).toBe(true)
    s.reportNetworkFailure()
    window.dispatchEvent(new Event('offline')) // no duplicate
    window.dispatchEvent(new Event('online'))
    expect(s.isOffline()).toBe(false)
    expect(s.isServerDown()).toBe(false)
    expect(online.mock.calls).toEqual([[true], [false]])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('upgradePromptBus', () => {
  test('single subscriber receives payloads; stale unsubscribe does not evict the new one', async () => {
    const bus = await import('@/utils/upgradePromptBus')
    bus.openUpgradePrompt({ feature: 'x' }) // no subscriber → no throw
    const a = vi.fn(); const b = vi.fn()
    const unsubA = bus.subscribeUpgradePrompt(a)
    bus.subscribeUpgradePrompt(b) // replaces a
    unsubA() // stale — must not clear b
    bus.openUpgradePrompt({ feature: 'inventory' })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith({ feature: 'inventory' })
  })
})
