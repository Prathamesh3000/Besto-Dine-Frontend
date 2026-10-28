import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../../utils/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import ClearMenuModal from './ClearMenuModal'

const COUNTS = { data: { data: { items: 12, recipes: 3, combos: 2, categories: 5, confirmPhrase: 'CLEAR MENU' } } }

beforeEach(() => { api.post.mockReset() })

test('shows what will be removed and keeps the button disabled until the phrase is typed', async () => {
    api.post.mockResolvedValueOnce(COUNTS)
    render(<ClearMenuModal onClose={vi.fn()} onComplete={vi.fn()} />)
    const summary = await screen.findByTestId('clear-summary')
    expect(summary.textContent).toMatch(/12 dishes/)
    expect(summary.textContent).toMatch(/3 recipes/)
    expect(summary.textContent).toMatch(/2 combos/)
    expect(api.post).toHaveBeenCalledWith('/menu/clear', { dryRun: true })
    const btn = screen.getByRole('button', { name: /Clear menu/ })
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'clear men' } })
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'clear menu' } })
    expect(btn).toBeEnabled()
})

test('sends the confirmation and category choice, then completes', async () => {
    api.post.mockResolvedValueOnce(COUNTS).mockResolvedValueOnce({ data: { data: { items: 12 } } })
    const onComplete = vi.fn()
    const onClose = vi.fn()
    render(<ClearMenuModal onClose={onClose} onComplete={onComplete} />)
    await screen.findByTestId('clear-summary')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'CLEAR MENU' } })
    fireEvent.click(screen.getByRole('button', { name: /Clear menu/ }))
    await waitFor(() => expect(onComplete).toHaveBeenCalled())
    expect(api.post).toHaveBeenLastCalledWith('/menu/clear', { confirm: 'CLEAR MENU', includeCategories: true })
    expect(onClose).toHaveBeenCalled()
})

test('a failed check shows the server message and offers no delete', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { message: 'Access denied.' } } })
    render(<ClearMenuModal onClose={vi.fn()} onComplete={vi.fn()} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Access denied.')
    expect(screen.getByRole('button', { name: /Clear menu/ })).toBeDisabled()
})
