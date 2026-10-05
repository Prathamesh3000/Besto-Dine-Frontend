import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper.jsx'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))

const h = vi.hoisted(() => ({ socket: null }))
vi.mock('@/utils/socket', async () => {
  const { createFakeSocket } = await import('../../_helpers/fakeSocket.js')
  h.socket = createFakeSocket()
  return {
    getSocket: () => h.socket,
    subscribeSocketState: () => () => {},
    isSocketConnected: () => false,
    onSocketReconnect: () => () => {},
  }
})

import * as Q from '@/hooks/queries/adminQueries'
import { adminKeys } from '@/hooks/queries/queryKeys'

let client
const ok = (data) => Promise.resolve({ data })
const run = (hook) => renderHook(hook, { wrapper: wrapperFor(client) })
const settle = async (result) => { await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true)) }

beforeEach(() => {
  client = makeQueryClient()
  api.get.mockReset()
  h.socket.reset()
})

describe('per-section list hooks: endpoint, cache key and response unwrapping', () => {
  test.each([
    ['useTables', '/tables', 'tables', () => adminKeys.tables],
    ['useAreas', '/areas', 'areas', () => adminKeys.areas],
    ['useReservations', '/reservations', 'reservations', () => adminKeys.reservations],
    ['useStaff', '/staff', 'staff', () => adminKeys.staff],
  ])('%s GETs %s and unwraps the `%s` envelope', async (name, url, field, key) => {
    api.get.mockReturnValue(ok({ success: true, [field]: [{ _id: 1 }] }))
    const { result } = run(() => Q[name]())
    await settle(result)
    expect(api.get).toHaveBeenCalledWith(url)
    expect(result.current.data).toEqual([{ _id: 1 }])
    expect(client.getQueryData(key())).toEqual([{ _id: 1 }])
  })

  test.each([
    ['a bare array', [{ _id: 2 }], [{ _id: 2 }]],
    ['an unknown envelope', { success: true }, []],
    ['no body', undefined, []],
  ])('useTables handles %s', async (_l, body, expected) => {
    api.get.mockReturnValue(ok(body))
    const { result } = run(() => Q.useTables())
    await settle(result)
    expect(result.current.data).toEqual(expected)
  })

  test('caller options override the defaults (enabled:false → no fetch)', async () => {
    const { result } = run(() => Q.useTables({ enabled: false }))
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.get).not.toHaveBeenCalled()
  })

  test('useAdminSettings returns the raw body', async () => {
    api.get.mockReturnValue(ok({ taxRate: 5 }))
    const { result } = run(() => Q.useAdminSettings())
    await settle(result)
    expect(result.current.data).toEqual({ taxRate: 5 })
  })

  test.each([
    ['useLiveOrders', '/orders/live'],
    ['usePastOrders', '/orders/past'],
  ])('%s unwraps `orders` and falls back to the body / []', async (name, url) => {
    api.get.mockReturnValueOnce(ok({ orders: [{ _id: 'o' }] }))
    const { result } = run(() => Q[name]())
    await settle(result)
    expect(api.get).toHaveBeenCalledWith(url)
    expect(result.current.data).toEqual([{ _id: 'o' }])
  })

  // Regression (fixed 2026-10): useCategories unwraps { data: [...] } and caches the array, like useAdminPrefetch.
  test('useCategories caches the category array, not the {success,count,data} envelope', async () => {
    api.get.mockReturnValue(ok({ success: true, count: 1, data: [{ _id: 'c1', name: 'Pizza' }] }))
    const { result } = run(() => Q.useCategories())
    await settle(result)
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(client.getQueryData(adminKeys.categories)).toEqual([{ _id: 'c1', name: 'Pizza' }])
  })
})

