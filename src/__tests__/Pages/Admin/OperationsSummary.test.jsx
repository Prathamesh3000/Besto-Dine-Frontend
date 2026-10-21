import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const branchCtx = vi.hoisted(() => ({ value: {} }))
const EMPTY_CTX = { branches: [], selectedBranchId: null, lockedBranchName: '' }
vi.mock('@/Context/AdminBranchContext', () => ({ useAdminBranch: () => ({ ...EMPTY_CTX, ...branchCtx.value }) }))

import OperationsSummary, { countDifferences, overridesCountOf } from '@/Pages/Admin/components/OperationsSummary'
import { DEFAULT_OPERATIONS } from '@/utils/operations'

const HOTEL = {
  ...DEFAULT_OPERATIONS,
  modules: { qrOrdering: true, waiter: false, captain: false, chef: false, customerPayment: true },
  roles: { waiter: false, captain: false, chef: false },
  orderFlow: { ...DEFAULT_OPERATIONS.orderFlow, kitchenDisplay: false, servedStep: false, customerTracking: false },
  payment: { ...DEFAULT_OPERATIONS.payment, dineIn: 'payFirst', methods: { online: true, wallet: false, counterCash: true } },
}

const BRANCHES = [{ _id: 'main1', slug: 'main', name: 'Main' }, { _id: 'fc2', slug: 'fc-road', name: 'FC Road' }]

beforeEach(() => { api.get.mockReset(); branchCtx.value = {} })

