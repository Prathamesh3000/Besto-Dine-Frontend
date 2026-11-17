import { describe, it, expect, vi } from 'vitest'

const original = vi.hoisted(() => vi.fn())
const dismiss = vi.hoisted(() => vi.fn())
vi.mock('react-hot-toast', () => ({ default: { error: original, dismiss } }))

import toast from 'react-hot-toast'
import { installErrorToastDedupe } from '@/utils/dedupeToast'

describe('installErrorToastDedupe', () => {
  it('gives error toasts their message as id, keeps an explicit id, and installs once', () => {
    installErrorToastDedupe()
    installErrorToastDedupe()
    toast.error('Insufficient balance')
    expect(original).toHaveBeenLastCalledWith('Insufficient balance', { id: 'Insufficient balance' })
    toast.error('Same', { duration: 4000 })
    expect(original).toHaveBeenLastCalledWith('Same', { id: 'Same', duration: 4000 })
    toast.error('Own id', { id: 'x' })
    expect(original).toHaveBeenLastCalledWith('Own id', { id: 'x' })
    expect(dismiss).toHaveBeenCalledWith('Own id')
    toast.error('Twice'); toast.error('Twice')
    expect(original.mock.calls.slice(-2).every(c => c[1].id === 'Twice')).toBe(true)
    expect(original).toHaveBeenCalledTimes(5)
  })
})
