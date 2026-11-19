/**
 * api.js - 403 SUBSCRIPTION_READ_ONLY fires bd:subscription-read-only and
 * SUBSCRIPTION_BLOCKED fires bd:subscription-blocked (no toast); /auth/* does
 * not. TRIAL_EXPIRED_EVENT stays exported as an alias of the blocked event.
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

const LOCK_AT = '2026-11-04T00:00:00.000Z'
const TRIAL_END = '2026-11-01T00:00:00.000Z'
let fakeCode = 'SUBSCRIPTION_READ_ONLY'

globalThis.__fakeServer = async (config) => {
  const response = {
    data: { success: false, code: fakeCode, message: `${fakeCode} msg`, lockAt: LOCK_AT, trialEndDate: TRIAL_END },
    status: 403, statusText: '403', headers: {}, config,
  }
  return Promise.reject(new AxiosError('403', 'ERR_BAD_REQUEST', config, null, response))
}

const listen = (name) => {
  const seen = []
  const on = (e) => seen.push(e.detail)
  window.addEventListener(name, on)
  return { seen, off: () => window.removeEventListener(name, on) }
}

beforeEach(() => { toastError.mockReset(); vi.resetModules() })

describe('subscription gate 403s', () => {
  test('SUBSCRIPTION_READ_ONLY dispatches bd:subscription-read-only with lockAt, no toast', async () => {
    fakeCode = 'SUBSCRIPTION_READ_ONLY'
    const { default: api, SUBSCRIPTION_READ_ONLY_EVENT, SUBSCRIPTION_BLOCKED_EVENT } = await import('@/utils/api')
    expect(SUBSCRIPTION_READ_ONLY_EVENT).toBe('bd:subscription-read-only')
    const ro = listen(SUBSCRIPTION_READ_ONLY_EVENT)
    const bl = listen(SUBSCRIPTION_BLOCKED_EVENT)
    await expect(api.patch('/tenant/menu/1', { name: 'x' }, { _silent: true })).rejects.toMatchObject({ response: { status: 403 } })
    ro.off(); bl.off()
    expect(ro.seen).toHaveLength(1)
    expect(ro.seen[0]).toMatchObject({ code: 'SUBSCRIPTION_READ_ONLY', lockAt: LOCK_AT, trialEndDate: TRIAL_END, message: 'SUBSCRIPTION_READ_ONLY msg' })
    expect(bl.seen).toHaveLength(0)
    expect(toastError).not.toHaveBeenCalled()
  })

  test('SUBSCRIPTION_BLOCKED dispatches bd:subscription-blocked; TRIAL_EXPIRED_EVENT is its alias', async () => {
    fakeCode = 'SUBSCRIPTION_BLOCKED'
    const { default: api, SUBSCRIPTION_BLOCKED_EVENT, SUBSCRIPTION_READ_ONLY_EVENT, TRIAL_EXPIRED_EVENT } = await import('@/utils/api')
    expect(SUBSCRIPTION_BLOCKED_EVENT).toBe('bd:subscription-blocked')
    expect(TRIAL_EXPIRED_EVENT).toBe(SUBSCRIPTION_BLOCKED_EVENT)
    const bl = listen(SUBSCRIPTION_BLOCKED_EVENT)
    const ro = listen(SUBSCRIPTION_READ_ONLY_EVENT)
    await expect(api.get('/tenant/menu', { _silent: true })).rejects.toMatchObject({ response: { status: 403 } })
    bl.off(); ro.off()
    expect(bl.seen).toHaveLength(1)
    expect(bl.seen[0]).toMatchObject({ code: 'SUBSCRIPTION_BLOCKED', lockAt: LOCK_AT, trialEndDate: TRIAL_END })
    expect(ro.seen).toHaveLength(0)
    expect(toastError).not.toHaveBeenCalled()
  })

  test('login (/auth/*) errors are left to the login page', async () => {
    fakeCode = 'SUBSCRIPTION_BLOCKED'
    const { default: api, SUBSCRIPTION_BLOCKED_EVENT, SUBSCRIPTION_READ_ONLY_EVENT } = await import('@/utils/api')
    const bl = listen(SUBSCRIPTION_BLOCKED_EVENT)
    const ro = listen(SUBSCRIPTION_READ_ONLY_EVENT)
    await expect(api.post('/auth/login', {}, { _silent: true })).rejects.toBeTruthy()
    bl.off(); ro.off()
    expect(bl.seen).toHaveLength(0)
    expect(ro.seen).toHaveLength(0)
  })
})
