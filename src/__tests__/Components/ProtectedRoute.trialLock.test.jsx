/**
 * ProtectedRoute - a locked tenant's staff are routed to /trial-expired (the
 * owner can still reach billing); read-only and paid users are unaffected.
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
const locked = { role: 'admin', tenant: { status: 'suspended', trialState: 'locked', trialExpired: true, readOnly: false } }
const legacyLocked = { role: 'admin', tenant: { status: 'suspended', trialExpired: true } }
const lockedWaiter = { role: 'waiter', tenant: { status: 'suspended', trialState: 'locked', trialExpired: true } }
const readOnly = { role: 'admin', tenant: { status: 'trial', trialState: 'read_only', readOnly: true, trialExpired: false, lockAt: '2026-11-20T00:00:00.000Z' } }
const readOnlyWaiter = { role: 'waiter', tenant: { status: 'trial', trialState: 'read_only', readOnly: true } }
const active = { role: 'admin', tenant: { status: 'active', trialState: 'none', trialExpired: false } }
const onTrial = { role: 'admin', tenant: { status: 'trial', trialState: 'active', daysLeft: 9 } }

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
  test('legacy snapshot (trialExpired only) still counts as locked', () => {
    at('/admin/menu', legacyLocked)
    expect(screen.getByText('LOCKSCREEN')).toBeInTheDocument()
  })
  test('locked owner is bounced from the waiter app too', () => {
    at('/waiter/home', locked)
    expect(screen.getByText('LOCKSCREEN')).toBeInTheDocument()
  })
  test('locked non-owner staff are bounced as well', () => {
    at('/waiter/home', lockedWaiter)
    expect(screen.getByText('LOCKSCREEN')).toBeInTheDocument()
  })
  test('billing stays reachable while locked (no bounce loop)', () => {
    at('/admin/subscription', locked)
    expect(screen.getByText('BILLING')).toBeInTheDocument()
  })
  test('read-only owner keeps navigating', () => {
    at('/admin/menu', readOnly)
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })
  test('read-only staff keep navigating', () => {
    at('/waiter/home', readOnlyWaiter)
    expect(screen.getByText('WAITER')).toBeInTheDocument()
  })
  test('active trial passes through', () => {
    at('/admin/menu', onTrial)
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })
  test('paid / unlocked owner passes through', () => {
    at('/admin/menu', active)
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })
})
