/** Pages/Login - the optional 2FA code step. */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = { login: vi.fn(), verifyTwoFactor: vi.fn(), isLoggedIn: false, user: null }
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => auth,
  USER_ROLES: { WAITER: 'waiter', CAPTAIN: 'captain', CUSTOMER: 'customer', ADMIN: 'admin', MANAGER: 'manager', CHEF: 'chef', SUPERADMIN: 'superadmin' },
}))
vi.mock('@/utils/tenant', () => ({ setActiveTenant: vi.fn(), clearActiveTenant: vi.fn() }))
vi.mock('@/assets/BestoDineMark', () => ({ default: () => null }))
vi.mock('@/Components/Common/RequestDemoForm', () => ({ default: () => null }))

import Login from '@/Pages/Login'

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/staff-login']}>
      <Routes>
        <Route path="/staff-login" element={<Login />} />
        <Route path="/admin/dashboard" element={<div>ADMIN-HOME</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}
async function passwordStep(user) {
  await user.type(screen.getByLabelText(/Email address/), 'owner@cafe.in')
  await user.type(screen.getByLabelText(/^Password/), 'Secret#123')
  await user.click(screen.getByRole('button', { name: /Sign In/ }))
}

beforeEach(() => {
  auth.login.mockReset().mockResolvedValue({ success: false, twoFactorRequired: true, challengeToken: 'chal' })
  auth.verifyTwoFactor.mockReset()
})

describe('Staff Login - 2FA step', { timeout: 20000 }, () => {
  test('shows the code step after the password and signs in with the authenticator code', async () => {
    auth.verifyTwoFactor.mockResolvedValue({ success: true, role: 'admin', user: { role: 'admin' }, audience: 'staff' })
    const user = renderLogin()
    await passwordStep(user)
    const code = await screen.findByLabelText('Authentication code')
    await user.type(code, '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(auth.verifyTwoFactor).toHaveBeenCalledWith('chal', { code: '123456' }))
    expect(await screen.findByText('ADMIN-HOME')).toBeInTheDocument()
  })

  test('accepts a recovery code via the toggle', async () => {
    auth.verifyTwoFactor.mockResolvedValue({ success: true, role: 'admin', user: { role: 'admin' }, audience: 'staff' })
    const user = renderLogin()
    await passwordStep(user)
    await user.click(await screen.findByRole('button', { name: /Use a recovery code/ }))
    await user.type(screen.getByLabelText('Recovery code'), 'ABCDE-FGHJK')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(auth.verifyTwoFactor).toHaveBeenCalledWith('chal', { recoveryCode: 'ABCDE-FGHJK' }))
  })

  test('a wrong code shows the server message and keeps the code step', async () => {
    auth.verifyTwoFactor.mockResolvedValue({ success: false, code: 'INVALID_CODE', message: 'That code is not correct.' })
    const user = renderLogin()
    await passwordStep(user)
    await user.type(await screen.findByLabelText('Authentication code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not correct.')
    expect(screen.getByTestId('two-factor-form')).toBeInTheDocument()
  })

  test('an expired challenge returns to the password form', async () => {
    auth.verifyTwoFactor.mockResolvedValue({ success: false, code: 'INVALID_CHALLENGE', message: 'expired' })
    const user = renderLogin()
    await passwordStep(user)
    await user.type(await screen.findByLabelText('Authentication code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(screen.queryByTestId('two-factor-form')).toBeNull())
    expect(screen.getByText('expired')).toBeInTheDocument()
  })
})
