/**
 * Loggedin/Home — operations profile orderFlow.customerSelfOrder:false
 * (QR is menu-only): the menu stays browsable, the Add buttons and the
 * cart bar go, and the staff note shows. Mock setup mirrors
 * Home.operations.test.jsx.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// public-dir svg imports ("/x.svg") don't resolve under vitest
vi.mock('/callforwaitericon.svg', () => ({ default: 'callforwaitericon.svg' }))
vi.mock('/vegicon.svg', () => ({ default: 'vegicon.svg' }))
vi.mock('/nonvegicon.svg', () => ({ default: 'nonvegicon.svg' }))

const MENU = vi.hoisted(() => [
  { _id: 'm1', name: 'Paneer Tikka', description: 'Smoky', price: 199, finalPrice: 199, vegType: 'veg', category: 'c1' },
])
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
    menuItems: MENU, categories: [], combos: [], menuLoading: false, comboLoading: false,
    menuPagination: { hasMore: false }, comboPagination: { hasMore: false },
    fetchMenuItems: () => Promise.resolve(), fetchCategories: () => Promise.resolve(), fetchCombos: () => Promise.resolve(),
  }),
}))
vi.mock('@/Components/Loggedin/BottomNav', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/BottomNav', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/Sidebar', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/LoginPromptBanner', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/CartButton', () => ({ default: () => <div data-testid="cart-button" /> }))
vi.mock('@/Components/Loggedin/Header', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/ProductDetails', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/FilterModal', () => ({ default: () => null }))
vi.mock('@/Components/Waiter/FilterPopup', () => ({ default: () => null }))
vi.mock('@/Components/Loggedin/ExitConfirmModal', () => ({ default: () => null }))
vi.mock('@/hooks/useExitConfirmation', () => ({ default: () => ({ show: false, confirm: () => {}, cancel: () => {} }) }))
let selfOrderBlocked = false
vi.mock('@/hooks/useSelfOrderBlocked', () => ({ default: () => selfOrderBlocked }))
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

const NOTE = 'Ordering at the table is not available — please order with the staff.'

beforeEach(() => {
  opsProfile = null
  selfOrderBlocked = false
  session.canRequestService = true
  localStorage.setItem('orderType', 'dine-in')
})

describe('Home — QR menu-only', () => {
  test('self-order on: items have Add, cart bar shown, no note', async () => {
    renderHome()
    await screen.findAllByText('Paneer Tikka')
    expect(screen.getByRole('button', { name: /^Add$/ })).toBeInTheDocument()
    expect(screen.getByTestId('cart-button')).toBeInTheDocument()
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  test('menu-only: items still listed, Add + cart bar hidden, note shown', async () => {
    selfOrderBlocked = true
    renderHome()
    await screen.findAllByText('Paneer Tikka')
    expect(screen.queryByRole('button', { name: /^Add$/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('cart-button')).not.toBeInTheDocument()
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })
})
