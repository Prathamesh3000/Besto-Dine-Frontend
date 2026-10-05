/**
 * Loggedin/BillDetail — the customer's bill for a PLACED order.
 *
 * Oracle: utils/billing.billFromOrder — a placed order's bill is what
 * the server stored (order.total is what is owed); re-deriving it from
 * today's tax settings rewrites history. The order shape used here is
 * exactly what GET /orders/:id/detail returns
 * (Backend/services/orderFormatters.formatOrderDetail).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { billFromOrder, computeBill, toTaxConfig } from '@/utils/billing'

vi.mock('@/Context/MenuContext', () => ({ useMenu: () => ({ menuItems: [] }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/utils/socket', () => ({ joinRoom: vi.fn() }))
vi.mock('@/utils/tenant', () => ({ getActiveTenant: () => ({ name: 'Cafe Uno', branding: {} }) }))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn() }
  return { default: api, settingsAPI: { getSettings: vi.fn() } }
})

import api, { settingsAPI } from '@/utils/api'
import BillDetail from '@/Pages/Loggedin/BillDetail'

const TAXES_AT_ORDER = { gst: { enabled: true, value: 5 }, serviceCharge: { enabled: true, value: 10 }, additionalCharges: [{ name: 'Packaging', type: 'Fixed', value: 15 }] }
const ITEMS = [
  { name: 'Paneer Tikka', price: 229.5, quantity: 2, selectedSizes: [], selectedToppings: [], addedAt: '2026-10-03T12:00:00.000Z' },
  { name: 'Masala Chai', price: 35.25, quantity: 3, selectedSizes: [], selectedToppings: [], addedAt: '2026-10-03T12:00:10.000Z' },
]
const SUBTOTAL = 564.75
// The total the server stamped when the order was placed (5% / 10% / ₹15).
const PLACED = computeBill({ subtotal: SUBTOTAL, taxConfig: toTaxConfig(TAXES_AT_ORDER), orderType: 'dine-in' })

const detailOrder = (over = {}) => ({
  _id: 'mongo1', orderId: 'ORD-20261003-0042', id: 'ORD-20261003-0042', type: 'dine-in',
  status: 'served', paymentStatus: 'Pending', paymentMethod: 'cash',
  items: ITEMS, total: PLACED.total, tipAmount: 0, couponCode: '', couponDiscount: 0, pointsRedeemed: 0,
  createdAt: '2026-10-03T12:00:00.000Z', ...over,
})

let landed = null
function Probe() { landed = useLocation().state; return <div>payment-page</div> }

function renderBill(order, { taxesNow = TAXES_AT_ORDER } = {}) {
  settingsAPI.getSettings.mockResolvedValue({ data: { taxes: taxesNow, general: { cafeName: 'Cafe Uno' } } })
  api.get.mockImplementation((url) => (url.startsWith('/orders/')
    ? Promise.resolve({ data: { success: true, order } })
    : Promise.reject({ response: { status: 404 } })))
  render(
    <MemoryRouter initialEntries={['/customer/bill/ORD-20261003-0042']}>
      <Routes>
        <Route path="/customer/bill/:orderId" element={<BillDetail />} />
        <Route path="/customer/payment" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}
const rowValue = (label) => screen.getByText(label instanceof RegExp ? label : new RegExp(`^${label}`)).parentElement.lastElementChild.textContent
const money = (n) => `₹${n.toFixed(2)}`
const ui = (order, taxes) => billFromOrder({ ...order }, toTaxConfig(taxes))

beforeEach(() => { landed = null })

describe('BillDetail — breakdown', () => {
  test('settings unchanged since the order: every row equals billFromOrder and the total is the stored total', async () => {
    const order = detailOrder()
    renderBill(order)
    await screen.findByText('Total Payment')
    await screen.findByText(/^GST \(5%\)/)
    const expected = ui(order, TAXES_AT_ORDER)
    expect(rowValue('Subtotal')).toBe(money(expected.subtotal))
    expect(rowValue(/^GST \(5%\)/)).toBe(money(expected.gst))
    expect(rowValue(/^Service Charge \(10%\)/)).toBe(money(expected.serviceCharge))
    expect(rowValue('Packaging')).toBe(money(15))
    expect(rowValue('Total Payment')).toBe(money(order.total))
  })

  test('line rows show qty × unit and the exact line total', async () => {
    renderBill(detailOrder())
    expect(await screen.findByText('× ₹35.25')).toBeInTheDocument()
    expect(screen.getByText('₹105.75')).toBeInTheDocument()
    expect(screen.getByText('₹459.00')).toBeInTheDocument()
  })

  test('takeaway bill shows no service charge row', async () => {
    const order = detailOrder({ type: 'takeaway', total: computeBill({ subtotal: SUBTOTAL, taxConfig: toTaxConfig(TAXES_AT_ORDER), orderType: 'takeaway' }).total })
    renderBill(order)
    await screen.findByText(/^GST \(5%\)/)
    expect(screen.queryByText(/Service Charge/)).not.toBeInTheDocument()
    expect(rowValue('Total Payment')).toBe(money(order.total))
  })

  test('items appended later are grouped under "Added later"', async () => {
    const order = detailOrder({ items: [...ITEMS, { name: 'Butter Naan', price: 45, quantity: 2, addedAt: '2026-10-03T12:30:00.000Z' }] })
    renderBill(order)
    expect(await screen.findByText(/Added later · 1/)).toBeInTheDocument()
    expect(screen.getByText(/Original order · 2/)).toBeInTheDocument()
  })

  // Regression (fixed 2026-10): BillDetail always shows and pays the stored order total (billFromOrder().total), never a re-taxed one.
  test('after an admin changes GST, an unpaid bill still shows (and asks to pay) the order total', async () => {
    const order = detailOrder()
    const taxesNow = { ...TAXES_AT_ORDER, gst: { enabled: true, value: 18 } }
    const user = renderBill(order, { taxesNow })
    await screen.findByText(/^GST \(18%\)/)
    expect(ui(order, taxesNow).total).toBe(order.total) // oracle: stored total wins
    await user.click(screen.getByRole('button', { name: /Pay Bill/ }))
    expect(landed.total).toBe(order.total)
  })

  // Regression (fixed 2026-10): coupon / points / tip / delivery rows are listed so the bill rows add up to the total.
  test('coupon discount has its own row, so the rows add up', async () => {
    const total = computeBill({ subtotal: SUBTOTAL, taxConfig: toTaxConfig(TAXES_AT_ORDER), orderType: 'dine-in', couponDiscount: 50 }).total
    const order = detailOrder({ couponCode: 'FLAT50', couponDiscount: 50, total })
    renderBill(order)
    await screen.findByText(/^GST \(5%\)/)
    expect(rowValue('Total Payment')).toBe(money(total))
    expect(screen.getByText(/coupon|discount/i)).toBeInTheDocument()
  })

  test('manual (staff) discount is never subtracted from the bill total a second time', async () => {
    const order = detailOrder({ manualDiscount: 100, paymentStatus: 'Paid' })
    renderBill(order)
    await screen.findByText(/^GST \(5%\)/)
    const expected = ui(order, TAXES_AT_ORDER)
    expect(expected.manualDiscount).toBe(100)
    expect(rowValue('Total Payment')).toBe(money(expected.total)) // = order.total, not −100 again
    expect(screen.getByRole('button', { name: /Paid — Back to Orders/ })).toBeInTheDocument()
  })

  // Regression (fixed 2026-10): a staff manual discount is shown below the total (needs formatOrderDetail to send manualDiscount).
  test('a staff manual discount on the order is shown to the customer', async () => {
    const order = detailOrder({ manualDiscount: 100, paymentStatus: 'Paid' })
    renderBill(order)
    await screen.findByText(/^GST \(5%\)/)
    expect(screen.getByText('-₹100.00')).toBeInTheDocument()
  })
})

describe('BillDetail — pay CTA', () => {
  test('unpaid bill hands the stored total and order id to the payment page', async () => {
    const order = detailOrder()
    const user = renderBill(order)
    await screen.findByText(/^GST \(5%\)/)
    await user.click(screen.getByRole('button', { name: /Pay Bill/ }))
    expect(landed).toMatchObject({ orderId: 'ORD-20261003-0042', total: order.total })
  })

  test('unknown bill shows "Bill not found"', async () => {
    settingsAPI.getSettings.mockResolvedValue({ data: {} })
    api.get.mockRejectedValue({ response: { status: 404 } })
    render(
      <MemoryRouter initialEntries={['/b/x']}><Routes><Route path="/b/:orderId" element={<BillDetail />} /></Routes></MemoryRouter>,
    )
    expect(await screen.findByText('Bill not found')).toBeInTheDocument()
  })
})
