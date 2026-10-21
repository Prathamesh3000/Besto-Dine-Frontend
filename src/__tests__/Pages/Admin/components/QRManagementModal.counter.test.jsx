/**
 * Admin/components/QRManagementModal — Counter QR (token-number mode).
 * One code per branch encoding the restaurant/branch entry link with
 * `?counter=1`; counterMode shows only that code, otherwise it is a
 * collapsible section above the table codes.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
const auth = { current: { tenant: { slug: 'spice-villa' } } }
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth.current }))
const branch = { current: { branches: [{ _id: 'b1', name: 'MG Road', slug: 'mg-road' }, { _id: 'b0', name: 'Main', slug: 'main' }], selectedBranchId: 'b1' } }
vi.mock('@/Context/AdminBranchContext', () => ({ useAdminBranch: () => branch.current }))

import QRManagementModal, { counterEntryLink } from '@/Pages/Admin/components/QRManagementModal'

beforeEach(() => {
  auth.current = { tenant: { slug: 'spice-villa' } }
  branch.current = { branches: [{ _id: 'b1', name: 'MG Road', slug: 'mg-road' }, { _id: 'b0', name: 'Main', slug: 'main' }], selectedBranchId: 'b1' }
})

describe('counterEntryLink', () => {
  test('restaurant/branch entry link + ?counter=1', () => {
    expect(counterEntryLink('spice-villa', 'mg-road', 'https://app.bestodine.in/')).toBe('https://app.bestodine.in/spice-villa/mg-road?counter=1')
    expect(counterEntryLink('spice-villa', null, 'https://app.bestodine.in')).toBe('https://app.bestodine.in/spice-villa?counter=1')
    expect(counterEntryLink('', 'mg-road', 'https://x')).toBe('')
  })
})

describe('QRManagementModal — Counter QR', () => {
  test('counterMode: only the counter code, link carries ?counter=1 for the selected branch', () => {
    render(<QRManagementModal counterMode onClose={() => {}} baseUrl="https://app.bestodine.in" />)
    expect(screen.getByRole('heading', { name: 'Counter QR' })).toBeInTheDocument()
    expect(screen.getByTestId('counter-qr-link')).toHaveTextContent('https://app.bestodine.in/spice-villa/mg-road?counter=1')
    expect(screen.getByText('Counter · MG Road')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download PNG/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Print/ })).toBeEnabled()
    // No table UI in counter mode.
    expect(screen.queryByText(/Select All/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download as ZIP/ })).not.toBeInTheDocument()
  })

  test('no selected branch → falls back to the Main branch slug', () => {
    branch.current = { ...branch.current, selectedBranchId: null }
    render(<QRManagementModal counterMode onClose={() => {}} baseUrl="https://app.bestodine.in" />)
    expect(screen.getByTestId('counter-qr-link')).toHaveTextContent('/spice-villa/main?counter=1')
  })

  test('tables on (bulk mode): Counter QR is a collapsed section above the table codes', async () => {
    const user = userEvent.setup()
    render(<QRManagementModal onClose={() => {}} table={null} allTables={[]} baseUrl="https://app.bestodine.in" />)
    expect(screen.getByRole('heading', { name: 'Download All QR Codes' })).toBeInTheDocument()
    expect(screen.queryByTestId('counter-qr-link')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Counter QR/ }))
    expect(screen.getByTestId('counter-qr-link')).toHaveTextContent('?counter=1')
    expect(screen.getByRole('button', { name: /Download as ZIP/ })).toBeInTheDocument()
  })

  test('no public slug → no link, actions disabled', () => {
    auth.current = { tenant: null }
    render(<QRManagementModal counterMode onClose={() => {}} baseUrl="https://app.bestodine.in" />)
    expect(screen.getByText('No public link yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download PNG/ })).toBeDisabled()
  })
})
