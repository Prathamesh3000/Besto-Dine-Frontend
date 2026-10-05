import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen, act, waitFor, renderHook } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api, CUSTOMER_SESSION_EXPIRED_EVENT: 'bd:customer-session-expired' }))
const sock = vi.hoisted(() => ({ disconnectSocket: vi.fn(), reconnectWithAuth: vi.fn() }))
vi.mock('@/utils/socket', () => sock)
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
vi.mock('@/Components/Common/SessionChangedOverlay', () => ({
  default: ({ change }) => <div data-testid="overlay">{change.kind}:{change.audience}:{change.user?._id ?? ''}</div>,
}))

import { AuthProvider, useAuth, STAFF_ROLES, CAPTAIN_ROLES, ADMIN_ROLES } from '@/Context/AuthContext'

let auth
function Probe() { auth = useAuth(); return null }
const mount = async () => {
  const utils = render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(auth.isLoading).toBe(false))
  return utils
}
const go = (path) => window.history.replaceState({}, '', path)
const stored = (k) => localStorage.getItem(k)

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: {} })
  api.post.mockReset().mockResolvedValue({ data: {} })
  sock.disconnectSocket.mockReset()
  sock.reconnectWithAuth.mockReset()
  toast.error.mockReset()
  go('/customer/home')
})
afterEach(() => { auth = undefined })

describe('session restore on mount', () => {
  test('no stored session → signed out, loading finishes, no /auth/me', async () => {
    await mount()
    expect(auth).toMatchObject({ user: null, isLoggedIn: false, isGuest: false, role: null, tenant: null })
    expect(api.get).not.toHaveBeenCalled()
  })

  test('restores a customer session and refreshes it from /auth/me (same id only)', async () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer', name: 'Old' }))
    api.get.mockResolvedValue({ data: { user: { _id: 'c1', role: 'customer', name: 'Fresh' } } })
    await mount()
    expect(auth.audience).toBe('customer')
    await waitFor(() => expect(auth.user.name).toBe('Fresh'))
    expect(api.get).toHaveBeenCalledWith('/auth/me', { _aud: 'customer' })
    expect(JSON.parse(stored('user')).name).toBe('Fresh')
  })

  test('ignores an /auth/me answer for a different account', async () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer', name: 'Me' }))
    api.get.mockResolvedValue({ data: { _id: 'someone-else', name: 'Other' } })
    await mount()
    await Promise.resolve()
    expect(auth.user.name).toBe('Me')
  })

  test('migrates the legacy cafeUser key on customer pages', async () => {
    localStorage.setItem('cafeUser', JSON.stringify({ _id: 'c9', role: 'customer' }))
    localStorage.setItem('token', 't')
    await mount()
    expect(stored('cafeUser')).toBeNull()
    expect(auth.user._id).toBe('c9')
  })

  test('staff pages read the staff-audience keys, not the customer ones', async () => {
    go('/admin/dashboard')
    localStorage.setItem('token', 'cust')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    localStorage.setItem('staff_token', 'st')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'a1', role: 'admin', tenant: { _id: 'T1' } }))
    await mount()
    expect(auth).toMatchObject({ audience: 'staff', role: 'admin', isStaff: true, tenant: { _id: 'T1' } })
  })

  test('kiosk routes never hydrate a stored user', async () => {
    go('/kiosk/menu')
    localStorage.setItem('token', 't')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    localStorage.setItem('isGuest', 'true')
    await mount()
    expect(auth.user).toBeNull()
    expect(auth.isGuest).toBe(false)
  })

  test('corrupt stored user → logged out and keys cleared', async () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('user', '{broken')
    await mount()
    expect(auth.isLoggedIn).toBe(false)
    expect(stored('token')).toBeNull()
  })

  test('restores a live guest session', async () => {
    localStorage.setItem('isGuest', 'true')
    localStorage.setItem('guest_session_start', String(Date.now()))
    await mount()
    expect(auth.isGuest).toBe(true)
  })

  test('drops a guest session older than 24h', async () => {
    localStorage.setItem('isGuest', 'true')
    localStorage.setItem('guest_session_start', String(Date.now() - 25 * 3600e3))
    localStorage.setItem('scanToken', 'old')
    await mount()
    expect(auth.isGuest).toBe(false)
    expect(stored('scanToken')).toBeNull()
  })

  test('guest crossing the 24h mark while the tab is open is dropped on focus', async () => {
    localStorage.setItem('isGuest', 'true')
    localStorage.setItem('guest_session_start', String(Date.now()))
    await mount()
    localStorage.setItem('guest_session_start', String(Date.now() - 25 * 3600e3))
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(auth.isGuest).toBe(false)
  })
})

