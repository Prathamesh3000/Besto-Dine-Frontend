import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/Context/AdminBranchContext', () => ({
  useAdminBranch: () => ({ branches: [{ _id: 'b1', name: 'Main' }, { _id: 'b2', name: 'FC Road' }] }),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: toast, toast }))

const mocks = vi.hoisted(() => ({
  incentiveAPI: {
    getCampaigns: vi.fn(), createCampaign: vi.fn(), updateCampaign: vi.fn(),
    deleteCampaign: vi.fn(), getReport: vi.fn(), exportReportCsv: vi.fn(),
  },
  api: { get: vi.fn() },
}))
vi.mock('@/utils/api', () => ({ default: mocks.api, incentiveAPI: mocks.incentiveAPI }))

import Incentives from '@/Pages/Admin/Incentives'
import { validateCampaignForm, buildCampaignPayload, buildReportParams, emptyCampaignForm } from '@/utils/incentives'

const { incentiveAPI, api } = mocks
const MENU = [{ _id: 'm1', name: 'Gulab Jamun', price: 80 }, { _id: 'm2', name: 'Brownie', price: 120 }]
const CAMPAIGN = {
  _id: 'c1', name: 'Dessert push', items: ['m1'], rule: { type: 'per_item', ratePerItem: 5 },
  startDate: '2026-10-01', endDate: '2026-10-31', branch: null, staffRoles: ['captain'],
  maxPerStaffPerDay: 0, budgetCap: 1000, stacking: 'stack', status: 'active', spent: 250, quantityEarned: 50,
}
const REPORT = {
  totals: { quantity: 10, estimated: 50, confirmed: 30, pending: 15, reversed: 5 },
  byDay: [{ day: '2026-10-20', quantity: 10, estimated: 50, confirmed: 30, pending: 15 }],
  byStaff: [{ _id: 's1', name: 'Asha', quantity: 10, estimated: 50, confirmed: 30, pending: 15 }],
  byCampaign: [], byItem: [], daily: [],
  rows: [{ _id: 'e1', orderId: 'ORD-1', billNo: 'B-9', itemName: 'Gulab Jamun', quantity: 2, rate: 5, amount: 10, state: 'pending', day: '2026-10-20', staffName: 'Asha', staffRole: 'captain', campaignName: 'Dessert push', branchName: 'Main' }],
  page: 1, limit: 25, total: 1, pages: 1,
}

