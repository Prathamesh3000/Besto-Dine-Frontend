import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper.jsx'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))

const h = vi.hoisted(() => ({ socket: null, branch: { selectedBranchId: null } }))
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
vi.mock('@/Context/AdminBranchContext', () => ({ useAdminBranch: () => h.branch }))

import { useAdminBootstrap } from '@/hooks/queries/useAdminBootstrap'
import { adminKeys } from '@/hooks/queries/queryKeys'

let client
const run = (opts) => renderHook(() => useAdminBootstrap(opts), { wrapper: wrapperFor(client) })
const done = async (r) => { await waitFor(() => expect(r.current.isSuccess || r.current.isError).toBe(true)) }
const data = { tables: [1], areas: [2], reservations: [3], staff: [4], settings: { s: 1 } }

beforeEach(() => {
  client = makeQueryClient()
  h.socket.reset()
  h.branch = { selectedBranchId: null }
  api.get.mockReset()
  api.get.mockResolvedValue({ data: { data } })
})

describe('useAdminBootstrap', () => {
  test('all sections, all branches → bare endpoint and a key ending in "all"', async () => {
    const { result } = run()
    await done(result)
    expect(api.get).toHaveBeenCalledWith('/admin/bootstrap')
    expect(client.getQueryData([...adminKeys.bootstrap, 'all'])).toEqual(data)
  })

  test('selected branch + sorted sections are sent and part of the key', async () => {
    h.branch = { selectedBranchId: 'b1' }
    const { result } = run({ sections: ['tables', 'areas'] })
    await done(result)
    expect(api.get).toHaveBeenCalledWith('/admin/bootstrap?sections=areas%2Ctables&branch=b1')
    expect(client.getQueryData([...adminKeys.bootstrap, 'areas,tables', 'b1'])).toEqual(data)
  })

  test('switching branch is a different cache entry (no stale all-branch paint)', async () => {
    const a = run()
    await done(a.result)
    h.branch = { selectedBranchId: 'b2' }
    const b = run()
    await done(b.result)
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  test('hydrates per-section caches from the bootstrap payload', async () => {
    const { result } = run()
    await done(result)
    expect(client.getQueryData(adminKeys.tables)).toEqual([1])
    expect(client.getQueryData(adminKeys.areas)).toEqual([2])
    expect(client.getQueryData(adminKeys.reservations)).toEqual([3])
    expect(client.getQueryData(adminKeys.staff)).toEqual([4])
    expect(client.getQueryData(adminKeys.settings)).toEqual({ s: 1 })
  })

  test('missing data → {} and nothing hydrated', async () => {
    api.get.mockResolvedValue({ data: {} })
    const { result } = run()
    await done(result)
    expect(result.current.data).toEqual({})
    expect(client.getQueryData(adminKeys.tables)).toBeUndefined()
  })

  test('enabled:false does not fetch', () => {
    run({ enabled: false })
    expect(api.get).not.toHaveBeenCalled()
  })

  test.each([
    ['table:updated', [adminKeys.tables, adminKeys.bootstrap]],
    ['order:new', [adminKeys.tables, adminKeys.orders.live]],
    ['order:updated', [adminKeys.tables, adminKeys.orders.live]],
    ['settings:updated', [adminKeys.settings, adminKeys.bootstrap]],
  ])('socket %s invalidates only its slices', async (ev, keys) => {
    const { result } = run()
    await done(result)
    const spy = vi.spyOn(client, 'invalidateQueries')
    act(() => h.socket.serverEmit(ev))
    expect(spy.mock.calls.map((c) => c[0].queryKey)).toEqual(keys)
  })

  test('re-renders keep exactly one listener per event and unmount removes them all', async () => {
    const { rerender, unmount } = run()
    rerender(); rerender()
    for (const ev of ['table:updated', 'order:new', 'order:updated', 'settings:updated']) {
      expect(h.socket.listenerCount(ev)).toBe(1)
    }
    unmount()
    expect(h.socket.totalListeners()).toBe(0)
  })
})
