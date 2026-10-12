/**
 * Loggedin/Home — operations profile: the "Ask for Water" / "Call a Waiter"
 * quick-actions are hidden for a self-service restaurant
 * (customerApp.callWaiter === false). Everything heavy is mocked; only the
 * service strip is under test.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// public-dir svg imports ("/x.svg") don't resolve under vitest
vi.mock('/callforwaitericon.svg', () => ({ default: 'callforwaitericon.svg' }))
vi.mock('/vegicon.svg', () => ({ default: 'vegicon.svg' }))
vi.mock('/nonvegicon.svg', () => ({ default: 'nonvegicon.svg' }))

let opsProfile = null
vi.mock('@/utils/operations', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getCustomerOperations: () => opsProfile || actual.DEFAULT_PUBLIC_OPERATIONS }
})

const auth = { isLoggedIn: false, isGuest: true, isStaff: false }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/Context/CartContext', () => ({
  useCart: () => ({ cartItems: {}, updateQuantity: () => {}, totalItems: 0, totalPrice: 0 }),
}))
vi.mock('@/Context/Loggedin/HealthContext', () => ({
  useHealthContext: () => ({ healthMode: false, dietPreference: null, setDietPreference: () => {}, toggleHealthMode: () => {} }),
}))
vi.mock('@/Context/MenuContext', () => ({
  useMenu: () => ({
    menuItems: [], categories: [], combos: [], menuLoading: false, comboLoading: false,
    menuPagination: { hasMore: false }, comboPagination: { hasMore: false },
    fetchMenuItems: () => Promise.resolve(), fetchCategories: () => Promise.resolve(), fetchCombos: () => Promise.resolve(),
  }),
}))
vi.mock('@/Components/Loggedin/BottomNav', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/BottomNav', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/Sidebar', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/LoginPromptBanner', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/CartButton', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/Header', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/ProductDetails', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/FilterModal', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/FilterPopup', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/ExitConfirmModal', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/QrMenuOnlyNote', () => ({ default: () => null }))
vi.mock('@/hooks/useExitConfirmation', () => ({ default: () => ({ show: false, confirm: () => {}, cancel: () => {} }) }))
vi.mock('@/hooks/useSelfOrderBlocked', () => ({ default: () => false }))
const session = { canRequestService: true }
vi.mock('@/hooks/useCustomerSession', () => ({ default: () => session }))
vi.mock('@/utils/dineInSession', () => ({ useDineInLock: () => false, isDineInLocked: () => false }))
vi.mock('@/utils/favorites', () => ({ useFavorites: () => ({ has: () => false, toggle: () => {} }) }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(() => Promise.resolve({ data: {} })), post: vi.fn() }
  return { default: api, waiterAPI: { createRequest: vi.fn() } }
})

import Home from '@/Pages/Loggedin/Home'

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/customer/home']}>
      <Routes>
        <Route path="/customer/home" element={<Home />} />
      </Routes>
    </MemoryRouter>,
  )
}

const water = () => screen.queryByRole('button', { name: 'Request water from waiter' })
const waiter = () => screen.queryByRole('button', { name: 'Call a waiter to your table' })

beforeEach(() => {
  opsProfile = null
  session.canRequestService = true
  localStorage.setItem('orderType', 'dine-in')
})

describe('Home — service quick-actions vs operations profile', () => {
  test('no profile (defaults): Water and Call Waiter are shown', () => {
    renderHome()
    expect(water()).toBeInTheDocument()
    expect(waiter()).toBeInTheDocument()
  })

  test('customerApp.callWaiter === true: shown', () => {
    opsProfile = { customerApp: { callWaiter: true } }
    renderHome()
    expect(water()).toBeInTheDocument()
    expect(waiter()).toBeInTheDocument()
  })

  test('customerApp.callWaiter === false (self-service): both hidden', () => {
    opsProfile = { customerApp: { callWaiter: false, tips: false } }
    renderHome()
    expect(water()).not.toBeInTheDocument()
    expect(waiter()).not.toBeInTheDocument()
  })

  test('takeaway still hides them regardless of the profile', () => {
    localStorage.setItem('orderType', 'takeaway')
    renderHome()
    expect(water()).not.toBeInTheDocument()
  })
})
