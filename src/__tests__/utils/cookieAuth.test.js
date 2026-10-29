/**
 * 3A.4 — cookie-session mode (VITE_USE_COOKIE_AUTH): storage mode switch,
 * credentials + CSRF header, refresh-on-401 from the cookie. Default (flag
 * off) behaviour is pinned too. No real network: axios.create is wrapped so
 * every instance routes through an in-test fake server.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn() }, default: {} }))
vi.mock('@/utils/upgradePromptBus', () => ({ openUpgradePrompt: vi.fn(), subscribeUpgradePrompt: () => () => {} }))

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal()
  const real = actual.default
  const create = (cfg = {}) => real.create({ ...cfg, adapter: (c) => globalThis.__cookieFake(c) })
  return { ...actual, default: { ...real, create } }
})
import { AxiosError } from 'axios'

let routes
let requests
const reply = (config, status, data = {}) => {
  const response = { data, status, statusText: String(status), headers: {}, config }
  return status >= 400
    ? Promise.reject(new AxiosError(`Request failed ${status}`, 'ERR_BAD_REQUEST', config, null, response))
    : Promise.resolve(response)
}
globalThis.__cookieFake = async (config) => {
  const method = (config.method || 'get').toLowerCase()
  const headers = typeof config.headers?.toJSON === 'function' ? config.headers.toJSON() : { ...config.headers }
  requests.push({ method, url: config.url, headers, data: config.data, withCredentials: !!config.withCredentials })
  const h = routes.find((r) => r.method === method && r.url === config.url)
  return h ? h.fn(config, headers) : reply(config, 404, {})
}
const on = (method, url, fn) => routes.push({ method, url, fn })

async function load({ flag } = {}) {
  vi.resetModules()
  vi.unstubAllEnvs()
  if (flag !== undefined) vi.stubEnv('VITE_USE_COOKIE_AUTH', flag)
  const storage = await import('@/utils/authStorage')
  const api = await import('@/utils/api')
  return { storage, api }
}

beforeEach(() => {
  routes = []; requests = []
  localStorage.clear(); sessionStorage.clear()
  window.history.pushState({}, '', '/admin')
})
afterEach(() => { vi.unstubAllEnvs(); window.history.pushState({}, '', '/') })

describe('storage mode switch', () => {
  test('flag defaults OFF', async () => {
    const { storage } = await load()
    expect(storage.cookieAuthRequested()).toBe(false)
  })

  test('legacy setAuth stores the token pair and no cookie marker', async () => {
    const { storage } = await load()
    storage.setAuth('JWT', { _id: 'u1', role: 'admin' }, 'staff', 'RT')
    expect(localStorage.getItem('staff_token')).toBe('JWT')
    expect(localStorage.getItem('staff_refresh_token')).toBe('RT')
    expect(localStorage.getItem('staff_cookie_session')).toBeNull()
    expect(storage.getToken('staff')).toBe('JWT')
    expect(storage.isCookieSession('staff')).toBe(false)
  })

  test('cookie setAuth writes NO token to localStorage, only the user and a non-secret marker', async () => {
    const { storage } = await load({ flag: 'true' })
    localStorage.setItem('staff_token', 'OLD')   // a leftover legacy token must be removed
    storage.setAuth(undefined, { _id: 'u1', role: 'admin' }, 'staff', undefined,
      { csrfToken: 'C1', accessExpiresAt: 111, sessionExpiresAt: 222 })
    expect(localStorage.getItem('staff_token')).toBeNull()
    expect(localStorage.getItem('staff_refresh_token')).toBeNull()
    expect(JSON.parse(localStorage.getItem('staff_user')).role).toBe('admin')
    expect(JSON.parse(localStorage.getItem('staff_cookie_session'))).toEqual({ accessExpiresAt: 111, sessionExpiresAt: 222 })
    // signed-in checks keep working through the sentinel; it is never a bearer string
    expect(storage.getToken('staff')).toBe(storage.COOKIE_SESSION)
    expect(storage.getRefreshToken('staff')).toBe(storage.COOKIE_SESSION)
    expect(storage.realToken(storage.getToken('staff'))).toBeNull()
    expect(sessionStorage.getItem('bd_csrf')).toBe('C1')
    expect(Object.keys(localStorage).join()).not.toMatch(/C1/)
  })

  test('clearAuth removes the cookie marker; switching back to legacy removes it too', async () => {
    const { storage } = await load({ flag: 'true' })
    storage.setAuth(undefined, { role: 'admin' }, 'staff', undefined, { csrfToken: 'C' })
    storage.clearAuth('staff')
    expect(storage.getToken('staff')).toBeNull()
    storage.setAuth(undefined, { role: 'admin' }, 'staff', undefined, { csrfToken: 'C' })
    storage.setAuth('JWT', { role: 'admin' }, 'staff', 'RT')
    expect(storage.isCookieSession('staff')).toBe(false)
    expect(storage.getToken('staff')).toBe('JWT')
  })
})

describe('api.js with the flag OFF (default)', () => {
  test('bearer header, no credentials, no cookie headers, no CSRF', async () => {
    const { storage, api } = await load()
    storage.setAuth('JWT', { role: 'admin' }, 'staff', 'RT')
    on('post', '/orders', (c) => reply(c, 200, { ok: true }))
    await api.default.post('/orders', {})
    const r = requests[0]
    expect(r.headers.Authorization).toBe('Bearer JWT')
    expect(r.headers['X-Auth-Mode']).toBeUndefined()
    expect(r.headers['X-CSRF-Token']).toBeUndefined()
    expect(r.withCredentials).toBe(false)
  })
})

describe('api.js with VITE_USE_COOKIE_AUTH=true', () => {
  test('cookie session: credentials sent, audience + mode headers, CSRF on unsafe methods, no Authorization', async () => {
    const { storage, api } = await load({ flag: 'true' })
    storage.setAuth(undefined, { role: 'admin' }, 'staff', undefined, { csrfToken: 'CSRF1' })
    on('post', '/orders', (c) => reply(c, 200, {}))
    on('get', '/menu', (c) => reply(c, 200, {}))
    await api.default.post('/orders', {})
    await api.default.get('/menu')
    const [post, get] = requests
    expect(post.withCredentials).toBe(true)
    expect(post.headers.Authorization).toBeUndefined()
    expect(post.headers['X-Auth-Audience']).toBe('staff')
    expect(post.headers['X-Auth-Mode']).toBe('cookie')
    expect(post.headers['X-CSRF-Token']).toBe('CSRF1')
    expect(get.headers['X-CSRF-Token']).toBeUndefined()   // safe method
  })

  test('server answered with tokens (backend flag off): legacy bearer path still works', async () => {
    const { storage, api } = await load({ flag: 'true' })
    storage.setAuth('JWT', { role: 'admin' }, 'staff', 'RT')   // no cookieMeta
    on('post', '/orders', (c) => reply(c, 200, {}))
    await api.default.post('/orders', {})
    expect(requests[0].headers.Authorization).toBe('Bearer JWT')
    expect(requests[0].headers['X-CSRF-Token']).toBeUndefined()
  })

  test('401 -> refresh from the cookie (no refreshToken in the body, CSRF header) -> original call retried', async () => {
    const { storage, api } = await load({ flag: 'true' })
    storage.setAuth(undefined, { role: 'admin' }, 'staff', undefined, { csrfToken: 'CSRF1', accessExpiresAt: Date.now() + 3600e3 })
    let first = true
    on('get', '/orders/live', (c) => {
      if (first) { first = false; return reply(c, 401, { message: 'expired' }) }
      return reply(c, 200, { rows: [1] })
    })
    on('post', '/auth/refresh', (c) => reply(c, 200, { success: true, cookieAuth: true, csrfToken: 'CSRF2', accessExpiresAt: Date.now() + 1800e3, sessionExpiresAt: Date.now() + 9e6 }))
    const res = await api.default.get('/orders/live')
    expect(res.data.rows).toEqual([1])
    const refresh = requests.find((r) => r.url === '/auth/refresh')
    expect(refresh.withCredentials).toBe(true)
    expect(JSON.parse(refresh.data)).toEqual({})
    expect(refresh.headers['X-CSRF-Token']).toBe('CSRF1')
    expect(refresh.headers['X-Auth-Audience']).toBe('staff')
    expect(requests.filter((r) => r.url === '/orders/live')).toHaveLength(2)
    expect(sessionStorage.getItem('bd_csrf')).toBe('CSRF2')
    expect(localStorage.getItem('staff_token')).toBeNull()
  })

  test('stale CSRF token (403 CSRF_INVALID): fetches a fresh one and retries once', async () => {
    const { storage, api } = await load({ flag: 'true' })
    storage.setAuth(undefined, { role: 'admin' }, 'staff', undefined, { csrfToken: 'OLD' })
    let posts = 0
    on('post', '/orders', (c, h) => {
      posts += 1
      return h['X-CSRF-Token'] === 'NEW' ? reply(c, 200, { ok: 1 }) : reply(c, 403, { code: 'CSRF_INVALID' })
    })
    on('get', '/auth/csrf', (c) => reply(c, 200, { success: true, enabled: true, csrfToken: 'NEW' }))
    const res = await api.default.post('/orders', {}, { _silent: true })
    expect(res.data.ok).toBe(1)
    expect(posts).toBe(2)
  })
})
