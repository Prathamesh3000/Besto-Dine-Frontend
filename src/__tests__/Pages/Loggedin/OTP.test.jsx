/**
 * Loggedin/OTP — 6-digit code entry, verification and the 30 s resend
 * cooldown (fake timers).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/utils/api', () => ({ default: { post: vi.fn() } }))
vi.mock('@/utils/customerSession', () => ({ claimCustomerData: vi.fn() }))
vi.mock('@/utils/authStorage', () => ({ setAuth: vi.fn() }))

import api from '@/utils/api'
import { setAuth } from '@/utils/authStorage'
import { claimCustomerData } from '@/utils/customerSession'
import OTP from '@/Pages/Loggedin/OTP'

let hrefSet
beforeEach(() => {
  vi.useFakeTimers()
  hrefSet = vi.fn()
  vi.stubGlobal('location', { ...window.location, set href(v) { hrefSet(v) }, get href() { return 'http://localhost/otp' } })
})
afterEach(() => { vi.unstubAllGlobals() })

function renderOtp(state = { phoneNumber: '9876543210', countryCode: '+91' }) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/otp', state }]}>
      <Routes><Route path="/otp" element={<OTP />} /></Routes>
    </MemoryRouter>,
  )
}
const boxes = () => screen.getAllByRole('textbox')
const resendBtn = () => screen.getByRole('button', { name: /Resend/ })
async function typeCode(code) {
  for (const [i, d] of [...code].entries()) fireEvent.change(boxes()[i], { target: { value: d } })
  await act(async () => { await vi.advanceTimersByTimeAsync(150) }) // auto-submit fires after 100 ms
}

describe('OTP entry', () => {
  test('shows the destination number and six single-digit boxes', () => {
    renderOtp()
    expect(screen.getByText(/6-digit code to \+91 9876543210/)).toBeInTheDocument()
    expect(boxes()).toHaveLength(6)
  })

  test('non-digits are ignored', () => {
    renderOtp()
    fireEvent.change(boxes()[0], { target: { value: 'a' } })
    expect(boxes()[0]).toHaveValue('')
  })

  test('verifying with fewer than 6 digits shows an error and calls nothing', async () => {
    renderOtp()
    fireEvent.change(boxes()[0], { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Continue' }))
    expect(screen.getByText('Please enter the 6-digit OTP')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  test('6 digits auto-submit; success stores the customer session and redirects home', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: 'T', refreshToken: 'R', _id: 'u1', name: 'Asha' } })
    renderOtp()
    await typeCode('123456')
    expect(api.post).toHaveBeenCalledWith('/auth/verify-otp', { mobile: '+919876543210', code: '123456' })
    expect(claimCustomerData).toHaveBeenCalledWith('u1', { keepUnowned: false })
    expect(setAuth).toHaveBeenCalledWith('T', { _id: 'u1', name: 'Asha' }, 'customer', 'R')
    expect(hrefSet).toHaveBeenCalledWith('/customer/home')
  })

  test('takeaway customer goes to branch selection after verifying', async () => {
    localStorage.setItem('orderType', 'takeaway')
    api.post.mockResolvedValue({ data: { success: true, token: 'T', _id: 'u1' } })
    renderOtp()
    await typeCode('123456')
    expect(hrefSet).toHaveBeenCalledWith('/branch-selection')
  })

  test('pasting a 6-digit code fills the boxes and submits', async () => {
    api.post.mockResolvedValue({ data: { success: false } })
    renderOtp()
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => '98-76 54' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(boxes().map((b) => b.value).join('')).toBe('987654')
    expect(api.post).toHaveBeenCalledWith('/auth/verify-otp', { mobile: '+919876543210', code: '987654' })
  })

  test('wrong code shows the server message', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Invalid or expired OTP' } } })
    renderOtp()
    await typeCode('000000')
    expect(screen.getByText('Invalid or expired OTP')).toBeInTheDocument()
    expect(hrefSet).not.toHaveBeenCalled()
  })
  // Regression (fixed 2026-10): handleVerifyOTP has a synchronous in-flight guard, so tap + auto-submit verify once.
  test('tapping "Verify" right after typing the 6th digit verifies the code only once', async () => {
    let resolveFirst
    api.post.mockReturnValueOnce(new Promise((r) => { resolveFirst = r }))
      .mockRejectedValueOnce({ response: { data: { message: 'Invalid or expired OTP' } } })
    renderOtp()
    for (const [i, d] of [...'123456'].entries()) fireEvent.change(boxes()[i], { target: { value: d } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Continue' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    resolveFirst({ data: { success: true, token: 'T', _id: 'u1' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(api.post.mock.calls.filter((c) => c[0] === '/auth/verify-otp')).toHaveLength(1)
    // The queued second (rejected) response is now never consumed — drop it
    // so it cannot leak into the next test's first api.post.
    api.post.mockReset()
  })
})

describe('OTP resend countdown', () => {
  test('counts down from 30 s; resend is disabled until 0', async () => {
    renderOtp()
    expect(resendBtn()).toHaveTextContent('Resend in 30s')
    expect(resendBtn()).toBeDisabled()
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(resendBtn()).toHaveTextContent('Resend in 29s')
    for (let i = 0; i < 29; i++) await act(async () => { vi.advanceTimersByTime(1000) })
    expect(resendBtn()).toHaveTextContent('Resend OTP')
    expect(resendBtn()).toBeEnabled()
  })

  test('resend calls send-otp, clears the boxes and restarts the 30 s cooldown', async () => {
    api.post.mockResolvedValue({ data: { success: true } })
    renderOtp()
    fireEvent.change(boxes()[0], { target: { value: '4' } })
    for (let i = 0; i < 30; i++) await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => { fireEvent.click(resendBtn()) })
    expect(api.post).toHaveBeenCalledWith('/auth/send-otp', { mobile: '+919876543210' })
    expect(boxes()[0]).toHaveValue('')
    expect(resendBtn()).toHaveTextContent('Resend in 30s')
  })

  test('a failed resend shows an error and leaves resend available', async () => {
    api.post.mockRejectedValue(new Error('net'))
    renderOtp()
    for (let i = 0; i < 30; i++) await act(async () => { vi.advanceTimersByTime(1000) })
    await act(async () => { fireEvent.click(resendBtn()) })
    expect(screen.getByText('Failed to resend OTP. Please try again.')).toBeInTheDocument()
    expect(resendBtn()).toBeEnabled()
  })
})