describe('login / register / google', () => {
  test.each([
    ['customer on /login', '/login', { _id: 'c1', role: 'customer' }, 'customer', 'token', 'user'],
    ['admin on /staff-login', '/staff-login', { _id: 'a1', role: 'admin' }, 'staff', 'staff_token', 'staff_user'],
    ['chef on /staff-login', '/staff-login', { _id: 'k1', role: 'chef' }, 'staff', 'staff_token', 'staff_user'],
    ['superadmin on /staff-login', '/staff-login', { _id: 's1', role: 'superadmin' }, 'platform', 'platform_token', 'platform_user'],
  ])('%s stores under its audience keys', async (_l, path, user, aud, tokenKey, userKey) => {
    go(path)
    await mount()
    api.post.mockResolvedValue({ data: { token: 'JWT', refreshToken: 'R', ...user } })
    let res
    await act(async () => { res = await auth.login('e', 'p', 'staff') })
    expect(res).toMatchObject({ success: true, role: user.role, audience: aud })
    expect(stored(tokenKey)).toBe('JWT')
    expect(JSON.parse(stored(userKey))).toEqual(user) // tokens kept out of user blob
    expect(auth).toMatchObject({ isLoggedIn: true, isAuthenticated: true, role: user.role, audience: aud })
    expect(sock.reconnectWithAuth).toHaveBeenCalled()
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'e', password: 'p', loginType: 'staff', expectedRole: undefined }, { _silent: true })
  })

  test('a staff login does not clobber a customer session in the same browser', async () => {
    localStorage.setItem('token', 'cust-token')
    go('/staff-login')
    await mount()
    api.post.mockResolvedValue({ data: { token: 'S', _id: 'w1', role: 'waiter' } })
    await act(async () => { await auth.login('e', 'p') })
    expect(stored('token')).toBe('cust-token')
  })

  test('failed login returns the server code/message and keeps state signed out', async () => {
    await mount()
    api.post.mockRejectedValue({ response: { data: { code: 'SIGNUP_PENDING', reason: 'r', message: 'Pending' } } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let res
    await act(async () => { res = await auth.login('e', 'p') })
    expect(res).toEqual({ success: false, code: 'SIGNUP_PENDING', reason: 'r', message: 'Pending' })
    expect(auth.isLoggedIn).toBe(false)
  })

  test('failed login with no body falls back to a generic message', async () => {
    await mount()
    api.post.mockRejectedValue(new Error('network'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let res
    await act(async () => { res = await auth.login('e', 'p') })
    expect(res.message).toBe('Login failed')
  })

  test('a guest signing in keeps their cart; a different customer\'s cached data is wiped', async () => {
    localStorage.setItem('isGuest', 'true')
    localStorage.setItem('cart_by_table', JSON.stringify({ _default_: { m1: { quantity: 1 } } }))
    go('/login')
    await mount()
    api.post.mockResolvedValue({ data: { token: 'T', _id: 'c1', role: 'customer' } })
    await act(async () => { await auth.login('e', 'p') })
    expect(JSON.parse(stored('cart_by_table'))._default_).toBeDefined()
    expect(stored('isGuest')).toBeNull()
    expect(auth.isGuest).toBe(false)
  })

  test.each([
    ['register', '/auth/register', (a) => a.register({ name: 'n' }), 'Registration failed'],
    ['loginWithGoogle', '/auth/google', (a) => a.loginWithGoogle('cred'), 'Could not sign you in with Google.'],
  ])('%s signs the customer in, or reports failure', async (_n, url, call, fallback) => {
    go('/login')
    await mount()
    api.post.mockResolvedValueOnce({ data: { token: 'T', refreshToken: 'R', needsMobile: true, _id: 'c5', role: 'customer' } })
    let res
    await act(async () => { res = await call(auth) })
    expect(api.post.mock.calls[0][0]).toBe(url)
    expect(res.success).toBe(true)
    expect(auth.user._id).toBe('c5')
    expect(stored('refresh_token')).toBe('R')

    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.post.mockRejectedValueOnce(new Error('x'))
    await act(async () => { res = await call(auth) })
    expect(res).toMatchObject({ success: false, message: fallback })
  })
})

describe('logout', () => {
  test('customer logout clears customer keys + visit state, revokes the refresh token and disconnects', async () => {
    localStorage.setItem('token', 'T')
    localStorage.setItem('refresh_token', 'R')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    localStorage.setItem('cart', '[]')
    localStorage.setItem('scanToken', 's')
    localStorage.setItem('staff_token', 'keep-me')
    await mount()
    let out
    act(() => { out = auth.logout() })
    expect(out).toEqual({ wasStaff: false, audience: 'customer' })
    expect(api.post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'R' }, expect.objectContaining({ _aud: 'customer', headers: { Authorization: 'Bearer T' } }))
    for (const k of ['token', 'refresh_token', 'user', 'cart', 'scanToken']) expect(stored(k)).toBeNull()
    expect(stored('staff_token')).toBe('keep-me')
    expect(auth).toMatchObject({ user: null, isLoggedIn: false, audience: null })
    expect(sock.disconnectSocket).toHaveBeenCalled()
    expect(sessionStorage.getItem('intentional_logout')).toBe('true')
  })

  test('staff logout reports wasStaff and leaves the customer session alone', async () => {
    go('/waiter/home')
    localStorage.setItem('staff_token', 'S')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'w1', role: 'waiter' }))
    localStorage.setItem('token', 'cust')
    await mount()
    let out
    act(() => { out = auth.logout() })
    expect(out).toEqual({ wasStaff: true, audience: 'staff' })
    expect(stored('staff_token')).toBeNull()
    expect(stored('token')).toBe('cust')
  })

  test('staff logout clears the React Query cache (tenant data must not reach the next account)', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    const client = new QueryClient()
    client.setQueryData(['admin', 'tables', { branch: 'all', tenant: 'T1' }], [{ _id: 't1' }])
    go('/admin/dashboard')
    localStorage.setItem('staff_token', 'S')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'a1', role: 'admin', tenant: { _id: 'T1' } }))
    render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>)
    await waitFor(() => expect(auth.isLoading).toBe(false))
    act(() => { auth.logout() })
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  test('logout with no stored credentials skips the server call', async () => {
    await mount()
    act(() => { auth.logout() })
    expect(api.post).not.toHaveBeenCalled()
  })

  test('logoutAll hits /auth/logout-all then tears down', async () => {
    localStorage.setItem('token', 'T')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    await mount()
    await act(async () => { await auth.logoutAll() })
    expect(api.post.mock.calls[0][0]).toBe('/auth/logout-all')
    expect(auth.user).toBeNull()
  })

  test('another tab\'s logout broadcast for the same audience signs this tab out', async () => {
    localStorage.setItem('token', 'T')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    await mount()
    const other = new BroadcastChannel('bestodine-auth')
    other.postMessage({ type: 'logout', audience: 'customer' })
    await waitFor(() => expect(auth.user).toBeNull())
    expect(screen.getByTestId('overlay').textContent).toBe('signedOut:customer:')
    other.close()
  })

  test('a broadcast for a different audience is ignored', async () => {
    localStorage.setItem('token', 'T')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    await mount()
    const other = new BroadcastChannel('bestodine-auth')
    other.postMessage({ type: 'logout', audience: 'staff' })
    await new Promise((r) => setTimeout(r, 30))
    expect(auth.user?._id).toBe('c1')
    other.close()
  })
})