describe('telemetry / reports / forecast keys', () => {
  test('useTelemetry lower-cases the time filter, defaults branch to "all" and keys by params', async () => {
    api.get.mockReturnValue(ok({ stats: 1 }))
    const { result } = run(() => Q.useTelemetry({ earningsPeriod: 'weekly', timeFilter: 'Today', branch: '' }))
    await settle(result)
    const params = { earningsPeriod: 'weekly', bookingTime: 'today', branch: 'all' }
    expect(api.get).toHaveBeenCalledWith('/telemetry/stats', { params })
    expect(client.getQueryData(['admin', 'telemetry', params])).toEqual({ stats: 1 })
  })

  test.each(['request:new', 'request:updated', 'order:new', 'order:updated'])(
    'useTelemetry invalidates telemetry on socket %s', async (ev) => {
      api.get.mockReturnValue(ok({}))
      const { result } = run(() => Q.useTelemetry())
      await settle(result)
      const spy = vi.spyOn(client, 'invalidateQueries')
      act(() => h.socket.serverEmit(ev))
      expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'telemetry'] })
    },
  )

  test('useTelemetry removes its 4 socket listeners on unmount', async () => {
    api.get.mockReturnValue(ok({}))
    const { unmount } = run(() => Q.useTelemetry())
    expect(h.socket.totalListeners()).toBe(4)
    unmount()
    expect(h.socket.totalListeners()).toBe(0)
  })

  test.each([
    [{}, {}, { from: '', to: '', branch: 'all' }],
    [{ from: '2026-01-01', to: '2026-01-31', branch: 'b1' }, { from: '2026-01-01', to: '2026-01-31', branch: 'b1' }, { from: '2026-01-01', to: '2026-01-31', branch: 'b1' }],
  ])('useReports(%j) sends %j and keys %j', async (args, params, keyPart) => {
    api.get.mockReturnValue(ok({ r: 1 }))
    const { result } = run(() => Q.useReports(args))
    await settle(result)
    expect(api.get).toHaveBeenCalledWith('/telemetry/reports', { params })
    expect(client.getQueryData(['admin', 'reports', keyPart])).toEqual({ r: 1 })
  })

  test('useForecast passes only provided params and keys by branch/horizon/lookback', async () => {
    api.get.mockReturnValue(ok({ f: 1 }))
    const { result } = run(() => Q.useForecast({ branch: 'b1', horizon: 14 }))
    await settle(result)
    expect(api.get).toHaveBeenCalledWith('/telemetry/forecast', { params: { branch: 'b1', horizon: 14 } })
    expect(client.getQueryData(['admin', 'forecast', { branch: 'b1', horizon: 14, lookback: 'def' }])).toEqual({ f: 1 })
    const { result: r2 } = run(() => Q.useForecast({ lookback: 30 }))
    await settle(r2)
    expect(api.get).toHaveBeenLastCalledWith('/telemetry/forecast', { params: { lookback: 30 } })
  })
})

