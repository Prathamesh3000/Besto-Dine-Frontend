import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act } from '@testing-library/react'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
const authState = vi.hoisted(() => ({ current: { user: null, isLoading: false } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.current }))

import { HealthProvider, useHealthContext } from '@/Context/Loggedin/HealthContext'

const wrapper = ({ children }) => <HealthProvider>{children}</HealthProvider>
const mount = () => renderHook(() => useHealthContext(), { wrapper })
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve() })
const savedPrefs = () => JSON.parse(localStorage.getItem('healthPreferences'))

beforeEach(() => {
  vi.useFakeTimers()
  api.get.mockReset().mockResolvedValue({ data: {} })
  api.put.mockReset().mockResolvedValue({ data: {} })
  authState.current = { user: null, isLoading: false }
  window.history.replaceState({}, '', '/customer/home')
})

describe('defaults and local persistence', () => {
  test('starts with mix / medium / no allergies and persists that', () => {
    const { result } = mount()
    expect(result.current).toMatchObject({ healthMode: false, dietPreference: 'mix', allergies: [], spiceLevel: 'medium' })
    expect(savedPrefs()).toEqual({ healthMode: false, dietPreference: 'mix', allergies: [], spiceLevel: 'medium' })
  })

  test('restores saved prefs and renames the legacy "all" bucket to "mix"', () => {
    localStorage.setItem('healthPreferences', JSON.stringify({ healthMode: true, dietPreference: 'all', allergies: ['nuts'], spiceLevel: 'hot' }))
    const { result } = mount()
    expect(result.current).toMatchObject({ healthMode: true, dietPreference: 'mix', allergies: ['nuts'], spiceLevel: 'hot' })
  })

  test('corrupt saved prefs are discarded', () => {
    localStorage.setItem('healthPreferences', '{bad')
    const { result } = mount()
    expect(result.current.dietPreference).toBe('mix')
    expect(savedPrefs().dietPreference).toBe('mix')
  })

  test('toggle / add (deduped) / remove / clear allergies', () => {
    const { result } = mount()
    act(() => result.current.toggleHealthMode())
    act(() => { result.current.addAllergy('gluten'); result.current.addAllergy('gluten'); result.current.addAllergy('dairy') })
    expect(result.current.allergies).toEqual(['gluten', 'dairy'])
    act(() => result.current.removeAllergy('gluten'))
    expect(result.current.allergies).toEqual(['dairy'])
    act(() => result.current.clearAllergies())
    expect(result.current).toMatchObject({ healthMode: true, allergies: [] })
  })
})

describe('backend profile hydration + sync', () => {
  test('loads allergies from /auth/me for a logged-in customer', async () => {
    localStorage.setItem('token', 'T')
    api.get.mockResolvedValue({ data: { allergy: 'peanut, shellfish ,' } })
    const { result } = mount()
    await flush()
    expect(api.get).toHaveBeenCalledWith('/auth/me', { _isBackground: true })
    expect(result.current.allergies).toEqual(['peanut', 'shellfish'])
  })

  test('kiosk routes and anonymous users never call /auth/me', () => {
    mount()
    localStorage.setItem('token', 'T')
    window.history.replaceState({}, '', '/kiosk/menu')
    mount()
    expect(api.get).not.toHaveBeenCalled()
  })

  test('allergy edits are synced to the profile once, 2s after the last change', async () => {
    localStorage.setItem('token', 'T')
    api.get.mockResolvedValue({ data: { allergy: 'peanut' } })
    const { result } = mount()
    await flush()
    act(() => { vi.advanceTimersByTime(2000) })
    api.put.mockClear()
    act(() => result.current.addAllergy('soy'))
    act(() => { vi.advanceTimersByTime(1500) })
    act(() => result.current.addAllergy('egg'))
    act(() => { vi.advanceTimersByTime(1999) })
    expect(api.put).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.put).toHaveBeenCalledWith('/auth/profile', { allergy: 'peanut, soy, egg' }, { _isBackground: true })
  })

  test('no token → never PUTs', () => {
    const { result } = mount()
    act(() => result.current.addAllergy('soy'))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(api.put).not.toHaveBeenCalled()
  })

  // Regression (fixed 2026-10): the allergy sync is not scheduled until /auth/me (or the signed-in user) has loaded the profile.
  test('a slow or failed /auth/me never lets the 2s sync overwrite the saved profile allergies with ""', async () => {
    localStorage.setItem('token', 'T')
    api.get.mockReturnValue(new Promise(() => {})) // /auth/me still in flight
    mount()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(api.put).not.toHaveBeenCalledWith('/auth/profile', { allergy: '' }, expect.anything())
  })
})

describe('profile diet preference + account switches', () => {
  test.each([
    ['veg', 'veg'], ['vegan', 'veg'], ['eggetarian', 'veg'], ['jain', 'veg'], ['non_veg', 'nonveg'],
  ])('profile dietaryPreference %s → home filter %s', (pref, bucket) => {
    authState.current = { user: { _id: 'c1', dietaryPreference: pref }, isLoading: false }
    const { result } = mount()
    expect(result.current.dietPreference).toBe(bucket)
  })

  test.each([[''], ['unknown']])('profile preference %j keeps the session choice', (pref) => {
    authState.current = { user: { _id: 'c1', dietaryPreference: pref }, isLoading: false }
    const { result } = mount()
    act(() => result.current.setDietPreference('veg'))
    expect(result.current.dietPreference).toBe('veg')
  })

  test('a different account signing in drops the previous account\'s in-memory prefs', () => {
    authState.current = { user: { _id: 'c1' }, isLoading: false }
    const { result, rerender } = mount()
    act(() => { result.current.addAllergy('nuts'); result.current.setSpiceLevel('hot'); result.current.setHealthMode(true) })
    authState.current = { user: { _id: 'c2', allergy: 'dairy', dietaryPreference: 'non_veg' }, isLoading: false }
    rerender()
    expect(result.current).toMatchObject({ allergies: ['dairy'], spiceLevel: 'medium', healthMode: false, dietPreference: 'nonveg' })
  })

  test('logout resets to defaults', () => {
    authState.current = { user: { _id: 'c1' }, isLoading: false }
    const { result, rerender } = mount()
    act(() => result.current.addAllergy('nuts'))
    authState.current = { user: null, isLoading: false }
    rerender()
    expect(result.current.allergies).toEqual([])
  })

  test('the first resolved user (session restore) keeps cached toggles', () => {
    localStorage.setItem('healthPreferences', JSON.stringify({ spiceLevel: 'hot', allergies: ['x'] }))
    authState.current = { user: null, isLoading: true }
    const { result, rerender } = mount()
    authState.current = { user: { _id: 'c1' }, isLoading: false }
    rerender()
    expect(result.current).toMatchObject({ spiceLevel: 'hot', allergies: ['x'] })
  })
})

describe('useHealthContext guard', () => {
  test('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useHealthContext())).toThrow('useHealthContext must be used within a HealthProvider')
  })
})
