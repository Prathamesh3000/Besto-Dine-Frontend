/**
 * passwordPolicy.js and reservedSlugs.js must agree with the backend
 * (Backend/utils/passwordPolicy.js, Backend/utils/reservedSlugs.js).
 * The backend modules are only READ (required), never modified.
 */
import { describe, test, expect } from 'vitest'
import { createRequire } from 'node:module'
import {
  SERVER_PASSWORD_REGEX, MIN_PASSWORD_SCORE, MIN_LENGTH, STRENGTH_LABELS, STRENGTH_COLORS,
  scorePassword, passwordRuleFailures, isPasswordAcceptable, passwordError,
} from '@/utils/passwordPolicy'
import { RESERVED_SLUGS, isReservedSlug } from '@/utils/reservedSlugs'

const require = createRequire(import.meta.url)
const backendPw = require('../../../../Backend/utils/passwordPolicy.js')
const backendSlugs = require('../../../../Backend/utils/reservedSlugs.js')

describe('passwordPolicy — rules and meter', () => {
  test('regex and min length mirror the backend literally', () => {
    expect(SERVER_PASSWORD_REGEX.source).toBe(backendPw.STRONG_PASSWORD_REGEX.source)
    expect(MIN_LENGTH).toBe(backendPw.STRONG_PASSWORD_MIN_LENGTH)
    expect(STRENGTH_LABELS).toHaveLength(5)
    expect(STRENGTH_COLORS).toHaveLength(5)
    expect(STRENGTH_LABELS[MIN_PASSWORD_SCORE]).toBe('Good')
  })

  test.each([
    ['', 0], [null, 0], ['abc', 0], ['abcdefgh', 1], ['Abcdefgh', 2], ['Abcdefg1!', 3],
    ['Abcdefghij1!', 4], ['abcdefghijkl', 2], ['1!aaaaaa', 2],
  ])('scorePassword(%j) → %d', (pw, s) => expect(scorePassword(pw)).toBe(s))

  test.each([
    ['', ['length', 'case', 'digit', 'special']],
    [undefined, ['length', 'case', 'digit', 'special']],
    ['abcdefgh', ['case', 'digit', 'special']],
    ['Abcdefgh', ['digit', 'special']],
    ['Abcdefg1', ['special']],
    ['Abcdef1!', []],
    ['Abcdef1.', ['special']], // '.' is not in the server's special set
  ])('passwordRuleFailures(%j)', (pw, failures) => expect(passwordRuleFailures(pw)).toEqual(failures))

  test.each([
    ['', 'Password is required'],
    ['Ab1!', 'Use at least 8 characters'],
    ['abcdefg1!', 'Add both upper and lower case letters'],
    ['Abcdefgh!', 'Add a number'],
    ['Abcdefgh1', 'Add a special character (!@#$…)'],
    ['Abcdefg1!', ''],
  ])('passwordError(%j) → %j', (pw, msg) => expect(passwordError(pw)).toBe(msg))

  const corpus = [
    '', 'short1!', 'Abcdef1!', 'abcdef1!', 'ABCDEF1!', 'Abcdefg!', 'Abcdefg1', 'Abcdef 1!',
    'Abcdef1.', 'Pässwörd1!', '        ', 'Aa1!Aa1!', 'Aa1-____', 'Aa1<>xyz', 'Aa1€€€€€',
    'aB3$' + 'x'.repeat(60), 'aB3$' + 'x'.repeat(124),
  ]
  test.each(corpus)('frontend acceptance matches backend isStrongPassword for %j', (pw) => {
    expect(isPasswordAcceptable(pw)).toBe(backendPw.isStrongPassword(pw))
  })

  test('line terminators: backend regex rejects them, frontend accepts (unreachable from an <input>, which strips newlines)', () => {
    // RISK, not a bug: isPasswordAcceptable never consults SERVER_PASSWORD_REGEX,
    // whose '.' excludes line terminators. Only a direct API caller could hit it.
    const pw = 'Abc\ndef1!'
    expect(backendPw.isStrongPassword(pw)).toBe(false)
    expect(isPasswordAcceptable(pw)).toBe(true)
  })

  // Regression (fixed 2026-10): frontend enforces the backend's 128-character max (MAX_LENGTH, 'maxLength' failure).
  test('passwords longer than 128 characters are rejected by both frontend and backend', () => {
    const pw = 'aB3$' + 'x'.repeat(125) // 129 chars
    expect(isPasswordAcceptable(pw)).toBe(backendPw.isStrongPassword(pw))
    expect(passwordError(pw)).toBe('Use at most 128 characters')
  })
})

describe('reservedSlugs — parity and lookup', () => {
  test('frontend reserved set equals the backend set', () => {
    const fe = [...RESERVED_SLUGS].sort()
    const be = [...backendSlugs.RESERVED_SLUGS].sort()
    expect(fe).toEqual(be)
  })

  test.each([
    ['admin', true], ['ADMIN', true], ['  Login ', true], ['socket.io', true], ['favicon.ico', true],
    ['spice-hub', false], ['admins', false],
  ])('isReservedSlug(%j) → %s (and agrees with backend)', (slug, expected) => {
    expect(isReservedSlug(slug)).toBe(expected)
    expect(backendSlugs.isReservedSlug(slug)).toBe(expected)
  })

  test.each([null, undefined, '', 5])('frontend treats non-slug %j as reserved (never a restaurant page)', (v) => {
    // Deliberate divergence: backend returns false (nothing to refuse),
    // frontend returns true (do not treat as a landing page).
    expect(isReservedSlug(v)).toBe(true)
  })
})
