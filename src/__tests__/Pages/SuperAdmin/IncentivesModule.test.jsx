import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast, default: toast }))

import PlanFormModal from '@/Pages/SuperAdmin/components/PlanFormModal'
import RestaurantModulesPanel from '@/Pages/SuperAdmin/components/RestaurantModulesPanel'
import { MODULE_KEYS, resolveModule } from '@/utils/moduleAccess'
import { FEATURE_LABELS } from '@/utils/featureLabels'

beforeEach(() => { vi.clearAllMocks() })

describe('incentives feature key', () => {
  test('is a module key with a label', () => {
    expect(MODULE_KEYS).toContain('incentives')
    expect(FEATURE_LABELS.incentives).toBe('Staff Incentives')
  })

  test('resolveModule: add-on switches it on, override off wins', () => {
    const r = { subscription: { features: { incentives: false } }, addons: [{ key: 'incentives', status: 'active' }] }
    expect(resolveModule(r, 'incentives')).toMatchObject({ on: true, source: 'addon', inPlan: false })
    expect(resolveModule({ ...r, featureOverrides: { incentives: false } }, 'incentives')).toMatchObject({ on: false, source: 'override' })
  })
})

describe('PlanFormModal incentives toggle', () => {
  test('renders the toggle and sends features.incentives in the payload', async () => {
    api.put.mockResolvedValue({ data: { success: true, data: { _id: 'p1' } } })
    const plan = { _id: 'p1', name: 'Silver', slug: 'silver', price: 0, features: { incentives: false } }
    render(<PlanFormModal plan={plan} onClose={() => {}} onSaved={() => {}} />)
    const toggle = screen.getByRole('button', { name: /Staff Incentives/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][0]).toBe('/superadmin/plans/p1')
    expect(api.put.mock.calls[0][1].features.incentives).toBe(true)
  })
})

describe('RestaurantModulesPanel incentives', () => {
  const restaurant = { _id: 'r1', subscription: { features: {} }, addons: [], featureOverrides: {} }

  test('override select sends featureOverrides.incentives', async () => {
    api.get.mockResolvedValue({ data: { data: [{ key: 'incentives', monthlyPrice: 299 }] } })
    api.patch.mockResolvedValue({ data: {} })
    render(<RestaurantModulesPanel restaurant={restaurant} canEdit onChanged={() => {}} />)
    fireEvent.change(screen.getByLabelText('Override for Staff Incentives'), { target: { value: 'on' } })
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/superadmin/restaurants/r1', { featureOverrides: { incentives: true } }))
  })

  test('add-on can be granted at the catalog price and revoked', async () => {
    api.get.mockResolvedValue({ data: { data: [{ key: 'incentives', monthlyPrice: 299 }] } })
    api.post.mockResolvedValue({ data: {} })
    const { unmount } = render(<RestaurantModulesPanel restaurant={restaurant} canEdit onChanged={() => {}} />)
    await screen.findByText(/catalog ₹299\/mo/, {}, { timeout: 2000 }).catch(() => {})
    fireEvent.click(screen.getByRole('button', { name: /Add-on/ }))
    const select = await screen.findByDisplayValue(/Staff Incentives/)
    fireEvent.change(select, { target: { value: 'incentives' } })
    fireEvent.click(screen.getByRole('button', { name: /Activate add-on/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/superadmin/restaurants/r1/addons', expect.objectContaining({ key: 'incentives', price: 299 })))
    unmount()

    api.delete.mockResolvedValue({ data: {} })
    const withAddon = { ...restaurant, addons: [{ _id: 'a1', key: 'incentives', status: 'active', price: 299 }] }
    render(<RestaurantModulesPanel restaurant={withAddon} canEdit onChanged={() => {}} />)
    fireEvent.click(screen.getByLabelText('Cancel Staff Incentives add-on'))
    const confirm = await screen.findAllByRole('button', { name: /cancel|confirm|yes|remove/i })
    expect(confirm.length).toBeGreaterThan(0)
  })
})
