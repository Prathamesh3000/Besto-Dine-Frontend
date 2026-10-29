import { describe, test, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeQueryClient, wrapperFor } from '../../_helpers/queryWrapper'

let auth
vi.mock('@/Context/AuthContext', () => ({ useAuth: () => auth }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ default: toast, toast }))

const mocks = vi.hoisted(() => ({
  developerAPI: {
    listKeys: vi.fn(), createKey: vi.fn(), revokeKey: vi.fn(), rotateKey: vi.fn(),
    listWebhooks: vi.fn(), createWebhook: vi.fn(), updateWebhook: vi.fn(), deleteWebhook: vi.fn(),
    rotateWebhookSecret: vi.fn(), testWebhook: vi.fn(), listDeliveries: vi.fn(), redeliver: vi.fn(),
  },
}))
vi.mock('@/utils/api', () => ({ default: {}, developerAPI: mocks.developerAPI }))

import Developers from '@/Pages/Admin/Developers'

const { developerAPI } = mocks
const KEY = { id: 'k1', name: 'Accounting', prefix: 'ab12cd34ef', masked: 'bd_live_ab12cd34ef_********', scopes: ['read:orders'], status: 'active', lastUsedAt: null }
const REVOKED = { ...KEY, id: 'k2', name: 'Old key', status: 'revoked' }
const EP = { id: 'e1', url: 'https://hooks.example.com/a', description: 'ERP', events: ['order.paid'], active: true, consecutiveFailures: 0 }
const DISABLED_EP = { id: 'e2', url: 'https://hooks.example.com/b', events: ['stock.low'], active: false, disabledAt: '2026-10-20T10:00:00Z', disabledReason: 'Disabled after 10 consecutive failed deliveries. Last error: HTTP 500' }

function setAuth(over = {}) {
  auth = { hasFeature: () => true, user: { role: 'admin', branch: null }, ...over }
}
function renderPage() {
  const Wrapper = wrapperFor(makeQueryClient())
  return render(<MemoryRouter><Developers /></MemoryRouter>, { wrapper: Wrapper })
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth()
  window.confirm = vi.fn(() => true)
  developerAPI.listKeys.mockResolvedValue({ data: { keys: [KEY, REVOKED] } })
  developerAPI.listWebhooks.mockResolvedValue({ data: { endpoints: [EP, DISABLED_EP] } })
  developerAPI.listDeliveries.mockResolvedValue({ data: { deliveries: [
    { id: 'd1', type: 'order.paid', status: 'failed', attempts: 6, responseCode: 500, lastError: 'HTTP 500', createdAt: '2026-10-20T10:00:00Z' },
  ] } })
})

