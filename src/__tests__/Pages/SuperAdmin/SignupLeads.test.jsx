import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))
const auth = vi.hoisted(() => ({ isFullSuperAdmin: true, views: ['signupLeads', 'leads'] }))
vi.mock('@/Context/AuthContext', () => ({
  useAuth: () => ({
    isFullSuperAdmin: auth.isFullSuperAdmin,
    superadminLevel: auth.isFullSuperAdmin ? 'full' : 'readonly',
    canManageModule: () => auth.isFullSuperAdmin,
    canViewModule: (k) => auth.views.includes(k),
    user: { name: 'Root' },
  }),
}))

import SignupLeads from '@/Pages/SuperAdmin/components/SignupLeads'
import Leads from '@/Pages/SuperAdmin/Leads'

const DAY = 86400000
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString()

const SUMMARY = { total: 40, free: 10, trialActive: 12, trialEnded: 8, paid: 10, followUpsDue: 3, conversionRate: 25.0 }

const TRIAL_LEAD = {
  id: 'r1', name: 'Spice Hub', slug: 'spice-hub', owner: 'Asha Rao', email: 'asha@spicehub.in', phone: '9876543210',
  city: 'Pune', source: 'self_service_trial', plan: { name: 'Gold', slug: 'gold', isFree: false },
  subscriptionStatus: 'trial', status: 'active', segment: 'trial_active', signedUpAt: iso(-4), trialEndsAt: iso(10),
  lockAt: null, daysLeft: 10, daysSinceTrialEnd: null, menuItemCount: 23, staffCount: 2, stage: 'new',
  nextFollowUpAt: iso(-2), lastContactedAt: null,
  notes: [{ text: 'Left a voicemail', byName: 'Root', at: iso(-1), kind: 'human' }],
  reminders: [{ type: 't-3', queuedAt: iso(-1), sentAt: null }, { type: 't-1', queuedAt: iso(-3), sentAt: iso(-3) }],
}
const PAID_LEAD = {
  id: 'r2', name: 'Curry Leaf', slug: 'curry-leaf', owner: 'Dev Patel', email: 'dev@curryleaf.in', phone: '9000000000',
  city: 'Mumbai', source: 'self_service', plan: { name: 'Premium', slug: 'premium', isFree: false },
  subscriptionStatus: 'active', status: 'active', segment: 'paid', signedUpAt: iso(-30), trialEndsAt: iso(-16),
  daysLeft: null, daysSinceTrialEnd: 16, menuItemCount: 80, staffCount: 6, stage: 'interested',
  nextFollowUpAt: iso(5), lastContactedAt: iso(-7), notes: [], reminders: [],
}

const listResponse = (data) => ({ data: { success: true, data, pagination: { page: 1, limit: 25, total: data.length, pages: 1 } } })

const mockGets = (leads = [TRIAL_LEAD, PAID_LEAD]) => {
  api.get.mockImplementation((url) => {
    if (url === '/superadmin/signup-leads/summary') return Promise.resolve({ data: { success: true, data: SUMMARY } })
    if (url === '/superadmin/signup-leads') return Promise.resolve(listResponse(leads))
    if (url === '/superadmin/signup-leads/export.csv') return Promise.resolve({ data: 'csv-bytes', headers: {} })
    if (url === '/superadmin/leads') return Promise.resolve({ data: { data: { leads: [], counts: { all: 0 } } } })
    return Promise.reject(new Error(`unexpected GET ${url}`))
  })
}

const listCalls = () => api.get.mock.calls.filter(([url]) => url === '/superadmin/signup-leads')
const lastListParams = () => listCalls().at(-1)[1].params

const renderSignups = () => render(<MemoryRouter><SignupLeads /></MemoryRouter>)

const openModal = async (name) => {
  fireEvent.click(await screen.findByText(name))
  await screen.findByLabelText('Stage')
}

beforeEach(() => {
  auth.isFullSuperAdmin = true
  auth.views = ['signupLeads', 'leads']
  mockGets()
})

