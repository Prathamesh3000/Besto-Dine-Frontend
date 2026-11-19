import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

// The real portalAccess drives the mocked context so the helpers under test
// are the production ones.
let current
vi.mock('@/Context/AuthContext', async () => {
  const pa = await import('@/Pages/SuperAdmin/portalAccess')
  return {
    useAuth: () => ({
      user: current,
      logout: vi.fn(),
      isSuperAdmin: current?.role === 'superadmin',
      isFullSuperAdmin: current?.role === 'superadmin' && current?.superadminLevel === 'full',
      canViewModule: (k) => pa.canViewModule(current, k),
      canManageModule: (k) => pa.canManageModule(current, k),
    }),
  }
})

import { firstAllowedPath, canOpen, portalHomePath, canViewModule, canManageModule, PORTAL_NAV } from '@/Pages/SuperAdmin/portalAccess'
import RequireModule from '@/Components/RequireModule'
import SuperAdminLayout from '@/Pages/SuperAdmin/SuperAdminLayout'
import Leads from '@/Pages/SuperAdmin/Leads'

const FULL = { role: 'superadmin', superadminLevel: 'full', name: 'Root', email: 'r@x.in' }
const SUPPORT = { role: 'superadmin', superadminLevel: 'support', name: 'Sup', email: 's@x.in' }
const staff = (platformAccess) => ({ role: 'platformstaff', superadminLevel: '', platformAccess, name: 'Tm', email: 't@x.in' })
const CUSTOMER = { role: 'customer' }

describe('portalAccess helpers', () => {
  test('canViewModule / canManageModule per user type', () => {
    expect(canViewModule(FULL, 'plans') && canManageModule(FULL, 'plans')).toBe(true)
    expect(canViewModule(SUPPORT, 'plans')).toBe(true)
    expect(canManageModule(SUPPORT, 'plans')).toBe(false)
    const s = staff({ leads: 'view', signupLeads: 'manage' })
    expect(canViewModule(s, 'leads')).toBe(true)
    expect(canManageModule(s, 'leads')).toBe(false)
    expect(canManageModule(s, 'signupLeads')).toBe(true)
    expect(canViewModule(s, 'signupLeads')).toBe(true) // manage includes view
    expect(canViewModule(s, 'blog')).toBe(false)
    expect(canViewModule(CUSTOMER, 'leads')).toBe(false)
    expect(canViewModule(null, 'leads')).toBe(false)
  })

  test('firstAllowedPath follows sidebar order', () => {
    expect(firstAllowedPath(FULL)).toBe('/superadmin/dashboard')
    expect(firstAllowedPath(staff({ blog: 'view', leads: 'view' }))).toBe('/superadmin/leads')
    expect(firstAllowedPath(staff({ trials: 'view', dashboard: 'view' }))).toBe('/superadmin/dashboard')
    expect(firstAllowedPath(staff({ payments: 'manage' }))).toBe('/superadmin/payments')
    expect(firstAllowedPath(staff({}))).toBeNull()
    expect(firstAllowedPath(CUSTOMER)).toBeNull()
  })

  test('portalHomePath: super admin keeps Overview, empty staff falls back', () => {
    expect(portalHomePath(SUPPORT)).toBe('/superadmin/dashboard')
    expect(portalHomePath(staff({ marketing: 'view' }))).toBe('/superadmin/marketing')
    expect(portalHomePath(staff({}))).toBe('/superadmin/dashboard')
  })

  test('fullOnly pages are closed to platform staff, fullLevel (Team) also to support', () => {
    expect(canOpen(FULL, { fullOnly: true })).toBe(true)
    expect(canOpen(SUPPORT, { fullOnly: true })).toBe(true)
    expect(canOpen(staff({ plans: 'manage' }), { fullOnly: true })).toBe(false)
    expect(canOpen(FULL, { fullLevel: true })).toBe(true)
    expect(canOpen(SUPPORT, { fullLevel: true })).toBe(false)
    expect(canOpen(staff({ plans: 'manage' }), { fullLevel: true })).toBe(false)
    expect(PORTAL_NAV.filter((n) => n.fullOnly).map((n) => n.key)).toEqual(['pending-approvals', 'audit-logs', 'security'])
    expect(PORTAL_NAV.filter((n) => n.fullLevel).map((n) => n.key)).toEqual(['team'])
  })
})

const Where = () => <div data-testid="where">{useLocation().pathname}</div>

