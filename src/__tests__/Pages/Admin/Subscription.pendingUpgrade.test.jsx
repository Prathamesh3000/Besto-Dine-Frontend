/**
 * Admin/Subscription — a pending (unpaid) upgrade must be visible with a
 * way out. Regression (fixed 2026-10-27): after a declined card the
 * backend kept `pendingUpgrade`, answered 409 "complete or cancel that
 * payment" on every new upgrade, and the page showed nothing — the tenant
 * was stuck on the old plan with no cancel anywhere.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
import { toast } from 'react-hot-toast'
import Subscription from '@/Pages/Admin/Subscription'

const current = (pendingUpgrade) => ({
  restaurant: { _id: 'r1', name: 'Test Cafe', slug: 'test-cafe', status: 'active' },
  subscription: { planName: 'Basic', planSlug: 'basic', status: 'active', features: {}, limits: {} },
  addons: [],
  pendingUpgrade,
})

function stubGets(pendingUpgrade) {
  api.get.mockImplementation(async (url) => {
    if (url === '/tenant/billing/current') return { data: { success: true, data: current(pendingUpgrade) } }
    if (url === '/tenant/billing/plans') return { data: { success: true, data: { plans: [], currentPlanSlug: 'basic' } } }
    if (url === '/tenant/billing/invoices') return { data: { success: true, data: [] } }
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
})

describe('pending upgrade banner', () => {
  test('shows the plan, a Resume payment link and a Cancel upgrade button; cancel calls DELETE /upgrade/pending and refetches', async () => {
    stubGets({ planName: 'Premium', planSlug: 'premium', shortUrl: 'https://rzp.io/i/abc', razorpaySubscriptionId: 'sub_1' })
    api.delete.mockResolvedValue({ data: { success: true, message: 'Pending upgrade to Premium cancelled. Your current plan is unchanged.' } })

    renderPage()
    const banner = await screen.findByTestId('pending-upgrade-banner')
    expect(banner).toHaveTextContent('Upgrade to Premium is waiting for payment')
    const resume = screen.getByRole('link', { name: /resume payment/i })
    expect(resume).toHaveAttribute('href', 'https://rzp.io/i/abc')

    const getsBefore = api.get.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: /cancel upgrade/i }))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/tenant/billing/upgrade/pending', { _silent: true }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Pending upgrade to Premium cancelled. Your current plan is unchanged.'))
    // the page re-reads the subscription bundle so the banner can disappear
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(getsBefore))
  })

  test('declining the confirm sends nothing', async () => {
    stubGets({ planName: 'Premium', planSlug: 'premium', shortUrl: '', razorpaySubscriptionId: 'sub_1' })
    window.confirm = vi.fn(() => false)
    renderPage()
    await screen.findByTestId('pending-upgrade-banner')
    expect(screen.queryByRole('link', { name: /resume payment/i })).toBeNull() // no shortUrl → no resume link
    await userEvent.click(screen.getByRole('button', { name: /cancel upgrade/i }))
    expect(api.delete).not.toHaveBeenCalled()
  })

  test('no pending upgrade → no banner', async () => {
    stubGets(null)
    renderPage()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/tenant/billing/current', expect.anything()))
    await waitFor(() => expect(screen.getByText('Basic')).toBeInTheDocument())
    expect(screen.queryByTestId('pending-upgrade-banner')).toBeNull()
  })
})
