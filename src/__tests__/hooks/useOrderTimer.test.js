import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useOrderTimer from '@/hooks/useOrderTimer'

const NOW = new Date('2026-10-03T12:00:00.000Z').getTime()
const ago = (sec) => new Date(NOW - sec * 1000).toISOString()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

describe('useOrderTimer elapsed formatting thresholds', () => {
  test.each([
    [0, '0s', 0],
    [12, '12s', 0],
    [59, '59s', 0],
    [60, '01:00', 1],
    [5 * 60 + 7, '05:07', 5],
    [59 * 60 + 59, '59:59', 59],
    [3600, '1h 00m', 60],
    [2 * 3600 + 5 * 60, '2h 05m', 125],
    [24 * 3600 - 1, '23h 59m', 1439],
    [24 * 3600, '1d 00h', 1440],
    [27 * 3600, '1d 03h', 1620],
  ])('%i seconds old → "%s" (%i whole minutes)', (sec, text, minutes) => {
    const { result } = renderHook(() => useOrderTimer(ago(sec)))
    expect(result.current).toEqual({ text, minutes, totalSec: sec })
  })

  test.each([
    ['a start time in the future (clock skew)', new Date(NOW + 5000).toISOString()],
    ['an unparseable date', 'not-a-date'],
    ['a missing date', undefined],
  ])('%s renders a safe 00:00', (_label, start) => {
    const { result } = renderHook(() => useOrderTimer(start))
    expect(result.current).toEqual({ text: '00:00', minutes: 0, totalSec: 0 })
  })

  test('subtracts the server clock offset (tablet clock 5 min fast)', () => {
    const fiveMin = 5 * 60 * 1000
    const { result } = renderHook(() => useOrderTimer(ago(90), fiveMin))
    // Local clock says 90s, but the device is 5 min fast → order is not
    // yet started from the server's point of view.
    expect(result.current.text).toBe('00:00')
    const { result: r2 } = renderHook(() => useOrderTimer(ago(400), fiveMin))
    expect(r2.current.totalSec).toBe(100)
  })
})

describe('useOrderTimer ticking and cleanup', () => {
  test('re-renders once per second with the new elapsed value', () => {
    const { result } = renderHook(() => useOrderTimer(ago(58)))
    expect(result.current.text).toBe('58s')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.text).toBe('59s')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.text).toBe('01:00')
  })

  test('clears its interval on unmount (no leaked timers)', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const { unmount } = renderHook(() => useOrderTimer(ago(10)))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(clearSpy).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('restarts exactly one interval when the start time changes', () => {
    const { result, rerender } = renderHook(({ s }) => useOrderTimer(s), { initialProps: { s: ago(10) } })
    rerender({ s: ago(3600) })
    expect(vi.getTimerCount()).toBe(1)
    expect(result.current.text).toBe('1h 00m')
  })
})
