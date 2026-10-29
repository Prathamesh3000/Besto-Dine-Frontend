import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
    list: vi.fn(), create: vi.fn(), get: vi.fn(), send: vi.fn(), receive: vi.fn(), cancel: vi.fn(),
    valuation: vi.fn(), branches: vi.fn(), items: vi.fn(),
}))
vi.mock('../../../utils/transferApi', () => ({ transferAPI: api }))
vi.mock('react-hot-toast', () => ({ toast: { success: vi.fn(), error: vi.fn() }, default: { success: vi.fn(), error: vi.fn() } }))

import TransfersTab from './TransfersTab'

const line = (extra = {}) => ({ _id: 'l1', itemName: 'Rice', qty: 3, unit: 'kg', outAppliedAt: null, inAppliedAt: null, returnedAt: null, receivedQty: null, shortfallQty: 0, ...extra })
const transfer = (status = 'draft', lines = [line()]) => ({ _id: 't1', number: 'TRF-0001', status, fromName: 'Main', toName: 'Annex', fromBranch: 'b1', toBranch: 'b2', lines })

beforeEach(() => {
    Object.values(api).forEach((f) => f.mockReset())
    api.list.mockResolvedValue({ data: { transfers: [] } })
    api.branches.mockResolvedValue({ data: { data: [{ _id: 'b1', name: 'Main' }, { _id: 'b2', name: 'Annex' }] } })
})

test('lists transfers and opens one', async () => {
    api.list.mockResolvedValue({ data: { transfers: [transfer('in_transit')] } })
    render(<TransfersTab />)
    fireEvent.click(await screen.findByText('TRF-0001'))
    expect(await screen.findByTestId('transfer-detail')).toBeTruthy()
})

test('creates a draft from the form, then sends it', async () => {
    api.items.mockResolvedValue({ data: { items: [{ _id: 'i1', name: 'Rice', unit: 'kg', currentStock: 10 }] } })
    api.create.mockResolvedValue({ data: { transfer: transfer('draft') } })
    api.send.mockResolvedValue({ data: { transfer: transfer('in_transit', [line({ outAppliedAt: 'x' })]) } })
    render(<TransfersTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'New transfer' }))
    fireEvent.change(screen.getByLabelText('From branch'), { target: { value: 'b1' } })
    fireEvent.change(screen.getByLabelText('To branch'), { target: { value: 'b2' } })
    await waitFor(() => expect(api.items).toHaveBeenCalledWith('b1'))
    await screen.findByRole('option', { name: /Rice/ })
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: 'i1' } })
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ fromBranch: 'b1', toBranch: 'b2', note: '', lines: [{ item: 'i1', qty: 3 }] }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.send).toHaveBeenCalledWith('t1'))
    expect(await screen.findByRole('button', { name: 'Receive' })).toBeTruthy()
})

test('partial receive sends the typed quantity', async () => {
    api.list.mockResolvedValue({ data: { transfers: [transfer('in_transit', [line({ outAppliedAt: 'x' })])] } })
    api.receive.mockResolvedValue({ data: { transfer: transfer('received', [line({ outAppliedAt: 'x', inAppliedAt: 'y', receivedQty: 2.5, shortfallQty: 0.5 })]) } })
    render(<TransfersTab />)
    fireEvent.click(await screen.findByText('TRF-0001'))
    fireEvent.change(await screen.findByLabelText('Received for Rice'), { target: { value: '2.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Receive' }))
    await waitFor(() => expect(api.receive).toHaveBeenCalledWith('t1', { lines: [{ lineId: 'l1', receivedQty: 2.5 }] }))
    expect((await screen.findByTestId('shortfall-l1')).textContent).toBe('0.5')
})

test('valuation table shows totals and flags unknown-cost items', async () => {
    api.valuation.mockResolvedValue({ data: {
        totals: { value: 760, unknownCostItems: 1, unknownCostListValue: 500 },
        byBranch: [{ key: 'main', label: 'Main', items: 2, value: 760 }],
        byItem: [
            { _id: 'a', name: 'Rice', category: 'Raw Ingredients', currentStock: 10, unit: 'kg', avgCost: 60, value: 600, unknownCost: false },
            { _id: 'b', name: 'Oil', category: 'Oils & Sauces', currentStock: 5, unit: 'L', avgCost: null, value: 0, unknownCost: true },
        ],
    } })
    render(<TransfersTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Valuation' }))
    expect((await screen.findByTestId('valuation-total')).textContent).toContain('760')
    expect(screen.getByTestId('valuation-unknown').textContent).toContain('1 item(s)')
    expect(screen.getByText('unknown')).toBeTruthy()
})
