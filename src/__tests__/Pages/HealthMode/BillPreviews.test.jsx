/**
 * HealthMode/BillPreviews — takeaway pay-first flow.
 *
 * The cafe order is created only after Razorpay captures. The POST
 * /orders body must carry the checkout ids as `razorpayPayment` so the
 * server claims the capture at creation, and — when the wallet pays part
 * of the bill — `walletAmountPaid`, because the server verifies the
 * capture covers (total − walletAmountPaid) at create.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = { user: { name: 'Asha', email: 'a@x.in', mobile: '9876543210' }, isLoggedIn: true, isGuest: false }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
const clearCart = vi.fn()
vi.mock('@/Context/CartContext', () => ({ useCart: () => ({ clearCart }) }))
vi.mock('@/Context/MenuContext', () => ({ useMenu: () => ({ menuItems: [] }) }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/customerOrderIds', () => ({ rememberOrderIds: vi.fn(), getCustomerOrderSession: vi.fn(() => 'sess') }))
vi.mock('@/utils/tenant', () => ({ getActiveTenant: vi.fn(() => null) }))
vi.mock('@/utils/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }), joinRoom: vi.fn() }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))
vi.mock('react-barcode', () => ({ default: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn() }
  return {
    default: api,
    razorpayAPI: { createOrder: vi.fn(), verifyPayment: vi.fn(), orphanRefund: vi.fn() },
    walletAPI: { getWallet: vi.fn(), payWithWallet: vi.fn() },
    settingsAPI: { getSettings: vi.fn() },
  }
})

import api, { razorpayAPI, walletAPI, settingsAPI } from '@/utils/api'
import BillPreviews from '@/Pages/HealthMode/BillPreviews'

let rzp
function installRazorpay() {
  rzp = { options: null, handlers: {}, open: vi.fn() }
  window.Razorpay = vi.fn(function Razorpay(options) {
    rzp.options = options
    this.on = (evt, fn) => { rzp.handlers[evt] = fn }
    this.open = rzp.open
  })
}
// Extra checkout fields must NOT be forwarded — only the three ids.
const CHECKOUT = { razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A', razorpay_signature: 'sig_A', extra: 'nope' }
const RZP_IDS = { razorpay_order_id: 'order_A', razorpay_payment_id: 'pay_A', razorpay_signature: 'sig_A' }

// ₹1000 subtotal, 5% GST, takeaway (no service charge) → ₹1050.
const GRAND_TOTAL = 1050
const ORDER_PAYLOAD = { type: 'takeaway', items: [{ menuItem: 'm1', name: 'Thali', price: 500, quantity: 2 }], customerName: 'Asha', phone: '9876543210', pickupTime: '18:30' }
const baseState = (over = {}) => ({
  isTakeaway: true,
  items: [{ name: 'Thali', price: 500, quantity: 2 }],
  subtotal: 1000,
  orderPayload: ORDER_PAYLOAD,
  cartItemsForStorage: [],
  selectedTime: '6:30 PM',
  ...over,
})

function renderPreview(state) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/customer/bill-preview', state }]}>
      <Routes>
        <Route path="/customer/bill-preview" element={<BillPreviews />} />
        <Route path="/customer/order-confirmed" element={<div>order-confirmed</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}
const payBtn = () => screen.getByRole('button', { name: /^Pay / })
const ordersPost = () => api.post.mock.calls.find((c) => c[0] === '/orders')?.[1]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  installRazorpay()
  settingsAPI.getSettings.mockResolvedValue({ data: { general: { cafeName: 'Cafe Uno' }, taxes: { gst: { enabled: true, value: 5 } } } })
  razorpayAPI.createOrder.mockResolvedValue({ data: { success: true, key: 'rzp_k', razorpayOrder: { id: 'order_A', amount: 105000, currency: 'INR' } } })
  razorpayAPI.verifyPayment.mockResolvedValue({ data: { success: true } })
  razorpayAPI.orphanRefund.mockResolvedValue({ data: { success: true } })
  walletAPI.payWithWallet.mockResolvedValue({ data: { success: true } })
  api.post.mockResolvedValue({ data: { success: true, order: { _id: 'oid1', orderId: 'ORD-TK-9' } } })
})

async function ready() {
  await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
  // Let the settings promise resolve and re-render with the tax config.
  await act(async () => {})
}

describe('BillPreviews (takeaway) — pay-first order creation', () => {
  test('online: POST /orders carries razorpayPayment (only the three ids), no walletAmountPaid; verify still runs', async () => {
    const user = renderPreview(baseState())
    await ready()
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    expect(razorpayAPI.createOrder).toHaveBeenCalledWith(GRAND_TOTAL, null)

    await act(() => rzp.options.handler(CHECKOUT))
    const body = ordersPost()
    expect(body).toMatchObject({ ...ORDER_PAYLOAD, total: GRAND_TOTAL, paymentMethod: 'online', pointsRedeemed: 0 })
    expect(body.razorpayPayment).toEqual(RZP_IDS)
    expect(body).not.toHaveProperty('walletAmountPaid')
    expect(walletAPI.payWithWallet).not.toHaveBeenCalled()
    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith({ ...RZP_IDS, cafeOrderId: 'ORD-TK-9' })
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
  })

  test('wallet + online split: create body has walletAmountPaid and razorpayPayment; wallet debited, then verify', async () => {
    const user = renderPreview(baseState({ appliedPoints: 300 }))
    await ready()
    await user.click(payBtn())
    await waitFor(() => expect(rzp.open).toHaveBeenCalled())
    // Razorpay charges only grandTotal − wallet.
    expect(razorpayAPI.createOrder).toHaveBeenCalledWith(750, null)

    await act(() => rzp.options.handler(CHECKOUT))
    const body = ordersPost()
    expect(body).toMatchObject({ total: GRAND_TOTAL, paymentMethod: 'online', walletAmountPaid: 300 })
    expect(body.razorpayPayment).toEqual(RZP_IDS)
    expect(walletAPI.payWithWallet).toHaveBeenCalledWith(300, 'oid1')
    expect(razorpayAPI.verifyPayment).toHaveBeenCalledWith({ ...RZP_IDS, cafeOrderId: 'ORD-TK-9' })
    // Order: create → wallet debit → verify.
    const order = [
      api.post.mock.invocationCallOrder[0],
      walletAPI.payWithWallet.mock.invocationCallOrder[0],
      razorpayAPI.verifyPayment.mock.invocationCallOrder[0],
    ]
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  test('full wallet: no Razorpay, create body has no razorpayPayment', async () => {
    const user = renderPreview(baseState({ appliedPoints: 5000 }))
    await ready()
    await user.click(payBtn())
    await waitFor(() => expect(walletAPI.payWithWallet).toHaveBeenCalledWith(GRAND_TOTAL, 'oid1'))
    const body = ordersPost()
    expect(body).toMatchObject({ total: GRAND_TOTAL, paymentMethod: 'wallet' })
    expect(body).not.toHaveProperty('razorpayPayment')
    expect(window.Razorpay).not.toHaveBeenCalled()
    expect(razorpayAPI.createOrder).not.toHaveBeenCalled()
    expect(await screen.findByText('order-confirmed')).toBeInTheDocument()
  })
})