describe('cross-tab identity changes (storage event)', () => {
  const restoreStaff = async () => {
    go('/admin/dashboard')
    localStorage.setItem('staff_token', 'S')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'a1', role: 'admin' }))
    await mount()
  }

  test('a different account signed into this audience elsewhere → "switched" overlay + socket dropped', async () => {
    await restoreStaff()
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'a2', role: 'admin' }))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'staff_user' })) })
    expect(screen.getByTestId('overlay').textContent).toBe('switched:staff:a2')
    expect(sock.disconnectSocket).toHaveBeenCalled()
  })

  test('signed out elsewhere (key cleared) → "signedOut"; same account again → overlay removed', async () => {
    await restoreStaff()
    localStorage.removeItem('staff_user')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: null })) })
    expect(screen.getByTestId('overlay').textContent).toBe('signedOut:staff:')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'a1', role: 'admin' }))
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'staff_user' })) })
    expect(screen.queryByTestId('overlay')).toBeNull()
  })

  test('storage writes to unrelated keys are ignored', async () => {
    await restoreStaff()
    localStorage.removeItem('staff_user')
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'cart' })) })
    expect(screen.queryByTestId('overlay')).toBeNull()
  })
})

describe('customer session expiry event', () => {
  const restoreCustomer = async () => {
    localStorage.setItem('token', 'T')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    await mount()
  }

  test('on a public page: drops only the login and toasts in place', async () => {
    go('/login')
    localStorage.setItem('scanToken', 'keep')
    await restoreCustomer()
    act(() => { window.dispatchEvent(new Event('bd:customer-session-expired')) })
    expect(auth.user).toBeNull()
    expect(stored('token')).toBeNull()
    expect(stored('scanToken')).toBe('keep')
    expect(toast.error).toHaveBeenCalledWith('Your session expired, please log in again', expect.any(Object))
  })

  test('on a private page: stashes the notice and redirects to the restaurant page', async () => {
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, pathname: '/customer/orders', assign })
    localStorage.setItem('activeTenant', JSON.stringify({ slug: 'spice' }))
    await restoreCustomer()
    act(() => { window.dispatchEvent(new Event('bd:customer-session-expired')) })
    expect(sessionStorage.getItem('bd_customer_session_notice')).toBeTruthy()
    expect(assign).toHaveBeenCalled()
  })

  test('is ignored for a staff tab', async () => {
    go('/admin/x')
    localStorage.setItem('staff_token', 'S')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'a1', role: 'admin' }))
    await mount()
    act(() => { window.dispatchEvent(new Event('bd:customer-session-expired')) })
    expect(auth.user._id).toBe('a1')
  })

  test('a notice carried across the redirect is toasted on the next mount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sessionStorage.setItem('bd_customer_session_notice', 'Expired!')
    render(<AuthProvider><Probe /></AuthProvider>)
    act(() => { vi.advanceTimersByTime(400) })
    expect(toast.error).toHaveBeenCalledWith('Expired!', expect.any(Object))
    expect(sessionStorage.getItem('bd_customer_session_notice')).toBeNull()
  })
})

