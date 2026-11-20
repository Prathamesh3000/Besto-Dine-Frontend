import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
const moveTable = vi.hoisted(() => vi.fn())
vi.mock('@/utils/api', () => ({ tableAPI: { moveTable: (...a) => moveTable(...a) } }))

import toast from 'react-hot-toast'
import MoveTableModal from '@/Components/Common/MoveTableModal'

const area = { _id: 'a1', name: 'Main' }
const tables = [
  { _id: 't5', name: 'T5', status: 'occupied', area },
  { _id: 't6', name: 'T6', status: 'free', area },
  { _id: 't7', name: 'T7', status: 'occupied', area },
  { _id: 't8', name: 'T8', status: 'reserved', area },
  { _id: 't9', name: 'T9', status: 'free', mergedWith: ['t10'], area },
  { _id: 't11', name: 'T11', status: 'disabled', area },
  { _id: 't12', name: 'T12', status: 'alert', area },
]
const preview = { from: { id: 't5', name: 'T5' }, to: { id: 't6', name: 'T6' }, orderCount: 2, itemCount: 5, total: 640 }
const movedBody = { fromTableId: 't5', toTableId: 't6', fromName: 'T5', toName: 'T6', orderIds: ['o1'], orderCount: 2, itemCount: 5, total: 640 }

const setup = (props = {}) => {
  const onClose = vi.fn(), onMoved = vi.fn(), onRefresh = vi.fn()
  render(<MoveTableModal tables={tables} onClose={onClose} onMoved={onMoved} onRefresh={onRefresh} {...props} />)
  return { onClose, onMoved, onRefresh, user: userEvent.setup() }
}

beforeEach(() => {
  vi.clearAllMocks()
  moveTable.mockImplementation(async (body) => (body.preview
    ? { data: { success: true, preview } }
    : { data: { success: true, moved: movedBody } }))
})

describe('MoveTableModal', () => {
  test('step 1 lists only occupied/alert tables', () => {
    setup()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    for (const n of ['T5', 'T7', 'T12']) expect(screen.getByRole('button', { name: n })).toBeInTheDocument()
    for (const n of ['T6', 'T8', 'T9', 'T11']) expect(screen.queryByRole('button', { name: new RegExp(`^${n}$`) })).not.toBeInTheDocument()
    expect(screen.queryByText(/Merged/)).not.toBeInTheDocument()
  })

  test('step 2 enables only free tables, others disabled with reasons', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: 'T5' }))
    expect(screen.getByRole('button', { name: 'T6' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'T7, Occupied' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'T8, Reserved' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^T9, Merged/ })).toBeDisabled()
    expect(screen.getByText(/Unmerge tables first/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'T11, Disabled' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^T5/ })).not.toBeInTheDocument()
  })

  test('preselected source starts at step 2', () => {
    setup({ preselectedSourceId: 't5' })
    expect(screen.getByText(/choose a free table/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'T6' })).toBeEnabled()
  })

  test('confirm shows preview and Move calls the API once with the ids', async () => {
    const { user, onMoved, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'T5' }))
    await user.click(screen.getByRole('button', { name: 'T6' }))
    expect(moveTable).toHaveBeenCalledWith({ fromTableId: 't5', toTableId: 't6', preview: true })
    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(screen.getByText('₹640.00')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move' }))
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith(movedBody))
    expect(moveTable.mock.calls.filter(c => !c[0].preview)).toEqual([[{ fromTableId: 't5', toTableId: 't6' }]])
    expect(toast.success).toHaveBeenCalledWith('Moved T5 -> T6')
    expect(onClose).toHaveBeenCalled()
  })

  test('double tap sends one move', async () => {
    let release
    moveTable.mockImplementation((body) => (body.preview
      ? Promise.resolve({ data: { preview } })
      : new Promise((res) => { release = () => res({ data: { moved: movedBody } }) })))
    const { user } = setup({ preselectedSourceId: 't5' })
    await user.click(screen.getByRole('button', { name: 'T6' }))
    const btn = await screen.findByRole('button', { name: 'Move' })
    await waitFor(() => expect(btn).toBeEnabled())
    await user.dblClick(btn)
    release()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(moveTable.mock.calls.filter(c => !c[0].preview)).toHaveLength(1)
  })

  test('server error message is shown, no success callback; 409 refetches', async () => {
    moveTable.mockImplementation(async (body) => {
      if (body.preview) return { data: { preview } }
      throw { response: { status: 409, data: { success: false, code: 'MOVE_CONFLICT', message: 'Table changed, try again' } } }
    })
    const { user, onMoved, onRefresh } = setup({ preselectedSourceId: 't5' })
    await user.click(screen.getByRole('button', { name: 'T6' }))
    const btn = await screen.findByRole('button', { name: 'Move' })
    await waitFor(() => expect(btn).toBeEnabled())
    await user.click(btn)
    expect(await screen.findByRole('alert')).toHaveTextContent('Table changed, try again')
    expect(onMoved).not.toHaveBeenCalled()
    expect(onRefresh).toHaveBeenCalled()
  })

  test('Escape closes', async () => {
    const { user, onClose } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
