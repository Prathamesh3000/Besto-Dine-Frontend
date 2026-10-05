/**
 * Kiosk/PayOption — pay first (Razorpay, no cafe order yet), then create
 * the order with the amount actually charged, then verify. Any failure
 * after capture must land on the "paid-recovery" screen, never on a
 * retry that could charge twice.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { computeBill, toTaxConfig } from '@/utils/billing'
import { KIOSK_KEYS } from '@/Pages/Kiosk/kioskState'

const TAXES = { gst: { enabled: true, value: 5 }, serviceCharge: { enabled: true, value: 10 }, additionalCharges: [] }
vi.mock('@/hooks/queries/useMenuBootstrap', () => ({ useMenuBootstrap: () => ({ data: { settings: { taxes: TAXES } } }) }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const api = { post: vi.fn(), get: vi.fn() }
  return {
    default: api,
    razorpayAPI: { createOrder: vi.fn(), verifyPayment: vi.fn() },
    settingsAPI: { getSettings: vi.fn() },
    publicAPI: {},
  }
})

import api, { razorpayAPI, settingsAPI } from '@/utils/api'
import PayOption from '@/Pages/Kiosk/PayOption'

let rzp
function installRazorpay() {
  rzp = { options: null, handlers: {}, open: vi.fn() }
  window.Razorpay = vi.fn(function Razorpay(options) {
    rzp.options = options
    this.on = (evt, fn) => { rzp.handlers[evt] = fn }
    this.open = rzp.open
  })
}
const RZP = { razorpay_order_id: 'order_K', razorpay_payment_id: 'pay_K', razorpay_signature: 'sig_K' }
const CART = [
  { menuItemId: 'b1', name: 'Veg Burger', unitPrice: 149.5, qty: 2, size: 'Large', addons: [{ name: 'Cheese', qty: 2, price: 0 }], isVeg: true, category: 'Burgers' },
  { menuItemId: 'c1', name: 'Cold Coffee', unitPrice: 99.99, qty: 1, size: 'Regular', addons: [], isVeg: true },
]
const SUBTOTAL = 398.99

function renderPay({ orderType = 'Eat Here', state } = {}) {
  localStorage.setItem(KIOSK_KEYS.CART, JSON.stringify(CART))
  localStorage.setItem(KIOSK_KEYS.ORDER_TYPE, orderType)
  render(
    <MemoryRouter initialEntries={[{ pathname: '/kiosk/pay', state }]}>
      <Routes>
        <Route path="/kiosk/pay" element={<PayOption />} />
        <Route path="/kiosk/payment-success" element={<div>payment-success</div>} />
        <Route path="/kiosk" element={<div>kiosk-landing</div>} />
        <Route path="/kiosk/cart" element={<div>kiosk-cart</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  installRazorpay()
  settingsAPI.getSettings.mockResolvedValue({ data: {} })
  razorpayAPI.createOrder.mockResolvedValue({ data: { success: true, key: 'k', razorpayOrder: { id: 'order_K', amount: 1, currency: 'INR' } } })
  razorpayAPI.verifyPayment.mockResolvedValue({ data: { success: true } })
  api.post.mockResolvedValue({ data: { success: true, order: { orderId: 'K-001', _id: 'mk1', total: 0, type: 'dine-in' }, trackingToken: 'trk' } })
})

describe('Kiosk PayOption — amount', () => {
  test.each([
    ['Eat Here', 'dine-in'],
    ['Take Away', 'takeaway'],
  ])('no router state (refresh): "%s" charges computeBill(%s) and creates the order with that total', async (kioskType, backendType) => {
    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: toTaxConfig(TAXES), orderType: backendType })
    renderPay({ orderType: kioskType })
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    expect(screen.getByText(expected.total.toFixed(2))).toBeInTheDocument()
    expect(razorpayAPI.createOrder).toHaveBeenCalledWith(expected.total, null)

    await act(() => rzp.options.handler(RZP))
    const [url, payload] = api.post.mock.calls[0]
    expect(url).toBe('/orders')
    expect(payload).toMatchObject({ type: backendType, source: 'kiosk', total: expected.total, paymentMethod: 'online' })
    expect(payload.items[0]).toMatchObject({ menuItem: 'b1', price: 149.5, quantity: 2, instructions: 'Size: Large; Extras: 2× Cheese' })
    expect(payload.clientIdempotencyKey).toBeTruthy()
    // Decision 4c: the checkout ids travel with the create so the server
    // links the payment to the order the moment it is written.
    expect(payload.razorpayPayment).toEqual(RZP)
    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith({ ...RZP, cafeOrderId: 'K-001' })
    expect(await screen.findByText('payment-success')).toBeInTheDocument()
    expect(localStorage.getItem(KIOSK_KEYS.CART)).toBeNull()
    expect(localStorage.getItem(KIOSK_KEYS.IDEMPOTENCY_KEY)).toBeNull()
    expect(localStorage.getItem(KIOSK_KEYS.TRACKING_TOKEN)).toBeTruthy()
  })

  test('router state from the cart wins (the amount the customer was quoted)', async () => {
    renderPay({ state: { totalPayment: 460.84, subtotal: SUBTOTAL, gst: 19.95, serviceCharge: 39.9 } })
    await waitFor(() => expect(razorpayAPI.createOrder).toHaveBeenCalledWith(460.84, null))
  })
})

describe('Kiosk PayOption — failures', () => {
  test('order create fails AFTER capture → paid-recovery with the payment id, no retry button', async () => {
    api.post.mockRejectedValue({ response: { data: { message: 'Item sold out' } } })
    renderPay()
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    await act(() => rzp.options.handler(RZP))
    expect(screen.getByText('Payment received')).toBeInTheDocument()
    expect(screen.getByText('pay_K')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry Payment' })).not.toBeInTheDocument()
    expect(razorpayAPI.verifyPayment).not.toHaveBeenCalled()
    // idempotency key kept so a later reconcile can't create a twin
    expect(localStorage.getItem(KIOSK_KEYS.IDEMPOTENCY_KEY)).toBeTruthy()
  })

  test('verify fails after the order exists → recovery screen shows both ids', async () => {
    razorpayAPI.verifyPayment.mockResolvedValue({ data: { success: false } })
    renderPay()
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    await act(() => rzp.options.handler(RZP))
    expect(screen.getByText('pay_K')).toBeInTheDocument()
    expect(screen.getByText('K-001')).toBeInTheDocument()
  })

  test('dismissing the checkout offers a retry that reuses the same idempotency key', async () => {
    renderPay()
    await waitFor(() => expect(rzp.open).toHaveBeenCalledTimes(1))
    act(() => rzp.options.modal.ondismiss())
    expect(screen.getByText('Payment cancelled. Tap below to try again.')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Retry Payment' }))
    await waitFor(() => expect(rzp.open).toHaveBeenCalledTimes(2))
    expect(razorpayAPI.createOrder).toHaveBeenCalledTimes(2)
    expect(api.post).not.toHaveBeenCalled()
  })

  test('gateway payment.failed shows the reason and allows retry', async () => {
    renderPay()
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    act(() => rzp.handlers['payment.failed']({ error: { description: 'UPI timeout' } }))
    expect(screen.getByText('UPI timeout')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry Payment' })).toBeInTheDocument()
  })

  test('the payment flow starts exactly once on mount (no double gateway order)', async () => {
    renderPay()
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    expect(razorpayAPI.createOrder).toHaveBeenCalledTimes(1)
  })
})

describe('Kiosk PayOption — idle timeout', () => {
  test('90 s idle (checkout not open) abandons to landing and clears the cart', async () => {
    vi.useFakeTimers()
    razorpayAPI.createOrder.mockResolvedValue({ data: { success: false, message: 'gateway down' } })
    renderPay()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText('gateway down')).toBeInTheDocument()
    for (let i = 0; i < 91; i++) await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('kiosk-landing')).toBeInTheDocument()
    expect(localStorage.getItem(KIOSK_KEYS.CART)).toBeNull()
  })

  test('timer is paused while the Razorpay checkout is open', async () => {
    vi.useFakeTimers()
    renderPay()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(rzp.open).toHaveBeenCalled()
    expect(screen.getByText('Waiting for payment…')).toBeInTheDocument()
    for (let i = 0; i < 120; i++) await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByText('kiosk-landing')).not.toBeInTheDocument()
  })
})