function setAuth(over = {}) {
  auth = { hasPermission: () => true, hasFeature: () => true, user: { role: 'admin' }, tenant: { planName: 'Silver' }, logout: vi.fn(), ...over }
}
function renderPage() {
  const Wrapper = wrapperFor(makeQueryClient())
  return render(<MemoryRouter><Incentives /></MemoryRouter>, { wrapper: Wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth()
  api.get.mockImplementation((url) => {
    if (url.startsWith('/menu')) return Promise.resolve({ data: { data: MENU } })
    if (url === '/staff') return Promise.resolve({ data: { staff: [{ _id: 's1', name: 'Asha', role: 'captain' }, { _id: 's9', name: 'Chef Bob', role: 'chef' }] } })
    return Promise.resolve({ data: {} })
  })
  incentiveAPI.getCampaigns.mockResolvedValue({ data: { campaigns: [CAMPAIGN] } })
  incentiveAPI.getReport.mockResolvedValue({ data: REPORT })
})

describe('campaign form helpers', () => {
  test('validation rejects an empty form and a reversed date range', () => {
    const e = validateCampaignForm({ ...emptyCampaignForm('2026-10-10'), endDate: '2026-10-01', staffRoles: [] })
    expect(Object.keys(e).sort()).toEqual(['endDate', 'items', 'name', 'ratePerItem', 'staffRoles'])
  })
  test('payload shape', () => {
    const f = { ...emptyCampaignForm('2026-10-10'), name: ' Dessert ', items: ['m1'], ratePerItem: '5', endDate: '2026-10-12', branch: 'b2', maxPerStaffPerDay: '3', budgetCap: '500', stacking: 'exclusive' }
    expect(buildCampaignPayload(f)).toEqual({
      name: 'Dessert', items: ['m1'], rule: { type: 'per_item', ratePerItem: 5 }, startDate: '2026-10-10', endDate: '2026-10-12',
      branch: 'b2', staffRoles: ['captain', 'waiter'], maxPerStaffPerDay: 3, budgetCap: 500, stacking: 'exclusive', status: 'active',
    })
    expect(buildCampaignPayload({ ...f, branch: '' }).branch).toBeNull()
  })
  test('report params drop empty filters and default branch to all', () => {
    expect(buildReportParams({ from: '2026-10-01', to: '2026-10-07', branch: '', staff: '', campaign: 'c1', item: '', state: 'pending' }, 2, 25))
      .toEqual({ from: '2026-10-01', to: '2026-10-07', campaign: 'c1', state: 'pending', branch: 'all', page: 2, limit: 25 })
  })
})

describe('Incentives page', () => {
  test('lists campaigns with status, spent/budget and quantity', async () => {
    renderPage()
    const row = await screen.findByTestId('inc-campaign-row')
    expect(row).toHaveTextContent('Dessert push')
    expect(row).toHaveTextContent('active')
    expect(row).toHaveTextContent('250')
    expect(row).toHaveTextContent('1,000')
    expect(row).toHaveTextContent('50')
  })

  test('empty state', async () => {
    incentiveAPI.getCampaigns.mockResolvedValue({ data: { campaigns: [] } })
    renderPage()
    expect(await screen.findByTestId('inc-empty')).toBeInTheDocument()
  })

  test('form validation blocks submit; valid form posts the right payload', async () => {
    const user = userEvent.setup()
    incentiveAPI.createCampaign.mockResolvedValue({ data: { campaign: CAMPAIGN } })
    renderPage()
    await screen.findByTestId('inc-campaign-row')
    await user.click(screen.getByRole('button', { name: /new campaign/i }))
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Pick at least one menu item')).toBeInTheDocument()
    expect(incentiveAPI.createCampaign).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Campaign name'), 'Dessert push')
    await waitFor(() => expect(screen.getByText('Gulab Jamun')).toBeInTheDocument())
    await user.click(screen.getByLabelText(/Gulab Jamun/))
    await user.type(screen.getByLabelText(/Rate per item/), '5')
    await user.selectOptions(screen.getByLabelText('Branch'), 'b2')
    await user.click(screen.getByRole('button', { name: 'Create campaign' }))
    await waitFor(() => expect(incentiveAPI.createCampaign).toHaveBeenCalledTimes(1))
    const payload = incentiveAPI.createCampaign.mock.calls[0][0]
    expect(payload).toMatchObject({
      name: 'Dessert push', items: ['m1'], rule: { type: 'per_item', ratePerItem: 5 },
      branch: 'b2', staffRoles: ['captain', 'waiter'], maxPerStaffPerDay: 0, budgetCap: 0, stacking: 'stack', status: 'active',
    })
    expect(payload.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('pause sends status paused', async () => {
    incentiveAPI.updateCampaign.mockResolvedValue({ data: {} })
    renderPage()
    await screen.findByTestId('inc-campaign-row')
    fireEvent.click(screen.getByRole('button', { name: 'Pause Dessert push' }))
    await waitFor(() => expect(incentiveAPI.updateCampaign).toHaveBeenCalledWith('c1', { status: 'paused' }))
  })

  test('delete 409 shows the pause / end-date guidance', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    incentiveAPI.deleteCampaign.mockRejectedValue({ response: { status: 409, data: { code: 'CAMPAIGN_HAS_ENTRIES', message: 'has entries' } } })
    renderPage()
    await screen.findByTestId('inc-campaign-row')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Dessert push' }))
    const box = await screen.findByTestId('inc-delete-error')
    expect(box).toHaveTextContent(/Pause it or set an end date instead/)
  })

  test('report: default query and filter changes build the right params', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('inc-campaign-row')
    await user.click(screen.getByRole('tab', { name: 'Report' }))
    await waitFor(() => expect(incentiveAPI.getReport).toHaveBeenCalled())
    expect(incentiveAPI.getReport.mock.calls[0][0]).toMatchObject({ branch: 'all', page: 1, limit: 25 })
    expect(await screen.findByTestId('kpi-confirmed')).toHaveTextContent('30')
    expect(screen.getByTestId('inc-row')).toHaveTextContent('ORD-1 / B-9')

    await user.selectOptions(screen.getByLabelText('State'), 'pending')
    await user.selectOptions(screen.getByLabelText('Branch'), 'b2')
    await user.selectOptions(screen.getByLabelText('Campaign'), 'c1')
    await user.selectOptions(screen.getByLabelText('Staff'), 's1')
    await user.selectOptions(screen.getByLabelText('Item'), 'm2')
    await waitFor(() => {
      const last = incentiveAPI.getReport.mock.calls.at(-1)[0]
      expect(last).toMatchObject({ state: 'pending', branch: 'b2', campaign: 'c1', staff: 's1', item: 'm2', page: 1 })
    })
    expect(within(screen.getByLabelText('Staff')).queryByText('Chef Bob')).toBeNull()
  })

  test('export uses the same filters without paging', async () => {
    const user = userEvent.setup()
    incentiveAPI.exportReportCsv.mockResolvedValue({ data: 'a,b' })
    window.URL.createObjectURL = vi.fn(() => 'blob:x')
    window.URL.revokeObjectURL = vi.fn()
    renderPage()
    await user.click(await screen.findByRole('tab', { name: 'Report' }))
    await screen.findByTestId('kpi-confirmed')
    await user.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() => expect(incentiveAPI.exportReportCsv).toHaveBeenCalled())
    const p = incentiveAPI.exportReportCsv.mock.calls[0][0]
    expect(p).toMatchObject({ branch: 'all' })
    expect(p.page).toBeUndefined()
    expect(p.limit).toBeUndefined()
  })

  test('locked state: plan without the module', () => {
    setAuth({ hasFeature: () => false })
    renderPage()
    expect(screen.getByTestId('feature-locked')).toHaveTextContent('Staff Incentives is not in your plan')
    expect(incentiveAPI.getCampaigns).not.toHaveBeenCalled()
  })

  test('locked state: API answers FEATURE_REVOKED', async () => {
    incentiveAPI.getCampaigns.mockRejectedValue({ response: { status: 403, data: { code: 'FEATURE_REVOKED', feature: 'incentives', message: 'off' } } })
    renderPage()
    expect(await screen.findByTestId('feature-locked')).toBeInTheDocument()
  })

  test('no permission', () => {
    setAuth({ hasPermission: () => false })
    renderPage()
    expect(screen.getByTestId('inc-no-permission')).toBeInTheDocument()
  })
})
