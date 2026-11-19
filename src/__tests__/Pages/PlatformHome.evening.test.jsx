/**
 * "One evening" landing page (route `/`), third pass — "the clock runs the
 * page": the header clock set by the section in the reading band; the hero's
 * device cluster (owner's report, guest's phone, waiter's phone, never the
 * kitchen display); the warm evening band with the hour ruler, the seven
 * captions and one sticky frame that never shows a placeholder (the two stops
 * without a screen hold a neighbour's); the centred struck list over the
 * four-step strip; the three overlapping "stair" cards; the sticky receipt
 * beside the stacked plan rows sharing the billing cycle; the grouped
 * accordion with "Coming soon" pills; the closing band; the type rules.
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ isLoggedIn: false, user: null, isLoading: false }) }))
// The chrome is mocked down to its slot so the header clock can be asserted.
vi.mock('@/Pages/Platform/components/PlatformChrome', () => ({
  PlatformHeader: ({ slot }) => <header data-testid="mock-header">{slot}</header>,
  PlatformFooter: () => null,
}))
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

const plan = (name, slug, monthly, annual, biennial) => ({
  _id: `id-${slug}`, name, slug, price: monthly, prices: { monthly, annual, biennial }, gstRate: 18, trialDays: 14, billingCycle: 'monthly', features: {}, limits: {},
})
const PLANS = [plan('Silver', 'silver', 699, 6999, 11199), plan('Gold', 'gold', 1799, 17999, 28799)]

function renderHome(plans = PLANS) {
  plansRef.current = plans
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MemoryRouter><PlatformHome /></MemoryRouter></QueryClientProvider>)
}

/** Swaps the setup's no-op IntersectionObserver for one whose callbacks a test can fire. */
function withRecordingObserver(run) {
  const instances = []
  const Orig = window.IntersectionObserver
  class RecordingObserver {
    constructor(cb, options) { this.cb = cb; this.options = options; this.targets = []; instances.push(this) }
    observe(el) { this.targets.push(el) }
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  window.IntersectionObserver = RecordingObserver
  globalThis.IntersectionObserver = RecordingObserver
  try {
    return run(instances)
  } finally {
    window.IntersectionObserver = Orig
    globalThis.IntersectionObserver = Orig
  }
}

describe('hero (#top, 6:45 PM)', () => {
  test('renders the title, the clock card, one trial CTA → /start-trial, the demo text link, the trust row and the device cluster', () => {
    renderHome()
    const hero = document.getElementById('top')
    expect(hero).toHaveAttribute('data-clock', '6:45 PM')
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent('Run your whole restaurant from one place.')
    expect(within(hero).getByTestId('evening-clock')).toHaveTextContent('7:00 PM')
    const trial = within(hero).getAllByRole('link', { name: /start 14-day free trial/i })
    expect(trial).toHaveLength(1)
    expect(trial[0]).toHaveAttribute('href', '/start-trial')
    expect(within(hero).getByRole('link', { name: 'Request a demo' })).toHaveAttribute('href', '/request-demo')
    expect(within(hero).getByText(/No app for guests\. No new hardware\./)).toBeInTheDocument()
    expect(within(hero).getByText(/14 days free · No card needed/)).toBeInTheDocument()
    // The cluster: the owner's report (eager, the LCP image), the guest's phone, the waiter's phone. Never the kitchen display.
    const imgs = Array.from(hero.querySelectorAll('img'))
    const srcs = imgs.map((img) => img.getAttribute('src'))
    expect(srcs).toContain('/landing/admin-dashboard.webp')
    expect(srcs).toContain('/landing/restaurant-page.webp')
    expect(srcs).toContain('/landing/waiter-tables.webp')
    expect(srcs).not.toContain('/landing/kitchen-display.webp')
    const laptop = imgs.find((img) => img.getAttribute('src') === '/landing/admin-dashboard.webp')
    expect(laptop).toHaveAttribute('loading', 'eager')
    expect(laptop).toHaveAttribute('fetchpriority', 'high')
    for (const img of imgs) {
      expect(img.getAttribute('alt')).toMatch(/\S/)
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0)
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0)
    }
    expect(within(hero).getByTestId('hero-cluster').className).toContain('lg:-mr-10')
    // The diner search still lives in the hero.
    expect(within(hero).getByLabelText(/Find a restaurant on BestoDine/)).toBeInTheDocument()
  })
})

