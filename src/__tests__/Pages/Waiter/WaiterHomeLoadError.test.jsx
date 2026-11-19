/**
 * WaiterHomePage - a failed load (429) shows a visible error with Retry
 * instead of an empty page; Retry reloads and clears it.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', role: 'waiter', name: 'Ravi' }, isCaptain: false, hasPermission: () => true, operations: null }),
}))
vi.mock('@/Context/CartContext', () => ({ useCart: () => ({ setActiveTable: vi.fn() }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/utils/socket', () => ({ getSocket: () => ({ on: vi.fn(), off: vi.fn() }), joinStaffRoom: vi.fn() }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/Components/Waiter/Sidebar', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/BottomNav', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/StaffProfileMenu', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/NotificationBell', () => ({ default: () => null }))
vi.mock('@/Components/Common/InstallAppBanner', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/TokenBoard', () => ({ default: () => null }))

const getAreas = vi.fn()
vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { tables: [] } })) },
  settingsAPI: { getSettings: vi.fn(() => Promise.resolve({ data: { general: { cafeName: 'Cafe' } } })) },
  waiterAPI: {
    getAreas: (...a) => getAreas(...a),
    getTablesByArea: vi.fn(() => Promise.resolve({ data: { success: true, tables: [{ _id: 't1', name: 'T1', capacity: 4, status: 'free', mergedWith: [] }] } })),
    getLiveOrders: vi.fn(() => Promise.resolve({ data: { success: true, orders: [] } })),
  },
}))

import WaiterHomePage from '@/Pages/Waiter/WaiterHomePage'

beforeEach(() => {
  getAreas.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('WaiterHomePage load failure', () => {
  test('429 shows an alert with Retry; Retry loads the tables', async () => {
    getAreas
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValue({ data: { success: true, areas: [{ _id: 'a1', name: 'Main' }] } })
    render(<MemoryRouter><WaiterHomePage /></MemoryRouter>)
    const alert = await screen.findByTestId('waiter-load-error')
    expect(alert).toHaveTextContent('Too many requests')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('T1')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('waiter-load-error')).not.toBeInTheDocument())
  })
})
