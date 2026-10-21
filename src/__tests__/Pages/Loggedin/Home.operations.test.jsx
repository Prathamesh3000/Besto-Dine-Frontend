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
const session = { canRequestService: true, table: null, tableless: false }
vi.mock('@/hooks/useCustomerSession', () => ({ default: () => session }))
const markTablelessDineIn = vi.fn()
vi.mock('@/utils/dineInSession', () => ({ useDineInLock: () => false, isDineInLocked: () => false, markTablelessDineIn: (...a) => markTablelessDineIn(...a) }))
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
  session.table = null
  session.tableless = false
  markTablelessDineIn.mockClear()
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

describe('Home — token-number mode banner (§12.2)', () => {
  const note = () => screen.queryByTestId('token-mode-note')

  test('default tenant with no table: no banner, no tableless stamp', () => {
    renderHome()
    expect(note()).not.toBeInTheDocument()
    expect(markTablelessDineIn).not.toHaveBeenCalled()
  })

  test('counter-QR session (session.tableless): banner with the token wording', () => {
    session.tableless = true
    renderHome()
    expect(note()).toHaveTextContent('Order from your seat — you’ll get a token number to collect your food.')
  })

  test('token-mode profile arriving after entry: banner shown and the tableless entry is stamped once', () => {
    opsProfile = { tables: { useTables: false } }
    renderHome()
    expect(note()).toBeInTheDocument()
    expect(markTablelessDineIn).toHaveBeenCalledTimes(1)
  })

  test('token-mode profile but a real table is bound: no banner', () => {
    opsProfile = { tables: { useTables: false } }
    session.table = { id: 't1', name: '4' }
    renderHome()
    expect(note()).not.toBeInTheDocument()
    expect(markTablelessDineIn).not.toHaveBeenCalled()
  })

  test('takeaway never shows the banner', () => {
    session.tableless = true
    localStorage.setItem('orderType', 'takeaway')
    renderHome()
    expect(note()).not.toBeInTheDocument()
  })
})
