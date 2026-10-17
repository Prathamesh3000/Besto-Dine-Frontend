import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, act } from '@testing-library/react'

const auth = vi.hoisted(() => ({ value: {} }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth.value }))
const sock = vi.hoisted(() => {
  const handlers = {}
  return {
    handlers,
    socket: {
      on: (e, h) => { handlers[e] = h },
      off: (e) => { delete handlers[e] },
    },
  }
})
const getSocket = vi.hoisted(() => vi.fn())
vi.mock('@/utils/socket', () => ({
  getSocket: () => { getSocket(); return sock.socket },
  subscribeSocketState: () => () => {},
  isSocketConnected: () => true,
  onSocketReconnect: () => () => {},
}))

import OperationsSync from '@/Components/OperationsSync'

beforeEach(() => {
  getSocket.mockReset()
  for (const k of Object.keys(sock.handlers)) delete sock.handlers[k]
})

describe('OperationsSync', () => {
  test('tenant staff: refetches /auth/me when its restaurant\'s profile changes', () => {
    const refreshUser = vi.fn()
    auth.value = { user: { role: 'admin', tenant: { _id: 'r1' } }, refreshUser }
    render(<OperationsSync />)
    act(() => sock.handlers['tenant:operations-updated']({ restaurant: 'r1' }))
    expect(refreshUser).toHaveBeenCalledTimes(1)
    act(() => sock.handlers['tenant:operations-updated']({ restaurant: 'other' }))
    expect(refreshUser).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['guest', { user: null }],
    ['customer', { user: { role: 'customer', tenant: { _id: 'r1' } } }],
    ['super admin', { user: { role: 'superadmin' } }],
  ])('%s: no socket is opened', (_l, value) => {
    auth.value = { ...value, refreshUser: vi.fn() }
    render(<OperationsSync />)
    expect(getSocket).not.toHaveBeenCalled()
  })
})
