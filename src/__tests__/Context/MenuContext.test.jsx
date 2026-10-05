import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../_helpers/queryWrapper.jsx'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const h = vi.hoisted(() => ({ socket: null, reconnect: new Set(), joinMenuRoom: null, leaveRoom: null }))
vi.mock('@/utils/socket', async () => {
  const { createFakeSocket } = await import('../_helpers/fakeSocket.js')
  h.socket = createFakeSocket()
  h.joinMenuRoom = vi.fn((id) => `t:${id}:menu`)
  h.leaveRoom = vi.fn()
  return {
    getSocket: () => h.socket,
    joinMenuRoom: (...a) => h.joinMenuRoom(...a),
    leaveRoom: (...a) => h.leaveRoom(...a),
    onSocketReconnect: (fn) => { h.reconnect.add(fn); return () => h.reconnect.delete(fn) },
  }
})

import { MenuProvider, useMenu } from '@/Context/MenuContext'
import { setActiveTenant, clearActiveTenant } from '@/utils/tenant'

let client
const mount = () => renderHook(() => useMenu(), {
  wrapper: ({ children }) => <QueryClientProvider client={client}><MenuProvider>{children}</MenuProvider></QueryClientProvider>,
})

const rawItem = { _id: 'm1', name: 'Paneer', images: ['/uploads/p.jpg'], nutritionalInfo: { calories: 300, fat: 12, protein: 20 } }
function routeGets({ menu = [rawItem], combos = [{ _id: 'c1', images: ['https://cdn/c.jpg'] }], categories = [{ _id: 'k1', image: 'https//cdn/k.jpg' }], bootstrap } = {}) {
  api.get.mockImplementation((url) => {
    if (url.startsWith('/public/menu-bootstrap')) {
      return bootstrap instanceof Error ? Promise.reject(bootstrap) : Promise.resolve({ data: { data: bootstrap } })
    }
    if (url.startsWith('/menu')) return Promise.resolve({ data: { success: true, data: menu, totalItems: menu.length } })
    if (url.startsWith('/combos')) return Promise.resolve({ data: { success: true, data: combos } })
    if (url.startsWith('/categories')) return Promise.resolve({ data: { success: true, data: categories } })
    return Promise.reject(new Error(`unexpected ${url}`))
  })
}
const staffLogin = () => {
  window.history.replaceState({}, '', '/admin/menu')
  localStorage.setItem('staff_token', 'S')
}
const calledUrls = () => api.get.mock.calls.map((c) => c[0])

beforeEach(() => {
  client = makeQueryClient()
  for (const fn of Object.values(api)) fn.mockReset()
  h.socket.reset()
  h.reconnect.clear()
  h.joinMenuRoom.mockClear()
  h.leaveRoom.mockClear()
  clearActiveTenant()
  window.history.replaceState({}, '', '/customer/home')
  routeGets()
})

describe('fetch gating', () => {
  test('no tenant and no token → nothing fetched, no socket listener', () => {
    const { result } = mount()
    expect(api.get).not.toHaveBeenCalled()
    expect(result.current.menuItems).toEqual([])
    expect(h.socket.listenerCount('menu:updated')).toBe(0)
  })

  test('staff (token) use per-section fetches and items are normalised', async () => {
    staffLogin()
    setActiveTenant({ slug: 'spice', _id: 'R1' })
    const { result } = mount()
    await waitFor(() => expect(result.current.menuItems).toHaveLength(1))
    expect(calledUrls()).toEqual(expect.arrayContaining(['/menu?limit=1000', '/combos', '/categories?status=active']))
    expect(calledUrls().some((u) => u.startsWith('/public/menu-bootstrap'))).toBe(false)
    const item = result.current.menuItems[0]
    expect(item.image).toMatch(/\/uploads\/p\.jpg$/)
    expect(item).toMatchObject({ calories: 300, fats: 12, protein: 20, fibre: 0, carbs: 0, iron: 0 })
    await waitFor(() => expect(result.current.categories[0].image).toBe('https://cdn/k.jpg'))
    expect(result.current.combos[0].image).toBe('https://cdn/c.jpg')
    expect(result.current.menuPagination.totalItems).toBe(1)
  })

  test('anonymous customer uses the single bootstrap call, not the three per-section calls', async () => {
    setActiveTenant({ slug: 'spice', _id: 'R1' })
    routeGets({ bootstrap: { menu: [rawItem], combos: [], categories: [{ _id: 'k' }] } })
    const { result } = mount()
    await waitFor(() => expect(result.current.menuItems).toHaveLength(1))
    expect(calledUrls()).toEqual(['/public/menu-bootstrap?slug=spice'])
    expect(result.current.menuItems[0].fats).toBe(12)
    expect(result.current.categories).toHaveLength(1)
    expect(result.current.menuLoading).toBe(false)
  })

  test('anonymous customer falls back to per-section fetches when bootstrap fails (after its 2 retries)', { timeout: 15000 }, async () => {
    setActiveTenant({ slug: 'spice' })
    routeGets({ bootstrap: new Error('cold start') })
    const { result } = mount()
    await waitFor(() => expect(calledUrls()).toContain('/menu?limit=1000'), { timeout: 8000 })
    await waitFor(() => expect(result.current.menuItems).toHaveLength(1))
  })

  test('unsuccessful envelopes yield empty lists', async () => {
    staffLogin()
    setActiveTenant({ slug: 's' })
    api.get.mockResolvedValue({ data: { success: false } })
    const { result } = mount()
    await waitFor(() => expect(result.current.menuLoading).toBe(false))
    expect(result.current.menuItems).toEqual([])
    expect(result.current.combos).toEqual([])
  })
})

