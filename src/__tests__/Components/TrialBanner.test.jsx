/**
 * TrialBanner - owner-only free-trial bar (days wording, tone, dismissal,
 * read-only grace line).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import TrialBanner from '@/Components/Common/TrialBanner'

const DAY = 24 * 60 * 60 * 1000
const setUser = (role, tenant) => { auth = { user: { role, tenant } } }
const trial = (daysLeft, extra = {}) => ({ status: 'trial', trialState: 'active', daysLeft, trialExpired: false, readOnly: false, ...extra })
const readOnly = (msToLock, extra = {}) => ({
  status: 'trial', trialState: 'read_only', readOnly: true, trialExpired: false, daysLeft: 0,
  trialEndDate: new Date(Date.now() - DAY).toISOString(),
  lockAt: new Date(Date.now() + msToLock).toISOString(),
  ...extra,
})
const show = () => render(<MemoryRouter><TrialBanner /></MemoryRouter>)

beforeEach(() => { sessionStorage.clear() })

describe('TrialBanner', () => {
  test('>7 days: blue tone, "Free trial: N days left", Upgrade button, dismissible', async () => {
    setUser('admin', trial(10))
    show()
    const bar = screen.getByTestId('trial-banner')
    expect(bar).toHaveTextContent('Free trial: 10 days left')
    expect(bar).toHaveAttribute('data-tone', 'blue')
    expect(bar.className).toContain('border-sky-300')
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/admin/subscription')
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('trial-banner')).toBeNull()
    expect(sessionStorage.getItem('bd_trial_banner_dismissed')).toBe('1')
  })

  test('stays dismissed for the session but only while >7 days remain', () => {
    sessionStorage.setItem('bd_trial_banner_dismissed', '1')
    setUser('admin', trial(8))
    const { unmount } = show()
    expect(screen.queryByTestId('trial-banner')).toBeNull()
    unmount()
    setUser('admin', trial(7))
    show()
    expect(screen.getByTestId('trial-banner')).toBeInTheDocument()
  })

  test('7 days is amber and cannot be dismissed', () => {
    setUser('admin', trial(7))
    show()
    const bar = screen.getByTestId('trial-banner')
    expect(bar).toHaveAttribute('data-tone', 'amber')
    expect(bar).toHaveTextContent('Free trial: 7 days left')
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
    expect(screen.getByRole('link', { name: 'Upgrade' })).toBeInTheDocument()
  })

  test('3 days is red; last day singular; day 0 says ends today', () => {
    setUser('admin', trial(3))
    const { unmount } = show()
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-tone', 'red')
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('3 days left')
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
    unmount()
    setUser('admin', trial(1))
    const r2 = show()
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('Free trial: 1 day left')
    r2.unmount()
    setUser('admin', trial(0))
    show()
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('ends today')
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-tone', 'red')
  })

  test('read-only window: non-dismissible line with the lock date, amber by default', () => {
    const t = readOnly(2 * DAY)
    setUser('admin', t)
    sessionStorage.setItem('bd_trial_banner_dismissed', '1') // ignored: not dismissible
    show()
    const bar = screen.getByTestId('trial-banner')
    expect(bar).toHaveAttribute('data-tone', 'amber')
    expect(bar).toHaveAttribute('data-read-only', 'true')
    expect(bar).toHaveTextContent(`Your trial ended — read-only until ${new Date(t.lockAt).toLocaleDateString()}. Upgrade to keep editing.`)
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute('href', '/admin/subscription')
  })

  test('read-only window turns red on the last day before the lock', () => {
    setUser('admin', readOnly(12 * 60 * 60 * 1000))
    show()
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-tone', 'red')
  })

  test('legacy snapshot without trialState still resolves (status trial + daysLeft)', () => {
    setUser('admin', { status: 'trial', daysLeft: 12 })
    show()
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-tone', 'blue')
  })

  test.each([
    ['paid tenant (status active)', 'admin', { status: 'active', trialState: 'none', daysLeft: null }],
    ['trial but daysLeft null', 'admin', { status: 'trial', trialState: 'active', daysLeft: null }],
    ['locked trial', 'admin', trial(0, { trialState: 'locked', trialExpired: true })],
    ['legacy locked (trialExpired only)', 'admin', { status: 'suspended', daysLeft: 0, trialExpired: true }],
    ['manager', 'manager', trial(5)],
    ['waiter', 'waiter', trial(5)],
    ['waiter in read-only', 'waiter', readOnly(2 * DAY)],
    ['customer', 'customer', trial(5)],
  ])('hidden for %s', (_n, role, tenant) => {
    setUser(role, tenant)
    show()
    expect(screen.queryByTestId('trial-banner')).toBeNull()
  })

  test('works when sessionStorage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    setUser('admin', trial(9))
    show()
    expect(screen.getByTestId('trial-banner')).toBeInTheDocument()
    spy.mockRestore()
  })
})
