/**
 * Loggedin/BillReceipt — printable receipt built from an Invoice doc.
 * Invoice shape = Backend/models/invoice.js as written by
 * invoiceController.generateInvoice (subtotal / tax / discount / total;
 * no gst / serviceCharge / percentage fields).
 */
import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { billFromOrder, computeBill, toTaxConfig } from '@/utils/billing'

vi.mock('@/utils/api', () => {
  const api = { get: vi.fn() }
  return { default: api, settingsAPI: { getSettings: vi.fn(() => Promise.resolve({ data: { general: { cafeName: 'Cafe Uno' } } })) } }
})
import api from '@/utils/api'
import BillReceipt from '@/Pages/Loggedin/BillReceipt'

const TAXES = toTaxConfig({ gst: { enabled: true, value: 5 }, serviceCharge: { enabled: true, value: 10 } })
const ORDER = {
  orderId: 'ORD-1', type: 'dine-in',
  items: [{ name: 'Paneer Tikka', price: 229.5, quantity: 2 }, { name: 'Masala Chai', price: 35.25, quantity: 3 }],
}
const placed = computeBill({ subtotal: 564.75, taxConfig: TAXES, orderType: 'dine-in' })
const STORED_ORDER = { ...ORDER, total: placed.total, gst: placed.gst, gstPercentage: 5, serviceCharge: placed.serviceCharge, serviceChargePercentage: 10 }
// Note (2026-10): this fixture used to mirror the OLD generateInvoice
// (subtotal = order.total, tax = 0, no breakdown), which could never carry
// a GST row. It now mirrors the fixed backend: subtotal = line items,
// tax = GST + service + charges, plus the itemised stamped fields.
const INVOICE = {
  _id: 'inv1', invoiceNumber: 'INV-1-ORD-1', order: { orderId: 'ORD-1' },
  items: ORDER.items.map((i) => ({ ...i, total: i.price * i.quantity })),
  subtotal: 564.75, tax: Math.round((placed.gst + placed.serviceCharge) * 100) / 100, discount: 0, total: placed.total,
  gst: placed.gst, gstPercentage: 5, serviceCharge: placed.serviceCharge, serviceChargePercentage: 10,
  paymentStatus: 'paid', paymentMethod: 'online',
}

function renderReceipt({ state, path = '/customer/bill-receipt/inv1' } = {}) {
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/customer/bill-receipt/:orderId" element={<BillReceipt />} />
        <Route path="/customer/bill-receipt" element={<BillReceipt />} />
      </Routes>
    </MemoryRouter>,
  )
}
const rowValue = (re) => screen.getByText(re).parentElement.lastElementChild.textContent

describe('BillReceipt', () => {
  test('receipt passed in router state renders its stored breakdown and total', async () => {
    renderReceipt({ path: '/customer/bill-receipt', state: { receipt: {
      orderId: 'ORD-1', tableNo: '7', items: ORDER.items, gst: placed.gst, gstPct: 5,
      serviceCharge: placed.serviceCharge, serviceChargePct: 10, total: placed.total, paymentMethod: 'online',
    } } })
    expect(await screen.findByText('Order ID: ORD-1')).toBeInTheDocument()
    expect(rowValue(/^GST \(5%\)/)).toBe(`₹${placed.gst.toFixed(2)}`)
    expect(rowValue(/^Service Charge \(10%\)/)).toBe(`₹${placed.serviceCharge.toFixed(2)}`)
    expect(screen.getAllByText(`₹${placed.total.toFixed(2)}`).length).toBeGreaterThan(0)
  })

  test('unknown receipt shows "No receipt found"', async () => {
    api.get.mockRejectedValue(new Error('404'))
    renderReceipt({ path: '/customer/bill-receipt/nope' })
    expect(await screen.findByText('No receipt found')).toBeInTheDocument()
  })

  // Regression (fixed 2026-10): mapInvoice reads the invoice's own breakdown; no hard-coded 5%/10% fallbacks, rows only when present.
  test('a receipt fetched from /invoices shows the invoice\'s GST and service charge for a taxed order', async () => {
    api.get.mockResolvedValue({ data: { success: true, invoice: INVOICE } })
    renderReceipt()
    await screen.findByText('Order ID: ORD-1')
    const expected = billFromOrder(STORED_ORDER, TAXES)
    expect(screen.getAllByText(`₹${expected.total.toFixed(2)}`).length).toBeGreaterThan(0) // total itself is right
    expect(rowValue(/^GST/)).toBe(`₹${expected.gst.toFixed(2)}`)
    expect(rowValue(/^Service Charge \(10%\)/)).toBe(`₹${expected.serviceCharge.toFixed(2)}`)
    expect(screen.queryByText(/Taxes & charges/)).not.toBeInTheDocument()
  })

  test('an invoice carrying only the combined tax shows one "Taxes & charges" row and no invented GST rate', async () => {
    const { gst: _g, gstPercentage: _gp, serviceCharge: _s, serviceChargePercentage: _sp, ...combinedOnly } = INVOICE
    api.get.mockResolvedValue({ data: { success: true, invoice: combinedOnly } })
    renderReceipt()
    await screen.findByText('Order ID: ORD-1')
    expect(screen.queryByText(/^GST/)).not.toBeInTheDocument()
    expect(rowValue(/^Taxes & charges/)).toBe(`₹${INVOICE.tax.toFixed(2)}`)
  })
})
