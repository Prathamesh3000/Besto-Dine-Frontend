import { describe, it, expect, vi, beforeEach } from 'vitest'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
import { fetchMe } from '@/utils/fetchMe'

beforeEach(() => api.get.mockReset())

describe('fetchMe', () => {
  it('calls made while one is in flight share a single request', async () => {
    api.get.mockResolvedValue({ data: { _id: 'u1' } })
    const [a, b] = await Promise.all([fetchMe('staff'), fetchMe('staff')])
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/auth/me', { _aud: 'staff' })
    expect(a).toBe(b)
  })
  it('a later call after it settles makes a fresh request', async () => {
    api.get.mockResolvedValue({ data: {} })
    await fetchMe('staff')
    await fetchMe('staff')
    expect(api.get).toHaveBeenCalledTimes(2)
  })
  it('different audiences are not shared', async () => {
    api.get.mockResolvedValue({ data: {} })
    await Promise.all([fetchMe('staff'), fetchMe('customer')])
    expect(api.get).toHaveBeenCalledTimes(2)
  })
  it('a failure rejects every sharer, then clears so the next call retries', async () => {
    api.get.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ data: {} })
    const r = await Promise.allSettled([fetchMe('staff'), fetchMe('staff')])
    expect(r.map(x => x.status)).toEqual(['rejected', 'rejected'])
    await expect(fetchMe('staff')).resolves.toBeTruthy()
  })
})
