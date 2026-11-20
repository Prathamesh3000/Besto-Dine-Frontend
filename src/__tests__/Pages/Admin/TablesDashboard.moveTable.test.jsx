import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/hooks/useOperations', async () => {
  const { DEFAULT_OPERATIONS } = await import('@/utils/operations')
  return { default: () => DEFAULT_OPERATIONS, useOperations: () => DEFAULT_OPERATIONS }
})
vi.mock('@/Pages/Admin/components/AddReservationModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddAreaModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddTableModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/BulkAddTablesModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/MergeTables', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/QRManagementModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/LateArrivalBanner', () => ({ default: () => null }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api, tableAPI: { moveTable: vi.fn() } }
})
vi.mock('@/hooks/queries/useAdminBootstrap', () => ({
  useAdminBootstrap: () => ({
    data: {
      tables: [
        { _id: 't1', name: 'T7', capacity: 4, status: 'occupied', area: { _id: 'a1', name: 'Main', isActive: true } },
        { _id: 't2', name: 'T8', capacity: 4, status: 'free', area: { _id: 'a1', name: 'Main', isActive: true } },
      ],
      areas: [{ _id: 'a1', name: 'Main', isActive: true }], reservations: [], staff: [], settings: { taxes: {} },
    },
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
}))

import api from '@/utils/api'
import AuthContext from '@/Context/AuthContext'
import TablesDashboard from '@/Pages/Admin/TablesDashboard'

const ui = (role) => (
  <AuthContext.Provider value={{ user: { role } }}>
    <MemoryRouter><TablesDashboard /></MemoryRouter>
  </AuthContext.Provider>
)

beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: { success: true, orders: [] } })
})

describe('TablesDashboard — Move table', () => {
  test.each(['admin', 'manager', 'captain'])('button shown for %s and opens the modal', async (role) => {
    const user = userEvent.setup()
    render(ui(role))
    await user.click(screen.getByRole('button', { name: /^move table$/i }))
    expect(screen.getByRole('dialog', { name: /choose the table to move/i })).toBeInTheDocument()
  })

  test('hidden for waiter', () => {
    render(ui('waiter'))
    expect(screen.queryByRole('button', { name: /move table/i })).not.toBeInTheDocument()
  })
})
