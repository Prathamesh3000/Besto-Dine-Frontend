import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
    list: vi.fn(), create: vi.fn(), get: vi.fn(), setCounts: vi.fn(), submit: vi.fn(), apply: vi.fn(),
}))
vi.mock('../../../utils/api', () => ({ stocktakeAPI: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: { success: vi.fn(), error: vi.fn() } }))

import StocktakeTab from './StocktakeTab'

const take = (status = 'draft', lines) => ({
    _id: 's1', name: 'Oct count', status,
    lines: lines || [
        { _id: 'l1', itemName: 'Rice', itemCode: 'INV-001', expectedQty: 10, unit: 'kg', countedQty: null, variance: null },
        { _id: 'l2', itemName: 'Oil', itemCode: 'INV-002', expectedQty: 5, unit: 'L', countedQty: 4, variance: -1 },
    ],
})

beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.list.mockResolvedValue({ data: { stocktakes: [] } })
})

test('lists stocktakes and starts a count', async () => {
    api.list.mockResolvedValue({ data: { stocktakes: [{ _id: 's1', name: 'Oct count', status: 'applied', lineCount: 2, countedCount: 2, varianceCount: 1 }] } })
    api.create.mockResolvedValue({ data: { stocktake: take() } })
    render(<StocktakeTab />)
    expect(await screen.findByText('Oct count')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start count' }))
    expect(await screen.findByTestId('stocktake-detail')).toBeTruthy()
    expect(api.create).toHaveBeenCalled()
})

test('shows variance live as counts are typed, then saves and submits them', async () => {
    api.create.mockResolvedValue({ data: { stocktake: take() } })
    api.setCounts.mockResolvedValue({ data: { stocktake: take('draft') } })
    api.submit.mockResolvedValue({ data: { stocktake: take('submitted') } })
    render(<StocktakeTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start count' }))
    const input = await screen.findByLabelText('Count for Rice')
    fireEvent.change(input, { target: { value: '8.5' } })
    expect(screen.getByTestId('variance-l1').textContent).toBe('-1.5')
    expect(screen.getByTestId('variance-l2').textContent).toBe('-1')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('s1'))
    expect(api.setCounts).toHaveBeenCalledWith('s1', [{ line: 'l1', countedQty: 8.5 }])
    expect(await screen.findByRole('button', { name: /Apply 1 correction/ })).toBeTruthy()
})

test('apply is offered only once submitted and calls the apply endpoint', async () => {
    api.list.mockResolvedValue({ data: { stocktakes: [{ _id: 's1', name: 'Oct count', status: 'submitted', lineCount: 2, countedCount: 2, varianceCount: 1 }] } })
    api.get.mockResolvedValue({ data: { stocktake: take('submitted') } })
    api.apply.mockResolvedValue({ data: { applied: 1, failed: [], stocktake: take('applied') } })
    render(<StocktakeTab />)
    fireEvent.click(await screen.findByText('Oct count'))
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: /Apply 1 correction/ }))
    await waitFor(() => expect(api.apply).toHaveBeenCalledWith('s1'))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Apply/ })).toBeNull())
})
