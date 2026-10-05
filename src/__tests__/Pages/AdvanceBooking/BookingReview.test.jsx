/**
 * BookingReview — the customer-facing price for an advance booking.
 *
 * Oracle: Backend/utils/advanceBookingPricing.computeBookingPrice (the
 * server re-prices every booking with it). Whatever this screen shows as
 * "Total Amount" / "Pay Advance (50%)" and forwards to the payment step
 * must equal what the server will charge for the same inputs.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { computeBookingPrice } = require('../../../../../Backend/utils/advanceBookingPricing.js')

vi.mock('/party.svg', () => ({ default: 'party.svg' }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', name: 'Asha' } }) }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/utils/api', () => ({
  walletAPI: { getWallet: vi.fn() },
  promotionsAPI: { getActiveCoupons: vi.fn(), applyCoupon: vi.fn() },
  settingsAPI: { getSettings: vi.fn() },
}))

import { walletAPI, promotionsAPI, settingsAPI } from '@/utils/api'
import BookingReview from '@/Pages/AdvanceBooking/BookingReview'

let forwarded = null
function PaymentProbe() {
  forwarded = useLocation().state
  return <div>payment-step</div>
}

function renderReview(state, { points = 0, pointsToRupee = 0.1, coupons = [] } = {}) {
  walletAPI.getWallet.mockResolvedValue({ data: { success: true, loyaltyPoints: points } })
  promotionsAPI.getActiveCoupons.mockResolvedValue({ data: { success: true, coupons } })
  settingsAPI.getSettings.mockResolvedValue({ data: { wallet: { pointsToRupee } } })
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[{ pathname: '/customer/booking-review', state }]}>
      <Routes>
        <Route path="/customer/booking-review" element={<BookingReview />} />
        <Route path="/customer/advance-payment" element={<PaymentProbe />} />
        <Route path="/customer/booking-type" element={<div>booking-type-start</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

const inr = (v) => `₹${(v || 0).toLocaleString('en-IN')}`
const totalShown = () => screen.getByText('Total Amount').nextSibling.textContent
const advanceShown = () => screen.getByText('Pay Advance (50%)').nextSibling.textContent
const subtotalShown = () => screen.getByText('Subtotal').nextSibling.textContent

async function proceed(user) {
  // mobile + desktop footers both render in jsdom; either navigates.
  await user.click(screen.getAllByRole('button', { name: 'Proceed to Pay' })[0])
  await screen.findByText('payment-step')
  return forwarded
}

beforeEach(() => { forwarded = null })

// ── Fixtures: one UI state + the equivalent server pricing input ────────────
const ADDON = (id, slug, base, duration) => {
  const scaled = duration === '2' ? Math.round(base * 0.4) : duration === '4' ? Math.round(base * 0.8) : base
  return {
    detail: { id, slug, title: slug, price: scaled },
    selection: { duration: duration || '', price: scaled, options: [] },
    server: { price: base, slug, duration },
  }
}

function tableCase() {
  const a1 = ADDON('a1', 'photographer', 5000, '2') // 2000
  const a2 = ADDON('a2', 'dj', 3333, '4')            // Math.round(2666.4) = 2666
  const a3 = ADDON('a3', 'photobooth', 1999, 'full') // 1999
  return {
    name: 'table: parking (multi-vehicle, 3h) + duration-scaled add-ons + decor + cake ×2',
    state: {
      bookingType: 'table', selectedDate: '2026-11-20', selectedTime: '7:00 PM', guests: 6,
      selectedTypes: ['t'], selectedTableNames: ['T1', 'T2'],
      parkingVehicles: [{ vehicleType: 'car', count: 2 }, { vehicleType: 'bike', count: 1 }],
      parkingRates: { car: 50, bike: 20 }, parkingDuration: 3,
      selectedDecor: { id: 'd1', title: 'Gold', basePrice: 1500, category: 'Birthday' },
      selectedFlavor: 'f1', selectedSize: 's1', quantity: 2, selectedCakeData: { price: 450 },
      selectedAddonDetails: [a1.detail, a2.detail, a3.detail],
      addonSelections: { a1: a1.selection, a2: a2.selection, a3: a3.selection },
    },
    server: {
      bookingType: 'table', guests: 6, decorationPrice: 1500,
      cake: { unitPrice: 450, quantity: 2 },
      parking: { lines: [{ rate: 50, count: 2 }, { rate: 20, count: 1 }], hours: 3 },
      addons: [a1.server, a2.server, a3.server],
    },
  }
}

function hallCase() {
  const host = ADDON('h1', 'host', 2500, 'full')
  return {
    name: 'hall: base price + package × guests + host add-on (parking ignored for halls)',
    state: {
      bookingType: 'hall', selectedDate: '2026-12-01', guests: 40,
      selectedHall: { id: 'H1', title: 'Grand', basePrice: 20001 },
      selectedPackage: { id: 'P1', name: 'Gold', price: 749 },
      // stale parking from an earlier table attempt must not be billed
      parkingVehicles: [{ vehicleType: 'car', count: 3 }], parkingRates: { car: 50 },
      selectedAddonDetails: [host.detail], addonSelections: { h1: host.selection },
    },
    server: {
      bookingType: 'hall', guests: 40, hallPrice: 20001, packagePrice: 749,
      parking: { lines: [{ rate: 50, count: 3 }], hours: 2 },
      addons: [host.server],
    },
  }
}

function eventParkingCase() {
  return {
    name: 'table: event-mode parking hours, odd total → advance rounds half up',
    state: {
      bookingType: 'table', selectedDate: '2026-11-21', guests: 2,
      parkingVehicles: [{ vehicleType: 'bus', count: 1 }], parkingRates: { bus: 101 },
      parkingMode: 'event', parkingEventHours: 5,
      selectedDecor: { id: 'd2', title: 'Basic', basePrice: 0 },
    },
    server: { bookingType: 'table', guests: 2, parking: { lines: [{ rate: 101, count: 1 }], hours: 5 } },
  }
}

describe('BookingReview — price parity with computeBookingPrice', () => {
  test.each([tableCase(), hallCase(), eventParkingCase()].map((c) => [c.name, c]))(
    '%s',
    async (_name, c) => {
      const expected = computeBookingPrice(c.server)
      const user = renderReview(c.state)
      await waitFor(() => expect(walletAPI.getWallet).toHaveBeenCalled())

      expect(subtotalShown()).toBe(inr(expected.subtotal))
      expect(totalShown()).toBe(inr(expected.total))
      expect(advanceShown()).toBe(inr(expected.advance))

      const sent = await proceed(user)
      expect(sent.total).toBe(expected.advance)          // advance selected by default
      expect(sent.bookingTotal).toBe(expected.total)
      expect(sent.paymentType).toBe('advance')
      expect(sent.pricesBreakdown).toMatchObject({
        hall: expected.breakdown.hall, package: expected.breakdown.package,
        cake: expected.breakdown.cake, decoration: expected.breakdown.decoration,
        parking: expected.breakdown.parking, addon: expected.breakdown.addon,
      })
    },
  )

  test('"Pay Full Amount" forwards the full total', async () => {
    const c = hallCase()
    const expected = computeBookingPrice(c.server)
    const user = renderReview(c.state)
    await user.click(screen.getByText('Pay Full Amount'))
    const sent = await proceed(user)
    expect(sent.paymentType).toBe('full')
    expect(sent.total).toBe(expected.total)
  })

  // Regression (fixed 2026-10): prices are parsed as decimals (toPrice), so a hall base price with paise is not inflated.
  test('a non-integer hall base price keeps its decimal point', async () => {
    const state = { bookingType: 'hall', selectedDate: '2026-12-01', guests: 1, selectedHall: { id: 'H', title: 'Mini', basePrice: 2499.5 } }
    const expected = computeBookingPrice({ bookingType: 'hall', guests: 1, hallPrice: 2499.5 })
    renderReview(state)
    expect(totalShown()).toBe(inr(expected.total))
  })

  // Regression (fixed 2026-10): the add-on list-price fallback is parsed as a decimal, so ₹999.50 stays ₹999.50.
  test('a fixed-price add-on with paise (no duration modal) is billed at its real price', async () => {
    const state = {
      bookingType: 'table', selectedDate: '2026-12-01', guests: 2, parkingSkipped: true,
      selectedAddonDetails: [{ id: 'k1', slug: 'balloons', title: 'Balloons', price: 999.5 }],
    }
    const expected = computeBookingPrice({ bookingType: 'table', guests: 2, addons: [{ price: 999.5, slug: 'balloons' }] })
    renderReview(state)
    expect(totalShown()).toBe(inr(expected.total))
  })

  // Regression (fixed 2026-10): a selection price of 0 is used as-is (?? not ||), not replaced by the full base price.
  test('a duration-scaled add-on whose scaled price rounds to ₹0 is billed at ₹0', async () => {
    const a = ADDON('z1', 'dj', 1, '2')
    const state = {
      bookingType: 'table', selectedDate: '2026-12-01', guests: 2, parkingSkipped: true,
      selectedAddonDetails: [{ ...a.detail, price: 1 }], addonSelections: { z1: a.selection },
    }
    const expected = computeBookingPrice({ bookingType: 'table', guests: 2, addons: [a.server] })
    renderReview(state)
    expect(totalShown()).toBe(inr(expected.total))
  })
})

describe('BookingReview — coupon then points caps', () => {
  const baseState = () => ({
    bookingType: 'hall', selectedDate: '2026-12-01', guests: 10,
    selectedHall: { id: 'H', title: 'Grand', basePrice: 10000 },
    selectedPackage: { id: 'P', name: 'Std', price: 500 },
  }) // subtotal 15000

  test('coupon: applyCoupon receives the subtotal; discount is shown and taken off total + advance', async () => {
    promotionsAPI.applyCoupon.mockResolvedValue({ data: { success: true, discount: 1500, coupon: { code: 'TEN' } } })
    const user = renderReview(baseState())
    await user.type(screen.getByLabelText('Coupon code'), 'ten')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText(/Coupon "TEN" applied/)
    expect(promotionsAPI.applyCoupon).toHaveBeenCalledWith('TEN', 15000)

    const expected = computeBookingPrice({ bookingType: 'hall', guests: 10, hallPrice: 10000, packagePrice: 500, couponDiscount: 1500 })
    expect(screen.getByText('Coupon Discount').nextSibling).toHaveTextContent(`-${inr(1500)}`)
    expect(subtotalShown()).toBe(inr(expected.subtotal))
    expect(totalShown()).toBe(inr(expected.total))
    expect(advanceShown()).toBe(inr(expected.advance))
    const sent = await proceed(user)
    expect(sent).toMatchObject({ couponCode: 'TEN', couponDiscount: 1500, bookingTotal: expected.total })
  })

  test('coupon rejection surfaces the server message inline and leaves the total untouched', async () => {
    promotionsAPI.applyCoupon.mockRejectedValue({ response: { data: { message: 'Coupon expired' } } })
    const user = renderReview(baseState())
    await user.type(screen.getByLabelText('Coupon code'), 'OLD')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Coupon expired')
    expect(totalShown()).toBe(inr(15000))
  })

  test('empty coupon code is rejected without calling the server', async () => {
    const user = renderReview(baseState())
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a coupon code')
    expect(promotionsAPI.applyCoupon).not.toHaveBeenCalled()
  })

  test('points cannot be redeemed while a coupon is applied (UI makes them mutually exclusive)', async () => {
    promotionsAPI.applyCoupon.mockResolvedValue({ data: { success: true, discount: 1500, code: 'TEN' } })
    const user = renderReview(baseState(), { points: 20000 })
    await screen.findByText(/20000 pts/)
    await user.type(screen.getByLabelText('Coupon code'), 'TEN')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByText(/Coupon "TEN" applied/)
    await user.type(screen.getByLabelText('Wallet points to redeem'), '100')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Remove applied coupon')
    expect(totalShown()).toBe(inr(13500))
  })

  test('points: rupee value uses settings pointsToRupee (paise exact) and matches the server total', async () => {
    const user = renderReview(baseState(), { points: 20000, pointsToRupee: 0.25 })
    await screen.findByText(/20000 pts/)
    await user.type(screen.getByLabelText('Wallet points to redeem'), '4001')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))

    const expected = computeBookingPrice({
      bookingType: 'hall', guests: 10, hallPrice: 10000, packagePrice: 500, pointsRupees: 4001 * 0.25,
    })
    expect(screen.getByText('Wallet Points (4001 pts)').nextSibling).toHaveTextContent(`-${inr(1000.25)}`)
    expect(totalShown()).toBe(inr(expected.total))        // 15000 - 1000.25 = 13999.75
    expect(advanceShown()).toBe(inr(expected.advance))
    expect(subtotalShown()).toBe(inr(expected.subtotal))
    const sent = await proceed(user)
    expect(sent.walletPointsUsed).toBe(4001)
    expect(sent.bookingTotal).toBe(expected.total)
    expect(sent.total).toBe(expected.advance)
  })

  test('points are capped so the bill cannot go below ₹0 (server caps at the post-coupon amount)', async () => {
    const user = renderReview(baseState(), { points: 1_000_000, pointsToRupee: 0.1 })
    await screen.findByText(/1000000 pts/)
    await user.type(screen.getByLabelText('Wallet points to redeem'), '999999')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    const expected = computeBookingPrice({ bookingType: 'hall', guests: 10, hallPrice: 10000, packagePrice: 500, pointsRupees: 999999 * 0.1 })
    expect(expected.total).toBe(0)
    expect(totalShown()).toBe(inr(0))
    const sent = await proceed(user)
    expect(sent.walletPointsUsed).toBe(150000) // floor(15000 / 0.1), not the 999999 typed
    expect(sent.bookingTotal).toBe(0)
  })

  test.each([
    ['0', 'greater than zero'],
    ['-5', 'greater than zero'],
    ['501', 'only have 500 points'],
  ])('redeeming %s points is refused (%s)', async (pts, msg) => {
    const user = renderReview(baseState(), { points: 500 })
    await screen.findByText(/500 pts/)
    await user.type(screen.getByLabelText('Wallet points to redeem'), pts)
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    expect(screen.getByRole('alert')).toHaveTextContent(msg)
    expect(totalShown()).toBe(inr(15000))
  })

  test('coupon cannot be applied while points are redeemed (order: coupon first, then points)', async () => {
    const user = renderReview(baseState(), { points: 500 })
    await screen.findByText(/500 pts/)
    await user.type(screen.getByLabelText('Wallet points to redeem'), '100')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    await user.type(screen.getByLabelText('Coupon code'), 'TEN')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Remove applied points')
    expect(promotionsAPI.applyCoupon).not.toHaveBeenCalled()
  })
})

describe('BookingReview — guards and resilience', () => {
  test('missing booking state redirects to the start of the flow', async () => {
    renderReview({})
    expect(await screen.findByText('booking-type-start')).toBeInTheDocument()
  })

  test('a failing wallet/coupon fetch does not blank the page', async () => {
    walletAPI.getWallet.mockRejectedValue(new Error('403'))
    promotionsAPI.getActiveCoupons.mockRejectedValue(new Error('403'))
    settingsAPI.getSettings.mockRejectedValue(new Error('500'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <MemoryRouter initialEntries={[{ pathname: '/r', state: hallCase().state }]}>
        <Routes><Route path="/r" element={<BookingReview />} /></Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(console.warn).toHaveBeenCalled())
    expect(within(screen.getByText('Bill Summary').parentElement).getByText('Total Amount')).toBeInTheDocument()
    expect(screen.getByText('No coupons available')).toBeInTheDocument()
  })
})
