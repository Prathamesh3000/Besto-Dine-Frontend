import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

import OperationsPanel, { flowSteps, mergeStoredProfile, overrideKeys, branchOverrides } from '@/Pages/SuperAdmin/components/OperationsPanel'

const STALE_PROFILE_NOTE = 'Someone else changed this profile — reloaded the latest version'

const ALL_ON = { qrOrdering: true, waiter: true, captain: true, chef: true, customerPayment: true }
const HOTEL_MODULES = { qrOrdering: true, waiter: false, captain: false, chef: false, customerPayment: true }

const resolvedFor = (modules, overrides = {}) => {
  const floor = modules.waiter || modules.captain
  const payFirst = !floor
  return {
    preset: 'custom',
    modules,
    serviceModel: floor ? 'tableService' : 'counterService',
    roles: { waiter: modules.waiter, captain: modules.captain, chef: modules.chef },
    orderFlow: {
      customerSelfOrder: modules.qrOrdering, staffOrder: true, kitchenDisplay: modules.chef,
      servedStep: floor, customerTracking: modules.chef,
    },
    payment: {
      dineIn: payFirst ? 'payFirst' : 'payAfter', takeaway: 'payFirst', kiosk: 'payFirst', delivery: 'payFirst',
      methods: { online: true, wallet: true, counterCash: false }, holdUntilPaid: payFirst, holdExpiryMinutes: 20,
    },
    customerApp: { callWaiter: floor, requestBill: floor, appendToOrder: true, tips: floor },
    tables: { useTables: true, assignWaiters: floor, mergeTables: true },
    planBlocks: [],
    ...overrides,
  }
}

const CATALOG = {
  modules: [
    { key: 'qrOrdering', label: 'QR ordering', description: 'scan', planFeature: 'dineIn' },
    { key: 'waiter', label: 'Waiter', description: 'serve', planFeature: 'waiterDashboard' },
    { key: 'captain', label: 'Captain', description: 'floor', planFeature: 'waiterDashboard' },
    { key: 'chef', label: 'Chef (kitchen screen)', description: 'kds', planFeature: 'kitchenDisplay' },
    { key: 'customerPayment', label: 'Customer payment', description: 'pay', planFeature: 'paymentGateway' },
  ],
  presets: [
    { key: 'fullService', label: 'Full-service restaurant', description: 'today', modules: ALL_ON, answers: { dineInPayment: null, counterCash: null, useTables: null } },
    { key: 'hotelPayFirstSelfOrder', label: 'Hotel / self-service, pay first', description: 'hotel', modules: HOTEL_MODULES, answers: { dineInPayment: 'payFirst', counterCash: true, useTables: true } },
  ],
  questions: [
    { key: 'dineInPayment', label: 'When does a dine-in customer pay?', options: [{ value: null, label: 'Decide' }, { value: 'payFirst', label: 'Before' }, { value: 'payAfter', label: 'After' }] },
    { key: 'useTables', label: 'Does the restaurant use table numbers?', options: [{ value: null, label: 'Yes (default)' }, { value: true, label: 'Yes' }, { value: false, label: 'No — token numbers instead' }] },
  ],
  advancedPaths: { 'customerApp.tips': 'boolean', 'payment.takeaway': ['payFirst', 'payAfter', 'either'] },
}

const STORED = { version: 1, preset: 'fullService', modules: ALL_ON, answers: { dineInPayment: null, counterCash: null, useTables: null }, advanced: {} }
// A server warning carried by a stored profile / preview (e.g. tips with no floor staff).
const TIPS_WARNING = 'tips are on but no waiter or captain is in use — tips are switched off'
const tipsWarnings = (profile) => (profile?.modules?.waiter === false && profile?.modules?.captain === false ? [TIPS_WARNING] : [])

const restaurant = {
  _id: 'r1',
  subscription: { features: { dineIn: true, waiterDashboard: true, kitchenDisplay: true, paymentGateway: false } },
}

