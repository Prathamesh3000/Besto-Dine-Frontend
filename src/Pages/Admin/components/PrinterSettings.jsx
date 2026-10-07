import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Save, Plus, Trash2, Printer, KeyRound, Copy, Check, RefreshCw, Loader2, X, WifiOff, Wifi } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { printAPI } from '../../../utils/api'
import useSocketEvent from '../../../hooks/useSocketEvent'
import ToggleSwitch from '../../../Components/Common/ToggleSwitch'
import { STATIONS, MAX_PRINTERS, newPrinter, normalizeInitial, toPayload, validatePrinters as validate } from '../utils/printerSettings'

/**
 * Admin → Settings → "Printers": thermal printers for THIS branch plus
 * the print agent that drives them (print-agent/ on the counter PC).
 *
 * Printer rows + auto-print switches are saved through the parent's
 * onSave → PATCH /settings/printers. Agent pairing, test pages and the
 * job log talk to /print/* directly (utils/api.js printAPI).
 */

const inputCls = 'w-full px-3 py-2 bg-white border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:border-[#FE8301] shadow-sm disabled:bg-gray-50 disabled:text-gray-400'
const cardCls = 'bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]'
const STATUS_STYLE = {
    done: 'bg-green-50 text-green-700', failed: 'bg-red-50 text-red-700',
    sent: 'bg-blue-50 text-blue-700', queued: 'bg-amber-50 text-amber-700',
}

