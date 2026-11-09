/**
 * Admin/Subscription - annual / 2-year billing: the cycle toggle, per-card
 * price + GST + totals, billingCycle on the upgrade call, cycle-aware current
 * plan card, invoices with base / GST / total and inline error codes.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin', branch: null } }) }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { default: api }
})

import api from '@/utils/api'
import Subscription from '@/Pages/Admin/Subscription'

const card = (name, slug, monthly, annual, biennial, extra = {}) => {
  const prices = { monthly, annual, biennial }
  const rows = []
  for (const [cycle, months, price] of [['monthly', 1, monthly], ['annual', 12, annual], ['biennial', 24, biennial]]) {
    if (!price) continue
    const total = Math.round(price * 118) / 100
    rows.push({
      cycle, months, price, gst: Math.round((total - price) * 100) / 100, total,
      perMonthEquivalent: Math.round((price / months) * 100) / 100,
      savingsPctVsMonthly: cycle === 'monthly' ? 0 : Math.round((1 - price / months / monthly) * 100),
    })
  }
  return { _id: `id-${slug}`, name, slug, price: monthly, prices, gstRate: 18, cycles: rows, features: {}, limits: {}, ...extra }
}

const PLANS = [
  card('Silver', 'silver', 699, 6999, 11199),
  card('Gold', 'gold', 1799, 17999, 28799),
  card('Premium', 'premium', 2999, 29999, null), // no 2-year price
]

let subscription
let invoices
function stub() {
  api.get.mockImplementation(async (url) => {
    if (url === '/tenant/billing/current') {
      return { data: { success: true, data: { restaurant: { _id: 'r1' }, subscription, addons: [], pendingUpgrade: null } } }
    }
    if (url === '/tenant/billing/plans') {
      return { data: { success: true, data: { plans: PLANS, currentPlanSlug: subscription.planSlug, currentBillingCycle: subscription.billingCycle, gstRate: 18 } } }
    }
    if (url === '/tenant/billing/invoices') return { data: { success: true, data: invoices } }
    throw new Error('unexpected GET ' + url)
  })
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Subscription /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.confirm = vi.fn(() => true)
  window.open = vi.fn()
  invoices = []
  subscription = { planName: 'Trial Cafe', planSlug: 'silver', status: 'active', billingCycle: 'monthly', features: {}, limits: {} }
  stub()
})

describe('cycle toggle and card prices', () => {
  test('defaults to annual, shows base price, + GST, per-month equivalent and total', async () => {
    renderPage()
    expect(await screen.findByTestId('price-gold')).toHaveTextContent('₹17,999')
    expect(screen.getByTestId('cycle-annual')).toHaveAttribute('aria-pressed', 'true')
    const note = screen.getByTestId('breakdown-gold')
    expect(note).toHaveTextContent('+ 18% GST')
    expect(note).toHaveTextContent('₹1,499.92/month')
    expect(note).toHaveTextContent('Save 17%')
    expect(note).toHaveTextContent('Total payable ₹21,238.82')
    expect(screen.getAllByText('/year').length).toBeGreaterThan(0)
  })

  test('savings badges on the toggle are computed from the data', async () => {
    renderPage()
    await screen.findByTestId('price-gold')
    expect(screen.getByTestId('cycle-annual')).toHaveTextContent('Save ~17%')
    expect(screen.getByTestId('cycle-biennial')).toHaveTextContent('Save ~33%')
    expect(screen.getByTestId('cycle-monthly')).not.toHaveTextContent('Save')
  })

  test('switching to monthly / 2-year changes price, suffix and a missing cycle is flagged', async () => {
    renderPage()
    await screen.findByTestId('price-gold')
    await userEvent.click(screen.getByTestId('cycle-monthly'))
    expect(screen.getByTestId('price-gold')).toHaveTextContent('₹1,799')
    expect(screen.getByTestId('breakdown-gold')).not.toHaveTextContent('/month')
    expect(screen.getByTestId('breakdown-gold')).toHaveTextContent('Total payable ₹2,122.82')

    await userEvent.click(screen.getByTestId('cycle-biennial'))
    expect(screen.getByTestId('price-gold')).toHaveTextContent('₹28,799')
    expect(screen.getAllByText('/2 years').length).toBeGreaterThan(0)
    expect(screen.getByTestId('unavailable-premium')).toHaveTextContent(/not available with 2-year billing/i)
  })
})

describe('upgrade', () => {
  test('confirm text carries base, GST and total, and the POST sends billingCycle', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { pendingUpgrade: { shortUrl: 'https://rzp.io/i/x' }, billing: {} } } })
    renderPage()
    await screen.findByTestId('price-gold')
    await userEvent.click(screen.getByRole('button', { name: /upgrade to gold/i }))
    const text = window.confirm.mock.calls[0][0]
    expect(text).toContain('₹17,999 /year')
    expect(text).toContain('GST (18%): ₹3,239.82')
    expect(text).toContain('Total payable: ₹21,238.82')
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/tenant/billing/upgrade', { planId: 'id-gold', billingCycle: 'annual' }, { _silent: true },
    ))
  })

  test('2-year selection is sent as biennial', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { billing: {} } } })
    renderPage()
    await screen.findByTestId('price-gold')
    await userEvent.click(screen.getByTestId('cycle-biennial'))
    await userEvent.click(screen.getByRole('button', { name: /switch to 2-year/i }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      '/tenant/billing/upgrade', { planId: 'id-silver', billingCycle: 'biennial' }, { _silent: true },
    ))
  })

  test('TERM_ACTIVE shows the backend message inline', async () => {
    const message = 'Your Silver annual term is prepaid until 1/3/2027. You can switch plans after it ends, or contact support.'
    api.post.mockRejectedValue({ response: { status: 409, data: { code: 'TERM_ACTIVE', message, data: {} } } })
    renderPage()
    await screen.findByTestId('price-gold')
    await userEvent.click(screen.getByRole('button', { name: /upgrade to gold/i }))
    const alert = await screen.findByTestId('upgrade-error')
    expect(alert).toHaveTextContent(message)
    expect(alert).toHaveAttribute('data-code', 'TERM_ACTIVE')
  })

  test.each(['SAME_PLAN', 'CYCLE_NOT_AVAILABLE'])('%s is explained inline', async (code) => {
    api.post.mockRejectedValue({ response: { status: 400, data: { code, message: `msg for ${code}` } } })
    renderPage()
    await screen.findByTestId('price-gold')
    await userEvent.click(screen.getByRole('button', { name: /upgrade to gold/i }))
    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent(`msg for ${code}`)
  })

  test('declining the confirm sends nothing', async () => {
    window.confirm = vi.fn(() => false)
    renderPage()
    await screen.findByTestId('price-gold')
    await userEvent.click(screen.getByRole('button', { name: /upgrade to gold/i }))
    expect(api.post).not.toHaveBeenCalled()
  })
})

describe('current plan card', () => {
  test('shows cycle, price + GST, renewal date and the same-price promise', async () => {
    subscription = {
      planName: 'Gold', planSlug: 'gold', status: 'active', billingCycle: 'annual', price: 17999, gstRate: 18,
      currentPeriodEnd: '2027-03-01T00:00:00.000Z', renewalWindowOpensAt: '2027-01-30T00:00:00.000Z',
      razorpayStatus: 'active', features: {}, limits: {},
    }
    stub()
    renderPage()
    const cyc = await screen.findByTestId('current-cycle')
    expect(cyc).toHaveTextContent('Annual billing')
    expect(cyc).toHaveTextContent('₹17,999 /year + 18% GST')
    expect(cyc).toHaveTextContent('same price at renewal')
    expect(screen.getByTestId('current-renewal')).toHaveTextContent(/Renews on/)
    expect(screen.getByTestId('current-prepaid-note')).toHaveTextContent(/Prepaid until/)
  })
})

describe('trial progress bar', () => {
  test('uses trialStartDate -> trialEndDate instead of a fixed 14 days', async () => {
    const DAY = 86400000
    subscription = {
      planName: 'Gold', planSlug: 'gold', status: 'trial', billingCycle: 'monthly', features: {}, limits: {},
      trialStartDate: new Date(Date.now() - 10 * DAY).toISOString(),
      trialEndDate: new Date(Date.now() + 20 * DAY - 1000).toISOString(),
    }
    stub()
    const { container } = renderPage()
    await screen.findByText('Trial Period')
    expect(screen.getByText(/20 days remaining/)).toBeInTheDocument()
    const bar = container.querySelector('.bg-amber-500.rounded-full[style*="width"]')
    expect(parseFloat(bar.style.width)).toBeGreaterThan(30)
    expect(parseFloat(bar.style.width)).toBeLessThan(36)
  })
})

describe('invoices', () => {
  test('list shows cycle, base, GST and total', async () => {
    invoices = [{
      _id: 'i1', invoiceNumber: 'INV-1', planName: 'Gold', billingCycle: 'annual',
      amount: 2123882, baseAmount: 1799900, gstAmount: 323982, gstRate: 18, status: 'paid',
      paidAt: '2026-11-01T00:00:00.000Z', periodStart: '2026-11-01T00:00:00.000Z', periodEnd: '2027-11-01T00:00:00.000Z',
    }]
    stub()
    renderPage()
    await screen.findByTestId('price-gold')
    await userEvent.click(screen.getByRole('button', { name: /invoices/i }))
    const row = (await screen.findAllByText('INV-1'))[0].closest('tr')
    const r = within(row)
    expect(r.getByText('Annual')).toBeInTheDocument()
    expect(r.getByText('₹17,999')).toBeInTheDocument()
    expect(r.getByText('₹3,239.82')).toBeInTheDocument()
    expect(r.getByText('₹21,238.82')).toBeInTheDocument()
  })
})
