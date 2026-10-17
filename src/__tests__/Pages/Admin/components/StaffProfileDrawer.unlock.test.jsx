/**
 * StaffProfileDrawer — "Unlock Login" action. Admin/manager clears the
 * per-account login lock (10 wrong passwords → 15 min cooldown) via
 * POST /staff/:id/unlock-login. Shown under the same `canManage` rule as
 * Reset Password; hidden for a Manager viewing a Manager/Admin row.
 *
 * The real `@/utils/api` module is loaded (so `staffAPI.unlockLogin` is the
 * real helper) and the axios instance's get/post are spied, which makes the
 * URL assertion genuine rather than a mirror of a mock.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/Pages/Admin/components/StaffPerformanceModal', () => ({ default: () => null }))

import { toast } from 'react-hot-toast'
import api from '@/utils/api'
import StaffProfileDrawer from '@admin/components/StaffProfileDrawer'

const STAFF = { _id: 'stf_42', id: 'EMP-042', name: 'Priya Nair', role: 'Manager', email: 'priya@x.in', phone: '9876543210' }

let deferred
function deferredPromise() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(api, 'get').mockResolvedValue({ data: { shifts: [], stats: { totalShifts: 0, totalHours: 0 } } })
  deferred = deferredPromise()
  vi.spyOn(api, 'post').mockReturnValue(deferred.promise)
})

function setup(props = {}) {
  const user = userEvent.setup()
  render(
    <StaffProfileDrawer
      staff={STAFF}
      isActive
      onClose={() => {}}
      onEdit={() => {}}
      onToggleStatus={() => {}}
      {...props}
    />,
  )
  const unlockBtn = () => screen.queryByRole('button', { name: /unlock login/i })
  return { user, unlockBtn }
}

describe('StaffProfileDrawer — Unlock Login visibility', () => {
  test('renders next to Reset Password for a caller who can manage (admin / manager)', () => {
    const { unlockBtn } = setup()
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument()
    expect(unlockBtn()).toBeInTheDocument()
    expect(unlockBtn()).toBeEnabled()
    expect(screen.getByText(/Clears a temporary lock after repeated wrong passwords \(locks expire by themselves after 15 min\)\./)).toBeInTheDocument()
  })

  test('hidden when the caller cannot reset passwords (canManage = false)', () => {
    const { unlockBtn } = setup({ canManage: false })
    expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument()
    expect(unlockBtn()).not.toBeInTheDocument()
    expect(screen.queryByText(/Clears a temporary lock/)).not.toBeInTheDocument()
  })
})

describe('StaffProfileDrawer — Unlock Login behaviour', () => {
  test('click → POST /staff/<id>/unlock-login, disabled while pending, success toast names the staff', async () => {
    const { user, unlockBtn } = setup()
    await user.click(unlockBtn())

    expect(api.post).toHaveBeenCalledTimes(1)
    expect(api.post).toHaveBeenCalledWith('/staff/stf_42/unlock-login')

    // Pending: button disabled + label swaps; a second click is a no-op.
    const pending = screen.getByRole('button', { name: /unlocking/i })
    expect(pending).toBeDisabled()
    await user.click(pending)
    expect(api.post).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()

    deferred.resolve({ data: { success: true, unlocked: true } })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Login unlocked for Priya Nair'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(unlockBtn()).toBeEnabled()
  })

  test('failure → toast shows the API error message and re-enables the button', async () => {
    const { user, unlockBtn } = setup()
    await user.click(unlockBtn())
    deferred.reject({ response: { status: 403, data: { success: false, message: 'Only an Admin can unlock this account' } } })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only an Admin can unlock this account'))
    expect(toast.success).not.toHaveBeenCalled()
    expect(unlockBtn()).toBeEnabled()
  })

  test('failure without a server message falls back to a generic error', async () => {
    const { user, unlockBtn } = setup()
    await user.click(unlockBtn())
    deferred.reject(new Error('Network Error'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to unlock login'))
  })
})