// ── per-branch fixtures (design §12.1) ──────────────────────────────────────
const MAIN = { _id: 'b1', name: 'Main', isActive: true }
const FC = { _id: 'b2', name: 'FC Road', isActive: true }
const CLOSED = { _id: 'b3', name: 'Old Kiosk', isActive: false }
const FC_OVERRIDES = { preset: 'custom', modules: { waiter: false } }
const FC_STAMP = '2026-10-18T09:00:00.000Z'
const branchEntry = (branch, overrides = {}, updatedAt = null) => ({
  branch,
  overrides,
  updatedAt,
  resolved: resolvedFor({ ...ALL_ON, ...(overrides.modules || {}) }),
  validation: { errors: [], warnings: [] },
})
const WITH_BRANCHES = {
  profile: { ...STORED, updatedAt: '2026-10-15T08:00:00.000Z' },
  isDefault: false,
  resolved: resolvedFor(ALL_ON),
  validation: { errors: [], warnings: [] },
  branches: [branchEntry(MAIN), branchEntry(FC, FC_OVERRIDES, FC_STAMP), branchEntry(CLOSED)],
}
const withBranchSaved = (payload, branchId, overrides, updatedAt) => ({
  ...payload,
  branches: payload.branches.map(b => (b.branch._id === branchId
    ? { ...b, overrides, updatedAt, resolved: resolvedFor({ ...ALL_ON, ...(overrides.modules || {}) }) }
    : b)),
})
const getWith = (payload) => (url) => (url === '/superadmin/operations/presets'
  ? Promise.resolve({ data: { data: CATALOG } })
  : Promise.resolve({ data: { data: payload } }))

beforeEach(() => {
  api.get.mockReset().mockImplementation(getWith({ profile: STORED, isDefault: true, resolved: resolvedFor(ALL_ON), validation: { errors: [], warnings: [] } }))
  api.post.mockReset().mockImplementation((_url, body) => Promise.resolve({
    data: { data: { profile: body.operations, resolved: resolvedFor(body.operations.modules), errors: [], warnings: tipsWarnings(body.operations), impact: [{ area: 'roles', severity: 'info', message: 'Waiter app switched off' }] } },
  }))
  api.put.mockReset().mockImplementation((url, body) => {
    if (url.includes('/operations/branches/')) {
      const branchId = url.split('/').pop()
      return Promise.resolve({ data: { data: { ...withBranchSaved(WITH_BRANCHES, branchId, body.overrides, '2026-10-19T10:00:00.000Z'), warnings: [] } } })
    }
    return Promise.resolve({
      data: { data: { profile: { ...body.operations, updatedAt: '2026-10-16T10:00:00.000Z' }, isDefault: false, resolved: resolvedFor(body.operations.modules), validation: { errors: [], warnings: tipsWarnings(body.operations) }, warnings: tipsWarnings(body.operations), impact: [] } },
    })
  })
  api.delete.mockReset().mockImplementation((url) => {
    const branchId = url.split('/').pop()
    return Promise.resolve({ data: { data: withBranchSaved(WITH_BRANCHES, branchId, {}, null) } })
  })
  toast.success.mockReset(); toast.error.mockReset()
})

describe('flowSteps', () => {
  test('full service = today: waiter serves, pay after', () => {
    const s = flowSteps(resolvedFor(ALL_ON))
    expect(s).toContain('Waiter serves the food')
    expect(s).toContain('Customer pays after the meal')
    expect(s).toContain('Customer tracks the order live')
  })

  test('first client (QR + payment): pay first, KOT at counter, no tracking, self-collect', () => {
    const s = flowSteps(resolvedFor(HOTEL_MODULES))
    expect(s[0]).toBe('Customer scans the table QR')
    expect(s).toContain('Order is created only after payment')
    expect(s).toContain('KOT prints at the counter (or shows on the admin screen)')
    expect(s.join(' ')).toMatch(/no live tracking/)
    expect(s).toContain('Customer collects the food')
    expect(s).not.toContain('Customer pays after the meal')
  })

  test('null → no steps', () => {
    expect(flowSteps(null)).toEqual([])
  })
})

