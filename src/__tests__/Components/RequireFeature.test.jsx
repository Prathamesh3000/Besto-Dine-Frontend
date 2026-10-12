import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import RequireFeature from '@/Components/RequireFeature'
import { resolveModule, isAddonActive, MODULE_KEYS } from '@/utils/moduleAccess'

function setAuth({ role = 'admin', features = {}, planName = 'Silver', operations } = {}) {
  auth = {
    operations,
    user: { role },
    tenant: { planName },
    hasFeature: (k) => features[k] === true,
    logout: vi.fn(),
  }
}

const renderGate = (props) => render(
  <MemoryRouter>
    <RequireFeature {...props}><div>PAGE</div></RequireFeature>
  </MemoryRouter>,
)

beforeEach(() => setAuth())

describe('RequireFeature', () => {
  test('module in the plan → renders the page', () => {
    setAuth({ features: { inventory: true } })
    renderGate({ feature: 'inventory' })
    expect(screen.getByText('PAGE')).toBeInTheDocument()
  })

  test('locked for an owner → upgrade screen with a link to plans', () => {
    setAuth({ role: 'admin', planName: 'Silver' })
    renderGate({ feature: 'crm' })
    expect(screen.queryByText('PAGE')).not.toBeInTheDocument()
    expect(screen.getByTestId('feature-locked')).toHaveTextContent('Customer Management is not in your plan')
    expect(screen.getByTestId('feature-locked')).toHaveTextContent('Silver')
    expect(screen.getByRole('link', { name: /View plans/ })).toHaveAttribute('href', '/admin/subscription')
  })

  test('locked for a waiter → ask-your-owner copy and a sign-out button (no upgrade link)', () => {
    setAuth({ role: 'waiter' })
    renderGate({ feature: 'waiterDashboard', roles: ['waiter', 'captain'] })
    expect(screen.getByTestId('feature-locked')).toHaveTextContent('ask your restaurant owner')
    expect(screen.queryByRole('link', { name: /View plans/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }))
    expect(auth.logout).toHaveBeenCalled()
  })

  test('roles limit who the gate applies to (admin on /waiter/* passes)', () => {
    setAuth({ role: 'admin' })
    renderGate({ feature: 'waiterDashboard', roles: ['waiter', 'captain'] })
    expect(screen.getByText('PAGE')).toBeInTheDocument()
  })
})

describe('RequireFeature — operations profile (role not in use)', () => {
  const offOps = (roles) => ({ roles: { waiter: true, captain: true, chef: true, ...roles } })

  test.each([
    ['waiter', 'the waiter app'],
    ['captain', 'the captain app'],
    ['chef', 'the kitchen screen'],
  ])('%s switched off → RoleNotInUseScreen naming %s, with sign-out', (role, label) => {
    setAuth({ role, features: { waiterDashboard: true }, operations: offOps({ [role]: false }) })
    renderGate({ feature: 'waiterDashboard' })
    expect(screen.queryByText('PAGE')).not.toBeInTheDocument()
    const screenEl = screen.getByTestId('role-not-in-use')
    expect(screenEl).toHaveTextContent('Not used at your restaurant')
    expect(screenEl).toHaveTextContent(label)
    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }))
    expect(auth.logout).toHaveBeenCalled()
  })

  test('another role switched off does not block this one', () => {
    setAuth({ role: 'chef', features: { waiterDashboard: true }, operations: offOps({ waiter: false, captain: false }) })
    renderGate({ feature: 'waiterDashboard' })
    expect(screen.getByText('PAGE')).toBeInTheDocument()
  })

  test('no operations profile (older login) → page renders', () => {
    setAuth({ role: 'waiter', features: { waiterDashboard: true } })
    renderGate({ feature: 'waiterDashboard' })
    expect(screen.getByText('PAGE')).toBeInTheDocument()
  })

  test('admin / manager are never role-gated even if profile says false', () => {
    setAuth({ role: 'admin', features: { waiterDashboard: true }, operations: { roles: { admin: false, manager: false } } })
    renderGate({ feature: 'waiterDashboard' })
    expect(screen.getByText('PAGE')).toBeInTheDocument()
  })

  test('plan-locked takes precedence over role-not-in-use', () => {
    setAuth({ role: 'waiter', features: {}, operations: offOps({ waiter: false }) })
    renderGate({ feature: 'waiterDashboard', roles: ['waiter', 'captain'] })
    expect(screen.getByTestId('feature-locked')).toBeInTheDocument()
    expect(screen.queryByTestId('role-not-in-use')).not.toBeInTheDocument()
  })

  test('roles prop excludes the role → passes through even when switched off', () => {
    setAuth({ role: 'chef', features: {}, operations: offOps({ chef: false }) })
    renderGate({ feature: 'waiterDashboard', roles: ['waiter', 'captain'] })
    expect(screen.getByText('PAGE')).toBeInTheDocument()
  })
})

describe('moduleAccess.resolveModule (Super Admin modules panel)', () => {
  const r = (features, extra = {}) => ({ subscription: { features }, ...extra })

  test('plan / add-on / override sources', () => {
    expect(resolveModule(r({ crm: true }), 'crm')).toMatchObject({ on: true, source: 'plan', inPlan: true })
    expect(resolveModule(r({}, { addons: [{ key: 'kiosk', status: 'active' }] }), 'kiosk')).toMatchObject({ on: true, source: 'addon', inPlan: false })
    expect(resolveModule(r({ crm: true }, { featureOverrides: { crm: false } }), 'crm')).toMatchObject({ on: false, source: 'override' })
    expect(resolveModule(r({}, { featureOverrides: { crm: true } }), 'crm')).toMatchObject({ on: true, source: 'override' })
  })

  test('expired / cancelled add-ons do not count', () => {
    const past = new Date(Date.now() - 86400000).toISOString()
    expect(isAddonActive({ status: 'active', endDate: past })).toBe(false)
    expect(isAddonActive({ status: 'cancelled' })).toBe(false)
    expect(resolveModule(r({}, { addons: [{ key: 'kiosk', status: 'active', endDate: past }] }), 'kiosk').on).toBe(false)
  })

  test('lists every boolean module once', () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length)
    expect(MODULE_KEYS).toEqual(expect.arrayContaining(['campaigns', 'eInvoice', 'whiteLabelBranding', 'kiosk']))
  })
})
