/**
 * PlanFormModal - tier rank, structured free trial, badge and highlights
 * (TRIAL_SIGNUP_AND_LEADS_PLAN.md §2): payload keys match the backend
 * validator field-for-field, tier 0 survives as the number 0, blank tier
 * blocks the save, trial toggle produces `trial` + synced `trialDays`.
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
  billingCycle: 'monthly', tier: 20, trial: { enabled: true, durationDays: 14 }, trialDays: 14,
  badge: 'Most popular', highlights: ['Kitchen display', 'Waiter app'], sortOrder: 2, isPublic: true, limits: {}, features: {},
}

const PAYLOAD_KEYS = ['name', 'description', 'price', 'prices', 'billingCycle', 'tier', 'trial', 'trialDays', 'badge', 'highlights', 'sortOrder', 'isPublic', 'limits', 'features']

const submit = () => userEvent.click(screen.getByRole('button', { name: /save changes|create plan/i }))
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } })
const trialToggle = () => document.getElementById('plan-trialEnabled')

beforeEach(() => { vi.clearAllMocks() })

describe('PlanFormModal tier / trial / card fields', () => {
  test('create: tier 0 is sent as the number 0 and the payload has exactly the validator keys (+ slug)', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: {} } })
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Free')
    type('plan-price', '0')
    type('plan-tier', '0')
    await submit()
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const payload = api.post.mock.calls[0][1]
    expect(payload.tier).toBe(0)
    expect(typeof payload.tier).toBe('number')
    expect(payload.slug).toBe('free')
    expect(Object.keys(payload).sort()).toEqual([...PAYLOAD_KEYS, 'slug'].sort())
    // No trial by default: structured object + synced legacy mirror.
    expect(payload.trial).toEqual({ enabled: false, durationDays: 14 })
    expect(payload.trialDays).toBe(0)
    expect(payload.badge).toBe('')
    expect(payload.highlights).toEqual([])
  })

  test('create: blank tier blocks the submit with an inline error', async () => {
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Starter')
    type('plan-price', '499')
    await submit()
    expect(await screen.findByText(/Tier rank is required/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    expect(document.getElementById('plan-tier')).toHaveAttribute('aria-invalid', 'true')
  })

  test('tier must be a whole number >= 0', async () => {
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Starter')
    type('plan-price', '499')
    type('plan-tier', '-1')
    await submit()
    expect(await screen.findByText(/Tier rank must be a whole number/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  test('trial toggle on + length → trial object and synced trialDays', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: {} } })
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Starter')
    type('plan-price', '499')
    type('plan-tier', '10')
    expect(document.getElementById('plan-trialDays')).toBeDisabled()
    await userEvent.click(trialToggle())
    expect(trialToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(document.getElementById('plan-trialDays')).not.toBeDisabled()
    type('plan-trialDays', '30')
    await submit()
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const payload = api.post.mock.calls[0][1]
    expect(payload.trial).toEqual({ enabled: true, durationDays: 30 })
    expect(payload.trialDays).toBe(30)
    expect(payload).not.toHaveProperty('trialEnabled')
    expect(payload).not.toHaveProperty('trialDurationDays')
  })

  test('trial enabled with an out-of-range length blocks the save', async () => {
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Starter')
    type('plan-price', '499')
    type('plan-tier', '10')
    await userEvent.click(trialToggle())
    type('plan-trialDays', '0')
    await submit()
    expect(await screen.findByText(/Trial length must be 1–3650 days/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  test('edit: pre-fills tier, trial, badge and highlights from the plan; turning the trial off sends enabled=false and trialDays 0', async () => {
    api.put.mockResolvedValue({ data: { success: true, data: goldPlan } })
    render(<PlanFormModal plan={goldPlan} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(document.getElementById('plan-tier').value).toBe('20'))
    expect(trialToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(document.getElementById('plan-trialDays').value).toBe('14')
    expect(document.getElementById('plan-badge').value).toBe('Most popular')
    expect(document.getElementById('plan-highlights').value).toBe('Kitchen display\nWaiter app')
    await userEvent.click(trialToggle())
    await submit()
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const [url, payload] = api.put.mock.calls[0]
    expect(url).toBe('/superadmin/plans/p1')
    expect(payload.tier).toBe(20)
    expect(payload.trial).toEqual({ enabled: false, durationDays: 14 })
    expect(payload.trialDays).toBe(0)
    expect(payload.badge).toBe('Most popular')
    expect(payload.highlights).toEqual(['Kitchen display', 'Waiter app'])
    expect(payload).not.toHaveProperty('slug')
    expect(payload).not.toHaveProperty('highlightsText')
    expect(Object.keys(payload).sort()).toEqual([...PAYLOAD_KEYS].sort())
  })

  test('edit: a legacy plan with only trialDays pre-fills the trial toggle from it', async () => {
    const legacy = { ...goldPlan, trial: undefined, trialDays: 7, tier: 0 }
    render(<PlanFormModal plan={legacy} onClose={() => {}} onSaved={() => {}} />)
    await waitFor(() => expect(document.getElementById('plan-trialDays').value).toBe('7'))
    expect(trialToggle()).toHaveAttribute('aria-pressed', 'true')
    // tier 0 pre-fills as "0", not blank.
    expect(document.getElementById('plan-tier').value).toBe('0')
  })

  test('highlights: one per line, trimmed, blanks dropped; more than 8 blocks the save', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: {} } })
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Starter')
    type('plan-price', '499')
    type('plan-tier', '10')
    type('plan-highlights', '  Kitchen display \n\n   \nWaiter app\r\nTally export  ')
    await submit()
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    expect(api.post.mock.calls[0][1].highlights).toEqual(['Kitchen display', 'Waiter app', 'Tally export'])

    api.post.mockClear()
    type('plan-highlights', Array.from({ length: 9 }, (_, i) => `Point ${i + 1}`).join('\n'))
    await submit()
    expect(await screen.findByText(/At most 8 highlights/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  test('badge longer than 40 characters blocks the save', async () => {
    render(<PlanFormModal onClose={() => {}} onSaved={() => {}} />)
    type('plan-name', 'Starter')
    type('plan-price', '499')
    type('plan-tier', '10')
    type('plan-badge', 'x'.repeat(41))
    await submit()
    expect(await screen.findByText(/Badge must be 40 characters or fewer/)).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })
})
