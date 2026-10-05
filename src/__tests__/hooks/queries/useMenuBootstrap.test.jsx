import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper.jsx'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))

let mod
let tenant
let client
const run = (opts) => renderHook(() => mod.useMenuBootstrap(opts), { wrapper: wrapperFor(client) })
const done = async (result) => { await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true)) }
const payload = { menu: [{ _id: 'm1' }, { _id: 'm2' }], combos: [{ _id: 'c1' }], categories: [{ _id: 'k1' }] }

beforeEach(async () => {
  vi.resetModules()
  tenant = await import('@/utils/tenant')
  mod = await import('@/hooks/queries/useMenuBootstrap')
  client = makeQueryClient()
  api.get.mockReset()
  api.get.mockResolvedValue({ data: { data: payload } })
  window.history.replaceState({}, '', '/customer/home')
})

describe('useMenuBootstrap', () => {
  test('stays idle without a tenant slug (no 400 on /branch-selection)', () => {
    const { result } = run()
    expect(result.current.fetchStatus).toBe('idle')
    expect(api.get).not.toHaveBeenCalled()
  })

  test('respects enabled:false even with a tenant', () => {
    tenant.setActiveTenant({ slug: 'spice' })
    run({ enabled: false })
    expect(api.get).not.toHaveBeenCalled()
  })

  test('fetches with slug + branch, keys by tenant AND branch, and hydrates per-section caches', async () => {
    tenant.setActiveTenant({ slug: 'Spice', branch: { _id: 'b1', name: 'FC' } })
    const { result } = run()
    await done(result)
    expect(api.get).toHaveBeenCalledWith('/public/menu-bootstrap?slug=spice&branch=b1', { _isBackground: true })
    expect(client.getQueryData(['public', 'menu-bootstrap', 'spice', 'b1', 'std'])).toEqual(payload)
    expect(client.getQueryData(['menu', 'spice', 'list', {}])).toEqual({
      items: payload.menu,
      pagination: { totalItems: 2, totalPages: 1, currentPage: 1, pageSize: 2 },
    })
    expect(client.getQueryData(['combos', 'spice', 'list', {}]).items).toEqual(payload.combos)
    expect(client.getQueryData(['categories', 'spice'])).toEqual(payload.categories)
  })

  test('two tenants never share a cache entry', async () => {
    tenant.setActiveTenant({ slug: 'a' })
    const a = run()
    await done(a.result)
    tenant.setActiveTenant({ slug: 'b' })
    const b = run()
    await done(b.result)
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(['public', 'menu-bootstrap', 'b', 'tenant', 'std'])).toBeDefined()
  })

  test('kiosk routes request kiosk-only categories under a separate key', async () => {
    window.history.replaceState({}, '', '/kiosk/menu')
    tenant.setActiveTenant({ slug: 'k' })
    const { result } = run()
    await done(result)
    expect(api.get).toHaveBeenCalledWith('/public/menu-bootstrap?slug=k&kiosk=true', { _isBackground: true })
    expect(client.getQueryData(['public', 'menu-bootstrap', 'k', 'tenant', 'kiosk'])).toBeDefined()
  })

  test('bumpMenuVersion adds a cache-busting _v param to the next fetch', async () => {
    tenant.setActiveTenant({ slug: 's' })
    expect(mod.bumpMenuVersion()).toBe(1)
    const { result } = run()
    await done(result)
    expect(api.get.mock.calls[0][0]).toContain('_v=1')
  })

  test('switching tenant drops every cached bootstrap entry', async () => {
    tenant.setActiveTenant({ slug: 's' })
    const { result } = run()
    await done(result)
    expect(client.getQueryCache().findAll({ queryKey: ['public', 'menu-bootstrap'] }).length).toBe(1)
    act(() => { tenant.setActiveTenant({ slug: 'other' }) })
    await waitFor(() => expect(client.getQueryData(['public', 'menu-bootstrap', 's', 'tenant', 'std'])).toBeUndefined())
  })

  test('null payload / non-array sections skip hydration', async () => {
    tenant.setActiveTenant({ slug: 's' })
    api.get.mockResolvedValue({ data: { data: { menu: null } } })
    const { result } = run()
    await done(result)
    expect(client.getQueryData(['menu', 's', 'list', {}])).toBeUndefined()
    api.get.mockResolvedValue({ data: {} })
    client = makeQueryClient()
    const r2 = run()
    await done(r2.result)
    expect(r2.result.current.data).toBeNull()
  })
})
