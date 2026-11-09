/**
 * ProtectedRoute - a trial-locked owner is routed to /trial-expired but can
 * still reach billing; unlocked users are unaffected.
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => auth,
  STAFF_ROLES: ['waiter', 'captain', 'admin', 'manager'],
  CUSTOMER_ROLES: ['customer'],
}))
vi.mock('@/utils/tenant', () => ({ getActiveTenantSlug: () => 'spice' }))

import ProtectedRoute from '@/Components/ProtectedRoute'

const mkAuth = (user) => ({
  isAuthenticated: !!user, isGuest: false, isLoading: false, mustChangePassword: false, audience: 'staff', user,
  hasRole: (r) => !!user && (Array.isArray(r) ? r.includes(user.role) : r === user.role),
})
const locked = { role: 'admin', tenant: { status: 'suspended', trialExpired: true } }
const active = { role: 'admin', tenant: { status: 'active', trialExpired: false } }

function at(path, user) {
  auth = mkAuth(user)
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trial-expired" element={<div>LOCKSCREEN</div>} />
        <Route path="/admin/subscription" element={<ProtectedRoute requiredRole={['admin']}><div>BILLING</div></ProtectedRoute>} />
        <Route path="/admin/menu" element={<ProtectedRoute requiredRole={['admin']}><div>MENU</div></ProtectedRoute>} />
        <Route path="/waiter/home" element={<ProtectedRoute requiredRole={['admin', 'waiter']}><div>WAITER</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute trial lock', () => {
  test('locked owner is bounced from admin pages to the lock screen', () => {
    at('/admin/menu', locked)
    expect(screen.getByText('LOCKSCREEN')).toBeInTheDocument()
  })
  test('locked owner is bounced from the waiter app too', () => {
    at('/waiter/home', locked)
    expect(screen.getByText('LOCKSCREEN')).toBeInTheDocument()
  })
  test('billing stays reachable while locked (no bounce loop)', () => {
    at('/admin/subscription', locked)
    expect(screen.getByText('BILLING')).toBeInTheDocument()
  })
  test('paid / unlocked owner passes through', () => {
    at('/admin/menu', active)
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })
})
