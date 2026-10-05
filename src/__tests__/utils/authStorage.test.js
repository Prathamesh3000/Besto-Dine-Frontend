import { describe, test, expect, afterEach } from 'vitest'
import {
  AUDIENCES, storageKeysFor, isSharedStaffEntryPath, audienceForPath, audienceForUser,
  loginPathForAudience, getEntryAudience, setEntryAudience, resolveEntryAudience, currentAudience,
  userStorageKey, getToken, getStoredUser, getStoredUserObject, getRefreshToken, setAuth, setTokens,
  setStoredUser, clearAuth, setTabIdentity, clearTabIdentity, identityMismatch, migrateLegacyPlatformSession,
} from '@/utils/authStorage'

const go = (p) => window.history.pushState({}, '', p)
afterEach(() => { go('/'); AUDIENCES.forEach(clearTabIdentity) })

describe('path → audience mapping', () => {
  test.each([
    ['/superadmin', 'platform'], ['/superadmin/tenants', 'platform'],
    ['/admin', 'staff'], ['/admin/menu', 'staff'], ['/waiter/home', 'staff'], ['/chef', 'staff'],
    ['/captain/x', 'staff'], ['/kitchen', 'staff'], ['/staff-login', 'staff'], ['/force-change-password', 'staff'],
    ['/', 'customer'], ['/customer/home', 'customer'], ['/administrator', 'customer'], ['/superadminx', 'customer'],
    [undefined, 'customer'], [42, 'customer'],
  ])('%j → %s', (path, aud) => {
    expect(audienceForPath(path)).toBe(aud)
  })

  test.each([['/staff-login', true], ['/staff-login/x', true], ['/force-change-password', true], ['/login', false], [null, false]])(
    'isSharedStaffEntryPath(%j) → %s', (p, v) => expect(isSharedStaffEntryPath(p)).toBe(v),
  )

  test.each([
    [{ role: 'superadmin' }, 'platform'], [{ role: 'customer' }, 'customer'], [{ role: 'chef' }, 'staff'],
    [{ role: 'manager' }, 'staff'], [{}, null], [null, null],
  ])('audienceForUser(%j) → %s', (u, aud) => expect(audienceForUser(u)).toBe(aud))

  test.each([['platform', '/staff-login'], ['staff', '/staff-login'], ['customer', '/login'], [undefined, '/login']])(
    'loginPathForAudience(%s) → %s', (aud, p) => expect(loginPathForAudience(aud)).toBe(p),
  )

  test('unknown audience keys fall back to customer keys', () => {
    expect(storageKeysFor('nope')).toEqual({ token: 'token', user: 'user', refresh: 'refresh_token' })
    expect(storageKeysFor('platform').token).toBe('platform_token')
  })
})

describe('entry audience (shared staff pages)', () => {
  test('only staff-side audiences are remembered', () => {
    setEntryAudience('customer')
    expect(getEntryAudience()).toBeNull()
    setEntryAudience('platform')
    expect(getEntryAudience()).toBe('platform')
  })

  test('resolveEntryAudience prefers the remembered tab audience', () => {
    expect(resolveEntryAudience('/staff-login', 'platform', null)).toBe('platform')
  })

  test('on /force-change-password picks the audience whose user must change password', () => {
    const storage = { getItem: (k) => (k === 'platform_user' ? JSON.stringify({ mustChangePassword: true }) : null) }
    expect(resolveEntryAudience('/force-change-password', null, storage)).toBe('platform')
  })

  test('staff wins when both must change password; default is staff', () => {
    const both = { getItem: () => JSON.stringify({ mustChangePassword: true }) }
    expect(resolveEntryAudience('/force-change-password', null, both)).toBe('staff')
    expect(resolveEntryAudience('/staff-login', null, both)).toBe('staff')
    const throwing = { getItem: () => { throw new Error('x') } }
    expect(resolveEntryAudience('/force-change-password', null, throwing)).toBe('staff')
  })

  test('currentAudience remembers the workspace so /staff-login keeps reading it', () => {
    go('/superadmin/dashboard')
    expect(currentAudience()).toBe('platform')
    go('/staff-login')
    expect(currentAudience()).toBe('platform')
  })

  test('customer pages do not overwrite the remembered staff workspace', () => {
    go('/admin')
    currentAudience()
    go('/customer/home')
    expect(currentAudience()).toBe('customer')
    expect(getEntryAudience()).toBe('staff')
  })
})