describe('orders archive + paging + inventory', () => {
  test('useAdminDineInArchive merges live + past and dedupes by _id/orderId/id, dropping keyless rows', async () => {
    api.get.mockImplementation((url) => (url === '/orders/live'
      ? ok({ orders: [{ _id: 'a' }, { orderId: 'b' }, {}] })
      : ok({ orders: [{ _id: 'a' }, { id: 'c' }, { orderId: 'b' }] })))
    const { result } = run(() => Q.useAdminDineInArchive({ branch: 'b9' }))
    await settle(result)
    expect(result.current.data).toEqual([{ _id: 'a' }, { orderId: 'b' }, { id: 'c' }])
    expect(api.get).toHaveBeenCalledWith('/orders/live', { params: { branch: 'b9' } })
    expect(api.get).toHaveBeenCalledWith('/orders/past', { params: { branch: 'b9', limit: 200 } })
  })

  test('useAdminDineInArchive with branch "all" sends no branch param', async () => {
    api.get.mockReturnValue(ok({}))
    const { result } = run(() => Q.useAdminDineInArchive())
    await settle(result)
    expect(api.get).toHaveBeenCalledWith('/orders/live', { params: {} })
    expect(result.current.data).toEqual([])
  })

  test('usePastOrdersPage only sends non-empty filters and keys by active branch', async () => {
    localStorage.setItem('adminActiveBranch', JSON.stringify('b1'))
    api.get.mockReturnValue(ok({ orders: [], pagination: {} }))
    const { result } = run(() => Q.usePastOrdersPage({ page: 2, status: 'paid', search: 'x', dateRange: '7d', branch: 'b1' }))
    await settle(result)
    const params = { page: 2, limit: 8, branch: 'b1', status: 'paid', dateRange: '7d', search: 'x' }
    expect(api.get).toHaveBeenCalledWith('/orders/past', { params })
    expect(client.getQueryData(['admin', 'orders', 'past-page', params, { branch: 'b1' }])).toBeDefined()
  })

  test('useInventoryList merges items + summary and applies filter defaults', async () => {
    api.get.mockImplementation((url) => (url === '/inventory'
      ? ok({ items: [{ _id: 'i' }], pagination: { page: 1 } })
      : ok({ summary: { low: 2 } })))
    const { result } = run(() => Q.useInventoryList({ search: 'oil', category: 'Dry', status: 'low', sortBy: 'name', sortOrder: 'asc' }))
    await settle(result)
    expect(api.get).toHaveBeenCalledWith('/inventory', { params: { page: 1, limit: 10, search: 'oil', category: 'Dry', status: 'low', sortBy: 'name', sortOrder: 'asc' } })
    expect(result.current.data).toEqual({ items: [{ _id: 'i' }], pagination: { page: 1 }, summary: { low: 2 } })
  })

  test('useInventoryList fills defaults when the server omits fields', async () => {
    api.get.mockReturnValue(ok({}))
    const { result } = run(() => Q.useInventoryList())
    await settle(result)
    expect(result.current.data).toEqual({ items: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 }, summary: null })
  })
})

describe('useBranches', () => {
  test('returns data[] on success and [] on FEATURE_LOCKED (silent)', async () => {
    api.get.mockReturnValueOnce(ok({ data: [{ _id: 'b1' }] }))
    const { result } = run(() => Q.useBranches())
    await settle(result)
    expect(api.get).toHaveBeenCalledWith('/branches', { _silent: true })
    expect(result.current.data).toEqual([{ _id: 'b1' }])

    client = makeQueryClient()
    api.get.mockReturnValueOnce(Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } })))
    const { result: r2 } = run(() => Q.useBranches())
    await settle(r2)
    expect(r2.current.data).toEqual([])
  })

  // Regression (fixed 2026-10): useBranches is keyed by tenant, so tenant B's admin never gets tenant A's cached list.
  test('a second tenant\'s admin on the same QueryClient gets their own branch list', async () => {
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'tenant-a' }))
    api.get.mockReturnValueOnce(ok({ data: [{ _id: 'A-main', slug: 'main' }] }))
    const first = run(() => Q.useBranches())
    await settle(first.result)
    first.unmount()

    // tenant A admin logs out, tenant B admin logs in (Login.jsx:122 sets the new tenant)
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'tenant-b' }))
    api.get.mockReturnValueOnce(ok({ data: [{ _id: 'B-main', slug: 'main' }] }))
    const second = run(() => Q.useBranches())
    await settle(second.result)
    expect(second.result.current.data).toEqual([{ _id: 'B-main', slug: 'main' }])
  })
})

describe('useAdminInvalidator', () => {
  test.each([
    ['all', ['admin']],
    ['tables', adminKeys.tables],
    ['areas', adminKeys.areas],
    ['reservations', adminKeys.reservations],
    ['staff', adminKeys.staff],
    ['settings', adminKeys.settings],
    ['orders', ['admin', 'orders']],
  ])('%s() invalidates %j', (name, key) => {
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = run(() => Q.useAdminInvalidator())
    result.current[name]()
    expect(spy).toHaveBeenCalledWith({ queryKey: key })
  })
})
