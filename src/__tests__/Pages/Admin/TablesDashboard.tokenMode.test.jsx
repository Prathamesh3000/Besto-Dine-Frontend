/**
 * Admin/TablesDashboard — token-number mode (operations tables.useTables:false).
 * The dashboard becomes a Token board: no tabs, reservations, merge or
 * per-table QR; the QR button opens QRManagementModal in counter mode.
 * The default profile renders exactly today's Live Feed.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { DEFAULT_OPERATIONS } from '@/utils/operations'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: () => {} }))
const opsState = { current: null }
vi.mock('@/hooks/useOperations', () => ({
  default: () => opsState.current,
  useOperations: () => opsState.current,
}))
vi.mock('@/Pages/Admin/components/AddReservationModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddAreaModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/AddTableModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/BulkAddTablesModal', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/MergeTables', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/LateArrivalBanner', () => ({ default: () => null }))
vi.mock('@/Pages/Admin/components/TokenBoard', () => ({ default: () => <div data-testid="token-board-stub" /> }))
vi.mock('@/Pages/Admin/components/QRManagementModal', () => ({
  default: ({ counterMode }) => <div data-testid="qr-modal">{counterMode ? 'counter-mode' : 'table-mode'}</div>,
}))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() }
  return { default: api, printAPI: {} }
})
const AREA = { _id: 'a1', name: 'Main', isActive: true }
const BOOTSTRAP = {
  data: {
    tables: [{ _id: 't1', name: 'T7', capacity: 4, status: 'occupied', area: AREA }],
    areas: [AREA], reservations: [], staff: [], settings: {},
  },
  isLoading: false, isError: false, refetch: vi.fn(),
}
vi.mock('@/hooks/queries/useAdminBootstrap', () => ({ useAdminBootstrap: () => BOOTSTRAP }))

import api from '@/utils/api'
import TablesDashboard from '@/Pages/Admin/TablesDashboard'

const tokenOps = { ...DEFAULT_OPERATIONS, tables: { ...DEFAULT_OPERATIONS.tables, useTables: false } }

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  opsState.current = DEFAULT_OPERATIONS
  api.get.mockResolvedValue({ data: { success: true, orders: [] } })
})

const renderPage = () => render(<MemoryRouter><TablesDashboard /></MemoryRouter>)

describe('TablesDashboard — token-number mode', () => {
  test('useTables:false → Token board header, TokenBoard, no table controls or tabs', () => {
    opsState.current = tokenOps
    renderPage()
    expect(screen.getByText('Token numbers — tables are off for this branch')).toBeInTheDocument()
    expect(screen.getByTestId('token-board-stub')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Settings → Operations/ })).toHaveAttribute('href', '/admin/settings?tab=Operations')
    expect(screen.queryByRole('button', { name: /Merge Table/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add Reservation/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Live Feed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tables & QR Management' })).not.toBeInTheDocument()
    expect(screen.queryByText('T7')).not.toBeInTheDocument()
  })

  test('Counter QR button opens QRManagementModal in counter mode', async () => {
    opsState.current = tokenOps
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Counter QR/ }))
    expect(screen.getByTestId('qr-modal')).toHaveTextContent('counter-mode')
  })

  test('default profile: today\'s Live Feed, no Token board', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Live Feed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Merge Table/ })).toBeInTheDocument()
    expect(screen.getByText('T7')).toBeInTheDocument()
    expect(screen.queryByTestId('token-board-stub')).not.toBeInTheDocument()
    expect(screen.queryByText(/tables are off/)).not.toBeInTheDocument()
  })

  test('default profile: Download All QR opens the modal in table mode', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Tables & QR Management' }))
    await user.click(screen.getByRole('button', { name: /Download All QR/ }))
    expect(screen.getByTestId('qr-modal')).toHaveTextContent('table-mode')
  })
})
