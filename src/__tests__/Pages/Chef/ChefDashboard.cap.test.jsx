/**
 * Chef/ChefDashboard — bounded board (Phase 5 stability finding,
 * 2026-10-13): the KDS must never mount more than KDS_MAX_CARDS cards,
 * must say how many are waiting, must keep card order, and must drive
 * every card's timer from ONE shared interval.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../../_helpers/queryWrapper'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({
  default: () => {},
  useSocketConnected: () => true,
  useSocketReconnect: () => {},
}))
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Chef One', role: 'chef' }, logout: vi.fn() }),
}))
vi.mock('@/Context/NotificationContext', () => ({
  useNotifications: () => ({ soundEnabled: false, toggleSound: vi.fn() }),
}))
// The header owns its own wall-clock interval and the install banner
// probes PWA APIs; neither is under test here. Stubbing them means every
// 1000 ms setInterval we count below belongs to the board itself.
vi.mock('@/Pages/Chef/components/ChefHeader', () => ({ default: () => <header data-testid="hdr" /> }))
vi.mock('@/Components/Common/InstallAppBanner', () => ({ default: () => null }))
vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  chefAPI: {
    getKitchenOrders: vi.fn(),
    updateStatus: vi.fn(),
    getCompletedKitchenOrders: vi.fn(),
  },
  settingsAPI: { getSettings: vi.fn() },
}))

import { chefAPI, settingsAPI } from '@/utils/api'
import ChefDashboard from '@/Pages/Chef/ChefDashboard'
import { KDS_MAX_CARDS } from '@/Pages/Chef/utils/kdsBoard'

// Rendering 200-282 cards is deliberately heavy; under a parallel full-suite run the
// default 5 s per-test budget is too tight on a slow machine (the cards themselves are fast).
vi.setConfig({ testTimeout: 20000 })

const NOW = new Date('2026-10-13T12:00:00.000Z').getTime()
const iso = (ms) => new Date(ms).toISOString()

/**
 * Build n orders in one bucket. Index 0 is the OLDEST (created n minutes
 * ago), so the prepare_now / preparing display order is 0, 1, 2, ...
 */
function makeOrders(n, { bucket = 'ready_to_prepare', status = 'new', prefix = 'P' } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const createdAt = iso(NOW - (n - i) * 60_000)
    const o = {
      _id: `${prefix}-${i}`,
      id: `ORD-${prefix}${String(i).padStart(4, '0')}`,
      status,
      queueBucket: bucket,
      type: 'dine-in',
      tableId: `T${i}`,
      table: { name: String(i) },
      createdAt,
      updatedAt: createdAt,
      items: [
        { menuItem: `m${i}`, name: `Dish ${i}`, quantity: 1, vegType: 'veg', addedAt: createdAt },
        { menuItem: `d${i}`, name: `Side ${i}`, quantity: 2, vegType: 'non-veg', addedAt: createdAt },
      ],
    }
    if (bucket === 'scheduled') {
      o.type = 'takeaway'
      o.tableId = 'TA'
      o.pickupAt = iso(NOW + (60 + i) * 60_000)
      o.prepStartAt = iso(NOW + (30 + i) * 60_000)
    }
    if (status === 'preparing') o.preparationStartedAt = createdAt
    return o
  })
}

function respond(orders) {
  chefAPI.getKitchenOrders.mockResolvedValue({
    data: { success: true, orders, completedToday: 3, serverTime: iso(NOW) },
  })
}

function renderBoard() {
  const client = makeQueryClient()
  const utils = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChefDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, client }
}

const cards = () => screen.queryAllByRole('article')
const shownIds = () => cards().map((a) => within(a).getByText(/^Order ID:/).textContent.replace('Order ID: ', ''))

