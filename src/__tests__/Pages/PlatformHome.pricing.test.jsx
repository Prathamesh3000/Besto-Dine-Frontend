/**
 * Public pricing on the platform home: monthly / annual / 2-year toggle driven
 * by the public plans payload, "+ 18% GST" note, free-trial CTA, and a fallback
 * to the monthly price when a plan carries no cycle prices.
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ isLoggedIn: false, user: null, isLoading: false }) }))
vi.mock('@/Pages/Platform/components/PlatformChrome', () => ({ PlatformHeader: () => null, PlatformFooter: () => null }))
vi.mock('@/utils/api', () => ({ publicAPI: { searchRestaurants: vi.fn(async () => ({ data: { data: [] } })) }, default: {} }))

// i18n is not initialised in unit tests: interpolate the default string like i18next does.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key, def, opts) => (typeof def === 'string' ? def.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? '')) : _key),
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}))

const plansRef = vi.hoisted(() => ({ current: [] }))
vi.mock('@/Pages/Platform/platformShared', async (orig) => {
  const actual = await orig()
  return { ...actual, usePageMeta: () => {}, usePublicPlans: () => ({ data: plansRef.current, isLoading: false, isError: false }) }
})

import PlatformHome from '@/Pages/Platform/PlatformHome'
import { formatPlanCyclePrice, publicCycleOptions } from '@/Pages/Platform/platformShared'

const plan = (name, slug, monthly, annual, biennial) => {
  const prices = { monthly, annual, biennial }
  return { _id: `id-${slug}`, name, slug, price: monthly, prices, gstRate: 18, trialDays: 14, billingCycle: 'monthly', features: {}, limits: {} }
}

function renderHome(plans) {
  plansRef.current = plans
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><PlatformHome /></MemoryRouter></QueryClientProvider>)
}

describe('public pricing', () => {
  const PLANS = [plan('Silver', 'silver', 699, 6999, 11199), plan('Gold', 'gold', 1799, 17999, 28799)]

  test('defaults to annual with + GST, per-month equivalent and savings from the data', () => {
    renderHome(PLANS)
    expect(screen.getByTestId('pricing-cycle-annual')).toHaveAttribute('aria-pressed', 'true')
    const note = screen.getByTestId('pricing-note-gold')
    expect(note).toHaveTextContent('+ 18% GST')
    expect(note).toHaveTextContent('₹1,499.92/month')
    expect(note).toHaveTextContent('Save 17%')
    expect(screen.getByText('₹17,999')).toBeInTheDocument()
    expect(screen.getByText('₹6,999')).toBeInTheDocument()
    expect(screen.getByTestId('pricing-cycle-biennial')).toHaveTextContent('Save 33%')
  })

  test('toggle switches to monthly and 2-year prices', async () => {
    renderHome(PLANS)
    await userEvent.click(screen.getByTestId('pricing-cycle-monthly'))
    expect(screen.getByText('₹1,799')).toBeInTheDocument()
    expect(screen.getByTestId('pricing-note-gold')).not.toHaveTextContent('/month')
    await userEvent.click(screen.getByTestId('pricing-cycle-biennial'))
    expect(screen.getByText('₹28,799')).toBeInTheDocument()
    expect(screen.getByText('₹11,199')).toBeInTheDocument()
  })

  test('trial CTA, GST note, and no competitor names', () => {
    renderHome(PLANS)
    const links = screen.getAllByRole('link', { name: /start free trial/i })
    expect(links.length).toBeGreaterThanOrEqual(2)
    expect(links[0].getAttribute('href')).toContain('/register-restaurant?plan=')
    expect(screen.getByText(/14-day free trial on every plan/i)).toBeInTheDocument()
    expect(screen.getByText(/Prices exclude 18% GST/)).toBeInTheDocument()
    expect(screen.getByText(/Cancel monthly plans any time/)).toBeInTheDocument()
    const pricing = document.getElementById('pricing')
    expect(within(pricing).queryByText(/petpooja|posist|toast|orderrestro|zomato|swiggy/i)).toBeNull()
  })

  test('plans with only an old-style price still render (monthly fallback, no toggle)', () => {
    renderHome([{ _id: 'x', name: 'Legacy', slug: 'legacy', price: 999, billingCycle: 'monthly', trialDays: 0, features: {}, limits: {} }])
    expect(screen.queryByTestId('pricing-cycle-annual')).toBeNull()
    expect(screen.getByText('₹999')).toBeInTheDocument()
    expect(screen.getByText('/ month')).toBeInTheDocument()
  })
})

describe('platformShared cycle helpers', () => {
  test('formatPlanCyclePrice falls back to the monthly price when a cycle is not sold', () => {
    const p = plan('Silver', 'silver', 699, null, null)
    expect(formatPlanCyclePrice(p, 'annual')).toMatchObject({ amount: '₹699', per: '/ month', fellBack: true })
    expect(formatPlanCyclePrice(plan('Gold', 'gold', 1799, 17999, 28799), 'annual'))
      .toMatchObject({ amount: '₹17,999', per: '/ year', perMonth: '₹1,499.92', savingsPct: 17, total: '₹21,238.82', gst: '₹3,239.82' })
  })

  test('publicCycleOptions only lists cycles that some plan sells', () => {
    expect(publicCycleOptions([plan('A', 'a', 100, null, null)]).map(o => o.cycle)).toEqual(['monthly'])
    expect(publicCycleOptions([plan('A', 'a', 699, 6999, null)]).map(o => o.cycle)).toEqual(['monthly', 'annual'])
  })
})