describe('the header clock', () => {
  test('starts at 6:45 PM and follows the section in the reading band; inside the evening band the active stop wins', () => {
    withRecordingObserver((instances) => {
      renderHome()
      const clock = screen.getByTestId('header-clock')
      expect(screen.getByTestId('mock-header')).toContainElement(clock)
      expect(clock).toHaveTextContent('6:45 PM')
      expect(clock.className).toContain('bd-clock')
      expect(clock.className).toContain('text-[#FE8301]')
      // Every section carries its time.
      const clocks = Array.from(document.querySelectorAll('main [data-clock]')).map((el) => el.getAttribute('data-clock'))
      expect(clocks).toEqual(['6:45 PM', '6:45 PM', '10:00 PM', '10:30 PM', '11:45 PM', 'After close', 'Tomorrow, 7:00 PM'])

      const pricing = document.getElementById('pricing')
      const sections = instances.find((o) => o.targets.includes(pricing))
      expect(sections.options.rootMargin).toBe('-40% 0px -55% 0px')
      act(() => { sections.cb([{ isIntersecting: true, target: pricing }]) })
      expect(clock).toHaveTextContent('11:45 PM')

      const features = document.getElementById('features')
      act(() => { sections.cb([{ isIntersecting: true, target: features }]) })
      expect(clock).toHaveTextContent('6:45 PM')
      const stop2 = features.querySelector('[data-stop="2"]')
      const stops = instances.find((o) => o.targets.includes(stop2))
      act(() => { stops.cb([{ isIntersecting: true, target: stop2 }]) })
      expect(clock).toHaveTextContent('7:03 PM')
      expect(screen.getByTestId('evening-sticky-time')).toHaveTextContent('7:03 PM')
      expect(features).toHaveAttribute('data-clock', '7:03 PM')

      const faq = document.getElementById('faq')
      act(() => { sections.cb([{ isIntersecting: true, target: faq }]) })
      expect(clock).toHaveTextContent('After close')
    })
  })
})

describe('the evening band (#features)', () => {
  test('is a warm full-bleed band; seven captions in order; the ruler has seven time labels; the frame never shows a placeholder', () => {
    renderHome()
    const section = document.getElementById('features')
    expect(section.className).toContain('bg-[#FFF8F0]')
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent('One evening, start to finish')
    const times = within(section).getAllByTestId('evening-stop-time').map((el) => el.textContent)
    expect(times).toEqual(['6:45 PM', '7:02 PM', '7:03 PM', '7:40 PM', '8:15 PM', '9:00 PM', '11:30 PM'])
    expect(section.querySelectorAll('[data-stop]')).toHaveLength(7)
    const ticks = within(section).getAllByTestId('evening-ruler-tick').map((el) => el.textContent.trim())
    expect(ticks).toEqual(times)
    expect(document.body.textContent).not.toContain('Screen coming soon')
    expect(document.querySelector('[data-testid="screen-placeholder"]')).toBeNull()
  })

  test('the two stops without a screen hold a neighbour: 7:02 keeps the restaurant page, 7:40 shows the waiter app', () => {
    renderHome()
    const section = document.getElementById('features')
    const held = Array.from(section.querySelectorAll('[data-stop]')).map((el) => el.getAttribute('data-screen-src'))
    expect(held).toEqual([
      '/landing/restaurant-page.webp',
      '/landing/restaurant-page.webp', // 7:02 — "Dining in? Scan the QR code" lives on the 6:45 page
      '/landing/kitchen-display.webp',
      '/landing/waiter-tables.webp', // 7:40 — the waiter settles bills on the 8:15 screen
      '/landing/waiter-tables.webp',
      '/landing/admin-bookings.webp',
      '/landing/admin-dashboard.webp',
    ])
    // The sticky frame stacks one layer per distinct screen: exactly five, no duplicates; inactive layers hidden.
    const stack = within(section).getByTestId('evening-screen-stack')
    const srcs = Array.from(stack.querySelectorAll('img')).map((img) => img.getAttribute('src'))
    expect(new Set(srcs).size).toBe(5)
    expect(srcs.sort()).toEqual([
      '/landing/admin-bookings.webp',
      '/landing/admin-dashboard.webp',
      '/landing/kitchen-display.webp',
      '/landing/restaurant-page.webp',
      '/landing/waiter-tables.webp',
    ])
    const layers = Array.from(stack.querySelectorAll('[data-screen-src]'))
    expect(layers.filter((l) => l.getAttribute('aria-hidden') === 'true')).toHaveLength(4)
    expect(layers.find((l) => l.getAttribute('aria-hidden') !== 'true')).toHaveAttribute('data-screen-src', '/landing/restaurant-page.webp')
    expect(stack.parentElement.className).toContain('sticky')
    // Every screenshot in the section is lazy, sized and described.
    for (const img of section.querySelectorAll('img')) {
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img.getAttribute('alt')).toMatch(/\S/)
      expect(Number(img.getAttribute('width'))).toBeGreaterThan(0)
      expect(Number(img.getAttribute('height'))).toBeGreaterThan(0)
    }
  })

  test('the sticky time label starts at the first stop', () => {
    renderHome()
    expect(screen.getByTestId('evening-sticky-time')).toHaveTextContent('6:45 PM')
  })
})

