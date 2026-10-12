import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

import OperationsPanel, { flowSteps } from '@/Pages/SuperAdmin/components/OperationsPanel'

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
  ],
  advancedPaths: { 'customerApp.tips': 'boolean', 'payment.takeaway': ['payFirst', 'payAfter', 'either'] },
}

const STORED = { version: 1, preset: 'fullService', modules: ALL_ON, answers: { dineInPayment: null, counterCash: null, useTables: null }, advanced: {} }

const restaurant = {
  _id: 'r1',
  subscription: { features: { dineIn: true, waiterDashboard: true, kitchenDisplay: true, paymentGateway: false } },
}

beforeEach(() => {
  api.get.mockReset().mockImplementation((url) => {
    if (url === '/superadmin/operations/presets') return Promise.resolve({ data: { data: CATALOG } })
    return Promise.resolve({ data: { data: { profile: STORED, isDefault: true, resolved: resolvedFor(ALL_ON), validation: { errors: [], warnings: [] } } } })
  })
  api.post.mockReset().mockImplementation((_url, body) => Promise.resolve({
    data: { data: { profile: body.operations, resolved: resolvedFor(body.operations.modules), errors: [], warnings: [], impact: [{ area: 'roles', severity: 'info', message: 'Waiter app switched off' }] } },
  }))
  api.put.mockReset().mockImplementation((_url, body) => Promise.resolve({
    data: { data: { profile: body.operations, isDefault: false, resolved: resolvedFor(body.operations.modules), validation: { errors: [], warnings: [] } } },
  }))
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
  })

  test('modules not in the plan are marked', async () => {
    await mount()
    const card = screen.getByLabelText('Customer payment').closest('label')
    expect(within(card).getByText(/Not in plan/)).toBeInTheDocument()
  })

  test('applying the hotel preset previews the new flow and saves it', async () => {
    await mount()
    fireEvent.click(screen.getByText('Hotel / self-service, pay first'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const body = api.post.mock.calls.at(-1)[1]
    expect(body.operations.preset).toBe('hotelPayFirstSelfOrder')
    expect(body.operations.modules).toEqual(HOTEL_MODULES)
    await waitFor(() => expect(within(screen.getByTestId('ops-flow')).getByText('Customer collects the food')).toBeInTheDocument())
    expect(screen.getByTestId('ops-impact')).toHaveTextContent('Waiter app switched off')

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/superadmin/restaurants/r1/operations', { operations: expect.objectContaining({ preset: 'hotelPayFirstSelfOrder' }) }))
    expect(toast.success).toHaveBeenCalled()
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

  test('read-only for support-level super admins: inputs disabled, no preview calls, no Save', async () => {
    await mount({ canEdit: false })
    expect(screen.getByLabelText('Waiter')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(api.post).not.toHaveBeenCalled()
  })
})
