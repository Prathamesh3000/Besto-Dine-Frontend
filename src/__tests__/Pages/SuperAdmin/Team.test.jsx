import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'

const API = vi.hoisted(() => ({
  modules: vi.fn(), list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), resetPassword: vi.fn(), activity: vi.fn(),
}))
vi.mock('@/utils/platformStaffApi', () => ({ platformStaffAPI: API, default: API }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

import Team from '@/Pages/SuperAdmin/Team'

const CATALOG = [
  { key: 'signupLeads', label: 'Trial signups', description: 'Self-service signups', levels: ['view', 'manage'] },
  { key: 'leads', label: 'Marketing leads', description: 'Demo requests', levels: ['view', 'manage'] },
  { key: 'plans', label: 'Plans', description: 'Plan catalog', levels: ['view'] },
]
const MEMBER = {
  _id: 's1', name: 'Asha Rao', email: 'asha@example.com', status: 'active',
  modules: { signupLeads: 'manage', plans: 'view' }, lastLoginAt: '2026-11-10T10:00:00Z', lastActivityAt: null, actionCount: 4,
}
const ROW = (o) => ({ _id: Math.random().toString(36), ip: '1.2.3.4', createdAt: '2026-11-10T10:00:00Z', details: {}, ...o })

const ok = (data) => Promise.resolve({ data: { success: true, ...data } })
const fail = (status, message) => Promise.reject({ response: { status, data: { message } } })

beforeEach(() => {
  vi.clearAllMocks()
  API.modules.mockImplementation(() => ok({ modules: CATALOG }))
  API.list.mockImplementation(() => ok({ staff: [MEMBER] }))
  API.activity.mockImplementation(() => ok({ data: [], pagination: { page: 1, limit: 20, total: 0, pages: 1 } }))
})

const renderTeam = async () => {
  render(<Team />)
  await screen.findAllByText('Asha Rao')
}

describe('Team list', () => {
  test('renders members with module chips from the catalog', async () => {
    await renderTeam()
    expect(screen.getAllByText('asha@example.com').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Trial signups · Manage').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Plans · View').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('Never').length).toBe(0)
    expect(screen.getAllByText('None yet').length).toBeGreaterThan(0)
  })

  test('empty state offers to add a member', async () => {
    API.list.mockImplementation(() => ok({ staff: [] }))
    render(<Team />)
    expect(await screen.findByText('No team members yet')).toBeInTheDocument()
  })

  test('error state retries', async () => {
    API.list.mockImplementationOnce(() => fail(500, 'Boom'))
    render(<Team />)
    expect(await screen.findByText('Boom')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }))
    expect((await screen.findAllByText('Asha Rao')).length).toBeGreaterThan(0)
  })
})

describe('Add member', () => {
  const open = async () => {
    await renderTeam()
    fireEvent.click(screen.getByRole('button', { name: /Add team member/ }))
    await screen.findByLabelText('Name')
  }

  test('validates name, email and at least one module', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }))
    expect(await screen.findByText('Name must be 2 to 80 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Give access to at least one module')).toBeInTheDocument()
    expect(API.create).not.toHaveBeenCalled()
  })

  test('hides Manage for view-only modules', async () => {
    await open()
    expect(screen.getByRole('radio', { name: 'Trial signups: Manage' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Plans: Manage' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Plans: View' })).toBeInTheDocument()
  })

  test('shows the server 409 message', async () => {
    API.create.mockImplementation(() => fail(409, 'Email already in use'))
    await open()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Person' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dup@example.com' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Marketing leads: View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }))
    expect(await screen.findByText('Email already in use')).toBeInTheDocument()
  })

  test('creates, shows the one-time password, copies it, and clears it on close', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    API.create.mockImplementation(() => ok({ staff: { ...MEMBER, _id: 's2' }, tempPassword: 'Tmp-Pass-123', emailed: false }))
    await open()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Person' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Marketing leads: Manage' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create member' }))
    expect(await screen.findByTestId('temp-password')).toHaveTextContent('Tmp-Pass-123')
    expect(API.create).toHaveBeenCalledWith({ name: 'New Person', email: 'new@example.com', modules: { leads: 'manage' } })
    expect(screen.getByText(/shown only once/)).toBeInTheDocument()
    expect(screen.getByText(/email could not be sent/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Copy/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Tmp-Pass-123'))
    fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }))
    expect(screen.queryByTestId('temp-password')).toBeNull()
    expect(screen.queryByText('Tmp-Pass-123')).toBeNull()
  })
})