describe('Admin → Settings → Operations (read-only)', () => {
  test('default setup', async () => {
    api.get.mockResolvedValue({ data: { data: { resolved: DEFAULT_OPERATIONS, isDefault: true } } })
    render(<OperationsSummary />)
    expect(await screen.findByText(/Standard full-service setup/)).toBeInTheDocument()
    expect(screen.getByText('After the meal')).toBeInTheDocument()
    expect(screen.getByText('Waiter serves the food')).toBeInTheDocument()
    // outside the branch provider nothing is known about the branch — no guess
    expect(screen.queryByTestId('operations-branch')).toBeNull()
    expect(screen.queryByTestId('operations-overrides')).toBeNull()
  })

  test('hotel setup: modules off are struck through, pay first, no tracking', async () => {
    api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false } } })
    render(<OperationsSummary />)
    expect(await screen.findByText(/Set up by BestoDine/)).toBeInTheDocument()
    expect(screen.getByText('Waiter').className).toMatch(/line-through/)
    expect(screen.getByText('QR ordering').className).not.toMatch(/line-through/)
    expect(screen.getByText('Before the order goes to the kitchen')).toBeInTheDocument()
    expect(screen.getByText('Online, Cash at the counter')).toBeInTheDocument()
    expect(screen.getByText(/no live tracking/)).toBeInTheDocument()
    // nothing editable
    expect(screen.queryByRole('button')).toBeNull()
  })

  test('load error is shown', async () => {
    api.get.mockImplementation(() => Promise.reject(Object.assign(new Error('fail'), { response: { data: { message: 'nope' } } })))
    render(<OperationsSummary />)
    expect(await screen.findByText('nope')).toBeInTheDocument()
  })

  describe('per-branch profile (design §12.1)', () => {
    test('names the branch picked in the admin switcher; no override line when the payload does not say', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'fc2' }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-branch')).toHaveTextContent('Showing the setup for FC Road.')
      expect(screen.queryByTestId('operations-overrides')).toBeNull()
      expect(api.get).toHaveBeenCalledWith('/settings/operations')
    })

    test('"This branch overrides N settings" from the server\'s overridesCount; the server\'s branch name wins', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'main1' }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, branchId: 'fc2', overridesCount: 2 } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-overrides')).toHaveTextContent('This branch overrides 2 settings from the tenant default.')
      expect(screen.getByTestId('operations-branch')).toHaveTextContent('FC Road')
    })

    test('overridesCount 0 → follows the tenant default (singular wording for 1)', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'fc2' }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, overridesCount: 0 } } })
      const { unmount } = render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-overrides')).toHaveTextContent('This branch follows the tenant default.')
      unmount()
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, overridesCount: 1 } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-overrides')).toHaveTextContent('overrides 1 setting from')
    })

    test('without overridesCount the count is computed only when the tenant profile is in the payload too', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'fc2' }
      const tenantResolved = { ...HOTEL, payment: { ...HOTEL.payment, dineIn: 'payAfter' } }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, tenantResolved } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-overrides')).toHaveTextContent('This branch overrides 1 setting from the tenant default.')
    })

    test('branchOverridden:true from GET /settings/operations → "This branch overrides the tenant default." when no count is known', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'fc2' }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, branchId: 'fc2', branchOverridden: true } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-overrides')).toHaveTextContent('This branch overrides the tenant default.')
      expect(screen.getAllByTestId('operations-overrides')).toHaveLength(1)
    })

    test('branchOverridden:false (or absent) without a count shows no override line; a count still wins over the flag', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'fc2' }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, branchId: 'fc2', branchOverridden: false } } })
      const { unmount } = render(<OperationsSummary />)
      await screen.findByTestId('operations-branch')
      expect(screen.queryByTestId('operations-overrides')).toBeNull()
      unmount()
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, branchId: 'fc2', branchOverridden: true, overridesCount: 2 } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-overrides')).toHaveTextContent('This branch overrides 2 settings from the tenant default.')
      expect(screen.getAllByTestId('operations-overrides')).toHaveLength(1)
    })

    test('a branch-pinned admin sees their branch name even before the branches list loads', async () => {
      branchCtx.value = { branches: [], selectedBranchId: 'fc2', lockedBranchName: 'FC Road' }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-branch')).toHaveTextContent('FC Road')
    })

    test('the unpinned owner with no branch selected is shown Main (what the server resolves)', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: null }
      api.get.mockResolvedValue({ data: { data: { resolved: DEFAULT_OPERATIONS, isDefault: true } } })
      render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-branch')).toHaveTextContent('Main')
    })

    test('switching branch refetches the (branch-resolved) profile', async () => {
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'main1' }
      api.get.mockResolvedValue({ data: { data: { resolved: DEFAULT_OPERATIONS, isDefault: true } } })
      const { rerender } = render(<OperationsSummary />)
      expect(await screen.findByTestId('operations-branch')).toHaveTextContent('Main')
      branchCtx.value = { branches: BRANCHES, selectedBranchId: 'fc2' }
      api.get.mockResolvedValue({ data: { data: { resolved: HOTEL, isDefault: false, overridesCount: 3 } } })
      rerender(<OperationsSummary />)
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2))
      expect(await screen.findByTestId('operations-branch')).toHaveTextContent('FC Road')
      expect(screen.getByTestId('operations-overrides')).toHaveTextContent('overrides 3 settings')
    })
  })

  describe('helpers', () => {
    test('countDifferences counts leaf values, ignoring plan-derived keys', () => {
      expect(countDifferences(DEFAULT_OPERATIONS, DEFAULT_OPERATIONS)).toBe(0)
      expect(countDifferences(DEFAULT_OPERATIONS, { ...DEFAULT_OPERATIONS, planBlocks: [{ module: 'chef' }], channels: { kiosk: false } })).toBe(0)
      expect(countDifferences(DEFAULT_OPERATIONS, { ...DEFAULT_OPERATIONS, tables: { ...DEFAULT_OPERATIONS.tables, useTables: false } })).toBe(1)
    })

    test('overridesCountOf: server count, else tenant+resolved comparison, else null', () => {
      expect(overridesCountOf(null)).toBeNull()
      expect(overridesCountOf({ resolved: HOTEL })).toBeNull()
      expect(overridesCountOf({ resolved: HOTEL, overridesCount: 4 })).toBe(4)
      expect(overridesCountOf({ resolved: HOTEL, tenant: { resolved: HOTEL } })).toBe(0)
    })
  })
})
