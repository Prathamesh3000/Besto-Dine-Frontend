import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useDebouncedValue from '@/hooks/useDebouncedValue'

beforeEach(() => { vi.useFakeTimers() })

describe('useDebouncedValue', () => {
  test('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a'))
    expect(result.current).toBe('a')
  })

  test('emits only after the value has been stable for the default 350ms', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), { initialProps: { v: 'a' } })
    rerender({ v: 'ab' })
    act(() => { vi.advanceTimersByTime(349) })
    expect(result.current).toBe('a')
    act(() => { vi.advanceTimersByTime(1) })
    expect(result.current).toBe('ab')
  })

  test('each keystroke restarts the timer so only the last value lands', () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: '' } })
    for (const v of ['s', 'sp', 'spi', 'spic']) {
      rerender({ v })
      act(() => { vi.advanceTimersByTime(60) })
    }
    expect(result.current).toBe('')
    act(() => { vi.advanceTimersByTime(100) })
    expect(result.current).toBe('spic')
  })

  test('clears the pending timer on unmount', () => {
    const { rerender, unmount } = renderHook(({ v }) => useDebouncedValue(v, 100), { initialProps: { v: 1 } })
    rerender({ v: 2 })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
