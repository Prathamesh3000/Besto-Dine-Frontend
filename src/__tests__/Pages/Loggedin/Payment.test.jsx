/**
 * Loggedin/Payment — customer checkout (online / wallet / pay-at-counter).
 *
 * Two entry shapes:
 *   dine-in           location.state = { orderId, total }   (order exists)
 *   deferred takeaway location.state = { orderPayload, total } (order is
 *                     created only after the money moves)
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const auth = { user: { name: 'Asha', email: 'a@x.in', mobile: '9876543210' }, isLoggedIn: true, isGuest: false }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
// Customer-side operations profile (null → DEFAULT_PUBLIC_OPERATIONS).
let opsProfile = null
vi.mock('@/utils/operations', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getCustomerOperations: () => opsProfile || actual.DEFAULT_PUBLIC_OPERATIONS }
})
vi.mock('@/utils/dineInSession', () => ({ markDineInBillSettled: vi.fn() }))
vi.mock('@/utils/customerOrderIds', () => ({ rememberOrderIds: vi.fn(), getCustomerOrderSession: vi.fn(() => 'sess') }))
const socket = { on: vi.fn(), off: vi.fn() }
vi.mock('@/utils/socket', () => ({ getSocket: () => socket, joinRoom: vi.fn() }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() }
  return {
    default: api,
    razorpayAPI: { createOrder: vi.fn(), verifyPayment: vi.fn(), orphanRefund: vi.fn() },
    walletAPI: { getWallet: vi.fn(), payWithWallet: vi.fn() },
    settingsAPI: { getSettings: vi.fn() },
  }
})

import toast from 'react-hot-toast'
import api, { razorpayAPI, walletAPI, settingsAPI } from '@/utils/api'
import { markDineInBillSettled } from '@/utils/dineInSession'
import { rememberOrderIds } from '@/utils/customerOrderIds'
import Payment from '@/Pages/Loggedin/Payment'

let rzp
function installRazorpay() {
  rzp = { options: null, handlers: {}, open: vi.fn() }
  window.Razorpay = vi.fn(function Razorpay(options) {
    rzp.options = options
    this.on = (evt, fn) => { rzp.handlers[evt] = fn }
    this.open = rzp.open
  })
}
const RZP = { razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A', razorpay_signature: 'sig_A' }

let landed = null
function Probe({ name }) { landed = { name, state: useLocation().state }; return <div>{name}</div> }

function renderPayment(state) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/customer/payment', state }]}>
      <Routes>
        <Route path="/customer/payment" element={<Payment />} />
        <Route path="/customer/orders" element={<Probe name="orders-page" />} />
        <Route path="/customer/bill" element={<Probe name="bill-page" />} />
        <Route path="/customer/order-confirmed" element={<Probe name="order-confirmed" />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}
const payBtn = () => screen.getByRole('button', { name: /pay ₹|send request|choose a payment|processing/i })
const DINE_IN = { orderId: 'ORD-20261003-0042', total: 1249.5 }
const TAKEAWAY_PAYLOAD = { items: [{ menuItem: 'm1', quantity: 2 }], total: 630.25, type: 'takeaway', pickupTime: '18:30', clientIdempotencyKey: 'web-fixed-key' }
const TAKEAWAY = { orderPayload: TAKEAWAY_PAYLOAD, cartItemsForStorage: [{ name: 'Wrap' }], total: 630.25 }

async function choose(user, title) {
  await user.click(screen.getByRole('button', { name: new RegExp(title) }))
}

beforeEach(() => {
  landed = null
  opsProfile = null
  Object.assign(auth, { isLoggedIn: true, isGuest: false })
  installRazorpay()
  walletAPI.getWallet.mockResolvedValue({ data: { balance: 5000 } })
  settingsAPI.getSettings.mockResolvedValue({ data: { general: { cafeName: 'Cafe Uno' } } })
  razorpayAPI.createOrder.mockResolvedValue({ data: { success: true, key: 'rzp_k', razorpayOrder: { id: 'order_A', amount: 124950, currency: 'INR' } } })
  razorpayAPI.verifyPayment.mockResolvedValue({ data: { success: true } })
  razorpayAPI.orphanRefund.mockResolvedValue({ data: { success: true } })
  api.post.mockResolvedValue({ data: { success: true, order: { orderId: 'ORD-TK-9' } } })
  api.patch.mockResolvedValue({ data: { success: true } })
})

describe('Payment — amount display', () => {
  test('hero shows the total exact to the paisa', () => {
    renderPayment(DINE_IN)
    expect(screen.getByText('₹1,249.50')).toBeInTheDocument()
  })

  // Regression (fixed 2026-10): pay button label (and wallet toast) show the amount to the paisa, matching what is charged.
  test('the Pay button label shows the amount to the paisa', async () => {
    const user = renderPayment(DINE_IN)
    await choose(user, 'Pay Online')
    expect(payBtn()).toHaveTextContent('1249.50')
  })

  test('wallet card is disabled with the exact shortfall when balance is insufficient', async () => {
    walletAPI.getWallet.mockResolvedValue({ data: { balance: 1000.2 } })
    renderPayment(DINE_IN)
    expect(await screen.findByText('Only ₹1000.20 available · need ₹249.30 more')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pay from Wallet/ })).toBeDisabled()
  })

  test('guest (not logged in) cannot pick wallet and no wallet fetch happens', () => {
    Object.assign(auth, { isLoggedIn: false, isGuest: true })
    renderPayment(DINE_IN)
    expect(screen.getByRole('button', { name: /Pay from Wallet/ })).toBeDisabled()
    expect(walletAPI.getWallet).not.toHaveBeenCalled()
  })

  test('Pay is disabled until a method is chosen', () => {
    renderPayment(DINE_IN)
    expect(payBtn()).toBeDisabled()
    expect(payBtn()).toHaveTextContent('Choose a payment method')
  })
})

describe('Payment — online (dine-in, order already exists)', () => {
  test('create-order(total, orderId) → Razorpay → verify with the three ids + cafeOrderId → orders page', async () => {
    const user = renderPayment(DINE_IN)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())

    expect(razorpayAPI.createOrder).toHaveBeenCalledWith(1249.5, 'ORD-20261003-0042')
    expect(rzp.options).toMatchObject({ key: 'rzp_k', amount: 124950, order_id: 'order_A', currency: 'INR' })

    await act(() => rzp.options.handler(RZP))
    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith({ ...RZP, cafeOrderId: 'ORD-20261003-0042' })
    expect(markDineInBillSettled).toHaveBeenCalled()
    expect(await screen.findByText('orders-page')).toBeInTheDocument()
    expect(razorpayAPI.orphanRefund).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('payment_draft_v1')).toBeNull()
  })

  test('guest dine-in lands on the bill page and stamps guest_bill_paid_at', async () => {
    Object.assign(auth, { isLoggedIn: false, isGuest: true })
    const user = renderPayment(DINE_IN)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    await act(() => rzp.options.handler(RZP))
    expect(await screen.findByText('bill-page')).toBeInTheDocument()
    expect(localStorage.getItem('guest_bill_paid_at')).toMatch(/^\d+$/)
  })

  test('verification failure on an existing order does NOT orphan-refund (the order backs the charge)', async () => {
    razorpayAPI.verifyPayment.mockRejectedValue(new Error('500'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = renderPayment(DINE_IN)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    await act(() => rzp.options.handler(RZP))
    expect(razorpayAPI.orphanRefund).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/verification failed/), expect.anything())
    expect(payBtn()).toBeEnabled()
  })

  test('payment.failed re-enables the button and shows the gateway reason', async () => {
    const user = renderPayment(DINE_IN)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    act(() => rzp.handlers['payment.failed']({ error: { description: 'Bank declined' } }))
    expect(toast.error).toHaveBeenCalledWith('Payment failed: Bank declined')
    expect(payBtn()).toBeEnabled()
  })

  test('double-click on Pay creates only one gateway order', async () => {
    let resolve
    razorpayAPI.createOrder.mockReturnValue(new Promise((r) => { resolve = r }))
    const user = renderPayment(DINE_IN)
    await choose(user, 'Pay Online')
    const btn = payBtn()
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await act(async () => resolve({ data: { success: true, key: 'k', razorpayOrder: { id: 'o', amount: 1, currency: 'INR' } } }))
    expect(razorpayAPI.createOrder).toHaveBeenCalledTimes(1)
  })

  // Regression (fixed 2026-10): merchant name is read from the top-level GET /settings payload (general.cafeName).
  test('the merchant name from settings reaches the Razorpay checkout', async () => {
    const user = renderPayment(DINE_IN)
    await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    expect(rzp.options.name).toBe('Cafe Uno')
  })
})

describe('Payment — online (deferred takeaway)', () => {
  // Updated 2026-10 (decision 4c): the order create now carries the
  // checkout ids (razorpayPayment) so the server links the payment to the
  // order at creation and orphan-refund refuses it afterwards.
  test('create-order gets a null cafeOrderId; order is created after capture with the idempotency key + checkout ids; verify links it', async () => {
    const user = renderPayment(TAKEAWAY)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    expect(razorpayAPI.createOrder).toHaveBeenCalledWith(630.25, null)

    await act(() => rzp.options.handler(RZP))
    expect(api.post).toHaveBeenCalledWith('/orders',
      { ...TAKEAWAY_PAYLOAD, clientIdempotencyKey: 'web-fixed-key', paymentMethod: 'online', razorpayPayment: RZP },
      { headers: { 'Idempotency-Key': 'web-fixed-key' } })
    expect(rememberOrderIds).toHaveBeenCalledWith('sess', ['ORD-TK-9'])
    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith({ ...RZP, cafeOrderId: 'ORD-TK-9' })
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
    expect(landed.state).toMatchObject({ orderId: 'ORD-TK-9', total: 630.25, isTakeaway: true, selectedTime: '18:30', paymentMethod: 'online' })
    expect(markDineInBillSettled).not.toHaveBeenCalled()
  })

  test('cash takeaway (no checkout) sends no razorpayPayment with the order create', async () => {
    const user = renderPayment(TAKEAWAY)
    await choose(user, 'Pay at Counter')
    await user.click(payBtn())
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/orders', expect.anything(), expect.anything()))
    const payload = api.post.mock.calls.find(([url]) => url === '/orders')[1]
    expect(payload).not.toHaveProperty('razorpayPayment')
  })

  test('order create rejected after capture → orphan-refund with the checkout ids + server reason', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.post.mockRejectedValue({ response: { data: { message: 'Paneer Wrap is out of stock' } } })
    const user = renderPayment(TAKEAWAY)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    await act(() => rzp.options.handler(RZP))

    expect(razorpayAPI.orphanRefund).toHaveBeenCalledWith({ ...RZP, reason: 'Paneer Wrap is out of stock' })
    expect(razorpayAPI.verifyPayment).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/refunded automatically/), expect.anything())
    expect(screen.queryByText('order-confirmed')).not.toBeInTheDocument()
  })

  test('mock gateway (mock:true) skips the Razorpay modal but runs the normal create + verify path', async () => {
    razorpayAPI.createOrder.mockResolvedValue({ data: { success: true, mock: true, key: 'k', razorpayOrder: { id: 'order_mock_1', amount: 63025, currency: 'INR' } } })
    const user = renderPayment(TAKEAWAY)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
    expect(window.Razorpay).not.toHaveBeenCalled()
    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith(expect.objectContaining({
      razorpay_order_id: 'order_mock_1', razorpay_payment_id: expect.stringMatching(/^pay_mock_/), cafeOrderId: 'ORD-TK-9',
    }))
  })

  test('the draft is persisted so a refresh can resume, with a stable idempotency key', () => {
    renderPayment(TAKEAWAY)
    const draft = JSON.parse(sessionStorage.getItem('payment_draft_v1'))
    expect(draft).toMatchObject({ total: 630.25, idempotencyKey: 'web-fixed-key', orderPayload: TAKEAWAY_PAYLOAD })
  })
})

describe('Payment — wallet', () => {
  test('pays exactly the server-side outstanding amount for the order', async () => {
    api.get.mockResolvedValue({ data: { order: { _id: 'mongo42', total: 1249.5, amountPaid: 200.25 } } })
    walletAPI.payWithWallet.mockResolvedValue({ data: { newBalance: 3950.75 } })
    const user = renderPayment(DINE_IN)
    await waitFor(() => expect(screen.getByRole('button', { name: /Pay from Wallet/ })).toBeEnabled())
    await choose(user, 'Pay from Wallet')
    await user.click(payBtn())
    await screen.findByText('orders-page')
    expect(api.get).toHaveBeenCalledWith('/orders/ORD-20261003-0042/detail')
    expect(walletAPI.payWithWallet).toHaveBeenCalledWith(1049.25, 'mongo42')
    expect(api.patch).toHaveBeenCalledWith('/orders/ORD-20261003-0042/payment', { paymentStatus: 'Paid', paymentMethod: 'wallet' }, { _silent: true })
  })

  test('wallet rejection surfaces the server message and stays on the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.get.mockResolvedValue({ data: { order: { _id: 'mongo42', total: 1249.5, amountPaid: 0 } } })
    walletAPI.payWithWallet.mockRejectedValue({ response: { data: { message: 'Wallet frozen' } } })
    const user = renderPayment(DINE_IN)
    await waitFor(() => expect(screen.getByRole('button', { name: /Pay from Wallet/ })).toBeEnabled())
    await choose(user, 'Pay from Wallet')
    await user.click(payBtn())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Wallet frozen', expect.anything()))
    expect(screen.queryByText('orders-page')).not.toBeInTheDocument()
    expect(payBtn()).toBeEnabled()
  })
})

describe('Payment — pay at counter', () => {
  test('dine-in: requests counter payment, waits, and completes when the 5s poll sees Paid', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPayment(DINE_IN)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await choose(user, 'Pay at Counter')
    expect(payBtn()).toHaveTextContent('Send Request to Counter')
    await user.click(payBtn())
    expect(api.post).toHaveBeenCalledWith('/orders/ORD-20261003-0042/request-counter-payment')
    expect(await screen.findByText('Waiting for staff…')).toBeInTheDocument()
    expect(screen.getByText('₹1249.50')).toBeInTheDocument()

    api.get.mockResolvedValue({ data: { order: { paymentStatus: 'Pending' } } })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(api.get).toHaveBeenCalledWith('/orders/ORD-20261003-0042/detail', { _isBackground: true })
    expect(screen.getByText('Waiting for staff…')).toBeInTheDocument()

    api.get.mockResolvedValue({ data: { order: { paymentStatus: 'Paid', paymentMethod: 'cash' } } })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(await screen.findByText('orders-page')).toBeInTheDocument()
    expect(markDineInBillSettled).toHaveBeenCalled()
  })

  test('"Change payment method" closes the waiting overlay without settling anything', async () => {
    const user = renderPayment(DINE_IN)
    await choose(user, 'Pay at Counter')
    await user.click(payBtn())
    await user.click(await screen.findByRole('button', { name: 'Change payment method' }))
    expect(screen.queryByText('Waiting for staff…')).not.toBeInTheDocument()
    expect(markDineInBillSettled).not.toHaveBeenCalled()
  })

  test('takeaway cash creates the order with paymentMethod "cash" and confirms', async () => {
    const user = renderPayment(TAKEAWAY)
    await choose(user, 'Pay at Counter')
    await user.click(payBtn())
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/orders', expect.objectContaining({ paymentMethod: 'cash' }), expect.anything())
  })
})


describe('Payment — pay-first dine-in (operations profile)', () => {
  const DINE_PAYLOAD = { items: [{ menuItem: 'm1', quantity: 2 }], total: 480.5, type: 'dine-in', tableId: 'tbl1', clientIdempotencyKey: 'web-dine-key' }
  const PAY_FIRST = { payFirstDineIn: true, orderPayload: DINE_PAYLOAD, total: 480.5, cartItemsForStorage: [{ name: 'Thali', quantity: 2 }] }
  const ops = ({ online = true, wallet = true, counterCash = true, customerTracking = true } = {}) => ({
    payment: { dineIn: 'payFirst', methods: { online, wallet, counterCash } },
    orderFlow: { customerSelfOrder: true, customerTracking },
    customerApp: { callWaiter: false, tips: false },
  })
  const orderCreate = () => api.post.mock.calls.find(([url]) => url === '/orders')

  beforeEach(() => {
    api.post.mockResolvedValue({ data: { success: true, order: { orderId: 'ORD-DI-7' } } })
  })

  test.each([
    [{ online: true, wallet: false, counterCash: false }, ['Pay Online'], ['Pay from Wallet', 'Pay at Counter']],
    [{ online: false, wallet: true, counterCash: true }, ['Pay from Wallet', 'Pay at Counter'], ['Pay Online']],
    [{ online: true, wallet: true, counterCash: false }, ['Pay Online', 'Pay from Wallet'], ['Pay at Counter']],
  ])('methods %o → only the allowed cards are offered', (methods, shown, hidden) => {
    opsProfile = ops(methods)
    renderPayment(PAY_FIRST)
    shown.forEach((t) => expect(screen.getByRole('button', { name: new RegExp(t) })).toBeInTheDocument())
    hidden.forEach((t) => expect(screen.queryByRole('button', { name: new RegExp(t) })).not.toBeInTheDocument())
  })

  test('without payFirstDineIn the method filter does not apply (all three cards)', () => {
    opsProfile = ops({ online: true, wallet: false, counterCash: false })
    renderPayment(DINE_IN)
    ;['Pay Online', 'Pay from Wallet', 'Pay at Counter'].forEach((t) =>
      expect(screen.getByRole('button', { name: new RegExp(t) })).toBeInTheDocument())
  })

  test('cash: creates the order with paymentIntent counterCash → pay-at-counter confirmation, no bill settle', async () => {
    opsProfile = ops()
    const user = renderPayment(PAY_FIRST)
    await choose(user, 'Pay at Counter')
    await user.click(payBtn())
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
    const [, body, opts] = orderCreate()
    expect(body).toMatchObject({ ...DINE_PAYLOAD, paymentMethod: 'cash', paymentIntent: 'counterCash' })
    expect(opts).toEqual({ headers: { 'Idempotency-Key': 'web-dine-key' } })
    expect(api.post).not.toHaveBeenCalledWith(expect.stringMatching(/request-counter-payment/))
    expect(landed.state).toMatchObject({
      orderId: 'ORD-DI-7', total: 480.5, isTakeaway: false, payFirstDineIn: true, payAtCounter: true, tracking: true, paymentMethod: 'cash',
    })
    expect(markDineInBillSettled).not.toHaveBeenCalled()
  })

  test('wallet: paymentIntent wallet, pays the server order, confirmation without counter note; tracking follows the profile', async () => {
    opsProfile = ops({ customerTracking: false })
    api.get.mockResolvedValue({ data: { order: { _id: 'mongo7', total: 480.5, amountPaid: 0 } } })
    walletAPI.payWithWallet.mockResolvedValue({ data: { newBalance: 4519.5 } })
    const user = renderPayment(PAY_FIRST)
    await waitFor(() => expect(screen.getByRole('button', { name: /Pay from Wallet/ })).toBeEnabled())
    await choose(user, 'Pay from Wallet')
    await user.click(payBtn())
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
    expect(orderCreate()[1]).toMatchObject({ paymentMethod: 'wallet', paymentIntent: 'wallet' })
    expect(walletAPI.payWithWallet).toHaveBeenCalledWith(480.5, 'mongo7')
    expect(landed.state).toMatchObject({ payFirstDineIn: true, payAtCounter: false, tracking: false, paymentMethod: 'wallet' })
    expect(markDineInBillSettled).not.toHaveBeenCalled()
  })

  test('online: order created after capture with checkout ids and NO paymentIntent', async () => {
    opsProfile = ops()
    const user = renderPayment(PAY_FIRST)
    await choose(user, 'Pay Online')
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    expect(razorpayAPI.createOrder).toHaveBeenCalledWith(480.5, null)
    await act(() => rzp.options.handler(RZP))
    const body = orderCreate()[1]
    expect(body).toMatchObject({ paymentMethod: 'online', razorpayPayment: RZP })
    expect(body).not.toHaveProperty('paymentIntent')
    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith({ ...RZP, cafeOrderId: 'ORD-DI-7' })
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
    expect(landed.state).toMatchObject({ payFirstDineIn: true, payAtCounter: false, tracking: true, paymentMethod: 'online' })
    expect(markDineInBillSettled).not.toHaveBeenCalled()
  })

  test('the draft records payFirstDineIn so a refresh resumes the pay-first flow', () => {
    opsProfile = ops()
    renderPayment(PAY_FIRST)
    expect(JSON.parse(sessionStorage.getItem('payment_draft_v1'))).toMatchObject({ payFirstDineIn: true, idempotencyKey: 'web-dine-key' })
  })

  test('takeaway (not pay-first) cash create sends no paymentIntent', async () => {
    opsProfile = ops()
    const user = renderPayment(TAKEAWAY)
    await choose(user, 'Pay at Counter')
    await user.click(payBtn())
    await screen.findByText('order-confirmed')
    expect(orderCreate()[1]).not.toHaveProperty('paymentIntent')
    expect(landed.state).not.toHaveProperty('payFirstDineIn')
  })
})
