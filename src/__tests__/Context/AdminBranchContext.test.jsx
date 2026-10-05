import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '../_helpers/queryWrapper.jsx'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
vi.mock('@/utils/socket', () => ({
  getSocket: () => ({ on() {}, off() {} }),
  subscribeSocketState: () => () => {},
  isSocketConnected: () => false,
  onSocketReconnect: () => () => {},
}))
const authState = vi.hoisted(() => ({ current: { user: null } }))
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => authState.current }))

import { AdminBranchProvider, useAdminBranch } from '@/Context/AdminBranchContext'

const BRANCHES = [{ _id: 'main1', slug: 'main', name: 'Main' }, { _id: 'fc2', slug: 'fc-road', name: 'FC Road' }]
let client
const mount = () => renderHook(() => useAdminBranch(), {
  wrapper: ({ children }) => (
    <QueryClientProvider client={client}><AdminBranchProvider>{children}</AdminBranchProvider></QueryClientProvider>
  ),
})
const stored = () => localStorage.getItem('adminActiveBranch')

beforeEach(() => {
  client = makeQueryClient()
  api.get.mockReset().mockResolvedValue({ data: { data: BRANCHES } })
  authState.current = { user: { _id: 'o', role: 'admin', branch: null } }
})

describe('tenant owner (unpinned admin/manager)', () => {
  test.each(['admin', 'manager'])('%s defaults to the Main branch once branches load, without marking it a user pick', async (role) => {
    authState.current = { user: { _id: 'o', role } }
    const { result } = mount()
    await waitFor(() => expect(result.current.selectedBranchId).toBe('main1'))
    expect(stored()).toBe(JSON.stringify('main1'))
    expect(localStorage.getItem('adminBranchPicked')).toBeNull()
    expect(result.current).toMatchObject({ isLocked: false, mainBranchId: 'main1', isCrossBranchReadOnly: false, branchQueryParam: { branch: 'main1' } })
    expect(api.get).toHaveBeenCalledWith('/branches', { _silent: true })
  })

  test('picking a sub-branch persists synchronously and enters cross-branch read-only mode', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.branches).toHaveLength(2))
    act(() => result.current.setSelectedBranchId('fc2'))
    expect(stored()).toBe(JSON.stringify('fc2'))
    expect(localStorage.getItem('adminBranchPicked')).toBe('1')
    expect(result.current).toMatchObject({ selectedBranchId: 'fc2', isCrossBranchReadOnly: true })
  })

  test('picking "All branches" (null) sticks — the Main default does not override it', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.selectedBranchId).toBe('main1'))
    act(() => result.current.setSelectedBranchId(null))
    await act(async () => { await client.invalidateQueries({ queryKey: ['admin', 'branches'] }) })
    expect(result.current.selectedBranchId).toBeNull()
    expect(stored()).toBeNull()
    expect(result.current.branchQueryParam).toEqual({})
    expect(result.current.isCrossBranchReadOnly).toBe(false)
  })

  test.each([
    ['a JSON string id', JSON.stringify('fc2'), 'fc2'],
    ['a legacy branch object', JSON.stringify({ _id: 'fc2' }), 'fc2'],
    ['corrupt JSON', '{x', null],
  ])('restores the persisted selection from %s', async (_l, raw, expected) => {
    localStorage.setItem('adminActiveBranch', raw)
    localStorage.setItem('adminBranchPicked', '1')
    const { result } = mount()
    expect(result.current.selectedBranchId).toBe(expected)
  })

  test('no Main branch in the list → no default selection', async () => {
    api.get.mockResolvedValue({ data: { data: [{ _id: 'x', slug: 'x' }] } })
    const { result } = mount()
    await waitFor(() => expect(result.current.branches).toHaveLength(1))
    expect(result.current.selectedBranchId).toBeNull()
  })

  test('refetchBranches invalidates the shared branches query', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.branches).toHaveLength(2))
    const spy = vi.spyOn(client, 'invalidateQueries')
    act(() => { result.current.refetchBranches() })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'branches'] })
  })
})

describe('branch-pinned staff', () => {
  test.each(['admin', 'manager'])('pinned %s is locked to their branch and cannot switch', async (role) => {
    localStorage.setItem('adminActiveBranch', JSON.stringify('fc2'))
    authState.current = { user: { _id: 'p', role, branch: { _id: 'pin9', name: 'Kothrud' } } }
    const { result } = mount()
    await waitFor(() => expect(result.current.branches).toHaveLength(2))
    expect(result.current).toMatchObject({ isLocked: true, selectedBranchId: 'pin9', lockedBranchName: 'Kothrud', isCrossBranchReadOnly: false, branchQueryParam: { branch: 'pin9' } })
    act(() => result.current.setSelectedBranchId('main1'))
    expect(result.current.selectedBranchId).toBe('pin9')
    expect(localStorage.getItem('adminBranchPicked')).toBeNull()
  })

  test.each(['waiter', 'captain', 'chef'])('%s never fetches branches and is not "locked"', async (role) => {
    authState.current = { user: { _id: 'w', role, branch: { _id: 'b' } } }
    const { result } = mount()
    expect(result.current.isLocked).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })
})

describe('sign-out', () => {
  test('clears the persisted branch and the picked flag so the next sign-in re-defaults', async () => {
    localStorage.setItem('adminActiveBranch', JSON.stringify('fc2'))
    localStorage.setItem('adminBranchPicked', '1')
    authState.current = { user: null }
    mount()
    expect(stored()).toBeNull()
    expect(localStorage.getItem('adminBranchPicked')).toBeNull()
  })
})

describe('useAdminBranch without a provider', () => {
  test('returns a safe all-branches fallback', () => {
    const { result } = renderHook(() => useAdminBranch())
    expect(result.current).toMatchObject({ branches: [], selectedBranchId: null, isLocked: false, branchQueryParam: {}, loading: false })
    expect(() => { result.current.setSelectedBranchId('x'); result.current.refetchBranches() }).not.toThrow()
  })
})
