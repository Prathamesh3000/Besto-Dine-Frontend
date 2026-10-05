import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => auth,
  STAFF_ROLES: ['waiter', 'captain', 'admin', 'manager'],
  CUSTOMER_ROLES: ['customer'],
}))
const tenant = vi.hoisted(() => ({ slug: 'spice' }))
vi.mock('@/utils/tenant', () => ({ getActiveTenantSlug: () => tenant.slug }))

import ProtectedRoute, { CaptainOnlyRoute } from '@/Components/ProtectedRoute'

const ROLES = ['admin', 'manager', 'captain', 'waiter', 'chef', 'customer', 'superadmin']

function setAuth({ role = null, guest = false, loading = false, mustChangePassword = false, audience = null } = {}) {
  auth = {
    isAuthenticated: !!role,
    isGuest: guest,
    isLoading: loading,
    mustChangePassword,
    audience,
    hasRole: (r) => !!role && (Array.isArray(r) ? r.includes(role) : r === role),
    isCaptain: role === 'captain' || role === 'admin',
  }
}

function Landing({ name }) {
  const loc = useLocation()
  return <div data-testid="landing">{name}|{JSON.stringify(loc.state ?? null)}</div>
}

function renderAt(guardProps, { path = '/secret' } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={<ProtectedRoute {...guardProps}><div>PROTECTED</div></ProtectedRoute>} />
        {['/login', '/staff-login', '/branch-selection', '/force-change-password', '/custom'].map((p) => (
          <Route key={p} path={p} element={<Landing name={p} />} />
        ))}
      </Routes>
    </MemoryRouter>,
  )
}
const landedOn = () => screen.queryByTestId('landing')?.textContent.split('|')[0] ?? 'PROTECTED'
const landedState = () => JSON.parse(screen.getByTestId('landing').textContent.split('|')[1])

beforeEach(() => { tenant.slug = 'spice'; setAuth() })

describe('ProtectedRoute role matrix', () => {
  const routes = {
    adminRoute: ['admin', 'manager'],
    captainRoute: ['captain', 'admin', 'manager'],
    staffRoute: ['waiter', 'captain', 'admin', 'manager'],
    chefRoute: ['chef', 'admin', 'manager'],
    superadminRoute: ['superadmin'],
    customerRoute: ['customer'],
  }
  const cases = []
  for (const [routeName, allowed] of Object.entries(routes)) {
    for (const role of ROLES) {
      const expected = allowed.includes(role)
        ? 'PROTECTED'
        : (allowed.every((r) => r === 'customer') ? '/login' : '/staff-login')
      cases.push([role, routeName, allowed, expected])
    }
  }
  test.each(cases)('%s on %s (%j) → %s', (role, _n, allowed, expected) => {
    setAuth({ role })
    renderAt({ requiredRole: allowed })
    expect(landedOn()).toBe(expected)
  })

  test('a role denial passes the intended destination in state.from', () => {
    setAuth({ role: 'waiter' })
    renderAt({ requiredRole: ['admin'] })
    expect(landedState()).toEqual({ from: '/secret' })
  })

  test('a single-string requiredRole works too', () => {
    setAuth({ role: 'chef' })
    renderAt({ requiredRole: 'chef' })
    expect(landedOn()).toBe('PROTECTED')
  })
})

describe('ProtectedRoute unauthenticated + guest', () => {
  test.each([
    ['staff route', { requiredRole: ['admin'] }, '/staff-login'],
    ['superadmin route', { requiredRole: 'superadmin' }, '/staff-login'],
    ['customer route', { requiredRole: ['customer'] }, '/login'],
    ['plain login-required route', {}, '/login'],
    ['explicit redirectTo', { requiredRole: ['admin'], redirectTo: '/custom' }, '/custom'],
  ])('anonymous on %s → %s', (_l, props, expected) => {
    renderAt(props)
    expect(landedOn()).toBe(expected)
  })

  test('guest passes an allowGuest route', () => {
    setAuth({ guest: true })
    renderAt({ allowGuest: true })
    expect(landedOn()).toBe('PROTECTED')
  })

  test('R-08: guest cannot slip past allowGuest when a requiredRole is also set', () => {
    setAuth({ guest: true })
    renderAt({ allowGuest: true, requiredRole: ['customer'] })
    expect(landedOn()).toBe('/login')
  })

  test('guest on a non-guest route is sent to login', () => {
    setAuth({ guest: true })
    renderAt({})
    expect(landedOn()).toBe('/login')
  })

  test('logged-in customer also passes an allowGuest route', () => {
    setAuth({ role: 'customer' })
    renderAt({ allowGuest: true })
    expect(landedOn()).toBe('PROTECTED')
  })
})

