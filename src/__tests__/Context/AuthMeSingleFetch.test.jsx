/**
 * AuthProvider + HealthProvider both read /auth/me on mount; together they
 * must send ONE request (plain mount and StrictMode's doubled effects).
 */
import { test, expect, vi } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/utils/api', () => ({
  default: api,
  CUSTOMER_SESSION_EXPIRED_EVENT: 'a', SUBSCRIPTION_READ_ONLY_EVENT: 'b', SUBSCRIPTION_BLOCKED_EVENT: 'c', TRIAL_EXPIRED_EVENT: 'c',
}))
vi.mock('@/utils/socket', () => ({ disconnectSocket: vi.fn(), reconnectWithAuth: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() }, default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/Components/Common/SessionChangedOverlay', () => ({ default: () => null }))

import { AuthProvider } from '@/Context/AuthContext'
import { HealthProvider } from '@/Context/Loggedin/HealthContext'

for (const strict of [false, true]) {
  test(`one /auth/me on mount (StrictMode=${strict})`, async () => {
    api.get.mockReset().mockResolvedValue({ data: { _id: 'c1', allergy: '' } })
    window.history.replaceState({}, '', '/customer/home')
    localStorage.setItem('token', 't')
    localStorage.setItem('user', JSON.stringify({ _id: 'c1', role: 'customer' }))
    const tree = <AuthProvider><HealthProvider><div /></HealthProvider></AuthProvider>
    render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree)
    await new Promise(r => setTimeout(r, 50))
    expect(api.get.mock.calls.filter(c => c[0] === '/auth/me')).toHaveLength(1)
  })
}
