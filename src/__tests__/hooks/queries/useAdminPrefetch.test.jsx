import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper.jsx'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))

import { useAdminPrefetch } from '@/hooks/queries/useAdminPrefetch'
import { adminKeys } from '@/hooks/queries/queryKeys'

let client
const prefetcher = () => renderHook(() => useAdminPrefetch(), { wrapper: wrapperFor(client) }).result.current

beforeEach(() => {
  client = makeQueryClient()
  api.get.mockReset()
  localStorage.setItem('adminActiveBranch', JSON.stringify('b1'))
})

describe('useAdminPrefetch', () => {
  test('unknown paths are a no-op', () => {
    prefetcher()('/admin/unknown')
    expect(api.get).not.toHaveBeenCalled()
  })

  test('/admin/orders prefetches the merged, deduped archive under the active-branch key', async () => {
    api.get.mockImplementation((url) => Promise.resolve({
      data: { orders: url === '/orders/live' ? [{ _id: 'a' }, {}] : [{ _id: 'a' }, { orderId: 'b' }] },
    }))
    prefetcher()('/admin/orders')
    await waitFor(() => expect(client.getQueryData(['admin', 'orders', 'dine-archive', 'b1'])).toEqual([{ _id: 'a' }, { orderId: 'b' }]))
    expect(api.get).toHaveBeenCalledWith('/orders/past', { params: { limit: 200 } })
  })

  test('/admin/dashboard prefetches telemetry with the key useTelemetry uses for the same branch', async () => {
    api.get.mockResolvedValue({ data: { t: 1 } })
    prefetcher()('/admin/dashboard')
    const params = { earningsPeriod: 'daily', bookingTime: 'today', branch: 'b1' }
    await waitFor(() => expect(client.getQueryData(['admin', 'telemetry', params])).toEqual({ t: 1 }))
  })

  test.each([
    ['/admin/staff', '/staff', { staff: [{ _id: 's' }] }, () => adminKeys.staff, [{ _id: 's' }]],
    ['/admin/menu', '/categories', { data: [{ _id: 'c' }] }, () => adminKeys.categories, [{ _id: 'c' }]],
    ['/admin/menu', '/categories', { categories: [{ _id: 'd' }] }, () => adminKeys.categories, [{ _id: 'd' }]],
    ['/admin/staff', '/staff', {}, () => adminKeys.staff, []],
  ])('%s GETs %s and caches the unwrapped list', async (path, url, body, key, expected) => {
    api.get.mockResolvedValue({ data: body })
    prefetcher()(path)
    await waitFor(() => expect(client.getQueryData(key())).toEqual(expected))
    expect(api.get).toHaveBeenCalledWith(url)
  })

  test('a failing prefetch is swallowed (normal cache miss later)', async () => {
    api.get.mockRejectedValue(new Error('down'))
    expect(() => prefetcher()('/admin/staff')).not.toThrow()
    await waitFor(() => expect(api.get).toHaveBeenCalled())
  })

  // Regression (fixed 2026-10): /admin/tables prefetch writes [...adminKeys.bootstrap, branch], the key useAdminBootstrap reads.
  test('/admin/tables prefetch writes the key useAdminBootstrap reads', async () => {
    api.get.mockResolvedValue({ data: { data: { tables: [1] } } })
    prefetcher()('/admin/tables')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/bootstrap'))
    // Note: this used to wait on the bare adminKeys.bootstrap key, which only
    // the buggy prefetch wrote; it now waits on the page's key.
    await waitFor(() => expect(client.getQueryData([...adminKeys.bootstrap, 'b1'])).toBeDefined())
    // Key the Tables page will look up for the same (selected = b1) branch:
    expect(client.getQueryData([...adminKeys.bootstrap, 'b1'])).toEqual({ tables: [1] })
  })
})
