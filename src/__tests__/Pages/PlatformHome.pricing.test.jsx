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
    // Plan cards with a trial go to the one-form trial funnel (no plan in the URL — the server picks it).
    const links = screen.getAllByRole('link', { name: /start free trial/i })
    expect(links.length).toBeGreaterThanOrEqual(2)
    for (const l of links) expect(l.getAttribute('href')).toBe('/start-trial')
    expect(screen.getByTestId('pricing-cta-gold')).toHaveAttribute('data-cta-kind', 'trial')
    // Hero + final "Start 14-day free trial" buttons also go to /start-trial; demo stays.
    for (const l of screen.getAllByRole('link', { name: /start 14-day free trial/i })) expect(l.getAttribute('href')).toBe('/start-trial')
    for (const l of screen.getAllByRole('link', { name: /request a demo/i })) expect(l.getAttribute('href')).toBe('/request-demo')
    expect(screen.queryAllByRole('link').some(l => l.getAttribute('href')?.startsWith('/register-restaurant'))).toBe(false)
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
    // No trial on this plan: paid "Get started" → register with the plan slug; no "every plan" trial line.
    expect(screen.getByTestId('pricing-cta-legacy')).toHaveAttribute('href', '/register-restaurant?plan=legacy')
    expect(screen.getByTestId('pricing-cta-legacy')).toHaveTextContent(/get started/i)
    expect(screen.queryByText(/free trial on every plan/i)).toBeNull()
  })

  test('CTA per tier: enterprise → Contact Sales (/contact), trial → /start-trial, free → register; badge + highlights render', () => {
    const free = { ...plan('Free', 'free', 0, null, null), tier: 0, trial: { enabled: false, durationDays: 0 }, trialDays: 0, badge: '', highlights: ['1 branch', 'Up to 20 menu items'] }
    const gold = { ...plan('Gold', 'gold', 1799, 17999, 28799), tier: 20, trial: { enabled: true, durationDays: 30 }, trialDays: 30, highlight: true, badge: 'Best value' }
    const ent = { ...plan('Enterprise', 'enterprise', 0, null, null), tier: 30, trial: { enabled: false, durationDays: 0 }, trialDays: 0, highlights: ['Dedicated support'] }
    renderHome([free, gold, ent])
    expect(screen.getByTestId('pricing-cta-free')).toHaveAttribute('href', '/register-restaurant?plan=free')
    expect(screen.getByTestId('pricing-cta-free')).toHaveAttribute('data-cta-kind', 'free')
    expect(screen.getByTestId('pricing-cta-gold')).toHaveAttribute('href', '/start-trial')
    expect(screen.getByTestId('pricing-cta-gold')).toHaveTextContent(/start free trial/i)
    expect(screen.getByTestId('pricing-cta-enterprise')).toHaveAttribute('href', '/contact')
    expect(screen.getByTestId('pricing-cta-enterprise')).toHaveTextContent(/contact sales/i)
    // Badge text wins over the "Most popular" ribbon; highlight-only plans still get the ribbon.
    expect(screen.getByTestId('pricing-badge-gold')).toHaveTextContent('Best value')
    expect(screen.queryByTestId('pricing-badge-free')).toBeNull()
    // Super Admin-authored highlights replace the derived ones; trial pill from trial.durationDays.
    expect(screen.getByTestId('pricing-highlights-free')).toHaveTextContent('Up to 20 menu items')
    expect(screen.getByText('30-day free trial')).toBeInTheDocument()
    // Mixed line-up: not "every plan".
    expect(screen.queryByText(/free trial on every plan/i)).toBeNull()
    expect(screen.getByText(/free trial available on selected plans/i)).toBeInTheDocument()
  })

  test('a price-0 Enterprise plan reads "Custom" (never "Free"); a price-0 free plan still reads "Free"', () => {
    // Named "Starter" so the plan title doesn't also match the text "Free".
    const free = { ...plan('Starter', 'free', 0, null, null), tier: 0, trial: { enabled: false, durationDays: 0 }, trialDays: 0 }
    const ent = { ...plan('Enterprise', 'enterprise', 0, null, null), tier: 30, trial: { enabled: false, durationDays: 0 }, trialDays: 0 }
    renderHome([free, ent])
    const entCard = screen.getByTestId('pricing-cta-enterprise').closest('[data-reveal]')
    expect(within(entCard).getByText('Custom')).toBeInTheDocument()
    expect(within(entCard).queryByText('Free')).toBeNull()
    // No "+ GST" note under a price that isn't a price.
    expect(screen.queryByTestId('pricing-note-enterprise')).toBeNull()
    const freeCard = screen.getByTestId('pricing-cta-free').closest('[data-reveal]')
    expect(within(freeCard).getByText('Free')).toBeInTheDocument()
    expect(within(freeCard).queryByText('Custom')).toBeNull()
  })

  test('"Most popular" ribbon still shows when a plan has highlight but no badge', () => {
    renderHome([{ ...plan('Gold', 'gold', 1799, 17999, 28799), highlight: true }])
    expect(screen.getByTestId('pricing-badge-gold')).toHaveTextContent('Most popular')
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
