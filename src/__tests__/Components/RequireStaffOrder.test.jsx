import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import RequireStaffOrder from '@/Components/RequireStaffOrder'

function setAuth({ role = 'waiter', staffOrder } = {}) {
  auth = {
    user: { role },
    operations: staffOrder === undefined ? null : { orderFlow: { staffOrder } },
  }
}

const renderGate = () => render(
  <MemoryRouter>
    <RequireStaffOrder><div>MENU</div></RequireStaffOrder>
  </MemoryRouter>,
)

beforeEach(() => { setAuth() })

describe('RequireStaffOrder', () => {
  test('no profile (today\'s behaviour) → page renders', () => {
    renderGate()
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })

  test('staffOrder:true → page renders', () => {
    setAuth({ staffOrder: true })
    renderGate()
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })

  test.each(['waiter', 'captain'])('staffOrder:false → %s sees "Order entry is off" with a way back', (role) => {
    setAuth({ role, staffOrder: false })
    renderGate()
    expect(screen.queryByText('MENU')).not.toBeInTheDocument()
    expect(screen.getByTestId('staff-order-off')).toHaveTextContent('Order entry is off')
    expect(screen.getByRole('link', { name: /Back to tables/ })).toHaveAttribute('href', '/waiter/home')
  })

  test.each(['admin', 'manager'])('staffOrder:false → %s passes through (admin POS still allowed)', (role) => {
    setAuth({ role, staffOrder: false })
    renderGate()
    expect(screen.getByText('MENU')).toBeInTheDocument()
  })
})
