/**
 * Waiter BottomNav — Orders badge uses the shared countReadyOrders helper
 * (dine-in + takeaway ready orders, narrowed by waiter scope).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))

const getLiveOrders = vi.fn()
const getRequests = vi.fn()
vi.mock('@/utils/api', () => ({
  waiterAPI: { getLiveOrders: (...a) => getLiveOrders(...a), getRequests: (...a) => getRequests(...a) },
}))

import BottomNav from '@/Components/Waiter/BottomNav'
import { countReadyOrders, getWaiterScope } from '@/utils/waiterScope'

const orders = [
  { _id: 'o1', status: 'ready', table: { _id: 't1' } },
  { _id: 'o2', status: 'ready' }, // takeaway, no table
  { _id: 'o3', status: 'preparing', table: { _id: 't1' } },
  { _id: 'o4', status: 'ready', table: { _id: 't9' } },
]

beforeEach(() => {
  getLiveOrders.mockReset().mockResolvedValue({ data: { success: true, orders } })
  getRequests.mockReset().mockResolvedValue({ data: { success: true, requests: [] } })
  auth = { user: { _id: 'u1', role: 'waiter' }, hasPermission: () => true, operations: null }
})

const renderNav = () => render(<MemoryRouter initialEntries={['/waiter/home']}><BottomNav /></MemoryRouter>)

describe('BottomNav Orders badge', () => {
  test('unscoped staffer: badge counts every ready order incl. takeaway', async () => {
    renderNav()
    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(countReadyOrders(orders, getWaiterScope(auth.user))).toBe(3)
  })

  test('no ready orders: no badge rendered', async () => {
    getLiveOrders.mockResolvedValue({ data: { success: true, orders: [{ status: 'new', table: { _id: 't1' } }] } })
    renderNav()
    await waitFor(() => expect(getLiveOrders).toHaveBeenCalled())
    expect(screen.queryByText('1')).not.toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  test('countReadyOrders tolerates null input and ignores non-ready statuses', () => {
    const scope = getWaiterScope({ role: 'waiter' })
    expect(countReadyOrders(null, scope)).toBe(0)
    expect(countReadyOrders([{ status: 'served' }, { status: 'new' }], scope)).toBe(0)
  })
})
