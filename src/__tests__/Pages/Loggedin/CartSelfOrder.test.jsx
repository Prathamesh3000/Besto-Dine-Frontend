/**
 * Loggedin/Cart — operations profile: QR menu-only
 * (orderFlow.customerSelfOrder:false), roomService wording and the
 * 402 PAYMENT_REQUIRED_FIRST stale-profile recovery.
 * Mock setup mirrors Cart.test.jsx.
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
// Active tenant blob — `operations` is the customer-safe operations profile
// read by utils/operations.getCustomerOperations(). null → defaults.
let tenantBlob = null
vi.mock('@/utils/tenant', () => ({
  getActiveTenant: vi.fn(() => tenantBlob),
  getActiveBranch: vi.fn(() => ({ _id: 'br1', name: 'MG Road' })),
  activeRestaurantPath: () => '/cafe-uno',
  setActiveTenantOperations: vi.fn((ops) => { tenantBlob = { ...(tenantBlob || {}), operations: ops } }),
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
import { setActiveTenantOperations } from '@/utils/tenant'
import { toast } from 'react-hot-toast'
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
        <Route path="/customer/payment" element={<Probe name="payment-page" />} />
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
  tenantBlob = null
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

describe('Cart — QR menu-only (customerSelfOrder:false)', () => {
  const MENU_ONLY = { orderFlow: { customerSelfOrder: false } }

  test('dine-in: no Place Order, no Add more items — shows the staff note', async () => {
    tenantBlob = { slug: 'hotel', operations: MENU_ONLY }
    renderCart()
    await settle()
    expect(screen.queryByRole('button', { name: /Place Order/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add more items/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('qr-menu-only-note')).toHaveTextContent(
      'Ordering at the table is not available — please order with the staff.',
    )
    expect(api.post).not.toHaveBeenCalled()
  })

  test('takeaway is untouched: Proceed to Pay + Add more items still there', async () => {
    tenantBlob = { slug: 'hotel', operations: MENU_ONLY }
    renderCart({ orderType: 'takeaway' })
    await settle()
    expect(screen.getByRole('button', { name: /Please Select Pickup Time|Proceed to Pay/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add more items/ })).toBeInTheDocument()
    expect(screen.queryByTestId('qr-menu-only-note')).not.toBeInTheDocument()
  })

  test('self-order on (default): Place Order and Add more items shown', async () => {
    renderCart()
    await settle()
    expect(screen.getByRole('button', { name: /Place Order ₹/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add more items/ })).toBeInTheDocument()
    expect(screen.queryByTestId('qr-menu-only-note')).not.toBeInTheDocument()
  })
})

describe('Cart — payment.dineIn "either" with the other gates', () => {
  const EITHER = { payment: { dineIn: 'either', methods: { online: true, wallet: true, counterCash: true } } }

  test('menu-only QR wins: no pay choice, just the staff note', async () => {
    tenantBlob = { slug: 'hotel', operations: { ...EITHER, orderFlow: { customerSelfOrder: false } } }
    renderCart()
    await settle()
    expect(screen.queryByTestId('pay-choice')).not.toBeInTheDocument()
    expect(screen.getByTestId('qr-menu-only-note')).toBeInTheDocument()
  })

  test('takeaway is untouched by the dine-in choice: single Proceed to Pay', async () => {
    tenantBlob = { slug: 'hotel', operations: EITHER }
    renderCart({ orderType: 'takeaway' })
    await settle()
    expect(screen.queryByTestId('pay-choice')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Please Select Pickup Time|Proceed to Pay/ })).toBeInTheDocument()
  })

  test('"Pay after the meal" then a stale 402 still recovers into the pay-first hand-off', async () => {
    tenantBlob = { slug: 'cafe-uno', operations: EITHER }
    api.post.mockImplementation((url) => (url === '/orders'
      ? Promise.reject({ response: { status: 402, data: { code: 'PAYMENT_REQUIRED_FIRST', methods: { online: true, wallet: true, counterCash: false } } } })
      : Promise.resolve({ data: { success: true } })))
    const user = renderCart()
    await settle()
    await user.click(screen.getByRole('button', { name: 'Pay after the meal' }))
    await screen.findByText('payment-page')
    expect(tenantBlob.operations.payment.dineIn).toBe('payFirst')
    expect(landed.state).toMatchObject({ payFirstDineIn: true })
  })
})

describe('Cart — serviceModel wording', () => {
  test('roomService labels the spot "Room"', async () => {
    tenantBlob = { operations: { serviceModel: 'roomService' } }
    renderCart()
    await settle()
    expect(screen.getByText('Room 7')).toBeInTheDocument()
    expect(screen.queryByText('Table 7')).not.toBeInTheDocument()
  })

  test('tableService / counterService keep "Table"', async () => {
    tenantBlob = { operations: { serviceModel: 'counterService' } }
    renderCart()
    await settle()
    expect(screen.getByText('Table 7')).toBeInTheDocument()
  })
})

describe('Cart — 402 PAYMENT_REQUIRED_FIRST (stale cached profile)', () => {
  test('stores the pay-first rule, toasts, and hands the draft to /customer/payment', async () => {
    tenantBlob = { slug: 'cafe-uno', operations: { payment: { dineIn: 'payAfter', methods: { online: true, wallet: true, counterCash: false } } } }
    api.post.mockImplementation((url) => (url === '/orders'
      ? Promise.reject({ response: { status: 402, data: { code: 'PAYMENT_REQUIRED_FIRST', methods: { online: true, wallet: false, counterCash: true } } } })
      : Promise.resolve({ data: { success: true } })))
    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: TAX_CONFIG, orderType: 'dine-in' })
    const user = renderCart()
    await settle()
    await user.click(screen.getByRole('button', { name: /Place Order ₹/ }))
    await screen.findByText('payment-page')
    // getCustomerOperations() fills the blob with today's defaults, so the
    // stored payment block also carries the default channel modes.
    expect(setActiveTenantOperations).toHaveBeenCalledWith(expect.objectContaining({
      payment: expect.objectContaining({ dineIn: 'payFirst', methods: { online: true, wallet: false, counterCash: true } }),
    }))
    expect(tenantBlob.operations.payment.dineIn).toBe('payFirst')
    expect(toast).toHaveBeenCalledWith('This restaurant asks you to pay first', expect.anything())
    expect(landed.state).toMatchObject({ payFirstDineIn: true, total: expected.total })
    expect(landed.state.orderPayload).toMatchObject({ type: 'dine-in', tableId: 'tbl1', clientIdempotencyKey: expect.any(String) })
    // a fresh key — the server would replay the 402 for the rejected one
    const firstKey = api.post.mock.calls.find((c) => c[0] === '/orders')[1].clientIdempotencyKey
    expect(landed.state.orderPayload.clientIdempotencyKey).not.toBe(firstKey)
    expect(cartStore.clearCart).not.toHaveBeenCalled()
  })

  test('402 without methods keeps the cached methods', async () => {
    const methods = { online: true, wallet: true, counterCash: false }
    tenantBlob = { operations: { payment: { dineIn: 'payAfter', methods } } }
    api.post.mockRejectedValue({ response: { status: 402, data: { code: 'PAYMENT_REQUIRED_FIRST' } } })
    const user = renderCart()
    await settle()
    await user.click(screen.getByRole('button', { name: /Place Order ₹/ }))
    await screen.findByText('payment-page')
    expect(tenantBlob.operations.payment).toMatchObject({ dineIn: 'payFirst', methods })
  })
})
