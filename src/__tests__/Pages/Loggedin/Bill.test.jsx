/**
 * Loggedin/Bill — list of the customer's bills. Amounts come straight
 * from the server (invoice.total for accounts, order.total for guests).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const auth = { user: null, isLoggedIn: false, isGuest: true, exitGuestMode: vi.fn() }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/utils/tenant', () => ({ activeRestaurantPath: () => '/cafe-uno' }))
vi.mock('@/Components/Loggedin/BottomNav', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/VoiceSearchButton', () => ({ default: () => null }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/utils/dineInSession', () => ({ markDineInBillSettled: vi.fn() }))
vi.mock('@/hooks/useCustomerSession', () => ({ default: () => ({ showTableChrome: true }) }))
vi.mock('@/utils/customerOrderIds', () => ({
  getCustomerOrderSession: () => 'sess',
  readRecoveryOrderIds: vi.fn(() => ['ORD-A', 'ORD-B', 'ORD-GONE']),
  forgetOrderIds: vi.fn(),
}))
vi.mock('@/utils/api', () => ({ default: { get: vi.fn() } }))

import api from '@/utils/api'
import { forgetOrderIds } from '@/utils/customerOrderIds'
import Bill from '@/Pages/Loggedin/Bill'

function renderBill() {
  render(
    <MemoryRouter initialEntries={['/customer/bill']}>
      <Routes>
        <Route path="/customer/bill" element={<Bill />} />
        <Route path="/bill/:id" element={<div>bill-detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => { Object.assign(auth, { user: null, isLoggedIn: false, isGuest: true }) })

describe('Bill list', () => {
  test('guest: each remembered order is fetched from the server and shown with its exact total; 404s are forgotten', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('ORD-A')) return Promise.resolve({ data: { success: true, order: { _id: 'a', orderId: 'ORD-A', total: 719.54, paymentStatus: 'Pending', status: 'served', items: [{}, {}], createdAt: '2026-10-03T12:00:00Z' } } })
      if (url.includes('ORD-B')) return Promise.resolve({ data: { success: true, order: { _id: 'b', orderId: 'ORD-B', total: 100.05, paymentStatus: 'Paid', status: 'served', items: [{}], createdAt: '2026-10-03T13:00:00Z' } } })
      return Promise.reject({ response: { status: 404 } })
    })
    renderBill()
    expect(await screen.findByText('₹719.54')).toBeInTheDocument()
    expect(screen.getByText('₹100.05')).toBeInTheDocument()
    expect(forgetOrderIds).toHaveBeenCalledWith('sess', ['ORD-GONE'])
  })

  test('cancelled orders are hidden from the bill list', async () => {
    api.get.mockImplementation((url) => (url.includes('ORD-A')
      ? Promise.resolve({ data: { success: true, order: { _id: 'a', orderId: 'ORD-A', total: 50, status: 'cancelled', items: [] } } })
      : Promise.reject({ response: { status: 404 } })))
    renderBill()
    await waitFor(() => expect(forgetOrderIds).toHaveBeenCalled())
    expect(screen.queryByText('₹50.00')).not.toBeInTheDocument()
  })

  test('logged-in: invoices are listed with their totals', async () => {
    Object.assign(auth, { user: { _id: 'u' }, isLoggedIn: true, isGuest: false })
    api.get.mockResolvedValue({ data: { success: true, invoices: [{ _id: 'inv1', total: 1249.5, paymentStatus: 'paid', items: [{}], createdAt: '2026-10-03T12:00:00Z' }] } })
    renderBill()
    expect(await screen.findByText('₹1249.50')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/invoices/my-invoices')
  })
})
