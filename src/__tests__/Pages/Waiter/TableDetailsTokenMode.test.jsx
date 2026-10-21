/**
 * Waiter/TableDetails — token-number mode (operations tables.useTables:false):
 * there is no table to open; the screen points the waiter at the Tokens list.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    },
    settingsAPI: { getSettings: ok({ taxes: {} }) },
  }
})

import TableDetails from '@/Pages/Waiter/TableDetails'

function Probe() { return <div>tokens-home</div> }

const renderPage = () => render(
  <MemoryRouter initialEntries={[{ pathname: '/waiter/details', state: { tableId: 't1', tableName: 'T4' } }]}>
    <Routes>
      <Route path="/waiter/details" element={<TableDetails />} />
      <Route path="/waiter/home" element={<Probe />} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  auth = {
    user: { _id: 'u1', role: 'waiter', name: 'Ravi' },
    operations: { tables: { useTables: false } },
    hasPermission: () => true,
    isCaptain: false,
  }
})

describe('TableDetails — token-number mode', () => {
  test('useTables:false: no table screen, "Go to Tokens" leads home', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByTestId('table-details-token-mode')).toBeInTheDocument()
    expect(screen.queryByText('T4')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to Tokens' }))
    expect(screen.getByText('tokens-home')).toBeInTheDocument()
  })
})
