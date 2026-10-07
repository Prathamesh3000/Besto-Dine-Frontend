import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import RequireFeature from '@/Components/RequireFeature'
import { resolveModule, isAddonActive, MODULE_KEYS } from '@/utils/moduleAccess'

function setAuth({ role = 'admin', features = {}, planName = 'Silver' } = {}) {
  auth = {
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