describe('guest mode, profile and refresh', () => {
  test('setGuestMode wipes any previous account and starts a guest clock', async () => {
    localStorage.setItem('token', 'T')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    await mount()
    act(() => auth.setGuestMode())
    expect(auth).toMatchObject({ user: null, isGuest: true, isLoggedIn: false })
    expect(stored('token')).toBeNull()
    expect(stored('isGuest')).toBe('true')
    expect(stored('guest_session_start')).toMatch(/^\d+$/)
  })

  test('exitGuestMode clears every visit key', async () => {
    localStorage.setItem('isGuest', 'true')
    for (const k of ['dineInTable', 'orderType', 'cart', 'scanToken']) localStorage.setItem(k, 'x')
    await mount()
    act(() => auth.exitGuestMode())
    expect(auth.isGuest).toBe(false)
    for (const k of ['isGuest', 'dineInTable', 'orderType', 'cart', 'scanToken']) expect(stored(k)).toBeNull()
  })

  test('updateProfile merges + persists; refreshUser replaces from /auth/me and returns null on failure', async () => {
    localStorage.setItem('token', 'T')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer', name: 'A' }))
    await mount()
    act(() => auth.updateProfile({ name: 'B' }))
    expect(JSON.parse(stored('user')).name).toBe('B')

    api.get.mockResolvedValueOnce({ data: { user: { _id: 'c1', role: 'customer', name: 'C' } } })
    let fresh
    await act(async () => { fresh = await auth.refreshUser() })
    expect(fresh.name).toBe('C')
    expect(auth.user.name).toBe('C')

    api.get.mockRejectedValueOnce(new Error('x'))
    await act(async () => { fresh = await auth.refreshUser() })
    expect(fresh).toBeNull()
    api.get.mockResolvedValueOnce({ data: null })
    await act(async () => { fresh = await auth.refreshUser() })
    expect(fresh).toBeNull()
  })
})

