/**
 * Landing-page smooth scroll: Lenis driven by the GSAP ticker (no-op under
 * reduced motion or when disabled, full cleanup otherwise, hash-link delegation).
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import gsap from 'gsap'

const lenisSpy = vi.hoisted(() => ({ instances: [] }))
vi.mock('lenis', () => ({
  default: class FakeLenis {
    constructor(opts) {
      this.opts = opts
      this.handlers = {}
      this.destroyed = false
      this.scrollTo = vi.fn()
      this.stop = vi.fn()
      this.start = vi.fn()
      lenisSpy.instances.push(this)
    }
    on(evt, fn) { this.handlers[evt] = fn }
    off(evt) { delete this.handlers[evt] }
    raf() {}
    destroy() { this.destroyed = true }
  },
}))

import useSmoothScroll, { getLenis, prefersReducedMotion } from '@/Pages/Platform/motion/useSmoothScroll'

function setReducedMotion(matches) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

beforeEach(() => {
  lenisSpy.instances.length = 0
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useSmoothScroll', () => {
  test('is a no-op under prefers-reduced-motion', () => {
    setReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
    const { unmount } = renderHook(() => useSmoothScroll(true))
    expect(lenisSpy.instances).toHaveLength(0)
    expect(getLenis()).toBeNull()
    unmount()
  })

  test('is a no-op when disabled', () => {
    setReducedMotion(false)
    const { unmount } = renderHook(() => useSmoothScroll(false))
    expect(lenisSpy.instances).toHaveLength(0)
    expect(getLenis()).toBeNull()
    unmount()
  })

  test('creates Lenis, hooks the GSAP ticker, delegates hash clicks, and cleans up', () => {
    setReducedMotion(false)
    const add = vi.spyOn(gsap.ticker, 'add')
    const remove = vi.spyOn(gsap.ticker, 'remove')
    const section = document.createElement('section')
    section.id = 'pricing'
    document.body.appendChild(section)
    const link = document.createElement('a')
    link.setAttribute('href', '#pricing')
    document.body.appendChild(link)

    const { unmount } = renderHook(() => useSmoothScroll(true))
    expect(lenisSpy.instances).toHaveLength(1)
    const lenis = lenisSpy.instances[0]
    expect(lenis.opts).toMatchObject({ duration: 1.15, lerp: 0.1, smoothWheel: true })
    expect(getLenis()).toBe(lenis)
    expect(typeof lenis.handlers.scroll).toBe('function')
    expect(add).toHaveBeenCalledTimes(1)
    expect(window.history.scrollRestoration).toBe('manual')

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(lenis.scrollTo).toHaveBeenCalledWith(section, { offset: -72, duration: 1.2 })
    expect(window.location.hash).toBe('#pricing')

    unmount()
    expect(lenis.destroyed).toBe(true)
    expect(remove).toHaveBeenCalledWith(add.mock.calls[0][0])
    expect(getLenis()).toBeNull()
    lenis.scrollTo.mockClear()
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(lenis.scrollTo).not.toHaveBeenCalled()

    section.remove()
    link.remove()
    window.history.replaceState(null, '', '/')
  })
})
