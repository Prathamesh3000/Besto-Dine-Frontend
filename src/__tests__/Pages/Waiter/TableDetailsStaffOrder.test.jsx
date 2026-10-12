/**
 * Waiter/TableDetails — operations profile orderFlow.staffOrder:false:
 * the "Menu" and "Browse Menu" order-entry buttons are hidden for a
 * waiter / captain (admins keep them).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth, CAPTAIN_ROLES: ['captain', 'admin', 'manager'] }))
vi.mock('@/Context/CartContext', () => ({
  useCart: () => ({ cartItems: {}, totalItems: 0, totalPrice: 0, clearCart: vi.fn(), setActiveTable: vi.fn(), updateQuantity: vi.fn() }),
}))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/Components/Waiter/ProductDetailsPopup', () => ({ default: () => null }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const ok = (data) => vi.fn(() => Promise.resolve({ data }))
  return {
    waiterAPI: {
      getAreas: ok({ areas: [] }),
      getActiveOrderByTable: ok({ success: true, order: null }),
      getRequests: ok({ requests: [] }),
      updateRequestStatus: ok({}),
      repeatItem: ok({}),
      appendItems: ok({}),
      createOrder: ok({}),
    },
    settingsAPI: { getSettings: ok({ taxes: {} }) },
  }
})

import TableDetails from '@/Pages/Waiter/TableDetails'
import { waiterAPI } from '@/utils/api'

function setAuth({ role = 'waiter', staffOrder } = {}) {
  auth = {
    user: { _id: 'u1', role, name: 'Ravi' },
    operations: staffOrder === undefined ? null : { orderFlow: { staffOrder } },
    hasPermission: () => true,
    isCaptain: role === 'captain',
  }
}

const renderPage = () => render(
  <MemoryRouter initialEntries={[{ pathname: '/waiter/details', state: { tableId: 't1', tableName: 'T4' } }]}>
    <Routes>
      <Route path="/waiter/details" element={<TableDetails />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => { setAuth() })

describe('TableDetails — staff ordering', () => {
  test('default profile: Menu + Browse Menu shown', async () => {
    renderPage()
    await waitFor(() => expect(waiterAPI.getActiveOrderByTable).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: 'Menu' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Browse Menu/ })).toBeInTheDocument()
  })

  test.each(['waiter', 'captain'])('staffOrder:false: %s sees no order-entry buttons', async (role) => {
    setAuth({ role, staffOrder: false })
    renderPage()
    await screen.findByText('No items yet')
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Browse Menu/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Guests order themselves here/)).toBeInTheDocument()
  })

  test('staffOrder:false: admin keeps them', async () => {
    setAuth({ role: 'admin', staffOrder: false })
    renderPage()
    expect(await screen.findByRole('button', { name: /Browse Menu/ })).toBeInTheDocument()
  })
})
