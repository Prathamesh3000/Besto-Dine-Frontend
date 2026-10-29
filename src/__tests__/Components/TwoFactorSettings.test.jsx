import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/utils/api', () => ({ default: api }))
vi.mock('react-hot-toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import TwoFactorSettings from '@/Components/Auth/TwoFactorSettings'

const status = (o = {}) => ({ data: { success: true, eligible: true, enabled: false, setupRequired: false, recoveryCodesRemaining: 0, ...o } })

beforeEach(() => { api.get.mockReset(); api.post.mockReset() })

describe('TwoFactorSettings', () => {
  test('setup then enable shows recovery codes once', async () => {
    api.get.mockResolvedValueOnce(status()).mockResolvedValue(status({ enabled: true, recoveryCodesRemaining: 8 }))
    api.post.mockImplementation(async (url) => {
      if (url === '/auth/2fa/setup') return { data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/BestoDine:a@x.in?secret=JBSWY3DPEHPK3PXP' } }
      if (url === '/auth/2fa/enable') return { data: { recoveryCodes: ['AAAAA-BBBBB', 'CCCCC-DDDDD'] } }
      throw new Error(url)
    })
    const user = userEvent.setup()
    render(<TwoFactorSettings />)
    await user.click(await screen.findByRole('button', { name: /Set up authenticator/ }))
    expect(await screen.findByTestId('two-factor-setup')).toBeInTheDocument()
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Authentication code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    expect(api.post).toHaveBeenCalledWith('/auth/2fa/enable', { code: '123456' }, { _silent: true })
    expect(await screen.findByTestId('recovery-codes')).toHaveTextContent('AAAAA-BBBBB')
    await user.click(screen.getByRole('button', { name: /I have saved them/ }))
    expect(screen.queryByTestId('recovery-codes')).toBeNull()
  })

  test('disable sends password plus a recovery code as recoveryCode', async () => {
    api.get.mockResolvedValue(status({ enabled: true, recoveryCodesRemaining: 5 }))
    api.post.mockResolvedValue({ data: { success: true } })
    const user = userEvent.setup()
    render(<TwoFactorSettings />)
    await user.click(await screen.findByRole('button', { name: 'Turn off' }))
    await user.type(screen.getByLabelText('Password'), 'pw')
    await user.type(screen.getByLabelText('Authentication code'), 'ABCDE-FGHJK')
    await user.click(screen.getAllByRole('button', { name: 'Turn off' }).at(-1))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/2fa/disable', { password: 'pw', recoveryCode: 'ABCDE-FGHJK' }, { _silent: true }))
  })

  test('regenerate shows the new codes', async () => {
    api.get.mockResolvedValue(status({ enabled: true, recoveryCodesRemaining: 1 }))
    api.post.mockResolvedValue({ data: { recoveryCodes: ['ZZZZZ-YYYYY'] } })
    const user = userEvent.setup()
    render(<TwoFactorSettings />)
    await user.click(await screen.findByRole('button', { name: /New recovery codes/ }))
    await user.type(screen.getByLabelText('Authentication code'), '654321')
    await user.click(screen.getByRole('button', { name: /Generate new codes/ }))
    expect(await screen.findByTestId('recovery-codes')).toHaveTextContent('ZZZZZ-YYYYY')
  })

  test('non-eligible roles see an explanation and no controls', async () => {
    api.get.mockResolvedValue(status({ eligible: false }))
    render(<TwoFactorSettings />)
    expect(await screen.findByText(/available for owner and admin/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