beforeEach(() => {
  settingsAPI.getSettings.mockResolvedValue({ data: { general: { cafeName: 'Cafe Uno' }, operatingHours: [] } })
  chefAPI.updateStatus.mockResolvedValue({ data: { success: true } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ChefDashboard render cap', () => {
  test('exactly KDS_MAX_CARDS (60) orders: all 60 cards, no banner', async () => {
    respond(makeOrders(60))
    renderBoard()
    await screen.findAllByRole('article')
    expect(cards()).toHaveLength(60)
    expect(screen.queryByTestId('kds-cap-banner')).not.toBeInTheDocument()
    expect(screen.queryByText(/more not shown/)).not.toBeInTheDocument()
    // Column badge still shows the true total.
    expect(within(screen.getByRole('region', { name: 'Prepare Now' })).getByText('60')).toBeInTheDocument()
  })

  test('61 orders: 60 cards and a banner reporting 1 waiting', async () => {
    respond(makeOrders(61))
    renderBoard()
    await screen.findAllByRole('article')
    expect(cards()).toHaveLength(KDS_MAX_CARDS)
    const banner = screen.getByTestId('kds-cap-banner')
    expect(banner).toHaveTextContent(/1\s+more order waiting — complete tickets to see them/)
    expect(banner).not.toHaveTextContent('orders waiting')
    expect(screen.getByTestId('kds-cap-prepare_now')).toHaveTextContent('+1 more not shown')
    // True total still on the badge.
    expect(within(screen.getByRole('region', { name: 'Prepare Now' })).getByText('61')).toBeInTheDocument()
  })

  test('282 orders (the soak scenario): 60 cards, banner says 222, plural', async () => {
    respond(makeOrders(282))
    renderBoard()
    await screen.findAllByRole('article')
    expect(cards()).toHaveLength(60)
    expect(screen.getByTestId('kds-cap-banner')).toHaveTextContent(/222\s+more orders waiting/)
  })

  test('shown cards keep the bucket order: the 60 oldest prepare_now tickets, oldest first', async () => {
    respond(makeOrders(70))
    renderBoard()
    await screen.findAllByRole('article')
    const expected = Array.from({ length: 60 }, (_, i) => `ORD-P${String(i).padStart(4, '0')}`)
    expect(shownIds()).toEqual(expected)
  })

  test('upcoming (scheduled) is trimmed before any active column', async () => {
    const upcoming = makeOrders(30, { bucket: 'scheduled', prefix: 'U' })
    const prepareNow = makeOrders(50, { prefix: 'P' })
    respond([...prepareNow, ...upcoming])
    renderBoard()
    await screen.findAllByRole('article')
    expect(cards()).toHaveLength(60)
    expect(screen.getByTestId('kds-cap-banner')).toHaveTextContent(/20\s+more orders waiting/)
    expect(screen.getByTestId('kds-cap-upcoming')).toHaveTextContent('+20 more not shown')
    expect(screen.queryByTestId('kds-cap-prepare_now')).not.toBeInTheDocument()
    // All 50 prepare_now cards are present.
    expect(shownIds().filter((id) => id.startsWith('ORD-P'))).toHaveLength(50)
    expect(shownIds().filter((id) => id.startsWith('ORD-U'))).toHaveLength(10)
  })

  test('card actions still reach the API through the stable callback', async () => {
    respond([
      ...makeOrders(1, { prefix: 'N' }),
      ...makeOrders(1, { prefix: 'C', bucket: 'preparing', status: 'preparing' }),
    ])
    renderBoard()
    await screen.findAllByRole('article')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Start Preparation/ }))
    expect(chefAPI.updateStatus).toHaveBeenCalledWith('N-0', 'preparing')
    await user.click(screen.getByRole('button', { name: /Mark as Ready/ }))
    expect(chefAPI.updateStatus).toHaveBeenCalledWith('C-0', 'ready')
  })
})

describe('ChefDashboard shared ticker', () => {
  test('200 cards → exactly one 1000 ms setInterval, and every card ticks from it', async () => {
    // Fake only the interval + Date so RTL's findBy (setTimeout-based)
    // keeps working while we advance the board clock by hand.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(NOW)
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')

    respond(makeOrders(200))
    const { unmount } = renderBoard()
    await screen.findAllByRole('article')
    expect(cards()).toHaveLength(60)

    const secondIntervals = intervalSpy.mock.calls.filter(([, ms]) => ms === 1000)
    expect(secondIntervals).toHaveLength(1)

    // Oldest shown card was created 200 min ago → "3h 20m"; the 60th was
    // created 141 min ago → "2h 21m". Advance one shared tick and confirm
    // a card whose anchor is close to a boundary rolls over.
    const first = cards()[0]
    expect(within(first).getByText('3h 20m')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(within(first).getByText('3h 21m')).toBeInTheDocument()
    expect(within(cards()[59]).getByText('2h 22m')).toBeInTheDocument()

    // Still a single ticker after the ticks; and it is cleared on unmount.
    expect(intervalSpy.mock.calls.filter(([, ms]) => ms === 1000)).toHaveLength(1)
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })
})