describe('tenant scoping', () => {
  test('cache keys include the tenant slug and a tenant switch drops the old tenant\'s caches', async () => {
    staffLogin()
    setActiveTenant({ slug: 'a', _id: 'RA' })
    const { result } = mount()
    await waitFor(() => expect(result.current.menuItems).toHaveLength(1))
    expect(client.getQueryData(['menu', 'a', 'list', {}])).toBeDefined()
    routeGets({ menu: [{ _id: 'b-item' }] })
    act(() => { setActiveTenant({ slug: 'b', _id: 'RB' }) })
    expect(client.getQueryData(['menu', 'a', 'list', {}])).toBeUndefined()
    await waitFor(() => expect(result.current.menuItems.map((i) => i._id)).toEqual(['b-item']))
  })

  test('joins the tenant menu room and leaves it on tenant switch', async () => {
    setActiveTenant({ slug: 'a', _id: 'RA' })
    mount()
    expect(h.joinMenuRoom).toHaveBeenCalledWith('RA')
    act(() => { setActiveTenant({ slug: 'b', _id: 'RB' }) })
    expect(h.leaveRoom).toHaveBeenCalledWith('t:RA:menu')
    expect(h.joinMenuRoom).toHaveBeenLastCalledWith('RB')
  })
})

describe('live menu updates', () => {
  test('a burst of menu:updated pings is debounced into one invalidation after 300ms', async () => {
    staffLogin()
    setActiveTenant({ slug: 'a', _id: 'RA' })
    const { unmount } = mount()
    vi.useFakeTimers()
    const spy = vi.spyOn(client, 'invalidateQueries')
    act(() => { h.socket.serverEmit('menu:updated'); h.socket.serverEmit('menu:updated'); h.socket.serverEmit('menu:updated') })
    act(() => { vi.advanceTimersByTime(299) })
    expect(spy).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(spy.mock.calls.map((c) => c[0].queryKey)).toEqual([['public', 'menu-bootstrap'], ['menu'], ['combos']])
    unmount()
    expect(h.socket.listenerCount('menu:updated')).toBe(0)
    expect(h.reconnect.size).toBe(0)
  })

  test('a socket reconnect also resyncs', async () => {
    staffLogin()
    setActiveTenant({ slug: 'a', _id: 'RA' })
    mount()
    vi.useFakeTimers()
    const spy = vi.spyOn(client, 'invalidateQueries')
    act(() => { h.reconnect.forEach((fn) => fn()); vi.advanceTimersByTime(300) })
    expect(spy).toHaveBeenCalled()
  })
})

