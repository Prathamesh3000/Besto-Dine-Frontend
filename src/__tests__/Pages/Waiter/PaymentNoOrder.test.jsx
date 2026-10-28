/**
 * Waiter PaymentOption / QRPayment - no-order empty state, amount coercion.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('@/Context/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Ravi' } }) }))
vi.mock('@/utils/api', () => ({
  default: { patch: vi.fn() },
  razorpayAPI: { createOrder: vi.fn(), verifyPayment: vi.fn() },
}))
vi.mock('@/hooks/useBlockBackNav', () => ({ default: () => {} }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})

import PaymentOption from '@/Pages/Waiter/PaymentOption'
import QRPayment from '@/Pages/Waiter/QRPayment'

const renderAt = (Comp, state) => render(
  <MemoryRouter initialEntries={[{ pathname: '/p', state }]}>
    <Routes>
      <Route path="/p" element={<Comp />} />
      <Route path="/waiter/home" element={<div>home-probe</div>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => vi.clearAllMocks())

describe.each([['PaymentOption', PaymentOption], ['QRPayment', QRPayment]])('%s without an order', (_n, Comp) => {
  test('shows empty state and back button navigates home', async () => {
    renderAt(Comp, undefined)
    expect(screen.getByText('No order selected for payment.')).toBeInTheDocument()
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to tables' }))
    expect(screen.getByText('home-probe')).toBeInTheDocument()
  })

  test('state without orderId still shows empty state', () => {
    renderAt(Comp, { tableName: 'T1', amount: 500 })
    expect(screen.getByText('No order selected for payment.')).toBeInTheDocument()
  })
})

describe('PaymentOption with an order', () => {
  test('string amount is coerced to a number and shown with 2 decimals', () => {
    renderAt(PaymentOption, { orderId: 'o1', tableName: 'T4', amount: '250.5' })
    expect(screen.getByText('₹250.50')).toBeInTheDocument()
    expect(screen.getByText('Payment Option')).toBeInTheDocument()
  })

  test('non-numeric amount falls back to 0.00', () => {
    renderAt(PaymentOption, { orderId: 'o1', amount: 'abc' })
    expect(screen.getByText('₹0.00')).toBeInTheDocument()
  })
})

describe('QRPayment with an order', () => {
  test('success state renders confirmation and amount', () => {
    renderAt(QRPayment, { orderId: 'o1', orderDisplayId: 'ORD-7', tableName: 'T4', amount: 99, paymentSuccess: true, method: 'cash' })
    expect(screen.getByText('Payment Successful!')).toBeInTheDocument()
    expect(screen.getByText('Cash payment recorded')).toBeInTheDocument()
    expect(screen.getByText('₹99.00')).toBeInTheDocument()
  })

  test('awaiting state when paymentSuccess missing', () => {
    renderAt(QRPayment, { orderId: 'o1', amount: 10 })
    expect(screen.getByText('Awaiting Payment')).toBeInTheDocument()
  })
})
