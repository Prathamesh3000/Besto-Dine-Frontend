/**
 * Loggedin/Cart — the customer cart's money: line totals, the bill
 * summary (oracle: utils/billing.computeBill), coupons, wallet points,
 * the dine-in order payload and the takeaway hand-off to bill-preview.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import React, { useSyncExternalStore } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { computeBill, computeSubtotal, toTaxConfig } from '@/utils/billing'
import { formatPrice } from '@/utils/pricing'

// ── Cart store mock (reactive) ──────────────────────────────────────────────
const cartStore = (() => {
  let items = {}
  const subs = new Set()
  const emit = () => { items = { ...items }; subs.forEach((f) => f()) }
  return {
    set(lines) { items = Object.fromEntries(lines.map((l) => [l.id, { ...l }])); subs.forEach((f) => f()) },
    get: () => items,
    subscribe: (f) => { subs.add(f); return () => subs.delete(f) },
    updateQuantity: vi.fn((id, delta) => {
      const cur = items[id]; if (!cur) return
      const q = cur.quantity + delta
      if (q <= 0) delete items[id]; else items[id] = { ...cur, quantity: q }
      emit()
    }),
    updateCartItem: vi.fn((id, patch) => { if (items[id]) { items[id] = { ...items[id], ...patch }; emit() } }),
    clearCart: vi.fn(() => { items = {}; emit() }),
  }
})()

const auth = { user: { name: 'Asha', mobile: '9876543210' }, isGuest: false, isLoggedIn: true }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/Context/CartContext', () => ({
  useCart: () => ({
    cartItems: useSyncExternalStore(cartStore.subscribe, cartStore.get),
    updateQuantity: cartStore.updateQuantity,
    updateCartItem: cartStore.updateCartItem,
    clearCart: cartStore.clearCart,
  }),
}))
vi.mock('@/Context/MenuContext', () => ({ useMenu: () => ({ menuItems: [] }) }))
vi.mock('@/utils/favorites', () => ({ useFavorites: () => ({ has: () => false, toggle: () => {} }) }))
vi.mock('@/Components/Loggedin/ProductDetailsModal', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/SpecialInstructionsPopup', () => ({ default: () => null }))
vi.mock('@/utils/tenant', () => ({
  getActiveBranch: vi.fn(() => ({ _id: 'br1', name: 'MG Road' })),
  activeRestaurantPath: () => '/cafe-uno',
}))
vi.mock('@/utils/geo', () => ({ geocodeAddress: vi.fn(), reverseGeocode: vi.fn(), getCurrentPosition: vi.fn() }))
vi.mock('@/utils/dineInSession', () => ({ useDineInLock: () => false }))
vi.mock('@/utils/guestSession', () => ({ isGuestSessionExpired: () => false, clearGuestSession: vi.fn() }))
vi.mock('@/utils/customerOrderIds', () => ({ rememberOrderIds: vi.fn(), getCustomerOrderSession: () => 'sess' }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn() }
  return {
    default: api,
    walletAPI: { getWallet: vi.fn() },
    promotionsAPI: { getActiveCoupons: vi.fn(), applyCoupon: vi.fn() },
    settingsAPI: { getSettings: vi.fn() },
  }
})

import api, { walletAPI, promotionsAPI, settingsAPI } from '@/utils/api'
import Cart from '@/Pages/Loggedin/Cart'

// ── Fixtures ────────────────────────────────────────────────────────────────
const TAXES = {
  gst: { enabled: true, value: 5 },
  serviceCharge: { enabled: true, value: 10 },
  additionalCharges: [{ name: 'Packaging', type: 'Fixed', value: 15 }, { name: 'Eco cess', type: 'Percentage', value: 1.5 }],
}
const TAX_CONFIG = toTaxConfig(TAXES)

// Customised line: product finalPrice 199, Large size 229.5 + Cheese 20 → unit 249.5
const PANEER = {
  id: 'm1', _id: 'm1', title: 'Paneer Tikka', name: 'Paneer Tikka', finalPrice: 199, basePrice: 199, price: 199,
  unitPrice: 249.5, quantity: 2,
  selectedSizes: [{ id: 'L', name: 'Large', price: 229.5 }], selectedToppings: [{ id: 't1', name: 'Cheese', price: 20 }],
}
const CHAI = { id: 'm2', _id: 'm2', title: 'Masala Chai', name: 'Masala Chai', finalPrice: 35.25, price: 35.25, quantity: 3 }
const LINES = [PANEER, CHAI]
const SUBTOTAL = computeSubtotal(LINES) // 499 + 105.75 = 604.75

let landed = null
function Probe({ name }) { landed = { name, state: useLocation().state }; return <div>{name}</div> }

function renderCart({ lines = LINES, orderType = 'dine-in', wallet = 0, coupons = [] } = {}) {
  cartStore.set(lines)
  localStorage.setItem('orderType', orderType)
  localStorage.setItem('dineInTable', JSON.stringify({ _id: 'tbl1', name: '7' }))
  walletAPI.getWallet.mockResolvedValue({ data: { success: true, balance: wallet } })
  promotionsAPI.getActiveCoupons.mockResolvedValue({ data: { success: true, coupons } })
  render(
    <MemoryRouter initialEntries={['/customer/cart']}>
      <Routes>
        <Route path="/customer/cart" element={<Cart />} />
        <Route path="/customer/orders" element={<Probe name="orders-page" />} />
        <Route path="/bill-preview" element={<Probe name="bill-preview" />} />
        <Route path="/login" element={<Probe name="login-page" />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

const summary = () => screen.getByText('Bill Summary').parentElement
const row = (label) => {
  const el = within(summary()).getByText((_, n) => n?.tagName === 'SPAN' && n.textContent.startsWith(label))
  return el.closest('div').lastElementChild.textContent
}
const money = (n) => `₹${n.toFixed(2)}`

async function settle() {
  await waitFor(() => expect(settingsAPI.getSettings).toHaveBeenCalled())
  await screen.findByText(/^GST \(5%\)/)
}

beforeEach(() => {
  landed = null
  Object.assign(auth, { isGuest: false, isLoggedIn: true, user: { name: 'Asha', mobile: '9876543210' } })
  settingsAPI.getSettings.mockResolvedValue({ data: { taxes: TAXES } })
  api.get.mockImplementation((url) => {
    if (url.startsWith('/orders/active-list')) return Promise.resolve({ data: { orders: [] } })
    if (url.startsWith('/menu?')) return Promise.resolve({ data: {} })
    // price re-sync: a 5xx leaves the cart line untouched
    return Promise.reject({ response: { status: 503 } })
  })
  api.post.mockResolvedValue({ data: { success: true, order: { orderId: 'ORD-20261003-0099' } } })
})

describe('Cart — lines', () => {
  test('each line shows unit (size + toppings) × qty and the exact line total', async () => {
    renderCart()
    await settle()
    expect(screen.getByText(`₹${formatPrice(249.5)} × 2`)).toBeInTheDocument()
    expect(screen.getByText('₹499')).toBeInTheDocument()
    expect(screen.getByText(`₹${formatPrice(35.25)} × 3`)).toBeInTheDocument()
    expect(screen.getByText('₹105.75')).toBeInTheDocument()
  })

  test('empty cart shows the empty state and no checkout', () => {
    renderCart({ lines: [] })
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument()
    expect(screen.queryByText('Bill Summary')).not.toBeInTheDocument()
  })
})

describe('Cart — bill summary equals computeBill', () => {
  test.each([
    ['dine-in', 'dine-in'],
    ['takeaway', 'takeaway'],
  ])('%s: every row and the total match computeBill to the paisa', async (orderType) => {
    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: TAX_CONFIG, orderType })
    renderCart({ orderType })
    await settle()
    expect(row('Subtotal')).toBe(money(expected.subtotal))
    expect(row('GST (5%)')).toBe(money(expected.gst))
    expect(row('Packaging')).toBe(money(15))
    expect(row('Eco cess (1.5%)')).toBe(money(expected.additionalCharges[1].amount))
    expect(row('Total')).toBe(money(expected.total))
    if (orderType === 'dine-in') {
      expect(row('Service Charge (10%)')).toBe(money(expected.serviceCharge))
    } else {
      // service charge is a dine-in table-service charge only
      expect(within(summary()).queryByText(/Service Charge/)).not.toBeInTheDocument()
    }
  })

  test('changing a quantity re-prices the bill', async () => {
    const user = renderCart()
    await settle()
    // + on the chai line
    let node = screen.getByText(`₹${formatPrice(35.25)} × 3`)
    while (node && !node.querySelector('svg.lucide-plus')) node = node.parentElement
    await user.click(node.querySelector('svg.lucide-plus').closest('button'))
    expect(cartStore.updateQuantity).toHaveBeenCalledWith('m2', 1, expect.objectContaining({ id: 'm2' }))
    const expected = computeBill({ subtotal: computeSubtotal([PANEER, { ...CHAI, quantity: 4 }]), taxConfig: TAX_CONFIG, orderType: 'dine-in' })
    await waitFor(() => expect(row('Total')).toBe(money(expected.total)))
  })
})

describe('Cart — dine-in place order', () => {
  test('the total sent to POST /orders equals the displayed total and the button label', async () => {
    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: TAX_CONFIG, orderType: 'dine-in' })
    const user = renderCart()
    await settle()
    const btn = screen.getByRole('button', { name: /Place Order ₹/ })
    expect(btn).toHaveTextContent(`Place Order ${money(expected.total)}`)
    await user.click(btn)
    await screen.findByText('orders-page')
    const [url, body, opts] = api.post.mock.calls.find((c) => c[0] === '/orders')
    expect(url).toBe('/orders')
    expect(body.total).toBe(expected.total)
    expect(body).toMatchObject({ type: 'dine-in', tableId: 'tbl1', couponDiscount: 0, pointsRedeemed: 0, tipAmount: 0 })
    expect(body.items).toEqual([
      expect.objectContaining({ menuItem: 'm1', quantity: 2, selectedSizes: PANEER.selectedSizes, selectedToppings: PANEER.selectedToppings }),
      expect.objectContaining({ menuItem: 'm2', quantity: 3, price: 35.25 }),
    ])
    expect(opts.headers['Idempotency-Key']).toBe(body.clientIdempotencyKey)
    expect(cartStore.clearCart).toHaveBeenCalled()
  })

  test('TOTAL_MISMATCH keeps the cart and asks the customer to retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.post.mockRejectedValue({ response: { status: 400, data: { code: 'TOTAL_MISMATCH' } } })
    const { toast } = await import('react-hot-toast')
    const user = renderCart()
    await settle()
    await user.click(screen.getByRole('button', { name: /Place Order ₹/ }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/mismatch/i)))
    expect(cartStore.clearCart).not.toHaveBeenCalled()
    expect(screen.queryByText('orders-page')).not.toBeInTheDocument()
  })
})

describe('Cart — coupon', () => {
  test('apply: sends code + subtotal + item hints (with menuItem ids so the server resolves food/beverage kind), shows the discount and lowers total and payload', async () => {
    promotionsAPI.applyCoupon.mockResolvedValue({ data: { success: true, discount: 60.48, coupon: { code: 'SAVE10' }, message: 'Saved!' } })
    const user = renderCart()
    await settle()
    await user.type(screen.getByLabelText('Coupon code'), 'save10')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(row('Coupon Discount')).toBe('-₹60.48'))
    expect(promotionsAPI.applyCoupon).toHaveBeenCalledWith('SAVE10', SUBTOTAL, { _silent: true }, [
      { menuItem: 'm1', prepStation: 'kitchen', price: 249.5, quantity: 2 },
      { menuItem: 'm2', prepStation: 'kitchen', price: 35.25, quantity: 3 },
    ])
    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: TAX_CONFIG, orderType: 'dine-in', couponDiscount: 60.48 })
    expect(row('Total')).toBe(money(expected.total))

    await user.click(screen.getByRole('button', { name: /Place Order ₹/ }))
    await screen.findByText('orders-page')
    const body = api.post.mock.calls.find((c) => c[0] === '/orders')[1]
    expect(body).toMatchObject({ total: expected.total, couponCode: 'SAVE10', couponDiscount: 60.48 })
  })

  test.each([
    ['Minimum order value of ₹1000 required', /Add ₹396 more to apply this coupon/],
    ['Coupon has expired', /This coupon has expired/],
    ['Usage limit reached', /already used this coupon/],
  ])('rejection "%s" is shown inline as %s and no discount is applied', async (serverMsg, shown) => {
    promotionsAPI.applyCoupon.mockRejectedValue({ response: { data: { message: serverMsg } } })
    const user = renderCart()
    await settle()
    await user.type(screen.getByLabelText('Coupon code'), 'X')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(shown)
    expect(within(summary()).queryByText('Coupon Discount')).not.toBeInTheDocument()
  })

  test('guest: coupon input and Apply are disabled with a Login prompt', async () => {
    Object.assign(auth, { isGuest: true, isLoggedIn: false, user: null })
    renderCart()
    await settle()
    expect(screen.getByLabelText('Coupon code')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.getByText(/Login to unlock coupons/)).toBeInTheDocument()
    expect(walletAPI.getWallet).not.toHaveBeenCalled()
  })
})

describe('Cart — takeaway: wallet points and hand-off', () => {
  async function fillTakeaway(user) {
    await user.click(screen.getByRole('button', { name: /^9:00 AM/ }))
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 3, 8, 0, 0)) // 08:00 → every AM slot open
  })

  test('wallet section is takeaway-only', async () => {
    renderCart({ orderType: 'dine-in', wallet: 500 })
    await settle()
    expect(screen.queryByLabelText('Wallet points to redeem')).not.toBeInTheDocument()
  })

  test.each([
    ['0', 'greater than zero'],
    ['501', 'only have ₹500.00 wallet balance'],
  ])('redeeming %s is refused (%s)', async (pts, msg) => {
    const user = renderCart({ orderType: 'takeaway', wallet: 500 })
    await settle()
    await screen.findByText('500.00 Points')
    await user.type(screen.getByLabelText('Wallet points to redeem'), pts)
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    expect(screen.getByRole('alert')).toHaveTextContent(msg)
  })

  test('cannot redeem more than the subtotal', async () => {
    const user = renderCart({ orderType: 'takeaway', wallet: 5000 })
    await settle()
    await screen.findByText('5000.00 Points')
    await user.type(screen.getByLabelText('Wallet points to redeem'), '605')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    expect(screen.getByRole('alert')).toHaveTextContent('cannot exceed order subtotal')
  })

  test('coupon + wallet stack: bill-preview receives the displayed total and a matching orderPayload', async () => {
    promotionsAPI.applyCoupon.mockResolvedValue({ data: { success: true, discount: 50, coupon: { code: 'FLAT50' } } })
    const user = renderCart({ orderType: 'takeaway', wallet: 500 })
    await settle()
    await screen.findByText('500.00 Points')
    await user.type(screen.getByLabelText('Coupon code'), 'FLAT50')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(row('Coupon Discount')).toBe('-₹50.00'))
    await user.type(screen.getByLabelText('Wallet points to redeem'), '100')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    await waitFor(() => expect(row('Wallet Points')).toBe('-₹100.00'))

    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: TAX_CONFIG, orderType: 'takeaway', couponDiscount: 50, pointsRedeemed: 100 })
    expect(row('Total')).toBe(money(expected.total))

    await fillTakeaway(user)
    await user.click(screen.getByRole('button', { name: /Proceed to Pay/ }))
    await screen.findByText('bill-preview')
    expect(landed.state.total).toBe(expected.total)
    expect(landed.state.orderPayload).toMatchObject({
      type: 'takeaway', total: expected.total, couponCode: 'FLAT50', couponDiscount: 50, pointsRedeemed: 100,
      phone: '9876543210', pickupTime: '9:00 AM', pickupLocation: 'MG Road', branchId: 'br1',
    })
    expect(api.post).not.toHaveBeenCalledWith('/orders', expect.anything(), expect.anything())
  })

  // Regression (fixed 2026-10): takeaway "Proceed to Pay" label shows the total to the paisa, like the dine-in label.
  test('takeaway "Proceed to Pay" label shows the total to the paisa', async () => {
    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: TAX_CONFIG, orderType: 'takeaway' })
    const user = renderCart({ orderType: 'takeaway' })
    await settle()
    await fillTakeaway(user)
    expect(screen.getByRole('button', { name: /Proceed to Pay/ })).toHaveTextContent(money(expected.total))
  })

  test('missing pickup time and invalid phone block the hand-off', async () => {
    Object.assign(auth, { user: { name: 'Asha', mobile: '' } })
    const user = renderCart({ orderType: 'takeaway' })
    await settle()
    await user.click(screen.getByRole('button', { name: /Please Select Pickup Time/ }))
    expect(screen.getByText('Please select a pickup time before proceeding')).toBeInTheDocument()
    expect(screen.getByText(/valid 10-digit mobile number/)).toBeInTheDocument()
    expect(screen.queryByText('bill-preview')).not.toBeInTheDocument()
  })
})
