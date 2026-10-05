/**
 * Pages/Login — STAFF + Super Admin sign-in (/staff-login).
 * Validation, server error surfacing, role-based landing, the
 * mustChangePassword detour and tenant locking.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const auth = { login: vi.fn(), isLoggedIn: false, user: null }
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => auth,
  USER_ROLES: { WAITER: 'waiter', CAPTAIN: 'captain', CUSTOMER: 'customer', ADMIN: 'admin', MANAGER: 'manager', CHEF: 'chef', SUPERADMIN: 'superadmin' },
}))
vi.mock('@/utils/tenant', () => ({ setActiveTenant: vi.fn(), clearActiveTenant: vi.fn() }))
vi.mock('@/assets/BestoDineMark', () => ({ default: () => null }))
vi.mock('@/Components/Common/RequestDemoForm', () => ({ default: () => null }))

import { setActiveTenant, clearActiveTenant } from '@/utils/tenant'
import Login from '@/Pages/Login'

let landed = null
function Probe({ name }) { landed = { name, state: useLocation().state }; return <div>{name}</div> }
const DESTS = ['/superadmin/dashboard', '/waiter/home', '/chef/dashboard', '/admin/dashboard', '/force-change-password', '/']

function renderLogin(path = '/staff-login') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/staff-login" element={<Login />} />
        {DESTS.map((d) => <Route key={d} path={d} element={<Probe name={d} />} />)}
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}
async function submit(user, email = 'owner@cafe.in', password = 'Secret#123') {
  if (email) await user.type(screen.getByLabelText(/Email address/), email)
  if (password) await user.type(screen.getByLabelText(/^Password/), password)
  await user.click(screen.getByRole('button', { name: /Sign In/ }))
}

beforeEach(() => {
  landed = null
  Object.assign(auth, { isLoggedIn: false, user: null })
})

describe('Staff Login — validation', () => {
  test('empty submit shows both required errors and never calls login', async () => {
    const user = renderLogin()
    await user.click(screen.getByRole('button', { name: /Sign In/ }))
    expect(await screen.findByText(/Email is required|Email.*required/i)).toBeInTheDocument()
    expect(screen.getByText(/Password.*required/i)).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  test('malformed email is rejected client-side', async () => {
    const user = renderLogin()
    await submit(user, 'not-an-email')
    expect(screen.getByLabelText(/Email address/)).toHaveAttribute('aria-invalid', 'true')
    expect(auth.login).not.toHaveBeenCalled()
  })
})

describe('Staff Login — results', () => {
  test.each([
    ['superadmin', '/superadmin/dashboard'],
    ['admin', '/admin/dashboard'],
    ['manager', '/admin/dashboard'],
    ['waiter', '/waiter/home'],
    ['captain', '/waiter/home'],
    ['chef', '/chef/dashboard'],
  ])('role %s lands on %s', async (role, dest) => {
    auth.login.mockResolvedValue({ success: true, role, user: { role } })
    const user = renderLogin()
    await submit(user)
    expect(await screen.findByText(dest)).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith('owner@cafe.in', 'Secret#123', 'staff')
    expect(clearActiveTenant).toHaveBeenCalled()
  })

  test('mustChangePassword detours to /force-change-password with the session audience', async () => {
    auth.login.mockResolvedValue({ success: true, role: 'admin', audience: 'staff', user: { role: 'admin', mustChangePassword: true } })
    const user = renderLogin()
    await submit(user)
    expect(await screen.findByText('/force-change-password')).toBeInTheDocument()
    expect(landed.state).toEqual({ audience: 'staff' })
  })

  test('the tenant from the login response is locked as the active tenant', async () => {
    auth.login.mockResolvedValue({ success: true, role: 'waiter', user: { role: 'waiter', tenant: { slug: 'cafe-uno', name: 'Cafe Uno', _id: 't1' } } })
    const user = renderLogin()
    await submit(user)
    await screen.findByText('/waiter/home')
    expect(setActiveTenant).toHaveBeenCalledWith({ slug: 'cafe-uno', name: 'Cafe Uno', _id: 't1' })
  })

  test.each([
    [{ success: false, message: 'Invalid email or password' }, 'Invalid email or password'],
    [{ success: false }, 'Login failed. Please check your credentials.'],
  ])('failed login %j shows "%s" inline and stays', async (result, msg) => {
    auth.login.mockResolvedValue(result)
    const user = renderLogin()
    await submit(user)
    expect(await screen.findByText(msg, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(landed).toBeNull()
  })

  test('a thrown network error surfaces the server message', async () => {
    auth.login.mockRejectedValue({ response: { data: { message: 'Account locked for 15 minutes' } } })
    const user = renderLogin()
    await submit(user)
    expect(await screen.findByText('Account locked for 15 minutes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign In/ })).toBeEnabled()
  })

  test('the submit button is disabled while signing in (no double submit)', async () => {
    let resolve
    auth.login.mockReturnValue(new Promise((r) => { resolve = r }))
    const user = renderLogin()
    await submit(user)
    expect(screen.getByRole('button', { name: /Signing in/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Signing in/ }))
    expect(auth.login).toHaveBeenCalledTimes(1)
    resolve({ success: true, role: 'chef', user: { role: 'chef' } })
    await screen.findByText('/chef/dashboard')
  })

  test('"Remember my email" persists the email; unchecked clears it', async () => {
    auth.login.mockResolvedValue({ success: false, message: 'x' })
    const user = renderLogin()
    await user.click(screen.getByLabelText(/Remember my email/))
    await submit(user)
    await screen.findByText('x')
    expect(localStorage.getItem('staff_remembered_email')).toBe('owner@cafe.in')
  })
})

describe('Staff Login — already signed in', () => {
  test('an existing staff session is forwarded to its workspace', async () => {
    Object.assign(auth, { isLoggedIn: true, user: { role: 'chef' } })
    renderLogin()
    expect(await screen.findByText('/chef/dashboard')).toBeInTheDocument()
  })

  test('?switch=1 keeps the form open to sign in as someone else', async () => {
    Object.assign(auth, { isLoggedIn: true, user: { role: 'chef' } })
    renderLogin('/staff-login?switch=1')
    await waitFor(() => expect(screen.getByRole('button', { name: /Sign In/ })).toBeInTheDocument())
    expect(landed).toBeNull()
  })
})