describe('branch override helpers (pure)', () => {
  const tenant = { ...STORED, updatedAt: 'x', updatedBy: 'u', advanced: { 'customerApp.tips': false } }

  test('mergeStoredProfile: overrides win key by key, stamps are dropped, missing sections tolerated', () => {
    const merged = mergeStoredProfile(tenant, { modules: { waiter: false }, answers: { dineInPayment: 'payFirst' } })
    expect(merged.modules).toEqual({ ...ALL_ON, waiter: false })
    expect(merged.answers.dineInPayment).toBe('payFirst')
    expect(merged.answers.useTables).toBeNull()
    expect(merged.advanced).toEqual({ 'customerApp.tips': false })
    expect(merged.preset).toBe('fullService')
    expect(merged).not.toHaveProperty('updatedAt')
    expect(mergeStoredProfile(tenant, null).modules).toEqual(ALL_ON)
    expect(mergeStoredProfile(tenant, { preset: 'custom' }).preset).toBe('custom')
  })

  test('overrideKeys: lists the stored fields that differ (not the preset label)', () => {
    expect(overrideKeys(tenant, mergeStoredProfile(tenant, {}))).toEqual([])
    expect(overrideKeys(tenant, mergeStoredProfile(tenant, { preset: 'custom' }))).toEqual([])
    expect(overrideKeys(tenant, mergeStoredProfile(tenant, {
      modules: { waiter: false }, answers: { useTables: false }, advanced: { 'customerApp.tips': true, 'payment.takeaway': 'payAfter' },
    })).sort()).toEqual(['advanced.customerApp.tips', 'advanced.payment.takeaway', 'answers.useTables', 'modules.waiter'])
    expect(overrideKeys(null, tenant)).toEqual([])
  })

  test('branchOverrides: only the differences, plus the preset when it differs; stale equal overrides vanish', () => {
    expect(branchOverrides(tenant, mergeStoredProfile(tenant, {}))).toEqual({})
    // an override equal to the tenant value is not a difference any more
    expect(branchOverrides(tenant, mergeStoredProfile(tenant, { modules: { waiter: true } }))).toEqual({})
    expect(branchOverrides(tenant, mergeStoredProfile(tenant, { preset: 'custom', modules: { waiter: false, chef: false }, answers: { dineInPayment: 'payFirst' } })))
      .toEqual({ preset: 'custom', modules: { waiter: false, chef: false }, answers: { dineInPayment: 'payFirst' } })
    // explicit null answer over a tenant value is a difference and is sent
    const t2 = { ...tenant, answers: { ...tenant.answers, dineInPayment: 'payFirst' } }
    expect(branchOverrides(t2, mergeStoredProfile(t2, { answers: { dineInPayment: null } }))).toEqual({ answers: { dineInPayment: null } })
  })
})

