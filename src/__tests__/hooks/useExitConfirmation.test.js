import { describe, test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useExitConfirmation from '@/hooks/useExitConfirmation'

const pop = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: null })) })

describe('useExitConfirmation', () => {
  test('pushes one sentinel history entry on mount', () => {
    const push = vi.spyOn(window.history, 'pushState')
    renderHook(() => useExitConfirmation())
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toEqual({ __exitGuard: true })
  })

  test('a back press re-pushes the sentinel and opens the sheet', () => {
    const { result } = renderHook(() => useExitConfirmation())
    const push = vi.spyOn(window.history, 'pushState')
    pop()
    expect(result.current.isOpen).toBe(true)
    expect(push).toHaveBeenCalledTimes(1)
  })

  test('cancelExit (Stay) closes the sheet; the guard stays armed', () => {
    const { result } = renderHook(() => useExitConfirmation())
    pop()
    act(() => result.current.cancelExit())
    expect(result.current.isOpen).toBe(false)
    pop()
    expect(result.current.isOpen).toBe(true)
  })

  test('confirmExit detaches the guard and goes back two entries', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    const { result } = renderHook(() => useExitConfirmation())
    pop()
    act(() => result.current.confirmExit())
    expect(result.current.isOpen).toBe(false)
    expect(go).toHaveBeenCalledWith(-2)
    pop()
    expect(result.current.isOpen).toBe(false)
  })

  test('disabled guard ignores back presses; re-enabling takes effect without re-mounting', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const { result, rerender } = renderHook(({ on }) => useExitConfirmation(on), { initialProps: { on: false } })
    pop()
    expect(result.current.isOpen).toBe(false)
    rerender({ on: true })
    pop()
    expect(result.current.isOpen).toBe(true)
    // only the mount sentinel + the one re-push from the enabled pop
    expect(push).toHaveBeenCalledTimes(2)
  })

  test('removes its popstate listener on unmount', () => {
    const { result, unmount } = renderHook(() => useExitConfirmation())
    unmount()
    pop()
    expect(result.current.isOpen).toBe(false)
  })
})
