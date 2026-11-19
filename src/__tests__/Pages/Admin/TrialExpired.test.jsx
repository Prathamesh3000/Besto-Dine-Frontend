/**
 * TrialExpired - full-screen "Upgrade to continue" gate for a locked tenant:
 * owner gets plan / export / logout, staff get "ask the owner" / logout, and
 * anyone not locked is sent back to the dashboard.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let auth
const logout = vi.fn()
const apiGet = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/utils/api', () => ({ default: { get: (...a) => apiGet(...a) } }))
vi.mock('react-hot-toast', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
  default: {},
}))

import TrialExpired from '@/Pages/Admin/TrialExpired'

const TRIAL_END = '2026-11-01T00:00:00.000Z'
const LOCK_AT = '2026-11-04T00:00:00.000Z'
const lockedTenant = { status: 'suspended', trialState: 'locked', trialExpired: true, trialEndDate: TRIAL_END, lockAt: LOCK_AT, daysLeft: 0 }
const setUser = (role, tenant = lockedTenant) => { auth = { user: { role, tenant }, logout } }
const show = () => render(
  <MemoryRouter initialEntries={['/trial-expired']}>
    <Routes>
      <Route path="/trial-expired" element={<TrialExpired />} />
      <Route path="/admin/dashboard" element={<div>DASHBOARD</div>} />
      <Route path="/admin/subscription" element={<div>BILLING</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => { logout.mockReset(); apiGet.mockReset(); toastSuccess.mockReset(); toastError.mockReset() })

describe('TrialExpired', () => {
  test('owner: title, dates, Choose a plan → billing, Download my data, Log out', async () => {
    setUser('admin')
    show()
    const screenEl = screen.getByTestId('trial-expired-screen')
    expect(screenEl).toHaveAttribute('data-variant', 'owner')
    expect(screen.getByRole('heading', { name: 'Upgrade to continue' })).toBeInTheDocument()
    expect(screenEl).toHaveTextContent(`ended on ${new Date(TRIAL_END).toLocaleDateString()}`)
    expect(screenEl).toHaveTextContent(`locked on ${new Date(LOCK_AT).toLocaleDateString()}`)
    expect(screen.queryByText('Ask your restaurant owner to upgrade')).toBeNull()
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute('href', '/admin/subscription')
    expect(screen.getByRole('button', { name: /download my data/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  test('owner: Download my data calls GET /tenant/export as a blob', async () => {
    setUser('admin')
    apiGet.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), headers: { 'content-disposition': 'attachment; filename="spice-export.zip"' } })
    const createObjectURL = vi.fn(() => 'blob:x')
    const revokeObjectURL = vi.fn()
    window.URL.createObjectURL = createObjectURL
    window.URL.revokeObjectURL = revokeObjectURL
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    show()
    await userEvent.click(screen.getByRole('button', { name: /download my data/i }))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Export downloaded'))
    expect(apiGet).toHaveBeenCalledWith('/tenant/export', expect.objectContaining({ responseType: 'blob' }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })

  test('staff: "Ask your restaurant owner to upgrade", no plan/export, Log out works', async () => {
    setUser('waiter')
    show()
    expect(screen.getByTestId('trial-expired-screen')).toHaveAttribute('data-variant', 'staff')
    expect(screen.getByRole('heading', { name: 'Upgrade to continue' })).toBeInTheDocument()
    expect(screen.getByText('Ask your restaurant owner to upgrade')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Choose a plan' })).toBeNull()
    expect(screen.queryByRole('button', { name: /download my data/i })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  test('lock date falls back to trialEndDate + 3 days when lockAt is missing', () => {
    setUser('admin', { ...lockedTenant, lockAt: undefined })
    show()
    const expected = new Date(new Date(TRIAL_END).getTime() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString()
    expect(screen.getByTestId('trial-expired-screen')).toHaveTextContent(`locked on ${expected}`)
  })

  test.each([
    ['read-only owner', 'admin', { status: 'trial', trialState: 'read_only', readOnly: true, lockAt: LOCK_AT }],
    ['active trial', 'admin', { status: 'trial', trialState: 'active', daysLeft: 5 }],
    ['paid tenant', 'admin', { status: 'active', trialState: 'none' }],
    ['read-only waiter', 'waiter', { status: 'trial', trialState: 'read_only', readOnly: true }],
  ])('%s is redirected to the dashboard', (_n, role, tenant) => {
    setUser(role, tenant)
    show()
    expect(screen.getByText('DASHBOARD')).toBeInTheDocument()
    expect(screen.queryByTestId('trial-expired-screen')).toBeNull()
  })
})
