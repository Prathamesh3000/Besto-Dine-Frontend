import { describe, test, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useFormValidation, combine, required, email, phone10, minLen, maxLen,
  matches, positive, integerInRange, oneOf,
} from '@/hooks/useFormValidation'

const fakeInput = () => ({ focus: vi.fn(), scrollIntoView: vi.fn() })
const ev = (name, value, extra = {}) => ({ target: { name, value, type: 'text', ...extra } })

describe('validator combinators', () => {
  test.each([
    [required('Name'), undefined, 'Name is required'],
    [required('Name'), null, 'Name is required'],
    [required('Name'), '   ', 'Name is required'],
    [required(), '', 'This field is required'],
    [required('Name'), 'Ann', null],
    [required('Qty'), 0, null],
    [required('Agree'), false, null],
    [email(), 'a@b.co', null],
    [email(), '  a@b.co  ', null],
    [email(), 'not-an-email', 'Enter a valid email address'],
    [email('bad'), 'a@b', 'bad'],
    [email(), '', null],
    [phone10(), '9876543210', null],
    [phone10(), '98765', 'Enter a valid 10-digit phone number'],
    [phone10(), '+919876543210', 'Enter a valid 10-digit phone number'],
    [phone10(), '', null],
    [minLen(3, 'Pw'), 'ab', 'Pw must be at least 3 characters'],
    [minLen(3, 'Pw'), 'abc', null],
    [minLen(3), '', null],
    [maxLen(3, 'Code'), 'abcd', 'Code cannot exceed 3 characters'],
    [maxLen(3, 'Code'), 'abc', null],
    [positive('Price'), '', 'Price is required'],
    [positive('Price'), null, 'Price is required'],
    [positive('Price'), '0', 'Price must be greater than 0'],
    [positive('Price'), '-1', 'Price must be greater than 0'],
    [positive('Price'), 'abc', 'Price must be greater than 0'],
    [positive('Price'), '0.5', null],
    [integerInRange(1, 10, 'Seats'), '', 'Seats is required'],
    [integerInRange(1, 10, 'Seats'), '2.5', 'Seats must be a whole number'],
    [integerInRange(1, 10, 'Seats'), 'x', 'Seats must be a whole number'],
    [integerInRange(1, 10, 'Seats'), '0', 'Seats must be at least 1'],
    [integerInRange(1, 10, 'Seats'), '11', 'Seats cannot exceed 10'],
    [integerInRange(1, 10, 'Seats'), '10', null],
    [oneOf(['a', 'b'], 'Mode'), 'c', 'Mode is required'],
    [oneOf(['a', 'b'], 'Mode'), 'a', null],
  ])('validator %# returns the expected message for %j', (fn, value, expected) => {
    expect(fn(value, {})).toBe(expected)
  })

  test('matches compares against another field of the whole form', () => {
    const v = matches('password', 'Mismatch')
    expect(v('x', { password: 'x' })).toBeNull()
    expect(v('y', { password: 'x' })).toBe('Mismatch')
  })

  test('combine returns the first failing message and null when all pass', () => {
    const v = combine(required('Email'), email())
    expect(v('', {})).toBe('Email is required')
    expect(v('bad', {})).toBe('Enter a valid email address')
    expect(v('a@b.co', {})).toBeNull()
  })
})

describe('useFormValidation hook', () => {
  const schema = {
    name: required('Name'),
    email: combine(required('Email'), email()),
  }
  const setup = () => renderHook(() => useFormValidation({ name: '', email: '', agree: false }, schema))

  test('handleChange writes text values and checkbox checked state', () => {
    const { result } = setup()
    act(() => result.current.handleChange(ev('name', 'Ann')))
    act(() => result.current.handleChange(ev('agree', 'on', { type: 'checkbox', checked: true })))
    expect(result.current.values).toEqual({ name: 'Ann', email: '', agree: true })
  })

  test('handleBlur marks touched and shows the field error; fixing the value clears it', () => {
    const { result } = setup()
    act(() => result.current.handleBlur(ev('email', '')))
    expect(result.current.touched.email).toBe(true)
    expect(result.current.errors.email).toBe('Email is required')

    act(() => result.current.setValue('email', 'a@b'))
    expect(result.current.errors.email).toBeUndefined()
  })

  test('handleBlur on a field without a validator only marks it touched', () => {
    const { result } = setup()
    act(() => result.current.handleBlur(ev('agree', '')))
    expect(result.current.touched).toEqual({ agree: true })
    expect(result.current.errors).toEqual({})
  })

  test('validateAll fails, marks every schema field touched and focuses the first bad registered field', () => {
    const { result } = setup()
    const nameEl = fakeInput()
    const emailEl = fakeInput()
    act(() => {
      result.current.registerRef('name')(nameEl)
      result.current.registerRef('email')(emailEl)
    })
    let ok
    act(() => { ok = result.current.validateAll() })
    expect(ok).toBe(false)
    expect(result.current.errors).toEqual({ name: 'Name is required', email: 'Email is required' })
    expect(result.current.touched).toEqual({ name: true, email: true })
    expect(nameEl.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(nameEl.scrollIntoView).toHaveBeenCalled()
    expect(emailEl.focus).not.toHaveBeenCalled()
  })

  test('validateAll survives an element whose focus throws and with no registered ref', () => {
    const { result } = setup()
    const el = { focus: vi.fn(() => { throw new Error('nope') }) }
    act(() => result.current.registerRef('email')(el))
    act(() => result.current.setValue('name', 'Ann'))
    let ok
    act(() => { ok = result.current.validateAll() })
    expect(ok).toBe(false)
    act(() => result.current.registerRef('email')(null)) // unregister
    act(() => result.current.setValue('name', ''))
    expect(() => act(() => { result.current.validateAll() })).not.toThrow()
  })

  test('validateAll passes when every field is valid', () => {
    const { result } = setup()
    act(() => { result.current.setValue('name', 'Ann'); result.current.setValue('email', 'a@b.co') })
    let ok
    act(() => { ok = result.current.validateAll() })
    expect(ok).toBe(true)
    expect(result.current.errors).toEqual({})
  })

  test('setServerErrors maps server codes onto fields and focuses the first one', () => {
    const { result } = setup()
    const emailEl = fakeInput()
    act(() => result.current.registerRef('email')(emailEl))
    act(() => result.current.setServerErrors({ email: 'That email is already registered' }))
    expect(result.current.errors.email).toBe('That email is already registered')
    expect(result.current.touched.email).toBe(true)
    expect(emailEl.focus).toHaveBeenCalled()
    expect(emailEl.scrollIntoView).toHaveBeenCalled()
  })

  test('reset restores initial values (or a provided snapshot) and clears errors/touched', () => {
    const { result } = setup()
    act(() => { result.current.setValue('name', 'X'); result.current.validateAll() })
    act(() => result.current.reset())
    expect(result.current.values).toEqual({ name: '', email: '', agree: false })
    expect(result.current.errors).toEqual({})
    expect(result.current.touched).toEqual({})
    act(() => result.current.reset({ name: 'Y', email: 'y@y.y', agree: true }))
    expect(result.current.values.name).toBe('Y')
  })

  test('focusField focuses a registered field and ignores unknown names', () => {
    const { result } = setup()
    const el = fakeInput()
    act(() => result.current.registerRef('name')(el))
    act(() => result.current.focusField('name'))
    act(() => result.current.focusField('missing'))
    expect(el.focus).toHaveBeenCalledTimes(1)
  })
})
