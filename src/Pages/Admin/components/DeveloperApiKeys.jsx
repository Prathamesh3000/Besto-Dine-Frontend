import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { developerAPI } from '../../../utils/api'
import DeveloperSecretReveal from './DeveloperSecretReveal'
import { SCOPE_LABELS, apiError, isLocked } from '../../../utils/developer'

const STATUS_STYLE = {
    active: 'bg-green-100 text-green-700',
    revoked: 'bg-gray-200 text-gray-600',
    expired: 'bg-red-100 text-red-700',
}

const fmt = (d) => (d ? new Date(d).toLocaleString() : 'Never')

export default function DeveloperApiKeys({ onLocked }) {
    const qc = useQueryClient()
    const [name, setName] = useState('')
    const [scopes, setScopes] = useState(['read:orders'])
    const [expiresInDays, setExpiresInDays] = useState('')
    const [busy, setBusy] = useState(false)
    const [reveal, setReveal] = useState(null) // { title, secret }

    const { data: keys = [], isLoading, error } = useQuery({
        queryKey: ['admin', 'developer', 'keys'],
        queryFn: async () => {
            try {
                const res = await developerAPI.listKeys()
                return res.data?.keys || []
            } catch (err) {
                if (isLocked(err)) onLocked?.()
                throw err
            }
        },
        retry: false,
    })

    const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'developer', 'keys'] })
    const toggleScope = (s) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

    const create = async (e) => {
        e.preventDefault()
        if (!name.trim()) return toast.error('Give the key a name')
        if (!scopes.length) return toast.error('Pick at least one scope')
        setBusy(true)
        try {
            const body = { name: name.trim(), scopes }
            if (expiresInDays) body.expiresInDays = Number(expiresInDays)
            const res = await developerAPI.createKey(body)
            setReveal({ title: `API key "${res.data.apiKey.name}" created`, secret: res.data.key })
            setName(''); setExpiresInDays('')
            refresh()
        } catch (err) {
            toast.error(apiError(err, 'Could not create the key'))
        } finally {
            setBusy(false)
        }
    }

    const revoke = async (k) => {
        if (window.confirm && !window.confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return
        try {
            await developerAPI.revokeKey(k.id)
            toast.success('Key revoked')
            refresh()
        } catch (err) {
            toast.error(apiError(err, 'Could not revoke the key'))
        }
    }

    const rotate = async (k) => {
        if (window.confirm && !window.confirm(`Rotate "${k.name}"? The current secret stops working immediately.`)) return
        try {
            const res = await developerAPI.rotateKey(k.id)
            setReveal({ title: `New secret for "${k.name}"`, secret: res.data.key })
            refresh()
        } catch (err) {
            toast.error(apiError(err, 'Could not rotate the key'))
        }
    }

    return (
        <div data-testid="dev-keys">
            {reveal && <DeveloperSecretReveal title={reveal.title} secret={reveal.secret} onClose={() => setReveal(null)} testId="dev-key-secret" />}

            <form onSubmit={create} className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-[15px] font-bold text-[#1A181B] mb-3">Create an API key</div>
                <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                    <label className="text-[13px] font-semibold text-gray-700">
                        Name
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Accounting sync"
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px] font-normal" data-testid="dev-key-name" />
                    </label>
                    <label className="text-[13px] font-semibold text-gray-700">
                        Expires in (days, optional)
                        <input type="number" min="1" max="3650" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px] font-normal" data-testid="dev-key-expiry" />
                    </label>
                </div>
                <fieldset className="mt-3">
                    <legend className="text-[13px] font-semibold text-gray-700 mb-1">Access (read-only)</legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-1">
                        {Object.entries(SCOPE_LABELS).map(([s, label]) => (
                            <label key={s} className="inline-flex items-center gap-2 text-[13px] text-gray-700">
                                <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} data-testid={`dev-scope-${s}`} />
                                {label}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <button type="submit" disabled={busy} className="mt-4 rounded-lg bg-[#FE8301] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60" data-testid="dev-key-create">
                    {busy ? 'Creating...' : 'Create key'}
                </button>
            </form>

            {isLoading && <div className="text-gray-500 text-[14px]" data-testid="dev-keys-loading">Loading keys...</div>}
            {error && !isLocked(error) && <div className="text-red-600 text-[14px]">{apiError(error, 'Could not load API keys')}</div>}
            {!isLoading && !error && keys.length === 0 && <div className="text-gray-500 text-[14px]" data-testid="dev-keys-empty">No API keys yet.</div>}

            {keys.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-left text-[13px]">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr><th className="p-3">Name</th><th className="p-3">Key</th><th className="p-3">Access</th><th className="p-3">Last used</th><th className="p-3">Status</th><th className="p-3" /></tr>
                        </thead>
                        <tbody>
                            {keys.map((k) => (
                                <tr key={k.id} className="border-t border-gray-100" data-testid={`dev-key-row-${k.id}`}>
                                    <td className="p-3 font-semibold">{k.name}</td>
                                    <td className="p-3"><code>{k.masked}</code></td>
                                    <td className="p-3">{(k.scopes || []).map((s) => SCOPE_LABELS[s] || s).join(', ')}</td>
                                    <td className="p-3">{fmt(k.lastUsedAt)}</td>
                                    <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${STATUS_STYLE[k.status] || ''}`}>{k.status}</span></td>
                                    <td className="p-3 whitespace-nowrap text-right">
                                        {k.status !== 'revoked' && (
                                            <>
                                                <button type="button" onClick={() => rotate(k)} className="mr-3 text-[#FE8301] font-semibold" data-testid={`dev-key-rotate-${k.id}`}>Rotate</button>
                                                <button type="button" onClick={() => revoke(k)} className="text-red-600 font-semibold" data-testid={`dev-key-revoke-${k.id}`}>Revoke</button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
