/**
 * Loggedin/OrderConfirmed — pay-first dine-in variants (operations
 * profile): pay-at-counter note, collect-at-counter (no tracking) note,
 * and the Track Order button only when there is live status to follow.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/hooks/useBlockBackNav', () => ({ default: () => {} }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn() }
  return { default: api, settingsAPI: { getSettings: vi.fn() } }
})

import api, { settingsAPI } from '@/utils/api'
import OrderConfirmed from '@/Pages/Loggedin/OrderConfirmed'

function renderPage(state) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/customer/order-confirmed', state }]}>
      <Routes>
        <Route path="/customer/order-confirmed" element={<OrderConfirmed />} />
      </Routes>
    </MemoryRouter>,
  )
}
const BASE = { orderId: 'ORD-DI-7', items: [{ name: 'Thali', price: 240.25, quantity: 2 }], total: 480.5, isTakeaway: false }
const track = () => screen.queryByRole('button', { name: 'Track Order' })

beforeEach(() => {
  settingsAPI.getSettings.mockResolvedValue({ data: {} })
  api.get.mockRejectedValue(new Error('offline')) // keep the state fallback
})

describe('OrderConfirmed — pay-first dine-in', () => {
  test('payAtCounter: "Please pay at the counter" + note with the order id, no Track Order', () => {
    renderPage({ ...BASE, payFirstDineIn: true, payAtCounter: true, tracking: true, paymentMethod: 'cash' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Please pay at the counter')
    expect(screen.getByTestId('pay-at-counter-note')).toHaveTextContent('#ORD-DI-7')
    expect(screen.queryByTestId('collect-note')).not.toBeInTheDocument()
    expect(track()).not.toBeInTheDocument()
  })

  test('payAtCounter wins over tracking:false (counter note, not collect note)', () => {
    renderPage({ ...BASE, payFirstDineIn: true, payAtCounter: true, tracking: false })
    expect(screen.getByTestId('pay-at-counter-note')).toBeInTheDocument()
    expect(screen.queryByTestId('collect-note')).not.toBeInTheDocument()
  })

  test('paid, tracking:false: "Order Confirmed!" + collect note, no Track Order', () => {
    renderPage({ ...BASE, payFirstDineIn: true, payAtCounter: false, tracking: false, paymentMethod: 'online' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order Confirmed!')
    expect(screen.getByTestId('collect-note')).toHaveTextContent('#ORD-DI-7')
    expect(screen.queryByTestId('pay-at-counter-note')).not.toBeInTheDocument()
    expect(track()).not.toBeInTheDocument()
  })

  test('paid, tracking:true: normal confirmation with Track Order', () => {
    renderPage({ ...BASE, payFirstDineIn: true, payAtCounter: false, tracking: true })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order Confirmed!')
    expect(screen.queryByTestId('collect-note')).not.toBeInTheDocument()
    expect(track()).toBeInTheDocument()
  })

  test('legacy state (no pay-first flags): unchanged — Track Order shown, no notes', () => {
    renderPage({ ...BASE, isTakeaway: true })
    expect(screen.getByText(/takeaway order has been/)).toBeInTheDocument()
    expect(screen.queryByTestId('pay-at-counter-note')).not.toBeInTheDocument()
    expect(screen.queryByTestId('collect-note')).not.toBeInTheDocument()
    expect(track()).toBeInTheDocument()
  })

  test('tracking:false without payFirstDineIn does not show the collect note', () => {
    renderPage({ ...BASE, tracking: false })
    expect(screen.queryByTestId('collect-note')).not.toBeInTheDocument()
    expect(track()).not.toBeInTheDocument()
  })
})
