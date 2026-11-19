/**
 * Pages/Platform/StartTrial — /start-trial sends exactly the contract body
 * (no plan / price / length), signs the owner in on 201 after the
 * provisioning screen, and renders the server's 409 / 503 messages.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../_helpers/queryWrapper'

const startSession = vi.fn()
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ startSession }) }))
const toast = vi.hoisted(() => {
  const fn = vi.fn()
  fn.success = vi.fn()
  fn.error = vi.fn()
  return fn
})
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
const publicAPI = vi.hoisted(() => ({ startTrial: vi.fn() }))
vi.mock('@/utils/api', () => ({ publicAPI, default: {} }))
const setActiveTenant = vi.hoisted(() => vi.fn())
vi.mock('@/utils/tenant', () => ({ setActiveTenant, getActiveTenantSlug: () => null }))
vi.mock('@/Pages/Platform/platformShared', async (orig) => {
  const actual = await orig()
  return { ...actual, usePageMeta: () => {} }
})
vi.mock('@/Pages/Platform/components/PlatformChrome', () => ({
  PlatformBrand: () => null, PlatformHeader: () => null, PlatformFooter: () => null,
}))
// i18n is not initialised in unit tests: interpolate the default string like i18next does.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key, def, opts) => (typeof def === 'string' ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? '')) : _key),
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}))

import StartTrial from '@/Pages/Platform/StartTrial'

// Each case types a whole multi-field form through userEvent (plus the
// 450ms slug debounce on the register page); that exceeds the 5s default
// when the suite runs in parallel on a slow machine.
vi.setConfig({ testTimeout: 30000 })

function renderPage() {
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={['/start-trial']}>
        <Routes>
          <Route path="/start-trial" element={<StartTrial />} />
          <Route path="/admin/dashboard" element={<div>ADMIN DASHBOARD</div>} />
          <Route path="/staff-login" element={<div>STAFF LOGIN</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function fillAndSubmit(user) {
  await user.type(document.getElementById('orgName'), 'Spice Garden')
  await user.type(document.getElementById('adminName'), 'Asha Rao')
  await user.type(document.getElementById('email'), 'Asha@Spice.in')
  await user.type(document.getElementById('phone'), '9876543210')
  await user.type(document.getElementById('adminPassword'), 'Secret#12345')
  await user.click(screen.getByRole('button', { name: /start free trial/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  startSession.mockReturnValue({ success: true, user: { role: 'admin', tenant: { slug: 'spice-garden', name: 'Spice Garden', _id: 't1' } } })
})

describe('StartTrial', () => {
  test('has no plan picker or payment and submits exactly the 5 contract fields', async () => {
    publicAPI.startTrial.mockResolvedValue({
      status: 201,
      data: {
        success: true,
        data: { trialStarted: true, restaurant: { slug: 'spice-garden', name: 'Spice Garden' } },
        token: 'tok', refreshToken: 'ref', _id: 'u1', role: 'admin', tenant: { slug: 'spice-garden', status: 'trial' },
      },
    })
    const user = renderPage()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByText(/pay ₹/i)).toBeNull()
    expect(screen.queryByText(/billing period/i)).toBeNull()
    await fillAndSubmit(user)

    expect(publicAPI.startTrial).toHaveBeenCalledTimes(1)
    const body = publicAPI.startTrial.mock.calls[0][0]
    expect(body).toEqual({
      orgName: 'Spice Garden', adminName: 'Asha Rao', email: 'asha@spice.in', phone: '9876543210', adminPassword: 'Secret#12345',
    })
    expect(Object.keys(body).sort()).toEqual(['adminName', 'adminPassword', 'email', 'orgName', 'phone'])
    for (const k of ['planId', 'plan', 'price', 'trialDays', 'billingCycle', 'payment']) expect(body).not.toHaveProperty(k)

    // Provisioning screen, then signed in and sent to the dashboard.
    expect(await screen.findByTestId('provisioning-progress')).toBeInTheDocument()
    expect(screen.getByText('Setting up Spice Garden…')).toBeInTheDocument()
    expect(await screen.findByText('ADMIN DASHBOARD', {}, { timeout: 3000 })).toBeInTheDocument()
    const login = startSession.mock.calls[0][0]
    expect(login).toMatchObject({ token: 'tok', refreshToken: 'ref', role: 'admin' })
    expect(login).not.toHaveProperty('data')
    expect(setActiveTenant).toHaveBeenCalledWith(expect.objectContaining({ slug: 'spice-garden' }))
    expect(toast.success).toHaveBeenCalledWith('Your 14-day free trial has started', expect.anything())
  })

  test('409 EMAIL_IN_USE shows the server message on the email field with a Sign in link', async () => {
    publicAPI.startTrial.mockRejectedValue({
      response: { status: 409, data: { success: false, code: 'EMAIL_IN_USE', field: 'email', message: 'This email already has an account. Please sign in.' } },
    })
    const user = renderPage()
    await fillAndSubmit(user)
    await waitFor(() => expect(document.getElementById('email')).toHaveAttribute('aria-invalid', 'true'))
    const err = document.getElementById('email-error')
    expect(err).toHaveTextContent('This email already has an account. Please sign in.')
    const link = screen.getByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', '/staff-login')
    expect(startSession).not.toHaveBeenCalled()
  })

  test('503 TRIAL_UNAVAILABLE shows the server message and does not sign in', async () => {
    publicAPI.startTrial.mockRejectedValue({
      response: { status: 503, data: { success: false, code: 'TRIAL_UNAVAILABLE', message: 'Free trials are temporarily unavailable' } },
    })
    const user = renderPage()
    await fillAndSubmit(user)
    expect(await screen.findByRole('alert')).toHaveTextContent('Free trials are temporarily unavailable')
    expect(startSession).not.toHaveBeenCalled()
    expect(screen.queryByTestId('provisioning-progress')).toBeNull()
  })

  test('202 (approval mode) shows the Application received screen', async () => {
    publicAPI.startTrial.mockResolvedValue({
      status: 202,
      data: { success: true, data: { signupStatus: 'pending', restaurant: { name: 'Spice Garden', slug: 'spice-garden' }, owner: { email: 'asha@spice.in' } }, message: 'Under review' },
    })
    const user = renderPage()
    await fillAndSubmit(user)
    expect(await screen.findByText('Application received')).toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
  })
})