describe('imperative fetch + CRUD', () => {
  const ready = async () => {
    staffLogin()
    setActiveTenant({ slug: 'a', _id: 'RA' })
    const r = mount()
    await waitFor(() => expect(r.result.current.menuItems).toHaveLength(1))
    return r
  }

  test('fetchMenuItems(params) builds the query string, skips empty params and can append', async () => {
    const { result } = await ready()
    api.get.mockResolvedValueOnce({ data: { success: true, data: [{ _id: 'f1' }], totalItems: 2, totalPages: 2 } })
    await act(async () => { await result.current.fetchMenuItems({ category: 'Pizza', q: '', page: 1 }) })
    expect(api.get).toHaveBeenLastCalledWith('/menu?category=Pizza&page=1')
    api.get.mockResolvedValueOnce({ data: { success: true, data: [{ _id: 'f2' }] } })
    await act(async () => { await result.current.fetchMenuItems({ page: 2 }, true) })
    expect(result.current.menuItems.map((i) => i._id)).toEqual(['f1', 'f2'])
    expect(result.current.menuPagination.totalPages).toBe(1)
  })

  test('fetchMenuItems surfaces the server error message; default call resets to the query data', async () => {
    const { result } = await ready()
    api.get.mockRejectedValueOnce({ response: { data: { message: 'Nope' } } })
    await act(async () => { await result.current.fetchMenuItems({ page: 9 }) })
    expect(result.current.menuError).toBe('Nope')
    await act(async () => { await result.current.fetchMenuItems() })
    expect(result.current.menuError).toBeNull()
    expect(result.current.menuItems[0]._id).toBe('m1')
  })

  test('fetchCombos(params) and its error path', async () => {
    const { result } = await ready()
    api.get.mockResolvedValueOnce({ data: { success: true, data: [{ _id: 'cx' }] } })
    await act(async () => { await result.current.fetchCombos({ page: 1 }) })
    expect(result.current.combos[0]._id).toBe('cx')
    api.get.mockRejectedValueOnce(new Error('x'))
    await act(async () => { await result.current.fetchCombos({ page: 2 }) })
    expect(result.current.comboError).toBe('Failed to fetch combos')
    await act(async () => { await result.current.fetchCombos() })
    expect(result.current.comboError).toBeNull()
  })

  test('create / update / toggle / delete keep the cached list in sync', async () => {
    const { result } = await ready()
    api.post.mockResolvedValue({ data: { success: true, data: { _id: 'm2', name: 'New' } } })
    await act(async () => { await result.current.createMenuItem({ name: 'New' }) })
    await waitFor(() => expect(result.current.menuItems.map((i) => i._id)).toEqual(['m1', 'm2']))

    api.put.mockResolvedValue({ data: { success: true, data: { _id: 'm1', name: 'Renamed', status: 'archived' } } })
    await act(async () => { await result.current.updateMenuItem('m1', { name: 'Renamed' }) })
    await waitFor(() => expect(result.current.menuItems[0].name).toBe('Renamed'))
    await act(async () => { await result.current.toggleMenuItemStatus('m1', 'active') })
    expect(api.put).toHaveBeenLastCalledWith('/menu/m1', { status: 'archived' })

    api.delete.mockResolvedValue({ data: { success: true } })
    await act(async () => { await result.current.deleteMenuItem('m2') })
    await waitFor(() => expect(result.current.menuItems.map((i) => i._id)).toEqual(['m1']))
  })

  test('combo CRUD keeps the combo list in sync', async () => {
    const { result } = await ready()
    await waitFor(() => expect(result.current.combos).toHaveLength(1))
    api.post.mockResolvedValue({ data: { success: true, data: { _id: 'c2' } } })
    await act(async () => { await result.current.createCombo({}) })
    api.put.mockResolvedValue({ data: { success: true, data: { _id: 'c1', name: 'X' } } })
    await act(async () => { await result.current.updateCombo('c1', {}) })
    await act(async () => { await result.current.toggleComboStatus('c1', 'archived') })
    expect(api.put).toHaveBeenLastCalledWith('/combos/c1', { status: 'active' })
    api.delete.mockResolvedValue({ data: { success: true } })
    await act(async () => { await result.current.deleteCombo('c2') })
    await waitFor(() => expect(result.current.combos.map((c) => c._id)).toEqual(['c1']))
    expect(result.current.combos[0].name).toBe('X')
  })

  test('uploadImage returns the resolved URL and throws on failure', async () => {
    const { result } = await ready()
    api.post.mockResolvedValueOnce({ data: { success: true, url: 'https://cdn/x.jpg' } })
    await expect(result.current.uploadImage(new Blob(['x']))).resolves.toBe('https://cdn/x.jpg')
    api.post.mockResolvedValueOnce({ data: { success: false } })
    await expect(result.current.uploadImage(new Blob(['x']))).rejects.toThrow('Upload failed')
  })

  test('refreshAll and fetchCategories(true) invalidate tenant-scoped keys', async () => {
    const { result } = await ready()
    const spy = vi.spyOn(client, 'invalidateQueries')
    act(() => result.current.refreshAll())
    await act(async () => { await result.current.fetchCategories(true); await result.current.fetchCategories() })
    expect(spy.mock.calls.map((c) => c[0].queryKey)).toEqual([['menu', 'a'], ['combos', 'a'], ['categories', 'a'], ['categories', 'a']])
  })
})

describe('useMenu guard', () => {
  test('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useMenu())).toThrow('useMenu must be used within a <MenuProvider>')
  })
})
