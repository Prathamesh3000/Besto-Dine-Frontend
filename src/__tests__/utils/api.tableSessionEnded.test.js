/**
 * api.js — 401 TABLE_SESSION_ENDED (staff freed the diner's table).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

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

let requests
globalThis.__fakeServer = async (config) => {
  const headers = typeof config.headers?.toJSON === 'function' ? config.headers.toJSON() : { ...config.headers }
  requests.push({ method: (config.method || 'get').toLowerCase(), url: config.url, headers })
  const response = { data: { code: 'TABLE_SESSION_ENDED', message: 'ended' }, status: 401, statusText: '401', headers: {}, config }
  return Promise.reject(new AxiosError('401', 'ERR_BAD_REQUEST', config, null, response))
}

const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (p) => `h.${b64url(p)}.s`

beforeEach(() => {
  requests = []
  toastError.mockReset()
  window.history.pushState({}, '', '/customer/menu')
})
afterEach(() => { window.history.pushState({}, '', '/') })

describe('TABLE_SESSION_ENDED 401', () => {
  test('dispatches bd:table-session-ended once (debounced), no refresh, no toast, no redirect', async () => {
    localStorage.setItem('token', jwt({ sub: 'c', exp: Math.floor(Date.now() / 1000) + 3600 }))
    localStorage.setItem('refreshToken', 'rt')
    localStorage.setItem('scanToken', 'scan')
    vi.resetModules()
    const { default: api } = await import('@/utils/api')
    const events = []
    const on = (e) => events.push(e.detail)
    window.addEventListener('bd:table-session-ended', on)

    await expect(api.get('/menu')).rejects.toMatchObject({ response: { status: 401 } })
    await expect(api.get('/menu2')).rejects.toMatchObject({ response: { status: 401 } })
    window.removeEventListener('bd:table-session-ended', on)

    expect(events).toEqual([{ reason: 'table-freed' }])
    expect(requests.map((r) => r.url)).toEqual(['/menu', '/menu2'])   // no /auth/refresh, no retry
    expect(toastError).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).not.toBeNull()
    expect(window.location.pathname).toBe('/customer/menu')
  })
})
