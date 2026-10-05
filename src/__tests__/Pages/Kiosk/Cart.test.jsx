/**
 * Kiosk/Cart — the self-order kiosk's bill (oracle: utils/billing
 * computeBill with the backend order type the kiosk will create:
 * "Eat Here" → dine-in, "Take Away" → takeaway) and the idle reset.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { computeBill, toTaxConfig } from '@/utils/billing'
import { KIOSK_KEYS } from '@/Pages/Kiosk/kioskState'

const TAXES = {
  gst: { enabled: true, value: 18 },
  serviceCharge: { enabled: true, value: 15 },
  additionalCharges: [{ name: 'Rohit Tax', type: 'Fixed', value: 16 }],
}
vi.mock('@/hooks/queries/useMenuBootstrap', () => ({ useMenuBootstrap: () => ({ data: { settings: { taxes: TAXES } } }) }))
vi.mock('@/Context/MenuContext', () => ({ useMenu: () => ({ menuItems: [] }) }))
vi.mock('@/Pages/Kiosk/Components/ProductPopup', () => ({ default: () => null }))

import KioskCart from '@/Pages/Kiosk/Cart'

const BURGER = { menuItemId: 'b1', name: 'Veg Burger', unitPrice: 149.5, qty: 2, size: 'Regular', addons: [], isVeg: true }
const COFFEE = { menuItemId: 'c1', name: 'Cold Coffee', unitPrice: 99.99, qty: 1, size: 'Large', addons: [], isVeg: true }
const SUBTOTAL = 149.5 * 2 + 99.99 // 398.99

let landed = null
function Probe({ name }) { landed = { name, state: useLocation().state }; return <div>{name}</div> }

function renderKioskCart({ cart = [BURGER, COFFEE], orderType = 'Eat Here' } = {}) {
  localStorage.setItem(KIOSK_KEYS.CART, JSON.stringify(cart))
  localStorage.setItem(KIOSK_KEYS.ORDER_TYPE, orderType)
  render(
    <MemoryRouter initialEntries={['/kiosk/cart']}>
      <Routes>
        <Route path="/kiosk/cart" element={<KioskCart />} />
        <Route path="/kiosk/customer-info" element={<Probe name="customer-info" />} />
        <Route path="/kiosk/menu" element={<Probe name="kiosk-menu" />} />
        <Route path="/kiosk" element={<Probe name="kiosk-landing" />} />
      </Routes>
    </MemoryRouter>,
  )
}
const amountAfter = (label) => screen.getByText(new RegExp(`^${label}`)).parentElement.lastElementChild.textContent
const money = (n) => `₹${n.toFixed(2)}`

// Cart.jsx's empty-cart redirect reads window.location (BrowserRouter in
// the app); MemoryRouter never changes it, so reset it per test.
beforeEach(() => { landed = null; window.history.pushState({}, '', '/') })

describe('Kiosk Cart — totals', () => {
  test.each([
    ['Eat Here', 'dine-in'],
    ['Take Away', 'takeaway'],
  ])('"%s" bill equals computeBill(%s): service charge only for Eat Here', async (kioskType, backendType) => {
    const expected = computeBill({ subtotal: SUBTOTAL, taxConfig: toTaxConfig(TAXES), orderType: backendType })
    renderKioskCart({ orderType: kioskType })

    expect(screen.getByText(money(expected.subtotal))).toBeInTheDocument()
    expect(screen.getByText(money(expected.gst))).toBeInTheDocument()
    expect(screen.getByText(money(16))).toBeInTheDocument()
    expect(screen.getByText(money(expected.total))).toBeInTheDocument()
    if (backendType === 'dine-in') expect(screen.getByText(money(expected.serviceCharge))).toBeInTheDocument()
    else expect(screen.queryByText(/Service/i)).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Proceed|Pay|Checkout|Continue/i }))
    expect(landed.name).toBe('customer-info')
    expect(landed.state.totalPayment).toBe(expected.total)
    expect(landed.state.subtotal).toBe(expected.subtotal)
    expect(landed.state.serviceCharge).toBe(expected.serviceCharge)
  })

  test('changing quantity re-prices the bill', async () => {
    renderKioskCart({ cart: [COFFEE], orderType: 'Take Away' })
    const user = userEvent.setup()
    const plus = screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-plus'))
    await user.click(plus)
    const expected = computeBill({ subtotal: 199.98, taxConfig: toTaxConfig(TAXES), orderType: 'takeaway' })
    expect(screen.getByText(money(expected.total))).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KIOSK_KEYS.CART))[0].qty).toBe(2)
  })

  test('removing the last item sends the customer back to the menu', async () => {
    window.history.pushState({}, '', '/kiosk/cart') // component checks window.location
    renderKioskCart({ cart: [{ ...COFFEE, qty: 1 }] })
    const user = userEvent.setup()
    const minus = screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-minus'))
    await user.click(minus)
    expect(await screen.findByText('kiosk-menu')).toBeInTheDocument()
  })

  // Regression (fixed 2026-10): kioskSubtotal charges each line's add-ons ((unitPrice + add-ons) × qty), matching the popup quote.
  test('paid add-ons chosen in the product popup are charged in the cart total', () => {
    const line = { ...BURGER, qty: 1, addons: [{ name: 'Cheese Slice', qty: 2, price: 30 }] }
    renderKioskCart({ cart: [line], orderType: 'Take Away' })
    const popupQuoted = (149.5 + 2 * 30) * 1 // what the popup's Add button showed
    expect(amountAfter('Subtotal')).toBe(money(popupQuoted))
  })
})

describe('Kiosk Cart — session reset', () => {
  test('"Restart Order" wipes the kiosk session and returns to landing', async () => {
    localStorage.setItem(KIOSK_KEYS.CUSTOMER_INFO, JSON.stringify({ name: 'Prev', phone: '9000000000' }))
    renderKioskCart()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Restart Order' }))
    expect(await screen.findByText('kiosk-landing')).toBeInTheDocument()
    // the cart effect may re-persist the now-empty cart as '[]'
    expect(JSON.parse(localStorage.getItem(KIOSK_KEYS.CART) || '[]')).toEqual([])
    expect(localStorage.getItem(KIOSK_KEYS.ORDER_TYPE)).toBeNull()
    expect(localStorage.getItem(KIOSK_KEYS.CUSTOMER_INFO)).toBeNull()
  })

  test('120 s without interaction resets to landing and clears the cart; activity postpones it', async () => {
    vi.useFakeTimers()
    renderKioskCart()
    await act(async () => { vi.advanceTimersByTime(100_000) })
    window.dispatchEvent(new Event('pointerdown'))     // customer touches the screen
    await act(async () => { vi.advanceTimersByTime(100_000) })
    expect(screen.queryByText('kiosk-landing')).not.toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(21_000) })
    expect(screen.getByText('kiosk-landing')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(KIOSK_KEYS.CART) || '[]')).toEqual([])
  })

  // Regression (fixed 2026-10): idle reset (clearKioskSession) also removes the customer refresh_token.
  test('idle reset removes the previous customer\'s refresh_token from the shared kiosk', async () => {
    vi.useFakeTimers()
    localStorage.setItem('token', 'T')
    localStorage.setItem('refresh_token', 'R')
    renderKioskCart()
    await act(async () => { vi.advanceTimersByTime(121_000) })
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })
})
