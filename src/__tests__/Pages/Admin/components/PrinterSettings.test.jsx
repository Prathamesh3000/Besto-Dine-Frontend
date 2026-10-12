/**
 * Admin → Settings → Printers (thermal printing, Phase 1): printer rows
 * and auto-print switches are saved through onSave (PATCH
 * /settings/printers); test pages and agent pairing hit /print/*.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() })
  return { default: toast, toast }
})
vi.mock('@/hooks/useSocketEvent', () => ({ default: vi.fn(), useSocketConnected: () => true, useSocketReconnect: vi.fn() }))
vi.mock('@/utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  printAPI: {
    agentKey: vi.fn(), revokeAgentKey: vi.fn(), agentStatus: vi.fn(), jobs: vi.fn(), test: vi.fn(), printBill: vi.fn(),
  },
}))

import { toast } from 'react-hot-toast'
import { printAPI } from '@/utils/api'
import PrinterSettings from '@admin/components/PrinterSettings'
import { toPayload, normalizeInitial } from '@admin/utils/printerSettings'

const INITIAL = {
  enabled: true,
  autoPrint: { kotOnCreate: true, kotOnAppend: true, billOnPaid: false },
  agent: { agentId: 'agent-1', keyVersion: 2 },
  list: [
    { id: 'p-kitchen', name: 'Kitchen', station: 'kitchen', interface: 'lan', host: '192.168.1.50', port: 9100, paperWidth: '80', copies: 1, enabled: true },
    { id: 'p-counter', name: 'Counter', station: 'counter', interface: 'usb', devicePath: '\\\\localhost\\BILL', paperWidth: '58', copies: 2, enabled: true },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  printAPI.agentStatus.mockResolvedValue({ data: { online: true, count: 1, agentId: 'agent-1', lastSeenAt: null } })
  printAPI.jobs.mockResolvedValue({ data: { jobs: [
    { _id: 'j1', kind: 'kot', station: 'kitchen', orderId: 'ORD-1', status: 'done', printer: { name: 'Kitchen' }, createdAt: new Date().toISOString() },
  ] } })
  printAPI.test.mockResolvedValue({ data: { success: true, jobId: 'j2' } })
  printAPI.agentKey.mockResolvedValue({ data: { token: 'eyJhbGciOi.agent.token-value-1234567890', agentId: 'agent-2', apiUrl: 'http://localhost:5000' } })
  printAPI.revokeAgentKey.mockResolvedValue({ data: { success: true } })
})

function setup(initial = INITIAL, props = {}) {
  const user = userEvent.setup()
  const onSave = vi.fn()
  render(<PrinterSettings initial={initial} onSave={onSave} isSaving={false} {...props} />)
  return { user, onSave }
}

describe('PrinterSettings — rendering', () => {
  test('shows the saved printers, agent status and recent jobs', async () => {
    setup()
    expect(screen.getByDisplayValue('Kitchen')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Counter')).toBeInTheDocument()
    expect(screen.getByDisplayValue('192.168.1.50')).toBeInTheDocument()
    expect(screen.getByDisplayValue('\\\\localhost\\BILL')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Enable printing' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Bill when paid' })).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('Agent online'))
    expect(await screen.findByText(/ORD-1/)).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Generate new key/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Revoke key/ })).toBeInTheDocument()
  })

  test('empty state explains the fake printer and the save button stays disabled until something changes', async () => {
    setup({})
    expect(screen.getByText(/No printers yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save Printers/ })).toBeDisabled()
    await waitFor(() => expect(printAPI.agentStatus).toHaveBeenCalled())
  })
})

describe('PrinterSettings — editing and saving', () => {
  test('adds a LAN printer and saves a normalised payload without the agent block', async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole('button', { name: /Add printer/ }))
    const row = screen.getByTestId('printer-row-2')
    await user.type(within(row).getByLabelText('Name'), 'Bar')
    await user.selectOptions(within(row).getByLabelText('Station'), 'bar')
    await user.type(within(row).getByLabelText('IP address / host'), ' 10.0.0.7 ')
    await user.selectOptions(within(row).getByLabelText('Paper'), '58')
    await user.click(screen.getByRole('switch', { name: 'Bill when paid' }))

    const save = screen.getByRole('button', { name: /Save Printers/ })
    expect(save).toBeEnabled()
    await user.click(save)

    expect(onSave).toHaveBeenCalledTimes(1)
    const payload = onSave.mock.calls[0][0]
    expect(payload.agent).toBeUndefined()
    expect(payload.enabled).toBe(true)
    expect(payload.autoPrint).toEqual({ kotOnCreate: true, kotOnAppend: true, billOnPaid: true })
    expect(payload.list).toHaveLength(3)
    expect(payload.list[0]).toMatchObject({ id: 'p-kitchen', name: 'Kitchen', station: 'kitchen', interface: 'lan', host: '192.168.1.50', port: 9100 })
    expect(payload.list[1]).toMatchObject({ id: 'p-counter', interface: 'usb', devicePath: '\\\\localhost\\BILL', host: '', paperWidth: '58', copies: 2 })
    expect(payload.list[2]).toMatchObject({ name: 'Bar', station: 'bar', interface: 'lan', host: '10.0.0.7', port: 9100, paperWidth: '58', copies: 1, enabled: true })
    expect(payload.list[2].id).toBeUndefined()
  })

  test('refuses to save a LAN printer without a host or a printer without a name', async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole('button', { name: /Add printer/ }))
    await user.click(screen.getByRole('button', { name: /Save Printers/ }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Printer 3: name is required')

    await user.type(within(screen.getByTestId('printer-row-2')).getByLabelText('Name'), 'Bar')
    await user.click(screen.getByRole('button', { name: /Save Printers/ }))
    expect(onSave).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenLastCalledWith('Printer 3: LAN printers need an IP address or hostname')
  })

  test('removing a printer enables save and drops it from the payload', async () => {
    const { user, onSave } = setup()
    await user.click(screen.getByRole('button', { name: 'Remove Counter' }))
    await user.click(screen.getByRole('button', { name: /Save Printers/ }))
    expect(onSave.mock.calls[0][0].list.map((p) => p.name)).toEqual(['Kitchen'])
  })
})

describe('PrinterSettings — test print and agent key', () => {
  test('Test print posts the saved printer id; unsaved rows cannot be tested', async () => {
    const { user } = setup()
    const buttons = screen.getAllByRole('button', { name: /Test print/ })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[0])
    await waitFor(() => expect(printAPI.test).toHaveBeenCalledWith('p-kitchen'))
    expect(toast.success).toHaveBeenCalledWith('Test page sent to Kitchen')

    await user.click(screen.getByRole('button', { name: /Add printer/ }))
    expect(screen.getAllByRole('button', { name: /Test print/ })[2]).toBeDisabled()
  })

  test('an offline agent turns the test-print failure into a clear message', async () => {
    printAPI.test.mockRejectedValueOnce({ response: { status: 409, data: { code: 'AGENT_OFFLINE' } } })
    const { user } = setup()
    await user.click(screen.getAllByRole('button', { name: /Test print/ })[0])
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The print agent is not connected. Start it on the counter PC first.'))
  })

  test('Generate agent key shows the token once with the config snippet and copies it', async () => {
    // Not paired yet: status reports no agent, so the button reads "Generate agent key" (no confirm).
    printAPI.agentStatus.mockResolvedValue({ data: { online: false, count: 0, agentId: '', lastSeenAt: null } })
    const { user } = setup({ ...INITIAL, agent: { agentId: '', keyVersion: 0 } })
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('Agent offline'))
    const writeText = vi.fn().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    await user.click(screen.getByRole('button', { name: /Generate agent key/ }))
    await waitFor(() => expect(printAPI.agentKey).toHaveBeenCalledTimes(1))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/shown only once/)).toBeInTheDocument()
    expect(within(dialog).getByText(/"agentToken": "eyJhbGciOi.agent.token-value-1234567890"/)).toBeInTheDocument()
    expect(within(dialog).getByText(/"apiUrl": "http:\/\/localhost:5000"/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /Copy token/ }))
    expect(writeText).toHaveBeenCalledWith('eyJhbGciOi.agent.token-value-1234567890')
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Revoke key asks for confirmation and calls the API', async () => {
    const { user } = setup()
    // The Revoke button appears once /print/agent-status reports a paired agent.
    const revoke = await screen.findByRole('button', { name: /Revoke key/ })
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await user.click(revoke)
    expect(printAPI.revokeAgentKey).not.toHaveBeenCalled()

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    await user.click(revoke)
    await waitFor(() => expect(printAPI.revokeAgentKey).toHaveBeenCalledTimes(1))
    expect(toast.success).toHaveBeenCalledWith('Agent key revoked')
  })
})

describe('PrinterSettings — desktop app shell (window.bestodine)', () => {
  const DESKTOP_STATUS = {
    state: 'connected',
    printers: [{ name: 'Kitchen', ok: true }, { name: 'Counter', ok: false }],
    lastJobAt: '2026-10-09T10:30:00.000Z',
    error: null,
  }

  function installBridge(overrides = {}) {
    const listeners = new Set()
    const unsubscribe = vi.fn()
    const bridge = {
      isDesktop: true,
      version: '1.0.0',
      deviceRole: 'counter',
      serverUrl: 'https://bestodine.com',
      printAgent: {
        getStatus: vi.fn().mockResolvedValue(DESKTOP_STATUS),
        onStatus: vi.fn((cb) => { listeners.add(cb); return unsubscribe }),
      },
      openSettings: vi.fn(),
      openExternal: vi.fn(),
      ...overrides,
    }
    Object.defineProperty(window, 'bestodine', { value: bridge, configurable: true, writable: true })
    return { bridge, emit: (s) => listeners.forEach((cb) => cb(s)), unsubscribe }
  }

  afterEach(() => { delete window.bestodine })

  test('in a browser: no desktop card, a one-line hint about the desktop app under the agent section', async () => {
    setup()
    expect(screen.queryByTestId('desktop-agent-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('desktop-hint')).toHaveTextContent(
      'Running the counter PC app? The BestoDine desktop app includes this print agent — see INSTALLABLE_APPS_GUIDE.md',
    )
    // The existing server-side agent card is untouched.
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('Agent online'))
    expect(screen.getByRole('button', { name: /Generate new key/ })).toBeInTheDocument()
  })

  test('inside the shell: shows the card with state badge, printers, last job and the settings button; hint hidden', async () => {
    const { bridge } = installBridge()
    const { user } = setup()
    const card = screen.getByTestId('desktop-agent-card')
    expect(screen.queryByTestId('desktop-hint')).not.toBeInTheDocument()
    expect(within(card).getByText('Desktop app print agent')).toBeInTheDocument()

    await waitFor(() => expect(within(card).getByTestId('desktop-agent-state')).toHaveTextContent('Connected'))
    const printers = within(card).getByTestId('desktop-agent-printers')
    const rows = within(printers).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Kitchen')
    expect(within(rows[0]).getByText('ok')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('Counter')
    expect(within(rows[1]).getByText('not ok')).toBeInTheDocument()
    expect(within(card).getByText(/Last job:/)).not.toHaveTextContent('—')
    expect(within(card).queryByTestId('desktop-agent-error')).not.toBeInTheDocument()

    await user.click(within(card).getByRole('button', { name: /Open desktop settings/ }))
    expect(bridge.openSettings).toHaveBeenCalledTimes(1)

    // The regular (server-side) agent card and key buttons are still there.
    await waitFor(() => expect(screen.getByTestId('agent-status')).toHaveTextContent('Agent online'))
    expect(screen.getByRole('button', { name: /Generate new key/ })).toBeInTheDocument()
  })

  test('live onStatus pushes update the badge and show the error text; unsubscribes on unmount', async () => {
    const { emit, unsubscribe } = installBridge()
    const { unmount } = render(<PrinterSettings initial={INITIAL} onSave={vi.fn()} />)
    const card = screen.getByTestId('desktop-agent-card')
    await waitFor(() => expect(within(card).getByTestId('desktop-agent-state')).toHaveTextContent('Connected'))

    act(() => emit({ state: 'error', printers: [{ name: 'Kitchen', ok: false }], lastJobAt: null, error: 'connect ECONNREFUSED 192.168.1.50:9100' }))
    expect(within(card).getByTestId('desktop-agent-state')).toHaveTextContent('Error')
    expect(within(card).getByTestId('desktop-agent-error')).toHaveTextContent('ECONNREFUSED')
    expect(within(card).getByText(/Last job:/)).toHaveTextContent('—')

    act(() => emit({ state: 'revoked', printers: [], lastJobAt: null, error: 'Agent key was revoked. Generate a new key.' }))
    expect(within(card).getByTestId('desktop-agent-state')).toHaveTextContent('Revoked')
    expect(within(card).getByText(/No printers reported/)).toBeInTheDocument()

    act(() => emit({ state: 'connecting', printers: [], lastJobAt: null, error: null }))
    expect(within(card).getByTestId('desktop-agent-state')).toHaveTextContent('Connecting')
    act(() => emit({ state: 'disabled', printers: [], lastJobAt: null, error: null }))
    expect(within(card).getByTestId('desktop-agent-state')).toHaveTextContent('Disabled')

    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  test('an older shell without printAgent still shows the card with "Checking…" and the settings button', () => {
    const { bridge } = installBridge({ printAgent: undefined })
    setup()
    const card = screen.getByTestId('desktop-agent-card')
    expect(within(card).getByTestId('desktop-agent-state')).toHaveTextContent('Checking…')
    expect(within(card).getByRole('button', { name: /Open desktop settings/ })).toBeInTheDocument()
    expect(bridge.openSettings).not.toHaveBeenCalled()
  })
})

describe('helpers', () => {
  test('normalizeInitial fills defaults and toPayload coerces numbers / strips per-interface fields', () => {
    const form = normalizeInitial({ list: [{ name: 'X', station: 'bar', interface: 'lan', host: 'h', port: '9101', copies: '7' }] })
    expect(form.enabled).toBe(false)
    expect(form.autoPrint).toEqual({ kotOnCreate: true, kotOnAppend: true, billOnPaid: false })
    const payload = toPayload(form)
    expect(payload.list[0]).toMatchObject({ name: 'X', station: 'bar', host: 'h', port: 9101, copies: 3, devicePath: '', paperWidth: '80', enabled: true })
  })
})
