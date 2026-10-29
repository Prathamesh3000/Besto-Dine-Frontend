import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
const mocks = vi.hoisted(() => ({ api: { get: vi.fn() } }))
vi.mock('@/utils/api', () => ({ default: mocks.api }))

import AuditLog, { buildAuditParams } from '@/Pages/Admin/AuditLog'
import { buildAdminNavItems } from '@/utils/adminNav'

const { api } = mocks
const ROW = {
  _id: 'a1', action: 'order.cancel', createdAt: '2026-10-20T10:00:00.000Z',
  actor: { id: 'u1', name: 'Asha', role: 'admin' }, entityType: 'order', entityId: 'ORD-1',
  summary: 'Order ORD-1 cancelled', before: { status: 'new' }, after: { status: 'cancelled' }, ip: '1.1.1.1',
}

function renderPage() {
  const Wrapper = wrapperFor(makeQueryClient())
  return render(<Wrapper><AuditLog /></Wrapper>)
}

beforeEach(() => {
  vi.clearAllMocks()
  auth = { user: { role: 'admin' } }
  api.get.mockResolvedValue({ data: { success: true, rows: [ROW], page: 1, limit: 25, total: 1, pages: 1 } })
})

describe('AuditLog page', () => {
  test('renders rows from the API', async () => {
    renderPage()
    expect(await screen.findByText('Order ORD-1 cancelled')).toBeInTheDocument()
    expect(screen.getByText('Asha')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/audit', { params: { page: 1, limit: 25 } })
  })

  test('shows the empty state', async () => {
    api.get.mockResolvedValue({ data: { success: true, rows: [], page: 1, limit: 25, total: 0, pages: 1 } })
    renderPage()
    expect(await screen.findByTestId('audit-empty')).toBeInTheDocument()
  })

  test('applying filters re-queries with only the non-empty ones', async () => {
    renderPage()
    await screen.findByText('Order ORD-1 cancelled')
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'order.refund' } })
    fireEvent.change(screen.getByLabelText('Entity id'), { target: { value: ' ORD-9 ' } })
    fireEvent.click(screen.getByText('Apply'))
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/audit', { params: { page: 1, limit: 25, action: 'order.refund', entityId: 'ORD-9' } }))
  })

  test('clicking a row opens the drawer with before and after', async () => {
    renderPage()
    fireEvent.click(await screen.findByTestId('audit-row'))
    expect(screen.getByTestId('audit-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('audit-before').textContent).toContain('"new"')
    expect(screen.getByTestId('audit-after').textContent).toContain('"cancelled"')
  })

  test('manager does not get the actor filter', async () => {
    auth = { user: { role: 'manager' } }
    renderPage()
    await screen.findByText('Order ORD-1 cancelled')
    expect(screen.queryByLabelText('Actor id')).toBeNull()
  })

  test('Download CSV requests the export as a blob', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    renderPage()
    await screen.findByText('Order ORD-1 cancelled')
    api.get.mockResolvedValueOnce({ data: new Blob(['a,b']) })
    fireEvent.click(screen.getByText('Download CSV'))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit/export', expect.objectContaining({ responseType: 'blob' })))
  })
})

describe('helpers', () => {
  test('buildAuditParams drops blanks', () => {
    expect(buildAuditParams({ from: '', action: 'x', entityId: '  ' }, 2, 25)).toEqual({ page: 2, limit: 25, action: 'x' })
  })

  test('nav entry is role gated', () => {
    const items = [{ name: 'Audit', path: '/admin/audit', roles: ['admin', 'manager'] }, { name: 'D', path: '/admin/dashboard' }]
    const base = { isTenantOwner: true, hasPermission: () => true, hasFeature: () => true, isCrossBranchReadOnly: false }
    expect(buildAdminNavItems(items, { ...base, role: 'manager' }).map((i) => i.name)).toEqual(['Audit', 'D'])
    expect(buildAdminNavItems(items, { ...base, role: 'waiter' }).map((i) => i.name)).toEqual(['D'])
  })
})
