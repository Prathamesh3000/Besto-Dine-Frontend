/**
 * Pages/Platform/RegisterRestaurant - instant 14-day trial signup:
 *  201 -> owner is signed in + sent to the dashboard, 202 -> old pending
 *  screen, 409 EMAIL_IN_USE / PHONE_IN_USE -> inline error on that field.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const startSession = vi.fn()
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ startSession }) }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: {} }))
const publicAPI = vi.hoisted(() => ({ registerRestaurant: vi.fn(), checkSlugAvailability: vi.fn() }))
vi.mock('@/utils/api', () => ({ publicAPI, default: {} }))
const setActiveTenant = vi.hoisted(() => vi.fn())
vi.mock('@/utils/tenant', () => ({ setActiveTenant, getActiveTenantSlug: () => null }))
// Keep the real price helpers (the page imports formatPlanCyclePrice /
// publicCycleOptions); only the hooks are stubbed.
vi.mock('@/Pages/Platform/platformShared', async (orig) => {
  const actual = await orig()
  return { ...actual, usePageMeta: () => {}, usePublicPlans: () => ({ data: [] }), readUtm: () => null }
})
vi.mock('@/Pages/Platform/components/PlatformChrome', () => ({
  PlatformBrand: () => null,
  PlatformHeader: () => null,
  PlatformFooter: () => null,
}))

import RegisterRestaurant from '@/Pages/Platform/RegisterRestaurant'

// Each case types a whole multi-field form through userEvent (plus the
// 450ms slug debounce on the register page); that exceeds the 5s default
// when the suite runs in parallel on a slow machine.
vi.setConfig({ testTimeout: 30000 })

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/register-restaurant']}>
        <Routes>
          <Route path="/register-restaurant" element={<RegisterRestaurant />} />
          <Route path="/admin/dashboard" element={<div>ADMIN DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function fillAndSubmit(user) {
  await user.type(document.getElementById('restaurantName'), 'Spice Garden')
  await user.type(document.getElementById('city'), 'Pune')
  await waitFor(() => expect(publicAPI.checkSlugAvailability).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 450)) // slug debounce settles
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await waitFor(() => expect(document.getElementById('ownerName')).not.toBeNull())
  await user.type(document.getElementById('ownerName'), 'Asha Rao')
  await user.type(document.getElementById('contactEmail'), 'asha@spice.in')
  await user.type(document.getElementById('contactPhone'), '9876543210')
  await user.type(document.getElementById('password'), 'Secret#12345')
  await user.type(document.getElementById('confirmPassword'), 'Secret#12345')
  fireEvent.click(document.getElementById('acceptTerms'))
  await user.click(screen.getByRole('button', { name: /start free trial/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  publicAPI.checkSlugAvailability.mockResolvedValue({ data: { data: { available: true, slug: 'spice-garden' } } })
  startSession.mockReturnValue({ success: true, user: { role: 'admin', tenant: { slug: 'spice-garden', name: 'Spice Garden', _id: 't1' } } })
})

describe('RegisterRestaurant - instant trial', () => {
  test('advertises the free trial, no card, instant access', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /14-day free trial/i })).toBeInTheDocument()
    expect(screen.getAllByText(/no card needed/i).length).toBeGreaterThan(0)
  })

  test('201: signs the owner in, welcomes them and opens the dashboard', async () => {
    publicAPI.registerRestaurant.mockResolvedValue({
      status: 201,
      data: {
        success: true,
        data: { trialStarted: true, autoLogin: true, trialDays: 14, restaurant: { slug: 'spice-garden' } },
        message: 'Welcome',
        token: 'tok', refreshToken: 'ref', _id: 'u1', role: 'admin', tenant: { slug: 'spice-garden', status: 'trial', daysLeft: 14 },
      },
    })
    const user = renderPage()
    await fillAndSubmit(user)
    // A short ProvisioningProgress screen precedes the redirect.
    expect(await screen.findByTestId('provisioning-progress')).toBeInTheDocument()
    expect(await screen.findByText('ADMIN DASHBOARD', {}, { timeout: 3000 })).toBeInTheDocument()
    // login body is handed over without the response envelope fields
    const body = startSession.mock.calls[0][0]
    expect(body).toMatchObject({ token: 'tok', refreshToken: 'ref', role: 'admin' })
    expect(body).not.toHaveProperty('data')
    expect(body).not.toHaveProperty('success')
    expect(toast.success).toHaveBeenCalledWith('Your 14-day free trial has started', expect.anything())
    expect(setActiveTenant).toHaveBeenCalledWith(expect.objectContaining({ slug: 'spice-garden' }))
  })

  test('202: keeps the old pending-review screen and does not sign in', async () => {
    publicAPI.registerRestaurant.mockResolvedValue({
      status: 202,
      data: { success: true, data: { signupStatus: 'pending', restaurant: { name: 'Spice Garden', slug: 'spice-garden' }, owner: { email: 'asha@spice.in' } }, message: 'Under review' },
    })
    const user = renderPage()
    await fillAndSubmit(user)
    expect(await screen.findByText('Application received')).toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
  })

  test.each([
    ['EMAIL_IN_USE', 'contactEmail', 'That email is already registered.'],
    ['PHONE_IN_USE', 'contactPhone', 'That phone number is already registered.'],
  ])('409 %s shows an inline error on %s', async (code, field, message) => {
    publicAPI.registerRestaurant.mockRejectedValue({ response: { status: 409, data: { success: false, code, field, message } } })
    const user = renderPage()
    await fillAndSubmit(user)
    const input = await waitFor(() => {
      const el = document.getElementById(field)
      expect(el).toHaveAttribute('aria-invalid', 'true')
      return el
    })
    expect(screen.getAllByText(message).length).toBeGreaterThan(0)
    expect(document.getElementById(`${field}-error`)).toHaveTextContent(message)
    expect(input).toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
  })
})
