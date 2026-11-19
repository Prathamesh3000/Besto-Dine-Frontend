/**
 * Pages/Platform/RegisterRestaurant — plan rules (plan §5):
 *  paid plan  → step 3 "Payment": Pay button disabled until register-order
 *               resolves, label "Pay ₹<server amount>", amount mismatch stops
 *               before Razorpay opens, success submits with `payment`;
 *  free plan  → no payment step, submitted directly, "active" toast.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
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
const publicAPI = vi.hoisted(() => ({ registerRestaurant: vi.fn(), registerOrder: vi.fn(), checkSlugAvailability: vi.fn() }))
vi.mock('@/utils/api', () => ({ publicAPI, default: {} }))
vi.mock('@/utils/tenant', () => ({ setActiveTenant: vi.fn(), getActiveTenantSlug: () => null }))
const plansRef = vi.hoisted(() => ({ current: [] }))
vi.mock('@/Pages/Platform/platformShared', async (orig) => {
  const actual = await orig()
  return { ...actual, usePageMeta: () => {}, usePublicPlans: () => ({ data: plansRef.current, isLoading: false }), readUtm: () => null }
})
// Plan §3 contract for getCTA / isFreePlan — a local stand-in so this test
// does not depend on the helper's own test coverage.
vi.mock('@/utils/planCta', () => {
  const isFreePlan = (p) => (Number(p?.tier) || 0) < 30 && !(Number(p?.price) > 0)
    && ['monthly', 'annual', 'biennial'].every((k) => !(Number(p?.prices?.[k]) > 0))
  const getCTA = (p) => {
    if ((Number(p?.tier) || 0) >= 30) return { kind: 'contact', to: '/contact', label: 'Contact Sales' }
    if (p?.trial?.enabled) return { kind: 'trial', to: '/start-trial', label: 'Start Free Trial' }
    if (isFreePlan(p)) return { kind: 'free', to: `/register-restaurant?plan=${p.slug}`, label: 'Get Started' }
    return { kind: 'paid', to: `/register-restaurant?plan=${p.slug}`, label: 'Get Started' }
  }
  const trialDaysOf = (p) => (p?.trial?.enabled ? Number(p.trial.durationDays) || 0 : Number(p?.trialDays) || 0)
  return { getCTA, isFreePlan, trialDaysOf, default: getCTA }
})
vi.mock('@/Pages/Platform/components/PlatformChrome', () => ({
  PlatformBrand: () => null, PlatformHeader: () => null, PlatformFooter: () => null,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key, def, opts) => (typeof def === 'string' ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? '')) : _key),
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}))

import RegisterRestaurant from '@/Pages/Platform/RegisterRestaurant'

// Each case types a whole multi-field form through userEvent (plus the
// 450ms slug debounce on the register page); that exceeds the 5s default
// when the suite runs in parallel on a slow machine.
vi.setConfig({ testTimeout: 30000 })

const GOLD = {
  _id: 'id-gold', name: 'Gold', slug: 'gold', tier: 20, price: 1799, prices: { monthly: 1799, annual: 17999, biennial: 28799 },
  gstRate: 18, trial: { enabled: false, durationDays: 0 }, trialDays: 0, features: {}, limits: {},
}
const STARTER = {
  _id: 'id-starter', name: 'Starter', slug: 'starter', tier: 0, price: 0, prices: { monthly: 0, annual: 0, biennial: 0 },
  gstRate: 18, trial: { enabled: false, durationDays: 0 }, trialDays: 0, features: {}, limits: {},
}
// 1799 + 18% GST
const GOLD_MONTHLY_TOTAL_PAISE = 212282
const GOLD_MONTHLY_TOTAL_LABEL = '₹2,122.82'

function renderPage(plans, entry = '/register-restaurant') {
  plansRef.current = plans
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/register-restaurant" element={<RegisterRestaurant />} />
          <Route path="/admin/dashboard" element={<div>ADMIN DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

async function fillStep1(user) {
  await user.type(document.getElementById('restaurantName'), 'Spice Garden')
  await user.type(document.getElementById('city'), 'Pune')
  await waitFor(() => expect(publicAPI.checkSlugAvailability).toHaveBeenCalled())
  await new Promise((r) => setTimeout(r, 450)) // slug debounce settles
}
async function fillStep2(user) {
  await waitFor(() => expect(document.getElementById('ownerName')).not.toBeNull())
  await user.type(document.getElementById('ownerName'), 'Asha Rao')
  await user.type(document.getElementById('contactEmail'), 'asha@spice.in')
  await user.type(document.getElementById('contactPhone'), '9876543210')
  await user.type(document.getElementById('password'), 'Secret#12345')
  await user.type(document.getElementById('confirmPassword'), 'Secret#12345')
  fireEvent.click(document.getElementById('acceptTerms'))
}

let RazorpayMock
beforeEach(() => {
  vi.clearAllMocks()
  publicAPI.checkSlugAvailability.mockResolvedValue({ data: { data: { available: true, slug: 'spice-garden' } } })
  startSession.mockReturnValue({ success: true, user: { role: 'admin', tenant: { slug: 'spice-garden', name: 'Spice Garden', _id: 't1' } } })
  RazorpayMock = vi.fn(function Razorpay() { this.open = vi.fn(); this.on = vi.fn() })
  window.Razorpay = RazorpayMock
})
afterEach(() => { delete window.Razorpay })

describe('RegisterRestaurant — paid plan', () => {
  test('plan picker labels the outcome per plan and shows per-cycle prices with savings', async () => {
    renderPage([GOLD, STARTER], '/register-restaurant?plan=gold')
    const gold = await screen.findByTestId('plan-option-gold')
    expect(within(gold).getByRole('radio')).toBeChecked()
    expect(gold).toHaveTextContent('Pay ₹1,799 / month')
    const starter = screen.getByTestId('plan-option-starter')
    expect(starter).toHaveTextContent('Free')
    expect(starter).not.toHaveTextContent('₹')
    // Cycle toggle from the real prices: 17999/yr vs 1799*12 → 17% saving
    const annual = screen.getByTestId('signup-cycle-annual')
    expect(annual).toHaveTextContent('Save 17%')
    await userEvent.click(annual)
    expect(screen.getByTestId('plan-option-gold')).toHaveTextContent('Pay ₹17,999 / year')
    expect(screen.getByTestId('signup-cycle-biennial')).toHaveTextContent('Save 33%')
  })

  test('Pay button is disabled until register-order resolves, then reads "Pay ₹<amount>"; checkout submits with payment', async () => {
    let resolveOrder
    publicAPI.registerOrder.mockImplementation(() => new Promise((res) => { resolveOrder = res }))
    publicAPI.registerRestaurant.mockResolvedValue({
      status: 201,
      data: { success: true, data: { trialStarted: false, restaurant: { slug: 'spice-garden', name: 'Spice Garden' } }, token: 'tok', refreshToken: 'ref', role: 'admin' },
    })
    const user = renderPage([GOLD], '/register-restaurant?plan=gold')
    expect(screen.getByRole('heading', { name: 'Get started with Gold' })).toBeInTheDocument()
    await fillStep1(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await fillStep2(user)
    expect(publicAPI.registerRestaurant).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /continue to payment/i }))

    // Step 3 — order in flight: total from the plan data, Pay disabled.
    const pay = await screen.findByTestId('pay-button')
    expect(pay).toBeDisabled()
    expect(pay).toHaveTextContent(`Pay ${GOLD_MONTHLY_TOTAL_LABEL}`)
    expect(screen.getByTestId('payment-total')).toHaveTextContent(GOLD_MONTHLY_TOTAL_LABEL)
    expect(screen.getByText('Total due today')).toBeInTheDocument()
    expect(publicAPI.registerOrder).toHaveBeenCalledWith({ planId: 'id-gold', billingCycle: 'monthly' })
    expect(publicAPI.registerRestaurant).not.toHaveBeenCalled()

    resolveOrder({
      data: {
        success: true,
        data: {
          orderId: 'order_1', amount: GOLD_MONTHLY_TOTAL_PAISE, currency: 'INR', keyId: 'rzp_test_key', plan: { slug: 'gold', name: 'Gold' },
          billingCycle: 'monthly', baseAmount: 179900, gstAmount: 32382, gstRate: 18,
        },
      },
    })
    await waitFor(() => expect(pay).toBeEnabled())
    expect(pay).toHaveTextContent(`Pay ${GOLD_MONTHLY_TOTAL_LABEL}`)
    expect(screen.queryByTestId('payment-mismatch')).toBeNull()

    await user.click(pay)
    await waitFor(() => expect(RazorpayMock).toHaveBeenCalledTimes(1))
    const options = RazorpayMock.mock.calls[0][0]
    expect(options).toMatchObject({ key: 'rzp_test_key', order_id: 'order_1', amount: GOLD_MONTHLY_TOTAL_PAISE, currency: 'INR' })
    expect(RazorpayMock.mock.instances[0].open).toHaveBeenCalled()

    // Razorpay success → register-restaurant with the payment proof.
    options.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
    await waitFor(() => expect(publicAPI.registerRestaurant).toHaveBeenCalledTimes(1))
    expect(publicAPI.registerRestaurant.mock.calls[0][0]).toMatchObject({
      planId: 'id-gold', billingCycle: 'monthly',
      payment: { razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_1', razorpaySignature: 'sig' },
    })
    expect(await screen.findByText('ADMIN DASHBOARD', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Payment received — your account is active', expect.anything())
  })

  test('server amount differing from the displayed total stops before checkout and shows the new figure', async () => {
    publicAPI.registerOrder.mockResolvedValue({
      data: { success: true, data: { orderId: 'order_2', amount: 250000, currency: 'INR', keyId: 'k', plan: { slug: 'gold', name: 'Gold' }, billingCycle: 'monthly' } },
    })
    const user = renderPage([GOLD], '/register-restaurant?plan=gold')
    await fillStep1(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /continue to payment/i }))

    const warn = await screen.findByTestId('payment-mismatch')
    expect(warn).toHaveTextContent('The amount changed, please review.')
    expect(warn).toHaveTextContent('₹2,500')
    expect(warn).toHaveTextContent(GOLD_MONTHLY_TOTAL_LABEL)
    const pay = screen.getByTestId('pay-button')
    expect(pay).toBeDisabled()
    await user.click(pay)
    expect(RazorpayMock).not.toHaveBeenCalled()
    expect(publicAPI.registerRestaurant).not.toHaveBeenCalled()

    // Reviewing and accepting the new figure re-enables Pay with that amount.
    await user.click(screen.getByRole('button', { name: 'Continue with ₹2,500' }))
    await waitFor(() => expect(screen.getByTestId('pay-button')).toBeEnabled())
    expect(screen.getByTestId('pay-button')).toHaveTextContent('Pay ₹2,500')
  })

  test('PAYMENT_MISMATCH from register-restaurant shows the server message on the payment step', async () => {
    publicAPI.registerOrder.mockResolvedValue({
      data: { success: true, data: { orderId: 'order_3', amount: GOLD_MONTHLY_TOTAL_PAISE, currency: 'INR', keyId: 'k', plan: { slug: 'gold', name: 'Gold' }, billingCycle: 'monthly' } },
    })
    publicAPI.registerRestaurant.mockRejectedValue({
      response: { status: 400, data: { success: false, code: 'PAYMENT_MISMATCH', message: 'Payment does not match this order. Please review and try again.' } },
    })
    const user = renderPage([GOLD], '/register-restaurant?plan=gold')
    await fillStep1(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /continue to payment/i }))
    const pay = await screen.findByTestId('pay-button')
    await waitFor(() => expect(pay).toBeEnabled())
    await user.click(pay)
    await waitFor(() => expect(RazorpayMock).toHaveBeenCalled())
    RazorpayMock.mock.calls[0][0].handler({ razorpay_order_id: 'order_3', razorpay_payment_id: 'pay_3', razorpay_signature: 'bad' })
    expect(await screen.findByText('Payment does not match this order. Please review and try again.')).toBeInTheDocument()
    expect(screen.getByTestId('payment-step')).toBeInTheDocument()
    expect(startSession).not.toHaveBeenCalled()
  })
})

describe('RegisterRestaurant — free plan', () => {
  test('skips the payment step, submits directly and reports an active account', async () => {
    publicAPI.registerRestaurant.mockResolvedValue({
      status: 201,
      data: { success: true, data: { trialStarted: false, restaurant: { slug: 'spice-garden', name: 'Spice Garden' } }, token: 'tok', refreshToken: 'ref', role: 'admin' },
    })
    const user = renderPage([GOLD, STARTER], '/register-restaurant?plan=starter')
    expect(screen.getByRole('heading', { name: 'Create your free account' })).toBeInTheDocument()
    expect(screen.queryByText('Payment')).toBeNull()
    await fillStep1(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(publicAPI.registerRestaurant).toHaveBeenCalledTimes(1))
    const body = publicAPI.registerRestaurant.mock.calls[0][0]
    expect(body).toMatchObject({ planId: 'id-starter' })
    expect(body).not.toHaveProperty('payment')
    expect(publicAPI.registerOrder).not.toHaveBeenCalled()
    expect(RazorpayMock).not.toHaveBeenCalled()
    expect(await screen.findByText('ADMIN DASHBOARD', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Your account is active — welcome to BestoDine', expect.anything())
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/trial/i), expect.anything())
  })

  test('"Decide later" keeps the trial flow (no plan in the payload)', async () => {
    publicAPI.registerRestaurant.mockResolvedValue({
      status: 201,
      data: { success: true, data: { trialStarted: true, restaurant: { slug: 'spice-garden' } }, token: 'tok', refreshToken: 'ref', role: 'admin' },
    })
    const user = renderPage([GOLD, STARTER])
    expect(screen.getByRole('heading', { name: /14-day free trial/i })).toBeInTheDocument()
    expect(within(screen.getByTestId('plan-option-later')).getByRole('radio')).toBeChecked()
    await fillStep1(user)
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await fillStep2(user)
    await user.click(screen.getByRole('button', { name: /start free trial/i }))
    await waitFor(() => expect(publicAPI.registerRestaurant).toHaveBeenCalledTimes(1))
    const body = publicAPI.registerRestaurant.mock.calls[0][0]
    expect(body).not.toHaveProperty('planId')
    expect(body).not.toHaveProperty('payment')
    expect(publicAPI.registerOrder).not.toHaveBeenCalled()
  })
})
