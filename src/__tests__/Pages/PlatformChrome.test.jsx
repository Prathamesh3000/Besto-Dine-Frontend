/**
 * Platform chrome: the single light sticky header (in-page anchors on the
 * home page, `/#section` elsewhere, dropdown mobile menu, no progress bar or
 * scroll-spy), the brand link, and the light three-column footer.
 */
import React from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DESKTOP_DOWNLOAD_URL } from '../../utils/desktopDownload'

// The real module drags in api/socket/toast; the chrome only needs the context object.
vi.mock('@/Context/AuthContext', async () => {
  const { createContext } = await import('react')
  return { default: createContext(null) }
})

// i18n is not initialised in unit tests: fall back to the default string.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key, def) => (typeof def === 'string' ? def : _key),
    i18n: { language: 'en', changeLanguage: () => {} },
  }),
}))

import AuthContext from '@/Context/AuthContext'
import { PlatformBrand, PlatformHeader, PlatformFooter, PLATFORM_HEADER_HEIGHT } from '@/Pages/Platform/components/PlatformChrome'

const wrap = (ui, auth = null) => render(
  <MemoryRouter>
    <AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>
  </MemoryRouter>,
)

describe('PlatformHeader (home)', () => {
  test('is a light sticky bar with in-page anchors, a Staff login link and one orange trial button', () => {
    expect(PLATFORM_HEADER_HEIGHT).toBe(64)
    wrap(<PlatformHeader onHome />)
    const header = screen.getByRole('banner')
    expect(header.className).toContain('sticky')
    expect(header.className).not.toContain('fixed')
    expect(header.className).toContain('h-16')
    expect(header).toHaveAttribute('data-variant', 'light')
    expect(screen.queryByTestId('platform-reading-progress')).not.toBeInTheDocument()
    expect(header.querySelector('[aria-current]')).toBeNull()

    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const [label, href] of [['Features', '#features'], ['How it works', '#how-it-works'], ['Pricing', '#pricing'], ['FAQ', '#faq']]) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href)
    }
    const trial = screen.getByRole('link', { name: 'Start free trial' })
    expect(trial).toHaveAttribute('href', '/start-trial')
    expect(trial.className).toContain('bg-[#FE8301]')
    const staff = screen.getByRole('link', { name: 'Staff login' })
    expect(staff).toHaveAttribute('href', '/staff-login')
    expect(staff.className).not.toContain('bg-[#FE8301]')
    expect(header.querySelector('.bd-shine')).toBeNull()
  })

  test('turns white with a hairline shadow after 8px of scroll', async () => {
    wrap(<PlatformHeader onHome />)
    expect(screen.getByRole('banner').className).not.toContain('bg-white/90')
    window.scrollY = 40
    act(() => { fireEvent.scroll(window) })
    await waitFor(() => expect(screen.getByRole('banner').className).toContain('bg-white/90'))
    window.scrollY = 0
  })

  test('mobile menu is a dropdown: toggles, closes with Escape and a link click, never locks body scroll', async () => {
    const user = userEvent.setup()
    wrap(<PlatformHeader onHome />)
    const toggle = screen.getByRole('button', { name: 'Open menu' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'platform-mobile-nav')

    await user.click(toggle)
    const menu = document.getElementById('platform-mobile-nav')
    expect(menu).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    const links = within(menu).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#features', '#how-it-works', '#pricing', '#faq', DESKTOP_DOWNLOAD_URL, '/staff-login', '/start-trial'])

    await user.keyboard('{Escape}')
    expect(document.getElementById('platform-mobile-nav')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(within(document.getElementById('platform-mobile-nav')).getByRole('link', { name: 'Pricing' }))
    expect(document.getElementById('platform-mobile-nav')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(document.getElementById('platform-mobile-nav')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })
})

describe('PlatformHeader slot', () => {
  test('renders the given node after the brand and inside the mobile menu; nothing without one', async () => {
    const user = userEvent.setup()
    wrap(<PlatformHeader onHome slot={<span data-testid="slot-node">6:45 PM</span>} />)
    const header = screen.getByRole('banner')
    const brand = screen.getByRole('link', { name: 'BestoDine home' })
    const slot = screen.getByTestId('slot-node')
    expect(header).toContainElement(slot)
    expect(brand.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Nothing else in the bar changed.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start free trial' })).toHaveAttribute('href', '/start-trial')

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = document.getElementById('platform-mobile-nav')
    expect(within(menu).getByText('6:45 PM')).toBeInTheDocument()
    const links = within(menu).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['#features', '#how-it-works', '#pricing', '#faq', DESKTOP_DOWNLOAD_URL, '/staff-login', '/start-trial'])
  })

  test('renders no slot by default', () => {
    wrap(<PlatformHeader onHome />)
    expect(screen.queryByTestId('slot-node')).not.toBeInTheDocument()
  })
})

describe('PlatformHeader (other pages)', () => {
  test('keeps the same light sticky look and points anchors back at /#section', () => {
    wrap(<PlatformHeader />)
    const header = screen.getByRole('banner')
    expect(header).toHaveAttribute('data-variant', 'light')
    expect(header.className).toContain('sticky')

    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/#features')
    expect(within(nav).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/#faq')
    expect(screen.getByRole('link', { name: 'Start free trial' })).toHaveAttribute('href', '/start-trial')
    expect(screen.getByRole('link', { name: 'Staff login' })).toHaveAttribute('href', '/staff-login')
  })

  test('mobile menu anchors also point at /#section', async () => {
    const user = userEvent.setup()
    wrap(<PlatformHeader />)
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    const menu = document.getElementById('platform-mobile-nav')
    expect(within(menu).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#pricing')
    expect(document.body.style.overflow).toBe('')
  })
})

describe('PlatformBrand', () => {
  test('links to / when signed out (or outside an AuthProvider)', () => {
    wrap(<PlatformBrand />)
    expect(screen.getByRole('link', { name: 'BestoDine home' })).toHaveAttribute('href', '/')
  })

  test('links to the staff workspace when a staff user is signed in', () => {
    wrap(<PlatformBrand />, { isLoggedIn: true, user: { role: 'admin' } })
    expect(screen.getByRole('link', { name: 'BestoDine home' })).toHaveAttribute('href', '/admin/dashboard')
  })

  test('signed-in customer still goes to /', () => {
    wrap(<PlatformBrand />, { isLoggedIn: true, user: { role: 'customer' } })
    expect(screen.getByRole('link', { name: 'BestoDine home' })).toHaveAttribute('href', '/')
  })
})

describe('PlatformFooter', () => {
  test('is light, renders every link, the © line and the made-for line', () => {
    wrap(<PlatformFooter />)
    const footer = screen.getByRole('contentinfo')
    expect(footer.className).toContain('bg-[#F9FAFB]')
    expect(footer.className).not.toContain('bg-[#050505]')
    expect(footer.querySelector('[class*="font-mono"]')).toBeNull()

    const product = screen.getByRole('navigation', { name: 'Product' })
    expect(within(product).getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/#features')
    expect(within(product).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/#pricing')
    expect(within(product).getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/#how-it-works')
    expect(within(product).getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/#faq')

    const start = screen.getByRole('navigation', { name: 'Get started' })
    expect(within(start).getByRole('link', { name: 'Start 14-day free trial' })).toHaveAttribute('href', '/start-trial')
    expect(within(start).getByRole('link', { name: 'Register your hotel' })).toHaveAttribute('href', '/register-restaurant')
    expect(within(start).getByRole('link', { name: 'Request a demo' })).toHaveAttribute('href', '/request-demo')
    expect(within(start).getByRole('link', { name: 'Staff login' })).toHaveAttribute('href', '/staff-login')

    const legal = screen.getByRole('navigation', { name: 'Legal' })
    expect(within(legal).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    expect(within(legal).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')

    expect(screen.getByText(new RegExp(`© ${new Date().getFullYear()} BestoDine`))).toBeInTheDocument()
    expect(screen.getByText('Made for restaurants in India')).toBeInTheDocument()
    expect(screen.getByText(/Restaurant management and QR ordering/)).toBeInTheDocument()
  })
})