describe('token / user storage partitioned by audience', () => {
  test('sessions for different audiences live side by side', () => {
    setAuth('ct', { _id: 'c' }, 'customer', 'cr')
    setAuth('st', JSON.stringify({ _id: 's' }), 'staff')
    setAuth('pt', { _id: 'p' }, 'platform', 'pr')
    expect(getToken('customer')).toBe('ct')
    expect(getToken('staff')).toBe('st')
    expect(getRefreshToken('staff')).toBeNull()
    expect(getRefreshToken('platform')).toBe('pr')
    expect(getStoredUserObject('staff')).toEqual({ _id: 's' })
    expect(userStorageKey('platform')).toBe('platform_user')

    clearAuth('staff')
    expect(getToken('staff')).toBeNull()
    expect(getToken('customer')).toBe('ct')
    expect(getToken('platform')).toBe('pt')
  })

  test('default audience follows the current path', () => {
    go('/admin')
    setAuth('st', { _id: 's' })
    expect(localStorage.getItem('staff_token')).toBe('st')
    expect(getToken()).toBe('st')
  })

  test('setTokens only overwrites provided values', () => {
    setAuth('a', {}, 'staff', 'r1')
    setTokens('b', null, 'staff')
    expect(getToken('staff')).toBe('b')
    expect(getRefreshToken('staff')).toBe('r1')
    setTokens(null, 'r2', 'staff')
    expect(getToken('staff')).toBe('b')
    expect(getRefreshToken('staff')).toBe('r2')
  })

  test('setStoredUser accepts objects and strings; corrupt blob parses to null', () => {
    setStoredUser({ a: 1 }, 'customer')
    expect(getStoredUser('customer')).toBe('{"a":1}')
    setStoredUser('{bad', 'customer')
    expect(getStoredUserObject('customer')).toBeNull()
  })
})

describe('tab identity (cross-tab account switch)', () => {
  test('no pinned identity → never a mismatch', () => {
    expect(identityMismatch('staff')).toBe(false)
  })
  test('same user stored → no mismatch; different or missing user → mismatch', () => {
    setStoredUser({ _id: 'u1' }, 'staff')
    setTabIdentity('staff', { id: 'u1' })
    expect(identityMismatch('staff')).toBe(false)
    setStoredUser({ _id: 'u2' }, 'staff')
    expect(identityMismatch('staff')).toBe(true)
    clearAuth('staff')
    expect(identityMismatch('staff')).toBe(true)
  })
  test('customer audience is never pinned', () => {
    setTabIdentity('customer', { _id: 'x' })
    setStoredUser({ _id: 'y' }, 'customer')
    expect(identityMismatch('customer')).toBe(false)
  })
  test('setting an identity-less user unpins', () => {
    setTabIdentity('staff', { _id: 'u1' })
    setTabIdentity('staff', null)
    expect(identityMismatch('staff')).toBe(false)
  })
})

describe('migrateLegacyPlatformSession', () => {
  test('moves a superadmin session out of staff keys', () => {
    setAuth('t', { role: 'superadmin' }, 'staff', 'r')
    expect(migrateLegacyPlatformSession()).toBe(true)
    expect(getToken('platform')).toBe('t')
    expect(getRefreshToken('platform')).toBe('r')
    expect(getStoredUserObject('platform')).toEqual({ role: 'superadmin' })
    expect(getToken('staff')).toBeNull()
  })
  test('an existing platform session wins; legacy staff keys still cleared', () => {
    setAuth('new', { role: 'superadmin', v: 2 }, 'platform')
    setAuth('legacy', { role: 'superadmin', v: 1 }, 'staff')
    expect(migrateLegacyPlatformSession(localStorage)).toBe(true)
    expect(getToken('platform')).toBe('new')
    expect(getStoredUser('staff')).toBeNull()
  })
  test('non-superadmin staff session untouched', () => {
    setAuth('t', { role: 'admin' }, 'staff')
    expect(migrateLegacyPlatformSession()).toBe(false)
    expect(getToken('staff')).toBe('t')
  })
  test('storage that throws → false', () => {
    expect(migrateLegacyPlatformSession({ getItem: () => { throw new Error('x') } })).toBe(false)
  })
})