describe('SignupLeads — summary and list', () => {
  test('renders the four stat cards from /summary with the conversion hint', async () => {
    renderSignups()
    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument())
    expect(screen.getByText('8')).toBeInTheDocument()          // trial ended
    expect(screen.getByText('3')).toBeInTheDocument()          // follow-ups due
    expect(screen.getByText('10')).toBeInTheDocument()         // converted = paid
    expect(screen.getByText('25.0% conversion')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/superadmin/signup-leads/summary')
    // first list query: page 1, default limit, no segment/stage
    const params = listCalls()[0][1].params
    expect(params).toMatchObject({ page: 1, limit: 25 })
    expect(params.segment).toBeUndefined()
  })

  test('renders rows: status badge, trial days, stage and follow-up', async () => {
    renderSignups()
    const row = (await screen.findByText('Spice Hub')).closest('tr')
    expect(within(row).getByText('On trial')).toBeInTheDocument()
    expect(within(row).getByText('10 days left')).toBeInTheDocument()
    expect(within(row).getByText('New')).toBeInTheDocument()
    expect(within(row).getByText('asha@spicehub.in')).toBeInTheDocument()
    const paidRow = screen.getByText('Curry Leaf').closest('tr')
    expect(within(paidRow).getByText('Paid')).toBeInTheDocument()
    expect(within(paidRow).getByText('Converted')).toBeInTheDocument() // paid → converted regardless of stored stage
    expect(within(paidRow).getByText('—')).toBeInTheDocument()         // no trial-days text for paid
  })

  test('segment tab click re-queries with the segment param; stage + follow-up filters too', async () => {
    renderSignups()
    await screen.findByText('Spice Hub')
    fireEvent.click(screen.getByRole('button', { name: 'On trial' }))
    await waitFor(() => expect(lastListParams().segment).toBe('trial_active'))

    fireEvent.change(screen.getByLabelText('Filter by stage'), { target: { value: 'contacted' } })
    await waitFor(() => expect(lastListParams().stage).toBe('contacted'))

    fireEvent.click(screen.getByLabelText('Follow-ups due'))
    await waitFor(() => expect(lastListParams().followUp).toBe('due'))

    // "All" drops the segment param again
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(lastListParams().segment).toBeUndefined())
  })

  test('debounced search sends the search param once typing pauses', async () => {
    renderSignups()
    await screen.findByText('Spice Hub')
    const before = listCalls().length
    fireEvent.change(screen.getByLabelText('Search signup leads'), { target: { value: 'spice' } })
    expect(listCalls().length).toBe(before) // not yet — debounced
    await waitFor(() => expect(lastListParams().search).toBe('spice'), { timeout: 2000 })
  })

  test('overdue follow-up renders in red; a future one does not', async () => {
    renderSignups()
    await screen.findByText('Spice Hub')
    expect(screen.getByTestId('followup-spice-hub')).toHaveClass('text-rose-600')
    expect(screen.getByTestId('followup-curry-leaf')).not.toHaveClass('text-rose-600')
  })

  test('empty state when there are no leads', async () => {
    mockGets([])
    renderSignups()
    expect(await screen.findByText('No signup leads')).toBeInTheDocument()
  })

  test('Export CSV calls export.csv with the current filters (no page/limit) and downloads a blob', async () => {
    window.URL.createObjectURL = vi.fn(() => 'blob:x')
    window.URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderSignups()
    await screen.findByText('Spice Hub')
    fireEvent.click(screen.getByRole('button', { name: 'Trial ended' }))
    await waitFor(() => expect(lastListParams().segment).toBe('trial_ended'))

    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/superadmin/signup-leads/export.csv', expect.objectContaining({ responseType: 'blob' })))
    const call = api.get.mock.calls.find(([url]) => url === '/superadmin/signup-leads/export.csv')
    expect(call[1].params).toEqual({ segment: 'trial_ended' })
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(window.URL.createObjectURL).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('CSV downloaded')
  })
})

