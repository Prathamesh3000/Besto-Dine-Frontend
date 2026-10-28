import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

const auth = vi.hoisted(() => ({ current: { user: { role: 'waiter' } } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth.current, CAPTAIN_ROLES: ['captain', 'admin', 'manager'] }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn() }) }))
vi.mock('@/Context/NotificationContext', () => ({
  useNotifications: () => ({
    notifications: [{ _id: 'n1', category: 'Payment', status: 'read', title: 'Cash request', message: 'Table 5 wants to pay cash', createdAt: new Date().toISOString(), meta: { orderId: 'O1', amount: 420, table: '5' } }],
    unreadCount: 0, loading: false, markAsRead: vi.fn(), markAllAsRead: vi.fn(), clearAll: vi.fn(),
    soundEnabled: true, toggleSound: vi.fn(), testSound: vi.fn(),
  }),
}))

import WaiterNotifications from '@/Pages/Waiter/WaiterNotifications'

let loc
function Spy() { loc = useLocation(); return <div>dest</div> }

async function tapPayment(role) {
  auth.current = { user: { role } }
  render(
    <MemoryRouter initialEntries={['/waiter/notifications']}>
      <Routes>
        <Route path="/waiter/notifications" element={<WaiterNotifications />} />
        <Route path="*" element={<Spy />} />
      </Routes>
    </MemoryRouter>,
  )
  await userEvent.setup().click(screen.getByText('Cash request'))
}

describe('WaiterNotifications payment-notification tap', () => {
  test('waiter goes to the orders page, not the payment screen', async () => {
    await tapPayment('waiter')
    expect(loc.pathname).toBe('/waiter/orders')
  })
  test.each(['captain', 'admin', 'manager'])('%s goes to the settle screen', async (role) => {
    await tapPayment(role)
    expect(loc.pathname).toBe('/waiter/payment')
    expect(loc.state.fromCounterRequest).toBe(true)
  })
})
