/**
 * Waiter Sidebar — token-number mode (operations tables.useTables:false):
 * the home entry reads "Tokens" instead of "Tables".
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import Sidebar from '@/Components/Waiter/Sidebar'

function setAuth({ useTables } = {}) {
  auth = {
    user: { role: 'waiter', name: 'Ravi' },
    isCaptain: false,
    hasPermission: () => false,
    logout: vi.fn(),
    operations: useTables === undefined ? null : { tables: { useTables } },
  }
}

const renderSidebar = () => render(
  <MemoryRouter initialEntries={['/waiter/home']}>
    <Sidebar isOpen onClose={() => {}} />
  </MemoryRouter>,
)

beforeEach(() => { setAuth() })

describe('Waiter Sidebar — token-number mode', () => {
  test('default profile: "Tables"', () => {
    renderSidebar()
    expect(screen.getByText('Tables')).toBeInTheDocument()
    expect(screen.queryByText('Tokens')).not.toBeInTheDocument()
  })

  test('useTables:false: "Tokens" replaces "Tables"', () => {
    setAuth({ useTables: false })
    renderSidebar()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
    expect(screen.queryByText('Tables')).not.toBeInTheDocument()
    expect(screen.getByText('Active Orders')).toBeInTheDocument()
  })
})
