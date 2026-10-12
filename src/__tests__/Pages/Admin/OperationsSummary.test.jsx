import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))

import OperationsSummary from '@/Pages/Admin/components/OperationsSummary'
import { DEFAULT_OPERATIONS } from '@/utils/operations'

const HOTEL = {
  ...DEFAULT_OPERATIONS,
  modules: { qrOrdering: true, waiter: false, captain: false, chef: false, customerPayment: true },
  roles: { waiter: false, captain: false, chef: false },
  orderFlow: { ...DEFAULT_OPERATIONS.orderFlow, kitchenDisplay: false, servedStep: false, customerTracking: false },
  payment: { ...DEFAULT_OPERATIONS.payment, dineIn: 'payFirst', methods: { online: true, wallet: false, counterCash: true } },
}

beforeEach(() => { api.get.mockReset() })

describe('Admin → Settings → Operations (read-only)', () => {
  test('default setup', async () => {
    api.get.mockResolvedValue({ data: { data: { resolved: DEFAULT_OPERATIONS, isDefault: true } } })
    render(<OperationsSummary />)
    expect(await screen.findByText(/Standard full-service setup/)).toBeInTheDocument()
    expect(screen.getByText('After the meal')).toBeInTheDocument()
    expect(screen.getByText('Waiter serves the food')).toBeInTheDocument()
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
})