const PrinterSettings = ({ initial, onSave, isSaving = false }) => {
    const [form, setForm] = useState(() => normalizeInitial(initial))
    useEffect(() => { setForm(normalizeInitial(initial)) }, [initial])

    const [agent, setAgent] = useState({ online: false, count: 0, agentId: '', lastSeenAt: null, loaded: false })
    const [jobs, setJobs] = useState([])
    const [keyModal, setKeyModal] = useState(null)   // { token, apiUrl } shown once
    const [busy, setBusy] = useState('')              // 'key' | 'revoke' | 'test:<id>'
    const [copied, setCopied] = useState(false)

    const loadStatus = useCallback(async () => {
        try {
            const res = await printAPI.agentStatus()
            setAgent({ online: !!res.data?.online, count: res.data?.count || 0, agentId: res.data?.agentId || '', lastSeenAt: res.data?.lastSeenAt || null, loaded: true })
        } catch { setAgent((prev) => ({ ...prev, loaded: true })) }
    }, [])
    const loadJobs = useCallback(async () => {
        try {
            const res = await printAPI.jobs(15)
            setJobs(Array.isArray(res.data?.jobs) ? res.data.jobs : [])
        } catch { /* list is informational */ }
    }, [])

    useEffect(() => {
        loadStatus(); loadJobs()
        const t = setInterval(loadStatus, 15000)
        return () => clearInterval(t)
    }, [loadStatus, loadJobs])
    useSocketEvent('print:agent-status', (p) => setAgent((prev) => ({ ...prev, online: !!p?.online, agentId: p?.agentId ?? prev.agentId, loaded: true })))
    useSocketEvent('print:job-updated', () => loadJobs())

    const set = (patch) => setForm((prev) => ({ ...prev, ...patch }))
    const setAuto = (key, value) => setForm((prev) => ({ ...prev, autoPrint: { ...prev.autoPrint, [key]: value } }))
    const setPrinter = (idx, patch) => setForm((prev) => ({ ...prev, list: prev.list.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }))
    const removePrinter = (idx) => setForm((prev) => ({ ...prev, list: prev.list.filter((_, i) => i !== idx) }))
    const addPrinter = () => setForm((prev) => (prev.list.length >= MAX_PRINTERS ? prev : { ...prev, list: [...prev.list, newPrinter()] }))

    const savedIds = useMemo(() => new Set((initial?.list || []).map((p) => p.id).filter(Boolean)), [initial])
    const dirty = useMemo(() => JSON.stringify(toPayload(form)) !== JSON.stringify(toPayload(normalizeInitial(initial))), [form, initial])

    const handleSave = () => {
        const err = validate(form)
        if (err) { toast.error(err); return }
        onSave(toPayload(form))
    }

    const handleTest = async (printer) => {
        if (!printer.id || busy) return
        setBusy(`test:${printer.id}`)
        try {
            await printAPI.test(printer.id)
            toast.success(`Test page sent to ${printer.name || 'the printer'}`)
            loadJobs()
        } catch (err) {
            const code = err.response?.data?.code
            toast.error(code === 'AGENT_OFFLINE'
                ? 'The print agent is not connected. Start it on the counter PC first.'
                : (err.response?.data?.message || 'Could not send the test page'))
        } finally { setBusy('') }
    }

    const handleGenerateKey = async () => {
        if (busy) return
        if (agent.agentId && !window.confirm('Generating a new key disconnects the current print agent. Continue?')) return
        setBusy('key')
        try {
            const res = await printAPI.agentKey()
            setKeyModal({ token: res.data?.token || '', apiUrl: res.data?.apiUrl || window.location.origin })
            setCopied(false)
            loadStatus()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not generate an agent key')
        } finally { setBusy('') }
    }

    const handleRevoke = async () => {
        if (busy) return
        if (!window.confirm('Revoke the agent key? The print agent will stop until you pair it with a new key.')) return
        setBusy('revoke')
        try {
            await printAPI.revokeAgentKey()
            toast.success('Agent key revoked')
            loadStatus()
        } catch (err) {
            toast.error(err.response?.data?.message || 'Could not revoke the agent key')
        } finally { setBusy('') }
    }

    const copyToken = async () => {
        try {
            await navigator.clipboard.writeText(keyModal.token)
            setCopied(true)
            toast.success('Copied')
        } catch { toast.error('Copy failed — select the text and copy it manually') }
    }

    return (
        <div className="space-y-6 pb-10">
            {/* ── Header / save ─────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-[16px] font-[600] text-[#1A181B]">Thermal printers</h2>
                    <p className="text-[13px] text-[#645E66]">KOT tickets print in the kitchen the moment an order lands; bills print at the counter in one click. Printers belong to this branch.</p>
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || !dirty}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} strokeWidth={2.5} />
                    {isSaving ? 'Saving...' : 'Save Printers'}
                </button>
            </div>

            {/* ── Switches ──────────────────────────────────────────── */}
            <div className={cardCls}>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-[15px] font-[600] text-[#1A181B]">Printing</p>
                        <p className="text-[12px] text-[#9CA3AF]">Master switch for this branch. Off = nothing is ever sent to a printer.</p>
                    </div>
                    <ToggleSwitch checked={form.enabled} ariaLabel="Enable printing" onChange={(e) => set({ enabled: e.target.checked })} />
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        ['kotOnCreate', 'KOT on new order', 'Kitchen / bar ticket when a customer, waiter or kiosk order is created'],
                        ['kotOnAppend', 'KOT on added items', 'A ticket with only the newly added items'],
                        ['billOnPaid', 'Bill when paid', 'Counter bill prints automatically on settlement (else only on "Print bill")'],
                    ].map(([key, label, hint]) => (
                        <div key={key} className="flex items-start justify-between gap-3 rounded-[10px] border border-gray-100 p-3">
                            <div>
                                <p className="text-[13px] font-[600] text-[#1A181B]">{label}</p>
                                <p className="text-[11px] text-[#9CA3AF]">{hint}</p>
                            </div>
                            <ToggleSwitch size="sm" checked={form.autoPrint[key]} ariaLabel={label} disabled={!form.enabled} onChange={(e) => setAuto(key, e.target.checked)} />
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Printers ──────────────────────────────────────────── */}
            <div className={cardCls}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-[15px] font-[600] text-[#1A181B]">Printers</p>
                        <p className="text-[12px] text-[#9CA3AF]">One printer per station. LAN printers listen on port 9100; USB printers on Windows are addressed by their share name (e.g. <code>\\localhost\KOT</code>).</p>
                    </div>
                    {form.list.length < MAX_PRINTERS && (
                        <button type="button" onClick={addPrinter} className="inline-flex items-center gap-1.5 text-[13px] font-[600] text-[#FE8301] hover:underline">
                            <Plus size={15} /> Add printer
                        </button>
                    )}
                </div>

                {form.list.length === 0 && (
                    <div className="rounded-[10px] border border-dashed border-gray-200 p-6 text-center text-[13px] text-[#9CA3AF]">
                        <Printer size={22} className="mx-auto mb-2 text-gray-300" />
                        No printers yet. Add a <b>Kitchen</b> printer for KOTs and a <b>Counter</b> printer for bills.
                        <br />No hardware yet? Run <code>node print-agent/fake-printer.js</code> and use host <code>127.0.0.1</code>.
                    </div>
                )}

                <div className="space-y-3">
                    {form.list.map((p, idx) => (
                        <div key={p.id || `new-${idx}`} data-testid={`printer-row-${idx}`} className="rounded-[10px] border border-gray-100 p-3 md:p-4">
                            <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_0.9fr] gap-3">
                                <div>
                                    <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-name-${idx}`}>Name</label>
                                    <input id={`pr-name-${idx}`} className={inputCls} value={p.name} maxLength={40} placeholder="e.g. Kitchen" onChange={(e) => setPrinter(idx, { name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-station-${idx}`}>Station</label>
                                    <select id={`pr-station-${idx}`} className={`${inputCls} cursor-pointer`} value={p.station} onChange={(e) => setPrinter(idx, { station: e.target.value })}>
                                        {STATIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-iface-${idx}`}>Connection</label>
                                    <select id={`pr-iface-${idx}`} className={`${inputCls} cursor-pointer`} value={p.interface} onChange={(e) => setPrinter(idx, { interface: e.target.value })}>
                                        <option value="lan">LAN / Wi-Fi (IP)</option>
                                        <option value="usb">USB (shared printer)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-[1.4fr_0.6fr_0.8fr_0.6fr_auto_auto] gap-3 mt-3 items-end">
                                {p.interface === 'lan' ? (
                                    <>
                                        <div>
                                            <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-host-${idx}`}>IP address / host</label>
                                            <input id={`pr-host-${idx}`} className={inputCls} value={p.host} placeholder="192.168.1.50" onChange={(e) => setPrinter(idx, { host: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-port-${idx}`}>Port</label>
                                            <input id={`pr-port-${idx}`} type="number" min="1" max="65535" className={inputCls} value={p.port} onChange={(e) => setPrinter(idx, { port: e.target.value })} />
                                        </div>
                                    </>
                                ) : (
                                    <div className="col-span-2">
                                        <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-dev-${idx}`}>Device path</label>
                                        <input id={`pr-dev-${idx}`} className={inputCls} value={p.devicePath} placeholder="\\localhost\KOT  or  /dev/usb/lp0" onChange={(e) => setPrinter(idx, { devicePath: e.target.value })} />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-paper-${idx}`}>Paper</label>
                                    <select id={`pr-paper-${idx}`} className={`${inputCls} cursor-pointer`} value={p.paperWidth} onChange={(e) => setPrinter(idx, { paperWidth: e.target.value })}>
                                        <option value="80">80 mm</option>
                                        <option value="58">58 mm</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[12px] font-[500] text-[#6B7280] mb-1" htmlFor={`pr-copies-${idx}`}>Copies</label>
                                    <select id={`pr-copies-${idx}`} className={`${inputCls} cursor-pointer`} value={p.copies} onChange={(e) => setPrinter(idx, { copies: Number(e.target.value) })}>
                                        {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pb-2">
                                    <ToggleSwitch size="sm" checked={p.enabled !== false} ariaLabel={`Enable ${p.name || 'printer'}`} onChange={(e) => setPrinter(idx, { enabled: e.target.checked })} />
                                    <span className="text-[12px] text-[#6B7280]">On</span>
                                </div>
                                <div className="flex items-center gap-1 pb-1">
                                    <button
                                        type="button"
                                        onClick={() => handleTest(p)}
                                        disabled={!p.id || !savedIds.has(p.id) || !!busy}
                                        title={p.id && savedIds.has(p.id) ? 'Print a test page on this printer' : 'Save first, then test'}
                                        className="px-3 py-2 border border-[#FE8301] text-[#FE8301] rounded-[10px] text-[12px] font-[600] hover:bg-[#FFF3E6] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
                                    >
                                        {busy === `test:${p.id}` ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                        Test print
                                    </button>
                                    <button type="button" onClick={() => removePrinter(idx)} aria-label={`Remove ${p.name || 'printer'}`} className="p-2 text-[#9CA3AF] hover:text-red-500">
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                            {p.id && <p className="text-[10px] text-[#C4C4C4] mt-2">id {p.id}</p>}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Agent ─────────────────────────────────────────────── */}
            <div className={cardCls}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <p className="text-[15px] font-[600] text-[#1A181B] flex items-center gap-2">
                            Print agent
                            <span data-testid="agent-status" className={`inline-flex items-center gap-1 text-[11px] font-[600] px-2 py-0.5 rounded-full ${agent.online ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {agent.online ? <Wifi size={12} /> : <WifiOff size={12} />}
                                {agent.loaded ? (agent.online ? 'Agent online' : 'Agent offline') : 'Checking…'}
                            </span>
                        </p>
                        <p className="text-[12px] text-[#9CA3AF]">
                            The small program on the counter PC that talks to the printers. Pair it once with a key; it reconnects by itself.
                            {agent.lastSeenAt && !agent.online && <> Last seen {new Date(agent.lastSeenAt).toLocaleString('en-IN')}.</>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={loadStatus} aria-label="Refresh agent status" className="p-2 text-[#9CA3AF] hover:text-[#1A181B]"><RefreshCw size={16} /></button>
                        {agent.agentId && (
                            <button type="button" onClick={handleRevoke} disabled={!!busy} className="px-3 py-2 border border-gray-200 text-[#6B7280] rounded-[10px] text-[13px] font-[600] hover:bg-gray-50 disabled:opacity-50">
                                {busy === 'revoke' ? 'Revoking…' : 'Revoke key'}
                            </button>
                        )}
                        <button type="button" onClick={handleGenerateKey} disabled={!!busy} className="px-4 py-2 bg-[#702083] text-white rounded-[10px] text-[13px] font-[600] hover:bg-[#5a1a6a] disabled:opacity-50 inline-flex items-center gap-1.5">
                            {busy === 'key' ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                            {agent.agentId ? 'Generate new key' : 'Generate agent key'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Recent jobs ───────────────────────────────────────── */}
            <div className={cardCls}>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[15px] font-[600] text-[#1A181B]">Recent print jobs</p>
                    <button type="button" onClick={loadJobs} aria-label="Refresh print jobs" className="p-2 text-[#9CA3AF] hover:text-[#1A181B]"><RefreshCw size={16} /></button>
                </div>
                {jobs.length === 0 ? (
                    <p className="text-[13px] text-[#9CA3AF]">Nothing printed yet.</p>
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {jobs.map((j) => (
                            <li key={j._id} className="py-2 flex items-center justify-between gap-3 text-[13px]">
                                <div className="min-w-0">
                                    <span className="font-[600] text-[#1A181B] uppercase">{j.kind}</span>
                                    <span className="text-[#6B7280]"> · {j.station}{j.orderId ? ` · ${j.orderId}` : ''} · {j.printer?.name}</span>
                                    {j.error && <span className="block text-[12px] text-red-600 truncate">{j.error}</span>}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[11px] text-[#9CA3AF]">{new Date(j.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                    <span className={`text-[11px] font-[600] px-2 py-0.5 rounded-full ${STATUS_STYLE[j.status] || 'bg-gray-100 text-gray-600'}`}>{j.status}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* ── Key modal (token shown once) ───────────────────────── */}
            {keyModal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="agent-key-title">
                    <div className="bg-white rounded-xl w-full max-w-lg p-5 md:p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <h3 id="agent-key-title" className="text-[16px] font-[600] text-[#1A181B]">Agent key for this branch</h3>
                            <button type="button" onClick={() => setKeyModal(null)} aria-label="Close" className="p-1 text-[#9CA3AF] hover:text-[#1A181B]"><X size={18} /></button>
                        </div>
                        <p className="text-[13px] text-[#645E66] mb-3">Copy it now — it is shown only once. Paste it into <code>print-agent/config.json</code> on the counter PC:</p>
                        <pre className="text-[12px] bg-gray-50 border border-gray-200 rounded-[10px] p-3 overflow-x-auto whitespace-pre-wrap break-all">{`{
  "apiUrl": "${keyModal.apiUrl}",
  "agentToken": "${keyModal.token}"
}`}</pre>
                        <div className="flex items-center justify-between gap-3 mt-3">
                            <code data-testid="agent-token" className="text-[11px] text-[#6B7280] truncate">{keyModal.token.slice(0, 24)}…</code>
                            <button type="button" onClick={copyToken} className="px-3 py-2 bg-[#FE8301] text-white rounded-[10px] text-[13px] font-[600] inline-flex items-center gap-1.5">
                                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy token'}
                            </button>
                        </div>
                        <p className="text-[12px] text-[#9CA3AF] mt-3">Then run <code>node agent.js</code> in the <code>print-agent</code> folder. The badge above turns green when it connects.</p>
                    </div>
                </div>
            )}
        </div>
    )
}

export default PrinterSettings
