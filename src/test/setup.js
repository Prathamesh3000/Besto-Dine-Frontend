/**
 * Global Vitest setup for the BestoDine frontend.
 *
 * TEST FILE CONVENTION
 *   All unit tests live under src/__tests__/, mirroring the source tree
 *   (src/__tests__/utils/billing.test.js tests src/utils/billing.js,
 *   src/__tests__/Pages/Kiosk/kioskState.test.js tests
 *   src/Pages/Kiosk/kioskState.js, ...). Name: <source>.test.js(x).
 *   Run once: `npm test`; coverage (v8): `npm run test:coverage`.
 *
 * What this file guarantees for every test:
 *   - @testing-library/jest-dom matchers on `expect`
 *   - React Testing Library cleanup after each test
 *   - empty localStorage / sessionStorage before each test
 *   - stubs for browser APIs jsdom lacks: matchMedia, IntersectionObserver,
 *     ResizeObserver, scrollTo
 *   - real timers restored after each test (tests opt into fake timers)
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

function installBrowserStubs() {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = NoopObserver
    globalThis.IntersectionObserver = NoopObserver
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = NoopObserver
    globalThis.ResizeObserver = NoopObserver
  }
  window.scrollTo = window.scrollTo || (() => {})
}

installBrowserStubs()

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
