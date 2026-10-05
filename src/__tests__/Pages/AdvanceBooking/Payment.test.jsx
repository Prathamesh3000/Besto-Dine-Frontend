/**
 * AdvanceBooking/Payment — charges the amount BookingReview decided
 * (advance or full) through Razorpay, then creates the booking with the
 * real booking total; a failed booking triggers the orphan refund.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const clearCart = vi.fn()
vi.mock('@/Context/CartContext', () => ({ useCart: () => ({ clearCart }) }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Asha', email: 'a@x.in', mobile: '9999999999' } }) }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => ({
  advanceBookingAPI: { createBooking: vi.fn() },
  razorpayAPI: { createOrder: vi.fn(), verifyPayment: vi.fn(), orphanRefund: vi.fn() },
}))

import toast from 'react-hot-toast'
import { advanceBookingAPI, razorpayAPI } from '@/utils/api'
import Payment from '@/Pages/AdvanceBooking/Payment'

// ── Razorpay checkout mock ─────────────────────────────────────────────────
let rzp
function installRazorpay() {
  rzp = { options: null, handlers: {}, open: vi.fn() }
  window.Razorpay = vi.fn(function Razorpay(options) {
    rzp.options = options
    this.on = (evt, fn) => { rzp.handlers[evt] = fn }
    this.open = rzp.open
  })
}
const RZP_RESPONSE = { razorpay_order_id: 'order_RZ1', razorpay_payment_id: 'pay_RZ1', razorpay_signature: 'sig_1' }

let successState = null
function SuccessProbe() { successState = useLocation().state; return <div>booking-success</div> }

const reviewState = (over = {}) => ({
  bookingType: 'hall', selectedDate: '2026-12-01', guests: 10,
  total: 7525, bookingTotal: 15049, paymentType: 'advance',
  couponCode: '', walletPointsUsed: 0, ...over,
})

function renderPayment(state) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/customer/advance-payment', state }]}>
      <Routes>
        <Route path="/customer/advance-payment" element={<Payment />} />
        <Route path="/customer/booking-success" element={<SuccessProbe />} />
        <Route path="/customer/booking-type" element={<div>booking-type-start</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}
const payButtons = () => screen.getAllByRole('button', { name: /^(pay now|processing)/i })

async function startPayment(user, method = 'UPI') {
  await user.click(screen.getByRole('button', { name: new RegExp(`^${method}`) }))
  await user.click(payButtons()[0])
  await waitFor(() => expect(rzp.open).toHaveBeenCalled())
}

beforeEach(() => {
  successState = null
  installRazorpay()
  razorpayAPI.createOrder.mockResolvedValue({ data: { success: true, key: 'rzp_test', razorpayOrder: { id: 'order_RZ1', amount: 752500, currency: 'INR' } } })
  razorpayAPI.verifyPayment.mockResolvedValue({ data: { success: true } })
  razorpayAPI.orphanRefund.mockResolvedValue({ data: { success: true } })
  advanceBookingAPI.createBooking.mockResolvedValue({ data: { success: true, booking: { bookingId: 'BK-77', _id: 'mongo1' } } })
})

describe('AdvanceBooking Payment — amounts', () => {
  test.each([
    ['advance', reviewState(), '₹7,525', 'Remaining ₹7,524 due on event day'],
    ['full', reviewState({ paymentType: 'full', total: 15049 }), '₹15,049', null],
  ])('%s: shows the amount due now and the remainder', (_t, state, due, remaining) => {
    renderPayment(state)
    expect(screen.getByText(due)).toBeInTheDocument()
    if (remaining) expect(screen.getByText(remaining)).toBeInTheDocument()
    else expect(screen.queryByText(/Remaining/)).not.toBeInTheDocument()
  })

  test('legacy caller without paymentType: advance = ceil(total × 50%)', () => {
    renderPayment({ bookingType: 'hall', selectedDate: '2026-12-01', total: 15049 })
    expect(screen.getByText('₹7,525')).toBeInTheDocument()
  })

  test('Pay Now is disabled until a method is chosen', () => {
    renderPayment(reviewState())
    payButtons().forEach((b) => expect(b).toBeDisabled())
  })

  test('missing booking data redirects to the start', async () => {
    renderPayment({})
    expect(await screen.findByText('booking-type-start')).toBeInTheDocument()
  })

  // Regression (fixed 2026-10): a ₹0 bookingTotal is valid (?? not ||) and is confirmed without opening Razorpay.
  test('a booking fully covered by points/coupon (total ₹0) can be confirmed', async () => {
    renderPayment(reviewState({ total: 0, bookingTotal: 0 }))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText('booking-type-start')).not.toBeInTheDocument()

    const user = userEvent.setup()
    const confirm = screen.getAllByRole('button', { name: 'Confirm Booking' })[0]
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    await waitFor(() => expect(advanceBookingAPI.createBooking).toHaveBeenCalledWith(expect.objectContaining({ total: 0 })))
    expect(razorpayAPI.createOrder).not.toHaveBeenCalled()
  })
})

describe('AdvanceBooking Payment — Razorpay flow', () => {
  test('happy path: create-order for the amount due → verify with the three ids → booking created with the full total', async () => {
    const user = renderPayment(reviewState())
    await startPayment(user, 'Card')

    expect(razorpayAPI.createOrder).toHaveBeenCalledTimes(1)
    expect(razorpayAPI.createOrder).toHaveBeenCalledWith(7525)
    expect(rzp.options).toMatchObject({
      key: 'rzp_test', amount: 752500, currency: 'INR', order_id: 'order_RZ1',
      prefill: { name: 'Asha', email: 'a@x.in', contact: '9999999999' },
    })

    await act(() => rzp.options.handler(RZP_RESPONSE))

    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith(RZP_RESPONSE)
    expect(advanceBookingAPI.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: 'card', total: 15049, paymentType: 'advance',
      razorpayPaymentId: 'pay_RZ1', razorpay_order_id: 'order_RZ1', razorpay_signature: 'sig_1',
    }))
    expect(clearCart).toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'View Booking Summary' }))
    expect(await screen.findByText('booking-success')).toBeInTheDocument()
    expect(successState).toMatchObject({ orderId: 'BK-77', paymentMethod: 'card' })
    expect(razorpayAPI.orphanRefund).not.toHaveBeenCalled()
  })

  test('booking creation fails after capture → server message toasted and orphan refund requested', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    advanceBookingAPI.createBooking.mockRejectedValue({ response: { data: { message: 'Hall already booked' } } })
    const user = renderPayment(reviewState())
    await startPayment(user)
    await act(() => rzp.options.handler(RZP_RESPONSE))

    expect(toast.error).toHaveBeenCalledWith('Hall already booked')
    expect(razorpayAPI.orphanRefund).toHaveBeenCalledWith({
      razorpay_payment_id: 'pay_RZ1', razorpay_order_id: 'order_RZ1', razorpay_signature: 'sig_1',
      reason: 'Hall already booked',
    })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/refunded automatically/), expect.anything()))
    payButtons().forEach((b) => expect(b).toBeEnabled()) // can retry
  })

  test('PAYMENT_ALREADY_USED does not trigger an orphan refund', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    advanceBookingAPI.createBooking.mockRejectedValue({ response: { data: { code: 'PAYMENT_ALREADY_USED', message: 'dup' } } })
    const user = renderPayment(reviewState())
    await startPayment(user)
    await act(() => rzp.options.handler(RZP_RESPONSE))
    expect(razorpayAPI.orphanRefund).not.toHaveBeenCalled()
  })

  test('verification failure: no booking is created and the user is told to contact support', async () => {
    razorpayAPI.verifyPayment.mockResolvedValue({ data: { success: false } })
    const user = renderPayment(reviewState())
    await startPayment(user)
    await act(() => rzp.options.handler(RZP_RESPONSE))
    expect(advanceBookingAPI.createBooking).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/verification failed/))
  })

  test('gateway "payment.failed" and modal dismiss both re-enable Pay Now', async () => {
    const user = renderPayment(reviewState())
    await startPayment(user)
    expect(payButtons()[0]).toBeDisabled()
    act(() => rzp.handlers['payment.failed']({ error: { description: 'Card declined' } }))
    expect(toast.error).toHaveBeenCalledWith('Payment failed: Card declined')
    expect(payButtons()[0]).toBeEnabled()

    await user.click(payButtons()[0])
    await waitFor(() => expect(rzp.open).toHaveBeenCalledTimes(2))
    act(() => rzp.options.modal.ondismiss())
    expect(payButtons()[0]).toBeEnabled()
    expect(advanceBookingAPI.createBooking).not.toHaveBeenCalled()
  })

  test('create-order returning success:false does not open the checkout', async () => {
    razorpayAPI.createOrder.mockResolvedValue({ data: { success: false } })
    const user = renderPayment(reviewState())
    await user.click(screen.getByRole('button', { name: /^UPI/ }))
    await user.click(payButtons()[0])
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/initiate payment/)))
    expect(window.Razorpay).not.toHaveBeenCalled()
  })

  test('double-clicking Pay Now creates only one gateway order', async () => {
    let resolve
    razorpayAPI.createOrder.mockReturnValue(new Promise((r) => { resolve = r }))
    const user = renderPayment(reviewState())
    await user.click(screen.getByRole('button', { name: /^UPI/ }))
    const [mobile, desktop] = payButtons()
    fireEvent.click(mobile)
    fireEvent.click(mobile)
    fireEvent.click(desktop)
    resolve({ data: { success: true, key: 'k', razorpayOrder: { id: 'o', amount: 1, currency: 'INR' } } })
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    expect(razorpayAPI.createOrder).toHaveBeenCalledTimes(1)
  })
})
