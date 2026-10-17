/**
 * Waiter Sidebar — operations profile orderFlow.staffOrder:false hides
 * the "Menu Card" entry (its route is gated by RequireStaffOrder).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import Sidebar from '@/Components/Waiter/Sidebar'

function setAuth({ role = 'captain', staffOrder } = {}) {
  auth = {
    user: { role, name: 'Ravi' },
    isCaptain: role === 'captain',
    hasPermission: () => false,
    logout: vi.fn(),
    operations: staffOrder === undefined ? null : { orderFlow: { staffOrder } },
  }
}

const renderSidebar = () => render(
  <MemoryRouter initialEntries={['/waiter/home']}>
    <Sidebar isOpen onClose={() => {}} />
  </MemoryRouter>,
)

beforeEach(() => { setAuth() })

describe('Waiter Sidebar — staff ordering', () => {
  test('default profile: captain sees Menu Card', () => {
    renderSidebar()
    expect(screen.getByText('Menu Card')).toBeInTheDocument()
  })

  test('staffOrder:false: Menu Card hidden, other entries stay', () => {
    setAuth({ staffOrder: false })
    renderSidebar()
    expect(screen.queryByText('Menu Card')).not.toBeInTheDocument()
    expect(screen.getByText('Active Orders')).toBeInTheDocument()
  })
})
