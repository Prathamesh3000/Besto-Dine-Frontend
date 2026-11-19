import { describe, it, expect } from 'vitest'
import { describeLoadError } from '../../utils/loadError'

describe('describeLoadError', () => {
  it('429 reads as throttling', () => {
    expect(describeLoadError({ response: { status: 429 } }).title).toBe('Too many requests')
  })
  it('no response reads as offline', () => {
    expect(describeLoadError(new Error('Network Error')).title).toBe("Can't reach the server")
  })
  it('other statuses get the generic text', () => {
    expect(describeLoadError({ response: { status: 500 } }).title).toBe("Couldn't load your tables")
  })
})
