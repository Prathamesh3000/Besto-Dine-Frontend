/**
 * Loggedin/OrderTracking — §12.3 customerTracking:false. The server
 * collapses the status and flags `trackingDisabled`; the tracking route
 * must hand over to the confirmation page (token + collapsed status)
 * instead of drawing kitchen stages. A normal order still renders here.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import React, { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))
vi.mock('@/utils/socket', () => ({
  getSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
  joinRoom: vi.fn(),
}))
vi.mock('@/hooks/useSocketEvent', () => ({
  default: () => {},
  useSocketConnected: () => true,
  useSocketReconnect: () => {},
}))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn() }
  return { default: api, settingsAPI: { getSettings: vi.fn(() => Promise.resolve({ data: {} })) } }
})

import api from '@/utils/api'
import OrderTracking from '@/Pages/Loggedin/OrderTracking'

let landed = null
function Probe({ name }) {
  const { state } = useLocation()
  useEffect(() => { landed = { name, state } }, [name, state])
  return <div>{name}</div>
}

function renderTracking(orderId = 'ORD-1') {
  render(
    <MemoryRouter initialEntries={[`/customer/order-tracking/${orderId}`]}>
      <Routes>
        <Route path="/customer/order-tracking/:orderId" element={<OrderTracking />} />
        <Route path="/customer/order-confirmed" element={<Probe name="order-confirmed" />} />
        <Route path="/customer/orders" element={<Probe name="orders" />} />
      </Routes>
    </MemoryRouter>,
  )
}

const ORDER = {
  orderId: 'ORD-1', type: 'dine-in', total: 180, paymentMethod: 'cash', createdAt: '2026-10-19T08:00:00Z',
  items: [{ name: 'Dosa', price: 90, quantity: 2, prepStation: 'kitchen' }],
}

beforeEach(() => {
  landed = null
})

describe('OrderTracking — tracking disabled (§12.3)', () => {
  test('trackingDisabled:true → redirected to OrderConfirmed with the token and collapsed status', async () => {
    api.get.mockResolvedValue({
      data: { success: true, order: { ...ORDER, status: 'confirmed', trackingDisabled: true, tokenNumber: 'T-042' } },
    })
    renderTracking()
    await screen.findByText('order-confirmed')
    await waitFor(() => expect(landed?.state).toMatchObject({
      orderId: 'ORD-1', tokenNumber: 'T-042', tracking: false, trackingDisabled: true, isTakeaway: false, total: 180,
    }))
    expect(screen.queryByText(/Order ID:/)).not.toBeInTheDocument()
  })

  test('normal order (tracking on) renders the tracking page', async () => {
    api.get.mockResolvedValue({ data: { success: true, order: { ...ORDER, status: 'preparing' } } })
    renderTracking()
    expect(await screen.findByText(/Order ID: ORD-1/)).toBeInTheDocument()
    expect(landed).toBeNull()
  })
})
