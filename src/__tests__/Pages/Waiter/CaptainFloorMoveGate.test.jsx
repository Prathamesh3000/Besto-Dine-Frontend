import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {}, useSocketConnected: () => true, useSocketReconnect: () => {} }))
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
  captainAPI: { getFloorOverview: (...a) => getFloorOverview(...a), getWaiters: vi.fn(), assignWaiter: vi.fn(), escalate: vi.fn() },
  tableAPI: { moveTable: vi.fn() },
}))

import CaptainFloor from '@/Pages/Waiter/CaptainFloor'

const overview = { success: true, areas: [{ _id: 'a1', name: 'Main' }], workload: [], orders: [], delayedOrders: [], tables: [{ _id: 't1', name: 'T1', area: 'a1', status: 'occupied', capacity: 4 }] }
const setAuth = (role, tables) => { auth = { user: { _id: 'c1', role, name: 'Cap' }, operations: tables ? { tables } : null, hasPermission: () => true } }
const go = () => render(<MemoryRouter><CaptainFloor /></MemoryRouter>)

beforeEach(() => { getFloorOverview.mockReset().mockResolvedValue({ data: overview }) })

describe('CaptainFloor — Move table button', () => {
  test('shown for captain', async () => {
    setAuth('captain')
    go()
    expect(await screen.findByRole('button', { name: /move table/i })).toBeInTheDocument()
  })
  test('hidden for waiter', async () => {
    setAuth('waiter')
    go()
    await screen.findByText('Floor Overview')
    expect(screen.queryByRole('button', { name: /move table/i })).not.toBeInTheDocument()
  })
  test('hidden when tables are disabled', async () => {
    setAuth('captain', { useTables: false })
    go()
    await screen.findByText('Floor Overview')
    expect(screen.queryByRole('button', { name: /move table/i })).not.toBeInTheDocument()
  })
})
