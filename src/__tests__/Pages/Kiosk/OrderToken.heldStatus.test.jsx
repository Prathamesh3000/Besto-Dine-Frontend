/**
 * Kiosk/OrderToken — a pay-first order held for counter cash
 * ('awaiting-payment') tells the customer to pay at the counter instead
 * of the generic "Order received" card.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api }
})
const last = { current: null }
vi.mock('@/Pages/Kiosk/kioskState', () => ({
  readLastOrder: () => last.current,
  clearLastOrder: vi.fn(),
  clearKioskSession: vi.fn(),
  readTrackingToken: () => null,
  clearTrackingToken: vi.fn(),
}))

import OrderToken from '@/Pages/Kiosk/OrderToken'

beforeEach(() => {
  // jsdom has no canvas — give the confetti effect a no-op 2D context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => () => {} }))
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0)
})

describe('OrderToken — status card', () => {
  test('awaiting-payment → "Awaiting payment" + pay at the counter', () => {
    last.current = { orderId: 'KSK-261008-AB12CD', status: 'awaiting-payment', total: 200, items: [] }
    render(<MemoryRouter><OrderToken /></MemoryRouter>)
    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.getByText('Please pay at the counter')).toBeInTheDocument()
    expect(screen.queryByText('Order received')).not.toBeInTheDocument()
  })

  test('new → "Order received" (unchanged)', () => {
    last.current = { orderId: 'KSK-261008-AB12CD', status: 'new', total: 200, items: [] }
    render(<MemoryRouter><OrderToken /></MemoryRouter>)
    expect(screen.getByText('Order received')).toBeInTheDocument()
  })
})
