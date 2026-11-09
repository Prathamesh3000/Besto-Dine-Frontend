/**
 * api.js - 403 TRIAL_EXPIRED fires bd:trial-expired (no toast); /auth/* does not.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'

const toastError = vi.fn()
vi.mock('react-hot-toast', () => ({ toast: { error: (...a) => toastError(...a) }, default: {} }))
vi.mock('@/utils/upgradePromptBus', () => ({ openUpgradePrompt: vi.fn(), subscribeUpgradePrompt: () => () => {} }))
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal()
  const real = actual.default
  const create = (cfg = {}) => real.create({ ...cfg, adapter: (c) => globalThis.__fakeServer(c) })
  return { ...actual, default: { ...real, create } }
})

import { AxiosError } from 'axios'

globalThis.__fakeServer = async (config) => {
  const response = {
    data: { success: false, code: 'TRIAL_EXPIRED', message: 'Your free trial has ended.', trialEndDate: '2026-11-01T00:00:00.000Z' },
    status: 403, statusText: '403', headers: {}, config,
  }
  return Promise.reject(new AxiosError('403', 'ERR_BAD_REQUEST', config, null, response))
}

beforeEach(() => { toastError.mockReset() })

describe('TRIAL_EXPIRED 403', () => {
  test('dispatches bd:trial-expired with the end date and shows no toast', async () => {
    vi.resetModules()
    const { default: api, TRIAL_EXPIRED_EVENT } = await import('@/utils/api')
    const seen = []
    const on = (e) => seen.push(e.detail)
    window.addEventListener(TRIAL_EXPIRED_EVENT, on)
    await expect(api.get('/tenant/menu', { _silent: true })).rejects.toMatchObject({ response: { status: 403 } })
    window.removeEventListener(TRIAL_EXPIRED_EVENT, on)
    expect(seen).toHaveLength(1)
    expect(seen[0].trialEndDate).toBe('2026-11-01T00:00:00.000Z')
    expect(toastError).not.toHaveBeenCalled()
  })

  test('login (/auth/*) errors are left to the login page', async () => {
    vi.resetModules()
    const { default: api, TRIAL_EXPIRED_EVENT } = await import('@/utils/api')
    const seen = []
    const on = (e) => seen.push(e)
    window.addEventListener(TRIAL_EXPIRED_EVENT, on)
    await expect(api.post('/auth/login', {}, { _silent: true })).rejects.toBeTruthy()
    window.removeEventListener(TRIAL_EXPIRED_EVENT, on)
    expect(seen).toHaveLength(0)
  })
})
