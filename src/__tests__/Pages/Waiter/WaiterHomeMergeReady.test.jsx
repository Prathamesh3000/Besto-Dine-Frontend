/**
 * WaiterHomePage - shared Ready counter, mergeTables operations gate,
 * merge confirmation with naturally sorted table names.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/Context/CartContext', () => ({ useCart: () => ({ setActiveTable: vi.fn() }) }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
vi.mock('@/utils/socket', () => ({
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
  joinStaffRoom: vi.fn(),
}))
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

const liveOrders = [
  { _id: 'o1', status: 'ready', table: { _id: 't1' } },
  { _id: 'o2', status: 'ready' }, // takeaway ready: counted in Ready
  { _id: 'o3', status: 'new', table: { _id: 't2' } },
]
const tables = [
  { _id: 't1', name: 'T10', capacity: 4, status: 'free', mergedWith: [] },
  { _id: 't2', name: 'T2', capacity: 2, status: 'free', mergedWith: [] },
  { _id: 't3', name: 'T3', capacity: 6, status: 'free', mergedWith: [] },
]
const mergeTables = vi.fn()
vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { tables: [] } })) },
  settingsAPI: { getSettings: vi.fn(() => Promise.resolve({ data: { general: { cafeName: 'Cafe' } } })) },
  waiterAPI: {
    getAreas: vi.fn(() => Promise.resolve({ data: { success: true, areas: [{ _id: 'a1', name: 'Main' }] } })),
    getTablesByArea: vi.fn(() => Promise.resolve({ data: { success: true, tables } })),
    getLiveOrders: vi.fn(() => Promise.resolve({ data: { success: true, orders: liveOrders } })),
    mergeTables: (...a) => mergeTables(...a),
  },
}))

import WaiterHomePage from '@/Pages/Waiter/WaiterHomePage'

function setAuth(tablesOps) {
  auth = {
    user: { _id: 'u1', role: 'waiter', name: 'Ravi' },
    isCaptain: false,
    hasPermission: () => true,
    operations: tablesOps === undefined ? null : { tables: tablesOps },
  }
}
const renderPage = () => render(<MemoryRouter><WaiterHomePage /></MemoryRouter>)

beforeEach(() => {
  mergeTables.mockReset().mockResolvedValue({ data: { success: true }, status: 200 })
  setAuth()
})

describe('WaiterHomePage Ready card', () => {
  test('counts dine-in and takeaway ready orders (same helper as BottomNav)', async () => {
    renderPage()
    expect(await screen.findByText('Ready')).toBeInTheDocument()
    await waitFor(() => {
      const card = screen.getByText('Ready').previousElementSibling
      expect(card.textContent).toBe('02')
    })
  })
})

describe('WaiterHomePage merge gate', () => {
  test('default: Merge Tables button visible', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: 'Merge Tables' })).toBeInTheDocument()
  })

  test('mergeTables:true: button visible', async () => {
    setAuth({ mergeTables: true })
    renderPage()
    expect(await screen.findByRole('button', { name: 'Merge Tables' })).toBeInTheDocument()
  })

  test('mergeTables:false: button hidden but grid still renders', async () => {
    setAuth({ mergeTables: false })
    renderPage()
    expect(await screen.findByText('T10')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Merge Tables/ })).not.toBeInTheDocument()
  })
})

describe('WaiterHomePage merge confirmation', () => {
  test('lists selected table names in natural order and merges the ids', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Merge Tables' }))
    // select T10 first, then T2: natural sort must put T2 before T10
    await userEvent.click(screen.getByText('T10'))
    await userEvent.click(screen.getByText('T2'))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm Merge' }))
    expect(screen.getByText('Confirm Table Merge')).toBeInTheDocument()
    expect(screen.getByText('2 Tables selected')).toBeInTheDocument()
    expect(screen.getByText('Combine T2 & T10 Table')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Merge Now' }))
    await waitFor(() => expect(mergeTables).toHaveBeenCalledWith(['t1', 't2']))
  })
})
