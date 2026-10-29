import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { developerAPI } from '../../../utils/api'
import DeveloperSecretReveal from './DeveloperSecretReveal'
import { EVENT_LABELS, apiError, isLocked } from '../../../utils/developer'

const DELIVERY_STYLE = {
    success: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-red-700',
}

const fmt = (d) => (d ? new Date(d).toLocaleString() : '-')

function DeliveryLog({ endpoint }) {
    const qc = useQueryClient()
    const { data: deliveries = [], isLoading } = useQuery({
        queryKey: ['admin', 'developer', 'deliveries', endpoint.id],
        queryFn: async () => (await developerAPI.listDeliveries(endpoint.id, { limit: 25 })).data?.deliveries || [],
        retry: false,
    })

    const redeliver = async (d) => {
        try {
            const res = await developerAPI.redeliver(d.id)
            if (res.data?.result?.ok) toast.success('Delivered')
            else toast.error(res.data?.result?.error || 'Delivery failed again')
        } catch (err) {
            toast.error(apiError(err, 'Could not redeliver'))
        }
        qc.invalidateQueries({ queryKey: ['admin', 'developer', 'deliveries', endpoint.id] })
    }

    if (isLoading) return <div className="p-3 text-[13px] text-gray-500">Loading deliveries...</div>
    if (!deliveries.length) return <div className="p-3 text-[13px] text-gray-500" data-testid={`dev-deliveries-empty-${endpoint.id}`}>No deliveries yet.</div>
    return (
        <table className="w-full text-left text-[12px]" data-testid={`dev-deliveries-${endpoint.id}`}>
            <thead className="text-gray-500"><tr><th className="p-2">Event</th><th className="p-2">Status</th><th className="p-2">Attempts</th><th className="p-2">Response</th><th className="p-2">When</th><th className="p-2" /></tr></thead>
            <tbody>
                {deliveries.map((d) => (
                    <tr key={d.id} className="border-t border-gray-100" data-testid={`dev-delivery-${d.id}`}>
                        <td className="p-2">{d.type}</td>
                        <td className="p-2"><span className={`rounded-full px-2 py-0.5 font-semibold ${DELIVERY_STYLE[d.status] || ''}`}>{d.status}</span></td>
                        <td className="p-2">{d.attempts}</td>
                        <td className="p-2">{d.responseCode || '-'}{d.lastError ? ` (${d.lastError})` : ''}</td>
                        <td className="p-2">{fmt(d.createdAt)}</td>
                        <td className="p-2 text-right">
                            {d.type !== 'webhook.test' && (
                                <button type="button" onClick={() => redeliver(d)} className="text-[#FE8301] font-semibold" data-testid={`dev-redeliver-${d.id}`}>Redeliver</button>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

export default function DeveloperWebhooks({ onLocked }) {
    const qc = useQueryClient()
    const [url, setUrl] = useState('')
    const [description, setDescription] = useState('')
    const [events, setEvents] = useState(['order.paid'])
    const [busy, setBusy] = useState(false)
    const [reveal, setReveal] = useState(null)
    const [openLog, setOpenLog] = useState(null)
    const [testResult, setTestResult] = useState({}) // endpointId -> { ok, text }

    const { data: endpoints = [], isLoading, error } = useQuery({
        queryKey: ['admin', 'developer', 'webhooks'],
        queryFn: async () => {
            try {
                return (await developerAPI.listWebhooks()).data?.endpoints || []
            } catch (err) {
                if (isLocked(err)) onLocked?.()
                throw err
            }
        },
        retry: false,
    })

    const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'developer', 'webhooks'] })
    const toggleEvent = (ev) => setEvents((cur) => (cur.includes(ev) ? cur.filter((x) => x !== ev) : [...cur, ev]))

    const create = async (e) => {
        e.preventDefault()
        if (!/^https:\/\//i.test(url.trim())) return toast.error('The URL must start with https://')
        if (!events.length) return toast.error('Pick at least one event')
        setBusy(true)
        try {
            const res = await developerAPI.createWebhook({ url: url.trim(), events, description: description.trim() })
            setReveal({ title: 'Webhook created. Signing secret:', secret: res.data.secret })
            setUrl(''); setDescription('')
            refresh()
        } catch (err) {
            toast.error(apiError(err, 'Could not create the webhook'))
        } finally {
            setBusy(false)
        }
    }

    const test = async (ep) => {
        try {
            const res = await developerAPI.testWebhook(ep.id)
            const r = res.data?.result || {}
            setTestResult((cur) => ({ ...cur, [ep.id]: { ok: !!r.ok, text: r.ok ? `Delivered (HTTP ${r.status})` : `Failed: ${r.error || 'unknown error'}` } }))
            qc.invalidateQueries({ queryKey: ['admin', 'developer', 'deliveries', ep.id] })
        } catch (err) {
            toast.error(apiError(err, 'Could not send the test event'))
        }
    }

    const setActive = async (ep, active) => {
        try {
            await developerAPI.updateWebhook(ep.id, { active })
            toast.success(active ? 'Webhook enabled' : 'Webhook paused')
            refresh()
        } catch (err) {
            toast.error(apiError(err, 'Could not update the webhook'))
        }
    }

    const remove = async (ep) => {
        if (window.confirm && !window.confirm(`Delete the webhook for ${ep.url}?`)) return
        try {
            await developerAPI.deleteWebhook(ep.id)
            toast.success('Webhook deleted')
            refresh()
        } catch (err) {
            toast.error(apiError(err, 'Could not delete the webhook'))
        }
    }

    const rotateSecret = async (ep) => {
        if (window.confirm && !window.confirm('Rotate the signing secret? Your receiver must be updated with the new one.')) return
        try {
            const res = await developerAPI.rotateWebhookSecret(ep.id)
            setReveal({ title: 'New signing secret:', secret: res.data.secret })
        } catch (err) {
            toast.error(apiError(err, 'Could not rotate the secret'))
        }
    }

    return (
        <div data-testid="dev-webhooks">
            {reveal && <DeveloperSecretReveal title={reveal.title} secret={reveal.secret} hint="Use it to verify the X-BestoDine-Signature header. It is shown only once." onClose={() => setReveal(null)} testId="dev-webhook-secret" />}

            <form onSubmit={create} className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-[15px] font-bold text-[#1A181B] mb-3">Add a webhook endpoint</div>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-[13px] font-semibold text-gray-700">
                        Endpoint URL (https only)
                        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/bestodine-hook"
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px] font-normal" data-testid="dev-wh-url" />
                    </label>
                    <label className="text-[13px] font-semibold text-gray-700">
                        Description (optional)
                        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px] font-normal" data-testid="dev-wh-desc" />
                    </label>
                </div>
                <fieldset className="mt-3">
                    <legend className="text-[13px] font-semibold text-gray-700 mb-1">Events</legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                        {Object.entries(EVENT_LABELS).map(([ev, label]) => (
                            <label key={ev} className="inline-flex items-center gap-2 text-[13px] text-gray-700">
                                <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} data-testid={`dev-event-${ev}`} />
                                {label}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <button type="submit" disabled={busy} className="mt-4 rounded-lg bg-[#FE8301] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60" data-testid="dev-wh-create">
                    {busy ? 'Adding...' : 'Add endpoint'}
                </button>
            </form>

            {isLoading && <div className="text-gray-500 text-[14px]">Loading webhooks...</div>}
            {error && !isLocked(error) && <div className="text-red-600 text-[14px]">{apiError(error, 'Could not load webhooks')}</div>}
            {!isLoading && !error && endpoints.length === 0 && <div className="text-gray-500 text-[14px]" data-testid="dev-wh-empty">No webhook endpoints yet.</div>}

            <div className="space-y-3">
                {endpoints.map((ep) => (
                    <div key={ep.id} className="rounded-xl border border-gray-200 bg-white" data-testid={`dev-wh-row-${ep.id}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                            <div className="min-w-0">
                                <div className="break-all text-[14px] font-semibold">{ep.url}</div>
                                {ep.description && <div className="text-[12px] text-gray-500">{ep.description}</div>}
                                <div className="mt-1 text-[12px] text-gray-600">{(ep.events || []).map((e) => EVENT_LABELS[e] || e).join(', ')}</div>
                                {!ep.active && ep.disabledAt && (
                                    <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[12px] text-red-700" data-testid={`dev-wh-disabled-${ep.id}`}>
                                        Disabled {fmt(ep.disabledAt)}. {ep.disabledReason}
                                    </div>
                                )}
                                {testResult[ep.id] && (
                                    <div className={`mt-2 text-[12px] ${testResult[ep.id].ok ? 'text-green-700' : 'text-red-700'}`} data-testid={`dev-wh-test-${ep.id}`}>{testResult[ep.id].text}</div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[13px] font-semibold">
                                <span className={`rounded-full px-2 py-0.5 text-[12px] ${ep.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>{ep.active ? 'Active' : 'Paused'}</span>
                                <button type="button" onClick={() => test(ep)} className="text-[#FE8301]" data-testid={`dev-wh-send-test-${ep.id}`}>Send test</button>
                                <button type="button" onClick={() => setOpenLog(openLog === ep.id ? null : ep.id)} className="text-[#FE8301]" data-testid={`dev-wh-log-${ep.id}`}>Deliveries</button>
                                <button type="button" onClick={() => setActive(ep, !ep.active)} className="text-gray-700" data-testid={`dev-wh-toggle-${ep.id}`}>{ep.active ? 'Pause' : 'Enable'}</button>
                                <button type="button" onClick={() => rotateSecret(ep)} className="text-gray-700">Rotate secret</button>
                                <button type="button" onClick={() => remove(ep)} className="text-red-600" data-testid={`dev-wh-delete-${ep.id}`}>Delete</button>
                            </div>
                        </div>
                        {openLog === ep.id && <div className="border-t border-gray-100 overflow-x-auto"><DeliveryLog endpoint={ep} /></div>}
                    </div>
                ))}
            </div>
        </div>
    )
}
