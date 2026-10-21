/**
 * Restaurant/RestaurantLandingPage — the branch "counter QR" (§12.2):
 * `/<slug>/<branchSlug>?counter=1` enters the restaurant + branch with NO
 * table, stamps the tableless dine-in session and goes straight to the
 * menu (or to login, flagged like a QR scan). Without the query the page
 * just renders — entering is still a tap.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import React, { useEffect } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_k, d, o) => (typeof d === 'string' ? d.replace('{{name}}', o?.name || '') : d) }) }))
const auth = { isLoggedIn: false, isGuest: false, user: null }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/utils/api', () => ({
  publicAPI: { getLanding: vi.fn(), getRestaurantBranches: vi.fn() },
}))
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock('@/Pages/Restaurant/components/CoverCarousel', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/LandingActions', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/LandingSection', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/FeaturedDishes', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/HoursCard', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/LocationCard', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/BranchLinks', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/SocialLinks', () => ({ default: () => null }))
vi.mock('@/Pages/Restaurant/components/BranchPickerSheet', () => ({ default: () => null }))

import { publicAPI } from '@/utils/api'
import RestaurantLandingPage from '@/Pages/Restaurant/RestaurantLandingPage'

let landed = null
function Probe({ name }) {
  const { state } = useLocation()
  useEffect(() => { landed = { name, state } }, [name, state])
  return <div>{name}</div>
}

const PAYLOAD = {
  restaurant: { slug: 'cafe-uno', name: 'Cafe Uno', _id: 'r1' },
  branch: { _id: 'b1', name: 'MG Road', slug: 'mg-road' },
  landing: { enabled: true },
  features: {},
  contact: { phone: '99' },
}

function renderAt(path) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:slug/:branchSlug" element={<RestaurantLandingPage />} />
          <Route path="/:slug" element={<RestaurantLandingPage />} />
          <Route path="/customer/home" element={<Probe name="home" />} />
          <Route path="/login" element={<Probe name="login" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  landed = null
  Object.assign(auth, { isLoggedIn: false, isGuest: false, user: null })
  publicAPI.getLanding.mockResolvedValue({ data: { data: PAYLOAD } })
})

describe('RestaurantLandingPage — ?counter=1 (counter QR)', () => {
  test('guest: enters restaurant + branch with no table, tableless dine-in, straight to the menu', async () => {
    auth.isGuest = true
    localStorage.setItem('dineInTable', JSON.stringify({ _id: 'stale', name: '3' }))
    renderAt('/cafe-uno/mg-road?counter=1')
    await screen.findByText('home')

    const tenant = JSON.parse(localStorage.getItem('activeTenant'))
    expect(tenant).toMatchObject({ slug: 'cafe-uno', branch: { _id: 'b1', slug: 'mg-road' } })
    expect(JSON.parse(localStorage.getItem('dineInEntry'))).toEqual({ dineIn: true, tableless: true })
    expect(localStorage.getItem('dineInTable')).toBeNull()
    expect(localStorage.getItem('orderType')).toBe('dine-in')
  })

  test('not signed in: same session, then login flagged like a QR scan with next=/customer/home', async () => {
    renderAt('/cafe-uno/mg-road?counter=1')
    await screen.findByText('login')
    expect(landed.state).toEqual({ from: 'qr-scan', next: '/customer/home' })
    expect(JSON.parse(localStorage.getItem('dineInEntry'))).toEqual({ dineIn: true, tableless: true })
    expect(localStorage.getItem('fromQrScan')).toBe('true')
  })

  test('the landing payload\'s public operations blob is stored with the tenant (design §12)', async () => {
    auth.isGuest = true
    const operations = { tables: { useTables: false }, orderFlow: { customerSelfOrder: true, customerTracking: false } }
    publicAPI.getLanding.mockResolvedValue({ data: { data: { ...PAYLOAD, operations } } })
    renderAt('/cafe-uno/mg-road?counter=1')
    await screen.findByText('home')
    expect(JSON.parse(localStorage.getItem('activeTenant')).operations).toEqual(operations)
  })

  test('without ?counter the landing page renders and nothing is entered', async () => {
    renderAt('/cafe-uno/mg-road')
    await waitFor(() => expect(publicAPI.getLanding).toHaveBeenCalled())
    await screen.findAllByText('Cafe Uno')
    expect(landed).toBeNull()
    expect(localStorage.getItem('activeTenant')).toBeNull()
    expect(localStorage.getItem('dineInEntry')).toBeNull()
  })
})