describe('what you stopped doing (#how-it-works, 10:00 PM)', () => {
  test('the struck list is centred at display size; the four steps form one strip', () => {
    renderHome()
    const section = document.getElementById('how-it-works')
    expect(section).toHaveAttribute('data-clock', '10:00 PM')
    const list = within(section).getByTestId('stopped-list')
    expect(list.className).toContain('text-center')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['Billing software', 'Booking register', 'Stock sheet', 'Loyalty card', 'WhatsApp threads'])
    for (const li of items) expect(li.className).toContain('lg:text-6xl')
    const strip = within(section).getByTestId('steps-strip')
    expect(strip.className).toContain('lg:grid-cols-4')
    expect(within(strip).getAllByRole('listitem')).toHaveLength(4)
    expect(strip).toHaveTextContent('Start your free trial')
    expect(strip).toHaveTextContent('Print QR codes')
  })
})

describe('three things only BestoDine does (10:30 PM)', () => {
  test('three stair cards; the tips visual is a typographic bill line, the other two show real screens', () => {
    renderHome()
    const tips = screen.getByTestId('tips-visual')
    expect(tips).toHaveTextContent('Tip to staff')
    expect(within(tips).getByText('₹50')).toBeInTheDocument()
    expect(tips).toHaveTextContent('100% to staff · pooled by shift')
    expect(tips.querySelector('img')).toBeNull()
    const section = tips.closest('section')
    expect(section).toHaveAttribute('data-clock', '10:30 PM')
    const cards = within(section).getAllByTestId('only-card')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toContainElement(tips)
    expect(cards[1].className).toContain('lg:-mt-16')
    expect(cards[2].className).toContain('lg:-mt-16')
    const srcs = Array.from(section.querySelectorAll('img')).map((img) => img.getAttribute('src'))
    expect(srcs).toEqual(['/landing/admin-bookings.webp', '/landing/ops-panel.webp'])
    for (const img of section.querySelectorAll('img')) {
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img.getAttribute('alt')).toMatch(/\S/)
    }
  })
})

describe('pricing receipt (#pricing, 11:45 PM)', () => {
  test('sticky on the left, plan rows stacked; shows the ₹0 lines and the "from" line for the active cycle, switching with the toggle', async () => {
    renderHome()
    const receipt = screen.getByTestId('pricing-receipt')
    const pricing = document.getElementById('pricing')
    expect(pricing).toContainElement(receipt)
    expect(pricing).toHaveAttribute('data-clock', '11:45 PM')
    expect(screen.getByTestId('pricing-receipt-wrap').className).toContain('lg:sticky')
    const grid = document.querySelector('[data-layout="stack"]')
    expect(grid).not.toBeNull()
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.children).toHaveLength(2)
    expect(within(receipt).getAllByText('₹0')).toHaveLength(3)
    expect(within(receipt).getByText('Commission on your own orders')).toBeInTheDocument()
    expect(within(receipt).getByText('Per-device fees')).toBeInTheDocument()
    expect(within(receipt).getByText('Renewal increase')).toBeInTheDocument()
    expect(within(receipt).getByText('any time')).toBeInTheDocument()
    // Annual is the default: lowest non-zero annual price across the plans.
    expect(within(receipt).getByText('from ₹6,999 / year')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('pricing-cycle-monthly'))
    expect(within(receipt).getByText('from ₹699 / month')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('pricing-cycle-biennial'))
    expect(within(receipt).getByText('from ₹11,199 / 2 years')).toBeInTheDocument()
    // The GST note renders exactly once (plan cards carry it; the receipt stays quiet).
    expect(screen.getAllByText(/Prices exclude 18% GST/)).toHaveLength(1)
    expect(screen.getByTestId('pricing-cta-silver')).toBeInTheDocument()
  })

  test('ignores free tiers when picking the "from" price and shows the GST line when no cards render', () => {
    renderHome([{ ...plan('Free', 'free', 0, null, null), trialDays: 0 }, plan('Gold', 'gold', 1799, 17999, 28799)])
    expect(within(screen.getByTestId('pricing-receipt')).getByText('from ₹17,999 / year')).toBeInTheDocument()

    plansRef.current = []
    renderHome([])
    const receipts = screen.getAllByTestId('pricing-receipt')
    const last = receipts[receipts.length - 1]
    expect(within(last).getByText('ask us')).toBeInTheDocument()
    expect(within(last).getByText('Prices exclude 18% GST')).toBeInTheDocument()
  })
})