const renderGuard = (guardProps, user, start = '/superadmin/payments') => {
  current = user
  return render(
    <MemoryRouter initialEntries={[start]}>
      <Where />
      <Routes>
        <Route path="/superadmin/payments" element={<RequireModule {...guardProps}><div>PAYMENTS</div></RequireModule>} />
        <Route path="/superadmin/leads" element={<RequireModule anyOf={['signupLeads', 'leads']}><div>LEADS</div></RequireModule>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequireModule', () => {
  test('allowed: renders children', () => {
    renderGuard({ module: 'payments' }, staff({ payments: 'view' }))
    expect(screen.getByText('PAYMENTS')).toBeInTheDocument()
  })

  test('anyOf allows when one module matches', () => {
    renderGuard({ anyOf: ['plans', 'payments'] }, staff({ payments: 'view' }))
    expect(screen.getByText('PAYMENTS')).toBeInTheDocument()
  })

  test('not allowed: redirects to the first allowed page', () => {
    renderGuard({ module: 'payments' }, staff({ leads: 'view' }))
    expect(screen.getByText('LEADS')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/superadmin/leads')
  })

  test('fullLevel blocks support', () => {
    renderGuard({ fullLevel: true }, SUPPORT)
    expect(screen.queryByText('PAYMENTS')).not.toBeInTheDocument()
  })

  test('fullOnly blocks platform staff but lets support through', () => {
    renderGuard({ fullOnly: true }, staff({ leads: 'view' }))
    expect(screen.queryByText('PAYMENTS')).not.toBeInTheDocument()
    renderGuard({ fullOnly: true }, SUPPORT)
    expect(screen.getByText('PAYMENTS')).toBeInTheDocument()
  })

  test('fullLevel allows a full super admin', () => {
    renderGuard({ fullLevel: true }, FULL)
    expect(screen.getByText('PAYMENTS')).toBeInTheDocument()
  })

  test('no access at all: message, no redirect (no loop)', () => {
    renderGuard({ module: 'payments' }, staff({}))
    expect(screen.getByRole('alert')).toHaveTextContent("You don't have access to any section yet. Ask the owner.")
    expect(screen.getByTestId('where')).toHaveTextContent('/superadmin/payments')
  })
})

const renderLayout = (user) => {
  current = user
  return render(
    <MemoryRouter initialEntries={['/superadmin/leads']}>
      <Routes><Route path="/superadmin" element={<SuperAdminLayout />}><Route path="leads" element={<div>x</div>} /></Route></Routes>
    </MemoryRouter>,
  )
}
const navLabels = () => Array.from(document.querySelectorAll('aside nav a')).map((a) => a.textContent.trim())

describe('SuperAdminLayout nav filtering', () => {
  test('full super admin sees every item including Team', () => {
    renderLayout(FULL)
    expect(navLabels()).toEqual(['Overview', 'Restaurants', 'Pending Approvals', 'Leads', 'Marketing', 'Blog', 'Plans', 'Payments', 'Audit Log', 'Security', 'Team'])
  })

  test('support sees everything except Team', () => {
    renderLayout(SUPPORT)
    expect(navLabels()).toEqual(['Overview', 'Restaurants', 'Pending Approvals', 'Leads', 'Marketing', 'Blog', 'Plans', 'Payments', 'Audit Log', 'Security'])
  })

  test('platform staff see only their modules; Leads shows for either lead module', () => {
    renderLayout(staff({ leads: 'view', trials: 'view' }))
    expect(navLabels()).toEqual(['Restaurants', 'Leads'])
  })

  test('staff with no modules see no nav items', () => {
    renderLayout(staff({}))
    expect(navLabels()).toEqual([])
  })

  test('nameless staff are labelled Team member', () => {
    renderLayout({ ...staff({ blog: 'view' }), name: '' })
    expect(screen.getAllByText('Team member').length).toBeGreaterThan(0)
  })
})

describe('Leads page tabs and write access for platform staff', () => {
  const lead = { _id: 'l1', name: 'Ravi', phone: '9876543210', email: 'r@x.in', status: 'new', createdAt: new Date().toISOString(), notes: [] }
  beforeEach(() => {
    api.get.mockReset().mockImplementation((url) => {
      if (url === '/superadmin/leads') return Promise.resolve({ data: { data: { leads: [lead], counts: { all: 1, new: 1 } } } })
      if (url === '/superadmin/signup-leads/summary') return Promise.resolve({ data: { success: true, data: { total: 0 } } })
      if (url === '/superadmin/signup-leads') return Promise.resolve({ data: { success: true, data: [], pagination: { page: 1, limit: 25, total: 0, pages: 1 } } })
      return Promise.reject(new Error(`unexpected GET ${url}`))
    })
  })
  const renderLeads = (user, search = '') => {
    current = user
    return render(<MemoryRouter initialEntries={[`/superadmin/leads${search}`]}><Leads /></MemoryRouter>)
  }

  test('leads-only staff: no tab bar, demo list shown, never calls signup-leads', async () => {
    renderLeads(staff({ leads: 'view' }))
    expect(await screen.findByText('Ravi')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(api.get.mock.calls.some(([u]) => u.startsWith('/superadmin/signup-leads'))).toBe(false)
  })

  test('signupLeads-only staff: ?tab=demo falls back to signups, never calls /leads', async () => {
    renderLeads(staff({ signupLeads: 'view' }), '?tab=demo')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/superadmin/signup-leads', expect.anything()))
    expect(api.get.mock.calls.some(([u]) => u === '/superadmin/leads')).toBe(false)
  })

  test('view-only leads staff: no Note / status / Convert / Delete buttons', async () => {
    renderLeads(staff({ leads: 'view' }))
    await screen.findByText('Ravi')
    for (const name of ['Note', 'Mark Contacted', 'Convert', 'Delete']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  test('manage leads staff: Note + status actions, but no Convert/Delete', async () => {
    renderLeads(staff({ leads: 'manage' }))
    await screen.findByText('Ravi')
    expect(screen.getByRole('button', { name: 'Note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Contacted' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Convert' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  test('full super admin keeps Convert and Delete', async () => {
    renderLeads(FULL, '?tab=demo')
    await screen.findByText('Ravi')
    expect(screen.getByRole('button', { name: 'Convert' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
