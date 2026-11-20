import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/utils/api', () => ({ default: {}, settingsAPI: { updateSettings: vi.fn() } }))

import { settingsAPI } from '@/utils/api'
import TableTimerSettings from '@admin/components/TableTimerSettings'
import { validateTableTimer } from '@/utils/tableTimer'

beforeEach(() => { vi.clearAllMocks(); settingsAPI.updateSettings.mockResolvedValue({ data: {} }) })

describe('validateTableTimer', () => {
  test.each([
    [60, 90, {}], [1, 2, {}], [1, 1440, {}],
    [0, 90, { amber: true }], [60, 1441, { red: true }], [60, 60, { red: true }],
    [90, 60, { red: true }], [1.5, 90, { amber: true }], ['', 90, { amber: true }],
  ])('%s / %s', (a, r, expected) => {
    const errs = validateTableTimer(a, r)
    expect(!!errs.amber).toBe(!!expected.amber)
    expect(!!errs.red).toBe(!!expected.red)
  })
})

describe('TableTimerSettings', () => {
  test('shows defaults and saves { tableTimer }', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    render(<TableTimerSettings initial={{}} onSaved={onSaved} />)
    expect(screen.getByLabelText('Amber after (minutes)')).toHaveValue(60)
    expect(screen.getByLabelText('Red after (minutes)')).toHaveValue(90)
    await user.clear(screen.getByLabelText('Amber after (minutes)'))
    await user.type(screen.getByLabelText('Amber after (minutes)'), '45')
    await user.click(screen.getByRole('button', { name: /save table timer/i }))
    await waitFor(() => expect(settingsAPI.updateSettings).toHaveBeenCalledWith({ tableTimer: { amberMinutes: 45, redMinutes: 90 } }))
    expect(onSaved).toHaveBeenCalled()
  })

  test('red <= amber blocks save with a clear message', async () => {
    const user = userEvent.setup()
    render(<TableTimerSettings initial={{ amberMinutes: 60, redMinutes: 90 }} />)
    await user.clear(screen.getByLabelText('Red after (minutes)'))
    await user.type(screen.getByLabelText('Red after (minutes)'), '60')
    await user.click(screen.getByRole('button', { name: /save table timer/i }))
    expect(screen.getByText('Red must be later than amber')).toBeInTheDocument()
    expect(settingsAPI.updateSettings).not.toHaveBeenCalled()
  })

  test('out-of-range blocks save; server error is shown', async () => {
    const user = userEvent.setup()
    render(<TableTimerSettings initial={{ amberMinutes: 60, redMinutes: 90 }} />)
    await user.clear(screen.getByLabelText('Red after (minutes)'))
    await user.type(screen.getByLabelText('Red after (minutes)'), '2000')
    await user.click(screen.getByRole('button', { name: /save table timer/i }))
    expect(screen.getByText(/between 1 and 1440/)).toBeInTheDocument()
    expect(settingsAPI.updateSettings).not.toHaveBeenCalled()

    settingsAPI.updateSettings.mockImplementation(async () => { throw { response: { data: { message: 'Nope from server' } } } })
    await user.clear(screen.getByLabelText('Red after (minutes)'))
    await user.type(screen.getByLabelText('Red after (minutes)'), '100')
    await user.click(screen.getByRole('button', { name: /save table timer/i }))
    await waitFor(() => expect(screen.getAllByText('Nope from server').length).toBeGreaterThan(0))
  })
})