describe('Edit member', () => {
  const openEdit = async () => {
    await renderTeam()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit Asha Rao' })[0])
    await screen.findByLabelText('Name')
  }

  test('email is read-only and modules save', async () => {
    API.update.mockImplementation(() => ok({ staff: MEMBER }))
    await openEdit()
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
    fireEvent.click(screen.getByRole('radio', { name: 'Trial signups: View' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Plans: None' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Marketing leads: View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(API.update).toHaveBeenCalledWith('s1', { name: 'Asha Rao', modules: { signupLeads: 'view', leads: 'view' } }))
  })

  test('cannot save with every module removed', async () => {
    await openEdit()
    fireEvent.click(screen.getByRole('radio', { name: 'Trial signups: None' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Plans: None' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Give access to at least one module')).toBeInTheDocument()
    expect(API.update).not.toHaveBeenCalled()
  })

  test('deactivating asks for confirmation then sends status inactive', async () => {
    API.update.mockImplementation(() => ok({ staff: MEMBER }))
    await openEdit()
    fireEvent.click(screen.getByRole('switch', { name: 'Active' }))
    expect(screen.getByText(/signed out everywhere immediately/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark inactive' }))
    expect(screen.getByRole('switch', { name: 'Active' })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(API.update).toHaveBeenCalledWith('s1', expect.objectContaining({ status: 'inactive' })))
  })
})

describe('Reset password', () => {
  test('confirms, then shows the new temporary password once', async () => {
    API.resetPassword.mockImplementation(() => ok({ tempPassword: 'Reset-456', emailed: true }))
    await renderTeam()
    fireEvent.click(screen.getAllByRole('button', { name: 'Reset password for Asha Rao' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByTestId('temp-password')).toHaveTextContent('Reset-456')
    expect(API.resetPassword).toHaveBeenCalledWith('s1')
    expect(screen.getByText(/welcome email with this password was sent/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }))
    expect(screen.queryByText('Reset-456')).toBeNull()
  })
})

describe('Activity drawer', () => {
  const openDrawer = async () => {
    await renderTeam()
    fireEvent.click(screen.getAllByRole('button', { name: 'Activity for Asha Rao' })[0])
    return screen.findByRole('dialog', { name: 'Activity for Asha Rao' })
  }

  test('describes rows, highlights denied attempts and expands details', async () => {
    API.activity.mockImplementation(() => ok({
      data: [
        ROW({ _id: 'a1', action: 'platformstaff.login' }),
        ROW({ _id: 'a2', action: 'platformstaff.view', details: { module: 'signupLeads' } }),
        ROW({ _id: 'a3', action: 'platformstaff.write', details: { module: 'leads', method: 'PATCH', path: '/x' } }),
        ROW({ _id: 'a4', action: 'platformstaff.denied', details: { module: 'plans' } }),
        ROW({ _id: 'a5', action: 'something.new_thing' }),
      ],
      pagination: { page: 1, limit: 20, total: 5, pages: 1 },
    }))
    const dlg = await openDrawer()
    expect(await within(dlg).findByText('Signed in')).toBeInTheDocument()
    expect(within(dlg).getByText('Opened Trial signups')).toBeInTheDocument()
    expect(within(dlg).getByText('Changed data in Marketing leads')).toBeInTheDocument()
    const denied = within(dlg).getByText('Tried to open Plans without access')
    expect(denied.closest('li')).toHaveAttribute('data-denied', 'true')
    expect(within(dlg).getByText('Something new thing')).toBeInTheDocument()
    expect(within(dlg).getAllByText(/1\.2\.3\.4/).length).toBe(5)
    fireEvent.click(denied)
    expect(within(dlg).getByText(/"module": "plans"/)).toBeInTheDocument()
  })

  test('pages and applies filters', async () => {
    API.activity.mockImplementation((id, params) => ok({
      data: [ROW({ _id: `p${params.page}`, action: 'platformstaff.login' })],
      pagination: { page: params.page, limit: 20, total: 40, pages: 2 },
    }))
    const dlg = await openDrawer()
    await within(dlg).findByText('Signed in')
    expect(API.activity).toHaveBeenLastCalledWith('s1', { page: 1, limit: 20 })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(API.activity).toHaveBeenLastCalledWith('s1', { page: 2, limit: 20 }))
    fireEvent.change(within(dlg).getByLabelText('Action type'), { target: { value: 'platformstaff.denied' } })
    await waitFor(() => expect(API.activity).toHaveBeenLastCalledWith('s1', { page: 1, limit: 20, action: 'platformstaff.denied' }))
    fireEvent.change(within(dlg).getByLabelText('From date'), { target: { value: '2026-11-01' } })
    fireEvent.change(within(dlg).getByLabelText('To date'), { target: { value: '2026-11-09' } })
    await waitFor(() => expect(API.activity).toHaveBeenLastCalledWith('s1', { page: 1, limit: 20, action: 'platformstaff.denied', from: '2026-11-01', to: '2026-11-09' }))
  })

  test('empty and error states', async () => {
    API.activity.mockImplementationOnce(() => fail(500, 'Activity broke'))
    const dlg = await openDrawer()
    expect(await within(dlg).findByText('Activity broke')).toBeInTheDocument()
    fireEvent.click(within(dlg).getByRole('button', { name: /Retry/ }))
    expect(await within(dlg).findByText('No activity found')).toBeInTheDocument()
  })
})
