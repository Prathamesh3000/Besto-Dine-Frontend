import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))

import useRoleNavigation from '@/hooks/useRoleNavigation'

const asRole = (role) => {
  const staff = ['waiter', 'captain', 'admin', 'manager'].includes(role)
  auth = {
    user: role && role !== 'guest' ? { role } : null,
    isGuest: role === 'guest',
    isWaiter: role === 'waiter',
    isCaptain: role === 'captain' || role === 'admin',
    isStaff: staff,
    isCustomer: role === 'customer',
  }
}

beforeEach(() => navigate.mockReset())

describe('useRoleNavigation role-aware targets', () => {
  test.each([
    ['waiter', '/waiter'],
    ['captain', '/waiter'],
    ['admin', '/waiter'],
    ['manager', '/waiter'],
    ['customer', '/customer'],
    ['guest', '/customer'],
    ['chef', '/customer'],
  ])('%s → %s/* for home, menu, cart, orders', (role, base) => {
    asRole(role)
    const { result } = renderHook(() => useRoleNavigation())
    result.current.navigateAfterLogin()
    expect(navigate).toHaveBeenLastCalledWith(`${base}/home`, { replace: true })
    result.current.navigateToHome()
    expect(navigate).toHaveBeenLastCalledWith(`${base}/home`)
    result.current.navigateToMenu()
    expect(navigate).toHaveBeenLastCalledWith(`${base}/menu`)
    result.current.navigateToCart()
    expect(navigate).toHaveBeenLastCalledWith(`${base}/cart`)
    result.current.navigateToOrders()
    expect(navigate).toHaveBeenLastCalledWith(`${base}/orders`)
  })

  test.each([
    ['navigateToSearch', '/customer/search'],
    ['navigateToBookingType', '/customer/booking-type'],
    ['navigateToBookTableDetails', '/customer/book-table-details'],
    ['navigateToAddOns', '/customer/add-ons'],
    ['navigateToParkingDetails', '/customer/parking-details'],
    ['navigateToCakeDetails', '/customer/cake-details'],
  ])('%s always goes to %s', (fn, path) => {
    asRole('waiter')
    const { result } = renderHook(() => useRoleNavigation())
    result.current[fn]()
    expect(navigate).toHaveBeenCalledWith(path)
  })

  test('exposes role flags and raw navigate; role is null when signed out', () => {
    asRole('captain')
    const { result } = renderHook(() => useRoleNavigation())
    expect(result.current).toMatchObject({ role: 'captain', isStaff: true, isCaptain: true, navigate })
    asRole(null)
    const { result: r2 } = renderHook(() => useRoleNavigation())
    expect(r2.current.role).toBeNull()
  })
})