describe('Developers page', () => {
  test('renders the keys tab: masked keys only, revoked keys have no actions', async () => {
    renderPage()
    expect(await screen.findByText('Accounting')).toBeInTheDocument()
    expect(screen.getAllByText('bd_live_ab12cd34ef_********').length).toBeGreaterThan(0)
    expect(screen.getByTestId('dev-key-rotate-k1')).toBeInTheDocument()
    expect(screen.queryByTestId('dev-key-revoke-k2')).toBeNull()
    expect(screen.getByText('revoked')).toBeInTheDocument()
  })

  test('shows the locked screen when the plan has no publicApi module', () => {
    setAuth({ hasFeature: () => false })
    renderPage()
    expect(screen.queryByTestId('dev-keys')).toBeNull()
    expect(developerAPI.listKeys).not.toHaveBeenCalled()
  })

  test('non-owner (branch-pinned admin) is told it is owner only', () => {
    setAuth({ user: { role: 'admin', branch: 'b1' } })
    renderPage()
    expect(screen.getByTestId('dev-owner-only')).toBeInTheDocument()
    expect(developerAPI.listKeys).not.toHaveBeenCalled()
  })

  test('create key: sends name + scopes, reveals the secret once, hides it after "I have saved it"', async () => {
    developerAPI.createKey.mockResolvedValue({ data: { key: 'bd_live_ab12cd34ef_SECRETVALUE', apiKey: { ...KEY, name: 'Zapier' } } })
    renderPage()
    await screen.findByText('Accounting')
    fireEvent.change(screen.getByTestId('dev-key-name'), { target: { value: 'Zapier' } })
    fireEvent.click(screen.getByTestId('dev-scope-read:menu'))
    fireEvent.change(screen.getByTestId('dev-key-expiry'), { target: { value: '90' } })
    fireEvent.click(screen.getByTestId('dev-key-create'))
    expect(await screen.findByTestId('dev-key-secret-value')).toHaveTextContent('bd_live_ab12cd34ef_SECRETVALUE')
    expect(developerAPI.createKey).toHaveBeenCalledWith({ name: 'Zapier', scopes: ['read:orders', 'read:menu'], expiresInDays: 90 })
    fireEvent.click(screen.getByTestId('dev-key-secret-done'))
    expect(screen.queryByTestId('dev-key-secret-value')).toBeNull()
  })

  test('create key needs a name', async () => {
    renderPage()
    await screen.findByText('Accounting')
    fireEvent.click(screen.getByTestId('dev-key-create'))
    expect(toast.error).toHaveBeenCalledWith('Give the key a name')
    expect(developerAPI.createKey).not.toHaveBeenCalled()
  })

  test('revoke asks for confirmation then calls the API; rotate reveals the new secret', async () => {
    developerAPI.revokeKey.mockResolvedValue({ data: { success: true } })
    developerAPI.rotateKey.mockResolvedValue({ data: { key: 'bd_live_zz_NEWSECRET', apiKey: KEY } })
    renderPage()
    await screen.findByText('Accounting')
    fireEvent.click(screen.getByTestId('dev-key-revoke-k1'))
    await waitFor(() => expect(developerAPI.revokeKey).toHaveBeenCalledWith('k1'))
    fireEvent.click(screen.getByTestId('dev-key-rotate-k1'))
    expect(await screen.findByTestId('dev-key-secret-value')).toHaveTextContent('NEWSECRET')
  })

  test('webhooks tab: lists endpoints and surfaces the auto-disabled reason', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Webhooks' }))
    expect(await screen.findByText('https://hooks.example.com/a')).toBeInTheDocument()
    expect(screen.getByTestId('dev-wh-disabled-e2')).toHaveTextContent('Disabled after 10 consecutive failed deliveries')
    expect(screen.getByTestId('dev-wh-toggle-e2')).toHaveTextContent('Enable')
  })

  test('add webhook: https required client-side; secret revealed once after create', async () => {
    developerAPI.createWebhook.mockResolvedValue({ data: { secret: 'whsec_ONETIME', endpoint: EP } })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Webhooks' }))
    await screen.findByText('https://hooks.example.com/a')
    fireEvent.change(screen.getByTestId('dev-wh-url'), { target: { value: 'http://insecure.example.com' } })
    fireEvent.click(screen.getByTestId('dev-wh-create'))
    expect(toast.error).toHaveBeenCalledWith('The URL must start with https://')
    expect(developerAPI.createWebhook).not.toHaveBeenCalled()

    fireEvent.change(screen.getByTestId('dev-wh-url'), { target: { value: 'https://good.example.com/hook' } })
    fireEvent.click(screen.getByTestId('dev-event-stock.low'))
    fireEvent.click(screen.getByTestId('dev-wh-create'))
    expect(await screen.findByTestId('dev-webhook-secret-value')).toHaveTextContent('whsec_ONETIME')
    expect(developerAPI.createWebhook).toHaveBeenCalledWith({ url: 'https://good.example.com/hook', events: ['order.paid', 'stock.low'], description: '' })
  })

  test('send test shows the result; delivery log shows status and offers redeliver', async () => {
    developerAPI.testWebhook.mockResolvedValue({ data: { result: { ok: false, status: 500, error: 'HTTP 500' } } })
    developerAPI.redeliver.mockResolvedValue({ data: { result: { ok: true, status: 200 } } })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Webhooks' }))
    await screen.findByText('https://hooks.example.com/a')
    fireEvent.click(screen.getByTestId('dev-wh-send-test-e1'))
    expect(await screen.findByTestId('dev-wh-test-e1')).toHaveTextContent('Failed: HTTP 500')

    fireEvent.click(screen.getByTestId('dev-wh-log-e1'))
    expect(await screen.findByTestId('dev-delivery-d1')).toHaveTextContent('failed')
    fireEvent.click(screen.getByTestId('dev-redeliver-d1'))
    await waitFor(() => expect(developerAPI.redeliver).toHaveBeenCalledWith('d1'))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Delivered'))
  })

  test('enable a disabled endpoint and delete one', async () => {
    developerAPI.updateWebhook.mockResolvedValue({ data: {} })
    developerAPI.deleteWebhook.mockResolvedValue({ data: {} })
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: 'Webhooks' }))
    await screen.findByText('https://hooks.example.com/b')
    fireEvent.click(screen.getByTestId('dev-wh-toggle-e2'))
    await waitFor(() => expect(developerAPI.updateWebhook).toHaveBeenCalledWith('e2', { active: true }))
    fireEvent.click(screen.getByTestId('dev-wh-delete-e1'))
    await waitFor(() => expect(developerAPI.deleteWebhook).toHaveBeenCalledWith('e1'))
  })

  test('a FEATURE_LOCKED answer from the API swaps in the locked screen', async () => {
    developerAPI.listKeys.mockRejectedValue({ response: { data: { code: 'FEATURE_LOCKED' } } })
    renderPage()
    await waitFor(() => expect(screen.queryByTestId('dev-keys')).toBeNull())
  })
})
