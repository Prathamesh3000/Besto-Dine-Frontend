/**
 * UpgradeModal - opens on bd:subscription-read-only (and once per session when
 * the cached tenant is already read-only); owner vs staff copy.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/utils/api', () => ({
  default: {},
  SUBSCRIPTION_READ_ONLY_EVENT: 'bd:subscription-read-only',
  SUBSCRIPTION_BLOCKED_EVENT: 'bd:subscription-blocked',
}))

import UpgradeModal from '@/Components/Common/UpgradeModal'

const DAY = 24 * 60 * 60 * 1000
const LOCK_AT = new Date(Date.now() + 2 * DAY).toISOString()
const setUser = (role, tenant = { status: 'trial', trialState: 'active', daysLeft: 5 }) => { auth = { user: { role, tenant } } }
const show = () => render(
  <MemoryRouter initialEntries={['/admin/menu']}>
    <Routes>
      <Route path="/admin/menu" element={<><UpgradeModal /><div>MENU</div></>} />
      <Route path="/admin/subscription" element={<div>BILLING</div>} />
    </Routes>
  </MemoryRouter>,
)
const fire = (detail = { code: 'SUBSCRIPTION_READ_ONLY', lockAt: LOCK_AT, trialEndDate: null, message: 'Read-only' }) => {
  act(() => { window.dispatchEvent(new CustomEvent('bd:subscription-read-only', { detail })) })
}

beforeEach(() => { sessionStorage.clear() })

describe('UpgradeModal', () => {
  test('closed by default for an active trial', () => {
    setUser('admin')
    show()
    expect(screen.queryByTestId('upgrade-modal')).toBeNull()
  })

  test('read-only event opens it; owner sees "Upgrade now" → billing', async () => {
    setUser('admin')
    show()
    fire()
    const modal = screen.getByTestId('upgrade-modal')
    expect(modal).toHaveTextContent('Your free trial has ended')
    expect(modal).toHaveTextContent(`read-only until ${new Date(LOCK_AT).toLocaleDateString()}`)
    expect(modal).toHaveTextContent(`locks completely on ${new Date(LOCK_AT).toLocaleDateString()}`)
    expect(screen.queryByText('Ask your restaurant owner to upgrade')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade now' }))
    expect(screen.getByText('BILLING')).toBeInTheDocument()
    expect(screen.queryByTestId('upgrade-modal')).toBeNull()
  })

  test('staff see "Ask your restaurant owner to upgrade" and no upgrade button; closable', async () => {
    setUser('waiter')
    show()
    fire()
    const modal = screen.getByTestId('upgrade-modal')
    expect(modal).toHaveTextContent('Ask your restaurant owner to upgrade')
    expect(screen.queryByRole('button', { name: 'Upgrade now' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('upgrade-modal')).toBeNull()
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })

  test('already read-only on mount: opens once per session (lock date from tenant)', () => {
    setUser('admin', { status: 'trial', trialState: 'read_only', readOnly: true, lockAt: LOCK_AT })
    const { unmount } = show()
    expect(screen.getByTestId('upgrade-modal')).toHaveTextContent(new Date(LOCK_AT).toLocaleDateString())
    expect(sessionStorage.getItem('bd_upgrade_modal_seen')).toBe('1')
    unmount()
    show()
    expect(screen.queryByTestId('upgrade-modal')).toBeNull()
  })

  test('a later refused write re-opens it even after it was seen', () => {
    sessionStorage.setItem('bd_upgrade_modal_seen', '1')
    setUser('manager', { status: 'trial', trialState: 'read_only', readOnly: true, lockAt: LOCK_AT })
    show()
    expect(screen.queryByTestId('upgrade-modal')).toBeNull()
    fire()
    expect(screen.getByTestId('upgrade-modal')).toBeInTheDocument()
  })

  test('never renders for customers or the super admin', () => {
    setUser('customer', { status: 'trial', trialState: 'read_only', readOnly: true })
    const { unmount } = show()
    fire()
    expect(screen.queryByTestId('upgrade-modal')).toBeNull()
    unmount()
    setUser('superadmin', null)
    show()
    fire()
    expect(screen.queryByTestId('upgrade-modal')).toBeNull()
  })
})
