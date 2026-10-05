/**
 * Loggedin/Login — customer sign-in / registration.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = { login: vi.fn(), register: vi.fn(), loginWithGoogle: vi.fn(), isLoggedIn: false, user: null, setGuestMode: vi.fn(), logout: vi.fn() }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/utils/api', () => ({
  default: { post: vi.fn(() => Promise.resolve({})) },
  publicAPI: { getRestaurantBySlug: vi.fn(() => Promise.resolve({ data: { data: { name: 'Cafe Uno' } } })), listRestaurants: vi.fn(() => Promise.resolve({ data: { data: [] } })) },
}))
vi.mock('@/utils/tenant', () => ({ getActiveTenantSlug: () => 'cafe-uno', activeRestaurantPath: () => '/cafe-uno' }))
vi.mock('@/utils/googleSignIn', () => ({ isGoogleSignInAvailable: () => false }))
vi.mock('@/Components/Common/GoogleSignInButton', () => ({ default: () => null }))
vi.mock('@/Components/Common/ForgotPasswordModal', () => ({ default: () => null }))
vi.mock('@/Components/Common/AllergyPicker', () => ({ default: () => null }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})

import api from '@/utils/api'
import Login from '@/Pages/Loggedin/Login'

// Login.jsx focuses the email field 250 ms after mount. If that timer fires
// while a test is typing the password, the remaining keystrokes land in the
// email field and validation fails before login() is called (flaky ~1 in 3).
// Typing tests therefore wait for that focus before interacting.
async function renderLogin(state, { waitForFocus = true } = {}) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/customer/home" element={<div>customer-home</div>} />
        <Route path="/customer/cart" element={<div>customer-cart</div>} />
        <Route path="/admin/dashboard" element={<div>admin-dashboard</div>} />
        <Route path="/waiter/home" element={<div>waiter-home</div>} />
      </Routes>
    </MemoryRouter>,
  )
  if (waitForFocus) {
    await waitFor(() => expect(screen.getByLabelText('Email address')).toHaveFocus(), { timeout: 2000 })
  }
  return userEvent.setup()
}
const signIn = () => screen.getByRole('button', { name: /^Sign In$/ })

beforeEach(() => { Object.assign(auth, { isLoggedIn: false, user: null }) })

describe('Customer Login — sign in', () => {
  test('empty submit: inline errors, login not called', async () => {
    const user = await renderLogin()
    await user.click(signIn())
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  test.each(['plainaddress', 'a@b', 'a b@c.com'])('invalid email %s is rejected', async (email) => {
    const user = await renderLogin()
    await user.type(screen.getByLabelText('Email address'), email)
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(signIn())
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  test('success: logs in with the customer audience and lands on the menu home (takeaway mode)', async () => {
    auth.login.mockResolvedValue({ success: true })
    const user = await renderLogin()
    await user.type(screen.getByLabelText('Email address'), '  asha@x.in ')
    await user.type(screen.getByLabelText('Password'), 'Pw#12345')
    await user.click(signIn())
    expect(await screen.findByText('customer-home')).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith('asha@x.in', 'Pw#12345', 'customer')
    expect(localStorage.getItem('orderType')).toBe('takeaway')
  })

  test('success with a `next` target returns the customer where they came from', async () => {
    auth.login.mockResolvedValue({ success: true })
    const user = await renderLogin({ next: '/customer/cart' })
    await user.type(screen.getByLabelText('Email address'), 'asha@x.in')
    await user.type(screen.getByLabelText('Password'), 'Pw#12345')
    await user.click(signIn())
    expect(await screen.findByText('customer-cart')).toBeInTheDocument()
  })

  test('QR-scan login claims the scanned table and keeps dine-in context', async () => {
    localStorage.setItem('fromQrScan', 'true')
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 'tbl9', name: '9' }))
    auth.login.mockResolvedValue({ success: true })
    const user = await renderLogin()
    await user.type(screen.getByLabelText('Email address'), 'asha@x.in')
    await user.type(screen.getByLabelText('Password'), 'Pw#12345')
    await user.click(signIn())
    await screen.findByText('customer-home')
    expect(api.post).toHaveBeenCalledWith('/tables/tbl9/claim')
    expect(localStorage.getItem('dineInTable')).not.toBeNull()
  })

  test.each([
    [{ success: false, message: 'Invalid email or password' }, 'Invalid email or password'],
    [{ success: false }, 'Login failed. Please check your credentials.'],
  ])('failure %j shows "%s"', async (result, msg) => {
    auth.login.mockResolvedValue(result)
    const user = await renderLogin()
    await user.type(screen.getByLabelText('Email address'), 'asha@x.in')
    await user.type(screen.getByLabelText('Password'), 'bad')
    await user.click(signIn())
    expect(await screen.findByText(msg, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText('customer-home')).not.toBeInTheDocument()
  })

  test.each([
    ['admin', 'admin-dashboard'],
    ['waiter', 'waiter-home'],
  ])('a stale %s session opening the customer login is sent to its own workspace', async (role, dest) => {
    Object.assign(auth, { isLoggedIn: true, user: { role } })
    await renderLogin(undefined, { waitForFocus: false })
    expect(await screen.findByText(dest)).toBeInTheDocument()
  })
})

describe('Customer Login — register validation', () => {
  async function openRegister(user) {
    await user.click(screen.getAllByRole('button', { name: /Create (an )?account|Sign up|Register/i })[0])
  }

  test('step 1 enforces name, password policy and confirmation match', async () => {
    const user = await renderLogin()
    await openRegister(user)
    await user.click(screen.getByRole('button', { name: /Next|Continue/i }))
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Please confirm your password')).toBeInTheDocument()
    expect(auth.register).not.toHaveBeenCalled()
  })
})
