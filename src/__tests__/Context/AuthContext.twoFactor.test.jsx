import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, waitFor, act } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api, CUSTOMER_SESSION_EXPIRED_EVENT: 'bd:customer-session-expired' }))
vi.mock('@/utils/socket', () => ({ disconnectSocket: vi.fn(), reconnectWithAuth: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() }, default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/Components/Common/SessionChangedOverlay', () => ({ default: () => null }))

import { AuthProvider, useAuth } from '@/Context/AuthContext'

let auth
function Probe() { auth = useAuth(); return null }
const mount = async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(auth.isLoading).toBe(false))
}

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: {} })
  api.post.mockReset()
  localStorage.clear()
  window.history.replaceState({}, '', '/staff-login')
})

describe('login with 2FA', () => {
  test('twoFactorRequired answer creates no session and returns the challenge', async () => {
    api.post.mockResolvedValue({ data: { success: true, twoFactorRequired: true, challengeToken: 'chal' } })
    await mount()
    let r
    await act(async () => { r = await auth.login('a@x.in', 'pw', 'staff') })
    expect(r).toEqual({ success: false, twoFactorRequired: true, challengeToken: 'chal' })
    expect(auth.isLoggedIn).toBe(false)
    expect(localStorage.getItem('token')).toBeNull()
  })

  test('verifyTwoFactor posts the challenge + code and completes the session', async () => {
    api.post.mockResolvedValue({ data: { success: true, token: 'jwt', refreshToken: 'rt', _id: 'u1', role: 'admin', name: 'Boss' } })
    await mount()
    let r
    await act(async () => { r = await auth.verifyTwoFactor('chal', { code: '123456' }) })
    expect(api.post).toHaveBeenCalledWith('/auth/2fa/verify', { challengeToken: 'chal', code: '123456' }, { _silent: true })
    expect(r.success).toBe(true)
    expect(r.role).toBe('admin')
    expect(auth.isLoggedIn).toBe(true)
  })

  test('verifyTwoFactor sends a recovery code instead of code when given one', async () => {
    api.post.mockResolvedValue({ data: { token: 'jwt', refreshToken: 'rt', _id: 'u1', role: 'admin' } })
    await mount()
    await act(async () => { await auth.verifyTwoFactor('chal', { recoveryCode: 'ABCDE-FGHJK' }) })
    expect(api.post).toHaveBeenCalledWith('/auth/2fa/verify', { challengeToken: 'chal', recoveryCode: 'ABCDE-FGHJK' }, { _silent: true })
  })

  test('wrong code surfaces code + message and leaves the user signed out', async () => {
    api.post.mockRejectedValue({ response: { data: { code: 'INVALID_CODE', message: 'That code is not correct.' } } })
    await mount()
    let r
    await act(async () => { r = await auth.verifyTwoFactor('chal', { code: '000000' }) })
    expect(r).toMatchObject({ success: false, code: 'INVALID_CODE', message: 'That code is not correct.' })
    expect(auth.isLoggedIn).toBe(false)
  })
})
