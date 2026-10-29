/**
 * Golden-vector parity: runs the shared vectors
 * (src/vendor/bestodine-types/golden-vectors.json, generated from the backend
 * implementation) against this app's own utils/billing.computeBill and the
 * shared engine. Backend and mobile-waiter run the identical file.
 */
import { describe, test, expect } from 'vitest'
import { computeBill } from '@/utils/billing'
import { computeBill as sharedComputeBill } from '@/vendor/bestodine-types/esm/engine.js'
import vectorFile from '@/vendor/bestodine-types/golden-vectors.json'

const { vectors, fields } = vectorFile
const clone = (x) => JSON.parse(JSON.stringify(x))
const view = (b) => {
  const out = {}
  for (const k of fields) out[k] = b[k]
  return clone(out) // normalises -0 and undefined keys
}

describe('computeBill golden vectors', () => {
  test('there are at least 40 vectors', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(40)
  })

  test.each(vectors.map((v) => [v.name, v]))('frontend: %s', (_n, v) => {
    expect(view(computeBill(clone(v.input)))).toEqual(v.expected)
  })

  test.each(vectors.map((v) => [v.name, v]))('shared engine: %s', (_n, v) => {
    expect(view(sharedComputeBill(clone(v.input)))).toEqual(v.expected)
  })
})
