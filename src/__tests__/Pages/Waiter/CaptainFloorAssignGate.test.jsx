/**
 * CaptainFloor - Assign/Change waiter button and "N unassigned" chip are
 * hidden when operations.tables.assignWaiters === false.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/hooks/useSocketEvent', () => ({
  default: () => {},
  useSocketConnected: () => true,
  useSocketReconnect: () => {},
}))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/Components/Waiter/Sidebar', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/BottomNav', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/StaffProfileMenu', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/NotificationBell', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/TokenBoard', () => ({ default: () => null }))

const getFloorOverview = vi.fn()
vi.mock('@/utils/api', () => ({
  captainAPI: {
    getFloorOverview: (...a) => getFloorOverview(...a),
    getWaiters: vi.fn(() => Promise.resolve({ data: { waiters: [] } })),
    assignWaiter: vi.fn(), escalate: vi.fn(),
  },
}))

import CaptainFloor from '@/Pages/Waiter/CaptainFloor'

const overview = {
  success: true,
  areas: [{ _id: 'a1', name: 'Main' }],
  workload: [],
  orders: [],
  delayedOrders: [],
  tables: [
    { _id: 't1', name: 'T1', area: 'a1', status: 'free', capacity: 4, assignedWaiter: null },
    { _id: 't2', name: 'T2', area: 'a1', status: 'free', capacity: 4, assignedWaiter: { _id: 'w1', name: 'priya' } },
  ],
}

const setOps = (tables) => {
  auth = { user: { _id: 'c1', role: 'captain', name: 'Cap' }, operations: tables === undefined ? null : { tables }, isCaptain: true, hasPermission: () => true }
}
const renderPage = () => render(<MemoryRouter><CaptainFloor /></MemoryRouter>)

beforeEach(() => { getFloorOverview.mockReset().mockResolvedValue({ data: overview }) })

describe('CaptainFloor assignWaiters gate', () => {
  test('default (no operations): assign controls and unassigned chip shown', async () => {
    setOps()
    renderPage()
    expect(await screen.findByLabelText('Assign waiter to T1')).toBeInTheDocument()
    expect(screen.getByLabelText('Change waiter for T2')).toBeInTheDocument()
    expect(screen.getByText('1 unassigned')).toBeInTheDocument()
  })

  test('assignWaiters:true keeps controls', async () => {
    setOps({ assignWaiters: true })
    renderPage()
    expect(await screen.findByLabelText('Assign waiter to T1')).toBeInTheDocument()
  })

  test('assignWaiters:false hides buttons and chip but still lists tables', async () => {
    setOps({ assignWaiters: false })
    renderPage()
    expect(await screen.findByText('T1')).toBeInTheDocument()
    expect(screen.getByText('T2')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Assign waiter to/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Change waiter for/)).not.toBeInTheDocument()
    expect(screen.queryByText(/unassigned/)).not.toBeInTheDocument()
  })
})