describe('straight answers (#faq, after close)', () => {
  test('three groups, twelve items, first open; opening another closes it', async () => {
    renderHome()
    const faq = document.getElementById('faq')
    expect(faq).toHaveAttribute('data-clock', 'After close')
    expect(faq.className).toContain('bg-white')
    expect(within(faq).getByText('Running the restaurant')).toBeInTheDocument()
    expect(within(faq).getByText('Money')).toBeInTheDocument()
    expect(within(faq).getByText('Integrations')).toBeInTheDocument()
    const buttons = within(faq).getAllByRole('button')
    expect(buttons).toHaveLength(12)
    expect(buttons[0]).toHaveTextContent('Do my guests need to install an app?')
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true')
    for (const b of buttons.slice(1)) expect(b).toHaveAttribute('aria-expanded', 'false')
    // Each button controls a labelled region.
    const panel = document.getElementById(buttons[0].getAttribute('aria-controls'))
    expect(panel).toHaveAttribute('role', 'region')
    expect(panel).toHaveAttribute('aria-labelledby', buttons[0].id)
    expect(panel).toHaveTextContent(/Guests scan the QR code on their table/)

    await userEvent.click(buttons[1])
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true')
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false')
  })

  test('keyboard: ArrowDown/ArrowUp move focus between questions, Home/End jump, Enter toggles', async () => {
    renderHome()
    const faq = document.getElementById('faq')
    const buttons = within(faq).getAllByRole('button')
    buttons[0].focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(buttons[1]).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(buttons[0]).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(buttons[11]).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(buttons[0]).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true')
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false')
  })

  test('two neutral "Coming soon" pills in the button rows (visible while closed), honest copy, never claims an integration', () => {
    renderHome()
    const faq = document.getElementById('faq')
    const pills = within(faq).getAllByTestId('coming-soon-pill')
    expect(pills).toHaveLength(2)
    expect(within(faq).getAllByText('Coming soon')).toHaveLength(2)
    for (const pill of pills) {
      expect(pill.className).not.toContain('#FE8301')
      const button = pill.closest('button')
      expect(button).not.toBeNull()
      expect(button).toHaveAttribute('aria-expanded', 'false')
      expect(pill.closest('[role="region"]')).toBeNull()
    }
    expect(within(faq).getByText('Can I get Zomato/Swiggy orders in it?')).toBeInTheDocument()
    expect(within(faq).getByText('Do you export to Tally?')).toBeInTheDocument()
    expect(within(faq).getByText('Do my guests need to install an app?')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/integrated with Zomato/i)
    expect(document.body.textContent).not.toMatch(/petpooja|posist|orderrestro/i)
    // Both coming-soon answers say so in words too.
    expect(within(faq).getByText(/Coming soon, it is on the roadmap/)).toBeInTheDocument()
    expect(within(faq).getByText(/Excel\/CSV exports/)).toBeInTheDocument()
  })
})

describe('type rules', () => {
  test('no mono eyebrows, no uppercase headings, Fraunces display on every heading', () => {
    renderHome()
    expect(document.querySelectorAll('[class*="font-mono"]')).toHaveLength(0)
    const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    expect(headings.length).toBeGreaterThan(5)
    for (const h of headings) {
      expect(h.className).not.toMatch(/\buppercase\b/)
      expect(h.className).toContain('font-display')
    }
    expect(document.querySelector('marquee, [class*="marquee"]')).toBeNull()
  })

  test('the closing band repeats the clock for tomorrow and both CTAs', () => {
    renderHome()
    const clocks = screen.getAllByTestId('evening-clock')
    expect(clocks).toHaveLength(2)
    expect(clocks[1]).toHaveTextContent('Tomorrow,')
    expect(clocks[1]).toHaveTextContent('7:00 PM')
    const section = clocks[1].closest('section')
    expect(section).toHaveAttribute('data-clock', 'Tomorrow, 7:00 PM')
    expect(section.className).toContain('bg-[#FFF8F0]')
    expect(within(section).getByRole('link', { name: /start 14-day free trial/i })).toHaveAttribute('href', '/start-trial')
    expect(within(section).getByRole('link', { name: 'Request a demo' })).toHaveAttribute('href', '/request-demo')
  })
})
