/**
 * Admin AddStaffModal — operations profile: Waiter / Captain / Chef role
 * options are hidden when the restaurant runs without that module
 * (operations.modules[key] === false), except the role of the row being
 * edited. Manager visibility (admin-only) is unchanged.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/utils/api', () => {
  const api = { get: vi.fn() }
  return { default: api }
})

import api from '@/utils/api'
import AddStaffModal, { PERMISSION_CATALOG } from '@/Pages/Admin/components/AddStaffModal'

describe('AddStaffModal - incentives permission', () => {
  test('catalog lists incentives as an admin-only toggle', () => {
    const entry = PERMISSION_CATALOG.find((p) => p.key === 'incentives')
    expect(entry).toBeTruthy()
    expect(entry.adminOnly).toBe(true)
  })
})

const MODULES_ALL_ON = { qrOrdering: true, waiter: true, captain: true, chef: true, customerPayment: true }

beforeEach(() => {
  auth = { user: { role: 'admin' }, operations: { modules: MODULES_ALL_ON } }
  api.get.mockImplementation((url) => {
    if (url === '/staff/next-id') return Promise.resolve({ data: { success: true, nextId: 'EMP-007' } })
    if (url === '/branches') return Promise.resolve({ data: { data: [] } })
    if (url === '/areas') return Promise.resolve({ data: { success: true, areas: [] } })
    if (url === '/tables') return Promise.resolve({ data: { success: true, tables: [] } })
    return Promise.resolve({ data: {} })
  })
})

async function openRoleOptions(editData) {
  const user = userEvent.setup()
  render(<AddStaffModal onClose={() => {}} onSubmit={() => {}} editData={editData} />)
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/tables'))
  // The Role field: its label's parent holds the dropdown trigger.
  const field = screen.getByText(/^Role/).parentElement
  await user.click(within(field).getAllByRole('button')[0])
  return within(field).getAllByRole('button').slice(1).map((b) => b.textContent)
}

describe('AddStaffModal — role options vs operations.modules', () => {
  test('all modules on: Manager, Captain, Chef, Waiter', async () => {
    expect(await openRoleOptions()).toEqual(['Manager', 'Captain', 'Chef', 'Waiter'])
  })

  test('no operations profile: every role offered (today\'s behaviour)', async () => {
    auth = { user: { role: 'admin' } }
    expect(await openRoleOptions()).toEqual(['Manager', 'Captain', 'Chef', 'Waiter'])
  })

  test('self-service (waiter + captain off): only Manager and Chef', async () => {
    auth.operations = { modules: { ...MODULES_ALL_ON, waiter: false, captain: false } }
    expect(await openRoleOptions()).toEqual(['Manager', 'Chef'])
  })

  test('chef off: Chef hidden', async () => {
    auth.operations = { modules: { ...MODULES_ALL_ON, chef: false } }
    expect(await openRoleOptions()).toEqual(['Manager', 'Captain', 'Waiter'])
  })

  test('manager caller (not admin) never sees Manager, and module-off roles are hidden too', async () => {
    auth = { user: { role: 'manager' }, operations: { modules: { ...MODULES_ALL_ON, waiter: false } } }
    expect(await openRoleOptions()).toEqual(['Captain', 'Chef'])
  })

  test('editing an existing waiter keeps the Waiter option even though the module is off', async () => {
    auth.operations = { modules: { ...MODULES_ALL_ON, waiter: false, captain: false } }
    const opts = await openRoleOptions({ _id: 's1', id: 'EMP-003', name: 'Ravi', role: 'waiter', phone: '9876543210', email: 'r@x.in' })
    expect(opts).toContain('Waiter')
    expect(opts).not.toContain('Captain')
  })
})
