/**
 * PlanFormModal - per-cycle prices (monthly / annual / 2-year, base excl. GST):
 * cross-cycle validation, per-month preview, and the `prices` payload.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})

import PlanFormModal from '@/Pages/SuperAdmin/components/PlanFormModal'

const goldPlan = {
  _id: 'p1', name: 'Gold', slug: 'gold', price: 1799, prices: { monthly: 1799, annual: 17999, biennial: 28799 },
  billingCycle: 'monthly', trialDays: 14, sortOrder: 2, isPublic: true, limits: {}, features: {},
}

const submit = () => userEvent.click(screen.getByRole('button', { name: /save changes|create plan/i }))
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } })

beforeEach(() => { vi.clearAllMocks() })

describe('PlanFormModal cycle prices', () => {
  test('edit mode loads the three prices and previews per-month equivalents', async () => {
    render(<PlanFormModal plan={goldPlan} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(document.getElementById('plan-annualPrice').value).toBe('17999'))
    expect(document.getElementById('plan-price').value).toBe('1799')
    expect(document.getElementById('plan-biennialPrice').value).toBe('28799')
    const preview = screen.getByTestId('cycle-preview')
    expect(preview).toHaveTextContent('₹1,499.92/month')
    expect(preview).toHaveTextContent('₹1,199.96/month')
    expect(preview).toHaveTextContent('saves 17% vs monthly')
    expect(preview).toHaveTextContent('owner pays ₹21,238.82 incl. 18% GST')
  })

  test('annual must be less than 12 x monthly - blocks the save', async () => {
    render(<PlanFormModal plan={goldPlan} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(document.getElementById('plan-annualPrice').value).toBe('17999'))
    type('plan-annualPrice', '21588') // 12 x 1799 = 21588 -> not strictly less
    await submit()
    expect(await screen.findByText(/Annual must be less than 12 x monthly/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  test('2-year must be less than 2 x annual - blocks the save', async () => {
    render(<PlanFormModal plan={goldPlan} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(document.getElementById('plan-annualPrice').value).toBe('17999'))
    type('plan-biennialPrice', '35998') // 2 x 17999
    await submit()
    expect(await screen.findByText(/2-year must be less than 2 x annual/)).toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  test('valid prices are sent as a prices object; blank = null (not sold)', async () => {
    api.put.mockResolvedValue({ data: { success: true, data: { ...goldPlan } } })
    const onSaved = vi.fn()
    render(<PlanFormModal plan={goldPlan} onClose={() => {}} onSaved={onSaved} />)
    await waitFor(() => expect(document.getElementById('plan-annualPrice').value).toBe('17999'))
    type('plan-biennialPrice', '')
    await submit()
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, payload, opts] = api.put.mock.calls[0]
    expect(url).toBe('/superadmin/plans/p1')
    expect(payload.prices).toEqual({ monthly: 1799, annual: 17999, biennial: null })
    expect(payload.price).toBe(1799)
    expect(payload).not.toHaveProperty('annualPrice')
    expect(payload).not.toHaveProperty('biennialPrice')
    expect(opts).toEqual({ _silent: true })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })

  test('create mode: blank annual / 2-year are allowed', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: goldPlan } })
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Starter')
    type('plan-price', '499')
    await submit()
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].prices).toEqual({ monthly: 499, annual: null, biennial: null })
  })
})