describe('ProtectedRoute tenant, loading and password gates', () => {
  test('shows the loader while auth restores', () => {
    setAuth({ role: 'admin', loading: true })
    renderAt({ requiredRole: ['admin'] })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('PROTECTED')).not.toBeInTheDocument()
  })

  test.each([
    ['allowGuest route', { allowGuest: true }, { guest: true }],
    ['customer route', { requiredRole: ['customer'] }, { role: 'customer' }],
    ['plain login route', {}, { role: 'customer' }],
    ['anonymous plain route (branch pick comes BEFORE login)', {}, {}],
  ])('missing tenant on %s → /branch-selection with from', (_l, props, who) => {
    tenant.slug = null
    setAuth(who)
    renderAt(props)
    expect(landedOn()).toBe('/branch-selection')
    expect(landedState()).toEqual({ from: '/secret' })
  })

  test.each(ROLES.filter((r) => r !== 'customer'))('missing tenant does not block a staff-pinned route for %s', (role) => {
    tenant.slug = null
    setAuth({ role })
    renderAt({ requiredRole: [role] })
    expect(landedOn()).toBe('PROTECTED')
  })

  test('the branch picker itself is not redirected to itself', () => {
    tenant.slug = null
    setAuth({ guest: true })
    render(
      <MemoryRouter initialEntries={['/branch-selection']}>
        <Routes>
          <Route path="/branch-selection" element={<ProtectedRoute allowGuest><div>PICKER</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('PICKER')).toBeInTheDocument()
  })

  test.each(ROLES)('mustChangePassword forces %s to /force-change-password with audience', (role) => {
    setAuth({ role, mustChangePassword: true, audience: role === 'superadmin' ? 'platform' : 'staff' })
    renderAt({ requiredRole: [role] })
    expect(landedOn()).toBe('/force-change-password')
    expect(landedState()).toEqual({ audience: role === 'superadmin' ? 'platform' : 'staff' })
  })

  test('expired session (auth state cleared) on a staff route → /staff-login', () => {
    setAuth({ role: 'admin' })
    const { unmount } = renderAt({ requiredRole: ['admin'] })
    expect(landedOn()).toBe('PROTECTED')
    unmount()
    setAuth() // AuthContext dropped the user after refresh failure / expiry
    renderAt({ requiredRole: ['admin'] })
    expect(landedOn()).toBe('/staff-login')
  })
})

describe('CaptainOnlyRoute', () => {
  test.each([
    ['captain', true], ['admin', true], ['waiter', false], ['manager', false], ['chef', false],
  ])('%s → children shown: %s', (role, shown) => {
    setAuth({ role })
    render(<CaptainOnlyRoute><div>CAPTAIN-ONLY</div></CaptainOnlyRoute>)
    expect(!!screen.queryByText('CAPTAIN-ONLY')).toBe(shown)
    if (!shown) expect(screen.getByText('Captain Access Only')).toBeInTheDocument()
  })

  test('custom fallback and loading state', () => {
    setAuth({ role: 'waiter' })
    const { unmount } = render(<CaptainOnlyRoute fallback={<p>nope</p>}><div>X</div></CaptainOnlyRoute>)
    expect(screen.getByText('nope')).toBeInTheDocument()
    unmount()
    setAuth({ role: 'captain', loading: true })
    render(<CaptainOnlyRoute><div>X</div></CaptainOnlyRoute>)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})
