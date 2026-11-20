import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
const handlers = {}
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/hooks/useSocketEvent', () => ({
  default: (name, fn) => { handlers[name] = fn },
  useSocketConnected: () => true, useSocketReconnect: () => {},
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
  captainAPI: { getFloorOverview: (...a) => getFloorOverview(...a), getWaiters: vi.fn(), assignWaiter: vi.fn(), escalate: vi.fn() },
  tableAPI: { moveTable: vi.fn() },
}))

import CaptainFloor from '@/Pages/Waiter/CaptainFloor'
import { resetServerClock } from '@/hooks/useServerClock'

const REAL = Date.parse('2026-11-19T10:00:00.000Z')
const MIN = 60000
const overview = (tables, extra = {}) => ({
  success: true, areas: [{ _id: 'a1', name: 'Main' }], workload: [], orders: [], delayedOrders: [], tables, ...extra,
})
const T1 = { _id: 't1', name: 'T1', area: 'a1', status: 'occupied', capacity: 4, sessionStartedAt: new Date(REAL - 42 * MIN).toISOString() }
const setAuth = (role) => { auth = { user: { _id: 'c1', role, name: 'Cap' }, operations: null, hasPermission: () => true } }
const go = () => render(<MemoryRouter><CaptainFloor /></MemoryRouter>)

beforeEach(() => {
  Object.keys(handlers).forEach(k => delete handlers[k])
  resetServerClock()
  getFloorOverview.mockReset()
})
afterEach(() => { vi.restoreAllMocks(); resetServerClock() })

describe('CaptainFloor table timer', () => {
  test('uses the server clock even with a skewed device clock', async () => {
    const realNow = Date.now.bind(Date)
    const skew = REAL + 3 * 3600000 - realNow()
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)
    getFloorOverview.mockResolvedValue({ data: overview([T1], { serverTime: new Date(REAL).toISOString(), tableTimer: { amberMinutes: 60, redMinutes: 90 } }) })
    setAuth('captain')
    go()
    expect(await screen.findByRole('timer', { name: 'Occupied 42 minutes' })).toBeInTheDocument()
  })

  test('hidden for a waiter even if the payload carried it', async () => {
    getFloorOverview.mockResolvedValue({ data: overview([T1], { serverTime: new Date().toISOString() }) })
    setAuth('waiter')
    go()
    await screen.findByText('Floor Overview')
    expect(screen.queryByTestId('table-timer')).not.toBeInTheDocument()
  })

  test('no sessionStartedAt renders nothing', async () => {
    getFloorOverview.mockResolvedValue({ data: overview([{ ...T1, sessionStartedAt: null }], { serverTime: new Date().toISOString() }) })
    setAuth('captain')
    go()
    await screen.findByText('Floor Overview')
    expect(screen.queryByTestId('table-timer')).not.toBeInTheDocument()
  })

  test('socket start shows the timer, stop clears it', async () => {
    getFloorOverview.mockResolvedValue({ data: overview([{ ...T1, sessionStartedAt: null }], { serverTime: new Date().toISOString() }) })
    setAuth('captain')
    go()
    await screen.findByText('Floor Overview')
    expect(screen.queryByTestId('table-timer')).not.toBeInTheDocument()
    act(() => { handlers['table:timer-started']({ tableId: 't1', startedAt: new Date(Date.now() - 5 * MIN).toISOString() }) })
    expect(await screen.findByTestId('table-timer')).toHaveTextContent('5 min')
    act(() => { handlers['table:timer-stopped']({ tableId: 't1', endedAt: new Date().toISOString() }) })
    expect(screen.queryByTestId('table-timer')).not.toBeInTheDocument()
  })
})
