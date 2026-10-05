import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

import useBlockBackNav from '@/hooks/useBlockBackNav'

const pop = (state = null) => act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state })) })

beforeEach(() => {
  navigate.mockReset()
  window.history.replaceState({ key: 'k1', idx: 0 }, '', '/payment-success')
})

describe('useBlockBackNav', () => {
  test('pushes one sentinel that preserves router state', () => {
    const push = vi.spyOn(window.history, 'pushState')
    renderHook(() => useBlockBackNav('/customer/home'))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push.mock.calls[0][0]).toEqual({ key: 'k1', idx: 0, __blockBackNav: true })
  })

  test('does not pile up sentinels when the current entry already is one (StrictMode/remount)', () => {
    window.history.replaceState({ __blockBackNav: true }, '', '/x')
    const push = vi.spyOn(window.history, 'pushState')
    renderHook(() => useBlockBackNav('/home'))
    expect(push).not.toHaveBeenCalled()
  })

  test('a back press redirects once with replace to the latest target', () => {
    const { rerender } = renderHook(({ to }) => useBlockBackNav(to), { initialProps: { to: '/a' } })
    rerender({ to: '/b' })
    pop()
    pop()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/b', { replace: true })
  })

  test('moving forward onto the sentinel is not treated as a back press', () => {
    renderHook(() => useBlockBackNav('/a'))
    pop({ __blockBackNav: true })
    expect(navigate).not.toHaveBeenCalled()
  })

  test.each([[''], [null]])('falsy target %j disables the guard entirely', (to) => {
    const push = vi.spyOn(window.history, 'pushState')
    renderHook(() => useBlockBackNav(to))
    pop()
    expect(push).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  test('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useBlockBackNav('/a'))
    unmount()
    pop()
    expect(navigate).not.toHaveBeenCalled()
  })
})