describe('OperationsPanel', () => {
  const mount = async (props = {}) => {
    render(<OperationsPanel restaurant={restaurant} canEdit {...props} />)
    await screen.findByTestId('ops-modules')
  }

  test('loads the stored profile and shows the default note + current flow', async () => {
    await mount()
    expect(screen.getByTestId('ops-default-note')).toBeInTheDocument()
    expect(within(screen.getByTestId('ops-flow')).getByText('Waiter serves the food')).toBeInTheDocument()
    // Save is disabled until something changes
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    // a single-branch tenant (no branches[] in the payload) gets no selector
    expect(screen.queryByTestId('ops-scope')).toBeNull()
  })

  test('modules not in the plan are marked', async () => {
    await mount()
    const card = screen.getByTestId('ops-module-customerPayment')
    expect(within(card).getByText(/Not in plan/)).toBeInTheDocument()
  })

  test('applying the hotel preset previews the new flow and saves it', async () => {
    await mount()
    fireEvent.click(screen.getByText('Hotel / self-service, pay first'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = api.post.mock.calls.at(-1)[1]
    expect(body.operations.preset).toBe('hotelPayFirstSelfOrder')
    expect(body.operations.modules).toEqual(HOTEL_MODULES)
    expect(body).not.toHaveProperty('branchId')
    await waitFor(() => expect(within(screen.getByTestId('ops-flow')).getByText('Customer collects the food')).toBeInTheDocument())
    expect(screen.getByTestId('ops-impact')).toHaveTextContent('Waiter app switched off')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/superadmin/restaurants/r1/operations', expect.objectContaining({ operations: expect.objectContaining({ preset: 'hotelPayFirstSelfOrder' }) })))
    expect(toast.success).toHaveBeenCalled()
  })

  test('save sends the stamp of the version being edited (null when the restaurant has no profile yet)', async () => {
    await mount()
    fireEvent.click(screen.getByText('Hotel / self-service, pay first'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const body = api.put.mock.calls.at(-1)[1]
    expect(body.expectedUpdatedAt).toBeNull()
    expect(body.operations.updatedAt).toBeNull()
  })

  test('save sends the stored updatedAt as the stamp once a profile exists', async () => {
    const stored = { ...STORED, updatedAt: '2026-10-15T08:00:00.000Z' }
    api.get.mockImplementation(getWith({ profile: stored, isDefault: false, resolved: resolvedFor(ALL_ON), validation: { errors: [], warnings: [] } }))
    await mount()
    fireEvent.click(screen.getByLabelText('Waiter'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const body = api.put.mock.calls.at(-1)[1]
    expect(body.expectedUpdatedAt).toBe('2026-10-15T08:00:00.000Z')
    expect(body.operations.updatedAt).toBe('2026-10-15T08:00:00.000Z')
  })

  test('ticking a module switches the preset to custom', async () => {
    await mount()
    fireEvent.click(screen.getByLabelText('Waiter'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = api.post.mock.calls.at(-1)[1]
    expect(body.operations.preset).toBe('custom')
    expect(body.operations.modules.waiter).toBe(false)
  })

  test('answering a question stores the answer; "decide" stores null', async () => {
    await mount()
    const select = screen.getByLabelText('When does a dine-in customer pay?')
    fireEvent.change(select, { target: { value: 'payFirst' } })
    await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.answers.dineInPayment).toBe('payFirst'))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(() => expect(api.post.mock.calls.at(-1)[1].operations.answers.dineInPayment).toBeNull())
  })

  test('validation errors from the preview block saving', async () => {
    api.post.mockImplementation((_u, body) => Promise.resolve({
      data: { data: { profile: body.operations, resolved: resolvedFor(body.operations.modules), errors: ['no way to pay first'], warnings: [], impact: [] } },
    }))
    await mount()
    fireEvent.click(screen.getByLabelText('Customer payment'))
    await screen.findByTestId('ops-errors')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  test('advanced fine-tune stores a dot-path override', async () => {
    await mount()
    fireEvent.click(screen.getByText(/Advanced — fine-tune/))
    fireEvent.click(within(screen.getByTestId('ops-advanced')).getByLabelText('Tips'))
    await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.advanced).toEqual({ 'customerApp.tips': false }))
  })

  describe('tables.useTables:false (token-number mode) is a real option (design §12.2)', () => {
    test('the table-numbers question is enabled; choosing token numbers previews useTables:false', async () => {
      await mount()
      const select = screen.getByLabelText('Does the restaurant use table numbers?')
      expect(select).toBeEnabled()
      expect(screen.queryByText(/not available yet/i)).toBeNull()
      fireEvent.change(select, { target: { value: 'false' } })
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.answers.useTables).toBe(false))
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    })

    test('the advanced row for table numbers is editable too', async () => {
      api.get.mockImplementation(getWith({ profile: STORED, isDefault: true, resolved: resolvedFor(ALL_ON), validation: { errors: [], warnings: [] } }))
      const catalog = { ...CATALOG, advancedPaths: { ...CATALOG.advancedPaths, 'tables.useTables': 'boolean' } }
      api.get.mockImplementation((url) => (url === '/superadmin/operations/presets'
        ? Promise.resolve({ data: { data: catalog } })
        : Promise.resolve({ data: { data: { profile: STORED, isDefault: true, resolved: resolvedFor(ALL_ON), validation: { errors: [], warnings: [] } } } })))
      await mount()
      fireEvent.click(screen.getByText(/Advanced — fine-tune/))
      const box = within(screen.getByTestId('ops-advanced')).getByLabelText(/Table numbers in use/)
      expect(box).toBeEnabled()
      fireEvent.click(box)
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.advanced).toEqual({ 'tables.useTables': false }))
    })
  })

  describe('server warnings', () => {
    const NO_FLOOR = { ...STORED, preset: 'custom', modules: { ...ALL_ON, waiter: false, captain: false } }
    const getNoFloor = getWith({ profile: NO_FLOOR, isDefault: false, resolved: resolvedFor(NO_FLOOR.modules), validation: { errors: [], warnings: [TIPS_WARNING] } })

    test('a stored profile\'s warning is shown from the preview', async () => {
      api.get.mockImplementation(getNoFloor)
      await mount()
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      expect(await screen.findByTestId('ops-warnings')).toHaveTextContent(TIPS_WARNING)
    })

    test('read-only: the stored validation warning is shown without a preview', async () => {
      api.get.mockImplementation(getNoFloor)
      await mount({ canEdit: false })
      expect(screen.getByTestId('ops-warnings')).toHaveTextContent(TIPS_WARNING)
      expect(api.post).not.toHaveBeenCalled()
    })

    test('the save response warnings are shown after saving', async () => {
      await mount()
      fireEvent.click(screen.getByLabelText('Waiter'))
      fireEvent.click(screen.getByLabelText('Captain'))
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.modules.captain).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(api.put).toHaveBeenCalled())
      await waitFor(() => expect(toast.success).toHaveBeenCalled())
      expect(screen.getByTestId('ops-warnings')).toHaveTextContent(TIPS_WARNING)
    })
  })

  describe('optimistic concurrency: 409 OPERATIONS_STALE', () => {
    // operationsController.staleResponse: the latest GET-shaped payload rides in `data`
    const stale = (current) => ({ response: { status: 409, data: { success: false, code: 'OPERATIONS_STALE', message: 'stale', ...(current ? { data: current } : {}) } } })
    const editAndSave = async () => {
      fireEvent.click(screen.getByLabelText('Waiter'))
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.modules.waiter).toBe(false))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(api.put).toHaveBeenCalled())
    }

    test('reloads the latest version from the 409 body, discards the local edits, tells the admin', async () => {
      const theirs = { ...STORED, preset: 'custom', modules: { ...ALL_ON, chef: false }, updatedAt: '2026-10-16T09:00:00.000Z' }
      api.put.mockRejectedValue(stale({ profile: theirs, isDefault: false, resolved: resolvedFor(theirs.modules), validation: { errors: [], warnings: [] } }))
      await mount()
      await editAndSave()
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(STALE_PROFILE_NOTE))
      expect(toast.success).not.toHaveBeenCalled()
      // our edit (waiter off) is gone; theirs (chef off) is what is shown
      await waitFor(() => expect(screen.getByLabelText('Waiter')).toBeChecked())
      expect(screen.getByLabelText('Chef (kitchen screen)')).not.toBeChecked()
      // nothing dirty any more → Save disabled; not refetched
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(api.get.mock.calls.filter(([u]) => u.endsWith('/operations')).length).toBe(1)
      // the next save would carry their stamp
      fireEvent.click(screen.getByLabelText('Captain'))
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.modules.captain).toBe(false))
      api.put.mockImplementation((_url, body) => Promise.resolve({ data: { data: { profile: body.operations, isDefault: false, resolved: resolvedFor(body.operations.modules), validation: { errors: [], warnings: [] }, warnings: [] } } }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
      expect(api.put.mock.calls.at(-1)[1].expectedUpdatedAt).toBe('2026-10-16T09:00:00.000Z')
    })

    test('without the latest payload in the body it refetches the profile', async () => {
      api.put.mockRejectedValue(stale(null))
      await mount()
      await editAndSave()
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(STALE_PROFILE_NOTE))
      await waitFor(() => expect(api.get.mock.calls.filter(([u]) => u.endsWith('/operations')).length).toBe(2))
      await waitFor(() => expect(screen.getByLabelText('Waiter')).toBeChecked())
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    test('other 409s / errors keep the generic failure toast and the local edits', async () => {
      api.put.mockRejectedValue({ response: { status: 409, data: { code: 'SOMETHING_ELSE', message: 'nope' } } })
      await mount()
      await editAndSave()
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('nope'))
      expect(screen.getByLabelText('Waiter')).not.toBeChecked()
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    })
  })

  test('read-only for support-level super admins: inputs disabled, no preview calls, no Save', async () => {
    await mount({ canEdit: false })
    expect(screen.getByLabelText('Waiter')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })

  describe('per-branch overrides (design §12.1)', () => {
    const mountBranches = async (payload = WITH_BRANCHES, props = {}) => {
      api.get.mockImplementation(getWith(payload))
      await mount(props)
      await screen.findByTestId('ops-scope')
    }
    const scopeButton = (name) => within(screen.getByTestId('ops-scope')).getByRole('button', { name })
    const openBranch = async (name = /FC Road/) => {
      fireEvent.click(scopeButton(name))
      await screen.findByTestId('ops-branch-note')
    }
    const confirmSave = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    }

    test('the selector lists "Tenant default" and every active branch with its override count; inactive branches are hidden', async () => {
      await mountBranches()
      expect(scopeButton('Tenant default')).toHaveAttribute('aria-pressed', 'true')
      expect(scopeButton('Main')).toHaveAttribute('aria-pressed', 'false')
      expect(scopeButton(/FC Road/)).toHaveTextContent('1 override')
      expect(within(screen.getByTestId('ops-scope')).queryByRole('button', { name: /Old Kiosk/ })).toBeNull()
      // tenant default = today's editor
      expect(screen.queryByTestId('ops-branch-note')).toBeNull()
      expect(screen.getByLabelText('Waiter')).toBeChecked()
      expect(screen.queryByRole('button', { name: /Reset to tenant default/ })).toBeNull()
    })

    test('selecting a branch shows its resolved profile with "Overridden" tags and previews with branchId', async () => {
      await mountBranches()
      await openBranch()
      expect(scopeButton(/FC Road/)).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByTestId('ops-branch-note')).toHaveTextContent('FC Road overrides 1 setting from the tenant default')
      // the merged profile: the branch's waiter:false over the tenant's all-on
      expect(screen.getByLabelText('Waiter')).not.toBeChecked()
      expect(screen.getByLabelText('Captain')).toBeChecked()
      expect(screen.getByTestId('ops-override-modules.waiter')).toHaveTextContent('Overridden')
      expect(screen.queryByTestId('ops-override-modules.captain')).toBeNull()
      expect(screen.queryByTestId('ops-default-note')).toBeNull()
      // nothing changed yet → Save disabled, Reset offered (the branch has a stored override)
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Reset to tenant default/ })).toBeInTheDocument()
      // the preview for a branch names it and sends the merged candidate + its overrides
      await waitFor(() => expect(api.post).toHaveBeenCalled())
      const body = api.post.mock.calls.at(-1)[1]
      expect(body.branchId).toBe('b2')
      expect(body.operations.modules).toEqual({ ...ALL_ON, waiter: false })
      expect(body.overrides).toEqual({ preset: 'custom', modules: { waiter: false } })
      // a branch without overrides offers no Reset
      fireEvent.click(scopeButton('Main'))
      await waitFor(() => expect(screen.getByTestId('ops-branch-note')).toHaveTextContent('Main follows the tenant default'))
      expect(screen.getByLabelText('Waiter')).toBeChecked()
      expect(screen.queryByRole('button', { name: /Reset to tenant default/ })).toBeNull()
    })

    test('editing a field creates an override; save PUTs only the overrides with the branch\'s stamp; the impact names the branch', async () => {
      await mountBranches()
      await openBranch()
      fireEvent.change(screen.getByLabelText('When does a dine-in customer pay?'), { target: { value: 'payFirst' } })
      expect(await screen.findByTestId('ops-override-answers.dineInPayment')).toBeInTheDocument()
      expect(screen.getByTestId('ops-branch-note')).toHaveTextContent('FC Road overrides 2 settings')
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].overrides).toEqual({ preset: 'custom', modules: { waiter: false }, answers: { dineInPayment: 'payFirst' } }))
      expect(await screen.findByTestId('ops-impact')).toHaveTextContent('What changes at FC Road when you save')
      // switching scope is blocked while there are unsaved edits
      expect(scopeButton('Tenant default')).toBeDisabled()
      expect(screen.getByText('Save or discard your changes to switch')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(screen.getByRole('dialog')).toHaveTextContent('Change how FC Road operates?')
      expect(screen.getByRole('dialog')).toHaveTextContent('Only FC Road is affected')
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
      expect(api.put).toHaveBeenCalledWith('/superadmin/restaurants/r1/operations/branches/b2', {
        overrides: { preset: 'custom', modules: { waiter: false }, answers: { dineInPayment: 'payFirst' } },
        expectedUpdatedAt: FC_STAMP,
      })
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('FC Road')))
      // the saved branch stays selected, clean, with its new count
      expect(scopeButton(/FC Road/)).toHaveAttribute('aria-pressed', 'true')
      expect(scopeButton(/FC Road/)).toHaveTextContent('2 overrides')
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(screen.getByLabelText('When does a dine-in customer pay?')).toHaveValue('payFirst')
      // the next save carries the new branch stamp
      fireEvent.click(screen.getByLabelText('Chef (kitchen screen)'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
      confirmSave()
      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
      expect(api.put.mock.calls.at(-1)[1].expectedUpdatedAt).toBe('2026-10-19T10:00:00.000Z')
    })

    test('a branch with no override yet saves with expectedUpdatedAt null', async () => {
      await mountBranches()
      await openBranch('Main')
      fireEvent.click(screen.getByLabelText('Chef (kitchen screen)'))
      expect(await screen.findByTestId('ops-override-modules.chef')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
      confirmSave()
      await waitFor(() => expect(api.put).toHaveBeenCalledWith('/superadmin/restaurants/r1/operations/branches/b1', {
        overrides: { preset: 'custom', modules: { chef: false } },
        expectedUpdatedAt: null,
      }))
    })

    test('"Use tenant value" reverts one field; saving then sends empty overrides', async () => {
      await mountBranches()
      await openBranch()
      fireEvent.click(within(screen.getByTestId('ops-override-modules.waiter')).getByRole('button', { name: 'Use tenant value' }))
      expect(screen.getByLabelText('Waiter')).toBeChecked()
      expect(screen.queryByTestId('ops-override-modules.waiter')).toBeNull()
      expect(screen.getByTestId('ops-branch-note')).toHaveTextContent('FC Road follows the tenant default')
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
      confirmSave()
      await waitFor(() => expect(api.put).toHaveBeenCalledWith('/superadmin/restaurants/r1/operations/branches/b2', { overrides: {}, expectedUpdatedAt: FC_STAMP }))
    })

    test('advanced rows show the override tag and revert to the tenant value', async () => {
      const payload = { ...WITH_BRANCHES, profile: { ...WITH_BRANCHES.profile, advanced: { 'customerApp.tips': true } } }
      payload.branches = payload.branches.map(b => (b.branch._id === 'b2' ? { ...b, overrides: { ...FC_OVERRIDES, advanced: { 'customerApp.tips': false } } } : b))
      await mountBranches(payload)
      await openBranch()
      expect(screen.getByTestId('ops-branch-note')).toHaveTextContent('overrides 2 settings')
      fireEvent.click(screen.getByText(/Advanced — fine-tune/))
      const table = screen.getByTestId('ops-advanced')
      expect(within(table).getByTestId('ops-override-advanced.customerApp.tips')).toBeInTheDocument()
      expect(within(table).getByLabelText('Tips')).not.toBeChecked()
      expect(within(table).queryByRole('button', { name: 'Use default' })).toBeNull()
      fireEvent.click(within(table).getByRole('button', { name: 'Use tenant value' }))
      expect(within(table).getByLabelText('Tips')).toBeChecked()
      expect(within(table).queryByTestId('ops-override-advanced.customerApp.tips')).toBeNull()
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].overrides).toEqual({ preset: 'custom', modules: { waiter: false } }))
    })

    test('Discard restores the branch\'s stored profile', async () => {
      await mountBranches()
      await openBranch()
      fireEvent.click(screen.getByLabelText('Chef (kitchen screen)'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
      expect(screen.getByLabelText('Chef (kitchen screen)')).toBeChecked()
      expect(screen.getByLabelText('Waiter')).not.toBeChecked()
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    test('"Reset to tenant default" DELETEs the override after a confirm and shows the tenant profile for the branch', async () => {
      await mountBranches()
      await openBranch()
      fireEvent.click(screen.getByRole('button', { name: /Reset to tenant default/ }))
      expect(screen.getByRole('dialog')).toHaveTextContent('Reset FC Road to the tenant default?')
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/superadmin/restaurants/r1/operations/branches/b2'))
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('FC Road now follows the tenant default'))
      expect(scopeButton(/FC Road/)).toHaveAttribute('aria-pressed', 'true')
      expect(scopeButton(/FC Road/)).not.toHaveTextContent('override')
      expect(screen.getByLabelText('Waiter')).toBeChecked()
      expect(screen.queryByTestId('ops-override-modules.waiter')).toBeNull()
      expect(screen.queryByRole('button', { name: /Reset to tenant default/ })).toBeNull()
      expect(api.put).not.toHaveBeenCalled()
    })

    test('reset failure keeps the branch as it was', async () => {
      api.delete.mockRejectedValue({ response: { status: 500, data: { message: 'db down' } } })
      await mountBranches()
      await openBranch()
      fireEvent.click(screen.getByRole('button', { name: /Reset to tenant default/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('db down'))
      expect(screen.getByLabelText('Waiter')).not.toBeChecked()
      expect(screen.getByRole('button', { name: /Reset to tenant default/ })).toBeInTheDocument()
    })

    test('409 OPERATIONS_STALE on a branch save reloads the latest version and keeps the branch selected', async () => {
      const theirs = withBranchSaved(WITH_BRANCHES, 'b2', { preset: 'custom', modules: { chef: false } }, '2026-10-19T08:00:00.000Z')
      api.put.mockRejectedValueOnce({ response: { status: 409, data: { success: false, code: 'OPERATIONS_STALE', message: 'stale', data: theirs } } })
      await mountBranches()
      await openBranch()
      fireEvent.click(screen.getByLabelText('Captain'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
      confirmSave()
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(STALE_PROFILE_NOTE))
      expect(toast.success).not.toHaveBeenCalled()
      // theirs: chef off, waiter back on; our captain edit is gone
      await waitFor(() => expect(screen.getByLabelText('Chef (kitchen screen)')).not.toBeChecked())
      expect(screen.getByLabelText('Waiter')).toBeChecked()
      expect(screen.getByLabelText('Captain')).toBeChecked()
      expect(scopeButton(/FC Road/)).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
      expect(api.get.mock.calls.filter(([u]) => u.endsWith('/operations')).length).toBe(1)
      // the next save carries their stamp
      fireEvent.click(screen.getByLabelText('Captain'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
      confirmSave()
      await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2))
      expect(api.put.mock.calls.at(-1)[0]).toBe('/superadmin/restaurants/r1/operations/branches/b2')
      expect(api.put.mock.calls.at(-1)[1].expectedUpdatedAt).toBe('2026-10-19T08:00:00.000Z')
    })

    test('409 without the latest payload refetches and stays on the branch', async () => {
      api.put.mockRejectedValueOnce({ response: { status: 409, data: { code: 'OPERATIONS_STALE', message: 'stale' } } })
      await mountBranches()
      await openBranch()
      fireEvent.click(screen.getByLabelText('Captain'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
      confirmSave()
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith(STALE_PROFILE_NOTE))
      await waitFor(() => expect(api.get.mock.calls.filter(([u]) => u.endsWith('/operations')).length).toBe(2))
      await waitFor(() => expect(screen.getByLabelText('Captain')).toBeChecked())
      expect(scopeButton(/FC Road/)).toHaveAttribute('aria-pressed', 'true')
    })

    test('tenant default with branches present still saves through the tenant endpoint', async () => {
      await mountBranches()
      fireEvent.click(screen.getByLabelText('Chef (kitchen screen)'))
      await waitFor(() => expect(api.post.mock.calls.at(-1)?.[1].operations.modules.chef).toBe(false))
      expect(api.post.mock.calls.at(-1)[1]).not.toHaveProperty('branchId')
      confirmSave()
      await waitFor(() => expect(api.put).toHaveBeenCalled())
      expect(api.put.mock.calls.at(-1)[0]).toBe('/superadmin/restaurants/r1/operations')
      expect(api.put.mock.calls.at(-1)[1].expectedUpdatedAt).toBe('2026-10-15T08:00:00.000Z')
    })

    test('read-only: branches can be viewed with their tags but not changed or reset', async () => {
      await mountBranches(WITH_BRANCHES, { canEdit: false })
      await openBranch()
      expect(screen.getByTestId('ops-override-modules.waiter')).toHaveTextContent('Overridden')
      expect(within(screen.getByTestId('ops-override-modules.waiter')).queryByRole('button')).toBeNull()
      expect(screen.getByLabelText('Waiter')).toBeDisabled()
      expect(screen.queryByRole('button', { name: /Reset to tenant default/ })).toBeNull()
      expect(api.post).not.toHaveBeenCalled()
    })
  })
})