describe('SignupLeads — lead modal', () => {
  test('stage select sends PATCH, shows a toast and refreshes the row', async () => {
    api.patch.mockResolvedValue({ data: { success: true, data: { ...TRIAL_LEAD, stage: 'contacted', lastContactedAt: iso(0) } } })
    renderSignups()
    await openModal('Spice Hub')
    // header links
    expect(screen.getByRole('link', { name: /asha@spicehub.in/ })).toHaveAttribute('href', 'mailto:asha@spicehub.in')
    expect(screen.getByRole('link', { name: /9876543210/ })).toHaveAttribute('href', 'tel:9876543210')

    const select = screen.getByLabelText('Stage')
    expect(select).not.toBeDisabled()
    fireEvent.change(select, { target: { value: 'contacted' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/superadmin/signup-leads/spice-hub', { stage: 'contacted' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Stage set to contacted'))
    // row refreshed from the PATCH response
    const row = screen.getAllByText('Spice Hub').map(el => el.closest('tr')).find(Boolean)
    await waitFor(() => expect(within(row).getByText('Contacted')).toBeInTheDocument())
    // summary re-fetched after a write
    expect(api.get.mock.calls.filter(([u]) => u === '/superadmin/signup-leads/summary').length).toBeGreaterThanOrEqual(2)
  })

  test('follow-up date change PATCHes nextFollowUpAt as ISO; clearing sends null', async () => {
    api.patch.mockResolvedValue({ data: { success: true, data: TRIAL_LEAD } })
    renderSignups()
    await openModal('Spice Hub')
    fireEvent.change(screen.getByLabelText('Next follow-up'), { target: { value: '2026-12-01' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalled())
    const body = api.patch.mock.calls[0][1]
    expect(new Date(body.nextFollowUpAt).getDate()).toBe(1)
    expect(new Date(body.nextFollowUpAt).getMonth()).toBe(11)
    fireEvent.change(screen.getByLabelText('Next follow-up'), { target: { value: '' } })
    await waitFor(() => expect(api.patch).toHaveBeenLastCalledWith('/superadmin/signup-leads/spice-hub', { nextFollowUpAt: null }))
  })

  test('adding a note POSTs to /notes and shows the returned history newest first; reminders listed separately', async () => {
    const newNote = { text: 'Demo booked for Friday', byName: 'Root', at: iso(0), kind: 'human' }
    api.post.mockResolvedValue({ data: { success: true, data: { ...TRIAL_LEAD, notes: [newNote, ...TRIAL_LEAD.notes] } } })
    renderSignups()
    await openModal('Spice Hub')
    expect(screen.getByText('Left a voicemail')).toBeInTheDocument()
    // reminders: queued vs sent
    expect(screen.getByText('3 days before trial end')).toBeInTheDocument()
    expect(screen.getByText('queued')).toBeInTheDocument()
    expect(screen.getByText(/^Sent /)).toBeInTheDocument()

    const addBtn = screen.getByRole('button', { name: 'Add note' })
    expect(addBtn).toBeDisabled() // empty note
    fireEvent.change(screen.getByLabelText('New note'), { target: { value: '  Demo booked for Friday ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/superadmin/signup-leads/spice-hub/notes', { text: 'Demo booked for Friday' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Note added'))
    const items = await screen.findAllByText(/Demo booked for Friday|Left a voicemail/)
    expect(items[0]).toHaveTextContent('Demo booked for Friday')
    expect(screen.getByLabelText('New note')).toHaveValue('')
  })

  test('paid lead shows stage Converted with the select disabled', async () => {
    renderSignups()
    await openModal('Curry Leaf')
    const select = screen.getByLabelText('Stage')
    expect(select).toHaveValue('converted')
    expect(select).toBeDisabled()
    expect(screen.getByText('Paid — converted')).toBeInTheDocument()
    // dates are still editable for a full super admin
    expect(screen.getByLabelText('Next follow-up')).not.toBeDisabled()
  })

  test('read-only super admin sees disabled controls', async () => {
    auth.isFullSuperAdmin = false
    renderSignups()
    await openModal('Spice Hub')
    expect(screen.getByLabelText('Stage')).toBeDisabled()
    expect(screen.getByLabelText('Next follow-up')).toBeDisabled()
    expect(screen.getByLabelText('Last contacted')).toBeDisabled()
    expect(screen.getByLabelText('New note')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled()
    expect(screen.getByText(/Read-only access/)).toBeInTheDocument()
  })
})

describe('Leads page tabs', () => {
  const renderLeads = (search = '') => render(
    <MemoryRouter initialEntries={[`/superadmin/leads${search}`]}><Leads /></MemoryRouter>,
  )

  test('defaults to the Signups tab and keeps the "Leads" title', async () => {
    renderLeads()
    expect(screen.getByRole('heading', { level: 1, name: 'Leads' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Signups' })).toHaveAttribute('aria-selected', 'true')
    await screen.findByText('Spice Hub')
    expect(api.get).not.toHaveBeenCalledWith('/superadmin/leads', expect.anything())
  })

  test('?tab=demo renders the demo-request pipeline; clicking Signups switches back', async () => {
    renderLeads('?tab=demo')
    expect(screen.getByRole('tab', { name: 'Demo requests' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/superadmin/leads', expect.anything()))
    expect(await screen.findByText('No leads here')).toBeInTheDocument()
    expect(screen.getByText('Incoming leads')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Signups' }))
    expect(await screen.findByText('Spice Hub')).toBeInTheDocument()
  })

  test('legacy ?search= deep link (no tab) still lands on demo requests, prefilled', async () => {
    renderLeads('?search=Spice')
    expect(screen.getByRole('tab', { name: 'Demo requests' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/superadmin/leads', expect.objectContaining({ params: { search: 'Spice' } })))
  })
})
