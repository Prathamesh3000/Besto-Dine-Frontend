/**
 * api.js — axios instance behaviour. No real network: axios.create is
 * wrapped so every instance (the app `api` AND the private refresh client)
 * routes through `server`, an in-test fake that records requests.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const toastError = vi.fn()
vi.mock('react-hot-toast', () => ({ toast: { error: (...a) => toastError(...a) }, default: {} }))

const upgradeSpy = vi.fn()
vi.mock('@/utils/upgradePromptBus', () => ({
  openUpgradePrompt: (...a) => upgradeSpy(...a),
  subscribeUpgradePrompt: () => () => {},
}))

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal()
  const real = actual.default
  const create = (cfg = {}) => real.create({ ...cfg, adapter: (c) => globalThis.__fakeServer(c) })
  return { ...actual, default: { ...real, create } }
})

import { AxiosError } from 'axios'

// ── fake server ──────────────────────────────────────────────────────────────
let routes
let requests
function reply(config, status, data = {}) {
  const response = { data, status, statusText: String(status), headers: {}, config }
  if (status >= 400) {
    return Promise.reject(new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response))
  }
  return Promise.resolve(response)
}
globalThis.__fakeServer = async (config) => {
  const method = (config.method || 'get').toLowerCase()
  const path = config.url
  const headers = typeof config.headers?.toJSON === 'function' ? config.headers.toJSON() : { ...config.headers }
  requests.push({ method, url: path, headers, params: config.params, data: config.data })
  const handler = routes.find((r) => r.method === method && (r.url instanceof RegExp ? r.url.test(path) : r.url === path))
  if (!handler) return reply(config, 404, { message: `no route ${method} ${path}` })
  return handler.fn(config, headers)
}
const on = (method, url, fn) => routes.push({ method, url, fn })

// ── helpers ──────────────────────────────────────────────────────────────────
const b64url = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload) => `h.${b64url(payload)}.s`
const farExp = () => Math.floor(Date.now() / 1000) + 3600
const tokenFor = (name, exp = farExp()) => jwt({ sub: name, exp })
const go = (path) => window.history.pushState({}, '', path)

async function loadApi() {
  vi.resetModules()
  return import('@/utils/api')
}

beforeEach(() => {
  routes = []
  requests = []
  toastError.mockReset()
  upgradeSpy.mockReset()
  go('/')
})
afterEach(() => {
  go('/')
})

describe('request interceptor — headers', () => {
  test('staff route sends the staff token; customer route sends the customer token', async () => {
    localStorage.setItem('staff_token', tokenFor('staff'))
    localStorage.setItem('token', tokenFor('cust'))
    const { default: api } = await loadApi()
    on('get', '/x', (c) => reply(c, 200, {}))

    go('/admin/dashboard')
    await api.get('/x', { _skipAdminBranchParam: true })
    go('/customer/home')
    await api.get('/x')

    expect(requests[0].headers.Authorization).toBe(`Bearer ${localStorage.getItem('staff_token')}`)
    expect(requests[1].headers.Authorization).toBe(`Bearer ${localStorage.getItem('token')}`)
  })

  test('no token → no Authorization header', async () => {
    const { default: api } = await loadApi()
    on('get', '/x', (c) => reply(c, 200))
    await api.get('/x')
    expect(requests[0].headers.Authorization).toBeUndefined()
  })

  test('tenant slug, branch id and scan token headers are attached', async () => {
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'spice', branch: { _id: 'b1' } }))
    localStorage.setItem('scanToken', 'scan-jwt')
    const { default: api } = await loadApi()
    on('get', '/menu', (c) => reply(c, 200))
    await api.get('/menu')
    expect(requests[0].headers).toMatchObject({
      'X-Restaurant-Slug': 'spice', 'X-Branch-Id': 'b1', 'X-Scan-Token': 'scan-jwt',
    })
  })

  test('_skipBranchHeader suppresses X-Branch-Id only', async () => {
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'spice', branch: { _id: 'b1' } }))
    const { default: api } = await loadApi()
    on('get', '/landing', (c) => reply(c, 200))
    await api.get('/landing', { _skipBranchHeader: true })
    expect(requests[0].headers['X-Branch-Id']).toBeUndefined()
    expect(requests[0].headers['X-Restaurant-Slug']).toBe('spice')
  })

  test.each([
    ['JSON object blob', JSON.stringify({ _id: 'B9' }), 'B9'],
    ['JSON string', JSON.stringify('B8'), 'B8'],
    ['legacy plain string', 'B7', 'B7'],
  ])('admin branch switcher (%s) adds ?branch & branchScope to authed GETs', async (_n, raw, id) => {
    localStorage.setItem('staff_token', tokenFor('staff'))
    localStorage.setItem('adminActiveBranch', raw)
    const { default: api } = await loadApi()
    on('get', '/bookings', (c) => reply(c, 200))
    go('/admin/bookings')
    await api.get('/bookings')
    expect(requests[0].params).toEqual({ branch: id, branchScope: 'auto' })
  })

  test('admin branch param is not added to mutations, explicit branch, or opted-out calls', async () => {
    localStorage.setItem('staff_token', tokenFor('staff'))
    localStorage.setItem('adminActiveBranch', 'B7')
    const { default: api } = await loadApi()
    on('post', '/x', (c) => reply(c, 200))
    on('get', /^\/x/, (c) => reply(c, 200))
    go('/admin/x')
    await api.post('/x', {})
    await api.get('/x', { params: { branch: 'mine' } })
    await api.get('/x?branch=mine')
    await api.get('/x', { _skipAdminBranchParam: true })
    expect(requests.map((r) => r.params?.branchScope)).toEqual([undefined, undefined, undefined, undefined])
    expect(requests[1].params).toEqual({ branch: 'mine' })
  })

  test('identity switched in another tab → request blocked locally with ERR_SESSION_CHANGED', async () => {
    const auth = await import('@/utils/authStorage')
    localStorage.setItem('staff_token', tokenFor('a'))
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'other' }))
    const { default: api } = await loadApi()
    const authFresh = await import('@/utils/authStorage')
    authFresh.setTabIdentity('staff', { _id: 'me' })
    on('get', '/x', (c) => reply(c, 200))
    go('/admin/x')
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'ERR_SESSION_CHANGED' })
    expect(requests).toHaveLength(0)
    expect(toastError).not.toHaveBeenCalled()
    auth.clearTabIdentity('staff')
  })
})

describe('401 → refresh token flow', () => {
  function seedStaff() {
    localStorage.setItem('staff_token', tokenFor('old'))
    localStorage.setItem('staff_refresh_token', 'r-old')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'u1', role: 'admin' }))
    go('/admin/orders')
  }
  const fresh = tokenFor('new')

  test('a 401 refreshes once and retries the original request with the new token', async () => {
    seedStaff()
    const { default: api } = await loadApi()
    on('post', '/auth/refresh', (c) => reply(c, 200, { token: fresh, refreshToken: 'r-new' }))
    on('get', '/orders', (c, h) => (h.Authorization === `Bearer ${fresh}` ? reply(c, 200, { ok: 1 }) : reply(c, 401)))

    const res = await api.get('/orders', { _skipAdminBranchParam: true })

    expect(res.data).toEqual({ ok: 1 })
    expect(requests.map((r) => r.url)).toEqual(['/orders', '/auth/refresh', '/orders'])
    expect(JSON.parse(requests[1].data)).toEqual({ refreshToken: 'r-old' })
    expect(localStorage.getItem('staff_token')).toBe(fresh)
    expect(localStorage.getItem('staff_refresh_token')).toBe('r-new')
  })

  test('concurrent 401s share a single in-flight refresh', async () => {
    seedStaff()
    const { default: api } = await loadApi()
    let release
    const gate = new Promise((r) => { release = r })
    on('post', '/auth/refresh', async (c) => { await gate; return reply(c, 200, { token: fresh, refreshToken: 'r-new' }) })
    on('get', /^\/(a|b|c)$/, (c, h) => (h.Authorization === `Bearer ${fresh}` ? reply(c, 200, c.url) : reply(c, 401)))

    const all = Promise.all(['/a', '/b', '/c'].map((u) => api.get(u, { _skipAdminBranchParam: true })))
    await vi.waitFor(() => expect(requests.filter((r) => r.url === '/auth/refresh')).toHaveLength(1))
    release()
    const results = await all

    expect(results.map((r) => r.data)).toEqual(['/a', '/b', '/c'])
    expect(requests.filter((r) => r.url === '/auth/refresh')).toHaveLength(1)
  })

  test('retry that 401s again is not retried a second time (no infinite loop)', async () => {
    seedStaff()
    const { default: api } = await loadApi()
    on('post', '/auth/refresh', (c) => reply(c, 200, { token: fresh, refreshToken: 'r-new' }))
    on('get', '/orders', (c) => reply(c, 401))

    await expect(api.get('/orders', { _skipAdminBranchParam: true })).rejects.toMatchObject({ response: { status: 401 } })

    expect(requests.filter((r) => r.url === '/orders')).toHaveLength(2)
    expect(requests.filter((r) => r.url === '/auth/refresh')).toHaveLength(1)
    // Session is torn down after the retried request still fails.
    expect(localStorage.getItem('staff_token')).toBeNull()
  })

  test('refresh rejected by the server → staff logged out (tokens cleared)', async () => {
    seedStaff()
    const { default: api } = await loadApi()
    on('post', '/auth/refresh', (c) => reply(c, 401, { message: 'expired' }))
    on('get', '/orders', (c) => reply(c, 401))

    await expect(api.get('/orders', { _skipAdminBranchParam: true })).rejects.toBeTruthy()

    expect(localStorage.getItem('staff_token')).toBeNull()
    expect(localStorage.getItem('staff_refresh_token')).toBeNull()
    expect(localStorage.getItem('staff_user')).toBeNull()
  })

  test('network failure during refresh keeps the session (flaky Wi-Fi must not log out)', async () => {
    seedStaff()
    const { default: api } = await loadApi()
    on('post', '/auth/refresh', (c) => Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', c)))
    on('get', '/orders', (c) => reply(c, 401))

    await expect(api.get('/orders', { _skipAdminBranchParam: true })).rejects.toBeTruthy()
    expect(localStorage.getItem('staff_token')).not.toBeNull()
    expect(localStorage.getItem('staff_refresh_token')).toBe('r-old')
  })

  test('refresh rotated by another tab while in flight → reuse that tab\'s token', async () => {
    seedStaff()
    const { default: api } = await loadApi()
    on('post', '/auth/refresh', (c) => {
      // other tab wins the race and rotates the pair
      localStorage.setItem('staff_refresh_token', 'r-other')
      localStorage.setItem('staff_token', fresh)
      return reply(c, 401, { message: 'reused' })
    })
    on('get', '/orders', (c, h) => (h.Authorization === `Bearer ${fresh}` ? reply(c, 200, 'ok') : reply(c, 401)))
    const res = await api.get('/orders', { _skipAdminBranchParam: true })
    expect(res.data).toBe('ok')
    expect(localStorage.getItem('staff_token')).toBe(fresh)
  })

  test.each(['/auth/login', '/auth/refresh', '/auth/verify-otp', '/auth/logout'])(
    '401 from credential endpoint %s never triggers a refresh', async (url) => {
      seedStaff()
      const { default: api } = await loadApi()
      on('post', url, (c) => reply(c, 401, { message: 'bad creds' }))
      on('post', '/auth/refresh', (c) => reply(c, 200, { token: fresh }))
      await expect(api.post(url, {})).rejects.toBeTruthy()
      expect(requests.filter((r) => r.url === '/auth/refresh' && r.url !== url)).toHaveLength(0)
    },
  )

  test('wrong current password (change-password 401) does not log the user out', async () => {
    seedStaff()
    const { default: api } = await loadApi()
    on('post', '/auth/change-password', (c) => reply(c, 401, { message: 'wrong' }))
    await expect(api.post('/auth/change-password', {})).rejects.toBeTruthy()
    expect(localStorage.getItem('staff_token')).not.toBeNull()
  })

  test('401 without a refresh token clears the session immediately', async () => {
    localStorage.setItem('staff_token', tokenFor('old'))
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'u1' }))
    go('/admin/orders')
    const { default: api } = await loadApi()
    on('get', '/orders', (c) => reply(c, 401))
    await expect(api.get('/orders', { _skipAdminBranchParam: true })).rejects.toBeTruthy()
    expect(requests).toHaveLength(1)
    expect(localStorage.getItem('staff_token')).toBeNull()
  })

  test.each([
    ['guest session', () => localStorage.setItem('isGuest', 'true'), {}],
    ['intentional logout', () => sessionStorage.setItem('intentional_logout', 'true'), {}],
    ['background poll', () => {}, { _isBackground: true }],
  ])('401 does not clear auth for a %s', async (_n, arrange, cfg) => {
    localStorage.setItem('staff_token', tokenFor('old'))
    go('/admin/orders')
    arrange()
    const { default: api } = await loadApi()
    on('get', '/orders', (c) => reply(c, 401))
    await expect(api.get('/orders', { _skipAdminBranchParam: true, ...cfg })).rejects.toBeTruthy()
    expect(localStorage.getItem('staff_token')).not.toBeNull()
  })

  test('proactive refresh: a token expiring within 30s is refreshed before sending', async () => {
    localStorage.setItem('staff_token', tokenFor('old', Math.floor(Date.now() / 1000) + 10))
    localStorage.setItem('staff_refresh_token', 'r-old')
    go('/admin/x')
    const { default: api } = await loadApi()
    on('post', '/auth/refresh', (c) => reply(c, 200, { token: fresh, refreshToken: 'r-new' }))
    on('get', '/x', (c) => reply(c, 200))
    await api.get('/x', { _skipAdminBranchParam: true })
    expect(requests.map((r) => r.url)).toEqual(['/auth/refresh', '/x'])
    expect(requests[1].headers.Authorization).toBe(`Bearer ${fresh}`)
  })

  test('customer refresh refused → session-expired event, auth kept for AuthContext to handle', async () => {
    localStorage.setItem('token', tokenFor('cust'))
    localStorage.setItem('refresh_token', 'cr')
    go('/customer/home')
    const mod = await loadApi()
    const events = []
    const listener = (e) => events.push(e.detail)
    window.addEventListener(mod.CUSTOMER_SESSION_EXPIRED_EVENT, listener)
    on('post', '/auth/refresh', (c) => reply(c, 401, { code: 'IDLE_TIMEOUT' }))
    on('get', '/orders/my', (c) => reply(c, 401))

    await expect(mod.default.get('/orders/my')).rejects.toBeTruthy()

    window.removeEventListener(mod.CUSTOMER_SESSION_EXPIRED_EVENT, listener)
    expect(events).toEqual([{ code: 'IDLE_TIMEOUT' }])
    expect(JSON.parse(requests.find((r) => r.url === '/auth/refresh').data)).toHaveProperty('idleMs')
  })

  test('refreshSession uses the Web Locks API when available', async () => {
    seedStaff()
    const request = vi.fn((name, fn) => fn())
    vi.stubGlobal('navigator', { ...navigator, locks: { request } })
    const mod = await loadApi()
    on('post', '/auth/refresh', (c) => reply(c, 200, { token: fresh, refreshToken: 'r-new' }))
    await expect(mod.refreshSession('staff')).resolves.toBe(fresh)
    expect(request).toHaveBeenCalledWith('bestodine-auth-refresh-staff', expect.any(Function))
  })

  test('refreshSession resolves null when there is no refresh token', async () => {
    const mod = await loadApi()
    await expect(mod.refreshSession('staff')).resolves.toBeNull()
    expect(requests).toHaveLength(0)
  })
})

describe('customer session keep-alive (background tick)', () => {
  test('an active customer without a live access token is refreshed on the 60s tick', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] })
    localStorage.setItem('refresh_token', 'cr')
    localStorage.setItem('bd_last_activity', String(Date.now()))
    const { default: api } = await loadApi()
    void api
    on('post', '/auth/refresh', (c) => reply(c, 200, { token: 'NEW', refreshToken: 'cr2' }))
    await vi.advanceTimersByTimeAsync(60 * 1000)
    await vi.waitFor(() => expect(localStorage.getItem('token')).toBe('NEW'))
    expect(requests.filter((r) => r.url === '/auth/refresh')).toHaveLength(1)
  })

  test('an idle customer (no interaction for >2 min) is not kept alive', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'Date'] })
    localStorage.setItem('refresh_token', 'cr')
    localStorage.setItem('bd_last_activity', String(Date.now() - 10 * 60 * 1000))
    await loadApi()
    on('post', '/auth/refresh', (c) => reply(c, 200, { token: 'NEW' }))
    await vi.advanceTimersByTimeAsync(60 * 1000)
    expect(requests).toHaveLength(0)
  })

  test('returning to the tab after the idle timeout asks the server immediately', async () => {
    localStorage.setItem('refresh_token', 'cr')
    localStorage.setItem('token', tokenFor('c'))
    localStorage.setItem('bd_last_activity', String(Date.now() - 2 * 60 * 60 * 1000))
    await loadApi()
    on('post', '/auth/refresh', (c) => reply(c, 401, { code: 'IDLE_TIMEOUT' }))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(requests.some((r) => r.url === '/auth/refresh')).toBe(true))
  })
})

describe('response interceptor — errors and toasts', () => {
  test('change-password success stores the rotated token pair', async () => {
    localStorage.setItem('staff_token', tokenFor('old'))
    go('/admin/settings')
    const { default: api } = await loadApi()
    on('post', '/auth/change-password', (c) => reply(c, 200, { token: 'T2', refreshToken: 'R2' }))
    await api.post('/auth/change-password', {})
    expect(localStorage.getItem('staff_token')).toBe('T2')
    expect(localStorage.getItem('staff_refresh_token')).toBe('R2')
  })

  test('server error message is toasted, identical bursts are de-duplicated', async () => {
    const { default: api } = await loadApi()
    on('get', '/x', (c) => reply(c, 500, { message: 'Boom' }))
    await Promise.allSettled([api.get('/x'), api.get('/x'), api.get('/x')])
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith('Boom', { duration: 4000 })
  })

  test.each(['ROUTE_NOT_FOUND', 'GONE'])('developer-facing code %s is replaced by a friendly message', async (code) => {
    const { default: api } = await loadApi()
    on('get', '/x', (c) => reply(c, 404, { code, message: 'No route matched GET /api/v1/x' }))
    await expect(api.get('/x')).rejects.toBeTruthy()
    expect(toastError.mock.calls[0][0]).toMatch(/refresh the page/)
  })

  test.each([{ _silent: true }, { _isBackground: true }])('no toast for %j calls', async (cfg) => {
    const { default: api } = await loadApi()
    on('get', '/x', (c) => reply(c, 500, { message: 'Boom' }))
    await expect(api.get('/x', cfg)).rejects.toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })

  test('network errors flip the server-down banner after two consecutive failures, a success clears it', async () => {
    const { default: api } = await loadApi()
    const status = await import('@/utils/serverStatus')
    on('get', '/down', (c) => Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', c)))
    on('get', '/up', (c) => reply(c, 200))
    await expect(api.get('/down')).rejects.toBeTruthy()
    expect(status.isServerDown()).toBe(false)
    await expect(api.get('/down')).rejects.toBeTruthy()
    expect(status.isServerDown()).toBe(true)
    expect(toastError).not.toHaveBeenCalled()
    await api.get('/up')
    expect(status.isServerDown()).toBe(false)
  })

  test.each(['admin', 'waiter', 'captain', 'chef'])('FEATURE_LOCKED for staff role %s opens the upgrade prompt, no toast', async (role) => {
    localStorage.setItem('staff_user', JSON.stringify({ role }))
    go('/admin/inventory')
    const { default: api } = await loadApi()
    on('get', '/inventory', (c) => reply(c, 403, { code: 'FEATURE_LOCKED', feature: 'inventory', currentPlan: 'basic', message: 'nope' }))
    await expect(api.get('/inventory', { _skipAdminBranchParam: true })).rejects.toBeTruthy()
    expect(upgradeSpy).toHaveBeenCalledWith({ feature: 'inventory', currentPlan: 'basic', message: 'nope' })
    expect(toastError).not.toHaveBeenCalled()
  })

  test('FEATURE_LOCKED for a customer falls back to the toast', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'customer' }))
    const { default: api } = await loadApi()
    on('get', '/wallet', (c) => reply(c, 403, { code: 'FEATURE_LOCKED', message: 'This restaurant does not offer wallet' }))
    await expect(api.get('/wallet')).rejects.toBeTruthy()
    expect(upgradeSpy).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('This restaurant does not offer wallet', expect.anything())
  })

  // Regression (fixed 2026-10): 'manager' is a staff role, so FEATURE_LOCKED opens the upgrade prompt for managers too.
  test('FEATURE_LOCKED for a manager opens the upgrade prompt instead of a raw toast', async () => {
    localStorage.setItem('staff_user', JSON.stringify({ role: 'manager' }))
    go('/admin/inventory')
    const { default: api } = await loadApi()
    on('get', '/inventory', (c) => reply(c, 403, { code: 'FEATURE_LOCKED', feature: 'inventory', message: 'Your current plan does not include inventory management' }))
    await expect(api.get('/inventory', { _skipAdminBranchParam: true })).rejects.toBeTruthy()
    expect(upgradeSpy).toHaveBeenCalled()
  })

  // Backend gates /analytics/* and /tenant/export behind plan features
  // and answers 403 FEATURE_LOCKED on plans without them.
  test.each([
    ['/analytics/sales', 'analytics'],
    ['/tenant/export', 'dataExport'],
  ])('FEATURE_LOCKED from %s opens the upgrade prompt for an admin, no toast', async (url, feature) => {
    localStorage.setItem('staff_user', JSON.stringify({ role: 'admin' }))
    go('/admin/dashboard')
    const { default: api } = await loadApi()
    on('get', url, (c) => reply(c, 403, { code: 'FEATURE_LOCKED', feature, currentPlan: 'basic', message: 'Upgrade required' }))
    await expect(api.get(url, { _skipAdminBranchParam: true })).rejects.toBeTruthy()
    expect(upgradeSpy).toHaveBeenCalledWith({ feature, currentPlan: 'basic', message: 'Upgrade required' })
    expect(toastError).not.toHaveBeenCalled()
  })

  test('TENANT_REQUIRED off a recovery page clears the stale tenant (takeaway → branch picker)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'old' }))
    go('/customer/home')
    const { default: api } = await loadApi()
    const tenant = await import('@/utils/tenant')
    on('get', '/menu', (c) => reply(c, 400, { code: 'TENANT_REQUIRED' }))
    await expect(api.get('/menu')).rejects.toBeTruthy()
    expect(tenant.getActiveTenant()).toBeNull()
    expect(toastError).not.toHaveBeenCalled()
  })

  test('TENANT_REQUIRED for a dine-in diner keeps the tenant (recovery is a table re-scan)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'old' }))
    localStorage.setItem('orderType', 'dine-in')
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 't', qrToken: 'qr1' }))
    go('/customer/home')
    const { default: api } = await loadApi()
    const tenant = await import('@/utils/tenant')
    on('get', '/menu', (c) => reply(c, 400, { code: 'TENANT_REQUIRED' }))
    await expect(api.get('/menu')).rejects.toBeTruthy()
    expect(tenant.getActiveTenantSlug()).toBe('old')
  })

  test('TENANT_REQUIRED on a restaurant landing page is left alone', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'spice' }))
    go('/spice')
    const { default: api } = await loadApi()
    const tenant = await import('@/utils/tenant')
    on('get', '/menu', (c) => reply(c, 400, { code: 'TENANT_REQUIRED' }))
    await expect(api.get('/menu')).rejects.toBeTruthy()
    expect(tenant.getActiveTenantSlug()).toBe('spice')
  })

  test('BRANCH_NOT_FOUND drops only the dead branch', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'spice', branch: { _id: 'dead' } }))
    go('/customer/home')
    const { default: api } = await loadApi()
    const tenant = await import('@/utils/tenant')
    on('get', '/menu', (c) => reply(c, 404, { code: 'BRANCH_NOT_FOUND' }))
    await expect(api.get('/menu')).rejects.toBeTruthy()
    expect(tenant.getActiveTenantSlug()).toBe('spice')
    expect(tenant.getActiveBranchId()).toBeNull()
  })

  test('TABLE_UNAVAILABLE for a customer unbinds the table and asks for a re-scan', async () => {
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 't1' }))
    localStorage.setItem('scanToken', 'st')
    go('/customer/cart')
    const { default: api } = await loadApi()
    const reasons = []
    const l = (e) => reasons.push(e.detail.reason)
    window.addEventListener('dineInScanRequired', l)
    on('post', '/orders', (c) => reply(c, 400, { code: 'TABLE_UNAVAILABLE' }))
    await expect(api.post('/orders', {})).rejects.toBeTruthy()
    window.removeEventListener('dineInScanRequired', l)
    expect(reasons).toEqual(['table_removed'])
    expect(localStorage.getItem('dineInTable')).toBeNull()
    expect(localStorage.getItem('scanToken')).toBeNull()
  })

  test('403 on a /superadmin API with a non-superadmin platform session bounces once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    localStorage.setItem('platform_user', JSON.stringify({ role: 'admin' }))
    go('/superadmin/dashboard')
    const { default: api } = await loadApi()
    on('get', '/superadmin/stats', (c) => reply(c, 403, { message: 'Access denied. Super Admin only.' }))
    await Promise.allSettled([api.get('/superadmin/stats'), api.get('/superadmin/stats')])
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith('Please sign in as Super Admin', expect.anything())
    expect(sessionStorage.getItem('bd_auth_notice')).toBe('Please sign in as Super Admin')
  })
})

describe('named API helpers', () => {
  test('payment verification forwards the body verbatim (idempotency travels in the body, no header)', async () => {
    const { razorpayAPI } = await loadApi()
    on('post', '/razorpay/verify-payment', (c) => reply(c, 200))
    const body = { razorpay_order_id: 'o', clientIdempotencyKey: 'k-123' }
    await razorpayAPI.verifyPayment(body)
    expect(JSON.parse(requests[0].data)).toEqual(body)
    expect(Object.keys(requests[0].headers).some((h) => /idempotency/i.test(h))).toBe(false)
  })

  test('orphan refund is silent (caller owns the error UI)', async () => {
    const { razorpayAPI } = await loadApi()
    on('post', '/razorpay/orphan-refund', (c) => reply(c, 500, { message: 'x' }))
    await expect(razorpayAPI.orphanRefund({})).rejects.toBeTruthy()
    expect(toastError).not.toHaveBeenCalled()
  })

  test('publicAPI.getLanding merges the branch slug into params and skips the branch header', async () => {
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'other', branch: { _id: 'b1' } }))
    const { publicAPI } = await loadApi()
    on('get', '/public/restaurants/my%20cafe/landing', (c) => reply(c, 200))
    await publicAPI.getLanding('my cafe', 'fc-road', { params: { lang: 'en' } })
    expect(requests[0].params).toEqual({ lang: 'en', branch: 'fc-road' })
    expect(requests[0].headers['X-Branch-Id']).toBeUndefined()
  })
})
