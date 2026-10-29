import { describe, it, expect, vi } from 'vitest'

vi.mock('@sentry/react', () => ({ init: vi.fn() }))
import * as Sentry from '@sentry/react'
import { initSentry, scrubEvent } from '../../utils/sentry'

describe('sentry', () => {
  it('is a no-op without a DSN', () => {
    expect(initSentry({})).toBe(false)
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('initialises errors-only with no PII when a DSN is set', () => {
    expect(initSentry({ VITE_SENTRY_DSN: 'https://k@o.ingest.sentry.io/1', VITE_SENTRY_RELEASE: 'abc', MODE: 'production' })).toBe(true)
    const opts = Sentry.init.mock.calls[0][0]
    expect(opts).toMatchObject({ release: 'abc', environment: 'production', sendDefaultPii: false })
    expect(opts.tracesSampleRate).toBe(0)
    expect(opts.integrations).toBeUndefined()
    expect(opts.replaysSessionSampleRate).toBeUndefined()
  })

  it('scrubs tokens and Authorization from events', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.abcdefghijk'
    const ev = scrubEvent({
      request: { headers: { Authorization: `Bearer ${jwt}`, Accept: 'x' }, cookies: { a: 'b' }, data: { password: 'p', refreshToken: 'r', ok: 1 }, url: 'https://x/y' },
      extra: { note: `failed with Bearer ${jwt}` },
      breadcrumbs: [{ data: { Authorization: 'Bearer abc' } }],
      user: { id: '1', email: 'a@b.c' },
    })
    expect(ev.request.headers.Authorization).toBe('[Filtered]')
    expect(ev.request.headers.Accept).toBe('x')
    expect(ev.request.cookies).toBeUndefined()
    expect(ev.request.data).toEqual({ password: '[Filtered]', refreshToken: '[Filtered]', ok: 1 })
    expect(JSON.stringify(ev)).not.toContain(jwt)
    expect(ev.breadcrumbs[0].data.Authorization).toBe('[Filtered]')
    expect(ev.user).toEqual({ id: '1' })
  })
})
