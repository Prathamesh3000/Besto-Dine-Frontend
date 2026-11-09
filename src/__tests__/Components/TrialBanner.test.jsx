/**
 * TrialBanner - owner-only free-trial bar (days wording, tone, dismissal).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import TrialBanner from '@/Components/Common/TrialBanner'

const setUser = (role, tenant) => { auth = { user: { role, tenant } } }
const trial = (daysLeft, extra = {}) => ({ status: 'trial', daysLeft, trialExpired: false, ...extra })
const show = () => render(<MemoryRouter><TrialBanner /></MemoryRouter>)

beforeEach(() => { sessionStorage.clear() })

describe('TrialBanner', () => {
  test('>3 days: neutral tone, plural wording, links to subscription, dismissible', async () => {
    setUser('admin', trial(10))
    show()
    const bar = screen.getByTestId('trial-banner')
    expect(bar).toHaveTextContent('Free trial: 10 days left')
    expect(bar).toHaveAttribute('data-tone', 'info')
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute('href', '/admin/subscription')
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('trial-banner')).toBeNull()
    expect(sessionStorage.getItem('bd_trial_banner_dismissed')).toBe('1')
  })

  test('stays dismissed for the session but only while >3 days remain', () => {
    sessionStorage.setItem('bd_trial_banner_dismissed', '1')
    setUser('admin', trial(8))
    const { unmount } = show()
    expect(screen.queryByTestId('trial-banner')).toBeNull()
    unmount()
    setUser('admin', trial(3))
    show()
    expect(screen.getByTestId('trial-banner')).toBeInTheDocument()
  })

  test('<=3 days is amber and cannot be dismissed', () => {
    setUser('admin', trial(3))
    show()
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-tone', 'amber')
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('3 days left')
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
  })

  test('last day is red with singular wording; day 0 says ends today', () => {
    setUser('admin', trial(1))
    const { unmount } = show()
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-tone', 'red')
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('1 day left (last day)')
    unmount()
    setUser('admin', trial(0))
    show()
    expect(screen.getByTestId('trial-banner')).toHaveTextContent('ends today')
    expect(screen.getByTestId('trial-banner')).toHaveAttribute('data-tone', 'red')
  })

  test.each([
    ['paid tenant (status active)', 'admin', { status: 'active', daysLeft: null }],
    ['trial but daysLeft null', 'admin', { status: 'trial', daysLeft: null }],
    ['expired trial', 'admin', trial(0, { trialExpired: true })],
    ['manager', 'manager', trial(5)],
    ['waiter', 'waiter', trial(5)],
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