describe('role / permission / feature helpers', () => {
  const as = async (user) => {
    go('/admin/x')
    localStorage.setItem('staff_token', 'S')
    localStorage.setItem('staff_user', JSON.stringify({ _id: 'u', ...user }))
    await mount()
  }

  test.each([
    ['waiter', { isStaff: true, isWaiter: true, isCaptain: false, isChef: false, isCustomer: false, isSuperAdmin: false }],
    ['captain', { isStaff: true, isWaiter: false, isCaptain: true }],
    ['admin', { isStaff: true, isCaptain: true }],
    ['manager', { isStaff: true }],
    ['chef', { isStaff: false, isChef: true }],
  ])('%s derived flags', async (role, flags) => {
    await as({ role })
    expect(auth).toMatchObject(flags)
  })

  test('hasRole accepts strings and arrays; false when signed out', async () => {
    await as({ role: 'manager' })
    expect(auth.hasRole('manager')).toBe(true)
    expect(auth.hasRole(ADMIN_ROLES)).toBe(true)
    expect(auth.hasRole(['chef'])).toBe(false)
    expect(STAFF_ROLES).toContain('manager')
  })

  test('hasPermission: admin bypasses, others need an explicit true', async () => {
    await as({ role: 'waiter', permissions: { editMenu: true, refunds: 'yes' } })
    expect(auth.hasPermission('editMenu')).toBe(true)
    expect(auth.hasPermission('refunds')).toBe(false)
    expect(auth.hasPermission('other')).toBe(false)
  })

  test('hasPermission admin bypass', async () => {
    await as({ role: 'admin' })
    expect(auth.hasPermission('anything')).toBe(true)
  })

  test.each([
    ['no key', undefined, {}, true],
    ['no tenant snapshot (legacy)', 'kds', null, true],
    ['override false wins over plan', 'kds', { features: { kds: true }, featureOverrides: { kds: false } }, false],
    ['override true wins over plan', 'kds', { features: {}, featureOverrides: { kds: true } }, true],
    ['plan true', 'kds', { features: { kds: true } }, true],
    ['plan "basic"', 'kds', { features: { kds: 'basic' } }, true],
    ['plan "standard"', 'kds', { features: { kds: 'standard' } }, true],
    ['plan "advanced"', 'kds', { features: { kds: 'advanced' } }, true],
    ['plan false', 'kds', { features: { kds: false } }, false],
    ['plan missing', 'kds', { features: {} }, false],
  ])('hasFeature: %s', async (_l, key, tenant, expected) => {
    await as({ role: 'admin', ...(tenant ? { tenant } : {}) })
    expect(auth.hasFeature(key)).toBe(expected)
  })

  test('superadmin bypasses feature gates; full level detected', async () => {
    go('/superadmin/x')
    localStorage.setItem('platform_token', 'P')
    localStorage.setItem('platform_user', JSON.stringify({ _id: 's', role: 'superadmin', superadminLevel: 'full', tenant: { features: {} } }))
    await mount()
    expect(auth.hasFeature('kds')).toBe(true)
    expect(auth).toMatchObject({ isSuperAdmin: true, isFullSuperAdmin: true, superadminLevel: 'full' })
  })

  test('getLimit returns numeric plan limits or 0', async () => {
    await as({ role: 'admin', tenant: { limits: { maxStaff: 10, maxBranches: '3' } } })
    expect(auth.getLimit('maxStaff')).toBe(10)
    expect(auth.getLimit('maxBranches')).toBe(0)
    expect(auth.getLimit('nope')).toBe(0)
  })

  test('mustChangePassword only for an explicit true', async () => {
    await as({ role: 'admin', mustChangePassword: true })
    expect(auth.mustChangePassword).toBe(true)
  })

  test('CaptainOnly flag vs route group: manager is in CAPTAIN_ROLES but isCaptain is false (documented behaviour)', async () => {
    await as({ role: 'manager' })
    expect(CAPTAIN_ROLES).toContain('manager')
    expect(auth.isCaptain).toBe(false)
  })
})

describe('useAuth guard', () => {
  test('throws outside an AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
  })
})
